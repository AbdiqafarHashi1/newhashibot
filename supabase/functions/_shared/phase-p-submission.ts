import {createApprovedReplayRegistry} from './active-validation-runtime.ts';
import {DEFAULT_REPLAY_ASSUMPTIONS} from './replay-outcomes.ts';
import {LIMITS,parsePortableRequest,WorkerFault} from './phase-p-contract.ts';
import {loadApprovedValidationConfiguration} from './approved-validation-configuration.ts';
import {deriveAccountSimulationAuthority,derivePropCampaignAuthority} from './phase-m-authority-loader.ts';
export async function fingerprint(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function preparePortableSubmission(db:any,actor:string,body:Record<string,any>){
  const {data:profile,error}=await db.from('profiles').select('role').eq('id',actor).maybeSingle();
  if(error||profile?.role!=='admin')throw new WorkerFault('ADMIN_REQUIRED',true);
  const request=parsePortableRequest(body),payload={...request.input},kind=request.kind;
  const {data:existing,error:lookupError}=await db.from('portable_jobs').select('*').eq('idempotency_key',`phase-p:${actor}:${request.idempotencyKey}`).maybeSingle();
  if(lookupError)throw new WorkerFault('JOB_SUBMISSION_LOOKUP_FAILED');
  if(existing){
    const selection=Object.fromEntries(Object.keys(request.input).map(k=>[k,existing.payload[k]]));
    if(existing.customer_id!==actor||existing.kind!==kind||await fingerprint(selection)!==await fingerprint(request.input))throw new WorkerFault('IDEMPOTENCY_CONFLICT',true);
    return {p_actor:actor,p_kind:kind,p_payload:existing.payload,p_key:request.idempotencyKey,p_hash:existing.configuration_hash,p_account:existing.execution_account_id};
  }
  let hash:string|null=null,account:string|null=null;
  if(kind==='REPLAY'){
    const {data,error}=await db.from('validation_datasets').select('*').in('id',payload.datasetIds).eq('created_by',actor);
    if(error||data?.length!==payload.datasetIds.length||data.some((x:any)=>x.status!=='READY'||x.row_count>LIMITS.candles||x.row_count<55))throw new WorkerFault('DATASET_NOT_READY_OR_UNAUTHORIZED',true);
    if(new Set(data.map((x:any)=>x.configuration_version??'strategy-config/current')).size>1)throw new WorkerFault('REPLAY_CONFIGURATION_LINEAGE_CONFLICT',true);
    if(new Set(data.map((x:any)=>`${x.symbol}:${x.timeframe}`)).size!==data.length)throw new WorkerFault('REPLAY_DUPLICATE_SYMBOL_TIMEFRAME',true);
    const approved=await loadApprovedValidationConfiguration(db);hash=approved.hash;
    for(const dataset of data){
      const market=dataset.market_type??(/USDT$/.test(dataset.symbol)?'crypto':'forex');
      if(!['crypto','forex','gold','metal'].includes(market)||(market==='crypto')!==/USDT$/.test(dataset.symbol))throw new WorkerFault('REPLAY_MARKET_UNSUPPORTED',true);
      try{createApprovedReplayRegistry(approved.configuration,dataset.symbol,dataset.timeframe);}catch{throw new WorkerFault('REPLAY_SELECTION_NOT_APPROVED',true);}
    }
    payload.assumptions={...DEFAULT_REPLAY_ASSUMPTIONS,feeBps:payload.fees,spreadBps:payload.spread,slippageBps:payload.slippage,fundingBps:payload.funding};
    payload.configuration=approved.configuration;payload.datasets=payload.datasetIds.map((id:string)=>({id,hash:data.find((x:any)=>x.id===id).dataset_hash}));
    payload.datasetHashes=payload.datasets.map((x:any)=>x.hash);payload.datasetHash=payload.datasetHashes.join(':');
  }else if(kind==='ACCOUNT'){
    const authority=await deriveAccountSimulationAuthority(db,{...payload,actorId:actor,maxEvidenceRows:LIMITS.cycles} as any);
    if(authority.points.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
    hash=await fingerprint(authority);account=authority.account.id;
    payload.canonicalSourceRunId=authority.source.run.id;payload.datasetHash=authority.source.run.dataset_hash;payload.sourceConfigurationHash=authority.source.run.configuration_hash;payload.brainVersion=authority.brain.policy_version;
  }else if(kind==='PROP'){
    const authority=await derivePropCampaignAuthority(db,{...payload,actorId:actor,maxEvidenceRows:LIMITS.cycles} as any);
    if(authority.trades.length>LIMITS.cycles)throw new WorkerFault('CYCLE_LIMIT_EXCEEDED',true);
    hash=await fingerprint(authority);account=authority.run.immutable_input.accountId??null;
    payload.canonicalSourceRunId=authority.run.source_run_id;payload.datasetHash=authority.run.dataset_hash;payload.sourceConfigurationHash=authority.run.configuration_hash;
  }
  return {p_actor:actor,p_kind:kind,p_payload:payload,p_key:request.idempotencyKey,p_hash:hash,p_account:account};
}
