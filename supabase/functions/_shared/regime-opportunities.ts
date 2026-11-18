import {scheduledBarClosed} from './conditional-market.ts';
/** Release 1 research candidates, all disabled after failed development. Rule scores are NOT probabilities or certification.
 * Only closed OHLCV is used. No provider or publication authority lives here. */
import {atrRootV1,emaRootV1,rsiRootV1} from './indicator-engine.ts';
import type {LegacyStrategyResult,StrategyCandle,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
export const REGIME_ENGINE_VERSION='1.0.0';
export const REGIME_IDS=['crypto.regime-continuation','crypto.regime-range-rejection','crypto.regime-channel-breakout'] as const;
export type RegimeId=typeof REGIME_IDS[number];
export type OpportunityRegime='TREND_UP'|'TREND_DOWN'|'EXPANSION_UP'|'EXPANSION_DOWN'|'RANGE'|'TRANSITION'|'SHOCK'|'UNAVAILABLE';
export interface OpportunityState {regime:OpportunityRegime;atr:number;efficiency:number;trendAtr:number;atrPercentile:number;htfDirection:number;reason:string;}
const reject=(reason:string,state?:OpportunityState):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{...(state?{regime:state.regime,efficiency:state.efficiency,trend_atr:state.trendAtr,atr_percentile:state.atrPercentile}:{}),score_is_probability:false}});
const ms=(tf:string)=>{const m=/^(\d+)(m|h)$/.exec(tf);return m?Number(m[1])*(m[2]==='h'?3600000:60000):NaN};
export function closedAggregate(rows:readonly StrategyCandle[],minutes:number,asOf:string):StrategyCandle[]{
 if(!rows.length)return[];const base=ms(rows[0].timeframe),width=minutes*60000;if(!Number.isInteger(width/base)||width<base)return[];
 const groups=new Map<number,StrategyCandle[]>();for(const row of rows){const t=Date.parse(row.open_time);if(t+base>Date.parse(asOf))continue;const start=Math.floor(t/width)*width;const g=groups.get(start)??[];g.push(row);groups.set(start,g);}
 return [...groups].sort((a,b)=>a[0]-b[0]).flatMap(([t,g])=>{
  const expected=Array.from({length:width/base},(_,i)=>t+i*base).filter(at=>g[0].source!=='EXNESS_BROKER_BID_ASK'||!scheduledBarClosed(g[0].symbol,at,base,g[0].source));
  if(!(t+width<=Date.parse(asOf)&&g.length===expected.length&&g.every((r,i)=>r.symbol===g[0].symbol&&r.source===g[0].source&&r.instrument_type===g[0].instrument_type&&Date.parse(r.open_time)===expected[i])))return [];
  const flow:Partial<StrategyCandle>={};
  for(const key of ['quote_volume','trade_count','taker_buy_volume','taker_buy_quote_volume'] as const)if(g.every(r=>r[key]!==undefined))flow[key]=g.reduce((n,r)=>n+r[key]!,0);
  const bidAsk=g.every(r=>r.ask_open!==undefined&&r.ask_high!==undefined&&r.ask_low!==undefined&&r.ask_close!==undefined)?{ask_open:g[0].ask_open,ask_high:Math.max(...g.map(r=>r.ask_high!)),ask_low:Math.min(...g.map(r=>r.ask_low!)),ask_close:g.at(-1)!.ask_close}:{};
  const {quote_volume,trade_count,taker_buy_volume,taker_buy_quote_volume,ask_open,ask_high,ask_low,ask_close,...identity}=g[0];
  return [{...identity,...flow,...bidAsk,timeframe:minutes%1440===0?`${minutes/1440}d`:minutes%60===0?`${minutes/60}h`:`${minutes}m`,open_time:new Date(t).toISOString(),high:Math.max(...g.map(r=>r.high)),low:Math.min(...g.map(r=>r.low)),close:g.at(-1)!.close,volume:g.reduce((n,r)=>n+r.volume,0)}];
 });
}
export function classifyOpportunity(context:StrategyEvaluationContext):OpportunityState {
 const blank:OpportunityState={regime:'UNAVAILABLE',atr:0,efficiency:0,trendAtr:0,atrPercentile:0,htfDirection:0,reason:'WARMUP_OR_DATA_UNAVAILABLE'};
 const rows=context.candles,at=Date.parse(context.evaluated_at),width=ms(context.timeframe);
 if(context.market!=='crypto'||!['1h','4h'].includes(context.timeframe)||rows.length<100||!Number.isFinite(at))return blank;
 if(rows.some((r,i)=>r.symbol!==context.symbol||r.timeframe!==context.timeframe||![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.low<=0||r.volume<0||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||Date.parse(r.open_time)+width>at||(i>0&&Date.parse(r.open_time)-Date.parse(rows[i-1].open_time)!==width)))return {...blank,reason:'INVALID_OR_GAPPED_DATA'};
 if(at-(Date.parse(rows.at(-1)!.open_time)+width)>width)return {...blank,reason:'STALE_DATA'};
 const closes=rows.map(r=>r.close),atr=atrRootV1([...rows],14);if(!(atr>0))return blank;
 const path=closes.slice(-21),travel=path.slice(1).reduce((n,x,i)=>n+Math.abs(x-path[i]),0),efficiency=travel?Math.abs(path.at(-1)!-path[0])/travel:0;
 const ema20=emaRootV1(closes,20),ema50=emaRootV1(closes,50),trendAtr=(ema20-ema50)/atr;
 const history=rows.slice(-80,-1).map((_,i)=>atrRootV1(rows.slice(Math.max(0,rows.length-80+i-20),rows.length-80+i+1),14)).filter(x=>x>0);
 const atrPercentile=history.filter(x=>x<=atr).length/Math.max(history.length,1),higher=closedAggregate(rows,context.timeframe==='4h'?720:240,context.evaluated_at),hc=higher.map(r=>r.close);
 if(higher.length<24)return {...blank,reason:'CLOSED_HIGHER_TIMEFRAME_UNAVAILABLE'};
 const fast=emaRootV1(hc,8),slow=emaRootV1(hc,20),oldFast=emaRootV1(hc.slice(0,-2),8),htfDirection=fast>slow&&fast>oldFast?1:fast<slow&&fast<oldFast?-1:0;
 const last=rows.at(-1)!,previous=rows.at(-2)!,trueRange=Math.max(last.high-last.low,Math.abs(last.high-previous.close),Math.abs(last.low-previous.close));
 let regime:OpportunityRegime='TRANSITION';if(trueRange/atr>3||Math.abs(last.open-previous.close)/atr>1||atrPercentile>.98)regime='SHOCK';
 else if(priorExpansion(rows,atr,htfDirection)===1)regime='EXPANSION_UP';
 else if(priorExpansion(rows,atr,htfDirection)===-1)regime='EXPANSION_DOWN';
 else if(trendAtr>.5&&efficiency>.25&&htfDirection===1)regime='TREND_UP';
 else if(trendAtr<-.5&&efficiency>.25&&htfDirection===-1)regime='TREND_DOWN';
 else if(Math.abs(trendAtr)<.6&&efficiency<.25&&Math.abs(fast-slow)/atr<1.2)regime='RANGE';
 return {regime,atr,efficiency,trendAtr,atrPercentile,htfDirection,reason:regime};
}
function priorExpansion(rows:readonly StrategyCandle[],atr:number,htf:number){const last=rows.at(-1)!,prior=rows.slice(-21,-1),compressed=prior.slice(-6).reduce((n,r)=>n+r.high-r.low,0)/6<atr*.9,volume=prior.reduce((n,r)=>n+r.volume,0)/prior.length;if(!compressed||last.volume<volume*1.2)return 0;return last.close>Math.max(...prior.map(r=>r.high))&&htf>=0?1:last.close<Math.min(...prior.map(r=>r.low))&&htf<=0?-1:0;}
export const REGIME_DEFAULTS=Object.freeze({stopAtr:1.8,targetR:2.5,tp1R:1.5,minimumStopBps:50,maximumStopBps:400,estimatedCostBps:20.5,maximumCostR:.3,channelBars:20,pullbackAtr:.6,rangeRsi:35});
export type RegimeParameters=typeof REGIME_DEFAULTS;
export function evaluateRegimeOpportunity(id:RegimeId,context:StrategyEvaluationContext,overrides:Readonly<Record<string,number>>={}):LegacyStrategyResult {
 const state=classifyOpportunity(context);if(state.regime==='UNAVAILABLE'||state.regime==='SHOCK'||state.regime==='TRANSITION')return reject(state.reason,state);
 const p={...REGIME_DEFAULTS,...overrides};if(Object.keys(overrides).some(k=>!(k in REGIME_DEFAULTS))||!Object.values(p).every(x=>Number.isFinite(x)&&x>0)||p.tp1R>=p.targetR||p.channelBars<10||p.channelBars>60)return reject('INVALID_PARAMETERS',state);
 const rows=context.candles,last=rows.at(-1)!,prev=rows.at(-2)!,prior=rows.slice(-p.channelBars-1,-1),atr=state.atr,closes=rows.map(r=>r.close),ema=emaRootV1(closes,20),high=Math.max(...prior.map(r=>r.high)),low=Math.min(...prior.map(r=>r.low));let direction=0,setup='';
 if(id===REGIME_IDS[2]){
  if(context.timeframe!=='4h')return reject('CHANNEL_REQUIRES_FOUR_HOUR_BARS',state);
  if(state.regime==='RANGE')return reject('CHANNEL_REQUIRES_TREND_OR_EXPANSION',state);
  const boundary=rows.slice(-56,-1),buy=last.close>Math.max(...boundary.map(r=>r.high))&&state.htfDirection>=0&&state.trendAtr>0,sell=last.close<Math.min(...boundary.map(r=>r.low))&&state.htfDirection<=0&&state.trendAtr<0;
  if(!buy&&!sell)return reject('NO_ACCEPTED_CHANNEL_BREAKOUT',state);
  direction=buy?1:-1;setup='FOUR_HOUR_CHANNEL_BREAKOUT';
  if(direction*(last.close-last.open)/atr<.1||Math.abs(last.close-last.open)/atr>2.2)return reject('IMPULSE_OR_EXTENSION_INVALID',state);
 }else if(id===REGIME_IDS[0]){
  direction=['TREND_UP','EXPANSION_UP'].includes(state.regime)?1:['TREND_DOWN','EXPANSION_DOWN'].includes(state.regime)?-1:0;if(!direction)return reject('CONTINUATION_REQUIRES_TREND',state);
  const impulse=direction*(last.close-last.open),body=impulse/atr;
  const pullback=direction===1?Math.min(...rows.slice(-4,-1).map(r=>r.low))<=ema+atr*p.pullbackAtr&&last.close>prev.high&&last.close>ema:Math.max(...rows.slice(-4,-1).map(r=>r.high))>=ema-atr*p.pullbackAtr&&last.close<prev.low&&last.close<ema;
  const ranges=prior.slice(-6).map(r=>r.high-r.low),compressed=ranges.reduce((n,x)=>n+x,0)/ranges.length<atr*.9;
  const breakout=compressed&&(direction===1?last.close>high:last.close<low)&&last.volume>=prior.reduce((n,r)=>n+r.volume,0)/prior.length;
  if(body<.2||body>1.5||Math.abs(last.close-ema)/atr>2.5)return reject('IMPULSE_OR_EXTENSION_INVALID',state);
  if(!pullback&&!breakout)return reject('NO_PULLBACK_OR_ACCEPTED_BREAKOUT',state);setup=breakout?'COMPRESSION_EXPANSION':'TREND_PULLBACK';
 }else{
  if(state.regime!=='RANGE')return reject('RANGE_REQUIRES_BALANCE',state);
  const range=high-low,rsi=rsiRootV1(closes.slice(0,-1),2),body=last.close-last.open;
  const buy=(prev.low<=low+atr*.2||last.low<=low+atr*.1)&&last.close>low+atr*.15&&last.close>prev.close&&body>0&&rsi<p.rangeRsi;
  const sell=(prev.high>=high-atr*.2||last.high>=high-atr*.1)&&last.close<high-atr*.15&&last.close<prev.close&&body<0&&rsi>100-p.rangeRsi;
  if(range<atr*3||(!buy&&!sell))return reject('NO_RANGE_EDGE_REJECTION',state);direction=buy?1:-1;setup='RANGE_EDGE_REJECTION';
 }
 const entry=last.close,structure=direction===1?Math.min(...rows.slice(-5).map(r=>r.low))-atr*.15:Math.max(...rows.slice(-5).map(r=>r.high))+atr*.15;
 const risk=Math.max(Math.abs(entry-structure),atr*p.stopAtr,entry*p.minimumStopBps/10000),stop=entry-direction*risk,costR=entry*p.estimatedCostBps/10000/risk;
 if(risk/entry*10000>p.maximumStopBps||costR>p.maximumCostR)return reject('COST_OR_STOP_INFEASIBLE',state);
 let target=entry+direction*risk*p.targetR;
 if(id===REGIME_IDS[1]){const opposite=direction===1?high-atr*.2:low+atr*.2;if((opposite-entry)*direction/risk<1.8)return reject('RANGE_REWARD_TOO_SMALL',state);target=direction===1?Math.min(target,opposite):Math.max(target,opposite);}
 const rr=(target-entry)*direction/risk,tp1=entry+direction*risk*Math.min(p.tp1R,rr*.6);
 // Binary rule completeness grade, explicitly not a measured win probability.
 return {status:'candidate',direction:direction===1?'buy':'sell',entry_low:entry,entry_high:entry,stop_loss:stop,tp1,tp2:target,risk_reward:rr,confidence_score:80,grade:'A',reason:setup,rejection_reason:'',score_breakdown:{strategy:id,regime:state.regime,regime_policy_version:'regime-opportunity/v1',setup,efficiency:state.efficiency,trend_atr:state.trendAtr,atr_percentile:state.atrPercentile,higher_timeframe_direction:state.htfDirection,estimated_cost_r:costR,score_is_probability:false,measured_release_required:true,management:'STATIC_PROTECTIVE_STOP'}};
}
export function regimeResearchDefinitions():StrategyDefinition[]{return REGIME_IDS.map(id=>({id,version:REGIME_ENGINE_VERSION,legacyName:id===REGIME_IDS[0]?'RegimeContinuation':id===REGIME_IDS[1]?'RegimeRangeRejection':'RegimeChannelBreakout',market:'crypto',lifecycle:'DISABLED',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:id,enabled:false,min_score:75,min_rr:1.5,max_bars_in_trade:48,allowed_symbols:['BTCUSDT','ETHUSDT'],allowed_timeframes:[id===REGIME_IDS[2]?'4h':'1h'],params:{...REGIME_DEFAULTS,...(id===REGIME_IDS[2]?{stopAtr:2,channelBars:55,targetR:3,minimumStopBps:100,maximumStopBps:600,estimatedCostBps:40}: {})}},evaluate:context=>evaluateRegimeOpportunity(id,context,context.strategy_parameters??(id===REGIME_IDS[2]?{stopAtr:2,channelBars:55,targetR:3,minimumStopBps:100,maximumStopBps:600,estimatedCostBps:40}:{}))}));}
