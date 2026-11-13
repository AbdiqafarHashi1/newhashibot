import {launchSeries} from './launch-strategy-families.ts';
import {consecutiveMarketBars,continuousDiscoveryHistory} from './conditional-market.ts';
import {nativeCandleEvidence} from './native-candle-evidence.ts';
import type {LegacyStrategyResult,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
export const BROKER_FAMILY_CANDIDATES=[
 {market:'gold',family:'momentum',minutes:15,n:48,stop:3,rr:3},
 {market:'gold',family:'momentum',minutes:15,n:48,stop:2,rr:5},
 {market:'gold',family:'momentum',minutes:60,n:24,stop:2,rr:5},
 {market:'gold',family:'sweep_retest',minutes:60,n:24,stop:2,rr:3},
 {market:'gold',family:'band_reentry',minutes:15,n:48,stop:3,rr:5},
 {market:'forex',family:'band_reentry',minutes:60,n:12,stop:2,rr:5,symbol:'USDJPY'},
 {market:'forex',family:'squeeze',minutes:60,n:12,stop:2,rr:5,symbol:'EURUSD'},
 {market:'forex',family:'momentum',minutes:60,n:48,stop:2,rr:3,symbol:'USDJPY'},
 {market:'forex',family:'sweep_retest',minutes:60,n:16,stop:2,rr:1.5,symbol:'EURUSD',hold:24},
 {market:'forex',family:'sweep_retest',minutes:60,n:48,stop:1.5,rr:1.5,symbol:'GBPUSD',hold:72},
 {market:'forex',family:'sweep_retest',minutes:60,n:16,stop:2,rr:5,symbol:'USDJPY',hold:72},
 {market:'forex',family:'squeeze',minutes:60,n:16,stop:2,rr:3,symbol:'EURUSD',hold:24},
] as const;
export const BROKER_FX_SYMBOLS=['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];
export const brokerFamilyId=(c:typeof BROKER_FAMILY_CANDIDATES[number])=>`${c.market}.native-${c.family.replaceAll('_','-')}-${c.minutes}-${c.n}-${c.stop}-${c.rr}${'hold' in c?`-${c.symbol.toLowerCase()}-h${c.hold}`:''}`;
const reject=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{}});
export function evaluateBrokerFamily(ctx:StrategyEvaluationContext,c:typeof BROKER_FAMILY_CANDIDATES[number]):LegacyStrategyResult{
 const tf=c.minutes===60?'1h':'15m',width=c.minutes*60000,rows=continuousDiscoveryHistory(ctx.candles,width),symbols=c.market==='gold'?['XAUUSD']:['symbol' in c?c.symbol:'EURUSD'];
 if(ctx.market!=='forex'||ctx.timeframe!==tf||!symbols.includes(ctx.symbol)||rows.length<Math.max(100,c.n*3)||Date.parse(rows.at(-1)!.open_time)+width!==Date.parse(ctx.evaluated_at))return reject('NATIVE_BROKER_CLOSED_HISTORY_REQUIRED');
 for(let i=0;i<rows.length;i++){const b=rows[i];if(b.source!==rows[0].source||b.symbol!==ctx.symbol||b.timeframe!==tf||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||Date.parse(b.open_time)+width>Date.parse(ctx.evaluated_at)||i>0&&!consecutiveMarketBars(ctx.symbol,Date.parse(rows[i-1].open_time),Date.parse(b.open_time),width,b.source))return reject('NATIVE_BROKER_HISTORY_INVALID');
  if(b.source==='EXNESS_BROKER_BID_ASK'){try{if(b.ask_open===undefined)throw Error();nativeCandleEvidence(b as unknown as Record<string,unknown>);}catch{return reject('NATIVE_BROKER_ASK_INVALID');}}else if(!b.source.toLowerCase().startsWith('mt5'))return reject('NATIVE_BROKER_SOURCE_REQUIRED');
 }
 const s=launchSeries(rows,c.n),i=rows.length-1,b=rows[i];let buy=false,sell=false;
 if(c.family==='squeeze'){const previous=rows.slice(i-c.n,i),hi=Math.max(...previous.map(b=>b.high)),lo=Math.min(...previous.map(b=>b.low)),ready=Math.min(...s.width.slice(i-c.n,i))<.8,activity=previous.reduce((v,b)=>v+b.volume,0)/c.n;buy=b.close>hi&&ready&&b.volume>activity;sell=b.close<lo&&ready&&b.volume>activity;}
 else if(c.family==='sweep_retest'){const prior=rows[i-1],box=rows.slice(i-1-c.n,i-1),hi=Math.max(...box.map(b=>b.high)),lo=Math.min(...box.map(b=>b.low));buy=prior.low<lo&&prior.close>lo&&b.close>prior.high;sell=prior.high>hi&&prior.close<hi&&b.close<prior.low;}
 else if(c.family==='band_reentry'){const band=(end:number)=>{const values=rows.slice(end-c.n+1,end+1).map(b=>b.close),mean=values.reduce((a,b)=>a+b,0)/c.n,std=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/c.n);return{low:mean-2*std,high:mean+2*std};},prior=band(i-1),current=band(i),range=Math.abs((s.fast[i]-s.slow[i])/s.atr[i])<1;buy=rows[i-1].close<prior.low&&b.close>current.low&&b.close>b.open&&range;sell=rows[i-1].close>prior.high&&b.close<current.high&&b.close<b.open&&range;}
 else {const momentum=(b.close-rows[i-c.n].close)/s.atr[i],prior=(rows[i-1].close-rows[i-1-c.n].close)/s.atr[i-1];buy=momentum>1.5&&prior<=1.5&&b.close>s.slow[i];sell=momentum< -1.5&&prior>=-1.5&&b.close<s.slow[i];}
 if(!buy&&!sell)return reject('FROZEN_BROKER_FAMILY_CONDITION_ABSENT');const sign=buy?1:-1,dist=s.atr[i]*c.stop,stop=b.close-sign*dist,target=b.close+sign*dist*c.rr;if(!(dist>0&&stop>0&&target>0))return reject('INVALID_PRICE_GEOMETRY');
 return {status:'candidate',direction:buy?'buy':'sell',entry_low:b.close,entry_high:b.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:c.rr,confidence_score:80,grade:'A',reason:`Closed ${tf} ${c.family}; ${c.n} bars; ${c.stop} ATR stop; ${c.rr}R full-position target.`,rejection_reason:'',score_breakdown:{research_only:true,score_is_probability:false,lookback:c.n,atr14:s.atr[i],stop_atr:c.stop,reward_r:c.rr,max_bars_in_trade:'hold' in c?c.hold:c.n*4,source:b.source,seed_open_time:rows[0].open_time,seed_policy:'FIRST_CLOSE_RECURSIVE'}};
}
export function brokerStrategyDefinitions():StrategyDefinition[]{return BROKER_FAMILY_CANDIDATES.map(c=>({id:brokerFamilyId(c),version:'1.0.0',legacyName:brokerFamilyId(c),market:'forex',lifecycle:'RESEARCH',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:brokerFamilyId(c),enabled:false,min_score:75,min_rr:Math.max(.8,c.rr-.6),max_bars_in_trade:'hold' in c?c.hold:c.n*4,allowed_symbols:c.market==='gold'?['XAUUSD']:['symbol' in c?c.symbol:'EURUSD'],allowed_timeframes:[c.minutes===60?'1h':'15m'],params:{}},evaluate:ctx=>evaluateBrokerFamily(ctx,c)}));}
export const brokerFamilyProfile=(id:string)=>BROKER_FAMILY_CANDIDATES.some(c=>brokerFamilyId(c)===id)?{family:/sweep-retest|band-reentry/.test(id)?'REVERSAL' as const:BROKER_FAMILY_CANDIDATES.find(c=>brokerFamilyId(c)===id)?.family==='squeeze'?'BREAKOUT' as const:'TREND' as const}:null;
