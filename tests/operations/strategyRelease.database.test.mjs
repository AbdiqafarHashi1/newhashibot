import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';
test('PostgreSQL measured releases freeze matching periods, consume one holdout atomically, and cannot promote insufficient evidence',async()=>{
 const db=new PGlite(),actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',development='33333333-3333-4333-8333-333333333333',validation='44444444-4444-4444-8444-444444444444';
 try{await db.exec(accountSchema);await db.exec(`
 insert into profiles values('${actor}','admin');
 create table validation_runs(id uuid primary key default gen_random_uuid(),mode text,status text,configuration_hash text,immutable_configuration jsonb,dataset_hash text,provenance jsonb,max_cycles integer,max_requests integer,created_by uuid,outcome_assumptions jsonb,failure_code text,cancellation_requested_at timestamptz,created_at timestamptz default now());
 create table validation_outcomes(run_id uuid,strategy_id text,status text,net_r numeric);
 create table portable_jobs(id uuid primary key default gen_random_uuid(),kind text,payload jsonb,customer_id uuid,execution_account_id uuid,idempotency_key text,max_attempts integer,run_id uuid,configuration_hash text,status text default 'QUEUED');
 create table phase_p_worker_control(id boolean primary key default true,stop_new_work boolean default false,daily_job_limit integer default 20);
 insert into phase_p_worker_control(id) values(true);
 create table phase_p_worker_usage(customer_id uuid,day date,jobs integer default 0,primary key(customer_id,day));
 `);await db.exec(await readFile('supabase/migrations/20261016214732_measured_scanner_strategy_releases.sql','utf8'));
 const config={minSignalGrade:'A',strategies:[{id:'crypto.micro-scalper',enabled:true}]},costs={feeBps:4,spreadBps:2,slippageBps:2,fundingBps:0};
 const add=async(id,start,end)=>db.query("insert into validation_runs(id,mode,status,configuration_hash,immutable_configuration,provenance,created_by,outcome_assumptions) values($1,'REPLAY','COMPLETED','hash',$2,$3,$4,$5)",[id,JSON.stringify(config),JSON.stringify({start,end,datasetIds:['dataset']}),actor,JSON.stringify(costs)]);
 const outcomes=async(id)=>db.query("insert into validation_outcomes select $1,'crypto.micro-scalper','STOP',case when n<=20 then 1 else -1 end from generate_series(1,30) n",[id]);
 await add(development,'2025-01-01','2025-02-01');await add(validation,'2025-02-01','2025-03-01');await outcomes(development);
 const freeze=()=>db.query("select freeze_strategy_release_candidate($1,$2,$3,'crypto.micro-scalper') id",[actor,development,validation]);
 await assert.rejects(freeze(),/30_TRADES/);await outcomes(validation);const candidate=(await freeze()).rows[0].id;assert.equal((await freeze()).rows[0].id,candidate);
 const enqueue=async(key,start='2025-03-01',end='2025-04-01')=>db.query("select (enqueue_phase_p_job($1,'REPLAY',$2,$3,'hash',null)).*",[actor,JSON.stringify({releaseCandidateId:candidate,start,end,configuration:config,assumptions:costs,datasetIds:['dataset'],maxCycles:500,datasetHash:'data',datasetHashes:['data']}),key]);
 await assert.rejects(enqueue('overlap-key','2025-02-15'),/LINEAGE/);assert.equal((await db.query('select count(*)::int n from portable_jobs')).rows[0].n,0);
 const job=(await enqueue('holdout-key')).rows[0];assert.equal((await enqueue('holdout-key')).rows[0].id,job.id);await assert.rejects(enqueue('second-holdout-key'),/CONSUMED/);
 const promote=()=>db.query('select promote_measured_strategy_release($1,$2) value',[actor,candidate]);await assert.rejects(promote(),/COMPLETED/);
 await db.query("update validation_runs set status='COMPLETED' where id=$1",[job.run_id]);await assert.rejects(promote(),/30_TRADES/);await outcomes(job.run_id);
 assert.equal((await promote()).rows[0].value.state,'PROMOTED');assert.equal((await promote()).rows[0].value.execution_enabled,false);
 await db.exec("set role authenticated;set request.jwt.claim.role='authenticated'");await assert.rejects(freeze(),/permission denied/);await assert.rejects(promote(),/permission denied/);assert.equal((await db.query('select count(*)::int n from strategy_release_candidates')).rows[0].n,0);
 }finally{await db.close()}
});
