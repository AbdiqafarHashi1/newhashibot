import {PERSONAL_RISK_PROFILES,personalRiskProfile,type PersonalRiskProfile} from './personal-growth-policy.ts';
export const HOUSE_MONEY_VERSION='house-money/v1' as const;
export type EquityMode='PERSONAL'|'PROP_CHALLENGE_PASS'|'PROP_FUNDED_INCOME';
export interface HouseMoneyFacts {customerId:string;accountId:string;observedAt:string;monthlyPnlPct:number;dailyPnlPct:number;peakDrawdownPct:number;totalDrawdownPct:number;consecutiveLosses:number;phase:1|2;latchedReason?:string|null;}
export interface HouseMoneyDecision {equity_phase:string;base_risk_pct:number;applied_risk_pct:number;block_reason:string|null;}
/** Closed-net monthly profit; current floating equity participates in every loss guard. */
export function houseMoneyRisk(mode:EquityMode,f:HouseMoneyFacts,now:string,topHourly=false,weekendMultiplier=1,personalProfile:PersonalRiskProfile='STANDARD'):HouseMoneyDecision{
 const age=Date.parse(now)-Date.parse(f.observedAt),stop=(reason:string):HouseMoneyDecision=>({equity_phase:'HALTED',base_risk_pct:0,applied_risk_pct:0,block_reason:reason});
 if(!Number.isFinite(age)||age<0||age>60000||![f.monthlyPnlPct,f.dailyPnlPct,f.peakDrawdownPct,f.totalDrawdownPct].every(Number.isFinite)||f.peakDrawdownPct<0||f.totalDrawdownPct<0||!Number.isInteger(f.consecutiveLosses)||f.consecutiveLosses<0||![1,2].includes(f.phase)||![1,.75].includes(weekendMultiplier))return stop('HOUSE_MONEY_EVIDENCE_INVALID_OR_STALE');
 if(f.latchedReason)return stop(f.latchedReason);
 const selected=personalRiskProfile(personalProfile);
 if(selected!=='STANDARD'){if(mode!=='PERSONAL')return stop('PERSONAL_RISK_PROFILE_FORBIDDEN_FOR_PROP');const p=PERSONAL_RISK_PROFILES[selected];if(f.peakDrawdownPct>=p.peak)return stop('PERSONAL_GROWTH_PEAK_HALT');if(f.dailyPnlPct<=-p.daily)return stop('PERSONAL_GROWTH_DAILY_HALT');return {equity_phase:'PERSONAL_'+selected,base_risk_pct:p.risk,applied_risk_pct:p.risk*weekendMultiplier,block_reason:null};}
 if(f.dailyPnlPct<=-4)return stop('DAILY_CIRCUIT_4_PERCENT');
 let risk=0,phase='';
 if(mode==='PERSONAL'){
  if(f.peakDrawdownPct>=18)return stop('PERSONAL_PEAK_DRAWDOWN_HALT');
  if(f.peakDrawdownPct>=5||f.consecutiveLosses>=3){risk=.5;phase='PERSONAL_DEFENSIVE';}
  else if(f.monthlyPnlPct>=3&&f.consecutiveLosses<2){risk=topHourly?2.25:2;phase='PERSONAL_HOUSE_MONEY';}
  else{risk=1;phase='PERSONAL_BASE';}
 }else if(mode==='PROP_CHALLENGE_PASS'){
  if(f.dailyPnlPct<=-3.25)return stop('CHALLENGE_DAILY_HALT');
  if(f.totalDrawdownPct>=7.5)return stop('CHALLENGE_TOTAL_HALT');
  if(f.monthlyPnlPct>=(f.phase===1?8.2:5.2))return stop('CHALLENGE_PHASE_TARGET_LOCK');
  if(f.dailyPnlPct<=-1.75||f.consecutiveLosses>=2){risk=.4;phase='CHALLENGE_DEFENSIVE';}
  else{risk=f.monthlyPnlPct>=2?1:.85;phase='CHALLENGE_PASS';}
 }else{
  if(f.dailyPnlPct<=-2.25)return stop('FUNDED_DAILY_HALT');
  if(f.monthlyPnlPct>=4.5)return stop('FUNDED_MONTHLY_TARGET_LOCK');
  risk=f.consecutiveLosses>=2?.25:.45;phase='FUNDED_INCOME';
 }
 return {equity_phase:phase,base_risk_pct:risk,applied_risk_pct:risk*weekendMultiplier,block_reason:null};
}
export const equityMode=(accountType:string,product?:string):EquityMode=>accountType==='PROP_FUNDED'?'PROP_FUNDED_INCOME':accountType!=='PERSONAL'||product?.endsWith('_PROP')?'PROP_CHALLENGE_PASS':'PERSONAL';
export const topHourlyConfig=(id:string,timeframe:string)=>timeframe==='1h'&&['crypto.complementary-ema-pullback','forex.complementary-ema-pullback','gold.native-momentum-60-24-2-5'].includes(id);
