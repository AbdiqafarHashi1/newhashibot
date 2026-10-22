import type { CanonicalApprovedSignal } from './CanonicalApprovedSignal.js';
import type { ExchangeProvider, ProviderResult } from './exchangeProvider.js';
import { signalModeIncluded, isBotPackage } from '../packages.js';

export interface ExecutionRejection {
  ok: false;
  reason: 'duplicate' | 'expired' | 'package_not_allowed' | 'provider_disabled' | 'execution_disabled' | 'missing_SL' | 'missing_TP' | 'invalid_RR' | 'risk_rejection' | 'arbitrator_rejection' | string;
  message: string;
}

export class ExecutionSupervisor {
  private activeIdempotencyKeys = new Set<string>();

  constructor(
    private readonly providers: Record<string, ExchangeProvider>,
    private readonly globalSettings: {
      testnetEnabled: boolean;
      liveTradingEnabled: boolean;
      botPaused: boolean;
      oneActiveExecutionPerSymbol: boolean;
    }
  ) {}

  async executeSignal(
    signal: CanonicalApprovedSignal,
    existingTrades: Array<{ symbol: string; status: string }>
  ): Promise<ProviderResult | ExecutionRejection> {
    // 1. Idempotency Check
    if (this.activeIdempotencyKeys.has(signal.idempotency_key)) {
      return {
        ok: false,
        reason: 'duplicate',
        message: `Signal with idempotency key ${signal.idempotency_key} is already executing.`,
      };
    }
    this.activeIdempotencyKeys.add(signal.idempotency_key);

    try {
      // 2. Testnet / Demo Enforcement Gate
      if (signal.execution_mode === 'live' || this.globalSettings.liveTradingEnabled) {
        if (!this.globalSettings.liveTradingEnabled) {
          return {
            ok: false,
            reason: 'risk_rejection',
            message: 'Hard fail: Live trading requested but is globally disabled.',
          };
        }
      }

      // 3. Expiration Validation
      if (signal.expires_at && new Date(signal.expires_at).getTime() < Date.now()) {
        return {
          ok: false,
          reason: 'expired',
          message: `Signal expired at ${signal.expires_at}.`,
        };
      }

      // 4. Approval Validation
      if (!signal.grade || Number(signal.score ?? 0) < 0.1) {
        return {
          ok: false,
          reason: 'arbitrator_rejection',
          message: 'Signal rejected by arbitrator score/grade criteria.',
        };
      }

      // 5. Package Gating Validation
      if (!signalModeIncluded(signal.package) && !isBotPackage(signal.package)) {
        return {
          ok: false,
          reason: 'package_not_allowed',
          message: `Customer package '${signal.package}' is not allowed to receive signals.`,
        };
      }
      if (signal.execution_mode !== 'signal_only' && !isBotPackage(signal.package)) {
        return {
          ok: false,
          reason: 'package_not_allowed',
          message: `Customer package '${signal.package}' does not unlock automated bot execution.`,
        };
      }

      // 6. Global & Provider Bot State Check
      if (this.globalSettings.botPaused) {
        return {
          ok: false,
          reason: 'execution_disabled',
          message: 'Automated execution is currently paused globally.',
        };
      }

      // 7. Route Checking and Provider Lookup
      const provider = this.providers[signal.provider_route];
      if (!provider) {
        return {
          ok: false,
          reason: 'provider_disabled',
          message: `Provider route '${signal.provider_route}' is not active or disabled.`,
        };
      }

      // 8. Risk & Parameter Structure Check
      if (!signal.stop_loss || signal.stop_loss <= 0) {
        return { ok: false, reason: 'missing_SL', message: 'Signal stop loss is missing or invalid.' };
      }
      if (!signal.tp1 || signal.tp1 <= 0 || !signal.tp2 || signal.tp2 <= 0) {
        return { ok: false, reason: 'missing_TP', message: 'Take profit targets TP1 and TP2 are required.' };
      }
      const isLong = signal.direction === 'buy';
      const rrValid = isLong
        ? signal.tp1 > signal.entry && signal.stop_loss < signal.entry
        : signal.tp1 < signal.entry && signal.stop_loss > signal.entry;
      if (!rrValid) {
        return { ok: false, reason: 'invalid_RR', message: 'Invalid Risk-to-Reward parameters relative to entry.' };
      }

      // 9. Symbol Position Limit Gating / Duplicate Prevention
      if (this.globalSettings.oneActiveExecutionPerSymbol) {
        const duplicateActive = existingTrades.some(
          (trade) =>
            trade.symbol.toUpperCase() === signal.symbol.toUpperCase() &&
            !['closed', 'cancelled', 'failed'].includes(trade.status.toLowerCase())
        );
        if (duplicateActive) {
          return {
            ok: false,
            reason: 'duplicate',
            message: `Execution blocked: active trade already running for symbol ${signal.symbol}.`,
          };
        }
      }

      // 10. Execute via Provider
      const result = await provider.placeEntry({
        symbol: signal.symbol,
        side: signal.direction === 'buy' ? 'long' : 'short',
        quantity: signal.calculated_position_size,
        entryPrice: signal.entry,
        stopLoss: signal.stop_loss,
        tp1: signal.tp1,
        tp2: signal.tp2,
        signalId: signal.signal_id,
        metadata: {
          idempotency_key: signal.idempotency_key,
          risk_percent: signal.risk_percent,
          leverage: signal.leverage,
          stop_loss: signal.stop_loss,
          tp1: signal.tp1,
          tp2: signal.tp2,
        },
      });

      return result;
    } finally {
      // Remove idempotency key from memory on completion
      this.activeIdempotencyKeys.delete(signal.idempotency_key);
    }
  }
}
