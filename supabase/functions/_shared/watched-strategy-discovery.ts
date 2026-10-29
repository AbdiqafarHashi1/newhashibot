import {ProfessionalStrategyRegistry,type StrategyDefinition,type StrategyCandle,type StrategyEvaluationContext,type RegistryEvaluation} from './professional-strategies.ts';
import {calculateActiveIndicators} from './active-validation-runtime.ts';
import {conditionalCost,conditionalMarket,consecutiveMarketBars} from './conditional-market.ts';
import {watchWidth,watchTrack,type WatchTimeframe} from './conditional-contract.ts';
import {watchedMarketContext,strategyContextDecision,type SourceContext,type WatchedIntelligence,type StrategyThesis} from './watched-market-context.ts';
import {conditionalCandidates,type ConditionalSetup} from './conditional-signal-service.ts';

export interface StrategyObservation {strategy_id:string;symbol:string;timeframe:string;checked_at:string;decision:string;reason:string;evidence:Record<string,unknown>;}
const sessions=(id:string)=>id==='forex.london-breakout'?['LONDON','LONDON_NEW_YORK_OVERLAP']:id==='forex.new-york-continuation'?['NEW_YORK','LONDON_NEW_YORK_OVERLAP']:id==='gold.volatility-breakout'||id==='forex.trend-pullback'?['LONDON','NEW_YORK','LONDON_NEW_YORK_OVERLAP']:[];
/** Every candidate comes from its named evaluator, then receives a frozen future confirmation contract. */
export function watchedSetupFromEvaluation(e:RegistryEvaluation,ctx:StrategyEvaluationContext,intel:WatchedIntelligence):ConditionalSetup|null {
 const r=e.professional.legacy,d=e.definition,tf=ctx.timeframe as WatchTimeframe,w=watchWidth(tf),last=ctx.candles.at(-1)!;
 if(!e.publishable||!e.plan.decision.qualified||!d.config.enabled||r.status!=='candidate'||!['buy','sell'].includes(r.direction)||!Number.isFinite(w))return null;
 const side=r.direction as 'buy'|'sell',sign=side==='buy'?1:-1,trigger=side==='buy'?r.entry_high:r.entry_low,risk=sign*(trigger-r.stop_loss),cost=conditionalCost(ctx.symbol,trigger);
 if(![trigger,r.stop_loss,r.tp1,r.tp2,cost.price,r.confidence_score].every(Number.isFinite)||!(risk>0&&r.stop_loss>0&&sign*(r.tp1-trigger)>0&&sign*(r.tp2-r.tp1)>=0)||cost.price/risk>.4||r.confidence_score<d.config.min_score||sign*(r.tp2-trigger)/risk<d.config.min_rr)return null;
 if([[d.config.min_stop_distance_pct,risk],[d.config.min_tp1_distance_pct,Math.abs(r.tp1-trigger)],[d.config.min_tp2_distance_pct,Math.abs(r.tp2-trigger)]].some(([minimum,distance])=>typeof minimum==='number'&&distance/trigger*100<minimum))return null;
 const family:StrategyThesis['family']=/reversal|range|auction|exhaustion/.test(d.id)?'REVERSAL':/breakout|expansion|compression/.test(d.id)?'BREAKOUT':'TREND';
 const keys=side==='buy'?['asian_range_high','range_high','box_high','channel_high','breakout_level']:['asian_range_low','range_low','box_low','channel_low','breakout_level'];
 const observedBoundary=keys.map(k=>r.score_breakdown[k]).find(v=>typeof v==='number'&&Number.isFinite(v));
 const boundary=family==='BREAKOUT'&&typeof observedBoundary==='number'?observedBoundary:r.stop_loss;
 const thesis:StrategyThesis={family,boundary,minimumVolumeRatio:family==='BREAKOUT'?.7:.35,maximumRangeAtr:3,sessions:sessions(d.id),higherRequired:family==='TREND',maximumCostR:.4,anchorRequired:ctx.market==='crypto'&&ctx.symbol!=='BTCUSDT'&&family==='TREND'};
 if(strategyContextDecision(thesis,side,ctx.candles,intel)!=='VALID'||intel.spreadPrice!==null&&intel.spreadPrice/risk>.2)return null;
 const reportedHold=r.score_breakdown.max_bars_in_trade;const hold=typeof reportedHold==='number'?reportedHold:d.config.max_bars_in_trade;if(!Number.isInteger(hold)||hold<1||hold>3650)return null;
 const close=new Date(Date.parse(last.open_time)+w).toISOString(),track=watchTrack(tf,d.id),ttl=typeof r.score_breakdown.no_entry_timeout_bars==='number'?r.score_breakdown.no_entry_timeout_bars:track==='SCALP'?3:track==='INTRADAY'?8:24;
 return {id:`strategy-watch/v1:${d.id}:${d.version}:${e.plan.provenance.config_hash}:${ctx.symbol}:${tf}:${close}:${sign}`,symbol:ctx.symbol,market:ctx.market,timeframe:tf,track,side,strategy:d.id,variant:family,policy:'conditional-signals/v1',sourceClose:close,source:last.source,trigger,stop:r.stop_loss,tp1:r.tp1,tp2:r.tp2,expiresAt:new Date(Date.parse(close)+ttl*w).toISOString(),holdBars:hold,score:r.confidence_score,reason:r.reason,status:'WAITING',version:1,lastBar:last.open_time,cost,intelligence:intel,origin:{version:d.version,configuration:structuredClone(d.config),plan:structuredClone(e.plan),thesis},management:{partialFraction:r.tp1===r.tp2?0:.5,breakEvenAfterTp1:false,maximumChaseR:track==='SCALP'?.15:.25},validation:{kind:'STRATEGY',boundary,higherMinutes:tf==='5m'?15:tf==='15m'?60:tf==='1h'?240:1440,lookbackBars:240,fastPeriod:8,slowPeriod:20}};
}
export function discoverWatchedStrategies(input:{definitions:readonly StrategyDefinition[];symbol:string;tf:WatchTimeframe;rows:readonly StrategyCandle[];now:number;higher?:readonly StrategyCandle[];anchor?:readonly StrategyCandle[];sources?:readonly SourceContext[];spreadPrice?:number|null;spreadObservedAt?:string}) {
 const {definitions,symbol,tf,now}=input,market=conditionalMarket(symbol);if(!market)throw Error('WATCH_MARKET_REQUIRED');
 const rows=input.rows,w=watchWidth(tf),at=new Date(now).toISOString(),observations:StrategyObservation[]=[],setups:ConditionalSetup[]=[];
 if(rows.length<100||rows.some((b,i)=>b.symbol!==symbol||b.timeframe!==tf||!b.source||b.source!==rows[0].source||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||Date.parse(b.open_time)+w>now||i>0&&!consecutiveMarketBars(symbol,Date.parse(rows[i-1].open_time),Date.parse(b.open_time),w)))throw Error('STRATEGY_WATCH_HISTORY_INVALID');
 const intel=watchedMarketContext(rows,now,input),ctx:StrategyEvaluationContext={symbol,market,timeframe:tf,candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:at,higher_timeframe_candles:input.higher,reference_candles:input.anchor};
 const registry=new ProfessionalStrategyRegistry(definitions),evaluations=registry.evaluate(ctx),byId=new Map(evaluations.map(e=>[e.definition.id,e]));
 for(const d of definitions.filter(d=>d.market===market)){
  const e=byId.get(d.id),eligible=registry.eligible(d,ctx),enabled=d.lifecycle==='ENABLED'&&d.config.enabled;
  const s=e?watchedSetupFromEvaluation(e,ctx,intel):null;
  if(s)setups.push(s);
  observations.push({strategy_id:d.id,symbol,timeframe:tf,checked_at:at,decision:!enabled?'DISABLED':!eligible?'INELIGIBLE':s?'WATCH':e?.professional.legacy.status==='candidate'?'HELD_CONTEXT':'NO_SETUP',reason:!enabled?d.certification==='RESEARCH'?'RESEARCH_NOT_RELEASED':'CONFIGURATION_DISABLED':!eligible?'SYMBOL_OR_TIMEFRAME_NOT_ELIGIBLE':s?'ORIGINAL_EVALUATOR_AND_CONTEXT_PASSED':e?.professional.legacy.rejection_reason||(e?.professional.legacy.tp1===0?'TARGETLESS_NATIVE_MANAGEMENT_REQUIRED':'CONTEXT_COST_OR_GEOMETRY_REJECTED'),evidence:{strategy_version:d.version,source_close:rows.at(-1)!.open_time,intelligence:intel,evaluator:e?.professional.legacy.score_breakdown??{},configuration:structuredClone(d.config)}});
 }
 if(intel.news!=='HIGH_IMPACT_WINDOW'&&intel.rangeAtr<=3)for(const s of conditionalCandidates(symbol,tf,rows,now))setups.push({...s,intelligence:intel});
 return {setups,observations,intelligence:intel};
}
