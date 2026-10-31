import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';
test('demo certification requires a real submitted lineage, observed protection, closure and attributed outcome; a loss can pass system certification',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',account='33333333-3333-4333-8333-333333333333';
 try{await db.exec(accountSchema);await db.exec(`
 alter table crypto_account_execution_truth add id uuid default gen_random_uuid(),add decision_id text,add execution_plan_id text,add incident_code text;
 create table mt5_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text,decision_id text,execution_plan_id text,incident_code text);
 create table execution_account_policy_decisions(id text primary key,execution_account_id uuid,customer_id uuid,decision text,signal_id uuid,intent_id text,approved_quantity numeric,authorized_risk_pct numeric,policy_version text,configuration jsonb);
 create table certified_runtime_artifacts(account_id text,execution_plan jsonb);
 create table account_closed_provider_outcomes(id uuid default gen_random_uuid(),customer_id uuid,execution_account_id uuid,execution_truth_id uuid,provider text,source text,net_pnl numeric default -10,source_ids text[] check(cardinality(source_ids)>0));
 `);const g=await readFile('supabase/migrations/20260926120000_phase_g_customer_001_certification.sql','utf8');await db.exec(g.slice(0,g.indexOf('create or replace function')));const live=await readFile('supabase/migrations/20261030172615_bounded_live_execution.sql','utf8');await db.exec(live.slice(0,live.indexOf('create table public.account_live_permissions')));
 await db.query("insert into connected_execution_accounts(id,customer_id,account_id,provider,environment,credential_ref,account_mode,policy_version,policy_preset,phase_h_certification_status,provider_health) values($1,$2,'native','binance','testnet','fixture','PERSONAL','1','CONSERVATIVE','REQUIRED','healthy')",[account,owner]);
 await db.query("insert into provider_connections(customer_id,execution_account_id,capabilities) values($1,$2,'{\"trading\":true,\"withdrawal\":false}')",[owner,account]);
 await db.query("insert into execution_account_policy_decisions values('decision',$1,$2,'ALLOW',gen_random_uuid(),'intent',1,.25,'1','{\"preset\":\"CONSERVATIVE\"}')",[account,owner]);
 const plan={execution_plan_id:'plan',risk_decision:{decision_id:'decision'},orders:[{client_order_id:'client',side:'BUY'}],routing:{canonical_symbol:'BTCUSDT'},strategy_plan:{identity:{strategy_id:'measured',strategy_version:'1'},entry_plan:{expires_at:new Date(Date.now()+90000).toISOString()}}};await db.query('insert into certified_runtime_artifacts values($1,$2)',[account,JSON.stringify(plan)]);
 const inserted=await db.query("insert into crypto_account_execution_truth(execution_account_id,customer_id,lifecycle_state,decision_id,execution_plan_id) values($1,$2,'ENTRY_SUBMITTED','decision','plan') returning id",[account,owner]);const id=inserted.rows[0].id;
 const status=async()=> (await db.query('select status from customer_system_certification_runs')).rows[0].status;
 assert.equal(await status(),'EXECUTION_SUBMITTED');assert.equal((await db.query('select phase_h_certification_status from connected_execution_accounts')).rows[0].phase_h_certification_status,'REQUIRED');
 await db.exec("update crypto_account_execution_truth set lifecycle_state='PROTECTION_VERIFIED'");assert.equal(await status(),'PROTECTED');
 await db.exec("update crypto_account_execution_truth set lifecycle_state='CLOSED'");assert.equal(await status(),'CLOSED');
 await db.query("insert into account_closed_provider_outcomes(customer_id,execution_account_id,execution_truth_id,provider,source,source_ids) values($1,$2,$3,'BINANCE','VERIFIED_FILLS_WITH_LOSS',array['native-fill-1','native-fill-2'])",[owner,account,id]);assert.equal(await status(),'PASSED');
 const audit=(await db.query("select safe_metadata from phase_h_audit_events where event_type='DEMO_ROUND_TRIP_VERIFIED'")).rows[0].safe_metadata;assert.equal(audit.profitability_claim,false);
 assert.equal((await db.query('select phase_h_certification_status from connected_execution_accounts')).rows[0].phase_h_certification_status,'PASSED');
 const second={...plan,execution_plan_id:'unprotected',orders:[{client_order_id:'second-client',side:'BUY'}],risk_decision:{decision_id:'decision2'}};await db.query('insert into certified_runtime_artifacts values($1,$2)',[account,JSON.stringify(second)]);
 await db.query("insert into execution_account_policy_decisions values('decision2',$1,$2,'ALLOW',gen_random_uuid(),'intent2',1,.25,'1','{\"preset\":\"CONSERVATIVE\"}')",[account,owner]);
 const unsafe=(await db.query("insert into crypto_account_execution_truth(execution_account_id,customer_id,lifecycle_state,decision_id,execution_plan_id) values($1,$2,'ENTRY_SUBMITTED','decision2','unprotected') returning id",[account,owner])).rows[0].id;
 await db.query("update crypto_account_execution_truth set lifecycle_state='CLOSED' where id=$1",[unsafe]);await db.query("insert into account_closed_provider_outcomes(customer_id,execution_account_id,execution_truth_id,provider,source,source_ids) values($1,$2,$3,'BINANCE','ATTRIBUTED_FILL',array['close-without-protection'])",[owner,account,unsafe]);
 assert.equal((await db.query("select status from customer_system_certification_runs where execution_plan_id='unprotected'")).rows[0].status,'CLOSED');
 await db.exec('set role authenticated');await assert.rejects(db.query('select register_forward_certification()'),/permission denied/);
 }finally{await db.close()}
});
