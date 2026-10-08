import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Db,job,candles,start,run} from './fixtures.ts';
import {preparePortableSubmission} from '../../supabase/functions/_shared/phase-p-submission.ts';
import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {PortableSubmissionAttempts} from '../../src/lib/portableSubmissionAttempt.ts';
import {databaseHealth} from '../../cloud/worker/health.ts';
import {createHandlers} from '../../cloud/worker/handlers.ts';
import {runSlice} from '../../cloud/worker/runtime.ts';
import {SupabaseWorkerStore} from '../../cloud/worker/store.ts';
import {WorkerFault} from '../../supabase/functions/_shared/phase-p-contract.ts';
const ids=['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
const input={datasetIds:ids,start:new Date(start).toISOString(),end:new Date(start+100*900000).toISOString(),maxCycles:100};
async function setup(symbols:string[],allowed:string[]=[]){
 const db=new Db();db.tables.profiles=[{id:'owner',role:'admin'}];
 db.tables.scanner_config=[{id:1,min_signal_grade:'B'}];
 db.tables.strategy_configs=['SwingContinuation','ForexTrendPullback'].map(strategy_name=>({strategy_name,enabled:true,min_score:0,min_rr:0,max_bars_in_trade:40,allowed_symbols:allowed,allowed_timeframes:['15m'],params:{}}));
 db.tables.validation_datasets=[];db.tables.validation_dataset_candles=[];
 for(const [i,symbol] of symbols.entries()){
  const bars=candles.map(c=>({...c,symbol,market_type:symbol.endsWith('USDT')?'crypto':'forex',source:symbol.endsWith('USDT')?'BINANCE':'MT5_OWNER_HASHIBRIDGE'}));
  const hash=await hashValidationDataset(bars);
  db.tables.validation_datasets.push({id:ids[i],created_by:'owner',status:'READY',row_count:bars.length,dataset_hash:hash,symbol,timeframe:'15m',source:bars[0].source});
  db.tables.validation_dataset_candles.push(...bars.map(c=>({...c,dataset_id:ids[i]})));
 }
 return db;
}
test('submission freezes order-independent two-symbol and mixed-market production configuration through concrete persistence',async()=>{
 for(const symbols of [['BTCUSDT','ETHUSDT'],['BTCUSDT','EURUSD']]){
  const db=await setup(symbols);
  const a=await preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input});
  const b=await preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input,datasetIds:[...ids].reverse()});
  assert.deepEqual(a,b);assert.ok(a.p_payload.configuration.strategies.every((x:any)=>x.symbols.length===0),'empty production restriction stays unrestricted');
  db.job=job('REPLAY',a.p_payload);db.job.configuration_hash=a.p_hash;
  assert.equal((await run(db)).state,'COMPLETED');
  for(const symbol of symbols)assert.ok(db.rows.some(x=>x.row.strategy_results.some((c:any)=>c.symbol===symbol)||x.row.cycle_key.includes(symbol)),symbol);
  const first=db.rows.map(x=>x.row);db.job=job('REPLAY',b.p_payload);db.job.configuration_hash=b.p_hash;db.state='QUEUED';db.rows=[];
  assert.equal((await run(db)).state,'COMPLETED');assert.deepEqual(db.rows.map(x=>x.row),first);
 }
});
test('explicit restrictions retain eligibility; unsupported symbols and timeframes reject at submission',async()=>{
 const db=await setup(['BTCUSDT','ETHUSDT'],['BTCUSDT','ETHUSDT']);
 const a=await preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input});
 assert.deepEqual(a.p_payload.configuration.strategies[0].symbols,['BTCUSDT','ETHUSDT']);
 db.tables.strategy_configs.forEach(x=>x.allowed_symbols=['BTCUSDT']);
 await assert.rejects(()=>preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input}),/REPLAY_SELECTION_NOT_APPROVED/);
 db.tables.strategy_configs.forEach(x=>{x.allowed_symbols=[];x.allowed_timeframes=['1h'];});
 await assert.rejects(()=>preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input}),/REPLAY_SELECTION_NOT_APPROVED/);
});
test('durable retry keys survive accepted response loss, refresh, ordering, concurrent clicks, new selections, new runs and users',async()=>{
 const map=new Map<string,string>(),storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 let keys=0,quota=0,calls=0,lose=true;const accepted=new Map<string,string>();
 const send=async(key:string)=>{calls++;if(!accepted.has(key)){quota++;accepted.set(key,`run-${quota}`);}await new Promise(r=>setTimeout(r,2));if(lose){lose=false;throw Error('RESPONSE_LOST');}return accepted.get(key)!;};
 const manager=new PortableSubmissionAttempts(storage,()=>`attempt-key${++keys}`);
 const first=manager.submit('owner','REPLAY',input,send),double=manager.submit('owner','REPLAY',input,send);
 assert.equal(first,double);await assert.rejects(()=>first,/RESPONSE_LOST/);assert.equal(calls,1);
 const refreshed=new PortableSubmissionAttempts(storage,()=>`attempt-key${++keys}`);
 assert.equal(await refreshed.submit('owner','REPLAY',{...input,datasetIds:[...ids].reverse()},send),'run-1');assert.equal(quota,1);
 assert.equal(await refreshed.submit('owner','REPLAY',{...input,maxCycles:99},send),'run-2');
 assert.equal(await refreshed.submit('owner','REPLAY',input,send,true),'run-3');
 assert.equal(await refreshed.submit('other','REPLAY',input,send),'run-4');assert.equal(quota,4);
});
test('replay cancels while processing a selected outcome and never finalizes cancelled work',async()=>{
 const db=await setup(['BTCUSDT','ETHUSDT']);const args=await preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input});
 db.job=job('REPLAY',args.p_payload);db.job.configuration_hash=args.p_hash;
 const store=new SupabaseWorkerStore(db);let checks=0;
 store.heartbeat=async()=>{if(++checks===12)throw new WorkerFault('JOB_CANCELLED');};
 const result=await runSlice({store,handlers:createHandlers(db),host:'test',revision:'test'});
 assert.equal(result.state,'JOB_CANCELLED');assert.ok(!db.finish);assert.ok(checks>=12);
});
test('concrete replay yields with durable scanner state; restart does not repeat the persisted prefix',async()=>{
 const db=await setup(['BTCUSDT','ETHUSDT']);const args=await preparePortableSubmission(db,'owner',{kind:'REPLAY',idempotencyKey:'attempt-key1',...input});
 db.job=job('REPLAY',args.p_payload);db.job.configuration_hash=args.p_hash;
 db.state='RUNNING';const handlers=createHandlers(db),store=new SupabaseWorkerStore(db);let writes=0;
 const original=store.checkpoint.bind(store);store.checkpoint=async(j,c,rows)=>{await original(j,c,rows);writes++;};
 const result=await handlers.REPLAY({job:db.job,store,signal:new AbortController().signal,check:async()=>{},remainingMs:()=>writes>=3?4000:45000});
 assert.equal(result.done,false);assert.equal(db.job.checkpoint.cursor,3);const prefix=JSON.stringify(db.rows);
 db.state='QUEUED';assert.equal((await run(db)).state,'COMPLETED');assert.equal(JSON.stringify(db.rows.slice(0,3)),prefix);assert.ok(db.rows.length>3);
 const dead=db.job;dead.lease_token='expired';db.state='RUNNING';await assert.rejects(()=>store.checkpoint({...dead,lease_token:'old'},dead.checkpoint,[]),/LEASE_LOST/);
});
test('health distinguishes configuration-only, read-only schema readiness and database failure',async()=>{
 assert.deepEqual(await databaseHealth(),{status:'CONFIGURATION_ONLY',databaseReady:false});
 const db=new Db();db.tables.phase_p_worker_control=[{id:true,stop_new_work:true}];assert.equal((await databaseHealth(db)).status,'DATABASE_READY');assert.ok(db.calls.every(x=>x.startsWith('read:')));
 assert.equal((await databaseHealth({from:()=>({select:()=>({limit:async()=>({error:Error('offline')})})})})).status,'DATABASE_UNAVAILABLE');
});

import {accountFixture} from './fixtures.ts';
import {fingerprint} from '../../cloud/worker/handlers.ts';
import {simulateWithPhaseD} from '../../supabase/functions/_shared/phase-m-account-adapter.ts';
import {PROP_PROFILES} from '../../src/lib/prop/professionalPropEngine.ts';
import {derivePropCampaignAuthority} from '../../supabase/functions/_shared/phase-m-authority-loader.ts';
import {runProfessionalPropCampaign} from '../../supabase/functions/_shared/professional-prop-validation-adapter.ts';
test('Account evaluation checkpoints Phase-D state, resumes without recomputing its prefix, and survives shutdown',async()=>{
 const {db,payload,authority}=await accountFixture();db.job=job('ACCOUNT',payload);db.job.configuration_hash=await fingerprint(authority);db.state='RUNNING';db.rows=[];
 const store=new SupabaseWorkerStore(db),handlers=createHandlers(db);let writes=0;const checkpoint=store.checkpoint.bind(store);
 store.checkpoint=async(j,c,rows)=>{await checkpoint(j,c,rows);writes++;};
 assert.equal((await handlers.ACCOUNT({job:db.job,store,signal:new AbortController().signal,check:async()=>{},remainingMs:()=>writes>=3?4000:45000})).done,false);
 assert.equal(db.job.checkpoint.account.cursor,3);const prefix=JSON.stringify(db.rows);db.state='QUEUED';
 assert.equal((await run(db)).state,'COMPLETED');assert.equal(JSON.stringify(db.rows.slice(0,3)),prefix);
 const golden=simulateWithPhaseD({initialCapital:authority.initialCapital,accountCurrency:authority.accountCurrency,points:authority.points,contracts:authority.contracts});
 assert.deepEqual(db.rows.map(x=>x.row.evidence),golden.decisions);assert.equal(db.finish.p_summary.endingBalance,golden.endingBalance);
 const controller=new AbortController();db.job=job('ACCOUNT',payload);db.job.configuration_hash=await fingerprint(authority);db.state='QUEUED';db.rows=[];db.finish=null;let checks=0;
 const interrupted=new SupabaseWorkerStore(db);interrupted.heartbeat=async()=>{if(++checks===4)controller.abort('SHUTDOWN');};
 const result=await runSlice({store:interrupted,handlers,host:'test',revision:'test',signal:controller.signal});
 assert.equal(result.state,'YIELD');assert.ok(db.job.checkpoint.cursor>0);assert.equal(db.job.attempt,0,'shutdown is a yield, not an exhausted retry');
});
test('Prop yields during shared professional evaluation and resumes at the next persisted window; cancellation never completes',async()=>{
 const {db,payload,authority,hash}=await accountFixture();const account=simulateWithPhaseD({initialCapital:authority.initialCapital,accountCurrency:authority.accountCurrency,points:authority.points,contracts:authority.contracts});
 db.tables.validation_simulation_runs=[{id:'account-run',kind:'ACCOUNT',created_by:'owner',status:'COMPLETED',cancellation_requested_at:null,source_run_id:'scanner',dataset_hash:hash,configuration_hash:'config-hash',immutable_input:payload}];
 db.tables.validation_simulation_evidence=account.decisions.map((evidence,sequence)=>({run_id:'account-run',sequence,evidence}));
 const profile=PROP_PROFILES.FTMO_TWO_STEP;db.tables.prop_account_configs=[{id:'prop',user_id:'owner',profile_id:'FTMO_TWO_STEP',profile_version:profile.profileVersion,configuration:{id:'prop',profileId:'FTMO_TWO_STEP',profileVersion:profile.profileVersion,accountSize:10000,currency:'USD'}}];
 const propInput={accountRunId:'account-run',propConfigId:'prop'},propAuthority=await derivePropCampaignAuthority(db,{...propInput,actorId:'owner'});
 db.job=job('PROP',propInput);db.job.configuration_hash=await fingerprint(propAuthority);db.state='RUNNING';db.rows=[];
 const handlers=createHandlers(db),store=new SupabaseWorkerStore(db);let writes=0;const checkpoint=store.checkpoint.bind(store);store.checkpoint=async(j,c,rows)=>{await checkpoint(j,c,rows);writes++;};
 assert.equal((await handlers.PROP({job:db.job,store,signal:new AbortController().signal,check:async()=>{},remainingMs:()=>writes>=2?4000:45000})).done,false);assert.equal(db.job.checkpoint.cursor,2);
 const prefix=JSON.stringify(db.rows);db.state='QUEUED';assert.equal((await run(db)).state,'COMPLETED');assert.equal(JSON.stringify(db.rows.slice(0,2)),prefix);
 const golden=runProfessionalPropCampaign({profile:propAuthority.profile,config:propAuthority.config,trades:propAuthority.trades,configurationHash:'config-hash'});
 assert.equal(db.finish.p_summary.campaignStatus,golden.status);assert.deepEqual(db.rows.map(x=>x.row.evidence.result),golden.challenge!.results.map(x=>x.result));
 db.job=job('PROP',propInput);db.job.configuration_hash=await fingerprint(propAuthority);db.state='QUEUED';db.finish=null;db.rows=[];let checks=0;
 const cancelled=new SupabaseWorkerStore(db);cancelled.heartbeat=async()=>{if(++checks===10)throw new WorkerFault('JOB_CANCELLED');};
 assert.equal((await runSlice({store:cancelled,handlers,host:'test',revision:'test'})).state,'JOB_CANCELLED');assert.ok(!db.finish);
});
test('an accepted attempt returns frozen authority even when current strategy approval has changed',async()=>{
 const db=await setup(['BTCUSDT','ETHUSDT']);const request={kind:'REPLAY',idempotencyKey:'attempt-key1',...input};const a=await preparePortableSubmission(db,'owner',request);
 db.tables.portable_jobs=[{id:'accepted',customer_id:'owner',kind:'REPLAY',idempotency_key:'phase-p:owner:attempt-key1',payload:a.p_payload,configuration_hash:a.p_hash,execution_account_id:null}];db.tables.strategy_configs=[];
 assert.deepEqual(await preparePortableSubmission(db,'owner',request),a);
 await assert.rejects(()=>preparePortableSubmission(db,'owner',{...request,maxCycles:99}),/IDEMPOTENCY_CONFLICT/);
});
