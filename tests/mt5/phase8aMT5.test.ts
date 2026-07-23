import assert from 'node:assert/strict';
import { ExchangeProviderMT5 } from '../../src/lib/exchange/ExchangeProviderMT5.js';
import { normalizeVolume, selectMT5Targets, toMT5Order, type MT5Account, type MT5Gateway, type MT5SymbolSpec } from '../../src/lib/exchange/mt5.js';

const account: MT5Account = { id:'a1', userId:'customer', broker:'Broker', server:'Broker-Demo', accountNumberMasked:'••••1234', nickname:'Challenge', currency:'USD', leverage:100, accountType:'demo', executionMode:'demo', executionEnabled:true, connectionStatus:'connected', providerHealth:'healthy', bridgeId:'bridge-1' };
const spec: MT5SymbolSpec = { canonicalSymbol:'EURUSD', brokerSymbol:'EURUSD.a', digits:5, point:0.00001, contractSize:100000, volumeMin:0.01, volumeMax:100, volumeStep:0.01, stopsLevelPoints:10, fillPolicies:['ioc','return'] };
let enqueued: Record<string, unknown> | undefined;
const gateway: MT5Gateway = {
  async account(){ return account; }, async symbol(){ return spec; }, async snapshot(){ return null; },
  async enqueue(accountId, operation, payload, idempotencyKey){ enqueued={accountId,operation,payload,idempotencyKey}; return {commandId:'c1',status:'pending'}; },
};

async function run(){
assert.equal(normalizeVolume(0.019, spec), 0.01, 'lots obey broker volume step');
const canonical = Object.freeze({ signalId:'s1', symbol:'EURUSD', side:'long' as const, quantity:0.019, entryPrice:1.1, stopLoss:1.098, tp1:1.104, tp2:1.106, metadata:Object.freeze({ orderType:'buy_limit', fillPolicy:'ioc', idempotencyKey:'s1:a1' }) });
const native = toMT5Order(canonical, spec);
assert.deepEqual({symbol:native.symbol, side:native.side, volume:native.volume, action:native.action}, {symbol:'EURUSD.a',side:'BUY',volume:0.01,action:'pending'});
assert.equal(canonical.symbol, 'EURUSD', 'canonical request is unchanged');
assert.equal(selectMT5Targets([account, {...account,id:'a2',providerHealth:'unhealthy'}], 'customer').length, 1);
const result = await new ExchangeProviderMT5('a1', gateway).placeEntry(canonical);
assert.equal(result.ok, true); assert.equal(enqueued?.operation, 'place_order');
const disabled = new ExchangeProviderMT5('a1', {...gateway, async account(){return {...account,executionEnabled:false};}});
assert.equal((await disabled.placeEntry(canonical)).error, 'mt5_execution_disabled');
console.log('Phase 8A MT5 provider tests passed');

}
void run();
