import {PGlite} from '@electric-sql/pglite';import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('database entry gates require confirmation and finite per-account access; expiry leaves management available',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table signals(id uuid primary key,source text,status text,expires_at timestamptz,created_at timestamptz);
 create table signal_updates(signal_id uuid,new_status text,price numeric,reason text,created_at timestamptz);
 create table phase_h_entitlements(id uuid primary key,customer_id uuid,execution_account_id uuid,product_code text,state text,source text,valid_until timestamptz,source_payment_id uuid,revoked_at timestamptz,valid_from timestamptz);
 create table commerce_payment_attempts(id uuid,customer_id uuid,state text);
 create table execution_entitlement_bindings(customer_id uuid,execution_account_id uuid,entitlement_id uuid,state text);
 create table execution_account_policy_decisions(id text primary key,customer_id uuid,execution_account_id uuid,signal_id uuid,decision text);
 create table crypto_account_execution_truth(customer_id uuid,execution_account_id uuid,signal_id uuid,lifecycle_state text);
 create table mt5_commands(operation text,payload jsonb);`);
 await db.exec(await readFile('supabase/migrations/20261030030804_confirmed_entries_and_execution_expiry.sql','utf8'));
 const c='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',s='33333333-3333-4333-8333-333333333333',e='44444444-4444-4444-8444-444444444444';
 await db.query("insert into signals values($1,'scanner','waiting',now()+interval '1 hour',now()-interval '1 hour')",[s]);
 await db.query("insert into phase_h_entitlements(id,customer_id,execution_account_id,product_code,state,source,valid_until,source_payment_id) values($1,$2,$3,'FOUNDING_AUTO_EXECUTION','ACTIVE','VERIFIED_WHOP',now()+interval '31 days',null)",[e,c,a]);
 const expiry=(await db.query("select valid_until<=now()+interval '30 days 1 second' as bounded from phase_h_entitlements")).rows[0];assert.equal(expiry.bounded,true);
 await db.query("insert into execution_entitlement_bindings values($1,$2,$3,'ACTIVE')",[c,a,e]);
 const insert=()=>db.query("insert into execution_account_policy_decisions values('decision',$1,$2,$3,'ALLOW')",[c,a,s]);
 await assert.rejects(insert(),/CONFIRMATION_REQUIRED/);
 await db.exec("update signals set status='active'");await assert.rejects(insert(),/CONFIRMATION_REQUIRED/);
 await db.query("insert into signal_updates values($1,'active',100,'candle_entry_trigger',now()-interval '1 minute')",[s]);await insert();
 await db.query("insert into crypto_account_execution_truth values($1,$2,$3,'ENTRY_SUBMITTED')",[c,a,s]);
 await db.exec("update phase_h_entitlements set valid_until=now()-interval '1 second'");
 await assert.rejects(db.query("insert into crypto_account_execution_truth values($1,$2,$3,'ENTRY_SUBMITTED')",[c,a,s]),/FINITE_ACTIVE_EXECUTION_ACCESS_REQUIRED/);
 await assert.rejects(db.query("insert into mt5_commands values('OPEN_POSITION',$1)",[JSON.stringify({phase_d_decision_id:'decision'})]),/FINITE_ACTIVE_EXECUTION_ACCESS_REQUIRED/);
 await db.exec("insert into mt5_commands values('MODIFY_PROTECTION','{}'),('CLOSE_POSITION','{}');update crypto_account_execution_truth set lifecycle_state='PROTECTION_VERIFIED'");
 await db.query("insert into execution_account_policy_decisions values('blocked',$1,$2,$3,'BLOCK')",[c,a,s]);
 await assert.rejects(db.exec("set role authenticated;select assert_confirmed_account_entry(null,null,null)"),/permission denied/);
 }finally{await db.close()}
});
