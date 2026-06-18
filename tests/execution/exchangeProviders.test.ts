import assert from 'node:assert/strict';
import { ExchangeProviderBybit, createBybitOrderLinkId } from '../../src/lib/exchange/ExchangeProviderBybit.js';
import { ExchangeProviderMT5 } from '../../src/lib/exchange/ExchangeProviderMT5.js';
import { executeSignalAcrossProviders } from '../../src/lib/exchange/executionRouter.js';
import type { ExchangeProvider, EntryRequest } from '../../src/lib/exchange/exchangeProvider.js';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function run() {
  assert.throws(() => new ExchangeProviderBybit({ baseUrl: 'https://api.bybit.com' }), /testnet provider must use a testnet domain/, 'Bybit testnet adapter refuses live domain');
  const demoBybit = new ExchangeProviderBybit({ environment: 'demo', apiKey: 'key', apiSecret: 'secret' });
  assert.equal(demoBybit.metadata.environment, 'demo', 'Bybit adapter supports Demo Trading environment');

  const calls: Array<{ url: string; method: string; body?: string | null; headers?: Record<string, string> }> = [];
  const authDebug: unknown[] = [];
  const bybit = new ExchangeProviderBybit({
    apiKey: 'key',
    apiSecret: 'secret',
    now: () => 1781308800073,
    debugAuth: true,
    logger: { debug: (_message: string, details?: unknown) => { authDebug.push(details); } },
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: String(init?.method), body: init?.body?.toString(), headers: init?.headers as Record<string, string> });
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
  assert.match(calls.find((call) => call.url.includes('/v5/position/list'))?.url ?? '', /category=linear&settleCoin=USDT/, 'Bybit positions include required V5 params');
  assert.match(calls.find((call) => call.url.includes('/v5/order/realtime'))?.url ?? '', /category=linear&openOnly=0&settleCoin=USDT/, 'Bybit open orders include required V5 params');
  const walletCall = calls.find((call) => call.url.includes('/v5/account/wallet-balance'));
  assert.equal(walletCall?.url, 'https://api-testnet.bybit.com/v5/account/wallet-balance?accountType=UNIFIED', 'Bybit GET query string is deterministic and included in the URL');
  assert.equal(walletCall?.headers?.['X-BAPI-API-KEY'], 'key', 'Bybit sends API key header');
  assert.equal(walletCall?.headers?.['X-BAPI-TIMESTAMP'], '1781308800073', 'Bybit sends millisecond timestamp header');
  assert.equal(walletCall?.headers?.['X-BAPI-RECV-WINDOW'], '5000', 'Bybit sends recv_window header');
  assert.equal(walletCall?.headers?.['X-BAPI-SIGN'], '3f72e113827b035c8832d7248adbd22f7cb9aaa5f92463c3044fd5ad3175c8b8', 'Bybit GET signature signs timestamp + apiKey + recvWindow + queryString');
  assert.deepEqual(authDebug.find((entry) => (entry as { endpoint?: string }).endpoint === '/v5/account/wallet-balance'), { endpoint: '/v5/account/wallet-balance', method: 'GET', timestamp: '1781308800073', recv_window: 5000, pre_sign_string: '1781308800073[REDACTED_API_KEY]5000accountType=UNIFIED', signature_length: 64 }, 'Bybit auth debug logs safe signing metadata only');

  const longOrderLinkId = createBybitOrderLinkId('123e4567-e89b-12d3-a456-426614174000-with-extra-tracing-data', 'entry', 1781308800073);
  assert.equal(longOrderLinkId.length <= 45, true, 'Bybit orderLinkId helper caps IDs at 45 characters');
  assert.equal(longOrderLinkId, 'hb_123e4567e89b12d3_entry_mqbl9mq1', 'Bybit orderLinkId keeps a traceable signal prefix, purpose, and timestamp');

  const entry = await bybit.placeEntry({ signalId: 'sig-1', symbol: 'ETHUSDT', side: 'long', quantity: 0.2, stopLoss: 2900, tp1: 3050, tp2: 3100 });
  assert.equal(entry.ok, true);
  assert.equal(entry.providerOrderId, 'order-1');
  const entryCall = calls.find((call) => call.url.startsWith('https://api-testnet.bybit.com/v5/order/create'));
  assert.equal(Boolean(entryCall), true, 'Bybit uses testnet REST endpoint by default');
  const entryPayload = JSON.parse(entryCall?.body ?? '{}') as { orderLinkId?: string };
  assert.equal(entryPayload.orderLinkId, 'hb_sig1_entry_mqbl9mq1', 'Bybit entry orderLinkId is short and traceable');
  assert.equal((entryPayload.orderLinkId ?? '').length <= 45, true, 'Bybit entry orderLinkId stays within the V5 45-character limit');
  assert.equal(entryCall?.headers?.['X-BAPI-SIGN'], '987b87b4daffa5582a4a893d200402f802fcb15070c1881a3ec5b9080ec675ee', 'Bybit POST signature signs timestamp + apiKey + recvWindow + requestBody');

  const sl = await bybit.placeSL({ symbol: 'ETHUSDT', side: 'long', quantity: 0.2, stopLoss: 2900, tp1: 3050, tp2: 3100, metadata: { executionId: 'exec-1' } });
  assert.equal(authDebug.some((entry) => (entry as { retCode?: number }).retCode === 0), true, 'Bybit logs safe request result debug with retCode/retMsg');
  assert.equal(sl.status, 'sl_submitted');
  assert.match([...calls].reverse().find((call) => call.url.includes('/v5/order/create'))?.body ?? '', /"reduceOnly":true/, 'Bybit protection orders are reduce-only');

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
