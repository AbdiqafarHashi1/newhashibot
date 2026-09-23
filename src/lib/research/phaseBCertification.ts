import type { CandidatePipelineResult } from "./canonicalPipelineReplay";
import { certificationHash } from "./portfolioCertification";

export const PHASE_B_POLICIES = deepFreeze({
  strategyEdge: { version:"phase-b-strategy-edge-qualification/v1", minimumTrades:30, minimumOosTrades:10, minimumOosExpectancyR:0.05, minimumOosProfitFactor:1.1, minimumWalkForwardConsistencyPct:60, minimumStressProfitFactor:1, maximumMonteCarloDrawdownR95:12, maximumLosingStreak:8, maximumSingleSymbolContributionPct:65 },
  pipeline: { version:"phase-b-pipeline-qualification/v1", minimumAcceptedTrades:20, minimumConversionPct:1, minimumExpectancyR:0, minimumProfitFactor:1, maximumDrawdownR:12 },
  arbitration: { version:"phase-b-arbitration-qualification/v1", requireNoDuplicateWinner:true, requireCompleteCompetitionEvidence:true },
  signals: { version:"phase-b-signal-qualification/v1", minimumSignals:30, minimumOosExpectancyR:0.05, minimumProfitFactor:1.1, maximumDrawdownR:12, maximumLosingStreak:8, requireStressPass:true },
  personal: { version:"phase-b-personal-qualification/v1", minimumExecuted:25, minimumReturnPct:0, maximumDailyDrawdownPct:5, maximumTotalDrawdownPct:15, maximumLocks:0, minimumReturnDrawdownRatio:0.25 },
  prop: { version:"phase-b-prop-qualification/v1", minimumAttempts:25, minimumPassed:20, minimumDeterminatePassRatePct:60, maximumDailyLossBreachRatePct:20, maximumMaxLossBreachRatePct:15, minimumFundedSurvivalRatePct:60, attempts:500, windowDays:90, cadenceDays:7, fundedSurvivalDays:30, tiers:[10,25,50,100,200,500] },
  portfolio: { version:"phase-b-portfolio-qualification/v1", requirePositiveMarginalNetR:true, requireNonWorseningDrawdown:true, maximumConcentrationPct:65 },
} as const);

function deepFreeze<T>(value:T):T { if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value as object).forEach(deepFreeze)}return value }
export const PHASE_B_POLICY_HASHES = deepFreeze(Object.fromEntries(Object.entries(PHASE_B_POLICIES).map(([key,value])=>[key,certificationHash(value,"policy")])) as Record<keyof typeof PHASE_B_POLICIES,string>);

export type LayerState = {
  strategyEdge:"PASS"|"FAIL"|"INSUFFICIENT"|"REBUILD_CANDIDATE";
  pipeline:"PASS"|"FAIL"|"CONTRACT_LIMITED";
  arbitration:"PASS"|"FAIL"|"CONTRACT_LIMITED";
  signals:"QUALIFIED"|"REJECTED"|"INSUFFICIENT";
  personal:"QUALIFIED"|"REJECTED"|"INSUFFICIENT";
  prop:"QUALIFIED"|"REJECTED"|"INSUFFICIENT"|"FUNDED_SURVIVAL_INSUFFICIENT"|"AMBIGUOUS";
  portfolio:"INCLUDED_FOR_SIGNALS"|"INCLUDED_FOR_PERSONAL"|"INCLUDED_FOR_PROP"|"EXCLUDED";
};

export function pipelineEvidence(pipeline:CandidatePipelineResult) {
  const accepted=pipeline.accepted.length,rejected=pipeline.rejected.length,total=accepted+rejected;
  const reasonCounts=pipeline.rejected.flatMap(x=>x.reasonCodes).reduce<Record<string,number>>((a,r)=>(a[r]=(a[r]??0)+1,a),{});
  const scores=pipeline.accepted.map(x=>x.candidate.score);
  return deepFreeze({evaluations:null,candidatesGenerated:total,candidateRate:null,acceptedCandidates:accepted,rejectedCandidates:rejected,rejectionReasonCounts:reasonCounts,scoreDistribution:"CONTRACT_LIMITED",acceptedScoreDistribution:scores,oneActiveSymbolRejections:reasonCounts.SYMBOL_ALREADY_ACTIVE??0,exposureCapacityRejections:Object.entries(reasonCounts).filter(([k])=>k.includes("EXPOSURE")||k.includes("RISK_LIMIT")||k.includes("CONCURRENT")).reduce((n,[,v])=>n+Number(v),0),duplicateConflictPrevention:null,acceptedToTradeConversionPct:accepted?pipeline.trades.length/accepted*100:0,expectancyR:pipeline.metrics.expectancyR,profitFactor:pipeline.metrics.profitFactor,maxDrawdownR:pipeline.metrics.maxDrawdown,contractLimited:["evaluations","NO_TRADE events","all pre-arbitration candidates","candidate rate","full score distribution","duplicate/conflict prevention"]});
}
export function qualifyPipeline(e:ReturnType<typeof pipelineEvidence>):"PASS"|"FAIL" {const p=PHASE_B_POLICIES.pipeline;return e.acceptedCandidates>=p.minimumAcceptedTrades&&e.acceptedToTradeConversionPct>=p.minimumConversionPct&&e.expectancyR>=p.minimumExpectancyR&&(e.profitFactor??0)>=p.minimumProfitFactor&&e.maxDrawdownR<=p.maximumDrawdownR?"PASS":"FAIL"}

export function arbitrationEvidence(pipeline:CandidatePipelineResult) {
  /* CandidatePipelineResult exposes chosen/accepted and rejected rows, but not the complete
     candidate set or arbitration grouping. We deliberately report that boundary. */
  return deepFreeze({state:"CONTRACT_LIMITED" as const,events:null,singleCandidateEvents:null,multiCandidateConflicts:null,buySellConflicts:null,sameDirectionConflicts:null,winnerCountsByStrategy:Object.fromEntries([...new Set(pipeline.accepted.map(x=>x.candidate.strategyId))].map(id=>[id,pipeline.accepted.filter(x=>x.candidate.strategyId===id).length])),rejectionCountsByStrategy:Object.fromEntries([...new Set(pipeline.rejected.map(x=>x.strategyId))].map(id=>[id,pipeline.rejected.filter(x=>x.strategyId===id).length])),conflictRate:null,postArbitration:{expectancyR:pipeline.metrics.expectancyR,profitFactor:pipeline.metrics.profitFactor,maxDrawdownR:pipeline.metrics.maxDrawdown,strategyContribution:pipeline.metrics.strategyContribution},knownPhaseCContractGap:["competition event grouping","all pre-arbitration candidates","candidate scores/directions for rejected alternatives","NO_TRADE decisions","conflict type and state snapshots"]});
}

export interface PropQualificationInput { actuallyRun:number;passCount:number;failCount:number;incompleteCount:number;ambiguousCount:number;determinatePassRate:number;dailyLossViolations:number;maxLossViolations:number;fundedReached:number;fundedSurvived:number;distinctWindows:number }
export function qualifyProp(x:PropQualificationInput):LayerState["prop"] {const p=PHASE_B_POLICIES.prop;if(x.ambiguousCount>0)return"AMBIGUOUS";if(x.actuallyRun<p.minimumAttempts||x.distinctWindows<p.minimumAttempts)return"INSUFFICIENT";const determinate=x.passCount+x.failCount,daily=x.dailyLossViolations/x.actuallyRun*100,max=x.maxLossViolations/x.actuallyRun*100;if(x.passCount<p.minimumPassed||x.determinatePassRate<p.minimumDeterminatePassRatePct||daily>p.maximumDailyLossBreachRatePct||max>p.maximumMaxLossBreachRatePct||x.incompleteCount+x.ambiguousCount+x.passCount+x.failCount!==x.actuallyRun)return"REJECTED";if(!x.fundedReached)return"FUNDED_SURVIVAL_INSUFFICIENT";if(x.fundedSurvived/x.fundedReached*100<p.minimumFundedSurvivalRatePct)return"REJECTED";return determinate?p.minimumPassed<=x.passCount?"QUALIFIED":"REJECTED":"INSUFFICIENT"}
export function qualifySignals(x:{total:number;oosExpectancyR:number;profitFactor:number|null;maxDrawdownR:number;longestLosingStreak:number;stressPass:boolean;upstreamFatal:boolean}):LayerState["signals"] {const p=PHASE_B_POLICIES.signals;if(x.total<p.minimumSignals)return"INSUFFICIENT";return !x.upstreamFatal&&x.oosExpectancyR>=p.minimumOosExpectancyR&&(x.profitFactor??0)>=p.minimumProfitFactor&&x.maxDrawdownR<=p.maximumDrawdownR&&x.longestLosingStreak<=p.maximumLosingStreak&&x.stressPass?"QUALIFIED":"REJECTED"}
export function qualifyPersonal(x:{executed:number;returnPct:number;dailyDrawdownPct:number;totalDrawdownPct:number;locks:number;returnDrawdownRatio:number;upstreamFatal:boolean}):LayerState["personal"] {const p=PHASE_B_POLICIES.personal;if(x.executed<p.minimumExecuted)return"INSUFFICIENT";return !x.upstreamFatal&&x.returnPct>p.minimumReturnPct&&x.dailyDrawdownPct<=p.maximumDailyDrawdownPct&&x.totalDrawdownPct<=p.maximumTotalDrawdownPct&&x.locks<=p.maximumLocks&&x.returnDrawdownRatio>=p.minimumReturnDrawdownRatio?"QUALIFIED":"REJECTED"}
export function includePortfolio(x:{standaloneQualified:boolean;marginalNetR:number;withDrawdownR:number;withoutDrawdownR:number;concentrationPct:number}){const p=PHASE_B_POLICIES.portfolio;return x.standaloneQualified&&x.marginalNetR>0&&x.withDrawdownR<=x.withoutDrawdownR&&x.concentrationPct<=p.maximumConcentrationPct}

export interface CombinedProductQualificationEvidence {
  identity:string;
  frozenIdentityPass:boolean;
  datasetIntegrityPass:boolean;
  tradeCount:number;
  oos:{trades:number;expectancyR:number;profitFactor:number|null};
  walkForward:{windows:number;consistency:number};
  stress:{scenario:string;profitFactor:number|null}[];
  monteCarlo:{maxDrawdownR:{p95:number};losingStreak:{p95:number}};
  regime:{sampleCount:number};
  concentrationPct:number;
  portfolioIncluded:boolean;
}
export interface CombinedProductQualification {
  authority:"phaseBCertification.qualifyCombinedProduct";
  policyVersion:string;
  identity:string;
  status:"PASS"|"FAIL"|"INSUFFICIENT_EVIDENCE";
  stages:readonly {stage:string;status:"PASS"|"FAIL"|"INSUFFICIENT";reasonCodes:readonly string[]}[];
  reasons:readonly string[];
  evidenceHash:string;
}
/** Canonical selected-set adapter. It applies only existing Phase B policy values. */
export function qualifyCombinedProduct(e:CombinedProductQualificationEvidence):CombinedProductQualification {
  const p=PHASE_B_POLICIES.strategyEdge;
  const stage=(name:string,pass:boolean,insufficient:boolean,reason:string)=>({stage:name,status:insufficient?"INSUFFICIENT" as const:pass?"PASS" as const:"FAIL" as const,reasonCodes:pass&&!insufficient?[]:[reason]});
  const stages=[
    stage("FROZEN_SURVIVOR_IDENTITY",e.frozenIdentityPass,false,"FROZEN_IDENTITY_MISMATCH"),
    stage("DATASET_INTEGRITY",e.datasetIntegrityPass,false,"DATASET_INTEGRITY_FAILED"),
    stage("PORTFOLIO_SAMPLE",e.tradeCount>=p.minimumTrades,false,"MINIMUM_PORTFOLIO_TRADES"),
    stage("OOS",e.oos.trades>=p.minimumOosTrades&&e.oos.expectancyR>=p.minimumOosExpectancyR&&(e.oos.profitFactor??0)>=p.minimumOosProfitFactor,e.oos.trades===0,"OOS_POLICY_FAILED"),
    stage("WALK_FORWARD",e.walkForward.consistency>=p.minimumWalkForwardConsistencyPct,e.walkForward.windows===0,"WALK_FORWARD_POLICY_FAILED"),
    stage("STRESS",e.stress.length>0&&e.stress.every(x=>(x.profitFactor??0)>=p.minimumStressProfitFactor),e.stress.length===0,"STRESS_POLICY_FAILED"),
    stage("MONTE_CARLO",e.monteCarlo.maxDrawdownR.p95<=p.maximumMonteCarloDrawdownR95&&e.monteCarlo.losingStreak.p95<=p.maximumLosingStreak,!Number.isFinite(e.monteCarlo.maxDrawdownR.p95),"MONTE_CARLO_POLICY_FAILED"),
    stage("REGIME",e.regime.sampleCount>0,e.regime.sampleCount===0,"REGIME_EVIDENCE_REQUIRED"),
    stage("CONCENTRATION",e.concentrationPct<=p.maximumSingleSymbolContributionPct&&e.portfolioIncluded,false,"PORTFOLIO_CONCENTRATION_OR_MARGINAL_FAILURE"),
  ];
  const reasons=stages.flatMap(x=>x.reasonCodes),status=stages.some(x=>x.status==="INSUFFICIENT")?"INSUFFICIENT_EVIDENCE":stages.some(x=>x.status==="FAIL")?"FAIL":"PASS";
  return deepFreeze({authority:"phaseBCertification.qualifyCombinedProduct",policyVersion:`${p.version}+${PHASE_B_POLICIES.portfolio.version}`,identity:e.identity,status,stages,reasons,evidenceHash:certificationHash(e,"combined-product-evidence")});
}
