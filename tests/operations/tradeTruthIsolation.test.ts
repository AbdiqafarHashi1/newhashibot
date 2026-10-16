import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upsertTradeManagementTruth,upsertTradeManagementTruthRow,updateTradeManagementTruthByIdentity} from '../../supabase/functions/_shared/trade-truth/index';
test('truth writes never report returned database errors as success',async()=>{
 const db={rpc:async()=>({error:{message:'injected persistence rejection'}}),from:()=>({upsert:async()=>({error:{message:'injected'}})})};
 const payload={p_execution_order_id:'execution-a',p_status:'protected',p_provider:'binance',p_environment:'testnet',p_symbol:'BTCUSDT',p_direction:'buy'};
 assert.equal((await upsertTradeManagementTruth(db,payload)).ok,false);assert.equal((await upsertTradeManagementTruth(db,{...payload,p_execution_order_id:null})).ok,false);
 assert.equal((await upsertTradeManagementTruthRow(db,{status:'protected',provider:'binance',environment:'testnet',symbol:'BTCUSDT',side:'buy'})).ok,false);
});
test('same provider and symbol updates are constrained by the exact customer/account execution scope',async()=>{
 const calls:unknown[][]=[];const query={update(x:unknown){calls.push(['update',x]);return this},eq(k:string,v:unknown){calls.push([k,v]);return this},select(){return this},async maybeSingle(){return {data:{id:'truth-a'},error:null}},then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:null,error:null}).then(resolve)}};
 const db={rpc:async()=>({error:null}),from:()=>query};const identity={execution_scope_key:'customer-a:binance:account-a:instance-a',provider:'binance',environment:'testnet',symbol:'BTCUSDT',side:'buy'};
 assert.equal((await updateTradeManagementTruthByIdentity(db,identity,{protection_status:'protected'})).ok,true);assert.ok(calls.some(x=>x[0]==='execution_scope_key'&&x[1]===identity.execution_scope_key));
 calls.length=0;assert.equal((await updateTradeManagementTruthByIdentity(db,{...identity,execution_scope_key:''},{protection_status:'protected'})).ok,false);assert.equal(calls.length,0);
 assert.equal((await updateTradeManagementTruthByIdentity(db,identity,{account_id:'other'})).ok,false);assert.equal(calls.length,0);
});
