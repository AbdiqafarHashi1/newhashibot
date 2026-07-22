import {
  normalizeExecutionStatus,
  normalizeProtectionStatus,
  positionSideFromSignalDirection,
  toPositionSide,
  toSignalDirection,
  type ExecutionStatus,
  type MonitoringStatus,
  type RecoveryStatus,
  type ReportingStatus,
  type TradeLifecycleState,
} from '../../runtimeContracts/index.js';
import { validateCreateInput } from './validation.js';
import type { TradeTruthCreateInput, TradeTruthError, TradeTruthRecord } from './types.js';

export type LegacyTradeTruthDrift = 'recoverable_legacy_drift' | 'unrecoverable_malformed_truth';

export interface LegacyTradeTruthMappingFailure {
  ok: false;
  drift: LegacyTradeTruthDrift;
  error: TradeTruthError;
  legacy: Record<string, unknown>;
}

export interface LegacyTradeTruthMappingSuccess {
  ok: true;
  record: TradeTruthRecord;
  drift: 'none' | 'recoverable_legacy_drift';
  warnings: string[];
}

export type LegacyTradeTruthMappingResult = LegacyTradeTruthMappingSuccess | LegacyTradeTruthMappingFailure;

const MONITOR_STATUS_MAP: Record<string, MonitoringStatus> = {
  synced: 'in_sync',
  healthy: 'in_sync',
  closed: 'in_sync',
  repairing: 'repair_requested',
  repair_requested: 'repair_requested',
  stale: 'stale',
  error: 'failed',
  failed: 'failed',
};

const RECOVERY_STATUS_MAP: Record<string, RecoveryStatus> = {
  none: 'none',
  repair_attempted: 'in_progress',
  repair_requested: 'requested',
  repair_succeeded: 'succeeded',
  repair_failed: 'failed',
  manual_required: 'manual_required',
};

const REPORTING_STATUS_MAP: Record<string, ReportingStatus> = {
  not_published: 'not_published',
  queued: 'queued',
  published: 'published',
  suppressed: 'suppressed',
  failed: 'failed',
};

function fail(code: TradeTruthError['code'], message: string, legacy: Record<string, unknown>, drift: LegacyTradeTruthDrift): LegacyTradeTruthMappingFailure {
  return { ok: false, drift, legacy, error: { code, message, retryable: false, trade_id: legacy.trade_id ? String(legacy.trade_id) : null, details: { legacy } } };
}

function text(value: unknown): string | null {
  const str = String(value ?? '').trim();
  return str || null;
}

function lifecycleFromLegacy(status: string, protectionStatus: string | null): TradeLifecycleState | null {
  const normalized = status.toLowerCase();
  if (normalized === 'closed' || normalized.startsWith('closed_')) return 'closed';
  if (['protected', 'protected_native', 'protected_managed'].includes(normalized) || protectionStatus === 'verified') return 'protection_verified';
  if (['pending_protection', 'protection_pending', 'pending_managed_protection'].includes(normalized) || protectionStatus === 'pending') return 'protection_pending';
  if (normalized === 'recovery_required') return 'filled';
  if (['entry_filled', 'filled', 'partially_closed'].includes(normalized)) return 'filled';
  if (['entry_submitted', 'submitted', 'pending'].includes(normalized)) return 'order_submitted';
  if (['accepted', 'entry_accepted'].includes(normalized)) return 'order_accepted';
  if (normalized === 'position_sized') return 'position_sized';
  if (normalized === 'qualified') return 'qualified';
  if (normalized === 'signal_created') return 'signal_created';
  return null;
}

export function mapLegacyTradeTruthRow(legacy: Record<string, unknown>): LegacyTradeTruthMappingResult {
  const rawStatus = text(legacy.status);
  if (!rawStatus) return fail('missing_runtime_status', 'Legacy trade truth status is NULL or empty and requires repair classification', legacy, 'unrecoverable_malformed_truth');

  const provider = text(legacy.provider);
  if (!provider) return fail('missing_provider_id', 'Legacy trade truth provider is missing', legacy, 'unrecoverable_malformed_truth');
  const environment = text(legacy.environment) ?? 'unknown_legacy_environment';
  const account = text(legacy.account_id) ?? text(legacy.provider_account_id) ?? `${provider}:${environment}:legacy_account`;
  const symbol = text(legacy.symbol);
  if (!symbol) return fail('missing_symbol', 'Legacy trade truth symbol is missing', legacy, 'unrecoverable_malformed_truth');

  const signalDirection = toSignalDirection(text(legacy.signal_direction) ?? text(legacy.direction) ?? '');
  const positionSide = toPositionSide(text(legacy.position_side) ?? text(legacy.side) ?? text(legacy.direction) ?? '');
  if (!positionSide && !signalDirection) return fail('invalid_position_side', 'Legacy trade truth has no mappable side/direction', legacy, 'unrecoverable_malformed_truth');
  const finalPositionSide = positionSide ?? positionSideFromSignalDirection(signalDirection!);
  if (signalDirection && positionSide && positionSideFromSignalDirection(signalDirection) !== positionSide) return fail('side_direction_mismatch', 'Legacy side/direction values conflict', legacy, 'unrecoverable_malformed_truth');

  const executionStatus = normalizeExecutionStatus(rawStatus);
  if (!executionStatus) return fail('invalid_runtime_status', `Unsupported legacy execution status: ${rawStatus}`, legacy, 'recoverable_legacy_drift');
  const protectionStatus = normalizeProtectionStatus(text(legacy.protection_status) ?? rawStatus);
  if (!protectionStatus) return fail('invalid_runtime_status', `Unsupported legacy protection status: ${String(legacy.protection_status ?? rawStatus)}`, legacy, 'recoverable_legacy_drift');
  const monitoringStatus = MONITOR_STATUS_MAP[String(legacy.monitoring_status ?? legacy.monitor_status ?? 'synced').toLowerCase()] ?? 'unchecked';
  const recoveryStatus = RECOVERY_STATUS_MAP[String(legacy.recovery_status ?? 'none').toLowerCase()] ?? 'none';
  const reportingStatus = REPORTING_STATUS_MAP[String(legacy.reporting_status ?? 'not_published').toLowerCase()] ?? 'not_published';
  const lifecycle = lifecycleFromLegacy(rawStatus, protectionStatus);
  if (!lifecycle) return fail('invalid_runtime_status', `Cannot map legacy lifecycle from status: ${rawStatus}`, legacy, 'recoverable_legacy_drift');

  const tradeId = text(legacy.trade_id) ?? text(legacy.id) ?? [environment, provider, account, symbol, finalPositionSide].join(':');
  const input: TradeTruthCreateInput = {
    trade_id: tradeId,
    signal_id: text(legacy.signal_id),
    execution_order_id: text(legacy.execution_order_id),
    provider_order_id: text(legacy.provider_order_id) ?? text(legacy.entry_order_id),
    provider_position_id: text(legacy.provider_position_id) ?? text(legacy.exchange_position_id),
    environment_id: environment,
    provider_id: provider,
    account_id: account,
    symbol,
    position_side: finalPositionSide,
    signal_direction: signalDirection,
    quantity_initial: Number(legacy.qty ?? legacy.quantity_initial ?? 0) || null,
    quantity_remaining: Number(legacy.remaining_quantity ?? legacy.qty ?? 0) || null,
    entry_price_intended: Number(legacy.entry_price ?? 0) || null,
    entry_price_filled: Number(legacy.entry_price ?? 0) || null,
    sl_price_intended: Number(legacy.sl_price ?? legacy.stop_loss ?? 0) || null,
    tp1_price_intended: Number(legacy.tp1_price ?? legacy.tp1 ?? 0) || null,
    tp2_price_intended: Number(legacy.tp2_price ?? legacy.tp2 ?? 0) || null,
    statuses: {
      trade_lifecycle_state: lifecycle,
      execution_status: executionStatus as ExecutionStatus,
      protection_status: protectionStatus,
      monitoring_status: monitoringStatus,
      recovery_status: recoveryStatus,
      reporting_status: reportingStatus,
    },
    timestamp: text(legacy.latest_sync_at) ?? text(legacy.updated_at) ?? new Date().toISOString(),
    metadata: { legacy_trade_management_truth: legacy },
  };
  const record = validateCreateInput(input);
  if ('code' in record) return { ok: false, drift: 'unrecoverable_malformed_truth', error: record, legacy };
  const warnings = environment === 'unknown_legacy_environment' ? ['missing_environment_mapped_to_unknown_legacy_environment'] : [];
  if (!text(legacy.account_id) && !text(legacy.provider_account_id)) warnings.push('missing_account_mapped_to_legacy_account');
  return { ok: true, record, drift: warnings.length ? 'recoverable_legacy_drift' : 'none', warnings };
}
