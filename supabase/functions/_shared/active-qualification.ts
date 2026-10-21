import type { LegacyStrategyResult, StrategyRuntimeConfig } from './professional-strategies.ts';
export interface ActiveQualification {passed:boolean;reasons:string[];slPct:number;tp1Pct:number;tp2Pct:number;riskReward:number;}
const grade=(value:string)=>value==='A+'?3:value==='A'?2:value==='B'?1:0;
export function qualifyActiveCandidate(result:LegacyStrategyResult,config:StrategyRuntimeConfig,minSignalGrade:string):ActiveQualification {
 const reasons:string[]=[];
 if(result.status==='rejected')reasons.push(result.rejection_reason||'evaluator_rejected');
 const buy=/^(buy|long)$/i.test(result.direction),sell=/^(sell|short)$/i.test(result.direction);
 const levels=[result.entry_low,result.entry_high,result.stop_loss,result.tp1,result.tp2];
 const entry=buy?result.entry_high:result.entry_low,risk=Math.abs(entry-result.stop_loss);
 const slPct=entry>0?risk/entry*100:0,tp1Pct=entry>0?Math.abs(result.tp1-entry)/entry*100:0,tp2Pct=entry>0?Math.abs(result.tp2-entry)/entry*100:0,rr=risk>0?Math.abs(result.tp2-entry)/risk:0;
 if(!levels.every(Number.isFinite)||levels.some(v=>v<=0)||result.entry_low>result.entry_high)reasons.push('invalid_trade_levels');
 if(!(buy&&result.stop_loss<result.entry_low&&result.tp1>result.entry_high&&result.tp2>=result.tp1||sell&&result.stop_loss>result.entry_high&&result.tp1<result.entry_low&&result.tp2<=result.tp1))reasons.push('invalid_trade_geometry');
 if(!Number.isFinite(result.confidence_score)||!Number.isFinite(config.min_score)||!Number.isFinite(config.min_rr))reasons.push('invalid_qualification_inputs');
 if(slPct<(config.min_stop_distance_pct??0))reasons.push('sl_too_close');
 if(tp1Pct<(config.min_tp1_distance_pct??0))reasons.push('tp1_too_close');
 if(tp2Pct<(config.min_tp2_distance_pct??0))reasons.push('tp2_too_close');
 if(rr<config.min_rr)reasons.push('rr_too_low');
 if(result.confidence_score<config.min_score)reasons.push('confidence_too_low');
 if(grade(result.grade)<grade(minSignalGrade))reasons.push('grade_below_min_signal_grade');
 return {passed:reasons.length===0,reasons:[...new Set(reasons)],slPct,tp1Pct,tp2Pct,riskReward:rr};
}
