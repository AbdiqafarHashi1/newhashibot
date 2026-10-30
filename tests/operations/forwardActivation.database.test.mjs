import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';
test('owner demo access is account-scoped, finite and never records payment or certification; start retains observed-health and qualification gates',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',account='33333333-3333-4333-8333-333333333333';
 try{await db.exec(accountSchema);await db.exec(`
 alter table connected_execution_accounts alter column credential_ref drop not null;
 create table customer_account_setup_requests(customer_id uuid,idempotency_key text,request_content jsonb,execution_account_id uuid,created_at timestamptz,primary key(customer_id,idempotency_key));
 create table customer_brain_change_requests(customer_id uuid,execution_account_id uuid,idempotency_key text,request_content jsonb,assignment_id uuid,primary key(customer_id,execution_account_id,idempotency_key));
 alter table connected_execution_accounts add runtime_control text default 'PAUSE_NEW_ENTRIES';
 create table commerce_checkout_sessions(id uuid primary key,customer_id uuid,provider text,status text,expires_at timestamptz);
 create table commerce_payment_attempts(id uuid primary key,checkout_session_id uuid,customer_id uuid,provider text,provider_state text,state text);
 create table trade_management_truth(environment text); create table signals(id uuid,status text,expires_at timestamptz); create table execution_account_policy_decisions(id text,execution_account_id uuid,customer_id uuid,decision text); create table account_signal_authorization_jobs(id uuid,customer_id uuid,execution_account_id uuid,signal_id uuid,decision_id text,policy_version text,state text,last_error text,updated_at timestamptz);
 create table phase_h_entitlements(id uuid primary key default gen_random_uuid(),customer_id uuid,source_payment_id uuid,state text,source text,product_code text,execution_account_id uuid,valid_from timestamptz,valid_until timestamptz,account_limit int,feature_permissions jsonb,grant_reason text);
 create table execution_entitlement_bindings(entitlement_id uuid,customer_id uuid,execution_account_id uuid unique,state text,activated_at timestamptz,revoked_at timestamptz);
 create table risk_acknowledgements(customer_id uuid,execution_account_id uuid);
 create table phase_n_account_operations_safe(account_id uuid,submission_uncertain boolean,open_protection_incident boolean);
 create table backtest_runs(mode_slug text,status text,result_summary jsonb,created_at timestamptz default now());
 create table certified_execution_adoption_policies(account_id text,provider text,environment text,version text,current boolean,enabled boolean,rollout_percentage numeric,policy jsonb,changed_by uuid,changed_at timestamptz,unique(account_id,provider,environment,version));
 `);await db.exec(await readFile('supabase/migrations/20261016214549_saas_commerce_and_account_authority.sql','utf8'));await db.exec(await readFile('supabase/migrations/20261030170618_account_forward_activation.sql','utf8'));
 await db.query("insert into profiles values($1,'admin'),($2,'customer')",[owner,other]);
 await db.query("insert into connected_execution_accounts(id,customer_id,account_id,provider,environment,credential_ref,enabled,execution_enabled,provider_health,account_mode,phase_h_certification_status,last_synchronized_at,policy_version) values($1,$2,'alias','binance','testnet','fixture',true,false,'healthy','PERSONAL','REQUIRED',now(),'1')",[account,owner]);
 const grant=actor=>db.query('select grant_owner_demo_access($1,$2) result',[actor,account]);const control=value=>db.query('select set_customer_account_runtime($1,$1,$2,$3) result',[owner,account,value]);
 await assert.rejects(grant(other),/OWN_ADMIN/);const first=(await grant(owner)).rows[0].result;const retry=(await grant(owner)).rows[0].result;assert.equal(first.expires_at,retry.expires_at);assert.equal(first.payment_created,false);
 assert.equal((await db.query('select execution_enabled,phase_h_certification_status from connected_execution_accounts')).rows[0].execution_enabled,false);
 assert.equal((await db.query('select count(*) n from commerce_payment_attempts')).rows[0].n,0);
 await assert.rejects(control('START'),/BRAIN/);
 await db.query("insert into account_brain_assignments(customer_id,execution_account_id,policy_version) values($1,$2,'1')",[owner,account]);await db.query('insert into risk_acknowledgements values($1,$2)',[owner,account]);
 await assert.rejects(control('START'),/QUALIFIED_STRATEGY/);
 await db.exec(`insert into backtest_runs(mode_slug,status,result_summary) values('qualification_campaign','completed','{"qualifiedSet":{"id":"CRYPTO_PERSONAL_QUALIFIED_SET","setVersion":"measured-v1","entries":[{"strategyId":"strategy"}]}}')`);
 assert.equal((await control('START')).rows[0].result.runtime_control,'START');assert.equal((await db.query('select phase_h_certification_status from connected_execution_accounts')).rows[0].phase_h_certification_status,'REQUIRED');
 assert.equal((await db.query('select policy from certified_execution_adoption_policies where current')).rows[0].policy.certification_state,'FORWARD_TEST');
 const signal='44444444-4444-4444-8444-444444444444';await db.query("insert into signals values($1,'active',now()+interval '90 seconds')",[signal]);await db.query("insert into execution_account_policy_decisions values('decision',$1,$2,'ALLOW')",[account,owner]);await db.query("insert into account_signal_authorization_jobs(id,customer_id,execution_account_id,signal_id,decision_id,policy_version,state,updated_at) values($1,$2,$3,$1,'decision','1','RECORDED',now())",[signal,owner,account]);
 const claims=await Promise.all([db.query('select * from claim_account_dispatch(10)'),db.query('select * from claim_account_dispatch(10)')]);assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
 await db.exec("update account_signal_authorization_jobs set dispatch_claimed_at=now()-interval '3 minutes'");await db.query('select * from claim_account_dispatch(10)');assert.equal((await db.query('select dispatch_state from account_signal_authorization_jobs')).rows[0].dispatch_state,'UNKNOWN');
 await control('PAUSE_NEW_ENTRIES');await db.exec("update phase_h_entitlements set valid_until=now()-interval '1 second'");await assert.rejects(control('RESUME'),/PAYMENT/);await db.exec("update connected_execution_accounts set environment='live'");await assert.rejects(grant(owner),/OWNER_DEMO_ONLY/);await assert.rejects(control('START'),/DEMO_ENVIRONMENT/);
 const created=await db.query("select create_customer_execution_account($1,'BINANCE','PERSONAL','My live account','live-setup','live') result",[owner]);assert.equal(created.rows[0].result.environment,'live');assert.equal(created.rows[0].result.execution_enabled,false);
 await assert.rejects(db.query("select create_customer_execution_account($1,'BINANCE','PERSONAL','My demo','live-setup','testnet')",[owner]),/CONTENT_CONFLICT/);
 await db.exec('set role authenticated');await assert.rejects(grant(owner),/permission denied/);
 }finally{await db.close()}
});
