import { CANONICAL_STRATEGIES } from "../../../supabase/functions/_shared/trading-domain/strategies.ts";
import type { DatasetCampaign } from "./datasetCampaign";
import type { CalibrationSearchMethod, QualificationPolicy } from "./strategyQualification";

export const CERTIFICATION_STAGES = ["QUEUED","DATA_VALIDATION","BASELINE","SCREENING","CALIBRATION","OOS","WALK_FORWARD","STRESS","MONTE_CARLO","ROBUSTNESS","SYMBOL","REGIME","SIGNALS","PERSONAL","PROP","PORTFOLIO","FINAL_DECISION","FREEZE_READY","COMPLETE"] as const;
export type CertificationStage = typeof CERTIFICATION_STAGES[number] | "ELIMINATED" | "FAILED";
export type ProductTarget = "SIGNALS" | "PERSONAL" | "PROP" | "ALL";
export type FinalStrategyState = "REJECTED"|"INSUFFICIENT_DATA"|"RESEARCH_ONLY"|"RESEARCH_REBUILD_CANDIDATE"|"QUALIFIED_FOR_SIGNALS"|"QUALIFIED_FOR_PERSONAL"|"QUALIFIED_FOR_PROP"|"QUALIFIED_MULTI_PRODUCT"|"FORWARD_VALIDATION_CANDIDATE";
export type ResearchState = "PROMISING"|"WEAK"|"INSUFFICIENT_DATA"|"UNSTABLE"|"COST_SENSITIVE"|"OVER_CONCENTRATED";

export interface CertificationProtocolInput {
  qualificationPolicy: QualificationPolicy;
  calibrationRangesVersion: string;
  searchMethod: CalibrationSearchMethod;
  seed: number;
  maximumVariants: number;
  productTarget: ProductTarget;
  market: "FOREX"|"METALS"|"CRYPTO"|"ALL";
  strategyIds: readonly string[];
  startingSymbolUniverse: Readonly<Record<string, readonly string[]>>;
  datasetCampaign: DatasetCampaign;
  partitions: { inSample: readonly [string,string]; validation: readonly [string,string]; outOfSample: readonly [string,string] };
  costModelVersion: string;
  propProfileVersion?: string;
  reason?: string;
}

export interface CertificationProtocol extends CertificationProtocolInput {
  version: "portfolio-certification-protocol/v1";
  id: string;
  hash: string;
  locked: true;
  datasetCampaignId: string;
  datasetCampaignHash: string;
  createdAt: string;
}

export interface PerformanceMetrics { trades:number; wins:number; losses:number; winRate:number; expectancyR:number; averageWinR:number; averageLossR:number; profitFactor:number|null; netR:number; maxDrawdownR:number; longestLossStreak:number; averageHoldingMinutes:number; longTrades:number; shortTrades:number; signalFrequencyPerMonth:number; costsR:number }
export interface SymbolEvidence extends PerformanceMetrics { symbol:string; contributionPct:number; costSensitivityPct:number; oosTrades:number; oosExpectancyR:number; oosProfitFactor:number|null }
export interface RegimeEvidence { label:string; source:"CANONICAL_DECISION_EVIDENCE"; trades:number; expectancyR:number; profitFactor:number|null; contributionPct:number }
export interface ProductEvidence { eligible:boolean; reasons:readonly string[]; metrics:Readonly<Record<string,number|string|boolean|null>> }
export interface StrategyCertificationEvidence {
  strategyId:string; baselineConfigId:string; baselineConfigHash:string; baseline:PerformanceMetrics;
  variants:readonly { configId:string; configVersion:string; configHash:string; seed:number; parameters:Readonly<Record<string,number>>; selected:boolean; rejectionReasons:readonly string[] }[];
  selectedConfigId?:string; oos:PerformanceMetrics; walkForward:{windows:number;positiveWindows:number;negativeWindows:number;consistencyPct:number};
  stress:{scenario:string;profitFactor:number|null;expectancyR:number;maxDrawdownR:number}[];
  monteCarlo:{seed:number;simulations:number;medianNetR:number;drawdownMedianR:number;drawdownP90R:number;drawdownP95R:number;worstDrawdownR:number;lossStreakP95:number};
  parameterRobustness:"ROBUST_PLATEAU"|"NARROW_PEAK"|"UNSTABLE"; symbols:readonly SymbolEvidence[]; regimes:readonly RegimeEvidence[];
  signals:ProductEvidence; personal:ProductEvidence; prop:ProductEvidence & { attempts?:{requested:number;available:number;actuallyRun:number}[] };
  rebuild?:{ structuralFlaw:string; supportingEvidence:string };
}

export interface StrategyCertificationResult { strategyId:string;market:string;strategyVersion:string;stage:CertificationStage;researchState:ResearchState;finalState:FinalStrategyState;reasons:readonly string[];eligibleSymbols:readonly string[];productSuitability:{signals:boolean;personal:boolean;prop:boolean};evidence:StrategyCertificationEvidence;frozen?:FrozenSurvivor }
export interface FrozenSurvivor { version:"frozen-strategy/v1";strategyId:string;strategyVersion:string;parameters:Readonly<Record<string,number>>;configId:string;configVersion:string;configHash:string;eligibleSymbols:readonly string[];datasetCampaignId:string;datasetCampaignHash:string;qualificationPolicyVersion:string;protocolHash:string;productSuitability:Readonly<Record<string,boolean>>;seed:number;frozenAt:string }
export interface PortfolioCombination { id:string;strategyIds:readonly string[];netR:number;expectancyR:number;profitFactor:number|null;maxDrawdownR:number;concentrationPct:number;frequency:number;simultaneousExposure:number;arbitratorConflicts:number;propSurvivalPct:number|null;marginalContribution:Readonly<Record<string,{netR:number;expectancyR:number;profitFactor:number|null;maxDrawdownR:number;concentrationPct:number;frequency:number}>>;included:boolean;reasons:readonly string[] }
export interface PortfolioCertificationResult { version:"portfolio-certification-result/v1";status:"PASS"|"REAL_DATA_REQUIRED";campaignId:string;campaignHash:string;protocolHash:string;qualificationPolicyVersion:string;datasetLineage:DatasetCampaign["inventory"];progress:{stage:CertificationStage;completed:number;total:number};strategyResults:readonly StrategyCertificationResult[];rejectedStrategies:readonly string[];rebuildCandidates:readonly string[];insufficientDataStrategies:readonly string[];portfolioCombinations:readonly PortfolioCombination[];frozenSurvivors:readonly FrozenSurvivor[];forwardValidationPortfolio:readonly string[];marketStates:Readonly<Record<string,"QUALIFIED"|"NO_QUALIFIED_STRATEGY"|"NEW_STRATEGY_RESEARCH_REQUIRED">>;blockers:readonly string[] }

function stable(value:unknown):string { if(value===null||typeof value!=="object") return JSON.stringify(value); if(Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; }
export function certificationHash(value:unknown,prefix="cert"){let h=2166136261;for(const char of stable(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619)}return `${prefix}_${(h>>>0).toString(16).padStart(8,"0")}`}
function deepFreeze<T>(value:T):T { if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value as object).forEach(deepFreeze)}return value }
function overlaps(a:readonly [string,string],b:readonly [string,string]){return Date.parse(a[0])<=Date.parse(b[1])&&Date.parse(b[0])<=Date.parse(a[1])}

export function createCertificationProtocol(input:CertificationProtocolInput):CertificationProtocol {
  if(input.datasetCampaign.quality!=="CERTIFIABLE") throw new Error("REAL_DATA_REQUIRED:DATASET_CAMPAIGN_NOT_CERTIFIABLE");
  if(input.maximumVariants<1||input.maximumVariants>500||!Number.isInteger(input.maximumVariants)) throw new Error("INVALID_VARIANT_LIMIT");
  if(overlaps(input.partitions.inSample,input.partitions.validation)||overlaps(input.partitions.inSample,input.partitions.outOfSample)||overlaps(input.partitions.validation,input.partitions.outOfSample)) throw new Error("PARTITIONS_MUST_BE_ISOLATED");
  for(const item of input.datasetCampaign.inventory){if(!item.certifiable)throw new Error(`UNCERTIFIABLE_DATASET:${item.datasetId}`);if(input.market!=="ALL"&&input.market!=="CRYPTO"&&!["MT5_BRIDGE","PUBLIC_RESEARCH","HISTDATA","TWELVE_DATA"].includes(item.provider))throw new Error(`WRONG_PROVIDER:${item.datasetId}`);if(input.market==="CRYPTO"&&!["BINANCE","BYBIT","COINBASE"].includes(item.provider))throw new Error(`WRONG_PROVIDER:${item.datasetId}`);if(!["MT5_BRIDGE","PUBLIC_RESEARCH","HISTDATA","TWELVE_DATA","BINANCE","BYBIT","COINBASE"].includes(item.provider))throw new Error(`PROVIDER_SUBSTITUTION_FORBIDDEN:${item.datasetId}`)}
  for(const strategyId of input.strategyIds){const strategy=CANONICAL_STRATEGIES[strategyId];if(!strategy)throw new Error(`UNKNOWN_STRATEGY:${strategyId}`);const candidates=input.datasetCampaign.inventory.filter(x=>strategy.market==="CRYPTO"?["BINANCE","BYBIT","COINBASE"].includes(x.provider):["MT5_BRIDGE","PUBLIC_RESEARCH","HISTDATA","TWELVE_DATA"].includes(x.provider)).filter(x=>strategy.instruments.includes("*")||strategy.instruments.includes(x.symbol));const symbolGroups=candidates.reduce<Record<string,typeof candidates>>((groups,row)=>{(groups[row.symbol]??=[]).push(row);return groups},{});if(!Object.values(symbolGroups).some(rows=>strategy.requirements.requiredTimeframes.every(tf=>rows.some(x=>x.timeframe===tf))))throw new Error(`WRONG_OR_MISSING_TIMEFRAME:${strategyId}`)}
  const core={...input,version:"portfolio-certification-protocol/v1" as const,datasetCampaignId:input.datasetCampaign.id,datasetCampaignHash:input.datasetCampaign.hash};
  const hash=certificationHash(core,"protocol"); return deepFreeze({...core,id:hash,hash,locked:true as const,createdAt:new Date(input.datasetCampaign.createdAt).toISOString()});
}

export function validateRollingAttempts(rows:readonly {requested:number;available:number;actuallyRun:number}[]){for(const r of rows){if(![10,25,50,100,200,500].includes(r.requested)||r.actuallyRun>r.available||r.actuallyRun>r.requested)throw new Error("INVALID_ROLLING_ATTEMPT_COUNTS")}}
function failReasons(e:StrategyCertificationEvidence,p:QualificationPolicy){const out:string[]=[];if(e.oos.trades<p.minimumOosTrades)out.push("LOW_OOS_SAMPLE");if(e.oos.expectancyR<p.minimumOosExpectancyR)out.push("WEAK_OOS_EXPECTANCY");if((e.oos.profitFactor??0)<p.minimumOosProfitFactor)out.push("WEAK_OOS_PROFIT_FACTOR");if(e.walkForward.consistencyPct<p.minimumWalkForwardConsistencyPct)out.push("WALK_FORWARD_INCONSISTENT");if(!e.stress.length||Math.min(...e.stress.map(x=>x.profitFactor??0))<p.minimumStressProfitFactor)out.push("STRESS_FAILURE");if(e.monteCarlo.drawdownP95R>p.maximumMonteCarloDrawdownR95)out.push("MONTE_CARLO_DD_FAILURE");if(e.parameterRobustness!=="ROBUST_PLATEAU")out.push(e.parameterRobustness);if(Math.max(0,...e.symbols.map(x=>Math.abs(x.contributionPct)))>p.maximumSingleSymbolContributionPct)out.push("OVER_CONCENTRATED_SYMBOL");if(Math.max(0,...e.regimes.map(x=>Math.abs(x.contributionPct)))>p.maximumSingleRegimeContributionPct)out.push("OVER_CONCENTRATED_REGIME");return out}
function productState(s:boolean,p:boolean,r:boolean):FinalStrategyState {const n=[s,p,r].filter(Boolean).length;return n>1?"QUALIFIED_MULTI_PRODUCT":s?"QUALIFIED_FOR_SIGNALS":p?"QUALIFIED_FOR_PERSONAL":r?"QUALIFIED_FOR_PROP":"REJECTED"}

export function certifyPortfolio(protocol:CertificationProtocol,evidence:readonly StrategyCertificationEvidence[],combinations:readonly PortfolioCombination[]=[],at=protocol.createdAt):PortfolioCertificationResult {
  const protocolCore=Object.fromEntries(Object.entries(protocol).filter(([key])=>!['id','hash','locked','createdAt'].includes(key)));
  if(!protocol.locked||certificationHash(protocolCore,"protocol")!==protocol.hash)throw new Error("CERTIFICATION_PROTOCOL_MUTATED");
  const expected=protocol.strategyIds;
  if(!evidence.length)return deepFreeze({version:"portfolio-certification-result/v1",status:"REAL_DATA_REQUIRED",campaignId:certificationHash({protocol:protocol.hash},"portfolio"),campaignHash:certificationHash({protocol:protocol.hash},"portfolio"),protocolHash:protocol.hash,qualificationPolicyVersion:protocol.qualificationPolicy.version,datasetLineage:protocol.datasetCampaign.inventory,progress:{stage:"DATA_VALIDATION",completed:1,total:CERTIFICATION_STAGES.length},strategyResults:[],rejectedStrategies:[],rebuildCandidates:[],insufficientDataStrategies:expected,portfolioCombinations:[],frozenSurvivors:[],forwardValidationPortfolio:[],marketStates:{FOREX:"NEW_STRATEGY_RESEARCH_REQUIRED",METALS:"NEW_STRATEGY_RESEARCH_REQUIRED",CRYPTO:"NEW_STRATEGY_RESEARCH_REQUIRED"},blockers:["CERTIFICATION_QUALITY_REAL_REPLAY_EVIDENCE_REQUIRED"]});
  const results=evidence.map(e=>{const strategy=CANONICAL_STRATEGIES[e.strategyId];if(!strategy||!expected.includes(e.strategyId))throw new Error(`STRATEGY_OUTSIDE_PROTOCOL:${e.strategyId}`);if(e.prop.attempts)validateRollingAttempts(e.prop.attempts);const baselineFirst=e.variants.every(v=>v.configId!==e.baselineConfigId);if(!baselineFirst)throw new Error("BASELINE_MUST_PRECEDE_CALIBRATION");const reasons=failReasons(e,protocol.qualificationPolicy);const eligible=e.symbols.filter(x=>x.oosTrades>=protocol.qualificationPolicy.minimumOosTrades&&x.oosExpectancyR>=protocol.qualificationPolicy.minimumOosExpectancyR&&(x.oosProfitFactor??0)>=protocol.qualificationPolicy.minimumOosProfitFactor).map(x=>x.symbol);if(!eligible.length)reasons.push("NO_OOS_BACKED_ELIGIBLE_SYMBOLS");const structurallyRebuildable=Boolean(e.rebuild&&e.rebuild.structuralFlaw&&e.rebuild.supportingEvidence);const suitability={signals:!reasons.length&&e.signals.eligible,personal:!reasons.length&&e.personal.eligible,prop:!reasons.length&&e.prop.eligible};let finalState:FinalStrategyState=e.oos.trades<protocol.qualificationPolicy.minimumOosTrades?"INSUFFICIENT_DATA":reasons.length?(structurallyRebuildable?"RESEARCH_REBUILD_CANDIDATE":"REJECTED"):productState(suitability.signals,suitability.personal,suitability.prop);if(!reasons.length&&!Object.values(suitability).some(Boolean))finalState="RESEARCH_ONLY";const selected=e.variants.find(v=>v.selected);const frozen=selected&&Object.values(suitability).some(Boolean)?deepFreeze({version:"frozen-strategy/v1" as const,strategyId:e.strategyId,strategyVersion:strategy.version,parameters:selected.parameters,configId:selected.configId,configVersion:selected.configVersion,configHash:selected.configHash,eligibleSymbols:eligible,datasetCampaignId:protocol.datasetCampaignId,datasetCampaignHash:protocol.datasetCampaignHash,qualificationPolicyVersion:protocol.qualificationPolicy.version,protocolHash:protocol.hash,productSuitability:suitability,seed:protocol.seed,frozenAt:at}):undefined;const researchState:ResearchState=e.oos.trades<protocol.qualificationPolicy.minimumOosTrades?"INSUFFICIENT_DATA":reasons.includes("STRESS_FAILURE")?"COST_SENSITIVE":reasons.includes("NARROW_PEAK")||reasons.includes("UNSTABLE")?"UNSTABLE":reasons.length?"WEAK":"PROMISING";return deepFreeze({strategyId:e.strategyId,market:strategy.market,strategyVersion:strategy.version,stage:frozen?"COMPLETE" as const:"ELIMINATED" as const,researchState,finalState,reasons,eligibleSymbols:eligible,productSuitability:suitability,evidence:e,frozen})});
  const frozen=results.flatMap(x=>x.frozen?[x.frozen]:[]), frozenIds=new Set(frozen.map(x=>x.strategyId));for(const combination of combinations)if(combination.strategyIds.some(id=>!frozenIds.has(id)))throw new Error("REJECTED_STRATEGY_CANNOT_ENTER_FROZEN_PORTFOLIO");const marketStates=Object.fromEntries(["FOREX","METALS","CRYPTO"].map(m=>{const candidates=results.filter(x=>x.market===m),qualified=candidates.some(x=>x.frozen);return[m,qualified?"QUALIFIED":candidates.length?"NO_QUALIFIED_STRATEGY":"NEW_STRATEGY_RESEARCH_REQUIRED"]})) as PortfolioCertificationResult["marketStates"];
  const campaignHash=certificationHash({protocol:protocol.hash,results:results.map(x=>({id:x.strategyId,state:x.finalState,config:x.frozen?.configHash})),combinations},"portfolio");return deepFreeze({version:"portfolio-certification-result/v1",status:"PASS",campaignId:campaignHash,campaignHash,protocolHash:protocol.hash,qualificationPolicyVersion:protocol.qualificationPolicy.version,datasetLineage:protocol.datasetCampaign.inventory,progress:{stage:"COMPLETE",completed:CERTIFICATION_STAGES.length,total:CERTIFICATION_STAGES.length},strategyResults:results,rejectedStrategies:results.filter(x=>x.finalState==="REJECTED").map(x=>x.strategyId),rebuildCandidates:results.filter(x=>x.finalState==="RESEARCH_REBUILD_CANDIDATE").map(x=>x.strategyId),insufficientDataStrategies:results.filter(x=>x.finalState==="INSUFFICIENT_DATA").map(x=>x.strategyId),portfolioCombinations:combinations,frozenSurvivors:frozen,forwardValidationPortfolio:frozen.map(x=>x.strategyId),marketStates,blockers:[]});
}

export const LEGACY_STRATEGY_INVENTORY = Object.freeze([
  { id:"forex.london-breakout",classification:"CANONICAL" },{id:"forex.new-york-continuation",classification:"CANONICAL"},{id:"forex.trend-pullback",classification:"CANONICAL"},{id:"gold.volatility-breakout",classification:"CANONICAL"},{id:"crypto.trend-pullback",classification:"RESEARCH_ONLY_CANONICAL"},{id:"crypto.reversal-exhaustion",classification:"RESEARCH_ONLY_CANONICAL"},
] as const);
