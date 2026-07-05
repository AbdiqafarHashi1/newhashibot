import type { ExchangeProviderId, ExchangeSide, ProviderResult } from './exchange-provider.js';
import type { TradeManagementTruthRow } from './trade-management-core.js';

export type TradeLifecycleState = 'signal_approved'|'execution_planned'|'command_queued'|'command_executing'|'exchange_accepted'|'position_open'|'protected'|'tp1'|'break_even'|'tp2'|'closed'|'failed';
export type VerificationStatus = 'pending'|'acknowledged'|'verified'|'mismatch'|'failed';
export type ArchiveReason = 'closed'|'expired'|'operator'|'reconciled';

export interface TradeTruthRecord extends TradeManagementTruthRow {
  trade_id: string;
  customer_id: string | null;
  lifecycle_state: TradeLifecycleState;
  status: 'active'|'closed'|'failed'|'archived';
  expected_sl: number | null; expected_tp1: number | null; expected_tp2: number | null; expected_quantity: number | null;
  actual_sl: number | null; actual_tp1: number | null; actual_tp2: number | null; actual_quantity: number | null;
  protection_verified: boolean; protection_missing: boolean;
  repair_running: boolean; repair_completed: boolean; repair_failed: boolean;
  last_verification_at: string | null; last_exchange_sync_at: string | null;
  exchange_acknowledgement: Record<string, unknown> | null;
  exchange_order_id: string | null; client_order_id: string | null; position_id: string | null;
  execution_latency_ms: number | null; verification_status: VerificationStatus; verification_attempts: number; verification_result: Record<string, unknown> | null;
  archived_at: string | null; archive_reason: ArchiveReason | null;
  metadata: Record<string, unknown>;
  created_at?: string; updated_at?: string;
}

export type TradeTruthCreate = Omit<TradeTruthRecord, 'created_at'|'updated_at'>;
export type TradeTruthPatch = Partial<Omit<TradeTruthRecord, 'trade_id'|'created_at'|'updated_at'>>;
export type TradeTruthQuery = { provider?: ExchangeProviderId; customerId?: string; symbol?: string; positionId?: string; includeArchived?: boolean };

export interface TradeTruthRepository {
  createTradeTruth(record: TradeTruthCreate): Promise<TradeTruthRecord>;
  updateExecutionState(tradeId: string, patch: Pick<TradeTruthPatch, 'lifecycle_state'|'status'|'exchange_acknowledgement'|'exchange_order_id'|'client_order_id'|'position_id'|'execution_latency_ms'|'latest_error'|'metadata'>): Promise<TradeTruthRecord>;
  updateProtectionState(tradeId: string, patch: Pick<TradeTruthPatch, 'expected_sl'|'expected_tp1'|'expected_tp2'|'expected_quantity'|'actual_sl'|'actual_tp1'|'actual_tp2'|'actual_quantity'|'protection_verified'|'protection_missing'|'repair_running'|'repair_completed'|'repair_failed'|'last_verification_at'|'last_exchange_sync_at'|'protection_status'|'sl_present'|'tp1_present'|'tp2_present'|'sl_order_id'|'tp1_order_id'|'tp2_order_id'|'latest_error'>): Promise<TradeTruthRecord>;
  updatePositionState(tradeId: string, patch: Pick<TradeTruthPatch, 'qty'|'entry_price'|'mark_price'|'unrealized_pnl'|'exchange_position_id'|'position_id'|'actual_quantity'|'status'|'lifecycle_state'>): Promise<TradeTruthRecord>;
  updateRecoveryState(tradeId: string, patch: Pick<TradeTruthPatch, 'recovery_status'|'repair_running'|'repair_completed'|'repair_failed'|'latest_error'|'last_action_taken'>): Promise<TradeTruthRecord>;
  updateVerificationState(tradeId: string, patch: Pick<TradeTruthPatch, 'verification_status'|'verification_attempts'|'verification_result'|'last_verification_at'|'exchange_acknowledgement'>): Promise<TradeTruthRecord>;
  readByTradeId(tradeId: string): Promise<TradeTruthRecord | null>;
  readByProvider(provider: ExchangeProviderId): Promise<TradeTruthRecord[]>;
  readByCustomer(customerId: string): Promise<TradeTruthRecord[]>;
  readBySymbol(symbol: string): Promise<TradeTruthRecord[]>;
  readByPositionId(positionId: string): Promise<TradeTruthRecord[]>;
  readActiveTrades(query?: TradeTruthQuery): Promise<TradeTruthRecord[]>;
  readOrphanTrades(): Promise<TradeTruthRecord[]>;
  readUnprotectedTrades(): Promise<TradeTruthRecord[]>;
  readFailedTrades(): Promise<TradeTruthRecord[]>;
  archiveClosedTrades(before?: string): Promise<number>;
  findForReconciliation(query: { tradeId?: string; exchangeOrderId?: string; clientOrderId?: string; provider?: ExchangeProviderId; customerId?: string; positionId?: string; symbol?: string }): Promise<TradeTruthRecord[]>;
}

export function tradeTruthFromManagementRow(row: TradeManagementTruthRow, tradeId: string, customerId: string | null = null): TradeTruthCreate {
  const protectedNow = row.protection_status === 'protected';
  return { ...row, trade_id: tradeId, customer_id: customerId, lifecycle_state: protectedNow ? 'protected' : 'position_open', status: row.protection_status === 'closed' ? 'closed' : 'active', expected_sl:null, expected_tp1:null, expected_tp2:null, expected_quantity:row.qty, actual_sl:null, actual_tp1:null, actual_tp2:null, actual_quantity:row.qty, protection_verified: protectedNow, protection_missing: !protectedNow, repair_running:false, repair_completed:false, repair_failed:false, last_verification_at:null, last_exchange_sync_at: row.latest_sync_at, exchange_acknowledgement:null, exchange_order_id:row.entry_order_id, client_order_id:null, position_id:row.exchange_position_id, execution_latency_ms:null, verification_status:'pending', verification_attempts:0, verification_result:null, archived_at:null, archive_reason:null, metadata:{} };
}

export function lifecycleEventPatch(state: TradeLifecycleState, result?: ProviderResult): TradeTruthPatch {
  const failed = state === 'failed' || result?.ok === false;
  return { lifecycle_state: failed ? 'failed' : state, status: failed ? 'failed' : state === 'closed' ? 'closed' : 'active', exchange_order_id: result?.providerOrderId ?? null, position_id: result?.providerPositionId ?? null, exchange_acknowledgement: result?.metadata ?? null, latest_error: result?.error ?? null };
}
