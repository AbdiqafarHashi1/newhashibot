import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('Smart upgrade requires thirty elapsed verified-history days, fresh evidence, reconciled outcomes and Admin authority',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),account=crypto.randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function is_admin() returns boolean language sql as $$select false$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,account_mode text,policy_overrides jsonb,execution_enabled boolean,provider text,environment text,policy_version text,phase_h_certification_status text,updated_at timestamptz);
 create table profiles(id uuid,role text);create table phase_h_audit_events(customer_id uuid,execution_account_id uuid,actor_id uuid,event_type text,safe_metadata jsonb);
 create table account_policy_evidence(id uuid default gen_random_uuid(),execution_account_id uuid,customer_id uuid,observed_at timestamptz,created_at timestamptz default now(),account_context jsonb,contract_specification jsonb);
 create table account_closed_provider_outcomes(execution_account_id uuid,customer_id uuid,execution_truth_id uuid,closed_at timestamptz,currency text,net_pnl numeric);
 create table crypto_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);create table mt5_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);
 create function assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;`);


 await db.exec(await readFile('supabase/migrations/20261118120000_house_money_state.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261118223000_personal_growth_profiles.sql','utf8'));
 await db.exec(`alter table account_policy_evidence add column provider text,add column source_reference text;alter table account_closed_provider_outcomes add column provider text,add column source text,add column source_ids text[];`);
 await db.exec(await readFile('supabase/migrations/20261118233000_smart_growth_history.sql','utf8'));
 await db.query("insert into profiles values($1,'admin')",[owner]);
 await db.query(`insert into connected_execution_accounts(id,customer_id,account_mode,provider,environment,policy_overrides) values($1,$2,'PERSONAL','BINANCE','testnet','{"policy_configuration":{"preset":"GROWTH","personalRiskProfile":"AGGRESSIVE_5PCT","riskPerTradePct":5}}')`,[account,owner]);
 const assigned=(await db.query('select policy_overrides from connected_execution_accounts where id=$1',[account])).rows[0].policy_overrides.policy_configuration;assert.equal(assigned.personalRiskProfile,'STANDARD');assert.equal(assigned.riskPerTradePct,1);
 const now=(await db.query('select clock_timestamp() as at')).rows[0].at;
 const observe=()=>db.query('select observe_personal_forward_history($1,$2,$3) as evidence',[owner,account,now]);
 await assert.rejects(observe(),/30_VERIFIED_DAYS/);
 const context={environment:'TESTNET',balance:10000,equity:10000,daily_drawdown:{starting_balance:10000},total_drawdown:{initial_balance:10000,high_water_mark:10000}};
 await db.query(`insert into account_policy_evidence(execution_account_id,customer_id,observed_at,provider,source_reference,account_context,contract_specification) select $1,$2,(date_trunc('day',$3::timestamptz at time zone 'UTC') at time zone 'UTC')-i*interval '1 day'+interval '12 hours','BINANCE','observed:provider',$4,'{"account_currency":"USD"}' from generate_series(1,29) i`,[account,owner,now,JSON.stringify(context)]);
 await db.query(`insert into account_policy_evidence(execution_account_id,customer_id,observed_at,provider,source_reference,account_context,contract_specification) values($1,$2,$3,'BINANCE','observed:provider',$4,'{"account_currency":"USD"}')`,[account,owner,now,JSON.stringify(context)]);
 await assert.rejects(observe(),/30_VERIFIED_DAYS/);
 await db.query(`insert into account_policy_evidence(execution_account_id,customer_id,observed_at,provider,source_reference,account_context,contract_specification) values($1,$2,(date_trunc('day',$3::timestamptz at time zone 'UTC') at time zone 'UTC')-interval '31 days','BINANCE','observed:provider',$4,'{"account_currency":"USD"}')`,[account,owner,now,JSON.stringify(context)]);
 await assert.rejects(observe(),/CLOSED_FORWARD_TRADES/);
 const execution=crypto.randomUUID();await db.query("insert into crypto_account_execution_truth values($1,$2,$3,'CLOSED')",[execution,account,owner]);
 await assert.rejects(observe(),/COMPLETE_CLOSED/);
 await db.query("insert into account_closed_provider_outcomes(execution_account_id,customer_id,execution_truth_id,closed_at,currency,net_pnl,provider,source,source_ids) values($1,$2,$3,$4,'USD',0,'BINANCE','BINANCE_USER_TRADES_AND_INCOME',ARRAY['provider-fill'])",[account,owner,execution,new Date(new Date(now).getTime()-31*86400000).toISOString()]);
 assert.ok((await observe()).rows[0].evidence.verifiedDays>=30);
 const smart={...assigned,personalRiskProfile:'SMART_GROWTH',riskPerTradePct:1.5,maxOpenRiskPct:7,maxCorrelatedRiskPct:4.5,maxDailyDrawdownPct:6,maxTotalDrawdownPct:14,concurrentCryptoGuard:true};
 await db.query('select admin_set_account_controls($1,$2,$3,$4,null)',[owner,owner,account,JSON.stringify(smart)]);
 await assert.rejects(db.query('select admin_set_account_controls($1,$2,$3,$4,null)',[owner,owner,account,JSON.stringify({...smart,concurrentCryptoGuard:false})]),/GUARD_AND_LIMITS/);
 await assert.rejects(db.query('select observe_personal_forward_history($1,$2,$3)',[crypto.randomUUID(),account,now]),/SCOPE/);
 await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(observe(),/SERVICE_ROLE/);
 }finally{await db.close()}
});
