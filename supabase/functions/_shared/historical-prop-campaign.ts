import {HistoricalAccountLedger,type HistoricalExecutionSpec,type HistoricalQuote} from './historical-account-ledger.ts';
import {HistoricalPropObserver} from './historical-prop-observer.ts';
import {historicalAccountScenario} from './historical-account-scenario.ts';
import {historicalAccountMetrics} from './historical-account-metrics.ts';
import {ftmoSwingProfile,ftmoSwingAccountRules,FTMO_SWING_PROGRAM} from './prop-program.ts';
import type {ConditionalSetup} from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export interface PropCampaignInput {
 inspectPayout?:boolean;bundleId?:string;strategyIds?:readonly string[];maximumPositions?:2|3;initialPhase?:'CHALLENGE'|'FUNDED';capital:number;riskPct:number;fundedRiskPct:number;start:number;end:number;costScale:number;phaseDelayHours:number;
 signals:readonly {at:number;setup:ConditionalSetup}[];bars:ReadonlyMap<number,readonly StrategyCandle[]>;specs:readonly HistoricalExecutionSpec[];
}
/** Replays the frozen canonical arbitration stream through independent real account Brains.
 * No resampling of profitable trades, fabricated daily P&L, or external trading effects. */
export function replayPropCohort(i:PropCampaignInput){
 if(i.strategyIds&&(!i.strategyIds.length||new Set(i.strategyIds).size!==i.strategyIds.length))throw Error('EXACT_PROP_STRATEGY_SELECTION_REQUIRED');
 if(i.maximumPositions!==undefined&&![2,3].includes(i.maximumPositions))throw Error('PROP_POSITION_VARIANT_REQUIRED');
 if(i.initialPhase!==undefined&&!['CHALLENGE','FUNDED'].includes(i.initialPhase))throw Error('PROP_INITIAL_PHASE_REQUIRED');
 if(![i.capital,i.riskPct,i.fundedRiskPct,i.start,i.end,i.costScale,i.phaseDelayHours].every(Number.isFinite)||i.capital<=0||i.riskPct<=0||i.riskPct>.5||i.fundedRiskPct<=0||i.fundedRiskPct>.5||i.costScale<1||i.costScale>3||i.phaseDelayHours<0||i.phaseDelayHours>168||i.end<=i.start)throw Error('BOUNDED_PROP_COHORT_REQUIRED');
 const profile=ftmoSwingProfile();if(i.initialPhase==='FUNDED')profile.phases=[profile.phases[2]];const rules=ftmoSwingAccountRules(i.capital),specs=i.specs.map(s=>({...s,commissionPerQuantityPerSide:s.commissionPerQuantityPerSide===undefined?undefined:s.commissionPerQuantityPerSide*i.costScale,feeBpsPerSide:s.feeBpsPerSide*i.costScale,slippageBps:s.slippageBps*i.costScale}));
 const makeLedger=()=>new HistoricalAccountLedger({purpose:'HISTORICAL_RESEARCH',initialCapital:i.capital,timezone:'Europe/Prague',dailyLossPct:5,overallLossPct:10,drawdown:'STATIC',dailyBasis:'INITIAL_BALANCE',stopOutMarginRatio:50,propContextModel:'CONSERVATIVE_OBSERVED_HIGH_WATER'},specs);
 let ledger=makeLedger(),cursor=0,entries=0,phaseStart=i.start,lastQuotes:HistoricalQuote[]=[],lastObserved=i.start;
 const observer=new HistoricalPropObserver(profile,i.capital,i.start,{calendarComplete:false,holdingRestrictionsVerified:true});
 const signals=new Map<number,ConditionalSetup[]>();for(const s of i.signals){if(i.strategyIds&&!i.strategyIds.includes(s.setup.strategy))continue;if(s.at<i.start||s.at>=i.end)continue;const a=signals.get(s.at)??[];a.push(s.setup);signals.set(s.at,a);}
 const phases:any[]=[],fundedDaily:Record<string,{balance:number;equity:number;entries:number}>={},phaseResetDelayMs=i.phaseDelayHours*3600000;
 const terminal=()=>['FAILED','EXPIRED','INSUFFICIENT_RULE_EVIDENCE'].includes(observer.progress().status);
 const payout={firstFundedEntryAt:null as number|null,firstRequestCandidate:null as null|{at:number;grossProfit:number;daysAfterFirstTrade:number},checkpoints:[] as {days:number;at:number;grossRealizedProfit:number;flat:boolean}[]};
 const feed=()=>{for(const point of ledger.observationsAfter(cursor)){observer.observe({...point,openPositions:point.openPositions!,newEntries:point.entries!-entries},false);entries=point.entries!;if(i.inspectPayout&&observer.progress().status==='FUNDED'){if(point.entries!>0&&payout.firstFundedEntryAt===null)payout.firstFundedEntryAt=point.at;if(payout.firstFundedEntryAt!==null){const days=(point.at-payout.firstFundedEntryAt)/86400000,profit=point.balance-i.capital;if(days>=14&&point.openPositions===0&&profit>=20&&payout.firstRequestCandidate===null)payout.firstRequestCandidate={at:point.at,grossProfit:profit,daysAfterFirstTrade:days};for(const d of [30,60,90,120,150,180])if(days>=d&&!payout.checkpoints.some(c=>c.days===d))payout.checkpoints.push({days:d,at:point.at,grossRealizedProfit:profit,flat:point.openPositions===0});}}}cursor=ledger.observationCount();};
 const template=(s:ConditionalSetup,q:HistoricalQuote,spec:HistoricalExecutionSpec)=>{
  const funded=observer.progress().status==='FUNDED',base=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:funded?'FUNDED':'CHALLENGE',capital:i.capital,riskPct:funded?i.fundedRiskPct:i.riskPct,accountId:`prop:${i.bundleId??'ALL'}:${i.initialPhase??'CHALLENGE'}:${i.capital}:${i.start}:${i.riskPct}:${i.fundedRiskPct}:${i.costScale}:${i.maximumPositions??2}:${observer.progress().phase}`})(s,q,spec);
  return {...base,configuration:{...base.configuration,maxConcurrentPositions:i.maximumPositions??2,allowedStrategies:i.strategyIds?[...i.strategyIds]:base.configuration.allowedStrategies},context:{...base.context,prop_rules:{...base.context.prop_rules!,program_id:FTMO_SWING_PROGRAM,daily_loss_cap_pct:rules.daily_loss_cap_pct,total_trailing_drawdown_cap_pct:rules.total_loss_cap_pct,min_trading_days:funded?0:4,current_trading_days:observer.progress().tradingDays,news_trading_allowed:true,weekend_holding_allowed:true}}};
 };
 const resetIfPassed=(at:number)=>{
  const state=observer.progress();if(state.status!=='AWAITING_PHASE_RESET')return false;
  phases.push({phase:profile.phases[state.phase].id,start:phaseStart,end:at,metrics:historicalAccountMetrics(ledger.snapshot(),i.capital,phaseStart,at+1)});
  phaseStart=at+Math.max(1,phaseResetDelayMs);observer.resetForNextPhase(phaseStart,state.resetToken!,{balance:i.capital,equity:i.capital,openPositions:0});ledger=makeLedger();cursor=0;entries=0;return true;
 };
 const closeTarget=(at:number,quotes:HistoricalQuote[])=>{
  const state=observer.progress(),phase=profile.phases[state.phase],s=ledger.summary();
  if(phase.profitTargetPct!==null&&state.tradingDays>=phase.minimumTradingDays&&s.equity>=i.capital*(1+phase.profitTargetPct/100)&&s.openPositions>0&&ledger.openPositionSnapshot().every(p=>quotes.some(q=>q.symbol===p.symbol))){ledger.closeResearchPhase(quotes,at);feed();}
 };
 for(let at=i.start;at<i.end;at+=300000){
  if(at<phaseStart)continue;if(terminal())break;
  const opening=i.bars.get(at)??[],closed=i.bars.get(at-300000)??[];
  if(!opening.length)continue;
  const conversion=(b:StrategyCandle,price:number)=>['USDJPY','USDCAD'].includes(b.symbol)?1/price:1;
  const quotes=opening.map(b=>({symbol:b.symbol,at,bid:b.open,ask:b.ask_open!,conversion:conversion(b,b.open)}));
  if(quotes.some(q=>!Number.isFinite(q.ask)||q.ask<q.bid))throw Error('OBSERVED_NATIVE_QUOTES_REQUIRED');
  lastQuotes=quotes;lastObserved=at;
  const active=ledger.summary().openPositions>0,hasSignals=signals.has(at);
  // Flat unchanged accounts need no duplicate 5-minute equity observations.
  if(!active&&!hasSignals)continue;
  if(active&&closed.length)ledger.observeClosedBars(closed,at,Object.fromEntries(closed.map(b=>[b.symbol,conversion(b,b.close)])));
  ledger.observeQuotes(quotes,at);
  if(at%86400000===79200000)ledger.financing(at,`carry:${at}`,Object.fromEntries(ledger.openPositionSnapshot().map(p=>[p.symbol,.0001*i.costScale*p.side])));
  feed();if(terminal())break;
  closeTarget(at,quotes);if(terminal())break;if(resetIfPassed(at))continue;
  for(const s of signals.get(at)??[]){
   const quote=quotes.find(q=>q.symbol===s.symbol),spec=specs.find(p=>p.symbol===s.symbol);if(!quote||!spec)continue;
   ledger.enter(s,quote,template(s,quote,spec));feed();if(terminal())break;
  }
  if(terminal())break;closeTarget(at,quotes);if(terminal())break;if(resetIfPassed(at))continue;
  if(observer.progress().status==='FUNDED'){const summary=ledger.summary();fundedDaily[new Date(at).toISOString().slice(0,10)]={balance:summary.balance,equity:summary.equity,entries:summary.entries};}
 }
 // Censor at the last genuinely available opening quote, never at a fabricated future mark.
 if(!terminal()&&lastObserved>=phaseStart&&lastQuotes.length){ledger.observeQuotes(lastQuotes,lastObserved);feed();}
 const state=observer.snapshot(),metrics=historicalAccountMetrics(ledger.snapshot(),i.capital,phaseStart,Math.max(phaseStart+1,lastObserved+1));
 return {bundleId:i.bundleId??'ALL_TESTED',maximumPositions:i.maximumPositions??2,initialPhase:i.initialPhase??'CHALLENGE',capital:i.capital,riskPct:i.riskPct,fundedRiskPct:i.fundedRiskPct,costScale:i.costScale,start:i.start,end:i.end,phaseDelayHours:i.phaseDelayHours,state,...(i.inspectPayout?{payoutAnalysis:payout}:{}),survival:observer.survival(),phaseResults:phases,currentPhase:profile.phases[state.phase].id,currentAccount:metrics,fundedDaily,limitations:['Frozen canonical scanner/arbitration stream; account admission is recomputed per cohort','Overlapping start dates are correlated scenarios, not independent success probabilities','Exness reference bid/ask with scenario contracts/commission/slippage/carry, not FTMO fills','Conservative simultaneous OHLC adverse equity bound; no observed tick path','No real payout, account activation or firm approval; no profit-shuffle resampling']};
}
