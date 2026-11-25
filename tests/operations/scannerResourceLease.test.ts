import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withScannerLease} from '../../supabase/functions/_shared/scanner-lease.ts';
test('a busy scanner never starts a second pipeline or releases its lease',async()=>{
 const calls:string[]=[];
 const result=await withScannerLease({rpc:async(name:string)=>{calls.push(name);return {data:false}}},async()=>{throw Error('duplicate pipeline')});
 assert.deepEqual(result,{skipped:true,reason:'scanner_already_running'});
 assert.deepEqual(calls,['claim_scanner_resource_lease']);
});
test('failed admission stops before provider work',async()=>{
 await assert.rejects(withScannerLease({rpc:async()=>({error:{message:'missing migration'}})},async()=>{throw Error('must not start')}),/SCANNER_RESOURCE_LEASE_UNAVAILABLE/);
});
test('success and thrown pipeline errors both release their exact lease',async()=>{
 for(const fails of [false,true]){
  const calls:{name:string,token:string}[]=[];
  const db={rpc:async(name:string,args:any)=>{calls.push({name,token:args.p_token});return {data:true}}};
  const result=withScannerLease(db,async()=>{if(fails)throw Error('pipeline failed');return 42});
  if(fails)await assert.rejects(result,/pipeline failed/);else assert.equal(await result,42);
  assert.equal(calls[0].token,calls[1].token);
  assert.equal(calls[1].name,'release_scanner_resource_lease');
 }
});
