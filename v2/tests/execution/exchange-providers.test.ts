import test from 'node:test';
import assert from 'node:assert/strict';
import type { Command } from '../../execution/command-queue/index.js';
import { BinanceExchangeProvider, BinanceExecutionAdapter, classifyBinanceError, createBinanceClientOrderId, normalizeBinanceSymbol, roundBinancePrice, roundBinanceQuantity, signBinanceRequest, validateBinanceMinimums } from '../../execution/adapters/binance/index.js';
import { BybitExchangeProvider, BybitExecutionAdapter, bybitV5QueryString, classifyBybitError, createBybitOrderLinkId, normalizeBybitSymbol, roundBybitPrice, roundBybitQuantity, signBybitV5, validateBybitMinimums } from '../../execution/adapters/bybit/index.js';

function jsonResponse(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
function command(action: Command['action'], payload: Record<string, unknown>): Command { return { id:'cmd_1' as never, idempotencyKey:`cust:acct:sig:${action}`, customerId:'cust', executorId:'exec', accountId:'acct', signalId:'sig_1' as never, tradeId:'trade_1' as never, adapterType:'binance' as never, action, payload, state:'Queued', retryPolicy:{maxAttempts:3,backoffMs:1,retryableErrors:[]}, verificationPolicy:{required:true,timeoutMs:1000,checks:[]}, createdAt:new Date(0).toISOString(), updatedAt:new Date(0).toISOString() }; }

test('Binance signing, symbol normalization, precision, minimums, and identity', () => {
  assert.equal(signBinanceRequest('secret', 'symbol=BTCUSDT&timestamp=1'), 'ef9d3d77a34d9a13a21a4c2d7f3e8cb091888a74ca62b5b62f430e78eded95ba');
  assert.equal(normalizeBinanceSymbol('btc/usdt:perp'), 'BTCUSDT');
  assert.equal(roundBinanceQuantity(1.239, { stepSize: 0.01, quantityPrecision: 2 }), 1.23);
  assert.equal(roundBinancePrice(25000.129, { tickSize: 0.1, pricePrecision: 1 }), 25000.1);
  assert.deepEqual(validateBinanceMinimums(0.01, 1000, { minQty: 0.001, minNotional: 5 }), { ok: true });
  assert.equal(validateBinanceMinimums(0.0001, 1000, { minQty: 0.001, minNotional: 5 }).ok, false);
  assert.equal(new BinanceExchangeProvider({ apiKey:'k', apiSecret:'s' }).metadata.id, 'binance');
  assert.equal(createBinanceClientOrderId('123e4567-e89b', 'entry', 1781308800073).startsWith('hb_123e4567e89b_entry_'), true);
});

test('Bybit signing, query ordering, symbol normalization, precision, minimums, and identity', () => {
  const query = bybitV5QueryString({ settleCoin:'USDT', category:'linear', openOnly:0 });
  assert.equal(query, 'category=linear&openOnly=0&settleCoin=USDT');
  assert.equal(signBybitV5('secret', `1781308800073key5000${query}`), 'f027be8e28a84a4739e8fd2cfc45616081ee1e7340f09028427d8b51474629e4');
  assert.equal(normalizeBybitSymbol('eth/usdt-perp'), 'ETHUSDT');
  assert.equal(roundBybitQuantity(2.349, { qtyStep: 0.1 }), 2.3);
  assert.equal(roundBybitPrice(123.456, { tickSize: 0.05 }), 123.45);
  assert.deepEqual(validateBybitMinimums(1, { minQty: 0.1 }), { ok: true });
  assert.equal(validateBybitMinimums(0.01, { minQty: 0.1 }).ok, false);
  assert.equal(new BybitExchangeProvider({ apiKey:'k', apiSecret:'s' }).metadata.id, 'bybit');
  assert.equal(createBybitOrderLinkId('123e4567-e89b-12d3-a456-426614174000-with-extra', 'entry', 1781308800073).length <= 45, true);
});

test('Binance maps balances, positions, open orders, open/cancel/protection commands, adapter delegation, and classifications without live network', async () => {
  const calls: Array<{url:string; init?:RequestInit}> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => { const url=String(input); calls.push({url,init});
    if (url.includes('/exchangeInfo')) return jsonResponse({ symbols:[{ symbol:'BTCUSDT', quantityPrecision:3, pricePrecision:2, filters:[{filterType:'LOT_SIZE', stepSize:'0.001', minQty:'0.001'},{filterType:'PRICE_FILTER', tickSize:'0.10'},{filterType:'MIN_NOTIONAL', notional:'5'}]}] });
    if (url.includes('/fapi/v2/account')) return jsonResponse({ assets:[{asset:'USDT', availableBalance:'10', initialMargin:'2', walletBalance:'12'}] });
    if (url.includes('/positionRisk')) return jsonResponse([{symbol:'BTCUSDT', positionAmt:'0.5', entryPrice:'100', markPrice:'110', unRealizedProfit:'5'}]);
    if (url.includes('/openOrders')) return jsonResponse([{orderId:1, symbol:'BTCUSDT', side:'SELL', type:'STOP_MARKET', status:'NEW', origQty:'0.5', stopPrice:'90', reduceOnly:true, clientOrderId:'hb_trade_sl_x'}, {orderId:2, symbol:'BTCUSDT', side:'SELL', type:'TAKE_PROFIT_MARKET', status:'NEW', origQty:'0.25', stopPrice:'120', reduceOnly:true, clientOrderId:'hb_trade_tp1_x'}, {orderId:3, symbol:'BTCUSDT', side:'SELL', type:'TAKE_PROFIT_MARKET', status:'NEW', origQty:'0.25', stopPrice:'130', reduceOnly:true, clientOrderId:'hb_trade_tp2_x'}]);
    if (url.includes('/leverage')) return jsonResponse({ leverage: 3 });
    if (url.includes('/order')) return jsonResponse({ orderId: 99, clientOrderId:'hb_sig_entry_x', status:'NEW' });
    return jsonResponse({serverTime: 1});
  };
  const provider = new BinanceExchangeProvider({ apiKey:'key', apiSecret:'secret', fetchImpl: fetchImpl as typeof fetch, now:()=>1781308800073 });
  assert.deepEqual(await provider.getBalances(), [{ asset:'USDT', free:10, locked:2, total:12 }]);
  assert.equal((await provider.getPositions())[0].side, 'long');
  assert.equal((await provider.getOpenOrders('BTCUSDT'))[0].metadata?.clientOrderId, 'hb_trade_sl_x');
  const entry = await provider.placeEntry({ signalId:'sig', symbol:'btc/usdt', side:'long', quantity:0.1239, entryPrice:100.129, stopLoss:90, tp1:120, tp2:130, leverage:3 });
  assert.equal(entry.providerOrderId, '99');
  await provider.cancelOrder({ symbol:'BTCUSDT', providerOrderId:'99' });
  const sl = await provider.placeSL({ symbol:'BTCUSDT', side:'long', quantity:0.5, stopLoss:90, tp1:120, tp2:130, metadata:{executionId:'trade'} });
  assert.equal(sl.status, 'sl_submitted');
  assert.deepEqual((await provider.verifyProtection({ symbol:'BTCUSDT' })).data, { verified:true, missing:[] });
  const adapter = new BinanceExecutionAdapter(provider); await adapter.connect();
  const adapted = await adapter.openPosition(command('OpenPosition', { symbol:'BTCUSDT', side:'long', quantity:0.1, entryPrice:100, stopLoss:90, tp1:120, tp2:130 }));
  assert.equal(adapted.ok, true);
  assert.equal(calls.some(c => c.url.includes('signature=')), true);
  assert.equal(classifyBinanceError(503).retryable, true);
  assert.equal(classifyBinanceError(400, -2015, 'bad key').retryable, false);
});

test('Bybit maps balances, positions, open orders, open/cancel/protection commands, adapter delegation, and classifications without live network', async () => {
  const calls: Array<{url:string; body?:string; headers?:HeadersInit}> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => { const url=String(input); calls.push({url,body:init?.body as string|undefined,headers:init?.headers});
    if (url.includes('/v5/market/instruments-info')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ list:[{ symbol:'ETHUSDT', lotSizeFilter:{ qtyStep:'0.01', minOrderQty:'0.01' }, priceFilter:{ tickSize:'0.05' } }] } });
    if (url.includes('/v5/account/wallet-balance')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ list:[{ coin:[{ coin:'USDT', availableToWithdraw:'10', walletBalance:'12', equity:'12' }] }] } });
    if (url.includes('/v5/position/list')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ list:[{ symbol:'ETHUSDT', side:'Sell', size:'1.5', avgPrice:'100', markPrice:'90', unrealisedPnl:'15' }] } });
    if (url.includes('/v5/order/realtime')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ list:[{ orderId:'1', orderLinkId:'hb_trade_sl_x', symbol:'ETHUSDT', side:'Buy', orderType:'Market', orderStatus:'New', qty:'1', triggerPrice:'105', reduceOnly:true },{ orderId:'2', orderLinkId:'hb_trade_tp1_x', symbol:'ETHUSDT', side:'Buy', orderType:'Market', orderStatus:'New', qty:'1', triggerPrice:'80', reduceOnly:true },{ orderId:'3', orderLinkId:'hb_trade_tp2_x', symbol:'ETHUSDT', side:'Buy', orderType:'Market', orderStatus:'New', qty:'1', triggerPrice:'70', reduceOnly:true }] } });
    if (url.includes('/v5/order/create')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ orderId:'99', orderLinkId:'hb_sig_entry_x' } });
    if (url.includes('/v5/order/cancel')) return jsonResponse({ retCode:0, retMsg:'OK', result:{ orderId:'99' } });
    return jsonResponse({ retCode:0, retMsg:'OK', result:{} });
  };
  const provider = new BybitExchangeProvider({ apiKey:'key', apiSecret:'secret', fetchImpl: fetchImpl as typeof fetch, now:()=>1781308800073 });
  assert.deepEqual(await provider.getBalances(), [{ asset:'USDT', free:10, total:12, locked:2 }]);
  assert.equal((await provider.getPositions())[0].side, 'short');
  assert.equal((await provider.getOpenOrders('ETHUSDT'))[0].metadata?.clientOrderId, 'hb_trade_sl_x');
  assert.equal((await provider.placeEntry({ signalId:'sig', symbol:'eth/usdt', side:'short', quantity:1.239, entryPrice:100.129, stopLoss:105, tp1:80, tp2:70 })).providerOrderId, '99');
  await provider.cancelOrder({ symbol:'ETHUSDT', providerOrderId:'99' });
  assert.equal((await provider.placeTP1({ symbol:'ETHUSDT', side:'short', quantity:1, stopLoss:105, tp1:80, tp2:70, metadata:{executionId:'trade'} })).status, 'tp1_submitted');
  assert.deepEqual((await provider.verifyProtection({ symbol:'ETHUSDT' })).data, { verified:true, missing:[] });
  const adapter = new BybitExecutionAdapter(provider); await adapter.connect();
  assert.equal((await adapter.openPosition(command('OpenPosition', { symbol:'ETHUSDT', side:'short', quantity:1, entryPrice:100, stopLoss:105, tp1:80, tp2:70 }))).ok, true);
  const wallet = calls.find(c=>c.url.includes('/wallet-balance'));
  assert.match(wallet?.url ?? '', /accountType=UNIFIED/);
  assert.equal((wallet?.headers as Record<string,string>)['X-BAPI-SIGN']?.length, 64);
  assert.match(calls.find(c=>c.url.includes('/order/create'))?.body ?? '', /"orderLinkId":"hb_/);
  assert.equal(classifyBybitError(503).retryable, true);
  assert.equal(classifyBybitError(200, 10004, 'bad sign').retryable, false);
});
