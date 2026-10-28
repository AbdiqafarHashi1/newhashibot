import {SIGNAL_ENSEMBLE_PROFILE_IDS} from './signal-ensemble-catalog.ts';
import {LEGACY_CRYPTO_PROFILE_ID} from './legacy-crypto-research-profile.ts';
import {CRYPTO_TEAM_PROFILE_IDS} from './coordinated-crypto-contract.ts';
import {ALT_CANDIDATE_ID} from './crypto-relative-strength-contract.ts';
export const PORTABLE_KINDS = ['HISTORY', 'REPLAY', 'ACCOUNT', 'PROP'] as const;
export type PortableKind = typeof PORTABLE_KINDS[number];
export const LIMITS = Object.freeze({cycles:500, symbols:4, candles:3000, pages:12, runtimeMs:45000, attempts:3, concurrency:1, dailyJobs:20, dailySlices:100, aiTokens:0, aiSpend:0, artifacts:0, artifactRetentionDays:0});
/** Explicit research capacity; does not change slice time, daily budgets, retries or execution authority. */
export const RESEARCH_LIMITS=Object.freeze({cycles:10000,candles:12000});
export interface PortableJob {
  id:string; kind:PortableKind; customer_id:string; execution_account_id:string|null;
  payload:Record<string,any>; checkpoint:Record<string,any>; lease_token:string;
  attempt:number; max_attempts:number; run_id:string; configuration_hash:string|null;
}
export class WorkerFault extends Error {
  constructor(public code:string, public permanent=false){super(code);}
}
export function boundedInteger(value:unknown, fallback:number, max:number){
  const n=value===undefined?fallback:Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>max)throw new WorkerFault('TASK_LIMIT_INVALID',true);
  return n;
}
const uuid=(x:unknown)=>{if(typeof x!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))throw new WorkerFault('IDENTIFIER_INVALID',true);return x.toLowerCase();};
/** Accept a closed request vocabulary; secrets, customer identity, config and generic payloads are server-owned. */
export function parsePortableRequest(body:Record<string,any>){
  const kind=body.kind as PortableKind;
  if(!PORTABLE_KINDS.includes(kind))throw new WorkerFault('TASK_KIND_INVALID',true);
  const allowed=['kind','idempotencyKey',...(kind==='HISTORY'?['provider','symbol','timeframe','start','end']:kind==='REPLAY'?['datasetIds','extended','strategyIds','researchCandidateId','researchModelId','start','end','maxCycles','releaseCandidateId','fees','funding','spread','slippage']:kind==='ACCOUNT'?['sourceRunId','accountId','brainAssignmentId','initialCapital','currency']:['accountRunId','propConfigId'])];
  if(Object.keys(body).some(k=>!allowed.includes(k)))throw new WorkerFault('TASK_FIELD_NOT_ALLOWED',true);
  if(typeof body.idempotencyKey!=='string'||!/^[a-zA-Z0-9:_-]{8,100}$/.test(body.idempotencyKey))throw new WorkerFault('IDEMPOTENCY_REQUIRED',true);
  let input:Record<string,any>;
  if(kind==='HISTORY'||kind==='REPLAY'){
    const start=new Date(body.start).toISOString(),end=new Date(body.end).toISOString();
    if(Date.parse(start)>=Date.parse(end)||Date.parse(end)>Date.now())throw new WorkerFault('TASK_RANGE_INVALID',true);
    if(kind==='HISTORY'){
      if(!['BINANCE','BYBIT'].includes(body.provider)||!/^([A-Z0-9]{2,15})USDT$/.test(body.symbol)||!['5m','15m','1h','4h'].includes(body.timeframe))throw new WorkerFault('HISTORY_SOURCE_INVALID',true);
      const width=Number(body.timeframe.slice(0,-1))*(body.timeframe.endsWith('m')?60000:3600000);
      if(Math.ceil((Date.parse(end)-Date.parse(start))/width)>LIMITS.candles)throw new WorkerFault('CANDLE_LIMIT_EXCEEDED',true);
      input={provider:body.provider,symbol:body.symbol,timeframe:body.timeframe,start,end};
    }else{
      if(!Array.isArray(body.datasetIds)||!body.datasetIds.length||body.datasetIds.length>(SIGNAL_ENSEMBLE_PROFILE_IDS.includes(body.researchCandidateId)?5:LIMITS.symbols))throw new WorkerFault('DATASET_LIMIT_INVALID',true);
      const costs=Object.fromEntries(['fees','funding','spread','slippage'].map(k=>{const n=Number(body[k]??0);if(!Number.isFinite(n)||n<0||n>100)throw new WorkerFault('REPLAY_COST_INVALID',true);return[k,n];}));
      if(body.strategyIds!==undefined&&(!Array.isArray(body.strategyIds)||!body.strategyIds.length||body.strategyIds.length>20||body.strategyIds.some((x:unknown)=>typeof x!=='string'||!/^[a-z][a-z0-9.-]{2,80}$/.test(x))))throw new WorkerFault('STRATEGY_SELECTION_INVALID',true);
      if(body.strategyIds&&body.releaseCandidateId)throw new WorkerFault('FROZEN_RELEASE_CANNOT_BE_SUBSET',true);
      if(body.researchModelId&&(body.strategyIds||body.releaseCandidateId))throw new WorkerFault('RESEARCH_MODEL_SCOPE_CONFLICT',true);
      if(body.researchCandidateId!==undefined&&(body.researchCandidateId!==ALT_CANDIDATE_ID&&body.researchCandidateId!==LEGACY_CRYPTO_PROFILE_ID&&!CRYPTO_TEAM_PROFILE_IDS.includes(body.researchCandidateId)&&!SIGNAL_ENSEMBLE_PROFILE_IDS.includes(body.researchCandidateId)||body.strategyIds||body.researchModelId||body.releaseCandidateId))throw new WorkerFault('RESEARCH_CANDIDATE_SCOPE_INVALID',true);
      if(body.extended!==undefined&&typeof body.extended!=='boolean')throw new WorkerFault('RESEARCH_PROFILE_INVALID',true);
      input={...(body.researchCandidateId?{researchCandidateId:body.researchCandidateId}:{}),...(body.extended?{extended:true}:{}),...(body.researchModelId?{researchModelId:uuid(body.researchModelId)}:{}),...(body.strategyIds?{strategyIds:[...new Set<string>(body.strategyIds)].sort()}:{}),...(body.releaseCandidateId?{releaseCandidateId:uuid(body.releaseCandidateId)}:{}),datasetIds:[...new Set<string>(body.datasetIds.map(uuid))].sort(),start,end,maxCycles:boundedInteger(body.maxCycles,LIMITS.cycles,body.extended?RESEARCH_LIMITS.cycles:LIMITS.cycles),...costs};
    }
  }else if(kind==='ACCOUNT'){
    if(!Number.isFinite(body.initialCapital)||body.initialCapital<=0||body.initialCapital>1e8||!/^[A-Z]{3}$/.test(body.currency))throw new WorkerFault('ACCOUNT_INPUT_INVALID',true);
    input={sourceRunId:uuid(body.sourceRunId),accountId:uuid(body.accountId),brainAssignmentId:uuid(body.brainAssignmentId),initialCapital:body.initialCapital,currency:body.currency};
  }else input={accountRunId:uuid(body.accountRunId),propConfigId:uuid(body.propConfigId)};
  return {kind,input,idempotencyKey:body.idempotencyKey};
}
