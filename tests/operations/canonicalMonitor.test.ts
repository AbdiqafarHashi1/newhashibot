import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeCanonicalMonitor} from '../../supabase/functions/_shared/canonical-monitor-observations';
test('monitor writes exact plan/account evidence and refuses incomplete or ambiguous snapshots',async()=>{
 const now=new Date().toISOString(),calls:any[]=[],canonical='11111111-1111-4111-8111-111111111111',queries:any[]=[];
 const row={id:'execution',direction:'buy',last_monitor_checked_at:now,sl_confirmed:true,tp1_confirmed:true,tp2_confirmed:true,entry_order_id:'provider-entry'};
 const store={from(table:string){const value={data:table==='connected_execution_accounts'?[{id:canonical,environment:'testnet'}]:table==='crypto_account_execution_truth'?[{symbol:'BTCUSDT',execution_plan_id:'plan'}]:[row],error:null};const chain:any={select:()=>chain,eq:(key:string,value:any)=>{queries.push({table,key,value});return chain},not:()=>chain,limit:async()=>value};return chain},rpc:async(name:string,args:any)=>{calls.push({name,args});return {error:null}}};
 const base={store,ownership:{customer_id:'customer',account_id:'routing-alias',execution_scope_key:'scope',execution_instance_id:'instance',credential_ref:'vault-ref'},provider:'BINANCE' as const,positions:[{symbol:'BTCUSDT',positionAmt:'1'}],orders:[],complete:true,observedAt:now,lookupEntry:async()=>({id:'provider-entry',symbol:'BTCUSDT',side:'BUY',status:'FILLED',filledQuantity:1})};
 await synchronizeCanonicalMonitor(base);assert.equal(calls.length,1);assert.equal(calls[0].args.p_plan_id,'plan');assert.equal(calls[0].args.p_account_id,canonical);assert.ok(queries.some(x=>x.table==='crypto_account_execution_truth'&&x.key==='execution_account_id'&&x.value===canonical));assert.ok(queries.some(x=>x.table==='execution_orders'&&x.key==='account_id'&&x.value==='routing-alias'));assert.equal(calls[0].args.p_observation.protection_verified,true);
 await assert.rejects(synchronizeCanonicalMonitor({...base,complete:false}),/INCOMPLETE/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,positions:[...base.positions,...base.positions]}),/AMBIGUOUS/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,positions:[{symbol:'BTCUSDT',positionAmt:'-1'}]}),/SIDE_MISMATCH/);
 await assert.rejects(synchronizeCanonicalMonitor({...base,store:{...store,rpc:async()=>({error:{message:'failed'}})}}),/NOT_PERSISTED/);
 assert.equal(calls.length,1);
});

test('unknown submissions reconcile only by exact native client identity and persist final rejection',async()=>{
 const now=new Date().toISOString(),canonical='11111111-1111-4111-8111-111111111111',writes:any[]=[],events:any[]=[];
 const row:any={id:'execution',direction:'buy',last_monitor_checked_at:now,entry_order_id:null};
 const store={from(table:string){let patch:any=null;const read=()=>({data:table==='connected_execution_accounts'?[{id:canonical,environment:'testnet'}]:table==='crypto_account_execution_truth'?[{id:'truth',symbol:'BTCUSDT',execution_plan_id:'plan',decision_id:'decision',deterministic_client_order_id:'client',lifecycle_state:'RECONCILING'}]:[row],error:null});const chain:any={select:()=>chain,eq:()=>chain,not:()=>chain,update:(x:any)=>{patch=x;writes.push({table,x});return chain},limit:async()=>read(),maybeSingle:async()=>({data:{id:'execution'},error:null}),then:(resolve:any)=>resolve({data:null,error:null})};return chain},rpc:async(name:string,args:any)=>{events.push({name,args});return {error:null}}};
 const base={store,ownership:{customer_id:'customer',account_id:'alias',execution_scope_key:'scope',execution_instance_id:'instance',credential_ref:'vault'},provider:'BINANCE' as const,positions:[],orders:[],complete:true,observedAt:now};
 await assert.rejects(synchronizeCanonicalMonitor({...base,lookupEntry:async()=>({id:'native',clientOrderId:'foreign-client',symbol:'BTCUSDT',side:'BUY',status:'FILLED',filledQuantity:1})}),/NATIVE_SCOPE_MISMATCH/);assert.equal(writes.length,0);
 await synchronizeCanonicalMonitor({...base,lookupEntry:async()=>({id:'native',clientOrderId:'client',symbol:'BTCUSDT',side:'BUY',status:'REJECTED',filledQuantity:0})});
 assert.ok(writes.some(x=>x.table==='execution_orders'&&x.x.entry_order_id==='native'));assert.ok(writes.some(x=>x.table==='execution_orders'&&x.x.status==='failed'));assert.ok(writes.some(x=>x.table==='account_signal_authorization_jobs'&&x.x.dispatch_state==='FAILED'));assert.equal(events[0].args.p_event,'ORDER_REJECTED');
});
