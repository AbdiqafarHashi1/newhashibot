import {
  isExecutionStatus,
  isMonitoringStatus,
  isProtectionStatus,
  isRecoveryStatus,
  isReportingStatus,
  isTradeLifecycleState,
  positionSideFromSignalDirection,
  toExchangeOrderSide,
  toPositionSide,
  toSignalDirection,
  type ExchangeOrderSide,
  type PositionSide,
  type SignalDirection,
  type TradeLifecycleState,
} from '../../runtimeContracts/index.js';
import type { TradeTruthCreateInput, TradeTruthError, TradeTruthMutationContext, TradeTruthRecord, TradeTruthStatusSet } from './types.js';

const PROTECTION_STATUSES_IN_EXECUTION = new Set(['protected', 'protected_native', 'protected_managed', 'pending_protection', 'protection_pending', 'protection_failed']);

export const LIFECYCLE_TRANSITIONS: Record<TradeLifecycleState, readonly TradeLifecycleState[]> = {
  signal_created: ['signal_created', 'qualified'],
  qualified: ['qualified', 'position_sized'],
  position_sized: ['position_sized', 'order_submitted'],
  order_submitted: ['order_submitted', 'order_accepted'],
  order_accepted: ['order_accepted', 'filled'],
  filled: ['filled', 'protection_pending', 'closed'],
  protection_pending: ['protection_pending', 'protection_verified', 'closed'],
  protection_verified: ['protection_verified', 'tp1', 'tp2', 'closed'],
  tp1: ['tp1', 'break_even', 'tp2', 'closed'],
  break_even: ['break_even', 'tp2', 'closed'],
  tp2: ['tp2', 'closed'],
  closed: ['closed', 'archived'],
  archived: ['archived'],
};

export function tradeTruthError(code: TradeTruthError['code'], message: string, details: Partial<TradeTruthError> = {}): TradeTruthError {
  return { code, message, retryable: false, ...details };
}

function requiredString(value: unknown, code: TradeTruthError['code'], label: string): string | TradeTruthError {
  const text = String(value ?? '').trim();
  if (!text) return tradeTruthError(code, `${label} is required`);
  return text;
}

export function normalizeSideFields(input: Pick<TradeTruthCreateInput, 'position_side' | 'signal_direction' | 'exchange_order_side'>):
  | { ok: true; position_side: PositionSide; signal_direction: SignalDirection | null; exchange_order_side: ExchangeOrderSide | null }
  | { ok: false; error: TradeTruthError } {
  const signalDirection = input.signal_direction == null || input.signal_direction === '' ? null : toSignalDirection(input.signal_direction);
  if ((input.signal_direction != null && input.signal_direction !== '') && !signalDirection) {
    return { ok: false, error: tradeTruthError('invalid_signal_direction', `Invalid signal_direction: ${String(input.signal_direction)}`) };
  }

  const positionSide = input.position_side == null || input.position_side === ''
    ? signalDirection ? positionSideFromSignalDirection(signalDirection) : null
    : toPositionSide(input.position_side);
  if (!positionSide) return { ok: false, error: tradeTruthError(input.position_side == null ? 'missing_position_side' : 'invalid_position_side', `Invalid position_side: ${String(input.position_side ?? '')}`) };

  if (signalDirection && positionSideFromSignalDirection(signalDirection) !== positionSide) {
    return { ok: false, error: tradeTruthError('side_direction_mismatch', `position_side ${positionSide} conflicts with signal_direction ${signalDirection}`) };
  }

  const exchangeOrderSide = input.exchange_order_side == null || input.exchange_order_side === '' ? null : toExchangeOrderSide(input.exchange_order_side);
  if ((input.exchange_order_side != null && input.exchange_order_side !== '') && !exchangeOrderSide) {
    return { ok: false, error: tradeTruthError('invalid_exchange_order_side', `Invalid exchange_order_side: ${String(input.exchange_order_side)}`) };
  }

  return { ok: true, position_side: positionSide, signal_direction: signalDirection, exchange_order_side: exchangeOrderSide };
}

export function validateStatusSet(statuses: Partial<TradeTruthStatusSet> | undefined): TradeTruthStatusSet | TradeTruthError {
  const source = statuses ?? {};
  const pick = <K extends keyof TradeTruthStatusSet>(key: K, fallback: TradeTruthStatusSet[K]): TradeTruthStatusSet[K] | null | undefined =>
    Object.prototype.hasOwnProperty.call(source, key) ? (source as Record<string, TradeTruthStatusSet[K] | null | undefined>)[key] : fallback;
  const merged = {
    trade_lifecycle_state: pick('trade_lifecycle_state', 'signal_created'),
    execution_status: pick('execution_status', 'created'),
    protection_status: pick('protection_status', 'not_required'),
    monitoring_status: pick('monitoring_status', 'unchecked'),
    recovery_status: pick('recovery_status', 'none'),
    reporting_status: pick('reporting_status', 'not_published'),
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value == null || String(value) === '') return tradeTruthError('missing_runtime_status', `${key} cannot be NULL or empty`, { details: { field: key } });
  }
  if (!isTradeLifecycleState(merged.trade_lifecycle_state)) return tradeTruthError('invalid_runtime_status', `Invalid trade_lifecycle_state: ${merged.trade_lifecycle_state}`);
  if (PROTECTION_STATUSES_IN_EXECUTION.has(String(merged.execution_status))) return tradeTruthError('protection_status_as_execution_status', `Protection state cannot be execution status: ${merged.execution_status}`);
  if (!isExecutionStatus(merged.execution_status)) return tradeTruthError('invalid_runtime_status', `Invalid execution_status: ${merged.execution_status}`);
  if (!isProtectionStatus(merged.protection_status)) return tradeTruthError('invalid_runtime_status', `Invalid protection_status: ${merged.protection_status}`);
  if (!isMonitoringStatus(merged.monitoring_status)) return tradeTruthError('invalid_runtime_status', `Invalid monitoring_status: ${merged.monitoring_status}`);
  if (!isRecoveryStatus(merged.recovery_status)) return tradeTruthError('invalid_runtime_status', `Invalid recovery_status: ${merged.recovery_status}`);
  if (!isReportingStatus(merged.reporting_status)) return tradeTruthError('invalid_runtime_status', `Invalid reporting_status: ${merged.reporting_status}`);
  return merged as TradeTruthStatusSet;
}

export function validateCreateInput(input: TradeTruthCreateInput): TradeTruthRecord | TradeTruthError {
  const tradeId = requiredString(input.trade_id, 'missing_trade_id', 'trade_id');
  if (typeof tradeId !== 'string') return tradeId;
  const providerId = requiredString(input.provider_id, 'missing_provider_id', 'provider_id');
  if (typeof providerId !== 'string') return providerId;
  const environmentId = requiredString(input.environment_id, 'missing_environment_id', 'environment_id');
  if (typeof environmentId !== 'string') return environmentId;
  const accountId = requiredString(input.account_id, 'missing_account_id', 'account_id');
  if (typeof accountId !== 'string') return accountId;
  const symbol = requiredString(input.symbol, 'missing_symbol', 'symbol');
  if (typeof symbol !== 'string') return symbol;

  const side = normalizeSideFields(input);
  if (side.ok === false) return side.error;
  const statuses = validateStatusSet(input.statuses);
  if ('code' in statuses) return statuses;

  const now = input.timestamp ?? new Date().toISOString();
  return {
    trade_id: tradeId as TradeTruthRecord['trade_id'],
    signal_id: input.signal_id ? String(input.signal_id) as TradeTruthRecord['signal_id'] : null,
    execution_order_id: input.execution_order_id ? String(input.execution_order_id) as TradeTruthRecord['execution_order_id'] : null,
    provider_order_id: input.provider_order_id ? String(input.provider_order_id) as TradeTruthRecord['provider_order_id'] : null,
    provider_position_id: input.provider_position_id ? String(input.provider_position_id) as TradeTruthRecord['provider_position_id'] : null,
    environment_id: environmentId,
    provider_id: providerId,
    account_id: accountId as TradeTruthRecord['account_id'],
    symbol,
    position_side: side.position_side,
    signal_direction: side.signal_direction,
    exchange_order_side: side.exchange_order_side,
    quantity_initial: input.quantity_initial ?? null,
    quantity_remaining: input.quantity_remaining ?? input.quantity_initial ?? null,
    entry_price_intended: input.entry_price_intended ?? null,
    entry_price_filled: input.entry_price_filled ?? null,
    sl_price_intended: input.sl_price_intended ?? null,
    tp1_price_intended: input.tp1_price_intended ?? null,
    tp2_price_intended: input.tp2_price_intended ?? null,
    correlation_id: input.correlation_id ?? null,
    created_at: now,
    updated_at: now,
    latest_sync_at: now,
    version: 1,
    metadata: input.metadata,
    ...statuses,
  };
}

export function validateTransition(current: TradeLifecycleState, attempted: TradeLifecycleState, ctx: TradeTruthMutationContext, tradeId: string): TradeTruthError | null {
  const allowed = LIFECYCLE_TRANSITIONS[current] ?? [];
  if (allowed.includes(attempted)) return null;
  return tradeTruthError('invalid_lifecycle_transition', `Invalid lifecycle transition ${current} -> ${attempted}`, {
    trade_id: tradeId,
    current_state: current,
    attempted_state: attempted,
    writer: ctx.writer,
  });
}

export function assertImmutableIdentity(current: TradeTruthRecord, next: TradeTruthRecord, writer: string): TradeTruthError | null {
  const fields: Array<keyof TradeTruthRecord> = ['trade_id', 'provider_id', 'environment_id', 'account_id', 'symbol'];
  for (const field of fields) {
    if (String(current[field]) !== String(next[field])) {
      return tradeTruthError('immutable_identity_change', `Immutable identity field changed: ${String(field)}`, { trade_id: String(current.trade_id), writer });
    }
  }
  return null;
}
