import {conditionalMarket} from './conditional-market.ts';
import type {ConditionalSetup} from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import {validClosedBars} from './conditional-signal-service.ts';
import {strategyContextDecision,type WatchedIntelligence} from './watched-market-context.ts';
import {classifyEntryRegime,entryRegimeRejection,type EntryRegimeEvidence} from './entry-regime.ts';
export const ENTRY_ENGINE_VERSION=1;
export const entryPolicyQualified=(configuration:{config_source?:string;params:Record<string,unknown>})=>configuration.config_source?.startsWith('measured_release:')===true&&configuration.params.entry_engine_version===ENTRY_ENGINE_VERSION;
export const entryPolicyResearchAuthorized=(c:{config_source?:string;params:Record<string,unknown>})=>/^research_authorization:v1:[0-9a-f]{64}$/.test(c.config_source??'')&&c.params.entry_engine_version===ENTRY_ENGINE_VERSION;
export const entryPolicyEvaluable=(c:{config_source?:string;params:Record<string,unknown>})=>entryPolicyQualified(c)||entryPolicyResearchAuthorized(c);
export type EntryDecisionKind='IMMEDIATE_CONFIRMED'|'CONDITIONAL_WATCH'|'NO_TRADE';
export interface EntryDecision {
 schema:'entry-decision/v1'; kind:EntryDecisionKind; opportunityId:string; strategyVersion:string;
 evaluatedAt:string; dataClose:string; reasons:string[]; netRewardRisk:number|null;
 regime?:EntryRegimeEvidence; authorizationScope?:'RESEARCH';
 confirmation:'COMPLETE'|'INCOMPLETE'|'UNAVAILABLE'; executionEligible:boolean;
}
/** Reused for signal reference and observed next-open feasibility; never a broker fill claim. */
export function entryPriceAssessment(s:ConditionalSetup,price:number,spread:number|null=0):{reasons:string[];netRewardRisk:number|null}{
 const sign=s.side==='buy'?1:-1,risk=sign*(price-s.stop),cost=Math.max(s.cost?.price??NaN,spread??0),reasons:string[]=[];
 if(![price,risk,cost,s.tp1,s.tp2].every(Number.isFinite)||risk<=0||cost<0||sign*(s.tp1-price)<=0||sign*(s.tp2-s.tp1)<0)return {reasons:['INVALID_STOP_TARGET_GEOMETRY'],netRewardRisk:null};
 const netRewardRisk=(sign*(s.tp2-price)-cost)/(risk+cost);
 if(netRewardRisk<(s.origin?.configuration.min_rr??Infinity))reasons.push('INSUFFICIENT_NET_REWARD_RISK');
 if(cost/risk>(s.origin?.thesis.maximumCostR??0))reasons.push('EXCESSIVE_EXECUTION_COST');
 if(sign*(price-s.trigger)/Math.abs(s.trigger-s.stop)>(s.management?.maximumChaseR??.25))reasons.push('MAXIMUM_ENTRY_CHASE');
 return {reasons,netRewardRisk};
}
/** Single closed-data entry policy. Admission/arbitration is atomic in the durable store,
 * and release qualification is rechecked by projection and account authorization. */
export function decideEntry(input:{setup:ConditionalSetup;rows:readonly StrategyCandle[];now:number;intelligence:WatchedIntelligence;qualified:boolean;arbitrationAllowed?:boolean;originalTriggerConfirmed?:boolean}):EntryDecision {
 const {setup:s,rows,now,intelligence:intel}=input,sign=s.side==='buy'?1:-1,last=rows.at(-1),w=({ '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000 } as Record<string,number>)[s.timeframe];
 const out:EntryDecision={schema:'entry-decision/v1',kind:'NO_TRADE',opportunityId:s.id,strategyVersion:s.origin?.version??'legacy',evaluatedAt:Number.isFinite(now)?new Date(now).toISOString():'',dataClose:last&&Number.isFinite(Date.parse(last.open_time)+w)?new Date(Date.parse(last.open_time)+w).toISOString():'',reasons:[],netRewardRisk:null,confirmation:'UNAVAILABLE',executionEligible:false};
 if(s.origin&&entryPolicyResearchAuthorized(s.origin.configuration))out.authorizationScope='RESEARCH';
 if(!validClosedBars(rows,s.symbol,s.timeframe,now))out.reasons.push('STALE_OR_INCOMPLETE_DATA');
 if(!conditionalMarket(s.symbol))out.reasons.push('UNSUPPORTED_INSTRUMENT');
 if(!Number.isFinite(now))out.reasons.push('INVALID_EVALUATION_CLOCK');
 if(!Number.isFinite(Date.parse(s.expiresAt)))out.reasons.push('INVALID_EXPIRY');
 if(s.origin){const c=s.origin.configuration,p=s.origin.plan;if(c.allowed_symbols.length&&!c.allowed_symbols.includes(s.symbol)||c.allowed_timeframes.length&&!c.allowed_timeframes.includes(s.timeframe))out.reasons.push('INSTRUMENT_OR_TIMEFRAME_NOT_ELIGIBLE');if(p.identity.strategy_id!==s.strategy||p.identity.strategy_version!==s.origin.version||p.market_context.symbol!==s.symbol||p.market_context.timeframe!==s.timeframe)out.reasons.push('ORIGINAL_STRATEGY_IDENTITY_MISMATCH');}
 if(!s.origin)out.reasons.push('ORIGINAL_STRATEGY_REQUIRED');
 if(now>=Date.parse(s.expiresAt))out.reasons.push('EXPIRED');
 if(!input.qualified)out.reasons.push('UNQUALIFIED_STRATEGY');
 if(input.arbitrationAllowed===false)out.reasons.push('ARBITRATION_REJECTED');
 const price=last?.close??NaN,feasibility=entryPriceAssessment(s,price,intel.spreadPrice);out.netRewardRisk=feasibility.netRewardRisk;out.reasons.push(...feasibility.reasons.filter(r=>r!=='MAXIMUM_ENTRY_CHASE'));
 if(s.origin&&last&&validClosedBars(rows,s.symbol,s.timeframe,now)){
  const regime=classifyEntryRegime(rows),block=entryRegimeRejection(s.origin.thesis.family,s.side,regime);out.regime=regime;
  if(block)out.reasons.push(block.toUpperCase());
  const context=strategyContextDecision(s.origin.thesis,s.side,rows,intel);
  if(context==='INVALID')out.reasons.push('ORIGINAL_THESIS_INVALID');
  if(context==='UNKNOWN')out.reasons.push('CONTEXT_DATA_UNAVAILABLE');
  const zone=s.origin.plan.entry_plan.zone,withinOriginalZone=zone!==null&&last.close>=zone.low&&last.close<=zone.high;
  const pending=s.origin.plan.evidence.strategy_specific.entry_confirmation_pending===true;
  out.confirmation=(!pending||input.originalTriggerConfirmed===true)&&context==='VALID'&&(withinOriginalZone||sign*(last.close-s.trigger)>=0)&&sign*(last.close-last.open)>0?'COMPLETE':'INCOMPLETE';
 }
 if(out.confirmation==='COMPLETE'&&now-Date.parse(out.dataClose)>90000)out.reasons.push('STALE_EXECUTABLE_CONFIRMATION');
 if(out.reasons.length)return out;
 const chase=sign*(price-s.trigger)/Math.abs(s.trigger-s.stop);
 if(out.confirmation==='COMPLETE'&&chase>(s.management?.maximumChaseR??.25)){out.reasons.push('MAXIMUM_ENTRY_CHASE');return out;}
 out.kind=out.confirmation==='COMPLETE'?'IMMEDIATE_CONFIRMED':'CONDITIONAL_WATCH';out.executionEligible=out.kind==='IMMEDIATE_CONFIRMED'&&out.authorizationScope!=='RESEARCH';
 return out;
}
