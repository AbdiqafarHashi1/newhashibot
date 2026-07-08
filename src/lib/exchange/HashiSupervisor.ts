import type { CanonicalApprovedSignal } from './CanonicalApprovedSignal.js';
import type { ExchangeProvider, ProviderResult } from './exchangeProvider.js';
import { ExecutionSupervisor, ExecutionRejection } from './ExecutionSupervisor.js';
import { ProtectionEngine, ProtectionVerificationResult } from './ProtectionEngine.js';
import { RecoveryEngine, RecoveryClassification } from './RecoveryEngine.js';
import { RuntimeSupervisor, RuntimeHealthReport } from './RuntimeSupervisor.js';
import { TradeManagementTruthRow } from './tradeManagementCore.js';
import { signalModeIncluded } from '../packages.js';

export interface ReportingPayload {
  level: 'info' | 'warn' | 'error' | 'critical';
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class HashiSupervisor {
  readonly execution: ExecutionSupervisor;
  readonly runtime: RuntimeSupervisor;

  constructor(
    private readonly providers: Record<string, ExchangeProvider>,
    private readonly store: {
      upsertTradeTruth(row: TradeManagementTruthRow): Promise<void>;
      listOpenTradeTruth(providerId: string): Promise<TradeManagementTruthRow[]>;
    },
    globalSettings: {
      testnetEnabled: boolean;
      liveTradingEnabled: boolean;
      botPaused: boolean;
      oneActiveExecutionPerSymbol: boolean;
    }
  ) {
    this.execution = new ExecutionSupervisor(providers, globalSettings);
    this.runtime = new RuntimeSupervisor();
  }

  // --- 1. Scanner Supervisor Coordinating Gate ---
  async handleScannerHeartbeat(ok: boolean, scannedCount: number, errorMsg?: string): Promise<void> {
    if (ok) {
      this.runtime.reportHealth('Scanner', 'Healthy', `Successfully scanned ${scannedCount} instruments.`);
    } else {
      this.runtime.reportHealth('Scanner', 'Warning', errorMsg || 'Scanner failed to complete scan loop.');
      await this.reportIncident({
        level: 'warn',
        component: 'Scanner',
        message: `Scanner Warning: ${errorMsg || 'Scan loop failure'}`,
      });
    }
  }

  // --- 2. Arbitrator Supervisor Coordinating Gate ---
  async handleArbitration(signalId: string, passed: boolean, reason?: string): Promise<void> {
    if (passed) {
      this.runtime.reportHealth('Arbitrator', 'Healthy', `Signal ${signalId} passed arbitration.`);
    } else {
      this.runtime.reportHealth('Arbitrator', 'Warning', `Signal ${signalId} rejected by Arbitrator: ${reason}`);
      await this.reportIncident({
        level: 'info',
        component: 'Arbitrator',
        message: `Arbitration Blocked: ${reason}`,
        metadata: { signalId },
      });
    }
  }

  // --- 3. Execution Supervisor Coordinating Gate ---
  async processSignalExecution(
    signal: CanonicalApprovedSignal,
    existingTrades: Array<{ symbol: string; status: string }>
  ): Promise<ProviderResult | ExecutionRejection> {
    this.runtime.reportHealth('Execution', 'Healthy', `Processing signal execution for ${signal.symbol}.`);
    
    const result = await this.execution.executeSignal(signal, existingTrades);
    
    if (!result.ok) {
      const rej = result as unknown as Record<string, unknown>;
      this.runtime.reportHealth('Execution', 'Warning', `Signal execution rejected: ${rej.reason}`);
      await this.reportIncident({
        level: 'warn',
        component: 'Execution',
        message: `Execution Rejected: ${rej.message || rej.error || 'unknown'}`,
        metadata: { signalId: signal.signal_id, reason: rej.reason },
      });
    } else {
      await this.reportIncident({
        level: 'info',
        component: 'Execution',
        message: `Execution Submitted: Successfully opened trade on ${signal.symbol}.`,
        metadata: { signalId: signal.signal_id, provider: signal.provider_route },
      });
    }

    return result;
  }

  // --- 4. Protection Supervisor Coordinating Gate ---
  async processProtectionCheck(
    row: TradeManagementTruthRow
  ): Promise<ProtectionVerificationResult> {
    const provider = this.providers[row.provider];
    if (!provider) {
      return {
        symbol: row.symbol,
        ok: false,
        lifecycleState: 'RECOVERY_REQUIRED',
        protectionState: 'unsafe',
        actionTaken: 'provider_not_found',
        error: `Provider '${row.provider}' not configured.`,
      };
    }

    const protectionEngine = new ProtectionEngine(provider, this.store);
    const check = await protectionEngine.verifyAndProtect(row);

    if (check.protectionState === 'safe') {
      this.runtime.reportHealth('Protection', 'Healthy', `Protection verified safe for ${row.symbol}.`);
    } else {
      this.runtime.reportHealth('Protection', 'Critical', `Protection unsafe or failed for ${row.symbol}.`);
      await this.reportIncident({
        level: 'critical',
        component: 'Protection',
        message: `Protection Alert: Position ${row.symbol} has active safety violations.`,
        metadata: { symbol: row.symbol, lifecycleState: check.lifecycleState, error: check.error },
      });
    }

    return check;
  }

  // --- 5. Recovery Supervisor Coordinating Gate ---
  async processRecoveryIncident(
    row: TradeManagementTruthRow,
    errorMsg: string,
    retryCount: number
  ): Promise<{ success: boolean; classification: RecoveryClassification; actionTaken: string }> {
    const provider = this.providers[row.provider];
    if (!provider) {
      return {
        success: false,
        classification: {
          type: 'provider_outage',
          severity: 'critical',
          canRetry: false,
          reason: 'Provider not found.',
        },
        actionTaken: 'escalated_to_admin',
      };
    }

    const recoveryEngine = new RecoveryEngine(provider, this.store);
    const result = await recoveryEngine.executeRecovery(row, errorMsg, retryCount);

    if (result.success) {
      this.runtime.reportHealth('Recovery', 'Recovering', `Recovery retry active for ${row.symbol}.`);
      await this.reportIncident({
        level: 'warn',
        component: 'Recovery',
        message: `Recovery Attempted: Safe action taken: ${result.actionTaken}`,
        metadata: { symbol: row.symbol, classification: result.classification.type },
      });
    } else {
      this.runtime.reportHealth('Recovery', 'Critical', `Recovery critical escalation triggered for ${row.symbol}.`);
      await this.reportIncident({
        level: 'critical',
        component: 'Recovery',
        message: `CRITICAL RECOVERY ESCALATION: ${result.classification.reason}`,
        metadata: { symbol: row.symbol, error: errorMsg },
      });
    }

    return result;
  }

  // --- 6. Runtime Health Report ---
  getRuntimeReport(): RuntimeHealthReport {
    return this.runtime.getHealthReport();
  }

  // --- 7. Reporting Supervisor Coordinating Gate ---
  async reportIncident(payload: ReportingPayload): Promise<void> {
    // Shared reporting log/stream
    console.log(`[REPORTING_SUPERVISOR] [${payload.level.toUpperCase()}] ${payload.component}: ${payload.message}`, payload.metadata || '');
    
    // Decoupled status hook (could publish to Telegram Operations, Slack, database audit logs)
  }

  // --- 8. Customer Execution Supervisor Coordinating Gate ---
  async verifyCustomerAccess(customerId: string, packageSlug: string): Promise<boolean> {
    const allowed = signalModeIncluded(packageSlug);
    if (allowed) {
      this.runtime.reportHealth('Customer Access', 'Healthy', `Customer ${customerId} validated.`);
    } else {
      this.runtime.reportHealth('Customer Access', 'Warning', `Customer ${customerId} access blocked.`);
    }
    return allowed;
  }
}
