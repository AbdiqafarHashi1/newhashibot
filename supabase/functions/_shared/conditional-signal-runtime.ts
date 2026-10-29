import { advanceConditionalSetup, conditionalCandidates, conditionalMessage, selectConditionalSetup, type ConditionalSetup } from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export class ConditionalSignalStore {
 constructor(private db:any){}
 async open(symbol:string,timeframe:string):Promise<ConditionalSetup[]>{
  const {data,error}=await this.db.from('conditional_signal_setups').select('state').eq('symbol',symbol).eq('timeframe',timeframe).in('status',['WAITING','ARMED','ACTIVE']).limit(1);
  if(error)throw error;return(data??[]).map((r:any)=>r.state);
 }
 async save(s:ConditionalSetup,expected:number):Promise<boolean>{
  const {data,error}=await this.db.rpc('commit_conditional_signal_setup',{p_state:s,p_expected_version:expected,p_message:conditionalMessage(s)});
  if(error)throw error;return data===true;
 }
}
/** Existing scanner invokes this after closed-candle admission; no independent daemon or executor. */
export async function observeConditionalSymbol(store:ConditionalSignalStore,symbol:string,tf:'15m'|'1h',rows:readonly StrategyCandle[],now:number):Promise<ConditionalSetup[]> {
 const open=await store.open(symbol,tf);
 for(const saved of open){let state=saved;
  for(const bar of rows){if(Date.parse(bar.open_time)<=Date.parse(state.lastBar)||Date.parse(bar.open_time)+(tf==='15m'?900000:3600000)>now)continue;
   const next=advanceConditionalSetup(state,bar);if(next===state)continue;
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
  return (['INTRADAY','SWING'] as const).flatMap(track=>{const winner=selectConditionalSetup(g.filter(s=>s.track===track),now);return winner?[winner]:[];});})
  .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 let admitted=0;for(const s of winners)if(await store.save(s,0))admitted++;
 return {considered:candidates.length,winners:winners.length,admitted};
}
