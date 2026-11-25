import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {accountSchema} from './support/accountSchema.mjs';

test('actual onboarding HTTP handler -> concrete RPC -> PostgreSQL: customer view-only, Admin ownership, duplicate setup and policy control',async()=>{
 const db=new PGlite(),customer='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const previous={Deno:globalThis.Deno,client:globalThis.__operationsTestClient};
 try{
  await db.exec(accountSchema);
  await db.exec(await readFile('supabase/migrations/20261015221031_customer_account_setup_integrity.sql','utf8'));
  const unified=await readFile('supabase/migrations/20261030170618_account_forward_activation.sql','utf8');await db.exec(unified.slice(unified.indexOf('create function public.create_customer_execution_account'),unified.indexOf('create or replace function public.assign_customer_account_brain')));
  const controls=await readFile('supabase/migrations/20261015225107_account_execution_routing_guards.sql','utf8');await db.exec(controls.slice(controls.indexOf('-- An administrator')));
  const latest=await readFile('supabase/migrations/20261017014250_measured_execution_lineage.sql','utf8');await db.exec(latest.slice(latest.indexOf('-- Owner controls narrow'),latest.indexOf('create function public.install_hashibot_release_schedules')));
  const currentControls=await readFile('supabase/migrations/20261118233000_smart_growth_history.sql','utf8');
  await db.exec(currentControls.slice(currentControls.indexOf('create or replace function public.admin_set_account_controls')));
  await db.query("insert into profiles values($1,'user'),($2,'admin')",[customer,other]);
  const roles={customer:{id:customer,user_metadata:{role:'admin'}},admin:{id:other}};
  const client={auth:{async getUser(token){return {data:{user:roles[token]??null},error:null}}},
   from(table){let columns='*',mutation=null;const filters=[];return {update(value){mutation=value;return this},select(value){columns=value;return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},async maybeSingle(){
    assert.ok(['profiles','connected_execution_accounts','account_brain_assignments'].includes(table));assert.ok(columns==='*'||/^[a-z_,]+$/.test(columns));
    const values=[],sets=mutation?Object.entries(mutation).map(([key,value])=>{assert.ok(/^[a-z_]+$/.test(key));values.push(key==='policy_overrides'?JSON.stringify(value):value);return `${key}=$${values.length}`;}):[],where=filters.map(([key,value])=>{assert.ok(/^[a-z_]+$/.test(key));if(value===null)return `${key} is null`;values.push(value);return `${key}=$${values.length}`});
    try{const result=await db.query(mutation?`update ${table} set ${sets.join(',')} where ${where.join(' and ')} returning ${columns}`:`select ${columns} from ${table} where ${where.join(' and ')}`,values);assert.ok(result.rows.length<=1);return {data:result.rows[0]??null,error:null}}catch(error){return {data:null,error}}
   }}},
   async rpc(fn,args){const signatures={admin_set_account_controls:['p_actor','p_customer','p_account','p_configuration','p_prop_rules'],create_customer_execution_account:['p_customer_id','p_provider','p_mode','p_label','p_idempotency_key','p_environment'],assign_customer_account_brain:['p_customer_id','p_account_id','p_risk','p_strategies','p_idempotency_key','p_policy'],admin_assign_customer_account_brain:['p_actor_id','p_customer_id','p_account_id','p_risk','p_strategies','p_idempotency_key','p_policy']};
    const keys=signatures[fn];assert.ok(keys,fn);try{const result=await db.query(`select ${fn}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) value`,keys.map(key=>['p_policy','p_configuration','p_prop_rules'].includes(key)&&args[key]!=null?JSON.stringify(args[key]):args[key]));return {data:result.rows[0].value,error:null}}catch(error){return {data:null,error}}
   }};
  await db.exec(await readFile('supabase/migrations/20261114094057_reviewed_demo_onboarding.sql','utf8'));
  globalThis.__operationsTestClient=client;let handler;globalThis.Deno={env:{get:()=>''},serve(value){handler=value}};
  await mkdir('.tmp/operations-http',{recursive:true});
  await build({entryPoints:['supabase/functions/phase-h-authority/index.ts'],outfile:'.tmp/operations-http/onboarding.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'injected-platform',setup(b){b.onResolve({filter:/^(npm:|jsr:)/},args=>({path:args.path,namespace:'injected'}));b.onLoad({filter:/.*/,namespace:'injected'},args=>({contents:args.path.includes('supabase-js')?'export const createClient=()=>globalThis.__operationsTestClient;':'export {};',loader:'js'}))}}]});
  await import('../../.tmp/operations-http/onboarding.mjs');assert.equal(typeof handler,'function');
  const call=async(token,body)=>{const response=await handler(new Request('https://local.test/onboarding',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}};
  assert.equal((await call('unknown',{action:'create_account_draft'})).status,401);
  const request={action:'create_account_draft',provider:'MT5',mode:'PERSONAL',environment:'demo',display_label:'Customer terminal',idempotency_key:'endpoint-attempt',customer_id:customer};
  assert.equal((await call('customer',request)).status,403);
  const first=await call('admin',request);assert.equal(first.status,201,JSON.stringify(first));const account=first.body.data.execution_account_id;
  assert.equal((await call('admin',request)).body.data.execution_account_id,account);assert.equal((await db.query('select customer_id from connected_execution_accounts where id=$1',[account])).rows[0].customer_id,customer);
  assert.equal((await call('customer',{action:'assign_brain',execution_account_id:account})).status,403);
  const own=await call('admin',{action:'admin_assign_brain',customer_id:customer,execution_account_id:account,risk:.25,strategies:['FOREX_TREND'],idempotency_key:'brain-current'});assert.equal(own.body.state,'ASSIGNED',JSON.stringify(own));
  const denied=await call('customer',{action:'admin_assign_brain',customer_id:customer,execution_account_id:account,risk:.5,strategies:['FOREX_TREND'],idempotency_key:'forged-admin'});assert.equal(denied.status,403);
  assert.equal((await call('admin',{action:'assign_brain',execution_account_id:account,risk:.5,strategies:['FOREX_TREND'],idempotency_key:'wrong-owner'})).status,403);
  const limit=await call('admin',{action:'admin_account_controls',customer_id:customer,execution_account_id:account,limits:{allowedSymbols:['EURUSD'],maxLeverage:2,maxConcurrentPositions:1}});assert.equal(limit.body.state,'SAVED',JSON.stringify(limit));
  assert.equal((await call('customer',{action:'admin_account_controls',customer_id:customer,execution_account_id:account,limits:{maxLeverage:2}})).status,403);
  const update=await call('admin',{action:'admin_assign_brain',customer_id:customer,execution_account_id:account,risk:.5,strategies:['FOREX_TREND'],idempotency_key:'real-admin'});assert.equal(update.body.state,'ASSIGNED',JSON.stringify(update));
  const stored=(await db.query('select execution_enabled,policy_overrides from connected_execution_accounts where id=$1',[account])).rows[0];assert.equal(stored.execution_enabled,false);assert.equal(stored.policy_overrides.policy_configuration.riskPerTradePct,.5);assert.deepEqual(stored.policy_overrides.policy_configuration.allowedSymbols,['EURUSD']);assert.equal(stored.policy_overrides.policy_configuration.maxLeverage,2);
  assert.equal((await db.query('select assigned_by from account_brain_assignments where superseded_at is null')).rows[0].assigned_by,other);
  assert.deepEqual(stored.policy_overrides.policy_configuration.allowedStrategies,['forex.native-squeeze-15-48-2-3-usdjpy-h12']);
  const fundedRequest={customer_id:customer,action:'create_account_draft',provider:'MT5',mode:'PROP',prop_phase:'FUNDED',environment:'demo',display_label:'Customer funded terminal',idempotency_key:'funded-attempt'};
  const funded=await call('admin',fundedRequest);assert.equal(funded.status,201,JSON.stringify(funded));const fundedId=funded.body.data.execution_account_id;
  const f=(await db.query('select account_mode,policy_overrides,execution_enabled from connected_execution_accounts where id=$1',[fundedId])).rows[0];assert.equal(f.account_mode,'PROP_FUNDED');assert.equal(f.policy_overrides.prop_setup.phase,'FUNDED');assert.equal(f.execution_enabled,false);
  const assigned=await call('admin',{action:'admin_assign_brain',customer_id:customer,execution_account_id:fundedId,risk:.25,strategies:['FOREX_TREND'],idempotency_key:'funded-brain'});assert.equal(assigned.body.state,'ASSIGNED',JSON.stringify(assigned));
  assert.equal((await db.query('select policy_profile_id from connected_execution_accounts where id=$1',[fundedId])).rows[0].policy_profile_id,'pol_mt5_prop_funded_v1');
  assert.equal((await call('admin',fundedRequest)).body.data.execution_account_id,fundedId);
  const changed=await call('admin',{...fundedRequest,prop_phase:'VERIFICATION'});assert.notEqual(changed.body.state,'DRAFT');
  assert.equal((await db.query('select account_mode from connected_execution_accounts where id=$1',[fundedId])).rows[0].account_mode,'PROP_FUNDED');

 }finally{globalThis.Deno=previous.Deno;globalThis.__operationsTestClient=previous.client;await db.close()}
});
