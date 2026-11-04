import {decideEntry,entryPolicyQualified} from './entry-decision.ts';
import {frozenStrategyConfirmation} from './frozen-strategy-confirmation.ts';
import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import {strategyContextDecision,type WatchedIntelligence} from './watched-market-context.ts';
import { advanceConditionalSetup, originalThesisValid, conditionalCandidates, conditionalMessage, selectConditionalSetup, type ConditionalSetup } from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export class ConditionalSignalStore {
 constructor(private db:any){}
 async open(symbol:string,timeframe:string):Promise<ConditionalSetup[]>{
  const {data,error}=await this.db.from('conditional_signal_setups').select('state').eq('symbol',symbol).eq('timeframe',timeframe).in('status',['WAITING','ARMED','ACTIVE']).limit(100);
  if(error)throw error;return(data??[]).map((r:any)=>r.state);
 }
 async expire(symbol:string,timeframe:string,now:number):Promise<number>{
  let count=0;
  for(const s of await this.open(symbol,timeframe))if(['WAITING','ARMED'].includes(s.status)&&now>=Date.parse(s.expiresAt)){
   if(await this.save({...s,version:s.version+1,status:'EXPIRED',observedAt:new Date(now).toISOString(),result:'Confirmation deadline elapsed; no entry.'},s.version))count++;
  }
  return count;
 }
 async rejected(s:ConditionalSetup,reason:string,now:number):Promise<void>{
  if(!s.origin)return;
  const {error}=await this.db.rpc('record_watched_strategy_observations',{p_rows:[{strategy_id:s.strategy,symbol:s.symbol,timeframe:s.timeframe,checked_at:new Date(now).toISOString(),decision:'NO_TRADE',reason,evidence:{strategy_version:s.origin.version,source_close:s.sourceClose,configuration:s.origin.configuration,intelligence:s.intelligence,entry_decision:{...s.entryDecision,kind:'NO_TRADE',executionEligible:false,reasons:[reason]},arbitration:{opportunity_id:s.id,rejected:true,reason}}}]});
  if(error)throw error;
 }
 async admit(s:ConditionalSetup):Promise<boolean>{
  const {data,error}=await this.db.rpc('admit_conditional_signal_setup',{p_state:s,p_message:conditionalMessage(s)});
  if(error)throw error;return data===true;
 }
 async save(s:ConditionalSetup,expected:number):Promise<boolean>{
  const {data,error}=await this.db.rpc('commit_conditional_signal_setup',{p_state:s,p_expected_version:expected,p_message:conditionalMessage(s)});
  if(error)throw error;return data===true;
 }
}
/** Shared by discovery and the independent watcher; CAS makes overlapping runs safe. */
export async function observeConditionalSymbol(store:ConditionalSignalStore,symbol:string,tf:WatchTimeframe,rows:readonly StrategyCandle[],now:number,options?:{confirmation?:(s:ConditionalSetup,rows:readonly StrategyCandle[],at:number)=>ReturnType<typeof frozenStrategyConfirmation>;intelligence?:(rows:readonly StrategyCandle[],at:number)=>WatchedIntelligence}):Promise<ConditionalSetup[]> {
 const open=await store.open(symbol,tf);
 for(const saved of open){let state=saved;
  for(const bar of rows){if(Date.parse(bar.open_time)<=Date.parse(state.lastBar)||Date.parse(bar.open_time)+watchWidth(tf)>now)continue;
   let next=advanceConditionalSetup(state,bar);if(next===state){
    if(['WAITING','ARMED'].includes(state.status)&&state.evaluationOutcome!=='DATA_UNAVAILABLE')await store.save({...state,version:state.version+1,evaluationOutcome:'DATA_UNAVAILABLE',observedAt:new Date(now).toISOString()},state.version);
    break; // Never skip past a missing/source-mismatched observation to seek a later confirmation.
   }
   if(next.status==='WAITING')next={...next,evaluationOutcome:'STILL_WAITING'};
   if(state.status==='WAITING'&&['WAITING','ARMED'].includes(next.status)){
    const prefix=rows.filter(r=>Date.parse(r.open_time)<=Date.parse(bar.open_time)),at=Date.parse(bar.open_time)+watchWidth(tf);
    if(state.origin&&options?.intelligence){
     const intel=options.intelligence(prefix,at);
     next={...next,confirmationIntelligence:intel};
     const decision=intel.spreadPrice!==null&&intel.spreadPrice/Math.abs(state.trigger-state.stop)>.2?'WAIT':strategyContextDecision(state.origin.thesis,state.side,prefix,intel);
     if(decision==='INVALID')next={...next,status:'INVALIDATED',result:'Original strategy context invalidated before entry; no paper fill.'};
     if(decision==='WAIT')next={...next,status:'WAITING',armedAt:undefined,result:'Strategy context is holding confirmation for volume, volatility or a recorded news window.'};
     if(decision==='UNKNOWN')next={...next,status:'WAITING',armedAt:undefined,result:'Strategy context unavailable; entry remains unconfirmed.'};
    }else{
     const thesis=originalThesisValid(state,prefix,at);
     if(thesis===false)next={...next,status:'INVALIDATED',result:'Original strategy context invalidated before entry; no paper fill.'};
     if(thesis===null)next={...state,version:state.version+1,observedAt:new Date(now).toISOString(),evaluationOutcome:'DATA_UNAVAILABLE',result:'Original strategy context unavailable; watch retained for retry.'};
    }
   }
   if(state.status==='ARMED'&&state.origin&&options?.intelligence&&next.status!=='DATA_GAP'){
    const at=Date.parse(bar.open_time),prefix=rows.filter(r=>Date.parse(r.open_time)<at),intel=options.intelligence(prefix,at);
    const decision=intel.spreadPrice!==null&&intel.spreadPrice/Math.abs(state.trigger-state.stop)>.2?'WAIT':strategyContextDecision(state.origin.thesis,state.side,prefix,intel);
    if(decision!=='VALID')next={...state,version:state.version+1,lastBar:bar.open_time,status:'INVALIDATED',confirmationIntelligence:intel,result:'Next-open strategy context did not qualify; no paper entry.'};
    else next={...next,confirmationIntelligence:intel};
   }
   if(state.origin&&state.entryDecision&&state.origin.configuration.config_source?.startsWith('measured_release:')&&state.status==='WAITING'&&next.status==='ARMED'){
    const prefix=rows.filter(r=>Date.parse(r.open_time)<=Date.parse(bar.open_time)),at=Date.parse(bar.open_time)+watchWidth(tf);
    const intel=next.confirmationIntelligence;
    const trigger=options?.confirmation?options.confirmation(state,prefix,at):frozenStrategyConfirmation(state,prefix,at);
    if(!intel||trigger!=='CONFIRMED')next={...next,status:'WAITING',armedAt:undefined,result:trigger==='DATA_UNAVAILABLE'?'DATA_UNAVAILABLE: original evaluator could not be verified.':'STILL_WAITING: original named evaluator has not confirmed.'};
    else {
     const decision=decideEntry({setup:state,rows:prefix,now,intelligence:intel,qualified:entryPolicyQualified(state.origin.configuration),originalTriggerConfirmed:trigger==='CONFIRMED'});
     next={...next,entryDecision:decision};
     if(decision.kind!=='IMMEDIATE_CONFIRMED')next={...next,status:'WAITING',armedAt:undefined,result:'STILL_WAITING: '+decision.reasons.join(', ')};
    }
   }
   if(!await store.save(next,state.version))break;state=next;
  }
 }
 return conditionalCandidates(symbol,tf,rows,now);
}
/** Strongest first across the whole bounded universe, not database symbol iteration order. */
export async function admitConditionalBatch(store:ConditionalSignalStore,candidates:readonly ConditionalSetup[],now:number){
 const grouped=new Map<string,ConditionalSetup[]>();for(const s of candidates){const g=grouped.get(s.symbol)??[];g.push(s);grouped.set(s.symbol,g);}
 const winners=[...grouped.values()].flatMap(g=>{
  if(new Set(g.map(s=>s.side)).size>1)return [];
  return (['SCALP','INTRADAY','SWING'] as const).flatMap(track=>{const winner=selectConditionalSetup(g.filter(s=>s.track===track),now);return winner?[winner]:[];});})
  .sort((a,b)=>(b.selectionScore??b.score)-(a.selectionScore??a.score)||a.id.localeCompare(b.id));
 const selected=new Set(winners.map(s=>s.id));
 for(const s of candidates)if(!selected.has(s.id)&&store.rejected)await store.rejected(s,new Set((grouped.get(s.symbol)??[]).map(s=>s.side)).size>1?'OPPOSING_OPPORTUNITIES':'LOWER_ARBITRATION_RANK',now);
 let admitted=0;for(const s of winners){if(await (store.admit?store.admit(s):store.save(s,0)))admitted++;else if(store.rejected)await store.rejected(s,'ATOMIC_ADMISSION_CONFLICT_OR_CAPACITY',now);}
 return {considered:candidates.length,winners:winners.length,admitted};
}
