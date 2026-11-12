import type {ConditionalStore} from './conditional-signal-runtime.ts';
import {resolvedWatchState} from './conditional-signal-runtime.ts';
import {entryPolicyQualified,entryPolicyResearchAuthorized} from './entry-decision.ts';
import {conditionalMarket} from './conditional-market.ts';
import {conditionalMessage,type ConditionalSetup} from './conditional-signal-service.ts';

export interface HistoricalLifecycleEvent {id:string;at:string;setupId:string;version:number;status:string;confirmedSignalId:string|null;researchSignalId?:string;message:string;}
export interface HistoricalStoreSnapshot {
 schema:'historical-conditional-store/v1';
 records:{state:ConditionalSetup;createdAt:number;updatedAt:number}[];
 events:HistoricalLifecycleEvent[];
 rejections:{setupId:string;reason:string;at:string}[];
}
const mutable=new Set(['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit','fillAt','observedAt','confirmationIntelligence','entryDecision','evaluationOutcome','watchOutcome','confirmationEvidence']);
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const frozen=(s:ConditionalSetup)=>canonical(Object.fromEntries(Object.entries(s).filter(([k])=>!mutable.has(k))));
const open=(s:ConditionalSetup)=>['WAITING','ARMED','ACTIVE'].includes(s.status);
/** Historical persistence boundary only. Strategy/entry/management decisions remain in production modules.
 * Snapshot must be committed together with its evidence by the calling job before advancing its clock.
 * No database, Telegram client or provider client is reachable from this adapter. */
export class HistoricalConditionalStore implements ConditionalStore {
 private denied=new Map<string,string>();
 private records=new Map<string,HistoricalStoreSnapshot['records'][number]>();
 private events:HistoricalLifecycleEvent[]=[];
 private rejections:HistoricalStoreSnapshot['rejections']=[];
 constructor(private clock:()=>number,snapshot?:HistoricalStoreSnapshot,private admissionProfile:'PRODUCTION_PARITY'|'RISK_CAPACITY_ONLY'='PRODUCTION_PARITY'){
  if(snapshot){
   if(snapshot.schema!=='historical-conditional-store/v1')throw Error('HISTORICAL_STORE_VERSION_MISMATCH');
   for(const r of snapshot.records){if(this.records.has(r.state.id))throw Error('DUPLICATE_CHECKPOINT_SETUP');this.records.set(r.state.id,structuredClone(r));}
   if(new Set(snapshot.events.map(e=>e.id)).size!==snapshot.events.length)throw Error('DUPLICATE_CHECKPOINT_EVENT');
   this.events=structuredClone(snapshot.events);this.rejections=structuredClone(snapshot.rejections);
  }
 }
 eventCount(){return this.events.length;}
 rejectionCount(){return this.rejections.length;}
 activeStreams(){return [...this.records.values()].filter(r=>open(r.state)).map(r=>({symbol:r.state.symbol,tf:r.state.timeframe}));}
 snapshot():HistoricalStoreSnapshot{return structuredClone({schema:'historical-conditional-store/v1',records:[...this.records.values()].sort((a,b)=>a.state.id.localeCompare(b.state.id)),events:this.events,rejections:this.rejections});}
 async open(symbol:string,timeframe:string){return structuredClone([...this.records.values()].map(r=>r.state).filter(s=>s.symbol===symbol&&s.timeframe===timeframe&&open(s)));}
 async expire(symbol:string,timeframe:string,now:number){let n=0;for(const s of await this.open(symbol,timeframe))if(['WAITING','ARMED'].includes(s.status)&&now>=Date.parse(s.expiresAt))if(await this.save({...s,status:'EXPIRED',version:s.version+1,observedAt:new Date(now).toISOString(),result:'Confirmation deadline elapsed; no entry.'},s.version))n++;return n;}
 async rejected(s:ConditionalSetup,reason:string,now:number){this.rejections.push({setupId:s.id,reason:reason==='ATOMIC_ADMISSION_CONFLICT_OR_CAPACITY'?(this.denied.get(s.id)??reason):reason,at:new Date(now).toISOString()});}
 async admit(s:ConditionalSetup){if(this.records.has(s.id)){this.denied.set(s.id,'DUPLICATE_OPPORTUNITY_REEVALUATION');return false;}return this.save(s,0);}
 async save(input:ConditionalSetup,expected:number):Promise<boolean>{
  // No await in the transaction: compare-and-swap, admission and event append are indivisible.
  const s=structuredClone(resolvedWatchState(input)),now=this.clock(),old=this.records.get(s.id),terminal=['CLOSED','EXPIRED','INVALIDATED','DATA_GAP'];
  if(!Number.isFinite(now)||!Number.isInteger(s.version)||!s.origin||s.entryDecision?.opportunityId!==s.id||s.entryDecision.strategyVersion!==s.origin.version)throw Error('INVALID_HISTORICAL_STATE');
  if(old){
   if(old.state.version===s.version){if(canonical(old.state)===canonical(s))return true;throw Error('CONDITIONAL_CONTENT_CONFLICT');}
   if(old.state.version!==expected||s.version!==expected+1)return false;
   if(frozen(old.state)!==frozen(s))throw Error('IMMUTABLE_SETUP_PLAN');
   if(old.state.watchOutcome&&old.state.watchOutcome!==s.watchOutcome)throw Error('TERMINAL_WATCH_OUTCOME');
   if(old.state.fill!==undefined&&(old.state.fill!==s.fill||old.state.fillAt!==s.fillAt||canonical(old.state.confirmationEvidence)!==canonical(s.confirmationEvidence)))throw Error('IMMUTABLE_PAPER_ENTRY');
   if(terminal.includes(old.state.status))throw Error('TERMINAL_SETUP');
   const transitions:Record<string,string[]>={WAITING:['WAITING','ARMED','EXPIRED','INVALIDATED','DATA_GAP'],ARMED:['ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP',...(s.evaluationOutcome==='DATA_UNAVAILABLE'?['ARMED']:[])],ACTIVE:['ACTIVE','CLOSED','DATA_GAP']};
   if(!transitions[old.state.status]?.includes(s.status))throw Error('INVALID_SETUP_TRANSITION');
   if(['WAITING','ARMED'].includes(old.state.status)&&['ARMED','ACTIVE'].includes(s.status)&&now>=Date.parse(old.state.expiresAt))return false;
   const next=Date.parse(s.lastBar),prior=Date.parse(old.state.lastBar);
   if(next<prior)throw Error('NONCHRONOLOGICAL_SETUP');
   if(next===prior){
    const unavailable=s.status===old.state.status&&s.evaluationOutcome==='DATA_UNAVAILABLE'&&Date.parse(s.observedAt??'')>=(Date.parse(old.state.observedAt??'')||old.createdAt);
    const expiry=['WAITING','ARMED'].includes(old.state.status)&&s.status==='EXPIRED'&&now>=Date.parse(s.expiresAt)&&Date.parse(s.observedAt??'')>=Date.parse(s.expiresAt);
    const nextOpen=old.state.status==='ARMED'&&['ACTIVE','INVALIDATED'].includes(s.status)&&Date.parse(s.observedAt??'')>=Date.parse(old.state.armedAt??'')&&(s.status==='INVALIDATED'||s.fillAt===old.state.armedAt);
    if(!unavailable&&!expiry&&!nextOpen)throw Error('NONCHRONOLOGICAL_SETUP');
   }
  }else{
   if(expected!==0||s.version!==1||!['WAITING','ACTIVE'].includes(s.status)||now>=Date.parse(s.expiresAt))return false;
   if(this.admissionProfile!=='PRODUCTION_PARITY'&&!entryPolicyResearchAuthorized(s.origin.configuration))throw Error('RESEARCH_ADMISSION_PROFILE_REQUIRED');
   const market=conditionalMarket(s.symbol),all=[...this.records.values()];
   const deny=(reason:string)=>{this.denied.set(s.id,reason);return false;};
   if(all.some(r=>r.state.symbol===s.symbol&&r.state.timeframe===s.timeframe&&open(r.state)))return deny('OPEN_WATCH_SAME_SYMBOL_TIMEFRAME');
   if(this.admissionProfile==='PRODUCTION_PARITY'&&all.some(r=>r.state.symbol===s.symbol&&r.state.timeframe===s.timeframe&&r.updatedAt>now-(s.track==='SCALP'?900000:14400000)))return deny('SYMBOL_TIMEFRAME_COOLDOWN');
   if(all.some(r=>r.state.symbol===s.symbol&&open(r.state)&&r.state.side!==s.side))return deny('OPPOSING_EXPOSURE');
   if(all.some(r=>r.state.symbol===s.symbol&&r.state.status==='ACTIVE'&&(this.admissionProfile==='PRODUCTION_PARITY'||r.state.track===s.track)&&(r.state.entryDecision?.executionEligible||r.state.entryDecision?.authorizationScope==='RESEARCH')))return deny('ACTIVE_SIGNAL_SAME_SYMBOL');
   if(this.admissionProfile==='PRODUCTION_PARITY'&&all.filter(r=>conditionalMarket(r.state.symbol)===market&&r.state.track===s.track&&open(r.state)).length>=10)return deny('OPEN_WATCH_CAPACITY');
   if(this.admissionProfile==='PRODUCTION_PARITY'&&all.filter(r=>conditionalMarket(r.state.symbol)===market&&r.state.track===s.track&&r.createdAt>now-3600000).length>=3)return deny('HOURLY_ADMISSION_CAP');
  }
  if(s.status==='ACTIVE'&&old?.state.status!=='ACTIVE'&&(!old||s.entryDecision.executionEligible)){
   const d=s.entryDecision;
   const research=d.authorizationScope==='RESEARCH'&&entryPolicyResearchAuthorized(s.origin.configuration)&&!d.executionEligible;
   if((!entryPolicyQualified(s.origin.configuration)&&!research)||!s.origin.plan.decision.qualified||(!d.executionEligible&&!research)||d.kind!=='IMMEDIATE_CONFIRMED'||d.confirmation!=='COMPLETE'||d.reasons.length||!(s.fill!>0)||!s.fillAt||!s.observedAt||Date.parse(s.observedAt)>now||now-Date.parse(s.fillAt)>90000)throw Error('CONFIRMED_SIGNAL_PROJECTION_REJECTED');
  }
  const message=conditionalMessage(s); // Validate serialization before committing any mutation.
  this.records.set(s.id,{state:s,createdAt:old?.createdAt??now,updatedAt:now});
  if(!old||s.status!==old.state.status||s.partial!==old.state.partial){
   this.events.push({id:`conditional:${s.id}:${s.version}`,at:new Date(now).toISOString(),setupId:s.id,version:s.version,status:s.status,confirmedSignalId:s.status==='ACTIVE'&&s.entryDecision?.executionEligible?`historical-confirmed:${s.id}`:null,...(s.status==='ACTIVE'&&s.entryDecision?.authorizationScope==='RESEARCH'?{researchSignalId:`historical-research:${s.id}`}:{ }),message});
  }
  return true;
 }
}
