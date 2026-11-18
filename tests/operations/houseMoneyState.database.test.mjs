import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('monthly realized history, fresh equity, capital-flow reconciliation and durable loss/target latches are account scoped',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),account=crypto.randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function is_admin() returns boolean language sql as $$select false$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,account_mode text,policy_overrides jsonb,execution_enabled boolean);
 create table account_policy_evidence(id uuid default gen_random_uuid(),execution_account_id uuid,customer_id uuid,observed_at timestamptz,created_at timestamptz default now(),account_context jsonb,contract_specification jsonb);
 create table account_closed_provider_outcomes(execution_account_id uuid,customer_id uuid,execution_truth_id uuid,closed_at timestamptz,currency text,net_pnl numeric);
 create table crypto_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);create table mt5_account_execution_truth(id uuid,execution_account_id uuid,customer_id uuid,lifecycle_state text);
 create function assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;`);
 await db.exec(await readFile('supabase/migrations/20261118120000_house_money_state.sql','utf8'));
 await db.query("insert into connected_execution_accounts values($1,$2,'PERSONAL','{}',true)",[account,owner]);
 const at=(await db.query('select clock_timestamp() as at')).rows[0].at;
 const c={balance:10500,equity:10400,daily_drawdown:{starting_balance:10000},total_drawdown:{initial_balance:10000,high_water_mark:10600}};
 await db.query("insert into account_policy_evidence(execution_account_id,customer_id,observed_at,account_context,contract_specification) values($1,$2,$3,$4,'{\"account_currency\":\"USD\"}')",[account,owner,at,JSON.stringify(c)]);
 await db.query("insert into account_closed_provider_outcomes values($1,$2,$3,$4,'USD',500)",[account,owner,crypto.randomUUID(),at]);
 const observe=()=>db.query('select observe_house_money_account($1,$2,$3) as facts',[owner,account,at]);
 const f=(await observe()).rows[0].facts;assert.equal(f.monthlyPnlPct,5);assert.equal(f.dailyPnlPct,4);assert(Math.abs(f.peakDrawdownPct-200/10600*100)<1e-8);
 await db.query("select persist_house_money_decision($1,$2,$3,'{\"equity_phase\":\"HALTED\",\"base_risk_pct\":0,\"applied_risk_pct\":0,\"block_reason\":\"PERSONAL_PEAK_DRAWDOWN_HALT\"}')",[owner,account,at]);assert.equal((await observe()).rows[0].facts.latchedReason,'PERSONAL_PEAK_DRAWDOWN_HALT');
 await assert.rejects(db.query('select observe_house_money_account($1,$2,$3)',[crypto.randomUUID(),account,at]),/SCOPE/);
 await assert.rejects(db.query("select observe_house_money_account($1,$2,now()-interval '2 minutes')",[owner,account]),/FRESH/);
 await db.query("update account_policy_evidence set account_context=jsonb_set(account_context,'{balance}','10600')");await assert.rejects(observe(),/CAPITAL_FLOW/);
 await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(observe(),/SERVICE_ROLE/);
 }finally{await db.close()}
});
