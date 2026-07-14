import type { ExchangeProvider } from './exchangeProvider.js';
import { detectProtectionViolations, TradeManagementTruthRow, upsertTradeTruthThroughCompatibility } from './tradeManagementCore.js';

export interface RecoveryClassification {
  type: 'provider_outage' | 'network_timeout' | 'missing_protection' | 'duplicate_trades' | 'orphan_orders' | 'partial_protection' | 'desynchronization' | 'retry_exhaustion' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  canRetry: boolean;
  reason: string;
}

export class RecoveryEngine {
  constructor(
    private readonly provider: ExchangeProvider,
    private readonly store: {
      upsertTradeTruth(row: TradeManagementTruthRow): Promise<void>;
      listOpenTradeTruth(providerId: string): Promise<TradeManagementTruthRow[]>;
    }
  ) {}

  classifyIncident(
    row: TradeManagementTruthRow,
    errorMsg: string,
    retryCount: number
  ): RecoveryClassification {
    const msg = errorMsg.toLowerCase();

    if (retryCount >= 5) {
      return {
        type: 'retry_exhaustion',
        severity: 'critical',
        canRetry: false,
        reason: 'Maximum repair/retry attempts exhausted.',
      };
    }

    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('network')) {
      return {
        type: 'network_timeout',
        severity: 'medium',
        canRetry: true,
        reason: 'Temporary network connection timeout.',
      };
    }

    if (msg.includes('auth') || msg.includes('apikey') || msg.includes('signature') || msg.includes('10002') || msg.includes('10004')) {
      return {
        type: 'provider_outage',
        severity: 'critical',
        canRetry: false,
        reason: 'Provider authentication failure or API mismatch.',
      };
    }

    if (msg.includes('duplicate') || msg.includes('active_duplicate_signal')) {
      return {
        type: 'duplicate_trades',
        severity: 'high',
        canRetry: false,
        reason: 'Duplicate trade or overlapping signal execution detected.',
      };
    }

    if (msg.includes('orphan') || msg.includes('orphan_position')) {
      return {
        type: 'orphan_orders',
        severity: 'high',
        canRetry: false,
        reason: 'Position found on exchange with no coordinating database row.',
      };
    }

    if (msg.includes('missing_sl') || msg.includes('missing_tp')) {
      return {
        type: 'missing_protection',
        severity: 'high',
        canRetry: true,
        reason: 'Active position is missing a Stop-Loss or Take-Profit protection order.',
      };
    }

    if (row.sl_present && (!row.tp1_present || !row.tp2_present)) {
      return {
        type: 'partial_protection',
        severity: 'medium',
        canRetry: true,
        reason: 'Position is only partially protected (e.g. SL set but missing TP orders).',
      };
    }

    if (msg.includes('desync') || msg.includes('state_mismatch')) {
      return {
        type: 'desynchronization',
        severity: 'high',
        canRetry: true,
        reason: 'Provider exchange state does not match database truth.',
      };
    }

    return {
      type: 'unknown',
      severity: 'high',
      canRetry: true,
      reason: `Unclassified recovery incident: ${errorMsg}`,
    };
  }

  async executeRecovery(
    row: TradeManagementTruthRow,
    errorMsg: string,
    retryCount: number
  ): Promise<{ success: boolean; classification: RecoveryClassification; actionTaken: string }> {
    const classification = this.classifyIncident(row, errorMsg, retryCount);

    if (!classification.canRetry) {
      // Escalation required, no retry attempted
      const escalatedRow: TradeManagementTruthRow & { repair_attempts?: number } = {
        ...row,
        status: 'RECOVERY_REQUIRED',
        recovery_status: 'repair_failed',
        latest_error: `Escalated: ${classification.reason}`,
        repair_attempts: retryCount + 1,
        latest_sync_at: new Date().toISOString(),
      };
      await upsertTradeTruthThroughCompatibility(this.store, escalatedRow);

      return {
        success: false,
        classification,
        actionTaken: 'escalated_to_admin',
      };
    }

    // Attempt Retry of Safe Operations
    try {
      if (classification.type === 'missing_protection' || classification.type === 'partial_protection') {
        // Safe operation: re-running sync and triggering repair stops
        const positions = await this.provider.fetchOpenPositions();
        const openOrders = await this.provider.fetchOpenOrders(row.symbol);
        const dbRows = await this.store.listOpenTradeTruth(this.provider.metadata.id);

        const livePos = positions.find(p => p.symbol === row.symbol) || null;
        const violations = detectProtectionViolations(livePos, openOrders, dbRows);

        if (violations.stale_order && !livePos) {
          // Cancel stale orders
          for (const order of openOrders) {
            await this.provider.cancelOrder({ symbol: row.symbol, providerOrderId: order.providerOrderId });
          }
          await upsertTradeTruthThroughCompatibility(this.store, {
            ...row,
            protection_status: 'closed',
            status: 'closed',
            recovery_status: 'repair_succeeded',
            last_action_taken: 'recovery:cancelled_stale_orders',
            latest_sync_at: new Date().toISOString()
          });
          return { success: true, classification, actionTaken: 'cancelled_stale_orders' };
        }
      }

      // If generic desync/timeout, update timestamp and increment attempts
      const updatedRow: TradeManagementTruthRow & { repair_attempts?: number } = {
        ...row,
        repair_attempts: retryCount + 1,
        latest_sync_at: new Date().toISOString(),
        last_action_taken: `recovery_retry_${classification.type}`,
      };
      await upsertTradeTruthThroughCompatibility(this.store, updatedRow);

      return {
        success: true,
        classification,
        actionTaken: 'incremented_retry_count',
      };
    } catch {
      return {
        success: false,
        classification,
        actionTaken: 'retry_failed',
      };
    }
  }
}
