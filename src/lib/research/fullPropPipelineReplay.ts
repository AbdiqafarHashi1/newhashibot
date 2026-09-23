import {
  evaluatePropExecutionGate,
  evaluateFunded,
  fundedSnapshotsFromTrades,
  simulateFullChallenge,
  simulateFundedSurvival,
  simulatePayoutCycle,
  type PropAccountConfiguration,
  type PropAccountSnapshot,
  type PropProgramProfile,
} from "../prop/professionalPropEngine";
import {
  runCandidatePipelineReplay,
  type CandidatePipelineInput,
} from "./canonicalPipelineReplay";
import type { HistoricalSignal, ReplayLineage } from "./historicalReplay";

export interface FullPropPipelineReplayInput
  extends Omit<CandidatePipelineInput, "entryOverlay" | "onTradeAccepted" | "onTradeClosed"> {
  propConfig: PropAccountConfiguration;
  propProfile: PropProgramProfile;
  propSnapshot: PropAccountSnapshot;
}

const TF_MS: Record<string, number> = { "1m":60_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"1h":3_600_000,"4h":14_400_000,"1d":86_400_000 };
function profileDay(timestamp:string,timezone:string,resetTime:string){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));
  const clock=`${parts.hour}:${parts.minute}`,date=`${parts.year}-${parts.month}-${parts.day}`;
  if(clock>=resetTime)return date;
  const prior=new Date(`${date}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()-1);return prior.toISOString().slice(0,10);
}
function intratradeEvidence(input:FullPropPipelineReplayInput,pipeline:ReturnType<typeof runCandidatePipelineReplay>){
  const feesIncluded=input.propProfile.rules.feesIncluded||input.propProfile.rules.commissionIncluded||input.propProfile.rules.swapIncluded;
  return pipeline.accepted.map(trade=>{
    const candidates=input.datasets.filter(d=>d.symbol===trade.candidate.symbol&&TF_MS[d.timeframe]<TF_MS[trade.candidate.primaryTimeframe]).sort((a,b)=>TF_MS[a.timeframe]-TF_MS[b.timeframe]);
    const source=candidates[0]??input.datasets.find(d=>d.symbol===trade.candidate.symbol&&d.timeframe===trade.candidate.primaryTimeframe);
    const bars=source?.bars.filter(b=>b.timestamp+TF_MS[source.timeframe]>=Date.parse(trade.result.openedAt)&&b.timestamp<=Date.parse(trade.result.closedAt))??[];
    const quantity=trade.result.fill.quantity,sign=trade.candidate.side==="BUY"?1:-1,fee=feesIncluded?trade.result.costs.spread+trade.result.costs.slippage+trade.result.costs.commission+trade.result.costs.financing:0;
    let mae=0,mfe=0,equityLow=trade.accountBefore.equity,equityHigh=trade.accountBefore.equity;const ambiguous=[] as Array<{timestamp:string;timeframe:string;ohlc:{open:number;high:number;low:number;close:number};possibleEventA:string;possibleEventB:string;reason:string}>;
    for(const bar of bars){const adverse=trade.candidate.side==="BUY"?trade.candidate.entry-bar.low:bar.high-trade.candidate.entry,favorable=trade.candidate.side==="BUY"?bar.high-trade.candidate.entry:trade.candidate.entry-bar.low;mae=Math.max(mae,adverse*quantity);mfe=Math.max(mfe,favorable*quantity);const lowPnl=sign*((trade.candidate.side==="BUY"?bar.low:bar.high)-trade.candidate.entry)*quantity-fee,highPnl=sign*((trade.candidate.side==="BUY"?bar.high:bar.low)-trade.candidate.entry)*quantity-fee;equityLow=Math.min(equityLow,trade.accountBefore.equity+lowPnl);equityHigh=Math.max(equityHigh,trade.accountBefore.equity+highPnl);const stop=trade.candidate.side==="BUY"?bar.low<=trade.candidate.stop:bar.high>=trade.candidate.stop,target=trade.candidate.targets.some(t=>trade.candidate.side==="BUY"?bar.high>=t:bar.low<=t);if(stop&&target)ambiguous.push({timestamp:new Date(bar.timestamp).toISOString(),timeframe:source!.timeframe,ohlc:{open:bar.open,high:bar.high,low:bar.low,close:bar.close},possibleEventA:"PROTECTIVE STOP",possibleEventB:"PROFIT TARGET",reason:"OHLC does not reveal intrabar high/low order"})}
    const dailyLimit=input.propProfile.rules.dailyLossPct===null?null:trade.accountBefore.equity*input.propProfile.rules.dailyLossPct/100,maxLimit=input.propProfile.rules.maxLossPct===null?null:input.propConfig.accountSize*input.propProfile.rules.maxLossPct/100;
    return Object.freeze({signalId:trade.candidate.id,openedAt:trade.result.openedAt,closedAt:trade.result.closedAt,reconstructionTimeframe:source?.timeframe??null,lowerTimeframeUsed:Boolean(candidates[0]),status:!source?"INSUFFICIENT INTRADAY DATA":ambiguous.length?"AMBIGUOUS INTRABAR ORDER":"RECONSTRUCTED",mae,mfe,equityLow,equityHigh,floatingLoss:Math.max(0,trade.accountBefore.equity-equityLow),dailyLossBreach:dailyLimit!==null&&trade.accountBefore.equity-equityLow>=dailyLimit,maxLossBreach:maxLimit!==null&&input.propConfig.accountSize-equityLow>=maxLimit,feesIncluded,ambiguity:Object.freeze(ambiguous)});
  });
}

/**
 * High-fidelity mode: Prop state is evaluated before every candidate. Results
 * update account truth only when their canonical close time is processed.
 */
export function runFullPropPipelineReplay(input: FullPropPipelineReplayInput) {
  const snapshot: PropAccountSnapshot = { ...input.propSnapshot };
  const decisions: Array<{
    timestamp: string;
    candidateId: string;
    decision: "ALLOW" | "REDUCE" | "BLOCK";
    riskMultiplier: number;
    state: string;
    reasonCodes: readonly string[];
  }> = [];
  let day = snapshot.timestamp.slice(0, 10);
  const result = runCandidatePipelineReplay({
    ...input,
    entryOverlay: ({ timestamp, candidate, account }) => {
      const nextDay = timestamp.slice(0, 10);
      if (nextDay !== day) {
        day = nextDay;
        snapshot.startOfDayBalance = snapshot.balance;
        snapshot.dailyClosedPnl = 0;
      }
      snapshot.timestamp = timestamp;
      snapshot.balance = account.balance;
      snapshot.equity = account.equity;
      snapshot.openRisk = account.currentOpenRisk;
      const gate = evaluatePropExecutionGate({
        config: input.propConfig,
        profile: input.propProfile,
        snapshot,
        requestedRisk: input.riskPolicy.riskPercent,
        requestedSize: 1,
      });
      const funded = evaluateFunded(input.propConfig, snapshot, input.propProfile);
      decisions.push({ timestamp, candidateId: candidate.id, decision: gate.decision, riskMultiplier: gate.riskMultiplier, state: funded.state, reasonCodes: gate.reasonCodes });
      return { decision: gate.decision, riskMultiplier: gate.riskMultiplier, reasonCodes: gate.reasonCodes, state: decisions.at(-1)!.state };
    },
    onTradeAccepted: () => { snapshot.openPositions += 1; },
    onTradeClosed: (trade) => {
      const pnl = trade.netPnl ?? 0;
      snapshot.balance += pnl;
      snapshot.equity = snapshot.balance;
      snapshot.closedPnl += pnl;
      snapshot.dailyClosedPnl += pnl;
      snapshot.openPositions = Math.max(0, snapshot.openPositions - 1);
    },
  });
  const intratrade=intratradeEvidence(input,result);
  const profileVerified=input.propProfile.rules.dstBehavior!=="PENDING_VERIFICATION";
  const dayTimeline=Object.values(result.accepted.reduce<Record<string,{date:string;startingReference:number;endingBalance:number;endingEquity:number;lowEquity:number;highEquity:number;realizedPnl:number;floatingEquityLow:number;signals:number;trades:number;breaches:string[]}>>((days,trade)=>{const date=profileVerified?profileDay(trade.acceptedAt,input.propProfile.rules.resetTimezone,input.propProfile.rules.resetTime):"PROFILE RULE NOT VERIFIED",row=days[date]??{date,startingReference:trade.accountBefore.balance,endingBalance:trade.accountBefore.balance,endingEquity:trade.accountBefore.equity,lowEquity:trade.accountBefore.equity,highEquity:trade.accountBefore.equity,realizedPnl:0,floatingEquityLow:trade.accountBefore.equity,signals:0,trades:0,breaches:[]},e=intratrade.find(x=>x.signalId===trade.candidate.id)!;row.signals++;row.trades++;row.realizedPnl+=trade.result.netPnl??0;row.endingBalance+=trade.result.netPnl??0;row.endingEquity=row.endingBalance;row.lowEquity=Math.min(row.lowEquity,e.equityLow);row.highEquity=Math.max(row.highEquity,e.equityHigh);row.floatingEquityLow=Math.min(row.floatingEquityLow,e.equityLow);if(e.dailyLossBreach)row.breaches.push("DAILY LOSS BREACH");if(e.maxLossBreach)row.breaches.push("MAXIMUM LOSS BREACH");days[date]=row;return days},{}));
  const ambiguity=intratrade.some(x=>x.status==="AMBIGUOUS INTRABAR ORDER"),breach=intratrade.some(x=>x.dailyLossBreach||x.maxLossBreach);
  return {
    version: "full-prop-pipeline-replay/v1" as const,
    mode: "FULL_PROP_PIPELINE_REPLAY" as const,
    pipeline: result,
    propDecisions: decisions,
    endingSnapshot: snapshot,
    propProfile:input.propProfile,
    propConfig:input.propConfig,
    intratradeEvidence:Object.freeze(intratrade),dayTimeline:Object.freeze(dayTimeline),profileResetEvidence:Object.freeze({timezone:input.propProfile.rules.resetTimezone,resetTime:input.propProfile.rules.resetTime,dstBehavior:input.propProfile.rules.dstBehavior,status:profileVerified?"VERIFIED_PROFILE_SEMANTICS":"PROFILE RULE NOT VERIFIED"}),resultState:ambiguity?"AMBIGUOUS" as const:breach?"FAILED" as const:profileVerified?"INCOMPLETE" as const:"INCOMPLETE" as const,
  };
}

export function identifyFastPropReplay() {
  return "FAST_PROP_REPLAY" as const;
}

export interface PropReplayFromCanonicalSignalsInput {
  pipeline: ReturnType<typeof runCandidatePipelineReplay>;
  signals: readonly HistoricalSignal[];
  lineage: ReplayLineage;
  datasets: FullPropPipelineReplayInput["datasets"];
  propConfig: PropAccountConfiguration;
  propProfile: PropProgramProfile;
  propSnapshot: PropAccountSnapshot;
}

function assertCanonicalSignal(trade:ReturnType<typeof runCandidatePipelineReplay>["accepted"][number],signal:HistoricalSignal,lineage:ReplayLineage){
  const actual={signalId:signal.signal.signal_id,candidateId:trade.candidate.id,strategyId:signal.signal.strategy_id,strategyVersion:signal.strategyVersion,configurationVersion:signal.configurationVersion,symbol:signal.signal.symbol,side:signal.signal.direction,entry:signal.signal.entry_price,stopLoss:signal.signal.stop_loss,tp1:signal.signal.tp1,tp2:signal.signal.tp2,timestamp:signal.signal.created_at};
  const expected={signalId:trade.candidate.id,candidateId:trade.candidate.id,strategyId:trade.candidate.strategyId,strategyVersion:trade.candidate.strategyVersion,configurationVersion:trade.result.configurationVersion,symbol:trade.candidate.symbol,side:trade.candidate.side,entry:trade.candidate.entry,stopLoss:trade.candidate.stop,tp1:trade.candidate.targets[0],tp2:trade.candidate.targets[1]??null,timestamp:trade.acceptedAt};
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("PROP_CANONICAL_SIGNAL_MISMATCH");
  if(signal.lineage.campaignId!==lineage.campaignId||signal.lineage.campaignHash!==lineage.campaignHash||JSON.stringify(signal.lineage.datasetHashes)!==JSON.stringify(lineage.datasetHashes))throw new Error("PROP_CANONICAL_SIGNAL_MISMATCH");
}

/** Strict Phase B path: applies Prop policy to an immutable, prebuilt signal stream. */
export function runPropReplayFromCanonicalSignals(input:PropReplayFromCanonicalSignalsInput){
  if(input.pipeline.accepted.length!==input.signals.length)throw new Error("PROP_CANONICAL_SIGNAL_MISMATCH");
  const snapshot:PropAccountSnapshot={...input.propSnapshot},decisions:any[]=[],executedTrades:Array<(typeof input.pipeline.trades)[number]>=[],allowed=new Set<string>(),pending:Array<{trade:(typeof input.pipeline.accepted)[number];pnl:number}>=[];
  const closeThrough=(timestamp:string)=>{for(const item of pending.filter(x=>x.trade.closedAt<=timestamp).sort((a,b)=>a.trade.closedAt.localeCompare(b.trade.closedAt))){snapshot.balance+=item.pnl;snapshot.equity=snapshot.balance;snapshot.closedPnl+=item.pnl;snapshot.dailyClosedPnl+=item.pnl;snapshot.openPositions=Math.max(0,snapshot.openPositions-1);snapshot.tradingDays+=1;pending.splice(pending.indexOf(item),1)}};
  for(const [index,trade] of [...input.pipeline.accepted].sort((a,b)=>a.acceptedAt.localeCompare(b.acceptedAt)||a.candidate.symbol.localeCompare(b.candidate.symbol)).entries()){
    const signal=input.signals[index];assertCanonicalSignal(trade,signal,input.lineage);closeThrough(signal.signal.created_at);snapshot.timestamp=signal.signal.created_at;
    const gate=evaluatePropExecutionGate({config:input.propConfig,profile:input.propProfile,snapshot,requestedRisk:trade.plan.risk.riskPercent,requestedSize:trade.result.fill.quantity});
    decisions.push(Object.freeze({signal,candidateId:trade.candidate.id,decision:gate.decision,riskMultiplier:gate.riskMultiplier,state:evaluateFunded(input.propConfig,snapshot,input.propProfile).state,reasonCodes:gate.reasonCodes}));
    if(gate.decision==="BLOCK")continue;allowed.add(trade.candidate.id);executedTrades.push(trade.result);snapshot.openPositions+=1;pending.push({trade,pnl:(trade.result.netPnl??0)*gate.riskMultiplier});
  }
  closeThrough("9999-12-31T23:59:59Z");
  const evidence=intratradeEvidence({datasets:input.datasets,propConfig:input.propConfig,propProfile:input.propProfile} as FullPropPipelineReplayInput,input.pipeline).filter(x=>allowed.has(x.signalId));
  const ambiguity=evidence.some(x=>x.status==="AMBIGUOUS INTRABAR ORDER"),breach=evidence.some(x=>x.dailyLossBreach||x.maxLossBreach);
  return Object.freeze({version:"prop-from-canonical-signals/v1" as const,authority:"professionalPropEngine.evaluatePropExecutionGate" as const,sourcePipelineHash:input.pipeline.runHash,propConfig:Object.freeze({...input.propConfig}),propProfile:Object.freeze({...input.propProfile}),signals:input.signals,propDecisions:Object.freeze(decisions),executedTrades:Object.freeze(executedTrades),endingSnapshot:Object.freeze(snapshot),intratradeEvidence:Object.freeze(evidence),resultState:ambiguity?"AMBIGUOUS" as const:breach?"FAILED" as const:"INCOMPLETE" as const});
}

export interface RollingCanonicalPropInput extends PropReplayFromCanonicalSignalsInput {attempts:number;windowDays:number;cadenceDays:number;fundedSurvivalDays:number;progressLabel?:string}
export function runRollingPropChallengesFromCanonicalSignals(input:RollingCanonicalPropInput){
  const ordered=[...input.signals].sort((a,b)=>a.signal.created_at.localeCompare(b.signal.created_at)),first=Date.parse(ordered[0]?.signal.created_at??""),last=Date.parse(ordered.at(-1)?.signal.created_at??"");if(!Number.isFinite(first)||!Number.isFinite(last))return Object.freeze({requestedAttempts:input.attempts,validAvailableAttempts:0,actuallyRun:0,attempts:Object.freeze([]),passCount:0,failCount:0,incompleteCount:0,ambiguousCount:0,fundedSurvivalRate:0,payoutEvidenceCount:0});
  const windowMs=input.windowDays*86400000,cadenceMs=input.cadenceDays*86400000,available=Math.max(0,Math.floor((last-first-windowMs)/cadenceMs)+1),count=Math.min(input.attempts,available),attempts=Array.from({length:count},(_,index)=>{const from=first+index*cadenceMs,to=from+windowMs,signals=ordered.filter(x=>Date.parse(x.signal.created_at)>=from&&Date.parse(x.signal.created_at)<=to),ids=new Set(signals.map(x=>x.signal.signal_id)),accepted=input.pipeline.accepted.filter(x=>ids.has(x.candidate.id)),pipeline={...input.pipeline,accepted,trades:accepted.map(x=>x.result),rejected:input.pipeline.rejected.filter(x=>Date.parse(x.timestamp)>=from&&Date.parse(x.timestamp)<=to)};const snapshot={...input.propSnapshot,timestamp:new Date(from).toISOString(),startingBalance:input.propConfig.accountSize,balance:input.propConfig.accountSize,equity:input.propConfig.accountSize,startOfDayBalance:input.propConfig.accountSize,closedPnl:0,floatingPnl:0,dailyClosedPnl:0,openRisk:0,openPositions:0,pendingExecutableOrders:0,tradingDays:0,brokerTruth:false};const replay=runPropReplayFromCanonicalSignals({...input,pipeline,signals,propSnapshot:snapshot}),challenge=simulateFullChallenge(input.propProfile,input.propConfig,replay.executedTrades.map(trade=>({id:trade.tradeId,closedAt:trade.closedAt,netPnl:trade.netPnl??0,provenance:"HISTORICAL_SIMULATION" as const}))),later=input.pipeline.accepted.filter(x=>Date.parse(x.acceptedAt)>to&&Date.parse(x.acceptedAt)<=to+input.fundedSurvivalDays*86400000).map(x=>({id:x.result.tradeId,closedAt:x.result.closedAt,netPnl:x.result.netPnl??0,provenance:"HISTORICAL_SIMULATION" as const})),fundedSnapshots=fundedSnapshotsFromTrades(input.propConfig,later,input.fundedSurvivalDays),funded=challenge.status==="FUNDED"?simulateFundedSurvival(input.propConfig,input.propProfile,fundedSnapshots):null,payout=challenge.status==="FUNDED"?simulatePayoutCycle(input.propConfig,input.propProfile,fundedSnapshots):null,resultState=replay.resultState==="AMBIGUOUS"?"AMBIGUOUS" as const:challenge.status==="FAILED"?"FAILED" as const:challenge.status==="FUNDED"?"PASSED" as const:"INCOMPLETE" as const;return Object.freeze({id:`canonical:${index}:${from}`,from:new Date(from).toISOString(),to:new Date(to).toISOString(),signalIds:Object.freeze(signals.map(x=>x.signal.signal_id)),initialBalance:snapshot.startingBalance,endingBalance:replay.endingSnapshot.balance,resultState,replay,challenge,funded,payout})});
  const passes=attempts.filter(x=>x.resultState==="PASSED"),failed=attempts.filter(x=>x.resultState==="FAILED"),incomplete=attempts.filter(x=>x.resultState==="INCOMPLETE"),ambiguous=attempts.filter(x=>x.resultState==="AMBIGUOUS"),determinate=passes.length+failed.length,passDays=passes.map(x=>x.challenge.phase1.tradingDays+(x.challenge.verification?.tradingDays??0));return Object.freeze({requestedAttempts:input.attempts,validAvailableAttempts:available,actuallyRun:attempts.length,attemptCount:attempts.length,attempts:Object.freeze(attempts),passCount:passes.length,failCount:failed.length,incompleteCount:incomplete.length,ambiguousCount:ambiguous.length,historicalPassRate:attempts.length?passes.length/attempts.length*100:0,determinatePassRate:determinate?passes.length/determinate*100:0,dailyLossViolations:failed.filter(x=>JSON.stringify(x.challenge).includes("DAILY_LOSS")).length,maxLossViolations:failed.filter(x=>JSON.stringify(x.challenge).includes("MAX_LOSS")).length,fundedSurvivalRate:passes.length?passes.filter(x=>x.funded?.survived).length/passes.length*100:0,payoutEvidenceCount:passes.filter(x=>x.payout?.events.length).length,passTimeDistribution:Object.freeze(passDays),maxDrawdownDistribution:Object.freeze([] as number[]),bestHistoricalStart:attempts[0]?.from??null,worstHistoricalStart:attempts.at(-1)?.from??null});
}

export interface RollingFullPropReplayInput extends FullPropPipelineReplayInput {
  attempts: number;
  windowDays: number;
  cadenceDays: number;
  fundedSurvivalDays: number;
  progressLabel?: string;
}

/**
 * Replays independent raw-bar challenge starts. Each window creates a fresh
 * pipeline account and Prop snapshot; no accepted result or mutable balance is
 * shared between attempts.
 */
export function runRollingFullPropChallenges(input:RollingFullPropReplayInput){
  if(!Number.isInteger(input.attempts)||input.attempts<1||input.attempts>1000)throw new Error("INVALID_ATTEMPT_COUNT");
  if(!Number.isInteger(input.windowDays)||input.windowDays<1||!Number.isInteger(input.cadenceDays)||input.cadenceDays<1)throw new Error("INVALID_ROLLING_WINDOW");
  const timestamps=input.datasets.flatMap(dataset=>dataset.bars.map(bar=>bar.timestamp)).sort((a,b)=>a-b);
  if(!timestamps.length)throw new Error("ROLLING_HISTORY_EMPTY");
  const first=timestamps[0],last=timestamps.at(-1)!,windowMs=input.windowDays*86_400_000,cadenceMs=input.cadenceDays*86_400_000;
  const validAvailableAttempts=Math.max(0,Math.floor((last-first-windowMs)/cadenceMs)+1),attemptsToRun=Math.min(input.attempts,validAvailableAttempts);
  const attempts=Array.from({length:attemptsToRun},(_,index)=>{
    if(index===0||(index+1)%25===0||index+1===attemptsToRun)console.log(`[PROP] ${input.progressLabel??input.strategyIds.join(",")} ${index+1}/${attemptsToRun} attempts`);
    const from=first+index*cadenceMs,to=from+windowMs;
    const datasets=input.datasets.map(dataset=>({...dataset,bars:dataset.bars.filter(bar=>bar.timestamp>=from&&bar.timestamp<=to)}));
    const snapshot:PropAccountSnapshot={...input.propSnapshot,timestamp:new Date(from).toISOString(),startingBalance:input.propConfig.accountSize,balance:input.propConfig.accountSize,equity:input.propConfig.accountSize,startOfDayBalance:input.propConfig.accountSize,closedPnl:0,floatingPnl:0,dailyClosedPnl:0,openRisk:0,openPositions:0,pendingExecutableOrders:0,tradingDays:0,brokerTruth:false};
    const pipeline=runFullPropPipelineReplay({...input,datasets,initialAccount:{...input.initialAccount,balance:input.propConfig.accountSize,equity:input.propConfig.accountSize,availableCapital:input.propConfig.accountSize,currentOpenRisk:0,dailyLoss:0,drawdownPercent:0,exposedSymbols:[]},propSnapshot:snapshot});
    const evidence=pipeline.pipeline.trades.map(trade=>({id:trade.tradeId,closedAt:trade.closedAt,netPnl:trade.netPnl??0,provenance:"HISTORICAL_SIMULATION" as const}));
    const challenge=simulateFullChallenge(input.propProfile,input.propConfig,evidence);
    const fundedSource=challenge.remainingTrades;
    const fundedSnapshots=fundedSnapshotsFromTrades(input.propConfig,fundedSource,input.fundedSurvivalDays);
    const funded=challenge.status==="FUNDED"?simulateFundedSurvival(input.propConfig,input.propProfile,fundedSnapshots):null;
    const payout=challenge.status==="FUNDED"?simulatePayoutCycle(input.propConfig,input.propProfile,fundedSnapshots):null;
    const drawdown=Math.max(challenge.phase1.maxDrawdownPct,challenge.verification?.maxDrawdownPct??0,funded?.maxDrawdown??0);
    const resultState=pipeline.resultState==="AMBIGUOUS"?"AMBIGUOUS" as const:pipeline.intratradeEvidence.some(x=>x.dailyLossBreach||x.maxLossBreach)||challenge.status==="FAILED"?"FAILED" as const:challenge.status==="FUNDED"?"PASSED" as const:"INCOMPLETE" as const;
    return {id:`rolling:${index}:${from}`,from:new Date(from).toISOString(),to:new Date(to).toISOString(),initialBalance:snapshot.startingBalance,pipelineRunHash:pipeline.pipeline.runHash,challenge,funded,payout,maxDrawdownPct:drawdown,resultState,pipeline};
  });
  const passes=attempts.filter(attempt=>attempt.resultState==="PASSED"),failures=attempts.filter(attempt=>attempt.resultState==="FAILED"),ambiguous=attempts.filter(attempt=>attempt.resultState==="AMBIGUOUS"),incomplete=attempts.filter(attempt=>attempt.resultState==="INCOMPLETE");
  const passDays=passes.map(attempt=>attempt.challenge.phase1.tradingDays+(attempt.challenge.verification?.tradingDays??0)).sort((a,b)=>a-b);
  const ranked=[...attempts].sort((a,b)=>a.maxDrawdownPct-b.maxDrawdownPct||a.from.localeCompare(b.from));
  const failureReasons=attempts.flatMap(attempt=>[...attempt.challenge.phase1.reasonCodes,...(attempt.challenge.verification?.reasonCodes??[])]).reduce<Record<string,number>>((out,reason)=>(out[reason]=(out[reason]??0)+1,out),{});
  return Object.freeze({version:"rolling-full-prop-challenges/v2" as const,evidenceType:"CANONICAL_FULL_PIPELINE" as const,requestedAttempts:input.attempts,validAvailableAttempts,actuallyRun:attempts.length,attemptCount:attempts.length,completedCount:passes.length+failures.length,passCount:passes.length,failCount:failures.length,incompleteCount:incomplete.length,ambiguousCount:ambiguous.length,historicalPassRate:attempts.length?passes.length/attempts.length*100:0,determinatePassRate:passes.length+failures.length?passes.length/(passes.length+failures.length)*100:0,meanDaysToPass:passDays.length?passDays.reduce((a,b)=>a+b,0)/passDays.length:null,medianDaysToPass:passDays.length?passDays[Math.floor(passDays.length/2)]:null,passTimeDistribution:Object.freeze(passDays),dailyLossViolations:attempts.filter(x=>x.pipeline.intratradeEvidence.some(e=>e.dailyLossBreach)||JSON.stringify(x.challenge).includes("FAILED_DAILY_LOSS")).length,maxLossViolations:attempts.filter(x=>x.pipeline.intratradeEvidence.some(e=>e.maxLossBreach)||JSON.stringify(x.challenge).includes("FAILED_MAX_LOSS")).length,failureReasons:Object.freeze(failureReasons),fundedSurvivalRate:passes.length?passes.filter(x=>x.funded?.survived).length/passes.length*100:0,payoutEvidenceCount:passes.filter(x=>x.payout&&x.payout.events.length>0).length,maxDrawdownDistribution:Object.freeze(attempts.map(x=>x.maxDrawdownPct).sort((a,b)=>a-b)),dailyDrawdownDistribution:Object.freeze(attempts.flatMap(x=>x.pipeline.dayTimeline.map(d=>(d.startingReference-d.lowEquity)/d.startingReference*100)).sort((a,b)=>a-b)),bestHistoricalStart:ranked[0]?.from??null,worstHistoricalStart:ranked.at(-1)?.from??null,sampleWarnings:Object.freeze([...(attempts.length<25?["LOW_MULTI_CHALLENGE_SAMPLE"]:[]),...(attempts.length<input.attempts?["REQUESTED_ATTEMPTS_CAPPED_BY_HISTORY"]:[])]),attempts:Object.freeze(attempts)});
}
