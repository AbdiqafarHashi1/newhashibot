import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProtection, repairUnprotectedPositions, syncProviderPositions, type TradeManagementTruthRow, type TradeTruthStore } from '../../execution/trade-management-core.js';
import { ExchangeProviderExecutionAdapter } from '../../execution/adapters/provider-adapter.js';
import type { Command } from '../../execution/command-queue/index.js';
import type { CommandId } from '../../packages/types/index.js';
import type { ExchangeProvider, ExchangeOrder, ExchangePosition, ProviderResult } from '../../execution/exchange-provider.js';

class MemoryStore implements TradeTruthStore {
  rows: TradeManagementTruthRow[] = [];
  async upsertTradeTruth(row: TradeManagementTruthRow) { this.rows = this.rows.filter(existing => existing.symbol !== row.symbol); this.rows.push(row); }
  async listOpenTradeTruth() { return this.rows.filter(row => row.protection_status !== 'closed'); }
  async markClosed(_provider: string, symbolsStillOpen: Set<string>, at: string) { let count = 0; for (const row of this.rows) if (!symbolsStillOpen.has(row.symbol)) { row.protection_status = 'closed'; row.latest_sync_at = at; count++; } return count; }
}

function provider(position: ExchangePosition, orders: ExchangeOrder[] = []): ExchangeProvider {
  const ok = <T extends Record<string, unknown>>(data: T = {} as T): ProviderResult<T> => ({ provider: 'binance', ok: true, data });
  return {
    metadata: { id: 'binance', label: 'Binance Testnet', environment: 'testnet', supportsNativeProtection: true, supportsProfitLock: true },
    async getAccountState() { return { provider: 'binance', balances: [], positions: [position], openOrders: orders }; },
    async getBalances() { return []; }, async getPositions() { return [position]; }, async getOpenOrders() { return orders; }, async fetchAccount() { return this.getAccountState(); }, async fetchOpenPositions() { return [position]; }, async fetchOpenOrders() { return orders; },
    async placeEntry() { return ok({ entry: true }); }, async placeEntryOrder() { return ok({ entry: true }); }, async cancelEntry() { return ok(); }, async cancelOrder() { return ok(); }, async closePosition() { return ok({ closed: true }); },
    async placeSL(req) { orders.push({ providerOrderId: 'sl_new', symbol: req.symbol, side: 'sell', type: 'STOP_MARKET', status: 'NEW', triggerPrice: req.stopLoss, reduceOnly: true }); return ok(); }, async placeStopLoss(req) { return this.placeSL(req); },
    async placeTP1(req) { orders.push({ providerOrderId: 'tp1_new', symbol: req.symbol, side: 'sell', type: 'TAKE_PROFIT_MARKET', status: 'NEW', triggerPrice: req.tp1, reduceOnly: true }); return ok(); }, async placeTP2(req) { orders.push({ providerOrderId: 'tp2_new', symbol: req.symbol, side: 'sell', type: 'TAKE_PROFIT_MARKET', status: 'NEW', triggerPrice: req.tp2, reduceOnly: true }); return ok(); }, async placeTakeProfit(req, target) { return target === 'tp1' ? this.placeTP1(req) : this.placeTP2(req); },
    async verifyProtection() { return ok({ verified: true, missing: [] }); }, async classifyProtectionState() { return ok({ state: 'safe', reason: 'test' }); }, async repairProtection() { return ok({ repaired: true }); }, async replaceSL() { return ok({ replaced: true }); }, async reconcilePosition() { return ok(); }, async reconcileProtection() { return ok(); }, async syncPositionProtection() { return ok(); }, async classifySafetyState() { return ok({ state: 'safe', reason: 'test' }); }, async evaluateProfitLock() { return ok({ shouldLock: true, reason: 'test' }); }, async executeProfitLock() { return ok({ locked: true }); },
  };
}

test('classifies complete exchange-native protection', () => {
  const position = { symbol: 'BTCUSDT', side: 'long', quantity: 1, entryPrice: 100, markPrice: 100 };
  const result = classifyProtection(position, [
    { providerOrderId: 'sl', symbol: 'BTCUSDT', side: 'sell', type: 'STOP_MARKET', status: 'NEW', triggerPrice: 95, reduceOnly: true },
    { providerOrderId: 'tp1', symbol: 'BTCUSDT', side: 'sell', type: 'TAKE_PROFIT_MARKET', status: 'NEW', triggerPrice: 105, reduceOnly: true },
    { providerOrderId: 'tp2', symbol: 'BTCUSDT', side: 'sell', type: 'TAKE_PROFIT_MARKET', status: 'NEW', triggerPrice: 110, reduceOnly: true },
  ]);
  assert.equal(result.protection_status, 'protected');
});

test('sync and repair use live provider state', async () => {
  const p = provider({ symbol: 'BTCUSDT', side: 'long', quantity: 1, entryPrice: 100, markPrice: 100 });
  const store = new MemoryStore();
  assert.equal((await syncProviderPositions(p, store)).unsafe_count, 1);
  assert.equal((await repairUnprotectedPositions(p, store)).repair_successes, 1);
  assert.equal(store.rows[0].protection_status, 'protected');
});

test('execution adapter delegates commands to exchange provider', async () => {
  const p = provider({ symbol: 'BTCUSDT', side: 'long', quantity: 1, entryPrice: 100, markPrice: 100 });
  const adapter = new ExchangeProviderExecutionAdapter(p);
  await adapter.connect();
  const command = { id: 'cmd_1' as CommandId, idempotencyKey: 'k', customerId: 'cust', executorId: 'exec', accountId: 'acct', adapterType: 'binance', action: 'OpenPosition', payload: { symbol: 'BTCUSDT', side: 'long', quantity: 1, stopLoss: 95, tp1: 105, tp2: 110 }, state: 'Queued', retryPolicy: { maxAttempts: 3, backoffMs: 1, retryableErrors: [] }, verificationPolicy: { required: true, timeoutMs: 1, checks: [] }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() } satisfies Command;
  assert.equal((await adapter.openPosition(command) as ProviderResult).ok, true);
});
