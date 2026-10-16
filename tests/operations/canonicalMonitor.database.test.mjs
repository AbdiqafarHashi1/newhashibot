import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('actual PostgreSQL observation RPC preserves tenant, sequencing, immutability and certification boundaries',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'service_role')$$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function is_admin() returns boolean language sql as $$select false$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,provider text,environment text);
 create table crypto_account_execution_truth(id uuid primary key,customer_id uuid,execution_account_id uuid,execution_plan_id text,provider text,environment text,symbol text,submitted_quantity numeric,lifecycle_state text,last_provider_evidence jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz);
 create table execution_orders(id uuid primary key,customer_id uuid,account_id uuid,raw_exchange_response jsonb,execution_scope_key text,symbol text,direction text,sl_confirmed boolean,tp1_confirmed boolean,tp2_confirmed boolean,tp1_status text);
 create table customer_system_certification_runs(customer_id uuid,execution_account_id uuid,execution_plan_id text,status text,protection_state text,last_provider_evidence jsonb,updated_at timestamptz);`);
 await db.exec(await readFile('supabase/migrations/20261016033058_canonical_monitor_observations.sql','utf8'));
 const customer='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222',row='33333333-3333-4333-8333-333333333333';
 await db.query("insert into connected_execution_accounts values($1,$2,'BINANCE','TESTNET')",[account,customer]);
 await db.query("insert into crypto_account_execution_truth(id,customer_id,execution_account_id,execution_plan_id,provider,environment,symbol,submitted_quantity,lifecycle_state) values($1,$2,$3,'plan','BINANCE','TESTNET','BTCUSDT',1,'ENTRY_SUBMITTED')",[row,customer,account]);
 await db.query("insert into execution_orders values($1,$2,$3,'{\"certified_execution_plan_id\":\"plan\"}','scope','BTCUSDT','buy',true,true,true,'submitted')",[row,customer,account]);
 await db.query("insert into customer_system_certification_runs(customer_id,execution_account_id,execution_plan_id,status) values($1,$2,'plan','EXECUTION_SUBMITTED')",[customer,account]);
 let time=Date.now()+10;
 const evidence=(q,extra={})=>({schema_version:'canonical-monitor-observation/v1',observed_at:new Date(time++).toISOString(),entry_verified:q>0,entry_provider_order_id:'provider-entry',entry_evidence:q>0?{id:'provider-entry',symbol:'BTCUSDT',status:'FILLED',side:'BUY',filledQuantity:1}:null,execution_order_id:row,execution_scope_key:'scope',position_quantity:q,position_side:q?'BUY':null,open_order_count:0,protection_verified:q>0,...extra});
 const apply=async(e,owner=customer)=>(await db.query('select record_canonical_monitor_observation($1,$2,\'plan\',$3) state',[owner,account,JSON.stringify(e)])).rows[0].state;
 assert.equal(await apply(evidence(0)),'RECONCILING'); // no position never proves a fill or win
 const protectedEvidence=evidence(1);assert.equal(await apply(protectedEvidence),'PROTECTION_VERIFIED');assert.equal(await apply(protectedEvidence),'PROTECTION_VERIFIED');
 await assert.rejects(apply({...protectedEvidence,open_order_count:1}),/CONTENT_CONFLICT/);
 await assert.rejects(apply(evidence(1),'44444444-4444-4444-8444-444444444444'),/ACCOUNT_SCOPE/);
 assert.equal((await db.query('select status from customer_system_certification_runs')).rows[0].status,'PROTECTED');
 assert.equal(await apply(evidence(0)),'CLOSED');assert.equal((await db.query('select status from customer_system_certification_runs')).rows[0].status,'CLOSED');
 await assert.rejects(db.exec('delete from canonical_monitor_observations'),/IMMUTABLE/);
 await db.exec("set role authenticated;set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'");assert.equal((await db.query('select count(*)::int n from canonical_monitor_observations')).rows[0].n,0);await assert.rejects(apply(evidence(0)),/permission denied/);
 }finally{await db.close()}
});
