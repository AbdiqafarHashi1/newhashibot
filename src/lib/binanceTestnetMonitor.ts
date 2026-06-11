export const MONITOR_ACTIVE_STATUSES = [
  'pending',
  'entry_submitted',
  'entry_filled',
  'protected',
  'protected_native',
  'pending_protection',
  'protected_managed',
  'pending_managed_protection',
  'partially_closed',
] as const;

export type MonitorActiveStatus = typeof MONITOR_ACTIVE_STATUSES[number];
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED' | string;
export type Direction = 'buy' | 'sell';
export type MonitorEventType =
  | 'entry_filled'
  | 'entry_cancelled'
  | 'entry_failed'
  | 'entry_timeout_cancelled'
  | 'entry_missing_no_position'
  | 'protection_recovery_required'
  | 'native_tp1_filled'
  | 'native_tp2_filled'
  | 'native_sl_filled'
  | 'managed_tp1_closed'
  | 'managed_tp2_closed'
  | 'managed_sl_closed'
  | 'managed_timeout_closed'
  | 'unprotected_position_warning'
  | 'sl_moved_to_be'
  | 'stale_closed'
  | 'closed_synced'
  | 'manual_position_closed';

export interface MonitorEnv {
  EXECUTION_MODE?: string;
  TESTNET_ENABLED?: string | boolean;
  LIVE_TRADING_ENABLED?: string | boolean;
}

export interface ExecutionSettings {
  execution_mode?: string | null;
  testnet_enabled?: boolean | null;
  kill_switch_enabled?: boolean | null;
  live_trading_enabled?: boolean | null;
}

export interface MonitorGateResult {
  allowed: boolean;
  reason: string;
}

export interface MonitorExecutionRow {
  id: string;
  symbol: string;
  direction: Direction;
  status: string;
  bracket_mode?: string | null;
  protection_status?: string | null;
  binance_entry_order_id?: string | null;
  entry_order_id?: string | null;
  binance_sl_order_id?: string | null;
  binance_tp1_order_id?: string | null;
  binance_tp2_order_id?: string | null;
  sl_algo_id?: string | null;
  tp1_algo_id?: string | null;
  tp2_algo_id?: string | null;
  entry_price?: number | null;
  intended_sl?: number | null;
  intended_tp1?: number | null;
  intended_tp2?: number | null;
  tp1_quantity?: number | null;
  tp2_quantity?: number | null;
  remaining_quantity?: number | null;
  volume?: number | null;
  tp1_closed_at?: string | null;
  tp2_closed_at?: string | null;
  sl_closed_at?: string | null;
  sl_moved_to_be?: boolean | null;
  strategy_name?: string | null;
  timeframe?: string | null;
  created_at?: string | null;
  entry_submitted_at?: string | null;
  entry_filled_at?: string | null;
  time_stop_deadline_at?: string | null;
  opened_at?: string | null;
  expires_at?: string | null;
  max_hold_minutes?: number | null;
  expiry_reason?: string | null;
  last_monitor_checked_at?: string | null;
}

export interface BinanceOrderSnapshot {
  orderId: string;
  status: OrderStatus;
  avgPrice?: number | string | null;
  executedQty?: number | string | null;
}

export interface BinanceTruthSnapshot {
  positionAmt: number;
  openOrders: Array<{ orderId?: string; algoId?: string; reduceOnly?: boolean; type?: string; orderType?: string }>;
  markPrice?: number | null;
  unrealizedPnl?: number | null;
}

export interface MonitorUpdate {
  updates: Record<string, unknown>;
  events: Array<{ type: MonitorEventType; message: string; telegram: boolean }>;
  reduceOnlyMarketOrders: Array<{ symbol: string; side: 'BUY' | 'SELL'; quantity: number; reason: 'tp1' | 'tp2' | 'sl' | 'timeout' }>;
  cancelOrderIds: string[];
}

function boolValue(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function evaluateMonitorGates(env: MonitorEnv, settings: ExecutionSettings | null): MonitorGateResult {
  if (boolValue(env.LIVE_TRADING_ENABLED) || settings?.live_trading_enabled === true) return { allowed: false, reason: 'live_trading_enabled_abort' };
  if (String(env.EXECUTION_MODE ?? '').toLowerCase() !== 'testnet') return { allowed: false, reason: 'env_execution_mode_not_testnet' };
  if (!boolValue(env.TESTNET_ENABLED)) return { allowed: false, reason: 'env_testnet_disabled' };
  if (!settings) return { allowed: false, reason: 'execution_settings_missing' };
  if (String(settings.execution_mode ?? '').toLowerCase() !== 'testnet') return { allowed: false, reason: 'db_execution_mode_not_testnet' };
  if (settings.testnet_enabled !== true) return { allowed: false, reason: 'db_testnet_disabled' };
  if (settings.kill_switch_enabled === true) return { allowed: false, reason: 'kill_switch_enabled' };
  return { allowed: true, reason: 'allowed' };
}

export function isMonitorActiveStatus(status: string): boolean {
  return (MONITOR_ACTIVE_STATUSES as readonly string[]).includes(status);
}

function closeSide(direction: Direction): 'BUY' | 'SELL' {
  return direction === 'buy' ? 'SELL' : 'BUY';
}

function targetHit(direction: Direction, markPrice: number, target: number): boolean {
  return direction === 'buy' ? markPrice >= target : markPrice <= target;
}

function stopHit(direction: Direction, markPrice: number, stop: number): boolean {
  return direction === 'buy' ? markPrice <= stop : markPrice >= stop;
}

export function timeStopMinutes(strategyName: string | number | null | undefined, timeframe: string | null | undefined): number | null {
  if (typeof strategyName === 'number' && Number.isFinite(strategyName) && strategyName > 0) return strategyName;
  const key = `${String(strategyName ?? '').toLowerCase()}:${String(timeframe ?? '').toLowerCase()}`;
  if (key === 'microscalper:5m') return 120;
  if (key === 'microscalper:15m') return 360;
  if (key === 'compressionbreakout:15m') return 720;
  if (key === 'compressionbreakout:1h') return 48 * 60;
  if (key === 'swingcontinuation:15m') return 1440;
  if (key === 'swingcontinuation:1h') return 96 * 60;
  return null;
}

export function computeTimeStopDeadline(row: MonitorExecutionRow): string | null {
  if (row.expires_at) return row.expires_at;
  if (row.time_stop_deadline_at) return row.time_stop_deadline_at;
  const minutes = timeStopMinutes(row.max_hold_minutes ?? row.strategy_name, row.timeframe);
  const start = row.opened_at ?? row.entry_filled_at ?? row.created_at;
  const startMs = start ? new Date(start).getTime() : NaN;
  if (!minutes || !Number.isFinite(startMs)) return null;
  return new Date(startMs + minutes * 60_000).toISOString();
}

function addEvent(out: MonitorUpdate, type: MonitorEventType, message: string, telegram = true) {
  out.events.push({ type, message: `BINANCE TESTNET — NOT LIVE\n${message}`, telegram });
}

function conditionalFilled(order: BinanceOrderSnapshot | undefined): boolean {
  return ['FILLED', 'TRIGGERED', 'FINISHED'].includes(String(order?.status ?? '').toUpperCase());
}

function pushUniqueCancel(out: MonitorUpdate, ids: Array<string | number | null | undefined>): void {
  for (const id of ids) {
    const value = String(id ?? '');
    if (value && !out.cancelOrderIds.includes(value)) out.cancelOrderIds.push(value);
  }
}

function allProtectionIds(row: MonitorExecutionRow): string[] {
  return [row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id]
    .filter(Boolean)
    .map(String);
}

function rowAgeMs(row: MonitorExecutionRow): number {
  const start = row.entry_submitted_at ?? row.created_at;
  const ms = start ? new Date(start).getTime() : NaN;
  return Number.isFinite(ms) ? Date.now() - ms : 0;
}

function syncedNoPositionStatus(row: MonitorExecutionRow): 'closed_synced' | 'stale_closed' {
  return ['entry_filled', 'protected', 'protected_native', 'protected_managed', 'partially_closed', 'pending_protection', 'pending_managed_protection'].includes(row.status) ? 'closed_synced' : 'stale_closed';
}

export function processExecutionMonitorTick(
  row: MonitorExecutionRow,
  truth: BinanceTruthSnapshot,
  orderById: Record<string, BinanceOrderSnapshot | undefined>,
): MonitorUpdate {
  const out: MonitorUpdate = { updates: {}, events: [], reduceOnlyMarketOrders: [], cancelOrderIds: [] };
  const checkedAt = new Date().toISOString();
  out.updates.last_monitor_checked_at = checkedAt;
  const deadline = computeTimeStopDeadline(row);
  if (deadline) {
    out.updates.expires_at = deadline;
    out.updates.time_stop_deadline_at = deadline;
  }
  const maxHoldMinutes = row.max_hold_minutes ?? timeStopMinutes(row.strategy_name, row.timeframe);
  if (maxHoldMinutes) out.updates.max_hold_minutes = maxHoldMinutes;
  const hasPosition = Math.abs(truth.positionAmt) > 0;
  const hasOpenOrders = truth.openOrders.length > 0;

  if (deadline && Date.now() >= new Date(deadline).getTime() && isMonitorActiveStatus(row.status)) {
    const remaining = row.remaining_quantity ?? row.volume ?? Math.abs(truth.positionAmt);
    pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
    pushUniqueCancel(out, allProtectionIds(row));
    if (hasPosition && remaining > 0) out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'timeout' });
    out.updates.status = 'closed_timeout';
    out.updates.remaining_quantity = 0;
    out.updates.expiry_reason = row.expiry_reason ?? 'strategy_time_stop_expired';
    out.updates.last_monitor_action = 'timeout_closed';
    addEvent(out, 'managed_timeout_closed', `${row.symbol} time-stop expired; remaining TP/SL orders should be cancelled and remaining position closed reduce-only.`);
    return out;
  }

  const entryOrderId = row.binance_entry_order_id ?? row.entry_order_id;
  const entryOrder = entryOrderId ? orderById[entryOrderId] : undefined;
  const entryOrderStatus = String(entryOrder?.status ?? '').toUpperCase();

  if (['pending', 'entry_submitted'].includes(row.status)) {
    if (entryOrderStatus === 'FILLED' || hasPosition) {
      const avgPrice = num(entryOrder?.avgPrice) ?? truth.markPrice ?? row.entry_price;
      const qty = Math.abs(truth.positionAmt) || num(entryOrder?.executedQty) || row.volume || row.remaining_quantity || 0;
      out.updates.status = 'entry_filled';
      out.updates.entry_filled_at = checkedAt;
      out.updates.protection_status = 'pending_protection';
      out.updates.remaining_quantity = qty;
      out.updates.last_monitor_action = 'entry_filled_submit_protection';
      if (avgPrice && avgPrice > 0) out.updates.entry_price = avgPrice;
      addEvent(out, 'entry_filled', `${row.symbol} entry filled${avgPrice ? ` at ${avgPrice}` : ''}; protection must be submitted immediately.`);
      return out;
    }
    if (row.status === 'entry_submitted' && rowAgeMs(row) >= 2 * 60_000) {
      if (entryOrderId && (!entryOrder || ['NEW', 'PARTIALLY_FILLED'].includes(entryOrderStatus))) out.cancelOrderIds.push(String(entryOrderId));
      out.updates.status = 'entry_timeout_cancelled';
      out.updates.protection_status = 'unprotected';
      out.updates.native_protection_verified = false;
      out.updates.managed_fallback_active = false;
      out.updates.remaining_quantity = 0;
      out.updates.stale_cleanup_reason = 'entry_submitted_timeout_no_fill';
      out.updates.last_monitor_action = 'entry_timeout_cancelled';
      addEvent(out, 'entry_timeout_cancelled', `${row.symbol} entry was not filled within 2 minutes; entry order should be cancelled.`);
      return out;
    }
    if (!entryOrder && !hasPosition) {
      out.updates.status = 'entry_missing_no_position';
      out.updates.protection_status = 'unprotected';
      out.updates.native_protection_verified = false;
      out.updates.managed_fallback_active = false;
      out.updates.remaining_quantity = 0;
      out.updates.stale_cleanup_reason = 'entry_order_not_found_no_position';
      out.updates.last_monitor_action = 'entry_missing_no_position';
      addEvent(out, 'entry_missing_no_position', `${row.symbol} entry order is missing and Binance has no position.`);
      return out;
    }
  }

  if (isMonitorActiveStatus(row.status) && !hasPosition && !hasOpenOrders) {
    const syncedStatus = syncedNoPositionStatus(row);
    out.updates = { ...out.updates, status: syncedStatus, protection_status: 'unprotected', native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, stale_cleanup_reason: 'binance_truth_no_position_no_orders', stale_checked_at: new Date().toISOString(), last_monitor_action: syncedStatus };
    addEvent(out, syncedStatus, `${row.symbol} synced closed because Binance has no position and no open orders.`);
    return out;
  }


  if (hasPosition && !['protected', 'protected_native', 'protected_managed'].includes(String(row.protection_status ?? '')) && ['entry_filled', 'protected', 'protected_native', 'protected_managed', 'partially_closed'].includes(row.status)) {
    out.updates.protection_status = 'protected_managed';
    out.updates.bracket_mode = 'managed_exit_fallback';
    out.updates.managed_fallback_active = true;
    out.updates.native_protection_verified = false;
    out.updates.last_monitor_action = 'protection_recovery_required';
    addEvent(out, 'protection_recovery_required', `${row.symbol} has an unsafe_untracked_position: Binance has an open position without verified protection; monitor must retry native protection or activate managed fallback immediately.`);
  }

  if (entryOrder && ['CANCELED', 'EXPIRED'].includes(entryOrderStatus) && ['pending', 'entry_submitted'].includes(row.status)) {
    out.updates.status = 'cancelled';
    addEvent(out, 'entry_cancelled', `${row.symbol} entry order ${entryOrder.status.toLowerCase()}.`);
    return out;
  }
  if (entryOrderStatus === 'REJECTED' && ['pending', 'entry_submitted'].includes(row.status)) {
    out.updates.status = 'failed';
    addEvent(out, 'entry_failed', `${row.symbol} entry order rejected.`);
    return out;
  }

  if (row.bracket_mode === 'exchange_native') {
    let nativeChanged = false;
    const tp1Id = row.tp1_algo_id ?? row.binance_tp1_order_id;
    const tp2Id = row.tp2_algo_id ?? row.binance_tp2_order_id;
    const slId = row.sl_algo_id ?? row.binance_sl_order_id;
    const tp1 = tp1Id ? orderById[tp1Id] : undefined;
    const tp2 = tp2Id ? orderById[tp2Id] : undefined;
    const sl = slId ? orderById[slId] : undefined;
    if (!row.tp1_closed_at && conditionalFilled(tp1)) {
      out.updates.status = 'partially_closed';
      out.updates.tp1_closed_at = new Date().toISOString();
      out.updates.sl_moved_to_be = true;
      addEvent(out, 'native_tp1_filled', `${row.symbol} TP1 filled; position partially closed.`);
      addEvent(out, 'sl_moved_to_be', `${row.symbol} SL moved/confirmed at break-even for remaining quantity.`);
      nativeChanged = true;
    }
    if (!row.tp2_closed_at && conditionalFilled(tp2)) {
      out.updates.status = 'closed_tp';
      out.updates.tp2_closed_at = new Date().toISOString();
      pushUniqueCancel(out, [slId, tp1Id]);
      addEvent(out, 'native_tp2_filled', `${row.symbol} TP2 filled; position closed in profit. Remaining TP/SL conditionals queued for cleanup verification.`);
      nativeChanged = true;
    }
    if (!row.sl_closed_at && conditionalFilled(sl)) {
      out.updates.status = 'closed_sl';
      out.updates.sl_closed_at = new Date().toISOString();
      pushUniqueCancel(out, [tp1Id, tp2Id]);
      addEvent(out, 'native_sl_filled', `${row.symbol} SL filled; position closed. Remaining TP conditionals queued for cleanup verification.`);
      nativeChanged = true;
    }
    if (nativeChanged) return out;
  }

  if (row.bracket_mode === 'managed_exit_fallback' || row.protection_status === 'protected_managed') {
    const mark = truth.markPrice;
    if (!mark || mark <= 0) return out;
    const entry = row.entry_price;
    const intendedSl = row.intended_sl;
    const intendedTp1 = row.intended_tp1;
    const intendedTp2 = row.intended_tp2;
    const remaining = row.remaining_quantity ?? row.volume ?? Math.abs(truth.positionAmt);
    const half = row.tp1_quantity ?? (row.volume ? row.volume / 2 : Math.abs(truth.positionAmt) / 2);
    const activeStop = row.sl_moved_to_be && entry ? entry : intendedSl;


    if (!row.tp1_closed_at && intendedTp1 && targetHit(row.direction, mark, intendedTp1)) {
      const qty = Math.min(half, remaining);
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: qty, reason: 'tp1' });
      out.updates.status = 'partially_closed';
      out.updates.tp1_closed_at = new Date().toISOString();
      out.updates.remaining_quantity = Math.max(remaining - qty, 0);
      out.updates.sl_moved_to_be = true;
      addEvent(out, 'managed_tp1_closed', `${row.symbol} managed TP1 hit; reduce-only market closed 50%.`);
      addEvent(out, 'sl_moved_to_be', `${row.symbol} managed SL moved to break-even after TP1.`);
      return out;
    }
    if (intendedTp2 && targetHit(row.direction, mark, intendedTp2)) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'tp2' });
      out.updates.status = 'closed_tp';
      out.updates.tp2_closed_at = new Date().toISOString();
      out.updates.remaining_quantity = 0;
      pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
      pushUniqueCancel(out, allProtectionIds(row));
      addEvent(out, 'managed_tp2_closed', `${row.symbol} managed TP2 hit; remaining quantity closed; remaining conditionals queued for cleanup verification.`);
      return out;
    }
    if (activeStop && stopHit(row.direction, mark, activeStop)) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'sl' });
      out.updates.status = 'closed_sl';
      out.updates.sl_closed_at = new Date().toISOString();
      out.updates.remaining_quantity = 0;
      pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
      pushUniqueCancel(out, allProtectionIds(row));
      addEvent(out, 'managed_sl_closed', `${row.symbol} managed SL hit; remaining quantity closed; remaining conditionals queued for cleanup verification.`);
      return out;
    }
  }

  if (isMonitorActiveStatus(row.status) && !hasPosition && hasOpenOrders) {
    addEvent(out, 'manual_position_closed', `${row.symbol} position is closed on Binance; stale leftover orders should be cancelled.`);
    pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
    const syncedStatus = syncedNoPositionStatus(row);
    out.updates.status = syncedStatus;
    out.updates.protection_status = 'unprotected';
    out.updates.native_protection_verified = false;
    out.updates.managed_fallback_active = false;
    out.updates.remaining_quantity = 0;
    out.updates.stale_cleanup_reason = 'position_closed_leftover_orders_cancelled';
    out.updates.last_monitor_action = 'orphan_protection_orders_cancelled';
    out.updates.stale_checked_at = new Date().toISOString();
    return out;
    return out;
  }


  return out;
}
