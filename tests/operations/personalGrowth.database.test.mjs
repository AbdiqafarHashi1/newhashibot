import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('growth migration persists sandbox risk up to five percent, retains scoped durable locks and denies customer mutations',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),account=crypto.randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function is_admin() returns boolean language sql as $$select false$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,account_mode text,policy_overrides jsonb,execution_enabled boolean,provider text,environment text,policy_version text,phase_h_certification_status text,updated_at timestamptz);
 create table profiles(id uuid,role text);create table phase_h_audit_events(customer_id uuid,execution_account_id uuid,actor_id uuid,event_type text,safe_metadata jsonb);
 create table account_policy_evidence(id uuid default gen_random_uuid(),execution_account_id uuid,customer_id uuid,observed_at timestamptz,created_at timestamptz default now(),account_context jsonb,contract_specification jsonb);
 create table account_closed_provider_outcomes(execution_account_id uuid,customer_id uuid,execution_truth_id uuid,closed_at timestamptz,currency text,net_pnl numeric);
 create table crypto_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);create table mt5_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);
 create function assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;`);

 await db.exec(await readFile('supabase/migrations/20261118120000_house_money_state.sql','utf8'));
 await db.exec(`create table strategy_configs(strategy_name text,enabled boolean);create function activate_sixteen_cost_positive(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;`);
 await db.exec(await readFile('supabase/migrations/20261118223000_personal_growth_profiles.sql','utf8'));
 await db.query("insert into profiles values($1,'admin')",[owner]);
 for(const name of ['crypto.launch-rsi2-48-3-3-h72','crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006','gold.frontier-compression-15-24-1.5-5-h96','crypto.launch-trend-pullback-48-1.5-5'])await db.query('insert into strategy_configs values($1,true)',[name]);
 const activated=(await db.query('select activate_growth_product_engines($1) as result',[owner])).rows[0].result;assert.equal(activated.scanner_configurations,13);assert.equal(activated.vip_configurations,8);assert.equal((await db.query('select count(*)::int as n from strategy_configs where enabled')).rows[0].n,1);
 await assert.rejects(db.query('select activate_growth_product_engines($1)',[crypto.randomUUID()]),/ADMIN/);

 await db.query(`insert into connected_execution_accounts(id,customer_id,account_mode,policy_overrides,execution_enabled,provider,environment) values($1,$2,'PERSONAL','{"policy_configuration":{"personalRiskProfile":"AGGRESSIVE_5","houseMoney":"house-money/v1"}}',false,'BINANCE','testnet')`,[account,owner]);
 const at=(await db.query('select clock_timestamp() as at')).rows[0].at;
 const c={balance:10000,equity:10000,daily_drawdown:{starting_balance:10000},total_drawdown:{initial_balance:10000,high_water_mark:10000}};
 await db.query(`insert into account_policy_evidence(execution_account_id,customer_id,observed_at,account_context,contract_specification) values($1,$2,$3,$4,'{"account_currency":"USD"}')`,[account,owner,at,JSON.stringify(c)]);
 const observe=()=>db.query('select observe_house_money_account($1,$2,$3) as facts',[owner,account,at]);await observe();
 const persist=(d)=>db.query('select persist_house_money_decision($1,$2,$3,$4)',[owner,account,at,JSON.stringify(d)]);
 await persist({equity_phase:'PERSONAL_AGGRESSIVE_5',base_risk_pct:5,applied_risk_pct:5,block_reason:null});
 await assert.rejects(persist({base_risk_pct:6,applied_risk_pct:6}),/CEILING/);
 await persist({equity_phase:'HALTED',base_risk_pct:0,applied_risk_pct:0,block_reason:'PERSONAL_GROWTH_PEAK_HALT'});assert.equal((await observe()).rows[0].facts.latchedReason,'PERSONAL_GROWTH_PEAK_HALT');
 await db.query("update connected_execution_accounts set account_mode='PROP_EVALUATION'");await assert.rejects(persist({base_risk_pct:5,applied_risk_pct:5}),/SANDBOX/);
 await db.query("update connected_execution_accounts set account_mode='PERSONAL',environment='live'");await assert.rejects(persist({base_risk_pct:5,applied_risk_pct:5}),/SANDBOX/);
 const strategySql=await readFile('supabase/migrations/20261112172016_account_strategy_selection.sql','utf8');await db.exec(strategySql.slice(0,strategySql.indexOf('-- Changing risk')));
 const broad=crypto.randomUUID(),custom=crypto.randomUUID(),prop=crypto.randomUUID(),ids=['crypto.launch-trend-pullback-48-1.5-5','crypto.launch-trend-pullback-48-2-3-h72','crypto.launch-rsi2-48-3-3-h72','crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006','crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006','crypto.complementary-ema-pullback'];
 for(const [id,mode,selected] of [[broad,'PERSONAL',ids],[custom,'PERSONAL',[ids[3]]],[prop,'PROP_EVALUATION',ids]])await db.query("insert into connected_execution_accounts(id,customer_id,account_mode,policy_overrides,execution_enabled,provider,environment) values($1,$2,$3,$4,true,'BINANCE','testnet')",[id,owner,mode,JSON.stringify({policy_configuration:{allowedStrategies:selected}})]);
 const migration=await readFile('supabase/migrations/20261118223000_personal_growth_profiles.sql','utf8');await db.exec(migration.slice(migration.indexOf('-- Existing exact broad defaults'),migration.lastIndexOf('commit;')));
 const narrowed=(await db.query('select policy_overrides,execution_enabled from connected_execution_accounts where id=$1',[broad])).rows[0];assert.deepEqual(narrowed.policy_overrides.policy_configuration.allowedStrategies,[ids[0]]);assert.equal(narrowed.execution_enabled,false);
 for(const id of [custom,prop])assert.equal((await db.query('select execution_enabled from connected_execution_accounts where id=$1',[id])).rows[0].execution_enabled,true);
 await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(persist({base_risk_pct:1,applied_risk_pct:1}),/SERVICE_ROLE/);
 }finally{await db.close()}
});
