import type {LegacyStrategyResult,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
import {nativeCandleEvidence} from './native-candle-evidence.ts';
import {GOLD_RSI_TRAILING,simpleClosedAtr} from './atr-trailing-policy.ts';
const reject=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{}});
const ema=(values:readonly number[],alpha:number)=>values.reduce((v,x,i)=>i?alpha*x+(1-alpha)*v:x,0);
/** Finite 240-bar seed is part of this exact implementation, not an inherited backtest claim. */
export function evaluateGoldRsiTrailing(ctx:StrategyEvaluationContext):LegacyStrategyResult {
 const rows=ctx.candles.slice(-240),w=900000,last=rows.at(-1),at=Date.parse(ctx.evaluated_at);
 if(ctx.market!=='forex'||ctx.symbol!=='XAUUSD'||ctx.timeframe!=='15m'||rows.length<100||!last||Date.parse(last.open_time)+w!==at)return reject('GOLD_RSI_CLOSED_M15_HISTORY_REQUIRED');
 try{for(let i=0;i<rows.length;i++){const b=rows[i];if(b.symbol!=='XAUUSD'||b.timeframe!=='15m'||b.source!==rows[0].source||!(b.source==='EXNESS_BROKER_BID_ASK'||b.source.toLowerCase().startsWith('mt5_hashibridge:'))||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||i>0&&Date.parse(b.open_time)<=Date.parse(rows[i-1].open_time))throw Error();nativeCandleEvidence({...b});if(b.source==='EXNESS_BROKER_BID_ASK'&&!['ask_open','ask_high','ask_low','ask_close'].every(k=>typeof (b as unknown as Record<string,unknown>)[k]==='number'&&Number.isFinite((b as unknown as Record<string,number>)[k])))throw Error();}}catch{return reject('GOLD_RSI_NATIVE_HISTORY_REQUIRED');}
 if(rows.slice(-49).some((b,i,a)=>i>0&&Date.parse(b.open_time)-Date.parse(a[i-1].open_time)!==w))return reject('GOLD_RSI_RECENT_CONTINUITY_REQUIRED');
 const hour=new Date(at).getUTCHours();if(hour<6||hour>=20)return reject('GOLD_RSI_ENTRY_SESSION_CLOSED');
 const atr=simpleClosedAtr(rows);if(!atr||last.high-last.low>=3*atr)return reject('GOLD_RSI_VOLATILITY_INVALID');
 const closes=rows.map(b=>b.close),fast=ema(closes,2/13),slow=ema(closes,2/49),prior=closes.slice(0,-1),changes=prior.slice(1).map((c,i)=>c-prior[i]);
 const gain=ema(changes.map(c=>Math.max(0,c)),.5),loss=ema(changes.map(c=>Math.max(0,-c)),.5),rsi=loss>0?100-100/(1+gain/loss):NaN;
 const buy=fast>slow&&rsi<15&&last.close>last.open&&last.close>prior.at(-1)!,sell=fast<slow&&rsi>85&&last.close<last.open&&last.close<prior.at(-1)!;
 if(!buy&&!sell)return reject('GOLD_RSI_REVERSAL_NOT_CONFIRMED');
 const side=buy?1:-1,structure=buy?Math.min(...rows.slice(-2).map(b=>b.low))-.1*atr:Math.max(...rows.slice(-2).map(b=>b.high))+.1*atr,stop=buy?Math.min(last.close-1.5*atr,structure):Math.max(last.close+1.5*atr,structure),distance=side*(last.close-stop),target=last.close+side*5*distance;
 if(!(stop>0&&target>0&&distance>0))return reject('GOLD_RSI_GEOMETRY_INVALID');
 return {status:'candidate',direction:buy?'buy':'sell',entry_low:last.close,entry_high:last.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:5,confidence_score:80,grade:'A',reason:'Gold M15 RSI exhaustion reversal in EMA12/48 trend; initial structure/1.5 ATR stop, full 5R target, one-ATR trail after 2R.',rejection_reason:'',score_breakdown:{score_is_probability:false,atr14:atr,prior_rsi2:rsi,ema12:fast,ema48:slow,max_bars_in_trade:96,management_model:'GOLD_ATR_TRAILING_V1',seed_policy:'LAST_240_OBSERVED_CLOSED_BARS',entry_engine_version:1}};
}
export function goldRsiTrailingDefinition():StrategyDefinition{return {id:GOLD_RSI_TRAILING,legacyName:GOLD_RSI_TRAILING,version:'1.0.0',market:'forex',lifecycle:'RESEARCH',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:GOLD_RSI_TRAILING,enabled:false,min_score:75,min_rr:4.4,max_bars_in_trade:96,allowed_symbols:['XAUUSD'],allowed_timeframes:['15m'],params:{}},evaluate:evaluateGoldRsiTrailing};}
