import {atrRootV1,emaRootV1,rsiRootV1} from './indicator-engine.ts';
import {SIGNAL_ENSEMBLE_ID,SIGNAL_ENSEMBLE_ROLES,SIGNAL_ENSEMBLE_SYMBOLS,SIGNAL_ENSEMBLE_VERSION,SIGNAL_ENSEMBLE_ASSUMPTIONS,type SignalSleeveId} from './crypto-signal-ensemble-contract.ts';
import type {LegacyStrategyResult,StrategyCandle,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
const WIDTH=900000,timeCache=new Map<string,number>();
// Only immutable timestamp strings are cached; prices/source/identity are always checked again.
const epoch=(s:string)=>{const known=timeCache.get(s);if(known!==undefined)return known;const n=Date.parse(s);if(timeCache.size>=4096)timeCache.clear();timeCache.set(s,n);return n;};
const mean=(a:readonly number[])=>a.reduce((n,x)=>n+x,0)/a.length;
const reject=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{signal_ensemble_policy:'crypto-signal-ensemble/v1',research_only:true,score_is_probability:false}});
export interface SleeveFeatures {valid:boolean;reason:string;rows:readonly StrategyCandle[];atr:number;macroDirection:number;macroStrength:number;volumeRatio:number;ema20:number;previousEma20:number;ema50:number;mean20:number;lowerBand:number;upperBand:number;priorRsi2:number;flow:number|null;shock:boolean;}
function admitted(rows:readonly StrategyCandle[],symbol:string,at:number){return rows.length===960&&epoch(rows.at(-1)!.open_time)+WIDTH===at&&rows.every((c,i)=>c.symbol===symbol&&c.market_type==='crypto'&&c.timeframe==='15m'&&c.source==='BINANCE_USDM_KLINES'&&c.instrument_type==='USDT_PERPETUAL'&&[c.open,c.high,c.low,c.close,c.volume,c.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x))&&c.low>0&&c.volume>=0&&c.quote_volume!>=0&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close)&&epoch(c.open_time)===at-(960-i)*WIDTH);}
export function signalSleeveFeatures(ctx:StrategyEvaluationContext):SleeveFeatures{
 const unavailable=(reason:string):SleeveFeatures=>({valid:false,reason,rows:[],atr:0,macroDirection:0,macroStrength:0,volumeRatio:0,ema20:0,previousEma20:0,ema50:0,mean20:0,lowerBand:0,upperBand:0,priorRsi2:50,flow:null,shock:true});
 const at=epoch(ctx.evaluated_at),r=ctx.candles;if(ctx.market!=='crypto'||ctx.timeframe!=='15m'||!SIGNAL_ENSEMBLE_SYMBOLS.includes(ctx.symbol)||!Number.isFinite(at)||at%WIDTH||!admitted(r,ctx.symbol,at))return unavailable('SLEEVE_NATIVE_HISTORY_IDENTITY');
 const h4:StrategyCandle[]=[];for(let i=0;i<r.length;){const first=epoch(r[i].open_time);if(first%14400000){i++;continue;}if(i+16>r.length)break;const g=r.slice(i,i+16);h4.push({...g[0],timeframe:'4h',high:Math.max(...g.map(c=>c.high)),low:Math.min(...g.map(c=>c.low)),close:g[15].close,volume:g.reduce((n,c)=>n+c.volume,0)});i+=16;}
 if(h4.length<55)return unavailable('SLEEVE_CLOSED_H4_HISTORY');
 const prior=r.slice(0,-1),c=r.at(-1)!,atr=atrRootV1(prior,14),h4Atr=atrRootV1(h4,14),hc=h4.map(c=>c.close),fast=emaRootV1(hc,8),slow=emaRootV1(hc,21),previous=emaRootV1(hc.slice(0,-1),8),macroDirection=fast>slow&&fast>previous?1:fast<slow&&fast<previous?-1:0,macroStrength=Math.abs(fast-slow)/h4Atr;
 if(!(atr>0&&h4Atr>0))return unavailable('SLEEVE_ATR_REQUIRED');
 const closes=prior.slice(-20).map(c=>c.close),baseline=mean(closes),sd=Math.sqrt(mean(closes.map(x=>(x-baseline)**2))),averageQuote=mean(prior.slice(-20).map(c=>c.quote_volume!));
 if(!(averageQuote>0&&baseline>0))return unavailable('SLEEVE_QUOTE_VOLUME_REQUIRED');
 const flow=typeof c.taker_buy_quote_volume==='number'&&Number.isFinite(c.taker_buy_quote_volume)&&c.quote_volume!>0&&c.taker_buy_quote_volume>=0&&c.taker_buy_quote_volume<=c.quote_volume!?2*c.taker_buy_quote_volume/c.quote_volume!-1:null;
 return{valid:true,reason:'',rows:r,atr,macroDirection,macroStrength,volumeRatio:c.quote_volume!/averageQuote,ema20:ctx.indicators.ema20,ema50:ctx.indicators.ema50,previousEma20:emaRootV1(prior.slice(-110).map(c=>c.close),20),mean20:baseline,lowerBand:baseline-2*sd,upperBand:baseline+2*sd,priorRsi2:rsiRootV1(prior.map(c=>c.close),2),flow,shock:Math.max(c.high-c.low,Math.abs(c.high-prior.at(-1)!.close),Math.abs(c.low-prior.at(-1)!.close))>4*atr||Math.abs(c.open-prior.at(-1)!.close)>2*atr};
}
export function evaluateSignalSleeve(id:SignalSleeveId,ctx:StrategyEvaluationContext,f=signalSleeveFeatures(ctx)):LegacyStrategyResult{
 if(Object.keys(ctx.strategy_parameters??{}).length)return reject('SLEEVE_FROZEN_PARAMETERS');if(!f.valid||f.shock)return reject(f.reason||'SLEEVE_PRICE_SHOCK');
 const r=f.rows,c=r.at(-1)!,p=r.at(-2)!,atr=f.atr;let side=0,stop=0,target=0,setup='';
 if(id==='crypto.sleeve-trend'){
  side=f.macroStrength>=.35?f.macroDirection:0;
  if(!side||side*(f.ema20-f.ema50)<=0||side*(p.close-f.previousEma20)>0||side*(c.close-f.ema20)<=0||side*(c.close-c.open)<.25*atr||f.volumeRatio<1)return reject('NO_MACRO_PULLBACK_RECLAIM');
  const touched=r.slice(-6,-1).some(b=>side===1?b.low<=f.ema20:b.high>=f.ema20);if(!touched)return reject('NO_PULLBACK_TOUCH');
  stop=side===1?Math.min(c.close-2*atr,...r.slice(-6).map(b=>b.low-.1*atr)):Math.max(c.close+2*atr,...r.slice(-6).map(b=>b.high+.1*atr));setup='CLOSED_H4_NATIVE_PULLBACK';
 }else if(id==='crypto.sleeve-breakout'){
  const prior=r.slice(-33,-1),hi=Math.max(...prior.map(b=>b.high)),lo=Math.min(...prior.map(b=>b.low)),compressed=mean(r.slice(-9,-1).map(b=>b.high-b.low))<=.9*atr;
  side=c.close>hi+.1*atr?1:c.close<lo-.1*atr?-1:0;
  if(!side||!compressed||f.volumeRatio<1.5||side*(c.close-c.open)<.5*atr||f.macroDirection===-side&&f.macroStrength>=.35)return reject('NO_ACCEPTED_VOLATILITY_BREAKOUT');
  stop=side===1?Math.min(c.close-2*atr,...r.slice(-9,-1).map(b=>b.low-.1*atr)):Math.max(c.close+2*atr,...r.slice(-9,-1).map(b=>b.high+.1*atr));setup='NATIVE_COMPRESSION_VOLUME_BREAK';
 }else if(id==='crypto.sleeve-reversal'){
  if(f.macroStrength>.75||f.flow===null)return reject('REVERSAL_REQUIRES_BALANCE_AND_FLOW');
  const buy=c.low<f.lowerBand&&c.close>f.lowerBand&&c.close>c.open&&f.priorRsi2<15&&f.flow>0,sell=c.high>f.upperBand&&c.close<f.upperBand&&c.close<c.open&&f.priorRsi2>85&&f.flow<0;
  side=buy?1:sell?-1:0;if(!side)return reject('NO_OBSERVED_EXHAUSTION_REJECTION');
  stop=side===1?Math.min(c.close-2*atr,c.low-.1*atr):Math.max(c.close+2*atr,c.high+.1*atr);target=f.mean20;setup='BALANCED_BAND_REJECTION_OBSERVED_FLOW';
 }else if(id==='crypto.sleeve-relative'){
  const peer=ctx.reference_candles??[];if(ctx.symbol==='BTCUSDT'||!admitted(peer,'BTCUSDT',epoch(ctx.evaluated_at)))return reject('RELATIVE_REQUIRES_ALIGNED_BTC');
  const day=c.close/r.at(-97)!.close-1,week=c.close/r.at(-673)!.close-1,btc=peer.at(-1)!.close/peer.at(-97)!.close-1,prior=r.slice(-97,-1),hi=Math.max(...prior.map(b=>b.high)),lo=Math.min(...prior.map(b=>b.low));
  side=btc>0&&day>=.03&&day-btc>=.02&&week>0&&c.close>hi?1:btc<0&&day<=-.03&&day-btc<=-.02&&week<0&&c.close<lo?-1:0;
  if(!side||f.volumeRatio<1.5)return reject('NO_RELATIVE_MOMENTUM_ACCEPTANCE');
  stop=side===1?Math.min(c.close-2*atr,lo):Math.max(c.close+2*atr,hi);setup='NATIVE_RELATIVE_MOMENTUM_LONG_SHORT';
 }else return reject('UNKNOWN_SIGNAL_SLEEVE');
 const risk=(c.close-stop)*side;if(!target)target=c.close+side*3*risk;const rr=(target-c.close)*side/risk,costR=c.close*.0025/risk,minRR=id==='crypto.sleeve-reversal'?.8:1.5;
 if(!(risk>0&&stop>0&&target>0&&rr>=minRR&&risk/c.close>=.008&&risk/c.close<=.06&&costR<=.3125))return reject('SLEEVE_COST_OR_STRUCTURAL_GEOMETRY');
 return{status:'candidate',direction:side===1?'buy':'sell',entry_low:c.close,entry_high:c.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:rr,confidence_score:80,grade:'A',reason:setup,rejection_reason:'',score_breakdown:{signal_ensemble_policy:'crypto-signal-ensemble/v1',sleeve_id:id,setup,macro_direction:f.macroDirection,macro_strength:f.macroStrength,volume_ratio:f.volumeRatio,estimated_cost_r:costR,estimated_cost_bps:25,research_only:true,score_is_probability:false,score_meaning:'binary research setup conformance; not a forecast',source_close:ctx.evaluated_at}};
}
export function signalEnsembleDefinitions():StrategyDefinition[]{let rows:readonly StrategyCandle[]|undefined,at='',features:SleeveFeatures;return SIGNAL_ENSEMBLE_ROLES.map(role=>({id:role.id,version:SIGNAL_ENSEMBLE_VERSION,legacyName:role.name,market:'crypto',lifecycle:'DISABLED',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:role.name,enabled:false,min_score:75,min_rr:role.id==='crypto.sleeve-reversal'?.8:1.5,max_bars_in_trade:96,allowed_symbols:role.id==='crypto.sleeve-relative'?SIGNAL_ENSEMBLE_SYMBOLS.filter(s=>s!=='BTCUSDT'):[...SIGNAL_ENSEMBLE_SYMBOLS],allowed_timeframes:['15m'],params:{}},evaluate:ctx=>{if(rows!==ctx.candles||at!==ctx.evaluated_at){rows=ctx.candles;at=ctx.evaluated_at;features=signalSleeveFeatures(ctx);}return evaluateSignalSleeve(role.id,ctx,features);}}));}
export function signalEnsembleConfiguration(selection:string=SIGNAL_ENSEMBLE_ID):ApprovedReplayConfiguration&{researchOnly:true}{const defs=signalEnsembleDefinitions().filter(d=>selection===SIGNAL_ENSEMBLE_ID||d.id===selection);if(!defs.length)throw Error('UNKNOWN_SIGNAL_ENSEMBLE');return{researchOnly:true,version:'research/signal-ensemble/v1',minSignalGrade:'A',outcomeAssumptions:{...SIGNAL_ENSEMBLE_ASSUMPTIONS},strategies:defs.map(d=>({id:d.id,version:d.version,enabled:true,minScore:75,minRiskReward:d.config.min_rr,maxBarsInTrade:96,symbols:[...d.config.allowed_symbols],timeframes:['15m'],parameters:{}}))};}
export function signalEnsembleMarketPolicy(entries:readonly {name:string;result:LegacyStrategyResult}[]):string|undefined{
 if(!entries.length||!entries.every(e=>SIGNAL_ENSEMBLE_ROLES.some(r=>r.name===e.name)))return undefined;
 return entries.every(e=>{const b=e.result.score_breakdown,role=SIGNAL_ENSEMBLE_ROLES.find(r=>r.name===e.name);return b.signal_ensemble_policy==='crypto-signal-ensemble/v1'&&b.sleeve_id===role?.id&&b.score_is_probability===false&&typeof b.estimated_cost_r==='number'&&Number.isFinite(b.estimated_cost_r)&&b.estimated_cost_r<=.3125&&b.estimated_cost_r>=0;})?'':'SIGNAL_ENSEMBLE_POLICY_MISMATCH';
}
