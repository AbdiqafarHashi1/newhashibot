import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {accountSchema} from './support/accountSchema.mjs';
test('production Phase-D schema loads scoped canonical evidence and atomically records a blocked decision',async()=>{
 const db=new PGlite();try{
 await db.exec(accountSchema);
 await db.exec(`create function prevent_monitor_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE';end$$;
 alter table connected_execution_accounts add runtime_control text default 'PAUSE_NEW_ENTRIES';
 alter table crypto_account_execution_truth add id uuid default gen_random_uuid(),add created_at timestamptz default now();
 create table mt5_account_execution_truth(id uuid,customer_id uuid,execution_account_id uuid,lifecycle_state text,created_at timestamptz);
 alter table execution_orders add symbol text;
 create table signals(id uuid primary key,source text,signal_identity text,candidate_id uuid,strategy_id text,strategy_version text,symbol text,market_type text,status text,expires_at timestamptz);
 create table backtest_runs(mode_slug text,status text,result_summary jsonb,created_at timestamptz);
 create table customer_onboarding_provisioning(execution_account_id uuid,customer_id uuid,product text,state text,qualified_set_id text,qualified_set_version text);
 create table phase_h_entitlements(id uuid primary key,customer_id uuid,state text,source text,valid_until timestamptz);
 create table execution_entitlement_bindings(customer_id uuid,execution_account_id uuid,entitlement_id uuid,state text);
 create table execution_account_policy_decisions(id text primary key,customer_id uuid,execution_account_id uuid,signal_id uuid,decision text,reason_codes text[],authorized_risk_pct numeric,brain_family text,brain_provider text,brain_version text,policy_profile_id text,policy_version text,configuration jsonb,created_at timestamptz,intent_id text,approved_quantity numeric,unique(customer_id,execution_account_id,signal_id,policy_profile_id,policy_version));`);
 await db.exec(await readFile('supabase/migrations/20261016040740_account_authorization_and_outcome_evidence.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111',account='33333333-3333-4333-8333-333333333333',signal='44444444-4444-4444-8444-444444444444';
 await db.query("insert into connected_execution_accounts(id,customer_id,account_id,provider,environment,credential_ref,immutable_identity,policy_profile_id,policy_version,account_mode) values($1,$2,'routing-alias','binance','testnet','vault','immutable','policy','1','PERSONAL')",[account,owner]);
 await db.query("insert into signals values($1,'scanner','canonical',null,'strategy','1','BTCUSDT','crypto','waiting',now()+interval '5 minutes')",[signal]);
 const load=async(customer=owner)=>(await db.query('select load_production_account_authorization_input($1,$2,$3) value',[customer,account,signal])).rows[0].value;
 const input=await load();assert.equal(input.account.id,account);assert.equal(input.context,null);assert.equal(input.entitlement.state,'INACTIVE');assert.ok(input.evidence_hash);
 await assert.rejects(load('22222222-2222-4222-8222-222222222222'),/OWNERSHIP/);
 const decision={authorityVersion:'account-policy-authority/v1',decisionId:'decision-blocked',customerId:owner,accountId:account,signalId:signal,immutableAccountIdentity:'immutable',policyProfileId:'policy',policyVersion:'1',brainProvider:'BINANCE',brainFamily:'PERSONAL',brainVersion:'1',decision:'BLOCK',reasonCodes:['COMPLETE_ACCOUNT_CONTEXT_REQUIRED'],authorizedRiskPct:0,executionIntent:null,configuration:{preset:'CONSERVATIVE'},evaluatedAt:new Date().toISOString()};
 const commit=async(d=decision,hash=input.evidence_hash,key='retry')=>(await db.query('select commit_production_account_authorization($1,$2,$3,$4,$5,$6,null) value',[owner,account,signal,key,hash,JSON.stringify(d)])).rows[0].value;
 assert.equal((await commit()).decision,'BLOCK');assert.equal((await commit()).idempotent,true);
 assert.equal((await db.query('select count(*)::int n from certified_runtime_artifacts')).rows[0].n,0);
 await assert.rejects(commit({...decision,customerId:'other'},input.evidence_hash,'wrong'),/LINEAGE/);
 await db.exec("update connected_execution_accounts set policy_preset='BALANCED'");await assert.rejects(commit(decision,input.evidence_hash,'changed'),/EVIDENCE_CHANGED/);

 // SQL separately enforces exact approved risk/quantity and persists the plan in the same transaction.
 const next='55555555-5555-4555-8555-555555555555';
 await db.query("insert into signals values($1,'scanner','canonical-next',null,'strategy','1','BTCUSDT','crypto','waiting',now()+interval '5 minutes')",[next]);
 await db.query("update connected_execution_accounts set enabled=true,execution_enabled=true,is_operational=false,runtime_control='START',provider_health='healthy' where id=$1",[account]);
 await db.query("insert into account_brain_assignments(customer_id,execution_account_id,policy_version,risk_preference) values($1,$2,'1',1)",[owner,account]);
 await db.query("insert into phase_h_entitlements values($1,$2,'ACTIVE','TEST',now()+interval '1 hour')",[next,owner]);
 await db.query("insert into execution_entitlement_bindings values($1,$2,$3,'ACTIVE')",[owner,account,next]);
 await db.query("insert into account_policy_evidence(customer_id,execution_account_id,execution_instance_id,credential_ref,provider,symbol,observed_at,account_context,contract_specification,routing_policy,capabilities,pending_orders,source_reference) select customer_id,id,execution_instance_id,credential_ref,'BINANCE','BTCUSDT',clock_timestamp(),'{}','{}','{}','{}',0,'provider-proof' from connected_execution_accounts where id=$1",[account]);
 const fresh=(await db.query('select load_production_account_authorization_input($1,$2,$3) value',[owner,account,next])).rows[0].value;
 const allowed={...decision,signalId:next,decisionId:'decision-allow',decision:'ALLOW',reasonCodes:['APPROVED'],authorizedRiskPct:1,executionIntent:{intentId:'intent',approvedQuantity:.2}};
 const plan={schema_version:'execution-plan/v1',status:'PLANNED',evaluation_id:'eval',execution_plan_id:'plan',routing:{account_id:account},strategy_plan:{identity:{strategy_id:'strategy'}},risk_decision:{decision_id:'decision-allow',account:{id:account,customer_id:owner},authorized_envelope:{authorized_risk_percent:1}},capital_allocation_plan:{allocation:{quantity:.2}}};
 const submit=async(p=plan)=>(await db.query("select commit_production_account_authorization($1,$2,$3,'allow',$4,$5,$6) value",[owner,account,next,fresh.evidence_hash,JSON.stringify(allowed),JSON.stringify(p)])).rows[0].value;
 await assert.rejects(submit({...plan,capital_allocation_plan:{allocation:{quantity:.3}}}),/EXACT_PHASE_D_PLAN/);
 assert.equal(Number((await submit()).approved_quantity),.2);
 assert.equal((await db.query('select count(*)::int n from certified_runtime_artifacts')).rows[0].n,1);
 assert.equal((await db.query('select enqueue_production_account_authorizations() n')).rows[0].n,2);
 assert.equal((await db.query('select enqueue_production_account_authorizations() n')).rows[0].n,0);

 // The new loader fingerprints the measured release and the SQL commit repeats its lineage check.
 await db.exec("create table mt5_symbol_specs(account_id uuid);create table mt5_account_snapshots(account_id uuid,owner_id uuid,bridge_id text,captured_at timestamptz,terminal_authenticated boolean,trade_permission boolean,terminal_autotrading boolean);alter table execution_account_runtime_proof add monitor_status text,add environment text;create table customer_execution_strategy_bindings(execution_account_id uuid,customer_id uuid,product text);create table strategy_release_candidates(id uuid primary key,strategy_id text,state text,immutable_configuration jsonb,configuration_hash text)");
 await db.exec(await readFile('supabase/migrations/20261017014250_measured_execution_lineage.sql','utf8'));
 await db.query("insert into execution_account_runtime_proof(customer_id,provider,account_id,execution_instance_id,credential_ref,observed_at,monitor_status,environment) select customer_id,provider,account_id,execution_instance_id,'wrong',now(),'healthy',environment from connected_execution_accounts where id=$1",[account]);
 assert.equal((await db.query('select last_synchronized_at from connected_execution_accounts where id=$1',[account])).rows[0].last_synchronized_at,null);
 await db.exec("update execution_account_runtime_proof set credential_ref='vault'");assert.ok((await db.query('select last_synchronized_at from connected_execution_accounts where id=$1',[account])).rows[0].last_synchronized_at);
 await db.exec("update execution_account_runtime_proof set observed_at=clock_timestamp(),monitor_status='degraded'");assert.equal((await db.query('select provider_health from connected_execution_accounts where id=$1',[account])).rows[0].provider_health,'degraded');
 const beforeRelease=await load();assert.equal(beforeRelease.measured_release,null);
 const release=crypto.randomUUID();await db.query("insert into strategy_release_candidates values($1,'strategy','PROMOTED','{}','measured-hash')",[release]);
 const afterRelease=await load();assert.equal(afterRelease.measured_release.id,release);assert.notEqual(beforeRelease.evidence_hash,afterRelease.evidence_hash);
 const frame={measured_release:{id:release,strategy_id:'strategy',state:'PROMOTED',immutable_configuration:{strategies:[{id:'strategy',enabled:true,symbols:['BTCUSDT'],timeframes:['15m'],parameters:{stop:2}}]}},signal:{strategy_id:'strategy',strategy_version:'1',symbol:'BTCUSDT',timeframe:'15m'},strategy_plan:{provenance:{measured_release_id:release,evaluated_parameters:{stop:2}}},qualified_set:{entries:[{strategyId:'strategy',strategyVersion:'1',supportedSymbols:['BTCUSDT'],supportedTimeframes:['15m'],strategyParameters:{stop:2}}]}};
 const check=(f=frame)=>db.query('select assert_measured_execution_lineage($1)',[JSON.stringify(f)]);await check();
 await assert.rejects(check({...frame,strategy_plan:{provenance:{measured_release_id:release,evaluated_parameters:{stop:3}}}}),/PARAMETERS_MISMATCH/);
 await assert.rejects(check({...frame,measured_release:{...frame.measured_release,state:'RETIRED'}}),/CURRENT_MEASURED/);

 await db.query("update execution_account_runtime_proof set observed_at=clock_timestamp(),monitor_status='healthy',account_state=$1",[JSON.stringify({account_total_wallet_balance:10000,account_total_margin_balance:10000,provider_account_currency:'USDT',flat_verified:true})]);
 let tracking=(await db.query('select track_current_provider_risk($1,$2) value',[owner,account])).rows[0].value;assert.equal(tracking.state,'READY');assert.equal(tracking.tracking.initial_balance,10000);
 await db.query("update execution_account_runtime_proof set observed_at=clock_timestamp(),account_state=$1",[JSON.stringify({account_total_wallet_balance:9800,account_total_margin_balance:9700,provider_account_currency:'USDT',flat_verified:false})]);
 tracking=(await db.query('select track_current_provider_risk($1,$2) value',[owner,account])).rows[0].value;assert.equal(tracking.tracking.initial_balance,10000);assert.equal(tracking.tracking.total_peak_equity,10000);assert.equal(tracking.tracking.last_equity,9700);
 await db.exec("update account_observed_risk_tracking set last_observed_at=clock_timestamp()-interval '10 minutes';update execution_account_runtime_proof set observed_at=clock_timestamp()");assert.equal((await db.query('select track_current_provider_risk($1,$2) value',[owner,account])).rows[0].value.state,'GAP_RECONCILIATION_REQUIRED');
 await db.exec("set role authenticated;set request.jwt.claim.role='authenticated'");await assert.rejects(load(),/permission denied/);await assert.rejects(commit(),/permission denied/);
 }finally{await db.close()}
});
