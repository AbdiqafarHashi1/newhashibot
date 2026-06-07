export const ACTIVE_EXECUTION_STATUSES = [
  'pending',
  'entry_submitted',
  'entry_filled',
  'protected',
  'pending_protection',
  'partially_closed',
  'protected_managed',
  'pending_managed_protection',
] as const;

export const RETRYABLE_EXECUTION_STATUSES = [
  'skipped',
  'failed',
  'cancelled',
  'stale_closed',
  'closed_tp',
  'closed_sl',
  'closed_breakeven',
] as const;

export type ActiveExecutionStatus = typeof ACTIVE_EXECUTION_STATUSES[number];
export type RetryableExecutionStatus = typeof RETRYABLE_EXECUTION_STATUSES[number];
export type ExecutionStatus = ActiveExecutionStatus | RetryableExecutionStatus | string;
export type Direction = 'buy' | 'sell';
export type BracketMode = 'exchange_native' | 'managed_exit_fallback';
export type ProtectionStatus = 'unprotected' | 'pending_protection' | 'protected' | 'protected_managed' | 'pending_managed_protection' | 'unprotected_failed';

export interface BinanceTruthState {
  symbol: string;
  positionSize: number;
  openOrders: BinanceOpenOrder[];
}

export interface BinanceOpenOrder {
  orderId: string;
  symbol: string;
  type?: string;
  status?: string;
  reduceOnly?: boolean;
  closePosition?: boolean;
}

export interface ExecutionRow {
  id: string;
  signal_id?: string | null;
  symbol: string;
  status: ExecutionStatus;
  latest_auto_skip_reason?: string | null;
}

export interface DuplicateDecision {
  block: boolean;
  reason: 'active_duplicate_signal' | 'retryable_signal_row' | 'no_existing_execution';
  blockingRow?: ExecutionRow;
}

export interface SymbolBlockDecision {
  block: boolean;
  reason: 'binance_active_position' | 'binance_open_orders' | 'db_stale_cleaned' | 'no_active_symbol_exposure';
  staleRowIds: string[];
}

export interface SignalExecutionInput {
  testnetModeEnabled: boolean;
  executionAllowed: boolean;
  killSwitchOff: boolean;
  binanceTruth: BinanceTruthState;
  riskSizeValid: boolean;
  liveTrading: boolean;
}

export interface EntryFill {
  symbol: string;
  direction: Direction;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
}

export interface NativeOrderResult {
  orderId: string;
}

export interface NativeProtectionClient {
  placeReduceOnlyStop(input: EntryFill & { quantity: number }): Promise<NativeOrderResult>;
  placeReduceOnlyTakeProfit(input: EntryFill & { quantity: number; targetPrice: number; label: 'tp1' | 'tp2' }): Promise<NativeOrderResult>;
}

export interface ProtectionPlan {
  protection_status: ProtectionStatus;
  bracket_mode: BracketMode;
  sl_order_id?: string;
  tp1_order_id?: string;
  tp2_order_id?: string;
  intended_sl: number;
  intended_tp1: number;
  intended_tp2: number;
  tp1_quantity: number;
  tp2_quantity: number;
  sl_moved_to_be: boolean;
  error_message?: string;
}

export interface ManagedPositionState extends EntryFill {
  remainingQuantity: number;
  tp1Closed: boolean;
  slMovedToBreakEven: boolean;
}

export interface ManagedExitClient {
  closeReduceOnlyMarket(symbol: string, direction: Direction, quantity: number, reason: 'tp1' | 'tp2' | 'sl'): Promise<{ orderId: string }>;
}

export interface ManagedExitEvent {
  action: 'none' | 'tp1_closed' | 'tp2_closed' | 'sl_closed';
  closedQuantity: number;
  remainingQuantity: number;
  slMovedToBreakEven: boolean;
  orderId?: string;
}

export function isActiveExecutionStatus(status: ExecutionStatus): status is ActiveExecutionStatus {
  return (ACTIVE_EXECUTION_STATUSES as readonly string[]).includes(status);
}

export function isRetryableExecutionStatus(status: ExecutionStatus): boolean {
  return (RETRYABLE_EXECUTION_STATUSES as readonly string[]).includes(status);
}

export function shouldBlockDuplicateSignal(existingRows: ExecutionRow[]): DuplicateDecision {
  const active = existingRows.find((row) => isActiveExecutionStatus(row.status));
  if (active) return { block: true, reason: 'active_duplicate_signal', blockingRow: active };
  if (existingRows.length > 0) return { block: false, reason: 'retryable_signal_row' };
  return { block: false, reason: 'no_existing_execution' };
}

export function shouldBlockDuplicateSignalWithTruth(existingRows: ExecutionRow[], binanceTruth: BinanceTruthState): DuplicateDecision & { staleRowIds: string[] } {
  const active = existingRows.find((row) => isActiveExecutionStatus(row.status));
  if (!active) {
    const decision = shouldBlockDuplicateSignal(existingRows);
    return { ...decision, staleRowIds: [] };
  }
  if (Math.abs(binanceTruth.positionSize) > 0 || binanceTruth.openOrders.length > 0) {
    return { block: true, reason: 'active_duplicate_signal', blockingRow: active, staleRowIds: [] };
  }
  return { block: false, reason: 'retryable_signal_row', staleRowIds: existingRows.filter((row) => isActiveExecutionStatus(row.status)).map((row) => row.id) };
}

export function decideSameSymbolBlock(rows: ExecutionRow[], binanceTruth: BinanceTruthState): SymbolBlockDecision {
  const activeRows = rows.filter((row) => isActiveExecutionStatus(row.status));
  const staleRowIds = activeRows.map((row) => row.id);
  if (Math.abs(binanceTruth.positionSize) > 0) {
    return { block: true, reason: 'binance_active_position', staleRowIds: [] };
  }
  if (binanceTruth.openOrders.length > 0) {
    return { block: true, reason: 'binance_open_orders', staleRowIds: [] };
  }
  if (staleRowIds.length > 0) {
    return { block: false, reason: 'db_stale_cleaned', staleRowIds };
  }
  return { block: false, reason: 'no_active_symbol_exposure', staleRowIds: [] };
}

export function canExecuteFreshSignal(input: SignalExecutionInput): { allowed: boolean; reason: string } {
  if (input.liveTrading) return { allowed: false, reason: 'live_trading_forbidden' };
  if (!input.testnetModeEnabled) return { allowed: false, reason: 'testnet_disabled' };
  if (!input.executionAllowed) return { allowed: false, reason: 'execution_not_allowed' };
  if (!input.killSwitchOff) return { allowed: false, reason: 'kill_switch_on' };
  if (!input.riskSizeValid) return { allowed: false, reason: 'invalid_risk_size' };
  if (Math.abs(input.binanceTruth.positionSize) > 0 || input.binanceTruth.openOrders.length > 0) {
    return { allowed: false, reason: 'binance_active_symbol_exposure' };
  }
  return { allowed: true, reason: 'allowed' };
}

function splitHalf(quantity: number): { firstHalf: number; secondHalf: number } {
  const firstHalf = quantity / 2;
  return { firstHalf, secondHalf: quantity - firstHalf };
}

export async function createProtectionPlan(fill: EntryFill, client: NativeProtectionClient): Promise<ProtectionPlan> {
  const { firstHalf, secondHalf } = splitHalf(fill.quantity);
  try {
    const [sl, tp1, tp2] = await Promise.all([
      client.placeReduceOnlyStop({ ...fill, quantity: fill.quantity }),
      client.placeReduceOnlyTakeProfit({ ...fill, quantity: firstHalf, targetPrice: fill.tp1, label: 'tp1' }),
      client.placeReduceOnlyTakeProfit({ ...fill, quantity: secondHalf, targetPrice: fill.tp2, label: 'tp2' }),
    ]);
    return {
      protection_status: 'protected',
      bracket_mode: 'exchange_native',
      sl_order_id: sl.orderId,
      tp1_order_id: tp1.orderId,
      tp2_order_id: tp2.orderId,
      intended_sl: fill.stopLoss,
      intended_tp1: fill.tp1,
      intended_tp2: fill.tp2,
      tp1_quantity: firstHalf,
      tp2_quantity: secondHalf,
      sl_moved_to_be: false,
    };
  } catch (err) {
    return {
      protection_status: 'protected_managed',
      bracket_mode: 'managed_exit_fallback',
      intended_sl: fill.stopLoss,
      intended_tp1: fill.tp1,
      intended_tp2: fill.tp2,
      tp1_quantity: firstHalf,
      tp2_quantity: secondHalf,
      sl_moved_to_be: false,
      error_message: err instanceof Error ? err.message : 'Native protection rejected',
    };
  }
}

function targetHit(direction: Direction, markPrice: number, target: number): boolean {
  return direction === 'buy' ? markPrice >= target : markPrice <= target;
}

function stopHit(direction: Direction, markPrice: number, stop: number): boolean {
  return direction === 'buy' ? markPrice <= stop : markPrice >= stop;
}

export async function evaluateManagedExit(state: ManagedPositionState, markPrice: number, client: ManagedExitClient): Promise<ManagedExitEvent> {
  if (state.remainingQuantity <= 0) {
    return { action: 'none', closedQuantity: 0, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven };
  }
  const activeStop = state.slMovedToBreakEven ? state.entryPrice : state.stopLoss;
  if (!state.tp1Closed && targetHit(state.direction, markPrice, state.tp1)) {
    const closeQuantity = Math.min(state.quantity / 2, state.remainingQuantity);
    const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'tp1');
    return {
      action: 'tp1_closed',
      closedQuantity: closeQuantity,
      remainingQuantity: state.remainingQuantity - closeQuantity,
      slMovedToBreakEven: true,
      orderId: result.orderId,
    };
  }
  if (targetHit(state.direction, markPrice, state.tp2)) {
    const closeQuantity = state.remainingQuantity;
    const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'tp2');
    return { action: 'tp2_closed', closedQuantity: closeQuantity, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven, orderId: result.orderId };
  }
  if (stopHit(state.direction, markPrice, activeStop)) {
    const closeQuantity = state.remainingQuantity;
    const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'sl');
    return { action: 'sl_closed', closedQuantity: closeQuantity, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven, orderId: result.orderId };
  }
  return { action: 'none', closedQuantity: 0, remainingQuantity: state.remainingQuantity, slMovedToBreakEven: state.slMovedToBreakEven };
}
