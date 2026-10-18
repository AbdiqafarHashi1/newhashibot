/** Offline scenario accounting. No order execution and no provider leverage permission. */
export interface ScenarioTrade {id:string;symbol:string;openedAt:string;closedAt:string;entry:number;stop:number;netR:number;costR:number;worstAdverseR:number;gapAdverseR:number;strategyId:string}
export interface ScenarioPolicy {initialEquity:number;riskPct:number;leverage:number;mode:'RISK_CAPPED'|'MAX_MARGIN';marginUtilization:number;maintenanceMarginRate:number;dailyLockPct:number;totalLossPct:number;firmDailyLossPct?:number;profitTargetPct?:number;minTradingDays?:number}
export function simulateResearchAccount(input:readonly ScenarioTrade[],p:ScenarioPolicy){
 if(![p.initialEquity,p.riskPct,p.leverage,p.marginUtilization].every(x=>Number.isFinite(x)&&x>0)||p.marginUtilization>1||p.riskPct>100||p.maintenanceMarginRate<0||p.maintenanceMarginRate>=1/p.leverage)throw Error('INVALID_RESEARCH_ACCOUNT_POLICY');
 let equity=p.initialEquity,peak=equity,drawdown=0,liquidations=0,blocked=0,dailyLocked=0,until=-Infinity;const lockedDays=new Set<string>(),days=new Map<string,number>(),tradingDays=new Set<string>(),trace:{id:string;at:string;equity:number;riskPct:number;notional:number;liquidated:boolean}[]=[];let status='COMPLETED';
 for(const t of [...input].sort((a,b)=>Date.parse(a.openedAt)-Date.parse(b.openedAt)||a.id.localeCompare(b.id))){
  if(![t.entry,t.stop,t.netR,t.costR,t.worstAdverseR,t.gapAdverseR].every(Number.isFinite)||t.entry<=0||t.entry===t.stop||Date.parse(t.closedAt)<Date.parse(t.openedAt))throw Error('INVALID_SCENARIO_TRADE');
  if(Date.parse(t.openedAt)<=until){blocked++;continue;}
  const day=t.openedAt.slice(0,10),dayStart=days.get(day)??equity;days.set(day,dayStart);
  if(lockedDays.has(day)||(dayStart-equity)/p.initialEquity*100>=p.dailyLockPct){dailyLocked++;continue;}
  const stopFraction=Math.abs(t.entry-t.stop)/t.entry,cap=equity*p.leverage*p.marginUtilization,notional=p.mode==='RISK_CAPPED'?Math.min(equity*p.riskPct/100/stopFraction,cap):cap,risk=notional*stopFraction,margin=notional/p.leverage,liqFraction=1/p.leverage-p.maintenanceMarginRate,liqR=liqFraction/stopFraction;
  if(p.mode==="RISK_CAPPED"&&((dayStart-equity)+risk*(1+t.costR))/p.initialEquity*100>p.dailyLockPct){dailyLocked++;continue;}
  // Approximate isolated liquidation, not native exchange mark-price or risk-tier certification.
  const liquidated=(liqR<1&&t.worstAdverseR>=liqR)||t.gapAdverseR>=liqR;
  const pnl=liquidated?-margin-risk*t.costR:risk*t.netR,adverseLoss=liquidated?margin+risk*t.costR:risk*(Math.min(t.worstAdverseR,Math.max(1,t.gapAdverseR))+t.costR),intradayLow=equity-adverseLoss;
  drawdown=Math.max(drawdown,(peak-intradayLow)/p.initialEquity*100);
  equity+=pnl;peak=Math.max(peak,equity);until=Date.parse(t.closedAt);tradingDays.add(day);liquidations+=+liquidated;
  trace.push({id:t.id,at:t.closedAt,equity,riskPct:risk/Math.max(equity-pnl,1e-9)*100,notional,liquidated});
  if(p.firmDailyLossPct!==undefined&&(dayStart-intradayLow)/p.initialEquity*100>=p.firmDailyLossPct){status='FAILED_DAILY_LOSS';break;}
  if((p.initialEquity-intradayLow)/p.initialEquity*100>=p.totalLossPct||equity<=0){status='FAILED_TOTAL_LOSS';break;}
  if((dayStart-intradayLow)/p.initialEquity*100>=p.dailyLockPct){status='DAILY_LOCK_OBSERVED';lockedDays.add(day);}
  if(p.profitTargetPct!==undefined&&(equity-p.initialEquity)/p.initialEquity*100>=p.profitTargetPct&&tradingDays.size>=(p.minTradingDays??0)){status='TARGET_REACHED';break;}
 }
 return {status,endingEquity:equity,returnPct:(equity-p.initialEquity)/p.initialEquity*100,maxIntrabarDrawdownPct:drawdown,trades:trace.length,liquidations,overlapBlocked:blocked,dailyLocked,tradingDays:tradingDays.size,maximumObservedRiskPct:Math.max(0,...trace.map(t=>t.riskPct)),trace};
}
export function repeatedResearchChallenges(trades:readonly ScenarioTrade[],policy:ScenarioPolicy,attempts=100,windowDays=30){
 if(!Number.isInteger(attempts)||attempts<1||attempts>1000)throw Error('INVALID_CHALLENGE_ATTEMPTS');
 const sorted=[...trades].sort((a,b)=>a.openedAt.localeCompare(b.openedAt)),starts=[...new Set(sorted.map(t=>t.openedAt))],end=Date.parse(sorted.at(-1)?.closedAt??'');
 const eligible=starts.filter(t=>Date.parse(t)+windowDays*86400000<=end),selected=eligible.length<=attempts?eligible:Array.from({length:attempts},(_,i)=>eligible[Math.floor(i*(eligible.length-1)/(attempts-1))]);
 const windows=selected.map(start=>{const stop=Date.parse(start)+windowDays*86400000,rows=sorted.filter(t=>Date.parse(t.openedAt)>=Date.parse(start)&&Date.parse(t.closedAt)<=stop),phase1=simulateResearchAccount(rows,{...policy,profitTargetPct:10,minTradingDays:4});let phase2:ReturnType<typeof simulateResearchAccount>|null=null;if(phase1.status==='TARGET_REACHED'){const last=phase1.trace.at(-1)!.at;phase2=simulateResearchAccount(rows.filter(t=>t.openedAt>last),{...policy,profitTargetPct:5,minTradingDays:4});}return {start,status:phase2?.status==='TARGET_REACHED'?'SIMULATED_TWO_PHASE_PASS':phase1.status.startsWith('FAILED')||phase2?.status.startsWith('FAILED')?'FAILED':'INCOMPLETE',phase1:{...phase1,trace:undefined},phase2:phase2?{...phase2,trace:undefined}:null};});
 return {requestedAttempts:attempts,actualAttempts:windows.length,windowDays,overlapDisclosure:'Distinct chronological starts; windows overlap and are not independent trials.',firmCompliance:'CUSTOM_HYPOTHETICAL_RULES_NOT_A_FIRM_CLEARANCE',newsAndBrokerRulesVerified:false,passes:windows.filter(w=>w.status==='SIMULATED_TWO_PHASE_PASS').length,failures:windows.filter(w=>w.status==='FAILED').length,incomplete:windows.filter(w=>w.status==='INCOMPLETE').length,windows};
}
