/** Frozen altcoin transfer hypothesis. Shared evaluator, never a live permission grant. */
import type {LegacyStrategyResult,StrategyCandle,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
import {ALT_CANDIDATE_ID,ALT_SYMBOLS,ALT_CONTEXT_BARS,ALT_ASSUMPTIONS} from './crypto-relative-strength-contract.ts';
export {ALT_CANDIDATE_ID,ALT_SYMBOLS,ALT_CONTEXT_BARS,ALT_ASSUMPTIONS} from './crypto-relative-strength-contract.ts';
const rejected=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{research_only:true,score_is_probability:false}});
/** Strict native USD-M quote volume, complete aligned hours; no OHLC-derived volume proxy. */
export function altClosedHours(rows:readonly StrategyCandle[],symbol:string,asOf:string):StrategyCandle[]{
 const at=Date.parse(asOf),input=rows.slice(-ALT_CONTEXT_BARS);
 if(input.length!==ALT_CONTEXT_BARS||!Number.isFinite(at)||at%3600000!==0)return [];
 if(input.some((b,i)=>b.symbol!==symbol||b.timeframe!=='15m'||b.market_type!=='crypto'||b.instrument_type!=='USDT_PERPETUAL'||b.source!=='BINANCE_USDM_KLINES'||![b.open,b.high,b.low,b.close,b.volume,b.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||!Number.isFinite(Date.parse(b.open_time))||Date.parse(b.open_time)+900000>at||i>0&&Date.parse(b.open_time)!==Date.parse(input[i-1].open_time)+900000)||Date.parse(input[0].open_time)%3600000||Date.parse(input.at(-1)!.open_time)+900000!==at)return [];
 const result:StrategyCandle[]=[];
 for(let i=0;i<input.length;i+=4){const g=input.slice(i,i+4);result.push({...g[0],timeframe:'1h',open_time:new Date(Date.parse(g[0].open_time)).toISOString(),high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),close:g[3].close,volume:g.reduce((s,b)=>s+b.volume,0),quote_volume:g.reduce((s,b)=>s+b.quote_volume!,0)});}
 return result;
}
export function evaluateAltRelativeStrength(context:StrategyEvaluationContext):LegacyStrategyResult {
 if(context.market!=='crypto'||context.timeframe!=='15m'||!ALT_SYMBOLS.includes(context.symbol))return rejected('ALT_SYMBOL_OR_TIMEFRAME_INELIGIBLE');
 if(Object.keys(context.strategy_parameters??{}).length)return rejected('FROZEN_ALT_PARAMETERS_REQUIRED');
 if(Date.parse(context.evaluated_at)%3600000!==0)return rejected('WAIT_FOR_CLOSED_HOUR');
 const h=altClosedHours(context.candles,context.symbol,context.evaluated_at),peer=altClosedHours(context.reference_candles??[],'BTCUSDT',context.evaluated_at);
 if(h.length!==240||peer.length!==240||h.some((b,i)=>b.open_time!==peer[i].open_time))return rejected('ALIGNED_NATIVE_ALT_BTC_HISTORY_REQUIRED');
 const c=h.at(-1)!,mean=(a:number[])=>a.reduce((s,x)=>s+x,0)/a.length;
 // Exact arithmetic of frozen alt-universe-rules.ts; future candles cannot enter either series.
 const atr=mean(h.slice(-21,-1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-h[h.length-22+i].close),Math.abs(b.low-h[h.length-22+i].close)))),recent=h.slice(-25,-1),ret=c.close/h[h.length-25].close-1,btcRet=peer.at(-1)!.close/peer[peer.length-25].close-1,week=c.close/h[h.length-169].close-1;
 if(!(atr>0&&btcRet>0&&ret>=.03&&ret-btcRet>=.02&&week>0&&c.close>Math.max(...recent.map(b=>b.high))&&c.quote_volume!>=1.5*mean(recent.map(b=>b.quote_volume!))))return rejected('NO_RELATIVE_STRENGTH_BREAKOUT');
 const stop=Math.min(c.close-2*atr,...recent.map(b=>b.low)),target=c.close+3*(c.close-stop),risk=Math.abs(c.close-stop),rr=Math.abs(target-c.close)/risk;
 if(stop<=0||target<=0||rr<1.3||risk/c.close<.01||Math.abs(target-c.close)/c.close<5*25/10000)return rejected('ALT_GEOMETRY_OR_COST_REJECTED');
 return {status:'candidate',direction:'buy',entry_low:c.close,entry_high:c.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:rr,confidence_score:80,grade:'A',reason:'Hourly altcoin relative-strength breakout; unqualified research',rejection_reason:'',score_breakdown:{research_only:true,score_is_probability:false,relative_strength_policy:'alt-relative-strength/v1',closed_hour_breakout:true,btc_return:btcRet,alt_return:ret,week_return:week,quote_volume_ratio:c.quote_volume!/mean(recent.map(b=>b.quote_volume!)),atr,relative_return:ret-btcRet,estimated_cost_bps:25,reference_symbol:'BTCUSDT'}};
}
export function altResearchDefinitions():StrategyDefinition[]{return [{id:ALT_CANDIDATE_ID,version:'1.0.0',legacyName:'AltRelativeStrength',market:'crypto',lifecycle:'DISABLED',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:'AltRelativeStrength',enabled:false,min_score:75,min_rr:1.3,max_bars_in_trade:96,allowed_symbols:[...ALT_SYMBOLS],allowed_timeframes:['15m'],params:{}},evaluate:evaluateAltRelativeStrength}];}
export function altReplayConfiguration():ApprovedReplayConfiguration&{researchOnly:true}{return {researchOnly:true,version:'research/alt-relative-strength/v1',minSignalGrade:'A',outcomeAssumptions:{...ALT_ASSUMPTIONS},strategies:[{id:ALT_CANDIDATE_ID,version:'1.0.0',enabled:true,minScore:75,minRiskReward:1.3,maxBarsInTrade:96,symbols:[...ALT_SYMBOLS],timeframes:['15m'],parameters:{}}]};}
export function usesAltReference(configuration:ApprovedReplayConfiguration){return configuration.strategies.some(s=>s.enabled&&s.id===ALT_CANDIDATE_ID);}
export function replayContextBars(configuration:ApprovedReplayConfiguration){return usesAltReference(configuration)?ALT_CONTEXT_BARS:110;}
/** BTC is a dependency, not a tradeable event. No mixed policy or unbounded universe. */
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
export function validateAltDatasetSelection(configuration:ApprovedReplayConfiguration,datasets:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(!usesAltReference(configuration))return;
 if(configuration.strategies.length!==1||canonical(configuration)!==canonical(altReplayConfiguration()))throw Error('ALT_FROZEN_CONFIGURATION_REQUIRED');
 if(datasets.length<2||datasets.length>4||datasets.filter(d=>d.symbol==='BTCUSDT').length!==1||datasets.some(d=>d.timeframe!=='15m'||(d.market_type??d.market)!=='crypto'||d.symbol!=='BTCUSDT'&&!ALT_SYMBOLS.includes(d.symbol))||new Set(datasets.map(d=>d.symbol)).size!==datasets.length)throw Error('ALT_REQUIRES_BTC_AND_ONE_TO_THREE_ALTS_15M');
}
