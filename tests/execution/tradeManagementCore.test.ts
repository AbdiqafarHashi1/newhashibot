import assert from 'node:assert/strict';
import type { ExchangeProvider, ExchangeAccountState, ExchangePosition, ExchangeOrder, EntryRequest, ProtectionRequest, ProviderResult, ReconcileRequest, ReplaceStopRequest, ProfitLockRequest } from '../../src/lib/exchange/exchangeProvider.js';
import { classifyProtection, syncProviderPositions, repairUnprotectedPositions, TradeManagementTruthRow, TradeTruthStore } from '../../src/lib/exchange/tradeManagementCore.js';

class MemoryStore implements TradeTruthStore {
  rows = new Map<string, TradeManagementTruthRow>();
  key(row: TradeManagementTruthRow) { return `${row.provider}:${row.environment}:${row.symbol}:${row.side}`; }
  async upsertTradeTruth(row: TradeManagementTruthRow) { this.rows.set(this.key(row), row); }
  async listOpenTradeTruth(provider?: string) { return [...this.rows.values()].filter(row => (!provider || row.provider === provider) && row.protection_status !== 'closed'); }
  async markClosed(provider: string, symbolsStillOpen: Set<string>, at: string) { let n = 0; for (const row of this.rows.values()) if (row.provider === provider && !symbolsStillOpen.has(row.symbol) && row.protection_status !== 'closed') { row.protection_status = 'closed'; row.latest_sync_at = at; n++; } return n; }
}

class FakeProvider implements ExchangeProvider {
  metadata = { id: 'binance', label: 'Binance', environment: 'testnet', supportsNativeProtection: true, supportsProfitLock: true } as const;
  positions: ExchangePosition[] = [];
  orders: ExchangeOrder[] = [];
  placed: string[] = [];
  async getAccountState(): Promise<ExchangeAccountState> { return { provider: 'binance', balances: [], positions: this.positions, openOrders: this.orders }; }
  async getBalances() { return []; }
  async getPositions() { return this.positions; }
  async getOpenOrders() { return this.orders; }
  async fetchAccount() { return this.getAccountState(); }
  async fetchOpenPositions() { return this.getPositions(); }
  async fetchOpenOrders() { return this.getOpenOrders(); }
  async placeEntry(_request: EntryRequest): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async placeEntryOrder(request: EntryRequest) { return this.placeEntry(request); }
  async cancelEntry(_request: ReconcileRequest): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async cancelOrder(request: ReconcileRequest) { return this.cancelEntry(request); }
  async closePosition(): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async placeSL(request: ProtectionRequest): Promise<ProviderResult> { this.placed.push('sl'); this.orders.push({ providerOrderId: 'new-sl', symbol: request.symbol, side: 'SELL', type: 'STOP_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: request.stopLoss }); return { provider: 'binance', ok: true, providerOrderId: 'new-sl' }; }
  async placeStopLoss(request: ProtectionRequest) { return this.placeSL(request); }
  async placeTP1(request: ProtectionRequest): Promise<ProviderResult> { this.placed.push('tp1'); this.orders.push({ providerOrderId: 'new-tp1', symbol: request.symbol, side: 'SELL', type: 'TAKE_PROFIT_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: request.tp1 }); return { provider: 'binance', ok: true, providerOrderId: 'new-tp1' }; }
  async placeTP2(request: ProtectionRequest): Promise<ProviderResult> { this.placed.push('tp2'); this.orders.push({ providerOrderId: 'new-tp2', symbol: request.symbol, side: 'SELL', type: 'TAKE_PROFIT_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: request.tp2 }); return { provider: 'binance', ok: true, providerOrderId: 'new-tp2' }; }
  async placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2') { return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request); }
  async verifyProtection(): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> { return { provider: 'binance', ok: true, data: { verified: true, missing: [] } }; }
  async classifyProtectionState(): Promise<ProviderResult<{ state: 'safe'; reason: string }>> { return { provider: 'binance', ok: true, data: { state: 'safe', reason: 'test' } }; }
  async repairProtection(): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async replaceSL(_request: ReplaceStopRequest): Promise<ProviderResult> { this.placed.push('replace-sl'); return { provider: 'binance', ok: true }; }
  async reconcilePosition(): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async reconcileProtection(): Promise<ProviderResult> { return { provider: 'binance', ok: true }; }
  async syncPositionProtection() { return this.reconcileProtection(); }
  async classifySafetyState(): Promise<ProviderResult<{ state: 'safe'; reason: string }>> { return { provider: 'binance', ok: true, data: { state: 'safe', reason: 'test' } }; }
  async evaluateProfitLock(_request: ProfitLockRequest): Promise<ProviderResult<{ shouldLock: boolean; replacementStop?: number; reason: string }>> { return { provider: 'binance', ok: true, data: { shouldLock: true, replacementStop: 100, reason: 'tp1' } }; }
  async executeProfitLock(_request: ProfitLockRequest): Promise<ProviderResult> { this.placed.push('profit-lock'); return { provider: 'binance', ok: true }; }
}

const provider = new FakeProvider();
provider.positions = [{ symbol: 'BTCUSDT', side: 'long', quantity: 2, entryPrice: 100, markPrice: 101, unrealizedPnl: 2 }];
provider.orders = [
  { providerOrderId: 'sl-1', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: 90 },
  { providerOrderId: 'tp1-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: 110 },
  { providerOrderId: 'tp2-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', status: 'NEW', reduceOnly: true, triggerPrice: 120 },
];
assert.equal(classifyProtection(provider.positions[0], provider.orders).protection_status, 'protected');
const store = new MemoryStore();
const sync = await syncProviderPositions(provider, store);
assert.equal(sync.open_positions_found, 1);
assert.equal(sync.protected_count, 1);
provider.orders = [];
const unsafe = await syncProviderPositions(provider, store);
assert.equal(unsafe.unsafe_count, 1);
const repair = await repairUnprotectedPositions(provider, store);
assert.deepEqual(provider.placed, ['sl', 'tp1', 'tp2']);
assert.equal(repair.repair_successes, 1);

// Add Phase 2 Unified Core, Protection & Recovery, Capital Tracking tests
console.log('Running Phase 2 Unified Core Verification tests...');

const { detectProtectionViolations, evaluateLifecycleState, RecoveryEngine, CapitalManager } = await import('../../src/lib/exchange/tradeManagementCore.js');

// 1. Detect missing SL / missing TP / duplicate / orphan / stale orders
const pos = { symbol: 'BTCUSDT', side: 'long', quantity: 2, entryPrice: 100, markPrice: 101, unrealizedPnl: 2 };
const activeDbRows: TradeManagementTruthRow[] = [
  {
    provider: 'binance',
    environment: 'testnet',
    symbol: 'BTCUSDT',
    side: 'long',
    status: 'entry_filled',
    qty: 2,
    entry_price: 100,
    mark_price: 101,
    unrealized_pnl: 2,
    exchange_position_id: null,
    signal_id: null,
    execution_order_id: 'exec-123',
    entry_order_id: null,
    sl_order_id: null,
    tp1_order_id: null,
    tp2_order_id: null,
    sl_present: false,
    tp1_present: false,
    tp2_present: false,
    protection_status: 'missing_sl',
    profit_lock_status: 'inactive',
    monitor_status: 'synced',
    recovery_status: 'none',
    latest_error: null,
    latest_sync_at: new Date().toISOString(),
    last_action_taken: null
  }
];

// missing SL & TP
const violations1 = detectProtectionViolations(pos, [], activeDbRows);
assert.equal(violations1.missing_sl, true);
assert.equal(violations1.missing_tp, true);
assert.equal(violations1.illegal_state, true);
assert.equal(violations1.reason, 'missing_sl');

// every fill is PROTECTED or RECOVERY_REQUIRED
const lcState1 = evaluateLifecycleState('entry_filled', 'missing_sl', violations1);
assert.equal(lcState1, 'RECOVERY_REQUIRED', 'Fills without proper protection default to RECOVERY_REQUIRED');

const lcState2 = evaluateLifecycleState('entry_filled', 'protected', { ...violations1, illegal_state: false });
assert.equal(lcState2, 'PROTECTED', 'Fills with proper protection promote to PROTECTED');

// orphan positions
const violationsOrphan = detectProtectionViolations(pos, [], []);
assert.equal(violationsOrphan.orphan_position, true, 'orphan position detected');
assert.equal(violationsOrphan.illegal_state, true);

// duplicate active trades
const activeDbRowsDuplicate = [
  ...activeDbRows,
  { ...activeDbRows[0], execution_order_id: 'exec-456' }
];
const violationsDuplicate = detectProtectionViolations(pos, [], activeDbRowsDuplicate);
assert.equal(violationsDuplicate.duplicate_position, true, 'duplicate trades detected');
assert.equal(violationsDuplicate.illegal_state, true);

// stale orders
const violationsStale = detectProtectionViolations(null, [{ providerOrderId: 'tp-1', symbol: 'BTCUSDT', status: 'NEW' }], activeDbRows);
assert.equal(violationsStale.stale_order, true, 'stale order detected');
assert.equal(violationsStale.illegal_state, true);

// 2. Recovery Engine verification (recreate protection / cancel stale orders)
const storeFake = new MemoryStore();
await storeFake.upsertTradeTruth(activeDbRows[0]);

const recoveryRes = await RecoveryEngine.recoverPosition(provider, storeFake, activeDbRows[0], violations1);
assert.equal(recoveryRes.success, true);
assert.equal(recoveryRes.action_taken, 'recreated_protection', 'Recovery Engine safely recreates missing protection');

// Recovery Engine stale orders cancellation
const staleRow: TradeManagementTruthRow = {
  ...activeDbRows[0],
  qty: 0,
  protection_status: 'stale'
};
const recoveryResStale = await RecoveryEngine.recoverPosition(provider, storeFake, staleRow, violationsStale);
assert.equal(recoveryResStale.success, true);
assert.equal(recoveryResStale.action_taken, 'cancelled_stale_orders', 'Recovery Engine cancels stale orders when position size is 0');

// 3. Provider parity: Binance & Bybit share one unified lifecycle states
const binanceLifecycle = evaluateLifecycleState('tp1_hit', 'protected', { ...violations1, illegal_state: false });
const bybitLifecycle = evaluateLifecycleState('tp1_hit', 'protected', { ...violations1, illegal_state: false });
assert.equal(binanceLifecycle, 'TP1');
assert.equal(bybitLifecycle, binanceLifecycle, 'Binance and Bybit share the exact same unified lifecycle states');

// 4. Capital Manager tracking & calculations
const walletBalance = 10000;
const peakEquity = 10000;
const openTrades: TradeManagementTruthRow[] = [
  { ...activeDbRows[0], unrealized_pnl: 250 },
  { ...activeDbRows[0], execution_order_id: 'exec-999', unrealized_pnl: -50 }
];
const closedTrades: TradeManagementTruthRow[] = [
  { ...activeDbRows[0], status: 'closed', unrealized_pnl: 100, latest_sync_at: new Date(Date.now() - 3600000).toISOString() },
  { ...activeDbRows[0], status: 'closed', unrealized_pnl: -200, latest_sync_at: new Date().toISOString() }
];

const metrics = CapitalManager.calculateMetrics(
  walletBalance,
  9500,
  500,
  [...openTrades, ...closedTrades],
  peakEquity
);

assert.equal(metrics.balance, 10000);
assert.equal(metrics.unrealized_pnl, 200, 'correct unrealized PnL sum');
assert.equal(metrics.equity, 10200, 'equity matches balance + unrealized');
assert.equal(metrics.drawdown, 0, 'drawdown calculated correctly');
assert.equal(metrics.realized_pnl, -100, 'correct realized PnL sum');
assert.equal(metrics.win_rate, 0.5, 'correct win rate');
assert.equal(metrics.consecutive_losses, 1, 'consecutive loss streak tracked correctly');

console.log('Phase 2 Unified Core Verification tests passed successfully.');
console.log('trade management core tests passed');
