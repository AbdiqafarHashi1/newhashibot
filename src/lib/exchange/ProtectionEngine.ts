import type { ExchangeProvider, ProviderResult, ProtectionRequest } from './exchangeProvider.js';
import { detectProtectionViolations, evaluateLifecycleState, TradeManagementTruthRow } from './tradeManagementCore.js';

export interface ProtectionVerificationResult {
  symbol: string;
  ok: boolean;
  lifecycleState: string;
  protectionState: 'safe' | 'unsafe' | 'degraded';
  actionTaken: string;
  error?: string;
}

export class ProtectionEngine {
  constructor(
    private readonly provider: ExchangeProvider,
    private readonly store: {
      upsertTradeTruth(row: TradeManagementTruthRow): Promise<void>;
      listOpenTradeTruth(providerId: string): Promise<TradeManagementTruthRow[]>;
    }
  ) {}

  async verifyAndProtect(
    row: TradeManagementTruthRow
  ): Promise<ProtectionVerificationResult> {
    try {
      const positions = await this.provider.fetchOpenPositions();
      const openOrders = await this.provider.fetchOpenOrders(row.symbol);
      const dbRows = await this.store.listOpenTradeTruth(this.provider.metadata.id);

      const livePosition = positions.find(
        (p) =>
          p.symbol.toUpperCase() === row.symbol.toUpperCase() &&
          p.side.toLowerCase() === row.side.toLowerCase()
      ) || null;

      // 1. Detect Violations
      const violations = detectProtectionViolations(livePosition, openOrders, dbRows);
      const lifecycleState = evaluateLifecycleState(row.status, row.protection_status, violations);

      if (!violations.illegal_state) {
        // Safe and fully protected
        const updatedRow: TradeManagementTruthRow = {
          ...row,
          protection_status: 'protected',
          status: 'entry_filled',
          monitor_status: 'synced',
          latest_sync_at: new Date().toISOString(),
          last_action_taken: 'verifyAndProtect_safe',
        };
        await this.store.upsertTradeTruth(updatedRow);

        return {
          symbol: row.symbol,
          ok: true,
          lifecycleState,
          protectionState: 'safe',
          actionTaken: 'none_already_protected',
        };
      }

      // 2. Safe Repair Trigger (recreating missing SL or TP)
      if (violations.missing_sl || violations.missing_tp) {
        const mark = Number(livePosition?.markPrice ?? row.mark_price ?? row.entry_price ?? 0);
        const long = String(row.side).toLowerCase() === 'long';

        const rowExt = row as TradeManagementTruthRow & { sl_price?: number; tp1_price?: number; tp2_price?: number };
        const repairReq: ProtectionRequest = {
          symbol: row.symbol,
          side: long ? 'long' : 'short',
          quantity: row.qty,
          entryPrice: Number(row.entry_price ?? mark),
          stopLoss: rowExt.sl_price || (long ? mark * 0.99 : mark * 1.01),
          tp1: rowExt.tp1_price || (long ? mark * 1.01 : mark * 0.99),
          tp2: rowExt.tp2_price || (long ? mark * 1.02 : mark * 0.98),
          metadata: { executionId: row.execution_order_id, signalId: row.signal_id },
        };

        const repairs: Promise<ProviderResult>[] = [];
        if (violations.missing_sl) {
          repairs.push(this.provider.placeStopLoss(repairReq));
        }
        if (violations.missing_tp) {
          repairs.push(this.provider.placeTakeProfit(repairReq, 'tp1'));
          repairs.push(this.provider.placeTakeProfit(repairReq, 'tp2'));
        }

        const repairResults = await Promise.all(repairs);
        const repairFailed = repairResults.some((res) => !res.ok);

        if (!repairFailed) {
          // Re-evaluate open orders to make sure they are now verified
          const freshOrders = await this.provider.fetchOpenOrders(row.symbol);
          const freshViolations = detectProtectionViolations(livePosition, freshOrders, dbRows);

          if (!freshViolations.missing_sl && !freshViolations.missing_tp) {
            const updatedRow: TradeManagementTruthRow = {
              ...row,
              protection_status: 'protected',
              status: 'entry_filled',
              recovery_status: 'repair_succeeded',
              monitor_status: 'synced',
              latest_sync_at: new Date().toISOString(),
              last_action_taken: 'verifyAndProtect_repaired_successfully',
            };
            await this.store.upsertTradeTruth(updatedRow);

            return {
              symbol: row.symbol,
              ok: true,
              lifecycleState: 'PROTECTED',
              protectionState: 'safe',
              actionTaken: 'recreated_protection_stops',
            };
          }
        }
      }

      // 3. Escalation for Unsafe State / Unresolved Violations
      const escalationRow: TradeManagementTruthRow = {
        ...row,
        status: 'RECOVERY_REQUIRED',
        protection_status: 'unprotected_failed' as unknown as 'protected',
        recovery_status: 'repair_failed',
        latest_error: `Unsafe violation: ${violations.reason}`,
        last_action_taken: 'verifyAndProtect_escalated_recovery_required',
        latest_sync_at: new Date().toISOString(),
      };
      await this.store.upsertTradeTruth(escalationRow);

      // Trigger alerts (no silent failures)
      console.error(`[ALERT] ProtectionEngine Recovery Required for ${row.symbol}: ${violations.reason}`);

      return {
        symbol: row.symbol,
        ok: false,
        lifecycleState: 'RECOVERY_REQUIRED',
        protectionState: 'unsafe',
        actionTaken: 'escalated_recovery_required',
        error: violations.reason,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        symbol: row.symbol,
        ok: false,
        lifecycleState: 'RECOVERY_REQUIRED',
        protectionState: 'unsafe',
        actionTaken: 'failed_during_verification',
        error: errorMsg,
      };
    }
  }
}
