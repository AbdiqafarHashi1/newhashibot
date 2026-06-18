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
console.log('trade management core tests passed');
