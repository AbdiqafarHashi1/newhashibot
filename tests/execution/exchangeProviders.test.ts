import assert from 'node:assert/strict';
import { ExchangeProviderBybit, createBybitOrderLinkId } from '../../src/lib/exchange/ExchangeProviderBybit.js';
import { ExchangeProviderMT5 } from '../../src/lib/exchange/ExchangeProviderMT5.js';
import { executeSignalAcrossProviders, executeSignalForIsolatedAccounts, executionScopeKey, validateExecutionTargets } from '../../src/lib/exchange/executionRouter.js';
import type { ExchangeProvider, EntryRequest } from '../../src/lib/exchange/exchangeProvider.js';
import { AccountScopedCredentialResolver, credentialSafeMetadata } from '../../src/lib/exchange/accountCredentialResolver.js';
import { AccountProviderFactory } from '../../src/lib/exchange/accountProviderFactory.js';
import { createExecutionOwnership } from '../../src/lib/exchange/executionOwnership.js';
import { ProviderMonitor, monitorOwnedExecutions } from '../../src/lib/exchange/providerMonitor.js';

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
  assert.equal(mt5.metadata.id, 'mt5', 'MT5 default ID is mt5');
  assert.equal(mt5.metadata.environment, 'future', 'MT5 environment is future');

  const mt5Personal = new ExchangeProviderMT5('mt5_personal');
  assert.equal(mt5Personal.metadata.id, 'mt5_personal');
  assert.equal(mt5Personal.metadata.environment, 'personal');

  const mt5Prop = new ExchangeProviderMT5('mt5_prop');
  assert.equal(mt5Prop.metadata.id, 'mt5_prop');
  assert.equal(mt5Prop.metadata.environment, 'prop');

  const okProvider = Object.assign(Object.create(Object.getPrototypeOf(mt5Personal)), mt5Personal, { metadata: { ...mt5Personal.metadata, id: 'ok' }, async placeEntry(request: EntryRequest) { return { provider: 'ok', ok: true, providerOrderId: `${request.symbol}-ok` }; } }) as ExchangeProvider;
  const failProvider = Object.assign(Object.create(Object.getPrototypeOf(mt5Personal)), mt5Personal, { metadata: { ...mt5Personal.metadata, id: 'fail' }, async placeEntry() { throw new Error('provider down'); } }) as ExchangeProvider;
  const routed = await executeSignalAcrossProviders({ signalId: 'sig-2', symbol: 'BTCUSDT', side: 'long', quantity: 1, stopLoss: 90, tp1: 110, tp2: 120 }, [{ provider: okProvider, enabled: true, primary: true }, { provider: failProvider, enabled: true }], { mode: 'parallel', executionGroupId: 'group-1' });
  assert.equal(routed.executionGroupId, 'group-1');
  assert.equal(routed.results.length, 2);
  assert.equal(routed.results.find((result) => result.provider === 'ok')?.ok, true);
  assert.equal(routed.results.find((result) => result.provider === 'fail')?.ok, false, 'provider failure is isolated');

  const accountA = { customerId: 'customer-a', accountId: 'binance-1', credentialRef: 'vault://customer-a/binance-1', instanceId: 'worker-a' };
  const accountB = { customerId: 'customer-a', accountId: 'binance-2', credentialRef: 'vault://customer-a/binance-2', instanceId: 'worker-b' };
  assert.notEqual(executionScopeKey('ok', accountA), executionScopeKey('ok', accountB), 'multiple accounts on one provider have independent scope keys');
  assert.throws(() => validateExecutionTargets([{ provider: okProvider, enabled: true }], true), /execution_scope_required/, 'isolated routing rejects unscoped accounts');
  assert.throws(() => validateExecutionTargets([{ provider: okProvider, enabled: true, scope: accountA }, { provider: okProvider, enabled: true, scope: accountA }], true), /duplicate_execution_scope/, 'one mutable execution scope cannot be routed twice');
  const isolated = await executeSignalForIsolatedAccounts({ signalId: 'sig-3', symbol: 'BTCUSDT', side: 'long', quantity: 1, stopLoss: 90, tp1: 110, tp2: 120 }, [{ provider: okProvider, enabled: true, primary: true, scope: accountA }, { provider: okProvider, enabled: true, scope: accountB }], { mode: 'parallel', executionGroupId: 'group-isolated' });
  assert.equal(isolated.results.length, 2);
  assert.equal(new Set(isolated.results.map((result) => result.scopeKey)).size, 2, 'each account owns an independent result identity');

  const credentials = new AccountScopedCredentialResolver({ async resolve(customerId, provider, accountId) { return { customerId, provider, accountId, credentialRef: accountA.credentialRef, apiKey: 'private-key', apiSecret: 'private-secret', enabled: true }; } });
  const resolved = await credentials.resolve('ok', accountA);
  assert.deepEqual(credentialSafeMetadata(resolved), { customerId: 'customer-a', provider: 'ok', accountId: 'binance-1', credentialRef: accountA.credentialRef });
  assert.equal(JSON.stringify(credentialSafeMetadata(resolved)).includes('private-secret'), false, 'credential material cannot enter safe metadata');
  await assert.rejects(() => credentials.resolve('ok', { ...accountA, credentialRef: 'vault://wrong' }), /execution_credential_scope_mismatch/, 'credentials fail closed on scope mismatch');

  let factorySecret = '';
  const factory = new AccountProviderFactory(credentials, { ok: (secret) => { factorySecret = secret.apiSecret; return okProvider; } });
  const scoped = await factory.create('ok', accountA);
  assert.equal(factorySecret, 'private-secret', 'credential material is delivered directly to the provider constructor');
  assert.equal(JSON.stringify(scoped).includes('private-secret'), false, 'scoped provider descriptors never expose credential material');
  assert.equal(Object.isFrozen(scoped.ownership), true, 'execution ownership is immutable');

  const ownershipA = createExecutionOwnership('ok', accountA);
  const ownershipB = createExecutionOwnership('ok', accountB);
  const monitorA = new ProviderMonitor(okProvider, ownershipA);
  const monitorFailProvider = Object.assign(Object.create(Object.getPrototypeOf(failProvider)), failProvider, { async reconcilePosition() { throw new Error('account unavailable'); } }) as ExchangeProvider;
  const monitorB = new ProviderMonitor(monitorFailProvider, ownershipB);
  const leaseKeys: string[] = [];
  const leaseStore = {
    async acquire(scopeKey: string) { leaseKeys.push(scopeKey); return true; },
    async release() {},
  };
  const monitored = await monitorOwnedExecutions([
    { monitor: monitorA, input: { symbol: 'BTCUSDT', ownership: ownershipA } },
    { monitor: monitorB, input: { symbol: 'ETHUSDT', ownership: ownershipB } },
  ], leaseStore, 'run-1');
  assert.equal(new Set(leaseKeys).size, 2, 'monitor leases are account scoped');
  assert.equal(monitored[0].status, 'fulfilled');
  assert.equal(monitored[1].status, 'rejected', 'one account monitor failure cannot abort another account');
  await assert.rejects(() => monitorA.run({ symbol: 'BTCUSDT', ownership: ownershipB }), /mixed_execution_ownership/, 'monitoring fails closed on mixed ownership');
}

run().then(() => console.log('exchange provider tests passed'));
