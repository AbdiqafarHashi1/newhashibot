import { detectProtectionViolations, evaluateLifecycleState } from './exchange/tradeManagementCore.js';
import type { ProtectionStatus, TradeManagementTruthRow } from './exchange/tradeManagementCore.js';

export const MONITOR_ACTIVE_STATUSES = [
  'pending',
  'entry_submitted',
  'entry_filled',
  'protected',
  'protected_native',
  'pending_protection',
  'protection_pending',
  'protection_failed',
  'protection_recovered',
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
  | 'unsafe_position'
  | 'protection_recovered'
  | 'protection_recovery_failed'
  | 'binance_truth_guard'
  | 'native_tp1_filled'
  | 'native_tp2_filled'
  | 'native_sl_filled'
  | 'tp1_profit_lock_active'
  | 'profit_lock_sl_filled'
  | 'runner_expired_after_tp1'
  | 'position_expired_closed'
  | 'order_cleanup_warning'
  | 'managed_tp1_closed'
  | 'managed_tp2_closed'
  | 'managed_sl_closed'
  | 'managed_timeout_closed'
  | 'unprotected_position_warning'
  | 'sl_moved_to_be'
  | 'stale_closed'
  | 'closed_synced'
  | 'manual_position_closed'
  | 'closed_manual';

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
  remaining_qty?: number | null;
  partial_close_qty?: number | null;
  volume?: number | null;
  tp1_closed_at?: string | null;
  tp1_filled?: boolean | null;
  tp1_fill_price?: number | null;
  tp1_fill_time?: string | null;
  tp2_closed_at?: string | null;
  sl_closed_at?: string | null;
  sl_moved_to_be?: boolean | null;
  profit_lock_enabled?: boolean | null;
  profit_lock_r?: number | null;
  profit_lock_price?: number | null;
  profit_lock_status?: string | null;
  original_sl_price?: number | null;
  replacement_sl_price?: number | null;
  replacement_sl_order_id?: string | null;
  replacement_sl_algo_id?: string | null;
  replacement_sl_verified?: boolean | null;
  old_sl_cancelled_after_tp1?: boolean | null;
  sl_replaced_after_tp1?: boolean | null;
  runner_active?: boolean | null;
  tp2_filled?: boolean | null;
  profit_lock_sl_active?: boolean | null;
  profit_lock_sl_hit?: boolean | null;
  runner_expired?: boolean | null;
  runner_closed?: boolean | null;
  lifecycle_state?: string | null;
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
  highest_positive_r_observed?: number | null;
  highest_positive_pnl_observed?: number | null;
  max_adverse_r_observed?: number | null;
  reached_0_1r?: boolean | null;
  reached_0_2r?: boolean | null;
  reached_0_3r?: boolean | null;
  reached_0_5r?: boolean | null;
  later_reversed_after_positive_excursion?: boolean | null;
}


export interface BinanceOrderSnapshot {
  orderId: string;
  status: OrderStatus;
  avgPrice?: number | string | null;
  price?: number | string | null;
  executedQty?: number | string | null;
  updateTime?: number | string | null;
  time?: number | string | null;
}

export interface BinanceTruthSnapshot {
  positionAmt: number;
  openOrders: Array<{ orderId?: string; algoId?: string; reduceOnly?: boolean; closePosition?: boolean; side?: string; type?: string; orderType?: string; quantity?: number | string; origQty?: number | string; triggerPrice?: number | string; stopPrice?: number | string; price?: number | string; status?: string }>;
  markPrice?: number | null;
  unrealizedPnl?: number | null;
}

export interface MonitorUpdate {
  updates: Record<string, unknown>;
  events: Array<{ type: MonitorEventType; message: string; telegram: boolean }>;
  reduceOnlyMarketOrders: Array<{ symbol: string; side: 'BUY' | 'SELL'; quantity: number; reason: 'tp1' | 'tp2' | 'sl' | 'timeout' }>;
  replacementStopOrders: Array<{ symbol: string; side: 'BUY' | 'SELL'; quantity: number; stopPrice: number; reason: 'profit_lock' }>;
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

export function calculateProfitLockPrice(direction: Direction, entryPrice: number, originalStopLoss: number, profitLockR = 0.3): number {
  const riskDistance = Math.abs(entryPrice - originalStopLoss);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(originalStopLoss) || riskDistance <= 0) return 0;
  return direction === 'buy' ? entryPrice + riskDistance * profitLockR : entryPrice - riskDistance * profitLockR;
}

function orderFillPrice(order: BinanceOrderSnapshot | undefined, fallback: number | null | undefined): number | null {
  return num(order?.avgPrice) ?? num(order?.price) ?? fallback ?? null;
}

function orderFillTime(order: BinanceOrderSnapshot | undefined, fallbackIso: string): string {
  const ms = num(order?.updateTime) ?? num(order?.time);
  return ms && ms > 0 ? new Date(ms).toISOString() : fallbackIso;
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


function applyProfitLockStudyMetrics(out: MonitorUpdate, row: MonitorExecutionRow, truth: BinanceTruthSnapshot): void {
  const entry = row.entry_price ?? 0;
  const sl = row.original_sl_price ?? row.intended_sl ?? 0;
  const mark = truth.markPrice ?? 0;
  const risk = Math.abs(entry - sl);
  const currentR = entry > 0 && risk > 0 && mark > 0 ? (row.direction === 'buy' ? (mark - entry) / risk : (entry - mark) / risk) : 0;
  const highestR = Math.max(row.highest_positive_r_observed ?? 0, currentR, 0);
  const highestPnl = Math.max(row.highest_positive_pnl_observed ?? 0, truth.unrealizedPnl ?? 0, 0);
  out.updates.current_r = Number(currentR.toFixed(6));
  out.updates.profit_lock_r_current = Number(currentR.toFixed(6));
  out.updates.current_pnl = truth.unrealizedPnl ?? 0;
  out.updates.highest_positive_r_observed = Number(highestR.toFixed(6));
  out.updates.highest_positive_pnl_observed = highestPnl;
  out.updates.max_adverse_r_observed = Math.min(row.max_adverse_r_observed ?? 0, currentR, 0);
  out.updates.reached_0_1r = Boolean(row.reached_0_1r) || highestR >= 0.1;
  out.updates.reached_0_2r = Boolean(row.reached_0_2r) || highestR >= 0.2;
  out.updates.reached_0_3r = Boolean(row.reached_0_3r) || highestR >= 0.3;
  out.updates.reached_0_5r = Boolean(row.reached_0_5r) || highestR >= 0.5;
  out.updates.later_reversed_after_positive_excursion = row.later_reversed_after_positive_excursion || (highestR >= 0.3 && currentR < 0.05);
  out.updates.lock_recommendation = (row.tp1_filled || row.tp1_closed_at) ? 'study_after_tp1_lock_candidate' : 'study_only';
  out.updates.profit_lock_engine_mode = 'study_only';
  out.updates.profit_lock_skipped_reason = 'profit_lock_action_disabled_study_only';
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
  return [row.replacement_sl_algo_id ?? row.replacement_sl_order_id, row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id]
    .filter(Boolean)
    .map(String);
}

type ProtectionLabel = 'sl' | 'tp1' | 'tp2';

function expectedProtection(row: MonitorExecutionRow, truth: BinanceTruthSnapshot): Record<ProtectionLabel, { id?: string | null; side: 'BUY' | 'SELL'; type: string; quantity: number; price?: number | null }> {
  const total = row.volume ?? row.remaining_quantity ?? Math.abs(truth.positionAmt);
  return {
    sl: { id: row.sl_algo_id ?? row.binance_sl_order_id, side: closeSide(row.direction), type: 'STOP_MARKET', quantity: total, price: row.intended_sl },
    tp1: { id: row.tp1_algo_id ?? row.binance_tp1_order_id, side: closeSide(row.direction), type: 'TAKE_PROFIT_MARKET', quantity: row.tp1_quantity ?? total / 2, price: row.intended_tp1 },
    tp2: { id: row.tp2_algo_id ?? row.binance_tp2_order_id, side: closeSide(row.direction), type: 'TAKE_PROFIT_MARKET', quantity: row.tp2_quantity ?? total / 2, price: row.intended_tp2 },
  };
}

function orderIdentity(order: BinanceTruthSnapshot['openOrders'][number]): string {
  return String(order.algoId ?? order.orderId ?? '');
}

function protectionOrderIssues(order: BinanceTruthSnapshot['openOrders'][number] | undefined, intent: { side: 'BUY' | 'SELL'; type: string; quantity: number; price?: number | null }): string[] {
  const issues: string[] = [];
  if (!order) return ['missing'];
  if (order.side && String(order.side).toUpperCase() !== intent.side) issues.push('wrong_side');
  if (order.type && String(order.type).toUpperCase() !== intent.type) issues.push('wrong_type');
  if (order.reduceOnly === false) issues.push('not_reduce_only');
  if (order.closePosition === true) issues.push('unexpected_close_position');
  const qty = num(order.origQty ?? order.quantity);
  if (qty !== null && intent.quantity > 0 && Math.abs(qty - intent.quantity) > Math.max(intent.quantity * 0.000001, 1e-8)) issues.push('wrong_quantity');
  const price = num(order.triggerPrice ?? order.stopPrice ?? order.price);
  if (price !== null && intent.price && Math.abs(price - intent.price) > Math.max(Math.abs(intent.price) * 0.000001, 1e-8)) issues.push('wrong_price');
  return issues;
}

function findProtectionOrder(openOrders: BinanceTruthSnapshot['openOrders'], intent: { id?: string | null; side: 'BUY' | 'SELL'; type: string; quantity: number; price?: number | null }) {
  const stored = intent.id ? openOrders.find((order) => orderIdentity(order) === String(intent.id)) : undefined;
  if (stored && protectionOrderIssues(stored, intent).length === 0) return stored;
  return openOrders.find((order) => protectionOrderIssues(order, intent).length === 0) ?? stored;
}

export function verifyExecutionProtection(row: MonitorExecutionRow, truth: BinanceTruthSnapshot): { verified: boolean; missingLabels: ProtectionLabel[]; errors: string[] } {
  const expected = expectedProtection(row, truth);
  const missingLabels: ProtectionLabel[] = [];
  const errors: string[] = [];
  for (const label of ['sl', 'tp1', 'tp2'] as const) {
    const intent = expected[label];
    const order = findProtectionOrder(truth.openOrders, intent);
    const issues = protectionOrderIssues(order, intent);
    if (issues.length > 0) {
      missingLabels.push(label);
      errors.push(`${label}:${issues.join('+')}`);
    }
  }
  return { verified: missingLabels.length === 0, missingLabels, errors };
}

function rowAgeMs(row: MonitorExecutionRow): number {
  const start = row.entry_submitted_at ?? row.created_at;
  const ms = start ? new Date(start).getTime() : NaN;
  return Number.isFinite(ms) ? Date.now() - ms : 0;
}

function syncedNoPositionStatus(row: MonitorExecutionRow): 'closed_synced' | 'stale_closed' | 'closed_manual' {
  return ['entry_filled', 'protected', 'protected_native', 'protected_managed', 'partially_closed', 'pending_protection', 'pending_managed_protection'].includes(row.status) ? 'closed_manual' : 'stale_closed';
}

export type ExecutionLifecycleOutcome =
  | 'open_runner'
  | 'win_tp2'
  | 'protected_profit_lock'
  | 'loss_direct_sl'
  | 'expired_before_tp1'
  | 'expired_after_tp1'
  | 'manual_closed'
  | 'pending_sync'
  | 'no_trade';

export function classifyExecutionLifecycleOutcome(row: Pick<MonitorExecutionRow, 'status' | 'tp1_filled' | 'tp1_closed_at' | 'runner_active' | 'tp2_closed_at' | 'sl_closed_at'>): ExecutionLifecycleOutcome {
  if (row.status === 'entry_timeout_cancelled' || row.status === 'entry_missing_no_position' || row.status === 'cancelled' || row.status === 'skipped') return 'no_trade';
  if (row.status === 'closed_tp2' || row.status === 'closed_tp' || row.tp2_closed_at) return 'win_tp2';
  if (row.status === 'closed_profit_lock') return 'protected_profit_lock';
  if (row.status === 'closed_sl' && !(row.tp1_filled || row.tp1_closed_at)) return 'loss_direct_sl';
  if (row.status === 'closed_expired') return 'expired_before_tp1';
  if (row.status === 'closed_expired_after_tp1') return 'expired_after_tp1';
  if (row.status === 'closed_manual') return 'manual_closed';
  if (row.runner_active || row.status === 'partially_closed') return 'open_runner';
  return 'pending_sync';
}

export function processExecutionMonitorTick(
  row: MonitorExecutionRow,
  truth: BinanceTruthSnapshot,
  orderById: Record<string, BinanceOrderSnapshot | undefined> = {},
): MonitorUpdate {
  const out = _processExecutionMonitorTick(row, truth, orderById);

  // Unify with Phase 2 shared execution core
  const positionObj = Math.abs(truth.positionAmt) > 0 ? {
    symbol: row.symbol,
    side: row.direction === 'buy' ? 'long' as const : 'short' as const,
    quantity: Math.abs(truth.positionAmt),
    entryPrice: (out.updates.entry_price as number) ?? row.entry_price ?? undefined,
    markPrice: truth.markPrice ?? undefined,
    unrealizedPnl: truth.unrealizedPnl ?? undefined
  } : null;

  const ordersObj = (truth.openOrders ?? []).map(o => ({
    providerOrderId: String(o.orderId ?? o.algoId ?? ''),
    symbol: row.symbol,
    side: o.side,
    type: o.type ?? o.orderType,
    status: o.status ?? 'NEW',
    quantity: typeof o.origQty === 'number' ? o.origQty : typeof o.quantity === 'number' ? o.quantity : undefined,
    price: typeof o.price === 'number' ? o.price : undefined,
    triggerPrice: typeof o.triggerPrice === 'number' ? o.triggerPrice : typeof o.stopPrice === 'number' ? o.stopPrice : undefined,
    reduceOnly: o.reduceOnly
  }));

  const mockDbRow: TradeManagementTruthRow = {
    provider: 'binance',
    environment: 'testnet',
    symbol: row.symbol,
    side: row.direction === 'buy' ? 'long' : 'short',
    status: (out.updates.status as string) ?? row.status,
    qty: Math.abs(truth.positionAmt) || row.volume || 0,
    entry_price: (out.updates.entry_price as number) ?? row.entry_price ?? null,
    mark_price: truth.markPrice ?? null,
    unrealized_pnl: truth.unrealizedPnl ?? null,
    exchange_position_id: null,
    signal_id: null,
    execution_order_id: row.id,
    entry_order_id: row.binance_entry_order_id ?? row.entry_order_id ?? null,
    sl_order_id: (out.updates.replacement_sl_order_id as string) ?? row.replacement_sl_order_id ?? row.binance_sl_order_id ?? null,
    tp1_order_id: row.binance_tp1_order_id ?? null,
    tp2_order_id: row.binance_tp2_order_id ?? null,
    sl_present: !(out.updates.protection_status === 'pending_protection' || out.updates.status === 'protection_failed' || out.updates.status === 'entry_submitted'),
    tp1_present: !(out.updates.protection_status === 'pending_protection' || out.updates.status === 'protection_failed' || out.updates.status === 'entry_submitted'),
    tp2_present: !(out.updates.protection_status === 'pending_protection' || out.updates.status === 'protection_failed' || out.updates.status === 'entry_submitted'),
    protection_status: ((out.updates.protection_status ?? row.protection_status ?? 'unprotected') as ProtectionStatus),
    profit_lock_status: (out.updates.profit_lock_status as string) ?? row.profit_lock_status ?? 'inactive',
    monitor_status: 'synced',
    recovery_status: 'none',
    latest_error: null,
    latest_sync_at: new Date().toISOString(),
    last_action_taken: null
  };

  const violations = detectProtectionViolations(positionObj, ordersObj, [mockDbRow]);
  out.updates.lifecycle_state = evaluateLifecycleState(
    (out.updates.status as string) ?? row.status,
    (out.updates.protection_status as string) ?? row.protection_status ?? 'unprotected',
    violations
  );

  return out;
}

function _processExecutionMonitorTick(
  row: MonitorExecutionRow,
  truth: BinanceTruthSnapshot,
  orderById: Record<string, BinanceOrderSnapshot | undefined>,
): MonitorUpdate {
  const out: MonitorUpdate = { updates: {}, events: [], reduceOnlyMarketOrders: [], replacementStopOrders: [], cancelOrderIds: [] };
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
  if (hasPosition) applyProfitLockStudyMetrics(out, row, truth);

  if (deadline && Date.now() >= new Date(deadline).getTime() && isMonitorActiveStatus(row.status)) {
    const remaining = row.remaining_quantity ?? row.volume ?? Math.abs(truth.positionAmt);
    pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
    pushUniqueCancel(out, allProtectionIds(row));
    if (hasPosition && remaining > 0) out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'timeout' });
    const afterTp1 = Boolean(row.tp1_closed_at || row.tp1_filled || row.runner_active);
    out.updates.status = afterTp1 ? 'closed_expired_after_tp1' : 'closed_expired';
    out.updates.runner_expired = afterTp1;
    out.updates.runner_closed = true;
    out.updates.runner_active = false;
    out.updates.remaining_quantity = 0;
    out.updates.remaining_qty = 0;
    out.updates.expiry_reason = row.expiry_reason ?? 'strategy_time_stop_expired';
    out.updates.last_monitor_action = 'timeout_closed';
    addEvent(out, afterTp1 ? 'runner_expired_after_tp1' : 'position_expired_closed', afterTp1 ? `${row.symbol} runner expired after TP1; remaining runner should be closed reduce-only and TP2/profit-lock conditionals cleaned.` : `${row.symbol} position expired before TP1; full position should be closed reduce-only and TP/SL conditionals cleaned.`);
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


  if (hasPosition && ['entry_filled', 'pending_protection', 'protection_pending', 'protection_failed', 'protected', 'protected_native', 'protected_managed', 'partially_closed'].includes(row.status)) {
    const verification = verifyExecutionProtection(row, truth);
    const nativeLike = row.bracket_mode === 'exchange_native' || row.protection_status === 'protected_native' || row.protection_status === 'pending_protection' || row.protection_status === 'protection_pending';
    if (verification.verified && nativeLike && row.protection_status !== 'protected_native') {
      out.updates.status = 'protected_native';
      out.updates.protection_status = 'protected_native';
      out.updates.native_protection_verified = true;
      out.updates.managed_fallback_active = false;
      out.updates.last_monitor_action = 'protection_verified';
      addEvent(out, 'protection_recovered', `${row.symbol} protection verified on Binance: SL, TP1, and TP2 all exist with reduce-only quantities and expected prices.`);
    } else if (!verification.verified) {
      out.updates.protection_status = row.protection_status === 'protection_failed' ? 'protection_failed' : 'pending_protection';
      out.updates.native_protection_verified = false;
      out.updates.managed_fallback_active = false;
      out.updates.latest_protection_error = `UNSAFE_POSITION missing/mismatched protection: ${verification.errors.join(',')}`;
      out.updates.protection_critical_reason = 'binance_position_exists_without_verified_sl_tp1_tp2';
      out.updates.last_monitor_action = 'protection_recovery_required';
      addEvent(out, 'unsafe_position', `${row.symbol} UNSAFE_POSITION CRITICAL — missing/mismatched protection (${verification.errors.join(',')}); recovery must recreate ${verification.missingLabels.join(', ')} before ACTIVE/protected_native.`);
      if (row.protection_status === 'protected_native') out.updates.status = 'protection_failed';
    }
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
      const fillTime = orderFillTime(tp1, checkedAt);
      const filledQty = num(tp1?.executedQty) ?? row.tp1_quantity ?? Math.max((row.volume ?? Math.abs(truth.positionAmt) * 2) - Math.abs(truth.positionAmt), 0);
      const remaining = Math.abs(truth.positionAmt) || Math.max((row.volume ?? 0) - filledQty, 0);
      const originalSl = row.original_sl_price ?? row.intended_sl;
      const entry = row.entry_price;
      const lockPrice = entry && originalSl ? calculateProfitLockPrice(row.direction, entry, originalSl, 0.3) : 0;
      out.updates.status = 'partially_closed';
      out.updates.lifecycle_state = 'tp1_filled_profit_lock_pending';
      out.updates.tp1_filled = true;
      out.updates.tp1_closed_at = fillTime;
      out.updates.tp1_fill_time = fillTime;
      out.updates.tp1_fill_price = orderFillPrice(tp1, row.intended_tp1);
      out.updates.partial_close_qty = filledQty;
      out.updates.remaining_quantity = remaining;
      out.updates.remaining_qty = remaining;
      out.updates.runner_active = remaining > 0;
      out.updates.tp2_pending = true;
      out.updates.profit_lock_enabled = true;
      out.updates.profit_lock_r = 0.3;
      out.updates.original_sl_price = originalSl;
      if (lockPrice > 0) {
        out.updates.profit_lock_price = lockPrice;
        out.updates.replacement_sl_price = lockPrice;
        out.updates.profit_lock_status = 'replacement_pending';
        out.replacementStopOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, stopPrice: lockPrice, reason: 'profit_lock' });
      }
      addEvent(out, 'native_tp1_filled', `${row.symbol} TP1 filled; partial quantity ${filledQty}; runner quantity ${remaining}.`);
      addEvent(out, 'tp1_profit_lock_active', `${row.symbol} TP1 hit — profit lock +0.3R replacement SL required for remaining runner.`);
      nativeChanged = true;
    }
    if (!row.tp2_closed_at && conditionalFilled(tp2)) {
      if (hasPosition) {
        out.updates.last_monitor_action = 'binance_truth_guard_tp2_fill_position_still_open';
        out.updates.lifecycle_state = 'binance_truth_guard_position_open_after_tp2';
        out.updates.latest_sync_error = 'TP2 order reports filled but Binance position is still open; not closing execution until Binance confirms flat position.';
        addEvent(out, 'binance_truth_guard', `${row.symbol} TP2 fill was seen but Binance position remains open; execution is not closed and no TP2 HIT/CLOSED truth message is emitted.`, false);
        nativeChanged = true;
      } else {
        const fillTime = orderFillTime(tp2, checkedAt);
        out.updates.status = 'closed_tp2';
        out.updates.lifecycle_state = 'closed_tp2';
        out.updates.tp2_closed_at = fillTime;
        out.updates.tp2_filled = true;
        out.updates.runner_closed = true;
        out.updates.runner_active = false;
        out.updates.remaining_quantity = 0;
        out.updates.remaining_qty = 0;
        pushUniqueCancel(out, [slId, tp1Id, row.replacement_sl_algo_id, row.replacement_sl_order_id]);
        addEvent(out, 'native_tp2_filled', `${row.symbol} TP2 hit — trade closed; leftover SL/profit-lock conditionals queued for cleanup verification.`);
        nativeChanged = true;
      }
    }
    if (!row.sl_closed_at && conditionalFilled(sl)) {
      const profitLockHit = Boolean(row.tp1_closed_at || row.tp1_filled || row.sl_replaced_after_tp1 || row.profit_lock_sl_active);
      const fillTime = orderFillTime(sl, checkedAt);
      out.updates.status = profitLockHit ? 'closed_profit_lock' : 'closed_sl';
      out.updates.lifecycle_state = profitLockHit ? 'closed_profit_lock' : 'closed_sl';
      out.updates.sl_closed_at = fillTime;
      out.updates.profit_lock_sl_hit = profitLockHit;
      out.updates.runner_closed = true;
      out.updates.runner_active = false;
      out.updates.remaining_quantity = 0;
      out.updates.remaining_qty = 0;
      pushUniqueCancel(out, [tp1Id, tp2Id]);
      addEvent(out, profitLockHit ? 'profit_lock_sl_filled' : 'native_sl_filled', profitLockHit ? `${row.symbol} profit-lock stop hit — trade closed with protected profit; TP2 cleanup queued.` : `${row.symbol} original SL hit before TP1 — trade closed; TP cleanup queued.`);
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
    const activeStop = row.profit_lock_sl_active && row.replacement_sl_price ? row.replacement_sl_price : row.sl_moved_to_be && entry ? calculateProfitLockPrice(row.direction, entry, intendedSl ?? 0, row.profit_lock_r ?? 0.3) : intendedSl;


    if (!row.tp1_closed_at && intendedTp1 && targetHit(row.direction, mark, intendedTp1)) {
      const qty = Math.min(half, remaining);
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: qty, reason: 'tp1' });
      out.updates.status = 'partially_closed';
      out.updates.tp1_closed_at = new Date().toISOString();
      out.updates.remaining_quantity = Math.max(remaining - qty, 0);
      const originalSl = row.original_sl_price ?? intendedSl;
      const lockPrice = entry && originalSl ? calculateProfitLockPrice(row.direction, entry, originalSl, 0.3) : 0;
      out.updates.tp1_filled = true;
      out.updates.tp1_fill_time = checkedAt;
      out.updates.tp1_fill_price = mark;
      out.updates.partial_close_qty = qty;
      out.updates.remaining_qty = Math.max(remaining - qty, 0);
      out.updates.runner_active = Math.max(remaining - qty, 0) > 0;
      out.updates.lifecycle_state = 'tp1_filled_profit_lock_active';
      out.updates.profit_lock_enabled = true;
      out.updates.profit_lock_r = 0.3;
      out.updates.original_sl_price = originalSl;
      out.updates.profit_lock_price = lockPrice;
      out.updates.replacement_sl_price = lockPrice;
      out.updates.profit_lock_status = 'managed_active';
      out.updates.profit_lock_sl_active = true;
      out.updates.sl_moved_to_be = false;
      addEvent(out, 'managed_tp1_closed', `${row.symbol} managed TP1 hit; reduce-only market closed 50%.`);
      addEvent(out, 'tp1_profit_lock_active', `${row.symbol} managed +0.3R profit lock active for runner.`);
      return out;
    }
    if (intendedTp2 && targetHit(row.direction, mark, intendedTp2)) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'tp2' });
      out.updates.status = 'closed_tp2';
      out.updates.lifecycle_state = 'closed_tp2';
      out.updates.tp2_closed_at = new Date().toISOString();
      out.updates.tp2_filled = true;
      out.updates.runner_closed = true;
      out.updates.runner_active = false;
      out.updates.remaining_quantity = 0;
      out.updates.remaining_qty = 0;
      pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
      pushUniqueCancel(out, allProtectionIds(row));
      addEvent(out, 'managed_tp2_closed', `${row.symbol} TP2 hit — trade closed; remaining conditionals queued for cleanup verification.`);
      return out;
    }
    if (activeStop && stopHit(row.direction, mark, activeStop)) {
      out.reduceOnlyMarketOrders.push({ symbol: row.symbol, side: closeSide(row.direction), quantity: remaining, reason: 'sl' });
      const profitLockHit = Boolean(row.tp1_closed_at || row.tp1_filled || row.profit_lock_sl_active || row.sl_replaced_after_tp1);
      out.updates.status = profitLockHit ? 'closed_profit_lock' : 'closed_sl';
      out.updates.lifecycle_state = profitLockHit ? 'closed_profit_lock' : 'closed_sl';
      out.updates.sl_closed_at = new Date().toISOString();
      out.updates.profit_lock_sl_hit = profitLockHit;
      out.updates.runner_closed = true;
      out.updates.runner_active = false;
      out.updates.remaining_quantity = 0;
      out.updates.remaining_qty = 0;
      pushUniqueCancel(out, truth.openOrders.map((order) => order.algoId ?? order.orderId));
      pushUniqueCancel(out, allProtectionIds(row));
      addEvent(out, profitLockHit ? 'profit_lock_sl_filled' : 'managed_sl_closed', profitLockHit ? `${row.symbol} profit-lock stop hit — trade closed with protected profit; TP2 cleanup queued.` : `${row.symbol} original SL hit — trade closed; remaining conditionals queued for cleanup verification.`);
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
