import assert from 'node:assert/strict';
import { DEFAULT_EXECUTION_POLICIES, ProfessionalTradeManager, reconcileTrades, retryWithPolicy, validateExecutionPolicy, type ManagedTrade } from '../../src/lib/exchange/professionalTradeManager.js';
import type { ExchangeProvider } from '../../src/lib/exchange/exchangeProvider.js';

const trade={trade_id:'t1',provider_id:'mt5',environment_id:'live',account_id:'a1',provider_position_id:'p1',symbol:'EURUSD',position_side:'long',quantity_initial:1,quantity_remaining:1,entry_price_filled:1.1,sl_price_intended:1.09,tp1_price_intended:1.11,tp2_price_intended:1.12,trade_lifecycle_state:'filled',execution_status:'filled',protection_status:'verified',monitoring_status:'in_sync',recovery_status:'none',reporting_status:'not_published',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),latest_sync_at:new Date().toISOString(),version:1} as ManagedTrade;
const position={providerPositionId:'p1',symbol:'EURUSD',side:'long',quantity:1,entryPrice:1.1,markPrice:1.116};
const protectedOrders=[{providerOrderId:'sl',symbol:'EURUSD',type:'stop_loss',status:'open',reduceOnly:true},{providerOrderId:'tp',symbol:'EURUSD',type:'take_profit',status:'open',reduceOnly:true}];
assert.equal(reconcileTrades([trade],[position],protectedOrders).length,0);
assert.deepEqual(reconcileTrades([trade],[],[]).map(i=>i.type),['missing_position']);
assert.deepEqual(validateExecutionPolicy(DEFAULT_EXECUTION_POLICIES.prop_challenge,{equity:10000,dailyPnl:-500,weeklyPnl:0,exposure:0,openPositions:0}),['daily_loss_lock']);
let tries=0;const retried=await retryWithPolicy(async()=>({provider:'mt5',ok:++tries===3,error:'network timeout'}),3,0,async()=>{});assert.equal(retried.ok,true);assert.equal(tries,3);
const calls:string[]=[];const provider={metadata:{id:'mt5',label:'MT5',environment:'live',supportsNativeProtection:true,supportsProfitLock:true},async fetchOpenPositions(){return [position]},async fetchOpenOrders(){return protectedOrders},async closePosition(){calls.push('partial');return {provider:'mt5',ok:true}},async replaceSL(r:{reason:string}){calls.push(r.reason);return {provider:'mt5',ok:true}}} as unknown as ExchangeProvider;
const events:string[]=[];const manager=new ProfessionalTradeManager(provider,'a1',{async listActive(){return [trade]},async save(_t,e){events.push(e)}},{async publish(){}},DEFAULT_EXECUTION_POLICIES.personal);
const result=await manager.cycle();assert.equal(result.errors.length,0);assert.deepEqual(calls,['partial','trailing']);assert.deepEqual(events,['partial_close','trailing_stop']);
console.log('Phase 8B professional trade management tests passed');
