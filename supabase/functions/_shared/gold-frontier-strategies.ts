import type {LegacyStrategyResult,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
import {nativeCandleEvidence} from './native-candle-evidence.ts';
export const GOLD_FRONTIER_COMPRESSION='gold.frontier-compression-15-24-1.5-5-h96';
const reject=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{}});
/** Frozen closed-bar compression candidate. Research lifecycle grants no execution. */
export function evaluateGoldFrontierCompression(ctx:StrategyEvaluationContext):LegacyStrategyResult{
 const r=ctx.candles,w=900000,n=r.length,i=n-1;
 if(ctx.market!=='forex'||ctx.symbol!=='XAUUSD'||ctx.timeframe!=='15m'||n<40||Date.parse(r[i].open_time)+w!==Date.parse(ctx.evaluated_at))return reject('CLOSED_GOLD_M15_HISTORY_REQUIRED');
 if(r.some((b,j)=>b.symbol!=='XAUUSD'||b.timeframe!=='15m'||b.source!==r[0].source||!(b.source==='EXNESS_BROKER_BID_ASK'||b.source.toLowerCase().startsWith('mt5_hashibridge:'))||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||(j>0&&Date.parse(b.open_time)<=Date.parse(r[j-1].open_time))))return reject('NATIVE_GOLD_HISTORY_INVALID');
 try{for(const b of r){if(b.source==='EXNESS_BROKER_BID_ASK'&&!['ask_open','ask_high','ask_low','ask_close'].every(k=>typeof (b as unknown as Record<string,unknown>)[k]==='number'&&Number.isFinite((b as unknown as Record<string,number>)[k])))throw Error('EXNESS_ASK_REQUIRED');nativeCandleEvidence({...b})}}catch{return reject('NATIVE_GOLD_QUOTES_INVALID')}
 const hour=new Date(ctx.evaluated_at).getUTCHours();if(hour<6||hour>=20)return reject('GOLD_FRONTIER_ENTRY_SESSION_CLOSED');
 if(r.slice(-21).some((b,j,a)=>j>0&&Date.parse(b.open_time)-Date.parse(a[j-1].open_time)!==w))return reject('GOLD_FRONTIER_COMPLETE_RECENT_BARS_REQUIRED');
 const tr=r.map((b,j)=>Math.max(b.high-b.low,j?Math.abs(b.high-r[j-1].close):0,j?Math.abs(b.low-r[j-1].close):0)),atr=(end:number)=>tr.slice(end-13,end+1).reduce((s,x)=>s+x,0)/14;
 const a=atr(i),previousAtr=atr(i-1),previousThree=r.slice(i-3,i),tight=Math.max(...previousThree.map(b=>b.high))-Math.min(...previousThree.map(b=>b.low))<2*previousAtr,prior=r.slice(i-24,i),b=r[i],width=b.high-b.low,position=width>0?(b.close-b.low)/width:NaN;
 if(!(a>0&&width<3*a&&tight))return reject('GOLD_FRONTIER_COMPRESSION_ABSENT');
 const buy=b.close>Math.max(...prior.map(b=>b.high))&&position>.75,sell=b.close<Math.min(...prior.map(b=>b.low))&&position<.25;
 if(!buy&&!sell)return reject('GOLD_FRONTIER_BREAK_NOT_CLOSED');
 const sign=buy?1:-1,lastTwo=r.slice(-2),stop=buy?Math.min(b.close-1.5*a,Math.min(...lastTwo.map(b=>b.low))-.1*a):Math.max(b.close+1.5*a,Math.max(...lastTwo.map(b=>b.high))+.1*a),distance=sign*(b.close-stop),target=b.close+sign*5*distance;
 if(!(distance>0&&stop>0&&target>0))return reject('GOLD_FRONTIER_PRICE_GEOMETRY_INVALID');
 return {status:'candidate',direction:buy?'buy':'sell',entry_low:b.close,entry_high:b.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:5,confidence_score:80,grade:'A',reason:'Closed Gold compression break; 24-bar channel, 1.5 ATR / structure protection, full-position 5R target.',rejection_reason:'',score_breakdown:{research_only:true,score_is_probability:false,atr14:a,stop_atr:1.5,reward_r:5,max_bars_in_trade:96,lookback:24,management_model:'FULL_POSITION_FIXED_TARGET',seed_policy:'FINITE_ROLLING_CLOSED_BARS'}};
}
export function goldFrontierDefinitions():StrategyDefinition[]{return [{id:GOLD_FRONTIER_COMPRESSION,version:'1.0.0',legacyName:GOLD_FRONTIER_COMPRESSION,market:'forex',lifecycle:'RESEARCH',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:GOLD_FRONTIER_COMPRESSION,enabled:false,min_score:75,min_rr:4.4,max_bars_in_trade:96,allowed_symbols:['XAUUSD'],allowed_timeframes:['15m'],params:{}},evaluate:evaluateGoldFrontierCompression}];}
export const goldFrontierProfile=(id:string)=>id===GOLD_FRONTIER_COMPRESSION?{family:'BREAKOUT' as const}:null;
