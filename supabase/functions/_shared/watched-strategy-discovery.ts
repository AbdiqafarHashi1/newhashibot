import {createStrategyPlan} from './strategy-plan.ts';
import {decideEntry,entryPolicyEvaluable,type EntryDecision} from './entry-decision.ts';
import {applyPaperLearning,type PaperLearningSnapshot} from './paper-learning.ts';
import {ProfessionalStrategyRegistry,type StrategyDefinition,type StrategyCandle,type StrategyEvaluationContext,type RegistryEvaluation} from './professional-strategies.ts';
import {calculateActiveIndicators} from './active-validation-runtime.ts';
import {conditionalCost,conditionalMarket,consecutiveMarketBars} from './conditional-market.ts';
import {watchWidth,watchTrack,type WatchTimeframe} from './conditional-contract.ts';
import {watchedMarketContext,strategyContextDecision,type SourceContext,type WatchedIntelligence,type StrategyThesis} from './watched-market-context.ts';
import {type ConditionalSetup} from './conditional-signal-service.ts';

export interface StrategyObservation {strategy_id:string;symbol:string;timeframe:string;checked_at:string;decision:string;reason:string;evidence:Record<string,unknown>;}
const sessions=(id:string)=>id==='forex.london-breakout'?['LONDON','LONDON_NEW_YORK_OVERLAP']:id==='forex.new-york-continuation'?['NEW_YORK','LONDON_NEW_YORK_OVERLAP']:id==='gold.volatility-breakout'||id==='forex.trend-pullback'?['LONDON','NEW_YORK','LONDON_NEW_YORK_OVERLAP']:[];
/** MicroScalper exposes full geometry even when its final body confirmation is missing.
 * Admit only that exact failure with every other named gate proven; never turn arbitrary rejections into watches. */
export function conditionalEvaluation(e:RegistryEvaluation,ctx:StrategyEvaluationContext):RegistryEvaluation {
 const r=e.professional.legacy,b=r.score_breakdown,d=e.definition;
 if(d.id!=='crypto.micro-scalper'||r.status!=='rejected'||r.rejection_reason!=='candle_body_too_small'||r.confidence_score<d.config.min_score||r.risk_reward<d.config.min_rr)return e;
 const sign=r.direction==='buy'?1:r.direction==='sell'?-1:0,ind=ctx.indicators;
 if(!sign||b.volatility_healthy!==true||b.fifteen_minute_trend_confirmed!==true||b.directional_pressure_confirmed!==true||b.strong_chop!==false||b.overextended!==false||b.chase_risk!==false||Number(b.trend_score)<75||sign*ind.momentum_score<=.2||sign*(ind.rsi14-Number(b.rsi_threshold))<0)return e;
 const pending={...r,status:'candidate' as const,grade:r.confidence_score>=85?'A+':'A',rejection_reason:'',score_breakdown:{...b,entry_confirmation_pending:true,original_rejection_reason:r.rejection_reason}};
 return {...e,professional:{...e.professional,legacy:pending},plan:createStrategyPlan(d,ctx,pending)};
}
/** Named evaluators preserve their immutable setup; the shared entry policy decides timing. */
export function watchedSetupFromEvaluation(e:RegistryEvaluation,ctx:StrategyEvaluationContext,intel:WatchedIntelligence,onReject?:(reason:string)=>void):ConditionalSetup|null {
 const reject=(reason:string)=>{onReject?.(reason);return null;};
 const r=e.professional.legacy,d=e.definition,tf=ctx.timeframe as WatchTimeframe,w=watchWidth(tf),last=ctx.candles.at(-1)!;
 if(!e.publishable||!e.plan.decision.qualified||!d.config.enabled||r.status!=='candidate'||!['buy','sell'].includes(r.direction)||!Number.isFinite(w))return reject('EVALUATOR_OR_PLAN_NOT_ELIGIBLE');
 const side=r.direction as 'buy'|'sell',sign=side==='buy'?1:-1,trigger=side==='buy'?r.entry_high:r.entry_low,risk=sign*(trigger-r.stop_loss),cost=conditionalCost(ctx.symbol,trigger);
 if(![trigger,r.stop_loss,r.tp1,r.tp2,cost.price,r.confidence_score].every(Number.isFinite)||!(risk>0&&r.stop_loss>0&&sign*(r.tp1-trigger)>0&&sign*(r.tp2-r.tp1)>=0)||cost.price/risk>.4||r.confidence_score<d.config.min_score||sign*(r.tp2-trigger)/risk<d.config.min_rr)return reject('SETUP_GEOMETRY_COST_SCORE_OR_RR');
 if(([[d.config.min_stop_distance_pct,risk],[d.config.min_tp1_distance_pct,Math.abs(r.tp1-trigger)],[d.config.min_tp2_distance_pct,Math.abs(r.tp2-trigger)]] as [number|undefined,number][]).some(([minimum,distance])=>typeof minimum==='number'&&distance/trigger*100<minimum))return reject('SETUP_MINIMUM_DISTANCE');
 const family:StrategyThesis['family']=/reversal|range|auction|exhaustion/.test(d.id)?'REVERSAL':/breakout|expansion|compression/.test(d.id)?'BREAKOUT':'TREND';
 const keys=side==='buy'?['asian_range_high','range_high','box_high','channel_high','breakout_level']:['asian_range_low','range_low','box_low','channel_low','breakout_level'];
 const observedBoundary=keys.map(k=>r.score_breakdown[k]).find(v=>typeof v==='number'&&Number.isFinite(v));
 const boundary=family==='BREAKOUT'&&typeof observedBoundary==='number'?observedBoundary:r.stop_loss;
 const thesis:StrategyThesis={family,boundary,minimumVolumeRatio:family==='BREAKOUT'?.7:.35,maximumRangeAtr:3,sessions:sessions(d.id),higherRequired:family==='TREND',maximumCostR:.4,anchorRequired:ctx.market==='crypto'&&ctx.symbol!=='BTCUSDT'&&family==='TREND'};
 const contextDecision=strategyContextDecision(thesis,side,ctx.candles,intel);
 if(contextDecision!=='VALID')return reject('SETUP_CONTEXT_'+contextDecision);
 if(intel.spreadPrice!==null&&intel.spreadPrice/risk>.2)return reject('SETUP_SPREAD_TOO_HIGH');
 const reportedHold=r.score_breakdown.max_bars_in_trade;const hold=typeof reportedHold==='number'?reportedHold:d.config.max_bars_in_trade;if(!Number.isInteger(hold)||hold<1||hold>3650)return reject('SETUP_HOLD_INVALID');
 const close=new Date(Date.parse(last.open_time)+w).toISOString(),track=watchTrack(tf,d.id),ttl=typeof r.score_breakdown.no_entry_timeout_bars==='number'?r.score_breakdown.no_entry_timeout_bars:track==='SCALP'?3:track==='INTRADAY'?8:24;
 return {id:`strategy-watch/v1:${d.id}:${d.version}:${e.plan.provenance.config_hash}:${ctx.symbol}:${tf}:${close}:${sign}`,symbol:ctx.symbol,market:ctx.market,timeframe:tf,track,side,strategy:d.id,variant:family,policy:'conditional-signals/v1',sourceClose:close,source:last.source,trigger,stop:r.stop_loss,tp1:r.tp1,tp2:r.tp2,expiresAt:new Date(Date.parse(close)+ttl*w).toISOString(),holdBars:hold,score:r.confidence_score,reason:r.reason,status:'WAITING',version:1,lastBar:last.open_time,cost,intelligence:intel,origin:{version:d.version,configuration:structuredClone(d.config),plan:structuredClone(e.plan),thesis},management:{partialFraction:r.tp1===r.tp2?0:.5,breakEvenAfterTp1:false,maximumChaseR:track==='SCALP'?.15:.25},validation:{kind:'STRATEGY',boundary,higherMinutes:tf==='5m'?15:tf==='15m'?60:tf==='1h'?240:1440,lookbackBars:240,fastPeriod:8,slowPeriod:20}};
}
export function discoverWatchedStrategies(input:{definitions:readonly StrategyDefinition[];symbol:string;tf:WatchTimeframe;rows:readonly StrategyCandle[];now:number;higher?:readonly StrategyCandle[];anchor?:readonly StrategyCandle[];sources?:readonly SourceContext[];spreadPrice?:number|null;spreadObservedAt?:string;learning?:PaperLearningSnapshot}) {
 const {definitions,symbol,tf,now}=input,market=conditionalMarket(symbol);if(!market)throw Error('WATCH_MARKET_REQUIRED');
 const rows=input.rows,w=watchWidth(tf),at=new Date(now).toISOString(),observations:StrategyObservation[]=[],setups:ConditionalSetup[]=[];
 const rejectData=(reason:string)=>({setups:[] as ConditionalSetup[],intelligence:undefined,observations:definitions.filter(d=>d.market===market).map(d=>({strategy_id:d.id,symbol,timeframe:tf,checked_at:at,decision:'NO_TRADE',reason,evidence:{strategy_version:d.version,configuration:structuredClone(d.config),source_close:rows.at(-1)?.open_time??null,entry_decision:{schema:'entry-decision/v1',kind:'NO_TRADE',opportunityId:`data-rejection:${d.id}:${symbol}:${tf}:${at}`,strategyVersion:d.version,evaluatedAt:at,dataClose:'',reasons:[reason],netRewardRisk:null,confirmation:'UNAVAILABLE',executionEligible:false}}}))});
 if(rows.length<100||rows.some((b,i)=>b.symbol!==symbol||b.timeframe!==tf||!b.source||b.source!==rows[0].source||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||Date.parse(b.open_time)+w>now||i>0&&!consecutiveMarketBars(symbol,Date.parse(rows[i-1].open_time),Date.parse(b.open_time),w)))return rejectData('STRATEGY_WATCH_HISTORY_INVALID');
 let intel:WatchedIntelligence;try{intel=watchedMarketContext(rows,now,input);}catch(e){return rejectData(e instanceof Error?e.message:'CONTEXT_DATA_UNAVAILABLE');}
 const ctx:StrategyEvaluationContext={symbol,market,timeframe:tf,candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:at,higher_timeframe_candles:input.higher,reference_candles:input.anchor};
 const registry=new ProfessionalStrategyRegistry(definitions),evaluations=registry.evaluate(ctx),byId=new Map(evaluations.map(e=>[e.definition.id,e]));
 for(const d of definitions.filter(d=>d.market===market)){
  const original=byId.get(d.id),e=original?conditionalEvaluation(original,ctx):undefined,eligible=registry.eligible(d,ctx),enabled=d.lifecycle==='ENABLED'&&d.config.enabled;
  const admissionReasons:string[]=[];
  const s=e?watchedSetupFromEvaluation(e,ctx,intel,r=>admissionReasons.push(r)):null;
  const qualified=entryPolicyEvaluable(d.config);
  const decision:EntryDecision=s?decideEntry({setup:s,rows,now,intelligence:intel,qualified}):{
   schema:'entry-decision/v1',kind:'NO_TRADE',opportunityId:`rejected:${d.id}:${d.version}:${symbol}:${tf}:${rows.at(-1)!.open_time}`,
   strategyVersion:d.version,evaluatedAt:at,dataClose:new Date(Date.parse(rows.at(-1)!.open_time)+w).toISOString(),
   reasons:[!enabled?'CONFIGURATION_DISABLED':!eligible?'SYMBOL_OR_TIMEFRAME_NOT_ELIGIBLE':e?.professional.legacy.rejection_reason||'CONTEXT_COST_OR_GEOMETRY_REJECTED'],
   netRewardRisk:null,confirmation:'UNAVAILABLE',executionEligible:false};
  let proposal=s&&decision?{...s,entryDecision:decision}:s;
  if(proposal&&decision?.kind==='IMMEDIATE_CONFIRMED'){
   const entryAt=new Date(now).toISOString();
   proposal={...proposal,status:'ACTIVE',armedAt:entryAt,fillAt:entryAt,observedAt:entryAt,fill:rows.at(-1)!.close,bars:0,netR:0,confirmationIntelligence:intel,result:'Complete named-strategy confirmation; modeled signal reference at the latest closed price, not a broker fill.'};
  }
  // Learning may rank analysis, but never mutate a qualified frozen entry contract.
  const learned=proposal&&input.learning&&!qualified?applyPaperLearning(proposal,input.learning,now):proposal;
  if(learned&&(!qualified||decision?.kind!=='NO_TRADE'))setups.push(learned);
  observations.push({strategy_id:d.id,symbol,timeframe:tf,checked_at:at,decision:!enabled?'DISABLED':!eligible?'INELIGIBLE':decision?decision.kind:e?.professional.legacy.status==='candidate'?'HELD_CONTEXT':'NO_SETUP',reason:!enabled?d.certification==='RESEARCH'?'RESEARCH_NOT_RELEASED':'CONFIGURATION_DISABLED':!eligible?'SYMBOL_OR_TIMEFRAME_NOT_ELIGIBLE':decision?.reasons.length?decision.reasons.join('|'):s?'ORIGINAL_EVALUATOR_AND_CONTEXT_PASSED':e?.professional.legacy.rejection_reason||(e?.professional.legacy.tp1===0?'TARGETLESS_NATIVE_MANAGEMENT_REQUIRED':'CONTEXT_COST_OR_GEOMETRY_REJECTED'),evidence:{setup_admission_rejections:admissionReasons,raw_candidate:original?.professional.legacy.status==='candidate',conditional_candidate:e?.professional.legacy.status==='candidate'&&original?.professional.legacy.status!=='candidate',evaluator_called:!!original,evaluator_status:original?.professional.legacy.status??'NOT_EVALUATED',entry_decision:decision,execution_qualified:qualified,paper_learning:learned?.learning??null,strategy_version:d.version,source_close:new Date(Date.parse(rows.at(-1)!.open_time)+w).toISOString(),intelligence:intel,evaluator:e?.professional.legacy.score_breakdown??{},configuration:structuredClone(d.config)}});
 }

 return {setups,observations,intelligence:intel};
}
