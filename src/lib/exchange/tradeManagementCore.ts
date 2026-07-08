import type { ExchangeOrder, ExchangePosition, ExchangeProvider, ExchangeProviderId, ExchangeSide, ProtectionRequest, ProviderResult } from './exchangeProvider.js';

export type ProtectionStatus = 'protected' | 'missing_sl' | 'missing_tp' | 'orphan' | 'stale' | 'closed';
export type ProfitLockStatus = 'inactive' | 'eligible' | 'locked' | 'failed';

export interface TradeManagementTruthRow {
  provider: 'binance' | 'bybit' | string;
  environment: 'testnet' | 'demo' | string;
  symbol: string;
  side: ExchangeSide | string;
  status: string;
  qty: number;
  entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number | null;
  exchange_position_id: string | null;
  signal_id: string | null;
  execution_order_id: string | null;
  entry_order_id: string | null;
  sl_order_id: string | null;
  tp1_order_id: string | null;
  tp2_order_id: string | null;
  sl_present: boolean;
  tp1_present: boolean;
  tp2_present: boolean;
  protection_status: ProtectionStatus;
  profit_lock_status: ProfitLockStatus | string;
  monitor_status: 'synced' | 'repairing' | 'error' | 'closed' | string;
  recovery_status: 'none' | 'repair_attempted' | 'repair_succeeded' | 'repair_failed' | string;
  latest_error: string | null;
  latest_sync_at: string;
  last_action_taken: string | null;
}

export interface TradeTruthStore {
  upsertTradeTruth(row: TradeManagementTruthRow): Promise<void>;
  listOpenTradeTruth(provider?: ExchangeProviderId): Promise<TradeManagementTruthRow[]>;
  markClosed(provider: ExchangeProviderId, symbolsStillOpen: Set<string>, at: string): Promise<number>;
  recordTelegramLifecycle?(provider: ExchangeProviderId, event: string, row: TradeManagementTruthRow, result: ProviderResult): Promise<void>;
}

function normalizeType(order: ExchangeOrder): string {
  const metadata = order.metadata ?? {};
  return `${order.type ?? ''} ${metadata.orderType ?? ''} ${metadata.stopOrderType ?? ''} ${metadata.orderFilter ?? ''} ${metadata.orderLinkId ?? ''} ${metadata.clientAlgoId ?? ''}`.toLowerCase();
}
function closeSide(side: string): string {
  return side === 'long' || side.toLowerCase() === 'buy' ? 'sell' : 'buy';
}
function truthy(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === 'true';
}
function orderTrigger(order: ExchangeOrder): number {
  const metadata = order.metadata ?? {};
  return Number(order.triggerPrice ?? metadata.triggerPrice ?? metadata.stopPrice ?? order.price ?? metadata.price ?? 0);
}
function triggerDirection(order: ExchangeOrder): 1 | 2 | null {
  const raw = order.metadata?.triggerDirection;
  const value = Number(raw);
  return value === 1 || value === 2 ? value : null;
}
function isCloseReduceOnly(order: ExchangeOrder): boolean {
  const metadata = order.metadata ?? {};
  return order.reduceOnly === true || truthy(metadata.reduceOnly) || truthy(metadata.closeOnTrigger) || truthy(metadata.closePosition);
}
function isValidProtectionOrder(position: ExchangePosition, order: ExchangeOrder, label: 'sl' | 'tp'): boolean {
  const trigger = orderTrigger(order);
  const mark = Number(position.markPrice ?? position.entryPrice ?? 0);
  if (!Number.isFinite(trigger) || trigger <= 0 || !Number.isFinite(mark) || mark <= 0) return false;
  const isLong = String(position.side).toLowerCase() === 'long' || String(position.side).toLowerCase() === 'buy';
  const shouldBeAbove = isLong ? label === 'tp' : label === 'sl';
  const priceValid = shouldBeAbove ? trigger > mark : trigger < mark;
  const direction = triggerDirection(order);
  const directionValid = direction == null || direction === (trigger > mark ? 1 : 2);
  return priceValid && directionValid;
}
export function classifyProtection(position: ExchangePosition, openOrders: ExchangeOrder[]): Pick<TradeManagementTruthRow, 'sl_order_id' | 'tp1_order_id' | 'tp2_order_id' | 'sl_present' | 'tp1_present' | 'tp2_present' | 'protection_status'> {
  const wantedSide = closeSide(String(position.side)).toLowerCase();
  const reduceOnlyOrders = openOrders.filter(order => order.symbol === position.symbol && isCloseReduceOnly(order) && (!order.side || String(order.side).toLowerCase() === wantedSide));
  const stops = reduceOnlyOrders.filter(order => /stop|sl/.test(normalizeType(order)) && !/take/.test(normalizeType(order)) && isValidProtectionOrder(position, order, 'sl'));
  const takes = reduceOnlyOrders.filter(order => /take|profit|tp/.test(normalizeType(order)) && isValidProtectionOrder(position, order, 'tp'));
  const isLong = String(position.side).toLowerCase() === 'long' || String(position.side).toLowerCase() === 'buy';
  const sortedTakes = takes.sort((a, b) => isLong ? orderTrigger(a) - orderTrigger(b) : orderTrigger(b) - orderTrigger(a));
  const [tp1, tp2] = sortedTakes;
  const sl = stops.sort((a, b) => Math.abs(orderTrigger(a) - Number(position.markPrice ?? position.entryPrice ?? 0)) - Math.abs(orderTrigger(b) - Number(position.markPrice ?? position.entryPrice ?? 0)))[0];
  const sl_present = Boolean(sl);
  const tp1_present = Boolean(tp1);
  const tp2_present = Boolean(tp2);
  const protection_status: ProtectionStatus = sl_present && tp1_present && tp2_present ? 'protected' : !sl_present ? 'missing_sl' : 'missing_tp';
  return { sl_order_id: sl?.providerOrderId ?? null, tp1_order_id: tp1?.providerOrderId ?? null, tp2_order_id: tp2?.providerOrderId ?? null, sl_present, tp1_present, tp2_present, protection_status };
}

export function tradeRowFromExchange(provider: ExchangeProvider, position: ExchangePosition, openOrders: ExchangeOrder[], at = new Date().toISOString()): TradeManagementTruthRow {
  const protection = classifyProtection(position, openOrders);
  return {
    provider: provider.metadata.id,
    environment: provider.metadata.environment,
    symbol: position.symbol,
    side: position.side,
    status: 'entry_filled',
    qty: Math.abs(Number(position.quantity ?? 0)),
    entry_price: position.entryPrice ?? null,
    mark_price: position.markPrice ?? null,
    unrealized_pnl: position.unrealizedPnl ?? null,
    exchange_position_id: position.providerPositionId ?? null,
    signal_id: String(position.metadata?.signal_id ?? position.metadata?.signalId ?? '') || null,
    execution_order_id: String(position.metadata?.execution_order_id ?? position.metadata?.executionId ?? '') || null,
    entry_order_id: String(position.metadata?.entry_order_id ?? position.metadata?.entryOrderId ?? '') || null,
    profit_lock_status: String(position.metadata?.profit_lock_status ?? 'inactive'),
    monitor_status: 'synced',
    recovery_status: 'none',
    latest_error: null,
    latest_sync_at: at,
    last_action_taken: 'syncProviderPositions',
    ...protection,
  };
}

export async function syncProviderPositions(provider: ExchangeProvider, store: TradeTruthStore): Promise<{ provider: ExchangeProviderId; open_positions_found: number; protected_count: number; unsafe_count: number; closed_marked: number; rows: TradeManagementTruthRow[]; error?: string }> {
  const at = new Date().toISOString();
  try {
    const [positions, openOrders] = await Promise.all([provider.fetchOpenPositions(), provider.fetchOpenOrders()]);
    const rows = positions.filter(p => Math.abs(Number(p.quantity ?? 0)) > 0).map(position => tradeRowFromExchange(provider, position, openOrders, at));
    for (const row of rows) await store.upsertTradeTruth(row);
    const closed_marked = await store.markClosed(provider.metadata.id, new Set(rows.map(row => row.symbol)), at);
    return { provider: provider.metadata.id, open_positions_found: rows.length, protected_count: rows.filter(row => row.protection_status === 'protected').length, unsafe_count: rows.filter(row => row.protection_status !== 'protected').length, closed_marked, rows };
  } catch (error) {
    return { provider: provider.metadata.id, open_positions_found: 0, protected_count: 0, unsafe_count: 0, closed_marked: 0, rows: [], error: error instanceof Error ? error.message : 'sync_failed' };
  }
}

function defaultProtectionRequest(row: TradeManagementTruthRow): ProtectionRequest {
  const mark = Number(row.mark_price ?? row.entry_price ?? 0);
  const long = String(row.side).toLowerCase() === 'long';
  return { symbol: row.symbol, side: long ? 'long' : 'short', quantity: row.qty, entryPrice: Number(row.entry_price ?? mark), stopLoss: long ? mark * 0.994 : mark * 1.006, tp1: long ? mark * 1.005 : mark * 0.995, tp2: long ? mark * 1.01 : mark * 0.99, metadata: { executionId: row.execution_order_id, signalId: row.signal_id, emergencyFromMark: true } };
}

export async function repairUnprotectedPositions(provider: ExchangeProvider, store: TradeTruthStore): Promise<{ provider: ExchangeProviderId; repair_attempts: number; repair_successes: number; failures: string[] }> {
  const rows = (await store.listOpenTradeTruth(provider.metadata.id)).filter(row => row.protection_status !== 'protected' && row.protection_status !== 'closed');
  let repair_successes = 0;
  const failures: string[] = [];
  for (const row of rows) {
    const livePosition = (await provider.fetchOpenPositions()).find(position => position.symbol === row.symbol && String(position.side).toLowerCase() === String(row.side).toLowerCase()) ?? { symbol: row.symbol, side: row.side, quantity: row.qty, entryPrice: row.entry_price ?? undefined, markPrice: row.mark_price ?? undefined };
    const freshProtection = classifyProtection(livePosition, await provider.fetchOpenOrders(row.symbol));
    const request = defaultProtectionRequest({ ...row, ...freshProtection, mark_price: Number(livePosition.markPrice ?? row.mark_price ?? row.entry_price ?? 0), qty: Math.abs(Number(livePosition.quantity ?? row.qty)) });
    const results: ProviderResult[] = [];
    if (!freshProtection.sl_present) results.push(await provider.placeStopLoss(request));
    if (!freshProtection.tp1_present) results.push(await provider.placeTakeProfit(request, 'tp1'));
    if (!freshProtection.tp2_present) results.push(await provider.placeTakeProfit(request, 'tp2'));
    const afterProtection = classifyProtection(livePosition, await provider.fetchOpenOrders(row.symbol));
    const ok = afterProtection.protection_status === 'protected';
    const partial = afterProtection.sl_present || afterProtection.tp1_present || afterProtection.tp2_present;
    if (ok) repair_successes += 1; else failures.push(`${row.provider}:${row.symbol}:${results.find(result => !result.ok)?.error ?? afterProtection.protection_status}`);
    await store.upsertTradeTruth({ ...row, ...afterProtection, recovery_status: ok ? 'repair_succeeded' : partial ? 'repair_attempted' : 'repair_failed', monitor_status: ok || partial ? 'synced' : 'error', latest_error: ok || partial ? null : failures[failures.length - 1], latest_sync_at: new Date().toISOString(), last_action_taken: ok ? 'repairUnprotectedPositions' : 'repair_partial' });
  }
  return { provider: provider.metadata.id, repair_attempts: rows.length, repair_successes, failures };
}

export async function applyProfitLock(provider: ExchangeProvider, store: TradeTruthStore, thresholdR = 1): Promise<{ provider: ExchangeProviderId; checked: number; locked: number; failures: string[] }> {
  const rows = await store.listOpenTradeTruth(provider.metadata.id);
  let locked = 0;
  const failures: string[] = [];
  for (const row of rows) {
    if (!row.sl_present || !row.entry_price || !row.mark_price) continue;
    const risk = Math.abs(row.entry_price - Number(row.entry_price) * 0.99) || 1;
    const r = String(row.side).toLowerCase() === 'long' ? (row.mark_price - row.entry_price) / risk : (row.entry_price - row.mark_price) / risk;
    if (r < thresholdR || row.profit_lock_status === 'locked') continue;
    const result = await provider.executeProfitLock({ symbol: row.symbol, side: String(row.side).toLowerCase() === 'long' ? 'long' : 'short', quantity: row.qty, entryPrice: row.entry_price, stopLoss: row.entry_price, currentPrice: row.mark_price, highestPositiveR: r, metadata: { entryPrice: row.entry_price, tp1Hit: true, validSlExists: true } });
    if (result.ok) locked += 1; else failures.push(`${row.provider}:${row.symbol}:${result.error ?? 'profit_lock_failed'}`);
    await store.upsertTradeTruth({ ...row, profit_lock_status: result.ok ? 'locked' : 'failed', latest_error: result.ok ? null : failures[failures.length - 1], latest_sync_at: new Date().toISOString(), last_action_taken: 'applyProfitLock' });
  }
  return { provider: provider.metadata.id, checked: rows.length, locked, failures };
}

export type SharedLifecycleState =
  | 'SIGNAL_CREATED'
  | 'QUALIFIED'
  | 'POSITION_SIZED'
  | 'ORDER_SUBMITTED'
  | 'FILLED'
  | 'PROTECTED'
  | 'TP1'
  | 'BREAKEVEN'
  | 'TP2'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED';

export interface ProtectionViolation {
  missing_sl: boolean;
  missing_tp: boolean;
  duplicate_position: boolean;
  orphan_position: boolean;
  stale_order: boolean;
  illegal_state: boolean;
  reason: string;
}

export function detectProtectionViolations(
  position: ExchangePosition | null,
  orders: ExchangeOrder[],
  dbRows: TradeManagementTruthRow[]
): ProtectionViolation {
  const symbol = position?.symbol ?? (orders[0]?.symbol || '');
  const hasPosition = position && Math.abs(Number(position.quantity ?? 0)) > 0;
  const hasOrders = orders.length > 0;

  const activeDbRow = dbRows.find(
    row =>
      row.symbol === symbol &&
      row.protection_status !== 'closed' &&
      row.status !== 'closed'
  );
  const orphan_position = hasPosition && !activeDbRow;

  const activeSymbolRows = dbRows.filter(
    row =>
      row.symbol === symbol &&
      row.protection_status !== 'closed' &&
      row.status !== 'closed'
  );
  const duplicate_position = activeSymbolRows.length > 1;

  const stale_order = !hasPosition && hasOrders;

  let missing_sl = false;
  let missing_tp = false;
  if (hasPosition) {
    const classification = classifyProtection(position, orders);
    missing_sl = !classification.sl_present;
    missing_tp = !classification.tp1_present || !classification.tp2_present;
  }

  const illegal_state =
    missing_sl ||
    missing_tp ||
    orphan_position ||
    duplicate_position ||
    stale_order;

  let reason = 'Ok';
  if (duplicate_position) reason = 'duplicate_position';
  else if (orphan_position) reason = 'orphan_position';
  else if (stale_order) reason = 'stale_order';
  else if (missing_sl) reason = 'missing_sl';
  else if (missing_tp) reason = 'missing_tp';

  return {
    missing_sl,
    missing_tp,
    duplicate_position,
    orphan_position,
    stale_order,
    illegal_state,
    reason,
  };
}

export function evaluateLifecycleState(
  status: string,
  protection_status: string,
  violations: ProtectionViolation
): SharedLifecycleState {
  if (violations.illegal_state) {
    return 'RECOVERY_REQUIRED';
  }
  const s = String(status).toUpperCase();
  if (s.includes('CLOSED_TP2') || s.includes('TP2_FILLED') || s.includes('CLOSED_TP')) {
    return 'CLOSED';
  }
  if (s.includes('CLOSED') || s.includes('EXITED') || s.includes('CANCEL')) {
    return 'CLOSED';
  }
  if (s.includes('FAILED')) {
    return 'FAILED';
  }
  if (s.includes('TP1')) {
    return 'TP1';
  }
  if (s.includes('BREAKEVEN') || s.includes('BE_HIT')) {
    return 'BREAKEVEN';
  }
  if (protection_status === 'protected') {
    return 'PROTECTED';
  }
  if (s.includes('FILLED')) {
    return 'FILLED';
  }
  if (s.includes('SUBMITTED') || s.includes('ORDER')) {
    return 'ORDER_SUBMITTED';
  }
  if (s.includes('SIZE')) {
    return 'POSITION_SIZED';
  }
  if (s.includes('QUALIFIED')) {
    return 'QUALIFIED';
  }
  return 'SIGNAL_CREATED';
}

export class RecoveryEngine {
  static async recoverPosition(
    provider: ExchangeProvider,
    store: TradeTruthStore,
    row: TradeManagementTruthRow,
    violation: ProtectionViolation
  ): Promise<{ success: boolean; action_taken: string; error?: string }> {
    const symbol = row.symbol;
    if (violation.stale_order) {
      try {
        const orders = await provider.fetchOpenOrders(symbol);
        for (const order of orders) {
          await provider.cancelOrder({ symbol, providerOrderId: order.providerOrderId });
        }
        await store.upsertTradeTruth({
          ...row,
          protection_status: 'closed',
          status: 'closed',
          last_action_taken: 'recovery:cancelled_stale_orders',
          latest_sync_at: new Date().toISOString()
        });
        return { success: true, action_taken: 'cancelled_stale_orders' };
      } catch (err) {
        return { success: false, action_taken: 'cancel_stale_orders_failed', error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (violation.missing_sl || violation.missing_tp) {
      try {
        const results = await repairUnprotectedPositions(provider, store);
        const success = results.repair_successes > 0;
        return {
          success,
          action_taken: 'recreated_protection',
          error: success ? undefined : results.failures.join(', ')
        };
      } catch (err) {
        return { success: false, action_taken: 'recreate_protection_failed', error: err instanceof Error ? err.message : String(err) };
      }
    }

    await store.upsertTradeTruth({
      ...row,
      status: 'RECOVERY_REQUIRED',
      recovery_status: 'repair_failed',
      latest_error: `Unsafe violation: ${violation.reason}`,
      last_action_taken: 'recovery:manual_intervention_required',
      latest_sync_at: new Date().toISOString()
    });
    return { success: false, action_taken: 'manual_intervention_required' };
  }
}

export interface CapitalMetrics {
  provider: string;
  environment: string;
  balance: number;
  equity: number;
  available_margin: number;
  used_margin: number;
  drawdown: number;
  peak_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  win_rate: number;
  profit_factor: number;
  consecutive_losses: number;
}

export class CapitalManager {
  static calculateMetrics(
    walletBalance: number,
    availableMargin: number,
    usedMargin: number,
    trades: TradeManagementTruthRow[],
    peakEquityStored = walletBalance
  ): CapitalMetrics {
    let unrealized_pnl = 0;
    for (const t of trades) {
      if (t.protection_status !== 'closed' && t.status !== 'closed') {
        unrealized_pnl += Number(t.unrealized_pnl ?? 0);
      }
    }

    const equity = walletBalance + unrealized_pnl;
    const peak_equity = Math.max(peakEquityStored, equity);
    const drawdown = peak_equity > 0 ? (peak_equity - equity) / peak_equity : 0;

    const closedTrades = trades.filter(
      t => t.protection_status === 'closed' || t.status === 'closed'
    );

    let realized_pnl = 0;
    let wins = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    const sortedClosed = [...closedTrades].sort(
      (a, b) => new Date(a.latest_sync_at).getTime() - new Date(b.latest_sync_at).getTime()
    );

    let consecutive_losses = 0;
    let currentLossStreak = 0;

    for (const t of sortedClosed) {
      const pnl = Number(t.unrealized_pnl ?? 0);
      realized_pnl += pnl;

      if (pnl > 0) {
        wins++;
        grossProfit += pnl;
        currentLossStreak = 0;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl);
        currentLossStreak++;
        if (currentLossStreak > consecutive_losses) {
          consecutive_losses = currentLossStreak;
        }
      }
    }

    const totalClosed = closedTrades.length;
    const win_rate = totalClosed > 0 ? wins / totalClosed : 0;
    const profit_factor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    return {
      provider: trades[0]?.provider ?? 'unknown',
      environment: trades[0]?.environment ?? 'testnet',
      balance: walletBalance,
      equity,
      available_margin: availableMargin,
      used_margin: usedMargin,
      drawdown,
      peak_equity,
      realized_pnl,
      unrealized_pnl,
      win_rate,
      profit_factor,
      consecutive_losses
    };
  }
}
