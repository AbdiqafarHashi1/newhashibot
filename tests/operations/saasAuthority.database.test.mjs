import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';
test('atomic provider claim is single-use; real account controls require canonical payment/certification and remain tenant scoped',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',account='33333333-3333-4333-8333-333333333333',checkout='44444444-4444-4444-8444-444444444444';
 try{await db.exec(accountSchema);await db.exec(`
 alter table connected_execution_accounts add runtime_control text default 'PAUSE_NEW_ENTRIES';
 create table commerce_checkout_sessions(id uuid primary key,customer_id uuid,provider text,status text,expires_at timestamptz);
 create table commerce_payment_attempts(id uuid primary key,checkout_session_id uuid,customer_id uuid,provider text,provider_state text,state text);
 create table signals(id uuid);create table phase_h_entitlements(id uuid,customer_id uuid,source_payment_id uuid,state text,product_code text,execution_account_id uuid,valid_until timestamptz);
 create table execution_entitlement_bindings(entitlement_id uuid,customer_id uuid,execution_account_id uuid,state text);
 create table risk_acknowledgements(customer_id uuid,execution_account_id uuid);
 create table phase_n_account_operations_safe(account_id uuid,submission_uncertain boolean,open_protection_incident boolean);
 create table backtest_runs(mode_slug text,status text,result_summary jsonb,created_at timestamptz default now());
 `);await db.exec(await readFile('supabase/migrations/20261016214549_saas_commerce_and_account_authority.sql','utf8'));
 await db.query("insert into commerce_checkout_sessions values($1,$2,'WHOP','CREATED',now()+interval '1 hour',null)",[checkout,owner]);
 const claim=()=>db.query('select claim_commerce_provider_submission($1,$2,null) ok',[checkout,owner]);
 const claimed=await Promise.all([claim(),claim()]);assert.deepEqual(claimed.map(r=>r.rows[0].ok).sort(),[false,true]);
 await db.query("insert into connected_execution_accounts(id,customer_id,account_id,provider,environment,credential_ref,enabled,execution_enabled,provider_health,account_mode,phase_h_certification_status,last_synchronized_at,policy_version) values($1,$2,'alias','binance','testnet','fixture',true,false,'healthy','PERSONAL','NOT_RUN',now(),'1')",[account,owner]);
 const control=(actor,value)=>db.query('select set_customer_account_runtime($1,$2,$3,$4) value',[actor,owner,account,value]);
 await assert.rejects(control(other,'START'),/ACCESS_DENIED/);await assert.rejects(control(owner,'START'),/CERTIFICATION/);
 assert.equal((await control(owner,'PAUSE_NEW_ENTRIES')).rows[0].value.runtime_control,'PAUSE_NEW_ENTRIES');
 await db.exec("update connected_execution_accounts set phase_h_certification_status='PASSED'");await assert.rejects(control(owner,'START'),/VERIFIED_ACCOUNT_PAYMENT/);
 await db.query("insert into commerce_payment_attempts(id,customer_id,state) values($1,$2,'SUCCEEDED')",[checkout,owner]);await db.query("insert into phase_h_entitlements values($1,$2,$1,'ACTIVE','FOUNDING_AUTO_EXECUTION',$3,now()+interval '30 days')",[checkout,owner,account]);await db.query("insert into execution_entitlement_bindings values($1,$2,$3,'ACTIVE')",[checkout,owner,account]);
 await db.query("insert into account_brain_assignments(customer_id,execution_account_id,policy_version) values($1,$2,'1')",[owner,account]);await db.query('insert into risk_acknowledgements values($1,$2)',[owner,account]);
 await db.exec(`insert into backtest_runs(mode_slug,status,result_summary) values('qualification_campaign','completed','{"qualifiedSet":{"id":"CRYPTO_PERSONAL_QUALIFIED_SET","setVersion":"measured-v1","entries":[{"strategyId":"strategy"}]}}')`);
 assert.equal((await control(owner,'START')).rows[0].value.runtime_control,'START');assert.equal((await db.query('select execution_enabled from connected_execution_accounts')).rows[0].execution_enabled,true);
 await db.exec("update phase_h_entitlements set state='REVOKED'");await assert.rejects(control(owner,'RESUME'),/PAYMENT/);assert.equal((await control(owner,'MANAGE_ONLY')).rows[0].value.protection_enabled,true);
 await db.exec('set role authenticated');await assert.rejects(claim(),/permission denied/);await assert.rejects(control(owner,'START'),/permission denied/);
 }finally{await db.close()}
});
