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
  'closed_timeout',
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
  side?: 'BUY' | 'SELL' | string;
  stopPrice?: number | string;
  price?: number | string;
  origQty?: number | string;
  workingType?: string;
  positionSide?: string;
}

export interface NativeConditionalOrderIntent {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity: number;
  stopPrice: number;
  reduceOnly: true;
  workingType: 'MARK_PRICE';
  closePosition?: false;
  timeInForce?: never;
  price?: never;
}

export interface NativeProtectionVerificationResult {
  verified: boolean;
  missingLabels: Array<'sl' | 'tp1' | 'tp2'>;
  errors: string[];
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

export function splitTp1Tp2Quantities(quantity: number, stepSize = 0): { tp1Quantity: number; tp2Quantity: number } {
  if (!Number.isFinite(quantity) || quantity <= 0) return { tp1Quantity: 0, tp2Quantity: 0 };
  const rawHalf = quantity / 2;
  const tp1Quantity = stepSize > 0 ? Math.floor((rawHalf / stepSize) + 1e-12) * stepSize : rawHalf;
  return { tp1Quantity, tp2Quantity: Math.max(quantity - tp1Quantity, 0) };
}

function splitHalf(quantity: number): { firstHalf: number; secondHalf: number } {
  const { tp1Quantity, tp2Quantity } = splitTp1Tp2Quantities(quantity);
  return { firstHalf: tp1Quantity, secondHalf: tp2Quantity };
}

export function closeSideForDirection(direction: Direction): 'BUY' | 'SELL' {
  return direction === 'buy' ? 'SELL' : 'BUY';
}

export function buildNativeConditionalOrder(input: EntryFill & { quantity: number; label: 'sl' | 'tp1' | 'tp2'; targetPrice?: number }): NativeConditionalOrderIntent {
  const isStop = input.label === 'sl';
  return {
    symbol: input.symbol,
    side: closeSideForDirection(input.direction),
    type: isStop ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET',
    quantity: input.quantity,
    stopPrice: isStop ? input.stopLoss : Number(input.targetPrice),
    reduceOnly: true,
    workingType: 'MARK_PRICE',
    closePosition: false,
  };
}

function orderMatches(order: BinanceOpenOrder | undefined, expected: NativeConditionalOrderIntent): string | null {
  if (!order) return 'missing';
  if (order.side && String(order.side).toUpperCase() !== expected.side) return 'wrong_side';
  if (order.type && String(order.type).toUpperCase() !== expected.type) return 'wrong_type';
  if (order.reduceOnly === false) return 'not_reduce_only';
  if (order.closePosition === true) return 'unexpected_close_position';
  const stop = Number(order.stopPrice);
  if (Number.isFinite(stop) && Math.abs(stop - expected.stopPrice) > Math.max(Math.abs(expected.stopPrice) * 0.000001, 1e-8)) return 'wrong_stop_price';
  const qty = Number(order.origQty);
  if (Number.isFinite(qty) && Math.abs(qty - expected.quantity) > Math.max(expected.quantity * 0.000001, 1e-8)) return 'wrong_quantity';
  return null;
}

export function verifyNativeProtectionOpenOrders(
  fill: EntryFill,
  orderIds: { sl: string; tp1: string; tp2: string },
  openOrders: BinanceOpenOrder[],
): NativeProtectionVerificationResult {
  const { tp1Quantity, tp2Quantity } = splitTp1Tp2Quantities(fill.quantity);
  const intents = {
    sl: buildNativeConditionalOrder({ ...fill, label: 'sl', quantity: fill.quantity }),
    tp1: buildNativeConditionalOrder({ ...fill, label: 'tp1', quantity: tp1Quantity, targetPrice: fill.tp1 }),
    tp2: buildNativeConditionalOrder({ ...fill, label: 'tp2', quantity: tp2Quantity, targetPrice: fill.tp2 }),
  } as const;
  const missingLabels: Array<'sl' | 'tp1' | 'tp2'> = [];
  const errors: string[] = [];
  (['sl', 'tp1', 'tp2'] as const).forEach((label) => {
    const order = openOrders.find((row) => String(row.orderId) === String(orderIds[label]));
    const mismatch = orderMatches(order, intents[label]);
    if (mismatch) {
      missingLabels.push(label);
      errors.push(`${label}:${mismatch}`);
    }
  });
  return { verified: missingLabels.length === 0, missingLabels, errors };
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

export function timeStopMinutes(strategyName: string | null | undefined, timeframe: string | null | undefined): number | null {
  const key = `${String(strategyName ?? '').toLowerCase()}:${String(timeframe ?? '').toLowerCase()}`;
  if (key === 'microscalper:5m') return 120;
  if (key === 'microscalper:15m') return 360;
  if (key === 'compressionbreakout:15m') return 720;
  if (key === 'compressionbreakout:1h') return 48 * 60;
  if (key === 'swingcontinuation:15m') return 1440;
  if (key === 'swingcontinuation:1h') return 96 * 60;
  return null;
}

export function timeStopDeadline(openedAt: string | null | undefined, strategyName: string | null | undefined, timeframe: string | null | undefined): string | null {
  const minutes = timeStopMinutes(strategyName, timeframe);
  const start = openedAt ? new Date(openedAt).getTime() : NaN;
  if (!minutes || !Number.isFinite(start)) return null;
  return new Date(start + minutes * 60_000).toISOString();
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

export type SelectedSignalValidationError = 'missing_signal_id' | 'signal_not_found' | 'invalid_selected_signal' | 'stale_signal_not_executable';

export interface SelectedSignalLike {
  id?: string | null;
  symbol?: string | null;
  market_type?: string | null;
  direction?: Direction | string | null;
  status?: string | null;
}

export function validateSelectedSignalForExecution(signalId: string | null | undefined, signal: SelectedSignalLike | null | undefined): { ok: true; signal_id: string } | { ok: false; error: SelectedSignalValidationError } {
  const id = typeof signalId === 'string' ? signalId.trim() : '';
  if (!id) return { ok: false, error: 'missing_signal_id' };
  if (!signal) return { ok: false, error: 'signal_not_found' };
  if (signal.id !== id) return { ok: false, error: 'invalid_selected_signal' };
  if (signal.market_type !== 'crypto' || !signal.symbol || !signal.direction) return { ok: false, error: 'stale_signal_not_executable' };
  return { ok: true, signal_id: id };
}

export interface GovernorVisibilityInput {
  state: string;
  reason: string;
  lastCheckedAt?: string | null;
  killSwitchEnabled?: boolean;
}

export function governorPausedVisibility(input: GovernorVisibilityInput): { error: 'governor_paused'; governor_state: string; governor_reason: string; last_governor_checked_at: string | null; execution_allowed: false; admin_action_needed: string } {
  return {
    error: 'governor_paused',
    governor_state: input.state,
    governor_reason: input.reason,
    last_governor_checked_at: input.lastCheckedAt ?? null,
    execution_allowed: false,
    admin_action_needed: input.killSwitchEnabled
      ? 'Turn off the execution kill switch after reviewing account state; the bot will not unpause automatically.'
      : 'Review governor thresholds, account PnL, failed execution streaks, and risk settings; the bot will not unpause automatically.',
  };
}

export interface E2EProtectionProofInput {
  entryOrderId?: string | null;
  positionSize: number;
  bracketMode?: string | null;
  protectionStatus?: string | null;
  slOrderId?: string | null;
  tp1OrderId?: string | null;
  tp2OrderId?: string | null;
  latestProtectionError?: string | null;
  monitorReady?: boolean;
}

export function buildE2EProtectionProof(input: E2EProtectionProofInput) {
  const native = input.bracketMode === 'exchange_native';
  const managed = input.bracketMode === 'managed_exit_fallback' && input.protectionStatus === 'protected_managed';
  return {
    entry_submitted: Boolean(input.entryOrderId),
    position_detected: Math.abs(input.positionSize) > 0,
    native_sl_order_detected: native && Boolean(input.slOrderId),
    native_tp1_order_detected: native && Boolean(input.tp1OrderId),
    native_tp2_order_detected: native && Boolean(input.tp2OrderId),
    bracket_mode: input.bracketMode ?? null,
    protection_status: input.protectionStatus ?? null,
    latest_protection_error: input.latestProtectionError ?? null,
    managed_fallback_active: managed,
    monitor_ready: Boolean(input.monitorReady || managed || input.protectionStatus === 'protected'),
  };
}
