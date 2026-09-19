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

export interface FullPropPipelineReplayInput
  extends Omit<CandidatePipelineInput, "entryOverlay" | "onTradeAccepted" | "onTradeClosed"> {
  propConfig: PropAccountConfiguration;
  propProfile: PropProgramProfile;
  propSnapshot: PropAccountSnapshot;
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
  return {
    version: "full-prop-pipeline-replay/v1" as const,
    mode: "FULL_PROP_PIPELINE_REPLAY" as const,
    pipeline: result,
    propDecisions: decisions,
    endingSnapshot: snapshot,
  };
}

export function identifyFastPropReplay() {
  return "FAST_PROP_REPLAY" as const;
}

export interface RollingFullPropReplayInput extends FullPropPipelineReplayInput {
  attempts: number;
  windowDays: number;
  cadenceDays: number;
  fundedSurvivalDays: number;
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
    return {id:`rolling:${index}:${from}`,from:new Date(from).toISOString(),to:new Date(to).toISOString(),initialBalance:snapshot.startingBalance,pipelineRunHash:pipeline.pipeline.runHash,challenge,funded,payout,maxDrawdownPct:drawdown};
  });
  const passes=attempts.filter(attempt=>attempt.challenge.status==="FUNDED"),failures=attempts.filter(attempt=>attempt.challenge.status==="FAILED");
  const passDays=passes.map(attempt=>attempt.challenge.phase1.tradingDays+(attempt.challenge.verification?.tradingDays??0)).sort((a,b)=>a-b);
  const ranked=[...attempts].sort((a,b)=>a.maxDrawdownPct-b.maxDrawdownPct||a.from.localeCompare(b.from));
  const failureReasons=attempts.flatMap(attempt=>[...attempt.challenge.phase1.reasonCodes,...(attempt.challenge.verification?.reasonCodes??[])]).reduce<Record<string,number>>((out,reason)=>(out[reason]=(out[reason]??0)+1,out),{});
  return Object.freeze({version:"rolling-full-prop-challenges/v1" as const,evidenceType:"CANONICAL_FULL_PIPELINE" as const,requestedAttempts:input.attempts,validAvailableAttempts,actuallyRun:attempts.length,attemptCount:attempts.length,completedCount:passes.length+failures.length,passCount:passes.length,failCount:failures.length,incompleteCount:attempts.length-passes.length-failures.length,historicalPassRate:attempts.length?passes.length/attempts.length*100:0,meanDaysToPass:passDays.length?passDays.reduce((a,b)=>a+b,0)/passDays.length:null,medianDaysToPass:passDays.length?passDays[Math.floor(passDays.length/2)]:null,passTimeDistribution:Object.freeze(passDays),dailyLossViolations:attempts.filter(x=>JSON.stringify(x.challenge).includes("FAILED_DAILY_LOSS")).length,maxLossViolations:attempts.filter(x=>JSON.stringify(x.challenge).includes("FAILED_MAX_LOSS")).length,failureReasons:Object.freeze(failureReasons),fundedSurvivalRate:passes.length?passes.filter(x=>x.funded?.survived).length/passes.length*100:0,payoutEvidenceCount:passes.filter(x=>x.payout&&x.payout.events.length>0).length,maxDrawdownDistribution:Object.freeze(attempts.map(x=>x.maxDrawdownPct).sort((a,b)=>a-b)),bestHistoricalStart:ranked[0]?.from??null,worstHistoricalStart:ranked.at(-1)?.from??null,sampleWarnings:Object.freeze([...(attempts.length<25?["LOW_MULTI_CHALLENGE_SAMPLE"]:[]),...(attempts.length<input.attempts?["REQUESTED_ATTEMPTS_CAPPED_BY_HISTORY"]:[])]),attempts:Object.freeze(attempts)});
}
