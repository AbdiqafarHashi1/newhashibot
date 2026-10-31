import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';import {commerceSchema} from './support/commerceSchema.mjs';
test('execution sales use real protected demo evidence, 30 account slots and owner configured versioned KES pricing',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),customer=crypto.randomUUID();try{
 await db.exec(accountSchema);await commerceSchema(db);
 await db.exec(`alter table phase_h_products add capacity integer,add name text;alter table founding_slot_reservations add checkout_session_id uuid,add created_at timestamptz default now(),add terms_version text;
 create table conditional_signal_setups(updated_at timestamptz,state jsonb);create table strategy_release_candidates(state text);create table scanner_runs(status text,finished_at timestamptz);
 create table customer_system_certification_runs(provider text,execution_account_id uuid,customer_id uuid,status text,protection_state text,completed_at timestamptz,last_provider_evidence jsonb);
 create table account_closed_provider_outcomes(id uuid,customer_id uuid,execution_account_id uuid);
 create table commerce_provider_configuration(provider text,revision integer,verified_revision integer,verified_products text[],verified_at timestamptz,enabled boolean,updated_at timestamptz);
 insert into commerce_provider_configuration values('MPESA',1,1,array['VIP_SIGNALS'],now(),true,now());`);
 await db.exec(await readFile('supabase/migrations/20261030182256_execution_commerce_launch.sql','utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,customer]);
 await db.query("insert into profiles values($1,'admin'),($2,'user')",[owner,customer]);
 assert.equal((await db.query("select capacity from phase_h_products where code='FOUNDING_AUTO_EXECUTION'")).rows[0].capacity,30);
 const price=actor=>db.query('select configure_execution_kes_price($1,2500) value',[actor]);await assert.rejects(price(customer),/ADMIN/);await price(owner);await price(owner);
 const p=(await db.query("select * from commerce_product_prices where product_code='FOUNDING_AUTO_EXECUTION' and provider='MPESA'")).rows;assert.equal(p.length,1);assert.equal(p[0].amount_minor,250000);assert.equal(p[0].fixed_period_days,30);assert.equal(p[0].configured,false);assert.equal((await db.query('select enabled from commerce_provider_configuration')).rows[0].enabled,false);
 let readiness=(await db.query('select market_sales_readiness() value')).rows[0].value;assert.equal(readiness.analysis_ready,false);assert.deepEqual(readiness.execution_providers,[]);
 const a=crypto.randomUUID(),out=crypto.randomUUID();await db.query("insert into connected_execution_accounts(id,customer_id,provider,environment,account_id,credential_ref) values($1,$2,'bybit','demo','demo-alias','fixture')",[a,owner]);await db.query("insert into customer_system_certification_runs values('BYBIT',$1,$2,'PASSED','VERIFIED',now(),jsonb_build_object('closed_outcome_id',$3::text))",[a,owner,out]);assert.deepEqual((await db.query('select market_sales_readiness() value')).rows[0].value.execution_providers,[]);await db.query('insert into account_closed_provider_outcomes values($1,$2,$3)',[out,owner,a]);assert.deepEqual((await db.query('select market_sales_readiness() value')).rows[0].value.execution_providers,['BYBIT']);
 for(let i=0;i<30;i++){const checkout=(await db.query("insert into commerce_checkout_sessions(customer_id,product_code,provider,currency,amount_minor,price_version,idempotency_key,status,safe_return_url,expires_at) values($1,'FOUNDING_AUTO_EXECUTION','MPESA','KES',250000,1,$2,'CREATED','https://hashibot.app',now()+interval '1 hour') returning id",[customer,crypto.randomUUID()])).rows[0].id;await db.query("select reserve_founding_slot($1,$2,now()+interval '1 hour')",[customer,checkout]);}
 assert.equal((await db.query('select max(slot_number) n from founding_slot_reservations')).rows[0].n,30);
 }finally{await db.close()}
});
