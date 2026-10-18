import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initializeDatabaseFixture} from './database-fixture.mjs';
const existing=process.argv[2];if(existing&&!/^hashibot-phase-p-chain-\d+$/.test(existing))throw Error('OWNED_CHAIN_CONTAINER_REQUIRED');
const name=existing??`hashibot-phase-p-test-${process.pid}`,docker=(args,options={})=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{encoding:'utf8',...options});
const raw=sql=>docker(['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:sql});
const query=sql=>raw(`SET ROLE service_role; SET request.jwt.claim.role='service_role'; ${sql}`).trim();
const migration=file=>readFileSync(`supabase/migrations/${file}`,'utf8');
const actor='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const history={provider:'BINANCE',symbol:'BTCUSDT',timeframe:'15m',start:'2025-01-01T00:00:00Z',end:'2025-01-01T01:00:00Z'};
const literal=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
function enqueue(key,owner=actor){return query(`select to_jsonb(enqueue_phase_p_job('${owner}','HISTORY',${literal(history)},'${key}',NULL,NULL));`);}
function claim(host='db-test'){const value=query(`select row_to_json(j) from claim_phase_p_job('${host}','test') j;`);return value?JSON.parse(value):null;}
function fails(fn,pattern){assert.throws(fn,pattern);}
try{
 if(existing){if(docker(['inspect',name,'--format','{{index .Config.Labels \"hashibot.offline-rehearsal\"}}']).trim()!=='true')throw Error('OWNED_CHAIN_LABEL_REQUIRED');}else docker(['run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);
 let ready=false;for(let i=0;i<40;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'disposable PostgreSQL startup');
 if(existing){const mode=docker(['inspect',name,'--format','{{.HostConfig.NetworkMode}}']).trim();if(mode!=='none'&&docker(['network','inspect',mode,'--format','{{.Internal}}']).trim()!=='true')throw Error('ISOLATED_CHAIN_NETWORK_REQUIRED');}
 if(!existing)initializeDatabaseFixture(raw,{actor,other});else raw(`INSERT INTO auth.users(id,email) VALUES('${actor}','audit-admin@example.invalid'),('${other}','audit-user@example.invalid');UPDATE profiles SET role='admin' WHERE id='${actor}';`);
 if(existing){const counter=raw("BEGIN;SET ROLE service_role;SELECT record_symbol_failure('__AUDIT_COUNTER__'::text,'binance'::text,'EXCHANGE_REJECT'::text);SELECT record_symbol_failure('__AUDIT_COUNTER__'::text,'binance'::text,'EXCHANGE_REJECT'::text);RESET ROLE;SELECT occurrence_count=2 FROM problem_symbol_quarantine WHERE symbol='__AUDIT_COUNTER__';ROLLBACK;").trim().split('\n');assert.ok(counter.includes('t'),'retained three-argument RPC increments one canonical row twice');const legacy=raw("BEGIN;SELECT record_symbol_failure('binance','__AUDIT_LEGACY_COUNTER__','EXCHANGE_REJECT','{}'::jsonb);SELECT failure_count=1 FROM problem_symbol_quarantine WHERE symbol='__AUDIT_LEGACY_COUNTER__';ROLLBACK;").trim().split('\n');assert.ok(legacy.includes('t'),'existing metadata-bearing Edge RPC contract works');assert.equal(raw("select has_function_privilege('anon','public.record_symbol_failure(text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.record_symbol_failure(text,text,text)','EXECUTE') or has_function_privilege('anon','public.record_symbol_failure(text,text,text,jsonb,integer,integer)','EXECUTE') or has_function_privilege('authenticated','public.record_symbol_failure(text,text,text,jsonb,integer,integer)','EXECUTE');").trim(),'f');fails(()=>raw(`SET ROLE authenticated;SELECT request_phase_n_certification('${actor}','${other}','plan','decision','audit-cert-idem','${actor}');`),/permission denied/);fails(()=>query(`SELECT request_phase_n_certification('${actor}','${other}','plan','decision','audit-cert-idem','${actor}');`),/CUSTOMER_001_NOT_EXPLICITLY_CONFIGURED/);assert.equal(raw("select bool_and('security_invoker=true'=any(reloptions)) from pg_class where oid in ('execution_accounts_safe'::regclass,'canonical_reporting_operations'::regclass,'phase_o_funnel_safe'::regclass);").trim(),'t');}
 fails(()=>enqueue('stopped1'),/NEW_WORK_STOPPED/);query(`select control_phase_p_worker('${actor}','resume',NULL);`);
 fails(()=>enqueue('unauthorized1',other),/ADMIN_REQUIRED/);
 const first=JSON.parse(enqueue('durable1'));assert.equal(JSON.parse(enqueue('durable1')).id,first.id,'duplicate submission collapse');assert.equal(JSON.parse(enqueue('durable1')).run_id,first.run_id);assert.equal(raw('select count(*) from validation_datasets;').trim(),'1','duplicate response-loss retry creates no extra native run');assert.equal(query('select jobs from phase_p_worker_usage'), '1');
 const [a,b]=await Promise.all(['concurrent-a','concurrent-b'].map(host=>new Promise((resolve,reject)=>{const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(`SET ROLE service_role; SET request.jwt.claim.role='service_role'; select id from claim_phase_p_job('${host}','test');`);})));assert.equal([a,b].filter(Boolean).length,1,'atomic global concurrency and claim');
 const old=JSON.parse(raw(`select row_to_json(j) from portable_jobs j where id='${first.id}';`));assert.equal(claim(),null,'no competing live worker');
 const bars=[0,1].map(i=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'15m',open_time:`2025-01-01T00:${i?'15':'00'}:00Z`,open:100,high:101,low:99,close:100,volume:1,source:'BINANCE'}));
 const cp=(j,rows=bars,cursor=2)=>query(`select checkpoint_phase_p_job('${j.id}','${j.lease_token}',${literal({cursor,next:1735691400000,pages:1})},${literal(rows)});`);
 cp(old);cp(old);assert.equal(raw(`select count(*) from validation_dataset_candles where dataset_id='${old.run_id}';`).trim(),'2','durable evidence duplicate collapse');
 raw(`update portable_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='${old.id}';`);
 fails(()=>cp(old),/LEASE_LOST/);fails(()=>query(`select finish_phase_p_job('${old.id}','${old.lease_token}','COMPLETED','{}',NULL);`),/LEASE_LOST/);
 const reclaimed=claim();assert.ok(reclaimed&&reclaimed.lease_token!==old.lease_token,'timeout recovery token');assert.equal(reclaimed.checkpoint.cursor,2,'checkpoint restart');
 fails(()=>cp(old),/LEASE_LOST/);fails(()=>query(`select finish_phase_p_job('${old.id}','${old.lease_token}','COMPLETED','{}',NULL);`),/LEASE_LOST/);fails(()=>cp(reclaimed,[{...bars[0],close:100.5}],2),/EVIDENCE_CONFLICT/);
 query(`select control_phase_p_worker('${actor}','cancel','${reclaimed.id}');`);fails(()=>cp(reclaimed),/LEASE_LOST/);assert.equal(raw(`select status from validation_datasets where id='${reclaimed.run_id}';`).trim(),'CANCELLED');fails(()=>query(`select finish_phase_p_job('${reclaimed.id}','${reclaimed.lease_token}','COMPLETED','{}',NULL);`),/LEASE_LOST/);
 // Completion commits native evidence status and job status in one transaction.
 enqueue('complete1');const completed=claim();cp(completed);query(`select finish_phase_p_job('${completed.id}','${completed.lease_token}','COMPLETED',${literal({rowCount:2,datasetHash:'test-hash',first:bars[0].open_time,last:bars[1].open_time})},NULL);`);
 assert.equal(raw(`select status from portable_jobs where id='${completed.id}';`).trim(),'COMPLETED');assert.equal(raw(`select status from validation_datasets where id='${completed.run_id}';`).trim(),'READY');
 enqueue('racefinish1');const racing=claim();cp(racing);
 const raceSql=sql=>new Promise(resolve=>{const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('exit',code=>resolve({code,out,err}));child.stdin.end(`SET ROLE service_role; SET request.jwt.claim.role='service_role'; ${sql}`);});
 const raced=await Promise.all([raceSql(`select control_phase_p_worker('${actor}','cancel','${racing.id}');`),raceSql(`select finish_phase_p_job('${racing.id}','${racing.lease_token}','COMPLETED',${literal({rowCount:2,datasetHash:'race-hash',first:bars[0].open_time,last:bars[1].open_time})},NULL);`)]);
 assert.equal(raced.filter(x=>x.code===0).length,1,'cancel and finalization serialize with exactly one winner');
 const raceState=raw(`select status from portable_jobs where id='${racing.id}';`).trim(),nativeState=raw(`select status from validation_datasets where id='${racing.run_id}';`).trim();
 assert.ok(['CANCELLED','COMPLETED'].includes(raceState));assert.equal(nativeState,raceState==='COMPLETED'?'READY':'CANCELLED');
 enqueue('retrydead1');let retry=claim();for(let i=0;i<3;i++){query(`select finish_phase_p_job('${retry.id}','${retry.lease_token}','${i===2?'DEAD_LETTER':'RETRY'}','{}','SAFE_FAILURE');`);if(i<2){raw(`update portable_jobs set available_at=clock_timestamp() where id='${retry.id}';`);retry=claim();}}assert.equal(raw(`select status from portable_jobs where id='${retry.id}';`).trim(),'DEAD_LETTER');

 // Native replay and account/Prop evidence stay behind the same job fence.
 const replayPayload={configuration:{version:'test',strategies:[]},datasetHash:'h',datasetHashes:['h'],datasetIds:[],maxCycles:5,assumptions:{}};
 query(`select enqueue_phase_p_job('${actor}','REPLAY',${literal(replayPayload)},'replaynative1','config',NULL);`);
 const replayJob=claim(),cycle={cycle_key:'cycle-1',candle_close_time:'2025-01-01T00:15:00Z',strategy_results:[],arbitration:{winner:null},data_exclusions:[],outcome:null};
 query(`select checkpoint_phase_p_job('${replayJob.id}','${replayJob.lease_token}',${literal({cursor:1,total:1})},${literal([cycle])});`);
 query(`select checkpoint_phase_p_job('${replayJob.id}','${replayJob.lease_token}',${literal({cursor:1,total:1})},${literal([cycle])});`);
 query(`select finish_phase_p_job('${replayJob.id}','${replayJob.lease_token}','COMPLETED',${literal({cycles:1,outcomes:0})},NULL);`);
 assert.equal(raw(`select status from validation_runs where id='${replayJob.run_id}';`).trim(),'COMPLETED');
 for(const kind of ['ACCOUNT','PROP']){
  query(`select enqueue_phase_p_job('${actor}','${kind}',${literal({canonicalSourceRunId:replayJob.run_id,datasetHash:'h',sourceConfigurationHash:'config',initialCapital:10000})},'native${kind}','config',NULL);`);
  const simulation=claim();
  query(`select checkpoint_phase_p_job('${simulation.id}','${simulation.lease_token}',${literal({cursor:1,total:1})},${literal([{sequence:0,evidence:{classification:'HISTORICAL_SIMULATION',balance:10000}}])});`);
  query(`select finish_phase_p_job('${simulation.id}','${simulation.lease_token}','COMPLETED',${literal({status:kind==='PROP'?'INCOMPLETE':'COMPLETED'})},NULL);`);
  assert.equal(raw(`select status from validation_simulation_runs where id='${simulation.run_id}';`).trim(),kind==='PROP'?'INCOMPLETE':'COMPLETED');
 }
 fails(()=>raw(`update portable_jobs set customer_id='${other}' where id='${replayJob.id}';`),/IMMUTABLE_PORTABLE_LINEAGE/);
 // Real ACL/RLS denial; no browser service-role or generic table mutation path.
 fails(()=>raw('SET ROLE authenticated; SELECT * FROM portable_jobs;'),/permission denied/);fails(()=>raw("SET ROLE anon; SELECT * FROM claim_phase_p_job('x','x');"),/permission denied/);
 for(let i=Number(query('select jobs from phase_p_worker_usage'));i<20;i++)enqueue(`quota000${i}`);fails(()=>enqueue('quotaover1'),/QUOTA_EXCEEDED/);
 raw(`update phase_p_worker_usage set slices=100;`);assert.equal(claim(),null,'atomic consumption quota enforced');
 query(`select control_phase_p_worker('${actor}','stop',NULL);`);assert.equal(claim(),null,'stop-new-work');
 // Separate metadata fixture proves optional catalogs are read when present,
 // and secret values are never exported. This is not full-chain verification.
 if(!existing){raw(`CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(bucket_id text); INSERT INTO storage.buckets VALUES('fixture','fixture',false,1024,ARRAY['text/plain']); INSERT INTO storage.objects VALUES('fixture'),('fixture'); CREATE SCHEMA vault; CREATE TABLE vault.secrets(id uuid,name text,created_at timestamptz,updated_at timestamptz,secret text); INSERT INTO vault.secrets VALUES(gen_random_uuid(),'fixture-secret',now(),now(),'LOCAL_SENTINEL_MUST_NOT_BE_EXPORTED'); CREATE VIEW public.inspection_fixture_view WITH(security_invoker=true) AS SELECT id FROM storage.buckets;`);
 mkdirSync('work/phase-p/offline',{recursive:true});
 execFileSync('node',['scripts/phase-p/inspect-deployment.mjs','--local-container',name,'--output','work/phase-p/offline/fixture-inspection.json'],{encoding:'utf8'});
 const captured=readFileSync('work/phase-p/offline/fixture-inspection.json','utf8'),inspection=JSON.parse(captured);
 assert.equal(inspection.sections.storageBuckets.status,'PRESENT');assert.equal(inspection.sections.storageObjectCounts.data[0].object_count,2);assert.equal(inspection.sections.vault.data[0].name,'fixture-secret');assert.ok(!captured.includes('LOCAL_SENTINEL_MUST_NOT_BE_EXPORTED'));assert.equal(inspection.consistency,'SINGLE_REPEATABLE_READ_TRANSACTION');
 assert.ok(inspection.sections.routines.data.some(r=>r.name==='claim_phase_p_job'));assert.ok(inspection.sections.roles.data.some(r=>r.name==='service_role'&&r.bypassRls));
 assert.ok(inspection.sections.relations.data.some(r=>r.name==='inspection_fixture_view'&&r.viewDefinitionFingerprint&&r.options.includes('security_invoker=true')));
 }
 console.log('PASS: PostgreSQL real concurrent claims, global ownership, expired fencing, checkpoint restart, conflict detection, cancellation, native completion, retry/dead letters, quotas, and ACL/RLS');
 console.log(existing?'Scope: actual completed migration-chain schema with explicit disposable test rows, no prerequisite fixture DDL.':'Scope: isolated prerequisite fixture plus actual Phase L/M/P SQL; separate from full chain.');
 if(!existing)console.log('PASS: consistent read-only catalog inspection including present Storage/Vault metadata, RPC fingerprints/grants and secret-value exclusion.');
}finally{if(!existing)try{docker(['rm','-f','-v',name],{stdio:'ignore'});}catch{}}
