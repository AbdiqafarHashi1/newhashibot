import assert from 'node:assert/strict';
import { ExchangeProviderBybit } from '../../src/lib/exchange/ExchangeProviderBybit.js';
import { ExchangeProviderMT5 } from '../../src/lib/exchange/ExchangeProviderMT5.js';
import { executeSignalAcrossProviders } from '../../src/lib/exchange/executionRouter.js';
import type { ExchangeProvider, EntryRequest } from '../../src/lib/exchange/exchangeProvider.js';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function run() {
  assert.throws(() => new ExchangeProviderBybit({ baseUrl: 'https://api.bybit.com' }), /testnet-only/, 'Bybit adapter refuses live domain');

  const calls: Array<{ url: string; method: string; body?: string | null }> = [];
  const bybit = new ExchangeProviderBybit({
    apiKey: 'key',
    apiSecret: 'secret',
    now: () => 1781308800073,
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: String(init?.method), body: init?.body?.toString() });
      if (String(url).includes('/v5/account/wallet-balance')) return jsonResponse({ retCode: 0, retMsg: 'OK', result: { list: [{ coin: [{ coin: 'USDT', availableToWithdraw: '100', equity: '125' }] }] } });
      if (String(url).includes('/v5/position/list')) return jsonResponse({ retCode: 0, retMsg: 'OK', result: { list: [{ symbol: 'ETHUSDT', side: 'Buy', size: '0.2', avgPrice: '3000', markPrice: '3010', unrealisedPnl: '2' }] } });
      if (String(url).includes('/v5/order/realtime')) return jsonResponse({ retCode: 0, retMsg: 'OK', result: { list: [{ orderId: 'sl-1', symbol: 'ETHUSDT', side: 'Sell', orderType: 'Market', orderStatus: 'New', qty: '0.2', triggerPrice: '2900', reduceOnly: true }] } });
      if (String(url).includes('/v5/order/create')) return jsonResponse({ retCode: 0, retMsg: 'OK', result: { orderId: 'order-1', orderLinkId: 'link-1' } });
      if (String(url).includes('/v5/order/cancel')) return jsonResponse({ retCode: 0, retMsg: 'OK', result: { orderId: 'order-1' } });
      return jsonResponse({ retCode: 0, retMsg: 'OK', result: {} });
    }) as typeof fetch,
  });

  const account = await bybit.getAccountState();
  assert.equal(account.provider, 'bybit');
  assert.equal(account.balances[0].asset, 'USDT');
  assert.equal(account.positions[0].symbol, 'ETHUSDT');
  assert.equal(account.openOrders[0].providerOrderId, 'sl-1');

  const entry = await bybit.placeEntry({ signalId: 'sig-1', symbol: 'ETHUSDT', side: 'long', quantity: 0.2, stopLoss: 2900, tp1: 3050, tp2: 3100 });
  assert.equal(entry.ok, true);
  assert.equal(entry.providerOrderId, 'order-1');
  assert.equal(calls.some((call) => call.url.startsWith('https://api-testnet.bybit.com/v5/order/create')), true, 'Bybit uses testnet REST endpoint');

  const sl = await bybit.placeSL({ symbol: 'ETHUSDT', side: 'long', quantity: 0.2, stopLoss: 2900, tp1: 3050, tp2: 3100, metadata: { executionId: 'exec-1' } });
  assert.equal(sl.status, 'sl_submitted');
  assert.match(calls.at(-1)?.body ?? '', /"reduceOnly":true/, 'Bybit protection orders are reduce-only');

  const mt5 = new ExchangeProviderMT5();
  assert.equal((await mt5.placeEntry()).status, 'not_implemented', 'MT5 is stubbed only');

  const okProvider = Object.assign(Object.create(Object.getPrototypeOf(mt5)), mt5, { metadata: { ...mt5.metadata, id: 'ok' }, async placeEntry(request: EntryRequest) { return { provider: 'ok', ok: true, providerOrderId: `${request.symbol}-ok` }; } }) as ExchangeProvider;
  const failProvider = Object.assign(Object.create(Object.getPrototypeOf(mt5)), mt5, { metadata: { ...mt5.metadata, id: 'fail' }, async placeEntry() { throw new Error('provider down'); } }) as ExchangeProvider;
  const routed = await executeSignalAcrossProviders({ signalId: 'sig-2', symbol: 'BTCUSDT', side: 'long', quantity: 1, stopLoss: 90, tp1: 110, tp2: 120 }, [{ provider: okProvider, enabled: true, primary: true }, { provider: failProvider, enabled: true }], { mode: 'parallel', executionGroupId: 'group-1' });
  assert.equal(routed.executionGroupId, 'group-1');
  assert.equal(routed.results.length, 2);
  assert.equal(routed.results.find((result) => result.provider === 'ok')?.ok, true);
  assert.equal(routed.results.find((result) => result.provider === 'fail')?.ok, false, 'provider failure is isolated');
}

run().then(() => console.log('exchange provider tests passed'));
