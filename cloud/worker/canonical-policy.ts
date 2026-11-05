import type {SupabaseClient} from '@supabase/supabase-js';
import type {TaskHandler} from './runtime.ts';
import {ComputationYield,computationCheck} from './computation.ts';
import {WorkerFault} from '../../supabase/functions/_shared/phase-p-contract.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {runCanonicalHistoricalReplay,historicalCandleChecksum,canonicalSnapshotFingerprint,type CanonicalHistoricalDataset} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import {HistoricalReplayJournal,type HistoricalJournalDatabase} from '../../supabase/functions/_shared/historical-replay-journal.ts';
import {loadValidationDataset} from '../../supabase/functions/_shared/validation-dataset-upload.ts';
import {hashValidationDataset,validateDatasetIntegrity} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {WATCH_TIMEFRAMES,type WatchTimeframe} from '../../supabase/functions/_shared/conditional-contract.ts';
/** Production worker route for signal-policy verification. Account/profitability qualification stays blocked. */
const executeCanonicalPolicyJob=async(db:SupabaseClient,context:Parameters<TaskHandler>[0]):ReturnType<TaskHandler>=>{
 const job=context.job,p=job.payload;
 if(p.policyVerificationOnly!==true||p.canonicalInputHash!==job.configuration_hash||p.canonicalInputHash!==await canonicalSnapshotFingerprint({configuration:p.configuration,canonicalSnapshot:p.canonicalSnapshot}))throw new WorkerFault('CANONICAL_SNAPSHOT_LINEAGE_INVALID',true);
 const definitions=watchedStrategyCatalog(p.canonicalSnapshot.configurations,p.canonicalSnapshot.releases).filter(d=>p.canonicalSnapshot.strategyIds.includes(d.id)),datasets:CanonicalHistoricalDataset[]=[];
 for(const selected of p.datasets){
  await computationCheck(context);
  const meta=await db.from('validation_datasets').select('id,status,dataset_hash,created_by,symbol,timeframe').eq('id',selected.id).eq('created_by',job.customer_id).maybeSingle();
  if(meta.error||!meta.data||meta.data.status!=='READY'||meta.data.dataset_hash!==selected.hash)throw new WorkerFault('SOURCE_NOT_CURRENT',true);
  const m=meta.data;if(!WATCH_TIMEFRAMES.includes(m.timeframe as WatchTimeframe))throw new WorkerFault('CANONICAL_TIMEFRAME_UNSUPPORTED',true);
  const candles=await loadValidationDataset(db,selected.id);validateDatasetIntegrity(candles,{symbol:m.symbol,timeframe:m.timeframe});if(await hashValidationDataset(candles)!==selected.hash)throw new WorkerFault('DATASET_HASH_MISMATCH',true);
  const sources=new Set(candles.map(b=>b.source));if(sources.size!==1)throw new WorkerFault('CANONICAL_DATA_SOURCE_MISMATCH',true);
  const instrument=candles.every(b=>b.instrument_type==='SPOT')?'SPOT':candles.every(b=>b.instrument_type==='USDT_PERPETUAL')?'PERPETUAL':candles.every(b=>b.ask_open!==undefined&&b.ask_close!==undefined)?'BROKER_BID_ASK':'INDICATIVE';
  datasets.push({id:selected.id,sha256:await historicalCandleChecksum(candles),symbol:m.symbol,timeframe:m.timeframe as WatchTimeframe,candles,provenance:{source:varsFirst(sources),instrument,limitations:['Signal policy verification only; no broker fills, account performance or qualification',...(instrument==='INDICATIVE'?['Native instrument/bid-ask evidence incomplete']:[])]}});
 }
 const journal=new HistoricalReplayJournal(db as unknown as HistoricalJournalDatabase,job),resume=await journal.load();
 try{
  const result=await runCanonicalHistoricalReplay({datasets,definitions,start:Date.parse(p.start),end:Date.parse(p.end)-60000,maxSteps:p.maxCycles,resume,shouldCancel:async()=>{await computationCheck(context);if(context.remainingMs()<5000)throw new ComputationYield();return context.signal.aborted;},checkpoint:async(e,state)=>{await computationCheck(context);await journal.commit(e,state);if(context.remainingMs()<5000)throw new ComputationYield();}});
  if(result.status!=='COMPLETED')throw new WorkerFault('SLICE_INTERRUPTED');
  const snapshot=result.checkpoint.store;
  return {done:true,summary:{classification:'CANONICAL_SIGNAL_POLICY_VERIFICATION',signalPolicyVersion:'entry-decision/v1',cycles:result.checkpoint.cursor,outcomes:0,watchedSetups:snapshot.records.length,confirmedEvents:new Set(snapshot.events.filter(e=>e.confirmedSignalId).map(e=>e.confirmedSignalId)).size,publication:false,execution:false,qualificationEligible:false,brokerFills:false,profitability:'NOT_EVALUATED'}};
 }catch(e){if(e instanceof ComputationYield)return {done:false,summary:{}};throw e;}
};
function varsFirst(values:Set<string>){const first=values.values().next().value;if(!first)throw new WorkerFault('CANONICAL_DATASET_EMPTY',true);return first;}

export const runCanonicalPolicyJob=async(db:SupabaseClient,context:Parameters<TaskHandler>[0]):ReturnType<TaskHandler>=>{
 try{return await executeCanonicalPolicyJob(db,context);}catch(e){
  if(e instanceof WorkerFault)throw e;
  const message=e instanceof Error?e.message:String(e),code=message.match(/(?:HISTORICAL_[A-Z_]+|LEASE_LOST|JOB_CANCELLED|AUTHORIZATION_REVOKED)/)?.[0];
  if(code)throw new WorkerFault(code,!['LEASE_LOST','JOB_CANCELLED','AUTHORIZATION_REVOKED','HISTORICAL_JOURNAL_READ_FAILED'].includes(code));
  throw new WorkerFault('CANONICAL_REPLAY_FAILED');
 }
};
