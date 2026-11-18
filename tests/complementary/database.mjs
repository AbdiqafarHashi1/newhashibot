import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create table validation_runs(id uuid primary key,mode text,status text,configuration_hash text,failure_code text,cancellation_requested_at timestamptz,provenance jsonb,outcome_assumptions jsonb);
create table validation_outcomes(run_id uuid,strategy_id text,status text,net_r numeric,entry_time timestamptz,exit_time timestamptz,entry_price numeric,exit_price numeric);
insert into validation_runs values('11111111-1111-4111-8111-111111111111','REPLAY','COMPLETED','hash',null,null,'{"start":"2025-01-01","end":"2026-01-01"}','{"feeBps":25,"closeAtHorizon":true}');
insert into validation_outcomes select '11111111-1111-4111-8111-111111111111','crypto.complementary-ema-pullback',case when i=1 then 'TIMEOUT' else 'TARGET' end,case when i<=20 then 2 else -1 end,'2025-03-01','2025-03-02',100,105 from generate_series(1,30) i;`);
await db.exec(await readFile('supabase/migrations/20261118071000_resolved_native_strategy_timeouts.sql','utf8'));
const check=()=>db.query(`select assert_measured_strategy_run('11111111-1111-4111-8111-111111111111','crypto.complementary-ema-pullback','hash')`);
await check();
for(const sql of [`update validation_outcomes set status='OPEN' where status='TIMEOUT'`,`update validation_outcomes set exit_time=null where status='TIMEOUT'`,`update validation_outcomes set entry_time=null where status='TIMEOUT'`,`update validation_outcomes set exit_price='NaN' where status='TIMEOUT'`,`update validation_runs set outcome_assumptions='{"feeBps":25,"closeAtHorizon":false}'`,`delete from validation_outcomes where status='TIMEOUT'`,`update validation_outcomes set net_r=-1`]){
 await db.exec('begin');await db.exec(sql);await assert.rejects(check);await db.exec('rollback');
}
await db.close();console.log('Native timeout migration: accepted closed time stops; seven invalid/lossy/sample cases rejected.');
