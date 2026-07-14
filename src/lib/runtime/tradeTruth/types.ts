import type {
  AccountId,
  EnvironmentId,
  ExchangeOrderSide,
  ExecutionOrderId,
  ExecutionStatus,
  MonitoringStatus,
  PositionSide,
  ProtectionStatus,
  ProviderId,
  ProviderOrderId,
  ProviderPositionId,
  RecoveryStatus,
  ReportingStatus,
  RuntimeIdentity,
  SignalDirection,
  SignalId,
  TradeId,
  TradeLifecycleState,
} from '../../runtimeContracts/index.js';

export type TradeTruthWriter =
  | 'trade_truth_service'
  | 'execution_service'
  | 'protection_service'
  | 'runtime_monitor'
  | 'recovery_service'
  | 'reporting_pipeline'
  | 'legacy_compatibility_adapter'
  | (string & {});

export type TradeTruthEventType =
  | 'create'
  | 'qualified'
  | 'position_sized'
  | 'order_submitted'
  | 'order_accepted'
  | 'filled'
  | 'protection_pending'
  | 'protection_verified'
  | 'tp1'
  | 'break_even'
  | 'tp2'
  | 'closed'
  | 'archived'
  | 'monitor_observation'
  | 'recovery_status'
  | 'reporting_status'
  | 'legacy_compatibility_map';

export interface TradeTruthStatusSet {
  trade_lifecycle_state: TradeLifecycleState;
  execution_status: ExecutionStatus;
  protection_status: ProtectionStatus;
  monitoring_status: MonitoringStatus;
  recovery_status: RecoveryStatus;
  reporting_status: ReportingStatus;
}

export interface TradeTruthRecord extends RuntimeIdentity, TradeTruthStatusSet {
  symbol: string;
  position_side: PositionSide;
  signal_direction?: SignalDirection | null;
  exchange_order_side?: ExchangeOrderSide | null;
  quantity_initial?: number | null;
  quantity_remaining?: number | null;
  entry_price_intended?: number | null;
  entry_price_filled?: number | null;
  sl_price_intended?: number | null;
  tp1_price_intended?: number | null;
  tp2_price_intended?: number | null;
  closed_at?: string | null;
  close_reason?: string | null;
  archive_reason?: string | null;
  correlation_id?: string | null;
  created_at: string;
  updated_at: string;
  latest_sync_at?: string | null;
  version: number;
  metadata?: Record<string, unknown>;
}

export interface TradeTruthCreateInput {
  trade_id: TradeId | string;
  signal_id?: SignalId | string | null;
  execution_order_id?: ExecutionOrderId | string | null;
  provider_order_id?: ProviderOrderId | string | null;
  provider_position_id?: ProviderPositionId | string | null;
  environment_id: EnvironmentId | string;
  provider_id: ProviderId | string;
  account_id: AccountId | string;
  symbol: string;
  position_side?: PositionSide | string | null;
  signal_direction?: SignalDirection | string | null;
  exchange_order_side?: ExchangeOrderSide | string | null;
  quantity_initial?: number | null;
  quantity_remaining?: number | null;
  entry_price_intended?: number | null;
  entry_price_filled?: number | null;
  sl_price_intended?: number | null;
  tp1_price_intended?: number | null;
  tp2_price_intended?: number | null;
  statuses?: Partial<TradeTruthStatusSet>;
  correlation_id?: string | null;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface TradeTruthMutationContext {
  writer: TradeTruthWriter;
  correlation_id?: string | null;
  idempotency_key?: string | null;
  timestamp?: string;
  legacy_compatibility?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TradeTruthAuditEvent {
  trade_id?: string | null;
  correlation_id?: string | null;
  writer: TradeTruthWriter;
  previous_state?: TradeLifecycleState | null;
  next_state?: TradeLifecycleState | null;
  event_type: TradeTruthEventType;
  accepted: boolean;
  error_code?: string | null;
  idempotency_key?: string | null;
  timestamp: string;
  retryable: boolean;
  metadata?: Record<string, unknown>;
}

export type TradeTruthErrorCode =
  | 'missing_trade_id'
  | 'missing_provider_id'
  | 'missing_environment_id'
  | 'missing_account_id'
  | 'missing_symbol'
  | 'missing_position_side'
  | 'missing_runtime_status'
  | 'invalid_runtime_status'
  | 'invalid_position_side'
  | 'invalid_signal_direction'
  | 'invalid_exchange_order_side'
  | 'side_direction_mismatch'
  | 'invalid_lifecycle_transition'
  | 'immutable_identity_change'
  | 'protection_status_as_execution_status'
  | 'malformed_legacy_truth'
  | 'repository_error';

export interface TradeTruthError {
  code: TradeTruthErrorCode;
  message: string;
  retryable: boolean;
  trade_id?: string | null;
  current_state?: TradeLifecycleState | null;
  attempted_state?: TradeLifecycleState | null;
  writer?: TradeTruthWriter;
  details?: Record<string, unknown>;
}

export type TradeTruthResult<T> =
  | { ok: true; value: T; audit: TradeTruthAuditEvent; idempotent: boolean }
  | { ok: false; error: TradeTruthError; audit: TradeTruthAuditEvent };

export interface TradeTruthRepository {
  getByTradeId(tradeId: string): Promise<TradeTruthRecord | null>;
  getActiveByProviderAccountSymbol(providerId: string, accountId: string, symbol: string): Promise<TradeTruthRecord[]>;
  create(record: TradeTruthRecord): Promise<TradeTruthRecord>;
  updateWithVersion(record: TradeTruthRecord, expectedVersion: number): Promise<TradeTruthRecord>;
  upsertCompatibilityRecord(record: TradeTruthRecord): Promise<TradeTruthRecord>;
  appendAuditEvent(event: TradeTruthAuditEvent): Promise<void>;
}
