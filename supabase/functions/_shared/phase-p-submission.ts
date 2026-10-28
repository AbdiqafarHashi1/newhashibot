import {OBSERVED_REPLAY_SELECTION_POLICY} from './scanner-replay-policy.ts';
import {LEGACY_CRYPTO_PROFILE_ID,legacyCryptoResearchConfiguration} from './legacy-crypto-research-profile.ts';
import {teamReleaseScopeAllowed} from './coordinated-crypto-release.ts';
import {REPLAY_LIFECYCLE_VERSION} from './scanner-replay-lifecycle.ts';
import {CRYPTO_TEAM_ASSUMPTIONS} from './coordinated-crypto-contract.ts';
import {coordinatedConfiguration} from './coordinated-crypto.ts';
import {CRYPTO_TEAM_PROFILE_IDS} from './coordinated-crypto-contract.ts';
import {isCryptoTeam,referenceOnly,validateCoordinatedDatasets} from './coordinated-crypto-selection.ts';
import {altReplayConfiguration} from './crypto-relative-strength.ts';
import {createApprovedReplayRegistry} from './active-validation-runtime.ts';
import {DEFAULT_REPLAY_ASSUMPTIONS} from './replay-outcomes.ts';
import {LIMITS,parsePortableRequest,WorkerFault} from './phase-p-contract.ts';
import {loadApprovedValidationConfiguration} from './approved-validation-configuration.ts';
import {deriveAccountSimulationAuthority,derivePropCampaignAuthority} from './phase-m-authority-loader.ts';
import {MAX_STORED_CANDLES} from './native-candle-evidence.ts';
import {researchModelSnapshot} from './research-model-snapshots.ts';
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
    if(error||data?.length!==payload.datasetIds.length||data.some((x:any)=>x.status!=='READY'||x.row_count>MAX_STORED_CANDLES||x.row_count<55))throw new WorkerFault('DATASET_NOT_READY_OR_UNAUTHORIZED',true);
    if(data.reduce((n:number,d:{row_count:number})=>n+Number(d.row_count),0)>MAX_STORED_CANDLES)throw new WorkerFault('SOURCE_BATCH_TOO_LARGE_SELECT_FEWER_DATASETS',true);
    if(new Set(data.map((x:any)=>x.configuration_version??'strategy-config/current')).size>1)throw new WorkerFault('REPLAY_CONFIGURATION_LINEAGE_CONFLICT',true);
    if(new Set(data.map((x:any)=>`${x.symbol}:${x.timeframe}`)).size!==data.length)throw new WorkerFault('REPLAY_DUPLICATE_SYMBOL_TIMEFRAME',true);
    let approved;
    if(payload.researchModelId){const {data:model,error}=await db.from('validation_research_models').select('*').eq('id',payload.researchModelId).eq('created_by',actor).eq('publication_eligible',false).maybeSingle();if(error||!model)throw new WorkerFault('RESEARCH_MODEL_NOT_OWNED',true);approved=await researchModelSnapshot({strategyId:model.strategy_id,parameters:model.configuration?.strategies?.[0]?.parameters});if(approved.hash!==model.content_hash||Date.parse(payload.start)<Date.parse(model.valid_from)||Date.parse(payload.end)>Date.parse(model.valid_until))throw new WorkerFault('RESEARCH_MODEL_LINEAGE_OR_DATE_INVALID',true);payload.researchOnly=true;}
    else if(payload.researchCandidateId){const configuration=payload.researchCandidateId===LEGACY_CRYPTO_PROFILE_ID?legacyCryptoResearchConfiguration():CRYPTO_TEAM_PROFILE_IDS.includes(payload.researchCandidateId)?coordinatedConfiguration(payload.researchCandidateId):altReplayConfiguration();approved={configuration,hash:await fingerprint(configuration)};validateCoordinatedDatasets(configuration,data.map((d:{symbol:string;timeframe:string;market_type?:string})=>({...d,market:d.market_type??(/USDT$/.test(d.symbol)?'crypto':'forex')})));payload.researchOnly=true;}
    else approved=await loadApprovedValidationConfiguration(db);
    if(payload.strategyIds){const strategies=approved.configuration.strategies.filter((s:{id:string})=>payload.strategyIds.includes(s.id));if(strategies.length!==payload.strategyIds.length)throw new WorkerFault('STRATEGY_SELECTION_NOT_APPROVED',true);const configuration={...approved.configuration,version:'strategy-config/isolated-subset',strategies};approved={configuration,hash:await fingerprint(configuration)};}
    if(payload.releaseCandidateId){const {data:c,error}=await db.from('strategy_release_candidates').select('*').eq('id',payload.releaseCandidateId).eq('created_by',actor).eq('state','FROZEN').maybeSingle();if(error||!c||c.holdout_run_id)throw new WorkerFault('FROZEN_RELEASE_CANDIDATE_REQUIRED',true);approved={configuration:c.immutable_configuration,hash:c.configuration_hash};}
    if(isCryptoTeam(approved.configuration)){if(!('researchOnly' in approved.configuration)||!approved.configuration.researchOnly){if(!approved.configuration.strategies.every(teamReleaseScopeAllowed))throw new WorkerFault('TEAM_UNMEASURED_SCOPE_RESEARCH_ONLY',true);}const configuration={...approved.configuration,outcomeAssumptions:{...CRYPTO_TEAM_ASSUMPTIONS}};approved={configuration,hash:await fingerprint(configuration)};validateCoordinatedDatasets(configuration,data.map((d:{symbol:string;timeframe:string;market_type?:string})=>({...d,market:d.market_type??(/USDT$/.test(d.symbol)?'crypto':'forex')})));}
    hash=approved.hash;
    for(const dataset of data){
      const market=dataset.market_type??(/USDT$/.test(dataset.symbol)?'crypto':'forex');
      if(!['crypto','forex','gold','metal'].includes(market)||(market==='crypto')!==/USDT$/.test(dataset.symbol))throw new WorkerFault('REPLAY_MARKET_UNSUPPORTED',true);
      if(referenceOnly(approved.configuration,dataset.symbol))continue;
      try{createApprovedReplayRegistry(approved.configuration,dataset.symbol,dataset.timeframe);}catch{throw new WorkerFault('REPLAY_SELECTION_NOT_APPROVED',true);}
    }
    payload.assumptions={...DEFAULT_REPLAY_ASSUMPTIONS,feeBps:payload.fees,spreadBps:payload.spread,slippageBps:payload.slippage,fundingBps:payload.funding};
    if(payload.researchModelId||payload.researchCandidateId||isCryptoTeam(approved.configuration))payload.assumptions=approved.configuration.outcomeAssumptions;
    payload.configuration=approved.configuration;payload.datasets=payload.datasetIds.map((id:string)=>({id,hash:data.find((x:any)=>x.id===id).dataset_hash}));
    payload.signalLifecycleVersion=REPLAY_LIFECYCLE_VERSION;
    payload.selectionPolicyHash=await fingerprint(OBSERVED_REPLAY_SELECTION_POLICY);
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
