import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import {strategyContextDecision,type WatchedIntelligence} from './watched-market-context.ts';
import { advanceConditionalSetup, originalThesisValid, conditionalCandidates, conditionalMessage, selectConditionalSetup, type ConditionalSetup } from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export class ConditionalSignalStore {
 constructor(private db:any){}
 async open(symbol:string,timeframe:string):Promise<ConditionalSetup[]>{
  const {data,error}=await this.db.from('conditional_signal_setups').select('state').eq('symbol',symbol).eq('timeframe',timeframe).in('status',['WAITING','ARMED','ACTIVE']).limit(1);
  if(error)throw error;return(data??[]).map((r:any)=>r.state);
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
export async function observeConditionalSymbol(store:ConditionalSignalStore,symbol:string,tf:WatchTimeframe,rows:readonly StrategyCandle[],now:number,options?:{intelligence?:(rows:readonly StrategyCandle[],at:number)=>WatchedIntelligence}):Promise<ConditionalSetup[]> {
 const open=await store.open(symbol,tf);
 for(const saved of open){let state=saved;
  for(const bar of rows){if(Date.parse(bar.open_time)<=Date.parse(state.lastBar)||Date.parse(bar.open_time)+watchWidth(tf)>now)continue;
   let next=advanceConditionalSetup(state,bar);if(next===state)continue;
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
     if(thesis===null)next={...next,status:'DATA_GAP',result:'Original strategy context unavailable; outcome unknown.'};
    }
   }
   if(state.status==='ARMED'&&state.origin&&options?.intelligence&&next.status!=='DATA_GAP'){
    const at=Date.parse(bar.open_time),prefix=rows.filter(r=>Date.parse(r.open_time)<at),intel=options.intelligence(prefix,at);
    const decision=intel.spreadPrice!==null&&intel.spreadPrice/Math.abs(state.trigger-state.stop)>.2?'WAIT':strategyContextDecision(state.origin.thesis,state.side,prefix,intel);
    if(decision!=='VALID')next={...state,version:state.version+1,lastBar:bar.open_time,status:'INVALIDATED',confirmationIntelligence:intel,result:'Next-open strategy context did not qualify; no paper entry.'};
    else next={...next,confirmationIntelligence:intel};
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
  .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 let admitted=0;for(const s of winners)if(await (store.admit?store.admit(s):store.save(s,0)))admitted++;
 return {considered:candidates.length,winners:winners.length,admitted};
}
