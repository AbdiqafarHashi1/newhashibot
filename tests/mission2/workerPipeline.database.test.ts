import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {initializeDatabaseFixture} from '../phaseP/database-fixture.mjs';
import {createHandlers} from '../../cloud/worker/handlers.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {canonicalSnapshotFingerprint} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import type {PortableJob} from '../../supabase/functions/_shared/phase-p-contract.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
/** Concrete SQL-backed PostgREST transport substitute, not an alternate replay implementation. */
function transport(db:PGlite):any{return {from:(table:string)=>{
 assert(/^[a-z_]+$/.test(table));let columns='*',filters:[string,unknown][]=[],order='',range:[number,number]|undefined;
 const execute=async()=>{try{const where=filters.map(([k],i)=>`${k}=$${i+1}`).join(' and '),r=await db.query(`select ${columns} from ${table}${where?' where '+where:''}${order?' order by '+order:''}${range?' limit '+(range[1]-range[0]+1)+' offset '+range[0]:''}`,filters.map(x=>x[1]));return {data:r.rows,error:null};}catch(error){return {data:null,error};}};
 const q:any={select:(c:string)=>{assert(/^[a-z_,*]+$/.test(c));columns=c;return q;},eq:(k:string,v:unknown)=>{assert(/^[a-z_]+$/.test(k));filters.push([k,v]);return q;},order:(k:string)=>{assert(/^[a-z_]+$/.test(k));order=k;return q;},range:(a:number,b:number)=>{range=[a,b];return q;},maybeSingle:async()=>{const r=await execute();return {...r,data:r.data?.[0]??null};},then:(a:any,b:any)=>execute().then(a,b)};return q;
},rpc:async(name:string,p:any)=>{try{
 const result=name==='heartbeat_phase_p_job'?await db.query('select heartbeat_phase_p_job($1,$2)',[p.p_id,p.p_token]):await db.query('select checkpoint_historical_replay($1,$2,$3) value',[p.p_job,p.p_token,JSON.stringify(p.p_tick)]);
 return {data:result.rows[0]?.value,error:null};}catch(error){return {data:null,error};}}};}
test('actual portable REPLAY handler → production engine → durable journal → forced yield → restart without duplicate confirmation',async()=>{
 const db=new PGlite({extensions:{btree_gist}});try{
  const sql:string[]=[];initializeDatabaseFixture((s:string)=>sql.push(s),{actor:owner,other});for(const s of sql)await db.exec(s);
  await db.exec("create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;alter table validation_dataset_candles add column native_evidence jsonb not null default '{}';");
  await db.exec(readFileSync('supabase/migrations/20261105011226_mission2_historical_journal.sql','utf8'));
  const now=Date.parse('2026-11-04T14:00:00Z'),rows:StrategyCandle[]=Array.from({length:244},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(now-(240-i)*300000).toISOString(),open:996+i,high:1005+i,low:995+i,close:1000+i,volume:1000}));
  const definitions=[{id:'crypto.micro-scalper',version:'1.0.0',enabled:true,minScore:72,minRiskReward:1.2,maxBarsInTrade:24,symbols:['BTCUSDT'],timeframes:['5m'],parameters:{entry_engine_version:1,tp2_r:3}}];
  const canonicalSnapshot={configurations:[{strategy_name:'MicroScalper',enabled:true}],releases:[{id:'controlled-test-release',strategy_id:'crypto.micro-scalper',state:'PROMOTED',immutable_configuration:{minSignalGrade:'A',strategies:definitions}}],strategyIds:['crypto.micro-scalper']};
  const configuration={version:'controlled-test-only',strategies:definitions},canonicalInputHash=await canonicalSnapshotFingerprint({configuration,canonicalSnapshot}),datasets:unknown[]=[];
  for(const [i,candles] of [rows,closedAggregate(rows,15,new Date(now+1200000).toISOString())].entries()){
   const id=`44444444-4444-4444-8444-44444444444${i}`,hash=await hashValidationDataset(candles);datasets.push({id,hash});
   await db.query("insert into validation_datasets(id,source,status,symbol,timeframe,starts_at,ends_at,dataset_hash,provenance,created_by,row_count) values($1,'BINANCE','READY','BTCUSDT',$2,$3,$4,$5,'CONTROLLED_TEST',$6,$7)",[id,candles[0].timeframe,candles[0].open_time,candles.at(-1)!.open_time,hash,owner,candles.length]);
   for(const c of candles)await db.query('insert into validation_dataset_candles(dataset_id,symbol,market_type,timeframe,open_time,open,high,low,close,volume,source) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,c.symbol,c.market_type,c.timeframe,c.open_time,c.open,c.high,c.low,c.close,c.volume,c.source]);
  }
  const run='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111',lease='33333333-3333-4333-8333-333333333333',payload={entryPolicyVersion:'entry-decision/v1',policyVerificationOnly:true,canonicalSnapshot,canonicalInputHash,configuration,datasets,start:new Date(now).toISOString(),end:new Date(now+360000).toISOString(),maxCycles:6};
  await db.query("insert into validation_runs(id,mode,status,configuration_hash,immutable_configuration,max_cycles,max_requests,created_by) values($1,'REPLAY','RUNNING',$2,$3,6,2,$4)",[run,canonicalInputHash,JSON.stringify(configuration),owner]);
  await db.query("insert into portable_jobs(id,kind,payload,customer_id,idempotency_key,status,lease_token,lease_expires_at,run_id,configuration_hash) values($1,'REPLAY',$2,$3,'worker-journal-test','RUNNING',$4,clock_timestamp()+interval '1 hour',$5,$6)",[id,JSON.stringify(payload),owner,lease,run,canonicalInputHash]);
  await db.exec("set role service_role;set request.jwt.claim.role='service_role';");
  const job=(await db.query<PortableJob>('select * from portable_jobs where id=$1',[id])).rows[0],client=transport(db),handlers=createHandlers(client);
  let yieldAfterFirst=true;
  const context:any={job,signal:new AbortController().signal,store:{},check:async()=>{const r=await client.rpc('heartbeat_phase_p_job',{p_id:id,p_token:lease});if(r.error)throw r.error;},remainingMs:()=>yieldAfterFirst&&job.checkpoint.cursor>=1?4000:45000};
  const first=await handlers.REPLAY(context);assert.equal(first.done,false);assert.equal(job.checkpoint.cursor,1);
  assert(JSON.stringify(job.checkpoint).length<1000);assert.equal((await db.query('select * from historical_replay_events')).rows.length,1);
  yieldAfterFirst=false;
  const second=await handlers.REPLAY(context);assert.equal(second.done,true);assert.equal((second.summary as any).confirmedEvents,1);assert.equal((second.summary as any).qualificationEligible,false);
  assert.equal(job.checkpoint.cursor,6);assert.equal((await db.query('select * from historical_replay_events')).rows.length,1);assert.equal((await db.query('select * from validation_cycles')).rows.length,6);
  const third=await handlers.REPLAY(context);assert.deepEqual(third,second);
  await db.query("select finish_phase_p_job($1,$2,'COMPLETED',$3,null)",[id,lease,JSON.stringify(second.summary)]);
  assert.equal((await db.query<{status:string}>('select status from validation_runs where id=$1',[run])).rows[0].status,'COMPLETED');
  assert.equal((await db.query('select * from validation_outcomes')).rows.length,0);
  assert.equal((await db.query('select * from historical_replay_events')).rows.length,1);
 }finally{await db.close();}
});
