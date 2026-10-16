import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('actual PostgreSQL outcomes are service-only, immutable, idempotent and account scoped',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'service_role')$$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function is_admin() returns boolean language sql as $$select false$$;
 create function prevent_monitor_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'EVIDENCE_IMMUTABLE';end$$;
 create table connected_execution_accounts(id uuid primary key,customer_id uuid,provider text,environment text);
 create table crypto_account_execution_truth(id uuid primary key,customer_id uuid,execution_account_id uuid,lifecycle_state text,created_at timestamptz);
 create table mt5_account_execution_truth(id uuid primary key,customer_id uuid,execution_account_id uuid,lifecycle_state text,created_at timestamptz);`);
 await db.exec((await readFile('supabase/migrations/20261016040740_account_authorization_and_outcome_evidence.sql','utf8')).split('-- Complete observed context')[0]);
 const owner='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222',execution='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
 await db.query("insert into connected_execution_accounts values($1,$2,'binance','testnet')",[account,owner]);
 await db.query("insert into crypto_account_execution_truth values($1,$2,$3,'CLOSED',now()-interval '2 minutes')",[execution,owner,account]);
 const at=new Date(Date.now()-60000).toISOString();
 const record=async(customer=owner,pnl=-2,provider='BINANCE',source='BINANCE_USER_TRADES_AND_INCOME')=>(await db.query('select record_account_closed_provider_outcome($1,$2,$3,$4,$5,\'USDT\',$6,$7,\'{trade:1,trade:2}\') id',[customer,account,provider,execution,at,pnl,source])).rows[0].id;
 const id=await record();assert.equal(await record(),id);assert.equal((await db.query('select count(*)::int n from account_closed_provider_outcomes')).rows[0].n,1);
 await assert.rejects(record(other),/ACCOUNT_SCOPE/);await assert.rejects(record(owner,-3),/CONTENT_CONFLICT/);await assert.rejects(record(owner,-2,'BYBIT'),/ACCOUNT_SCOPE/);await assert.rejects(record(owner,-2,'BINANCE','BYBIT_CLOSED_PNL'),/SOURCE_MISMATCH/);
 await assert.rejects(db.exec('delete from account_closed_provider_outcomes'),/IMMUTABLE/);
 await db.exec("set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'");assert.equal((await db.query('select count(*)::int n from account_closed_provider_outcomes')).rows[0].n,0);await assert.rejects(record(),/permission denied/);
 await db.exec("set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'");assert.equal((await db.query('select count(*)::int n from account_closed_provider_outcomes')).rows[0].n,1);
 await db.exec("reset role;set request.jwt.claim.role='service_role';update crypto_account_execution_truth set lifecycle_state='PROTECTION_VERIFIED'");await assert.rejects(record(),/EVIDENCE_INCOMPLETE/);
 }finally{await db.close()}
});
