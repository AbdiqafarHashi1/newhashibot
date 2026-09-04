/**
 * HashiBot Phase 2A canonical runtime contracts.
 *
 * This file is intentionally business-logic free. It defines the shared runtime
 * vocabulary that execution, monitoring, protection, reporting, recovery,
 * Telegram, trade truth, and provider adapters must depend on.
 */

export const TRADE_LIFECYCLE_STATES = [
  'signal_created',
  'qualified',
  'position_sized',
  'order_submitted',
  'order_accepted',
  'filled',
  'protection_pending',
  'protection_verified',
  'tp1',
  'break_even',
  'tp2',
  'closed',
  'archived',
] as const;

export type TradeLifecycleState = typeof TRADE_LIFECYCLE_STATES[number];

export const EXECUTION_STATUSES = [
  'created',
  'submitted',
  'accepted',
  'partially_filled',
  'filled',
  'cancel_requested',
  'cancelled',
  'rejected',
  'expired',
  'failed',
  'unknown_provider_state',
] as const;

export type ExecutionStatus = typeof EXECUTION_STATUSES[number];

export const PROTECTION_STATUSES = [
  'not_required',
  'pending',
  'verified',
  'missing_sl',
  'missing_tp',
  'missing_sl_tp',
  'partially_protected',
  'repair_requested',
  'repairing',
  'failed',
  'unknown',
] as const;

export type ProtectionStatus = typeof PROTECTION_STATUSES[number];

export const MONITORING_STATUSES = [
  'unchecked',
  'in_sync',
  'drift_detected',
  'repair_requested',
  'stale',
  'failed',
] as const;

export type MonitoringStatus = typeof MONITORING_STATUSES[number];

export const RECOVERY_STATUSES = [
  'none',
  'requested',
  'in_progress',
  'succeeded',
  'failed',
  'manual_required',
] as const;

export type RecoveryStatus = typeof RECOVERY_STATUSES[number];

export const REPORTING_STATUSES = [
  'not_published',
  'queued',
  'published',
  'suppressed',
  'failed',
] as const;

export type ReportingStatus = typeof REPORTING_STATUSES[number];

export const PROVIDER_IDS = [
  'binance',
  'binance_testnet',
  'bybit',
  'bybit_testnet',
  'mt5',
  'mt5_personal',
  'mt5_prop',
  'ctrader',
  'ctrader_personal',
  'ctrader_prop',
] as const;

export type KnownProviderId = typeof PROVIDER_IDS[number];
export type ProviderId = KnownProviderId | (string & { readonly __runtimeProviderIdBrand?: never });

export const ENVIRONMENT_IDS = [
  'demo',
  'testnet',
  'paper',
  'live',
  'staging',
  'development',
] as const;

export type KnownEnvironmentId = typeof ENVIRONMENT_IDS[number];
export type EnvironmentId = KnownEnvironmentId | (string & { readonly __runtimeEnvironmentIdBrand?: never });

export type TradeId = string & { readonly __tradeIdBrand: unique symbol };
export type SignalId = string & { readonly __signalIdBrand: unique symbol };
export type ExecutionOrderId = string & { readonly __executionOrderIdBrand: unique symbol };
export type ProviderOrderId = string & { readonly __providerOrderIdBrand: unique symbol };
export type ProviderPositionId = string & { readonly __providerPositionIdBrand: unique symbol };
export type AccountId = string & { readonly __accountIdBrand: unique symbol };

export const POSITION_SIDES = ['long', 'short'] as const;
export type PositionSide = typeof POSITION_SIDES[number];

export const SIGNAL_DIRECTIONS = ['buy', 'sell'] as const;
export type SignalDirection = typeof SIGNAL_DIRECTIONS[number];

export const EXCHANGE_ORDER_SIDES = ['BUY', 'SELL'] as const;
export type ExchangeOrderSide = typeof EXCHANGE_ORDER_SIDES[number];

export interface RuntimeIdentity {
  trade_id: TradeId;
  signal_id?: SignalId | null;
  execution_order_id?: ExecutionOrderId | null;
  provider_order_id?: ProviderOrderId | null;
  provider_position_id?: ProviderPositionId | null;
  environment_id: EnvironmentId;
  provider_id: ProviderId;
  account_id: AccountId;
}

export interface RuntimeStatusContract {
  trade_lifecycle_state: TradeLifecycleState;
  execution_status: ExecutionStatus;
  protection_status: ProtectionStatus;
  monitoring_status: MonitoringStatus;
  recovery_status: RecoveryStatus;
  reporting_status: ReportingStatus;
}
