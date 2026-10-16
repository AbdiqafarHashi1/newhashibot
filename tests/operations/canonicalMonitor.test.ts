import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeCanonicalMonitor} from '../../supabase/functions/_shared/canonical-monitor-observations';
test('monitor writes exact plan/account evidence and refuses incomplete or ambiguous snapshots',async()=>{
 const now=new Date().toISOString(),calls:any[]=[];
 const row={id:'execution',direction:'buy',last_monitor_checked_at:now,sl_confirmed:true,tp1_confirmed:true,tp2_confirmed:true,entry_order_id:'provider-entry'};
 const store={from(table:string){const value={data:table==='crypto_account_execution_truth'?[{symbol:'BTCUSDT',execution_plan_id:'plan'}]:[row],error:null};const chain:any={select:()=>chain,eq:()=>chain,not:()=>chain,limit:async()=>value};return chain},rpc:async(name:string,args:any)=>{calls.push({name,args});return {error:null}}};
 const base={store,ownership:{customer_id:'customer',account_id:'account',execution_scope_key:'scope'},provider:'BINANCE' as const,positions:[{symbol:'BTCUSDT',positionAmt:'1'}],orders:[],complete:true,observedAt:now,lookupEntry:async()=>({id:'provider-entry',symbol:'BTCUSDT',side:'BUY',status:'FILLED',filledQuantity:1})};
 await synchronizeCanonicalMonitor(base);assert.equal(calls.length,1);assert.equal(calls[0].args.p_plan_id,'plan');assert.equal(calls[0].args.p_observation.protection_verified,true);
 await assert.rejects(synchronizeCanonicalMonitor({...base,complete:false}),/INCOMPLETE/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,positions:[...base.positions,...base.positions]}),/AMBIGUOUS/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,positions:[{symbol:'BTCUSDT',positionAmt:'-1'}]}),/SIDE_MISMATCH/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,store:{...store,rpc:async()=>({error:{message:'failed'}})}}),/NOT_PERSISTED/);
 assert.equal(calls.length,1);
});
