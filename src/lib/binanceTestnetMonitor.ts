export const MONITOR_ACTIVE_STATUSES = [
  'pending',
  'entry_submitted',
  'entry_filled',
  'protected',
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
  binance_sl_order_id?: string | null;
  binance_tp1_order_id?: string | null;
  binance_tp2_order_id?: string | null;
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
  entry_filled_at?: string | null;
  time_stop_deadline_at?: string | null;
}

export interface BinanceOrderSnapshot {
  orderId: string;
  status: OrderStatus;
  avgPrice?: number | string | null;
  executedQty?: number | string | null;
}

export interface BinanceTruthSnapshot {
  positionAmt: number;
  openOrders: Array<{ orderId: string; reduceOnly?: boolean; type?: string }>;
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

export function computeTimeStopDeadline(row: MonitorExecutionRow): string | null {
  if (row.time_stop_deadline_at) return row.time_stop_deadline_at;
  const minutes = timeStopMinutes(row.strategy_name, row.timeframe);
  const start = row.entry_filled_at ?? row.created_at;
  const startMs = start ? new Date(start).getTime() : NaN;
  if (!minutes || !Number.isFinite(startMs)) return null;
  return new Date(startMs + minutes * 60_000).toISOString();
}

function addEvent(out: MonitorUpdate, type: MonitorEventType, message: string, telegram = true) {
  out.events.push({ type, message: `BINANCE TESTNET — NOT LIVE\n${message}`, telegram });
}

export function processExecutionMonitorTick(
  row: MonitorExecutionRow,
  truth: BinanceTruthSnapshot,
  orderById: Record<string, BinanceOrderSnapshot | undefined>,
): MonitorUpdate {
  const out: MonitorUpdate = { updates: {}, events: [], reduceOnlyMarketOrders: [], cancelOrderIds: [] };
  const hasPosition = Math.abs(truth.positionAmt) > 0;
  const hasOpenOrders = truth.openOrders.length > 0;

  if (isMonitorActiveStatus(row.status) && !hasPosition && !hasOpenOrders) {
    out.updates = { status: 'stale_closed', stale_cleanup_reason: 'binance_truth_no_position_no_orders', stale_checked_at: new Date().toISOString() };
    addEvent(out, 'stale_closed', `${row.symbol} stale DB execution cleaned because Binance has no position and no open orders.`);
    return out;
  }

  if (hasPosition && !['protected', 'protected_managed'].includes(String(row.protection_status ?? '')) && ['entry_filled', 'protected', 'protected_managed', 'partially_closed'].includes(row.status)) {
    out.updates.protection_status = 'unprotected_failed';
    out.updates.latest_protection_error = 'open Binance position is not protected_native or protected_managed';
    addEvent(out, 'unprotected_position_warning', `${row.symbol} has an open Binance position without verified native or managed protection.`);
  }

  const entryOrder = row.binance_entry_order_id ? orderById[row.binance_entry_order_id] : undefined;
  if (entryOrder?.status === 'FILLED' && ['pending', 'entry_submitted'].includes(row.status)) {
    const avgPrice = num(entryOrder.avgPrice);
    out.updates.status = row.protection_status === 'protected' || row.protection_status === 'protected_managed' ? row.status : 'entry_filled';
    if (avgPrice && avgPrice > 0) out.updates.entry_price = avgPrice;
    addEvent(out, 'entry_filled', `${row.symbol} entry filled${avgPrice ? ` at ${avgPrice}` : ''}.`);
  }
  if (entryOrder && ['CANCELED', 'EXPIRED'].includes(entryOrder.status) && ['pending', 'entry_submitted'].includes(row.status)) {
    out.updates.status = 'cancelled';
    addEvent(out, 'entry_cancelled', `${row.symbol} entry order ${entryOrder.status.toLowerCase()}.`);
    return out;
  }
  if (entryOrder?.status === 'REJECTED' && ['pending', 'entry_submitted'].includes(row.status)) {
    out.updates.status = 'failed';
    addEvent(out, 'entry_failed', `${row.symbol} entry order rejected.`);
    return out;
  }

  if (row.bracket_mode === 'exchange_native') {
    const tp1 = row.binance_tp1_order_id ? orderById[row.binance_tp1_order_id] : undefined;
    const tp2 = row.binance_tp2_order_id ? orderById[row.binance_tp2_order_id] : undefined;
    const sl = row.binance_sl_order_id ? orderById[row.binance_sl_order_id] : undefined;
    if (!row.tp1_closed_at && tp1?.status === 'FILLED') {
      out.updates.status = 'partially_closed';
      out.updates.tp1_closed_at = new Date().toISOString();
      out.updates.sl_moved_to_be = true;
      addEvent(out, 'native_tp1_filled', `${row.symbol} TP1 filled; position partially closed.`);
      addEvent(out, 'sl_moved_to_be', `${row.symbol} SL moved/confirmed at break-even for remaining quantity.`);
    }
    if (!row.tp2_closed_at && tp2?.status === 'FILLED') {
      out.updates.status = 'closed_tp';
      out.updates.tp2_closed_at = new Date().toISOString();
      if (row.binance_sl_order_id) out.cancelOrderIds.push(row.binance_sl_order_id);
      addEvent(out, 'native_tp2_filled', `${row.symbol} TP2 filled; position closed in profit.`);
    }
    if (!row.sl_closed_at && sl?.status === 'FILLED') {
      out.updates.status = 'closed_sl';
      out.updates.sl_closed_at = new Date().toISOString();
      if (row.binance_tp1_order_id) out.cancelOrderIds.push(row.binance_tp1_order_id);
      if (row.binance_tp2_order_id) out.cancelOrderIds.push(row.binance_tp2_order_id);
      addEvent(out, 'native_sl_filled', `${row.symbol} SL filled; position closed.`);
    }
    return out;
  }

  if (row.bracket_mode === 'managed_exit_fallback' || row.protection_status === 'protected_managed') {
    const deadline = computeTimeStopDeadline(row);
    if (deadline) out.updates.time_stop_deadline_at = deadline;
    const mark = truth.markPrice;
    if (!mark || mark <= 0) return out;
    const entry = row.entry_price;
    const intendedSl = row.intended_sl;
    const intendedTp1 = row.intended_tp1;
    const intendedTp2 = row.intended_tp2;
    const remaining = row.remaining_quantity ?? row.volume ?? Math.abs(truth.positionAmt);
    const half = row.tp1_quantity ?? (row.volume ? row.volume / 2 : Math.abs(truth.positionAmt) / 2);
    const activeStop = row.sl_moved_to_be && entry ? entry : intendedSl;

    if (deadline && Date.now() >= new Date(deadline).getTime()) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'timeout' });
      out.updates.status = 'closed_timeout';
      out.updates.remaining_quantity = 0;
      addEvent(out, 'managed_timeout_closed', `${row.symbol} time-stop expired; remaining quantity closed reduce-only.`);
      return out;
    }

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
      addEvent(out, 'managed_tp2_closed', `${row.symbol} managed TP2 hit; remaining quantity closed.`);
      return out;
    }
    if (activeStop && stopHit(row.direction, mark, activeStop)) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'sl' });
      out.updates.status = 'closed_sl';
      out.updates.sl_closed_at = new Date().toISOString();
      out.updates.remaining_quantity = 0;
      addEvent(out, 'managed_sl_closed', `${row.symbol} managed SL hit; remaining quantity closed.`);
      return out;
    }
  }

  if (isMonitorActiveStatus(row.status) && !hasPosition && hasOpenOrders) {
    addEvent(out, 'manual_position_closed', `${row.symbol} position is closed on Binance; stale leftover orders should be cancelled.`);
    out.cancelOrderIds.push(...truth.openOrders.map((order) => order.orderId));
    out.updates.status = 'stale_closed';
    out.updates.stale_cleanup_reason = 'position_closed_leftover_orders_cancelled';
    out.updates.stale_checked_at = new Date().toISOString();
  }

  return out;
}
