import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {transform} from 'esbuild';

test('actual Bybit monitor returns on lease contention or missing credentials before using snapshots',async()=>{
 const source=await readFile('supabase/functions/bybit-testnet-monitor/index.ts','utf8');
 const begin=source.indexOf('async function monitorBybit('),end=source.indexOf('  try {\n    const [wallet, positions, orders]',begin);
 assert.ok(begin>=0&&end>begin);
 const prefix=source.slice(begin,end)+"throw new Error('PROVIDER_SNAPSHOT_UNEXPECTED');\n}";
 const compiled=await transform(prefix,{loader:'ts',target:'es2022'});
 for(const lease of [false,true]){
  const heartbeats:any[]=[],released:any[]=[];
  const monitor=runInNewContext(compiled.code+'\nmonitorBybit',{
   crypto:{randomUUID:()=> 'run'},MONITOR_TIMEOUT_MS:100,MONITOR_ROW_LIMIT:100,MONITOR_CANCEL_LIMIT:10,MONITOR_REPAIR_LIMIT:10,
   markStage:()=>{},withStage:async(_s:any,_name:any,_at:any,fn:any)=>fn(),acquireExecutionLease:async()=>lease,
   releaseBybitMonitorLease:(value:any)=>value,writeMonitorHeartbeat:async(_db:any,value:any)=>{heartbeats.push(value)},
   updateProvider:async()=>{},releaseExecutionLease:async(...args:any[])=>{released.push(args)},bybitEnvironment:()=> 'demo',
   synchronizeCanonicalMonitor:()=>{throw Error('UNAVAILABLE_SNAPSHOT_ACCESSED')},
  });
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled:true}})})})})};
  const result=await monitor(db,{}, {account_id:'routing'}, {apiKey:'',apiSecret:''});
  assert.equal(result.blocker,lease?'NO_API_KEYS':'MONITOR_ALREADY_RUNNING');assert.equal(result.success,false);assert.equal(heartbeats.length,1);assert.equal(released.length,lease?1:0);
 }
});
