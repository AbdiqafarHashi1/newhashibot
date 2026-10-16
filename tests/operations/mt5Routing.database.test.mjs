import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('actual PostgreSQL E queue: paired terminal mapping, null rejection, immutable retry and tenant denial',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,account_id text,provider_account_identity text,provider text,environment text,policy_overrides jsonb,enabled boolean,execution_enabled boolean,is_operational boolean);
 create table execution_account_policy_decisions(id text primary key,execution_account_id uuid,customer_id uuid,decision text,intent_id text,approved_quantity numeric,authorized_risk_pct numeric,created_at timestamptz,signal_id uuid,policy_profile_id text,policy_version text,brain_version text);
 create table mt5_accounts(id uuid primary key,user_id uuid,bridge_id text,execution_enabled boolean,operational boolean,provider_health text,last_heartbeat_at timestamptz,policy jsonb);
 create table mt5_bridge_registry(bridge_id text primary key,revoked_at timestamptz,lease_expires_at timestamptz,status text);
 create table mt5_commands(id uuid primary key default gen_random_uuid(),account_id uuid,bridge_id text,operation text,payload jsonb,idempotency_key text,status text,intended_policy jsonb,signal_id uuid,unique(account_id,idempotency_key));
 create table mt5_account_execution_truth(customer_id uuid,execution_account_id uuid,mt5_account_id uuid,bridge_id text,signal_id uuid,decision_id text,intent_id text,execution_plan_id text,command_id uuid,policy_profile_id text,policy_version text,brain_version text,approved_quantity numeric,authorized_risk_pct numeric,lifecycle_state text,lineage jsonb,updated_at timestamptz default now(),unique(execution_account_id,intent_id));
 `);
 await db.exec(await readFile('supabase/migrations/20261015225107_account_execution_routing_guards.sql','utf8'));
 const customer='11111111-1111-4111-8111-111111111111',logical='22222222-2222-4222-8222-222222222222',terminal='33333333-3333-4333-8333-333333333333',signal='44444444-4444-4444-8444-444444444444';
 await db.query("insert into connected_execution_accounts values($1::uuid,$2,$1::text,$3,'MT5_PERSONAL','demo',$4::jsonb,true,true,true)",[logical,customer,terminal,JSON.stringify({mt5_account_id:terminal,bridge_id:'bridge-a'})]);
 await db.query("insert into execution_account_policy_decisions values('decision-a',$1,$2,'ALLOW','intent-a',.1,.25,now(),$3,'policy','v1','v1')",[logical,customer,signal]);
 await db.query("insert into mt5_accounts values($1,$2,'bridge-a',true,true,'healthy',now(),'{}')",[terminal,customer]);
 await db.exec("insert into mt5_bridge_registry values('bridge-a',null,now()+interval '1 minute','healthy')");
 const payload={phase_d_decision_id:'decision-a',phase_d_intent_id:'intent-a',customer_id:customer,execution_account_id:logical,quantity:.1,authorized_risk_pct:.25,stop_loss:1};
 const submit=(patch={},key='attempt-a',physical=terminal)=>db.query("select * from enqueue_phase_e_mt5_intent('decision-a','plan-a',$1,'bridge-a',$2,$3::jsonb)",[physical,key,JSON.stringify({...payload,...patch})]);
 const first=await submit();assert.ok(first.rows[0].command_id);assert.equal((await submit()).rows[0].command_id,first.rows[0].command_id);
 await assert.rejects(submit({quantity:null},'null'),/LINEAGE/);
 await assert.rejects(submit({phase_d_intent_id:null},'null-intent'),/LINEAGE/);
 await assert.rejects(submit({stop_loss:2}),/CONTENT_CONFLICT/);
 await assert.rejects(submit({},'wrong-terminal',logical),/SCOPE/);
 await db.exec('update mt5_accounts set last_heartbeat_at=null');await assert.rejects(submit({},'stale'),/NOT_READY/);
 await db.exec('update mt5_accounts set last_heartbeat_at=now()');
 await db.query('update mt5_accounts set user_id=$1',[logical]);await assert.rejects(submit({},'other-customer'),/SCOPE/);
 await db.exec('set role authenticated');await assert.rejects(submit(),/permission denied/);
 }finally{await db.close()}
});
