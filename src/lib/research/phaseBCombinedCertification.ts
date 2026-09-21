import type { AccountExecutionContext, AccountPolicy } from "../../../supabase/functions/_shared/account-execution-brain/index.ts";
import type { PropAccountConfiguration, PropAccountSnapshot, PropProgramProfile } from "../prop/professionalPropEngine.ts";
import { runCandidatePipelineReplay, type CandidatePipelineInput } from "./canonicalPipelineReplay.ts";
import { replayPersonal, replaySignalOnly, type ReplayLineage } from "./historicalReplay.ts";
import { runPropReplayFromCanonicalSignals, runRollingPropChallengesFromCanonicalSignals } from "./fullPropPipelineReplay.ts";
import { arbitrationEvidence, pipelineEvidence } from "./phaseBCertification.ts";

export const PROP_ATTEMPT_TIERS=Object.freeze([10,25,50,100,200,500] as const);
export function payoutContract(profile:PropProgramProfile){
  const supportedFields=["payout.waitingDays","payout.profitSplitPct","payout.frequency","rules.flatRequiredForPayout"].filter(path=>{const [,field]=path.split(".");return path.startsWith("payout.")?(profile.payout as any)[field]!==null:(profile.rules as any)[field]!==undefined});
  const unsupportedFields=["minimumProfitableDays","profitThreshold","withdrawalBalanceAdjustment","postPayoutHighWaterMark","accountResetSemantics"];
  const complete=profile.verificationStatus==="VERIFIED"&&profile.payout.waitingDays!==null&&profile.payout.profitSplitPct!==null&&profile.payout.frequency!=="PENDING_VERIFICATION";
  return Object.freeze({supportedFields:Object.freeze(supportedFields),unsupportedFields:Object.freeze(unsupportedFields),complete});
}


export function combinedArbitrationEvidence(pipeline:ReturnType<typeof runCandidatePipelineReplay>){
  const base=arbitrationEvidence(pipeline),rows=[...pipeline.accepted.map(x=>({timestamp:x.acceptedAt,symbol:x.candidate.symbol,strategyId:x.candidate.strategyId,accepted:true})),...pipeline.rejected.map(x=>({timestamp:x.timestamp,symbol:x.symbol,strategyId:x.strategyId,accepted:false}))],groups=Object.values(rows.reduce<Record<string,typeof rows>>((out,row)=>{(out[row.timestamp]??=[]).push(row);return out},{})),sameTimestamp=groups.filter(x=>x.length>1),sameSymbol=sameTimestamp.filter(group=>new Set(group.map(x=>x.symbol)).size<group.length);
  return Object.freeze({...base,strategiesParticipating:Object.freeze([...new Set(rows.map(x=>x.strategyId))]),totalCandidates:rows.length,acceptedCandidates:pipeline.accepted.length,rejectedCandidates:pipeline.rejected.length,rejectionReasons:pipeline.rejected.flatMap(x=>x.reasonCodes).reduce<Record<string,number>>((out,reason)=>(out[reason]=(out[reason]??0)+1,out),{}),acceptedScores:Object.freeze(pipeline.accepted.map(x=>x.candidate.score)),sameTimestampCompetition:sameTimestamp.length,sameSymbolCompetition:sameSymbol.length,buySellConflicts:"CONTRACT_LIMITED" as const,rejectedAlternativeScores:"CONTRACT_LIMITED" as const,postArbitration:{...base.postArbitration,tradeCount:pipeline.trades.length,netR:pipeline.metrics.netR,symbolContribution:pipeline.metrics.symbolContribution}});
}
export function runCombinedCertification(input:{pipeline:CandidatePipelineInput;lineage:ReplayLineage;personal:{provider:"MT5_PERSONAL"|"BINANCE";policy:AccountPolicy;context:AccountExecutionContext};prop:{config:PropAccountConfiguration;profile:PropProgramProfile;snapshot:PropAccountSnapshot};attempts?:number}){
  const strategies=Object.freeze([...input.pipeline.strategyIds]);
  if(!strategies.length)return Object.freeze({status:"NO_QUALIFIED_STRATEGIES" as const,participatingStrategies:strategies});
  const pipeline=runCandidatePipelineReplay(input.pipeline),signals=replaySignalOnly(pipeline,input.lineage),personal=replayPersonal({pipeline,provider:input.personal.provider,policy:input.personal.policy,initialContext:input.personal.context});
  const prop=runPropReplayFromCanonicalSignals({pipeline,signals:signals.signals,lineage:input.lineage,datasets:input.pipeline.datasets,propConfig:input.prop.config,propProfile:input.prop.profile,propSnapshot:input.prop.snapshot});
  const canonicalIds=signals.signals.map(x=>x.signal.signal_id),personalIds=personal.decisions.map(x=>x.signal.signal_id),propConsumed=new Set(prop.propDecisions.map(x=>x.candidateId));
  if(JSON.stringify(canonicalIds)!==JSON.stringify(personalIds)||canonicalIds.some(id=>!propConsumed.has(id)))throw new Error("COMBINED_SIGNAL_LINEAGE_MISMATCH");const propIds=canonicalIds;
  const rolling=runRollingPropChallengesFromCanonicalSignals({pipeline,signals:signals.signals,lineage:input.lineage,datasets:input.pipeline.datasets,propConfig:input.prop.config,propProfile:input.prop.profile,propSnapshot:input.prop.snapshot,attempts:input.attempts??500,windowDays:90,cadenceDays:7,fundedSurvivalDays:30,progressLabel:"Combined portfolio"});
  const contract=payoutContract(input.prop.profile),passed=rolling.attempts.filter(x=>x.resultState==="PASSED"),evaluable=passed.filter(x=>x.funded!==null),cycles=passed.flatMap(x=>x.payout?.events??[]),payoutStatus=!contract.complete?"PAYOUT_MODEL_CONTRACT_LIMITED":!evaluable.length?"PAYOUT_MODEL_INSUFFICIENT_DATA":"PAYOUT_MODEL_TESTED";
  const tiers=PROP_ATTEMPT_TIERS.map(requested=>({requested,available:rolling.validAvailableAttempts,actuallyRun:Math.min(requested,rolling.actuallyRun),distinctStarts:new Set(rolling.attempts.slice(0,requested).map(x=>x.from)).size}));
  if(tiers.some(x=>x.actuallyRun!==x.distinctStarts))throw new Error("DUPLICATE_PROP_CHALLENGE_START");
  return Object.freeze({status:"COMPLETE" as const,participatingStrategies:strategies,pipeline,pipelineEvidence:pipelineEvidence(pipeline),arbitrationEvidence:combinedArbitrationEvidence(pipeline),signals,personal,prop,rolling,tiers,lineage:Object.freeze(canonicalIds.map((signalId,index)=>({signalId,candidateId:pipeline.accepted[index].candidate.id,personalSignalId:personalIds[index],propSignalId:propIds[index],campaignId:input.lineage.campaignId,campaignHash:input.lineage.campaignHash,datasetIds:pipeline.accepted[index].result.datasetIds,datasetHashes:input.lineage.datasetHashes,strategyId:pipeline.accepted[index].candidate.strategyId,strategyVersion:pipeline.accepted[index].candidate.strategyVersion,configurationVersion:pipeline.accepted[index].result.configurationVersion,outcome:pipeline.accepted[index].result.closeReason}))),payout:{contract,status:payoutStatus,payoutCycles:cycles,limitations:contract.complete?[]:contract.unsupportedFields}});
}
