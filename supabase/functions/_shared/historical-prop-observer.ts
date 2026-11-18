import {stableFingerprint} from './strategy-plan.ts';
import {propResetDay,type PropProgramProfile} from '../../../src/lib/prop/professionalPropEngine.ts';
// Bounded pure-calendar cache is shared across overlapping account cohorts. No account data is cached.
const propDayCache=new Map<string,string>();
export interface PropEquityObservation {at:number;balance:number;equity:number;openPositions:number;newEntries:number;realizedDailyProfit?:number;newsViolation?:boolean;overnightViolation?:boolean;weekendViolation?:boolean;maximumPositionViolation?:boolean;}
export interface PropResearchSnapshot {schema:'historical-prop-observer/v1';profileId:string;profileVersion:string;profileHash:string;lastBalance:number;lastEquity:number;initialBalance:number;phase:number;status:'ACTIVE'|'AWAITING_PHASE_RESET'|'FUNDED'|'FAILED'|'EXPIRED'|'INSUFFICIENT_RULE_EVIDENCE';phaseStart:number;through:number;peak:number;day:string;dayStart:number;dayStartEquity:number;tradingDays:string[];lastEntryAt:number|null;fundedAt:number|null;failedAt:number|null;resetToken:string|null;events:{at:number;kind:string;reason:string}[];payoutEligibility:{at:number;hypotheticalGrossProfit:number;hypotheticalCustomerShare:number}[];}
/** Consumes chronological EQUITY, including adverse intrabar marks, not rescaled closed-trade R.
 * Challenge/verification transitions require a separate proven account reset. Unknown firm rules remain unknown. */
export class HistoricalPropObserver {
 private state:PropResearchSnapshot;
 constructor(private profile:PropProgramProfile,capital:number,start:number,private evidence:{calendarComplete:boolean;holdingRestrictionsVerified:boolean;consistencyMaxBestDayFraction?:number;inactivityDays?:number},resume?:PropResearchSnapshot){
  if(capital<=0||!Number.isFinite(capital)||!profile.phases.length||!profile.effectiveDate||!profile.profileVersion)throw Error('PROP_RESEARCH_PROFILE_INVALID');
  const profileHash=stableFingerprint({profile,evidence});
  if(resume&&(resume.profileHash!==profileHash||resume.profileId!==profile.firmId||resume.profileVersion!==profile.profileVersion||resume.initialBalance!==capital))throw Error('PROP_PROFILE_REPLAY_MISMATCH');
  this.state=resume?structuredClone(resume):{schema:'historical-prop-observer/v1',profileId:profile.firmId,profileVersion:profile.profileVersion,profileHash,lastBalance:capital,lastEquity:capital,initialBalance:capital,phase:0,status:profile.phases[0].id==='FUNDED'?'FUNDED':'ACTIVE',phaseStart:start,through:start,peak:capital,day:'',dayStart:capital,dayStartEquity:capital,tradingDays:[],lastEntryAt:null,fundedAt:profile.phases[0].id==='FUNDED'?start:null,failedAt:null,resetToken:null,events:[],payoutEligibility:[]};
  const r=profile.rules;
  if(r.dailyLossPct===null||r.maxLossPct===null||r.dstBehavior==='PENDING_VERIFICATION'||(!evidence.calendarComplete&&profile.compliance.some(v=>/news/i.test(v)))||(!evidence.holdingRestrictionsVerified&&profile.compliance.some(v=>/overnight|weekend/i.test(v))))this.state.status='INSUFFICIENT_RULE_EVIDENCE';
 }
 snapshot(){return structuredClone(this.state);}
 progress(){const s=this.state;return {status:s.status,phase:s.phase,phaseStart:s.phaseStart,tradingDays:s.tradingDays.length,resetToken:s.resetToken,fundedAt:s.fundedAt,through:s.through};}
 observe(o:PropEquityObservation,emitSnapshot?:true):PropResearchSnapshot;
 observe(o:PropEquityObservation,emitSnapshot:false):void;
 observe(o:PropEquityObservation,emitSnapshot=true){
  const s=this.state;if(![o.at,o.balance,o.equity].every(Number.isFinite)||o.at<s.through||o.openPositions<0||!Number.isInteger(o.newEntries)||o.newEntries<0)throw Error(`PROP_EQUITY_OBSERVATION_INVALID at=${o.at} through=${s.through} entries=${o.newEntries} open=${o.openPositions} balance=${o.balance} equity=${o.equity}`);
  s.through=o.at;if(['FAILED','EXPIRED','INSUFFICIENT_RULE_EVIDENCE','AWAITING_PHASE_RESET'].includes(s.status))return emitSnapshot?this.snapshot():undefined;
  const phase=this.profile.phases[s.phase],r=this.profile.rules,key=`${r.resetTimezone}:${r.resetTime}:${Math.floor(o.at/60000)}`,day=propDayCache.get(key)??propResetDay(new Date(o.at).toISOString(),r.resetTimezone,r.resetTime);if(propDayCache.size<200000)propDayCache.set(key,day);
  if(day!==s.day){s.day=day;s.dayStart=s.lastBalance;s.dayStartEquity=s.lastEquity;}s.lastBalance=o.balance;s.lastEquity=o.equity;
  if(o.newEntries){if(!s.tradingDays.includes(day))s.tradingDays.push(day);s.lastEntryAt=o.at;}
  s.peak=Math.max(s.peak,r.maxLossBasis.includes('BALANCE')?o.balance:o.equity);
  const dailyReference=r.dailyLossBasis==='START_OF_DAY_BALANCE'?s.dayStart:r.dailyLossBasis==='START_OF_DAY_EQUITY'?s.dayStartEquity:s.initialBalance;
  const dailyValue=r.floatingPnlIncluded||r.dailyLossBasis.includes('EQUITY')?o.equity:o.balance,dailyLoss=Math.max(0,dailyReference-dailyValue)/(r.dailyLossAmountBasis==='INITIAL_BALANCE'?s.initialBalance:dailyReference)*100;
  const overallReference=/TRAIL|HIGH_WATER|CURRENT_/.test(r.maxLossBasis)?s.peak:s.initialBalance,overallValue=r.floatingPnlIncluded?o.equity:o.balance,overallLoss=Math.max(0,overallReference-overallValue)/s.initialBalance*100;
  const reason=dailyLoss>=r.dailyLossPct!?'DAILY_EQUITY_LIMIT':overallLoss>=r.maxLossPct!?'OVERALL_DRAWDOWN_LIMIT':o.newsViolation?'NEWS_RESTRICTION':o.overnightViolation?'OVERNIGHT_RESTRICTION':o.weekendViolation?'WEEKEND_RESTRICTION':o.maximumPositionViolation?'POSITION_SIZE_RESTRICTION':this.evidence.inactivityDays&&s.lastEntryAt!==null&&o.at-s.lastEntryAt>this.evidence.inactivityDays*86400000?'INACTIVITY':null;
  if(reason){s.status='FAILED';s.failedAt=o.at;s.events.push({at:o.at,kind:'FAILED',reason});return emitSnapshot?this.snapshot():undefined;}
  if(phase.durationDays!==null&&o.at-s.phaseStart>phase.durationDays*86400000){s.status='EXPIRED';s.events.push({at:o.at,kind:'EXPIRED',reason:'PHASE_DURATION'});return emitSnapshot?this.snapshot():undefined;}
  if(phase.id==='FUNDED'){s.status='FUNDED';return emitSnapshot?this.snapshot():undefined;}
  if(phase.profitTargetPct!==null&&o.balance>=s.initialBalance*(1+phase.profitTargetPct/100)&&o.openPositions===0&&s.tradingDays.length>=phase.minimumTradingDays){
   s.status='AWAITING_PHASE_RESET';s.resetToken=`historical-phase-reset:${s.profileId}:${s.phase}:${o.at}`;s.events.push({at:o.at,kind:'PHASE_PASSED',reason:phase.id});
  }
  return emitSnapshot?this.snapshot():undefined;
 }
 resetForNextPhase(at:number,token:string,proof:{balance:number;equity:number;openPositions:number}){
  const s=this.state;if(s.status!=='AWAITING_PHASE_RESET'||token!==s.resetToken||at<s.through||proof.openPositions!==0||proof.balance!==s.initialBalance||proof.equity!==s.initialBalance||!this.profile.phases[s.phase+1])throw Error('PROP_PHASE_RESET_PROOF_REQUIRED');
  s.phase++;s.phaseStart=at;s.through=at;s.day='';s.dayStart=s.initialBalance;s.dayStartEquity=s.initialBalance;s.peak=s.initialBalance;s.lastBalance=s.initialBalance;s.lastEquity=s.initialBalance;s.tradingDays=[];s.lastEntryAt=null;s.resetToken=null;s.status=this.profile.phases[s.phase].id==='FUNDED'?'FUNDED':'ACTIVE';if(s.status==='FUNDED')s.fundedAt=at;s.events.push({at,kind:'PHASE_RESET_VERIFIED',reason:this.profile.phases[s.phase].id});return this.snapshot();
 }
 payoutEligibility(o:PropEquityObservation,bestDayProfit:number,totalFundedProfit:number){
  const s=this.state,p=this.profile.payout;
  if(s.status!=='FUNDED'||s.fundedAt===null||p.waitingDays===null||p.profitSplitPct===null||p.frequency==='PENDING_VERIFICATION'||o.at<s.fundedAt+p.waitingDays*86400000||(this.profile.rules.flatRequiredForPayout&&o.openPositions!==0)||o.balance<=s.initialBalance)return {eligible:false,amount:null,reason:'PAYOUT_CONDITIONS_NOT_MET_OR_UNVERIFIED'};
  if(this.evidence.consistencyMaxBestDayFraction!==undefined&&(!(totalFundedProfit>0)||bestDayProfit/totalFundedProfit>this.evidence.consistencyMaxBestDayFraction))return {eligible:false,amount:null,reason:'CONSISTENCY_RULE'};
  const result={at:o.at,hypotheticalGrossProfit:o.balance-s.initialBalance,hypotheticalCustomerShare:(o.balance-s.initialBalance)*p.profitSplitPct/100};
  if(!s.payoutEligibility.some(v=>v.at===o.at))s.payoutEligibility.push(result);
  return {eligible:true,amount:result.hypotheticalCustomerShare,reason:'HYPOTHETICAL_ELIGIBILITY_ONLY_NOT_A_REAL_PAYOUT'};
 }
 survival(){const s=this.state;return Object.fromEntries([30,60,90,180,365].map(days=>{const horizon=s.fundedAt===null?null:s.fundedAt+days*86400000;return [days,horizon===null?null:s.failedAt!==null&&s.failedAt<=horizon?false:s.through<horizon?null:true];}));}
}
