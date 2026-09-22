import { CANONICAL_STRATEGIES } from "../../../supabase/functions/_shared/trading-domain/strategies.ts";
import {
  canonicalRunEvidence,
  fundedSnapshotsFromTrades,
  simulateFullChallenge,
  simulateFundedSurvival,
  type PropAccountConfiguration,
  type PropProgramProfile,
} from "../prop/professionalPropEngine";
import {
  runCandidatePipelineReplay,
  type CandidatePipelineInput,
  type CandidatePipelineResult,
} from "./canonicalPipelineReplay";
import { runFullPropPipelineReplay } from "./fullPropPipelineReplay";
import {
  metrics,
  monteCarlo,
  splitOos,
  stress,
  walkForward,
  type ResearchRunContract,
  type StressScenario,
} from "./researchValidation";

export type QualificationStatus =
  | "RESEARCH_ONLY"
  | "INSUFFICIENT_DATA"
  | "BACKTEST_VALIDATED"
  | "OOS_VALIDATED"
  | "WALK_FORWARD_VALIDATED"
  | "STRESS_VALIDATED"
  | "MONTE_CARLO_VALIDATED"
  | "PORTFOLIO_VALIDATED"
  | "PROP_SIMULATION_VALIDATED"
  | "FORWARD_VALIDATION_CANDIDATE"
  | "FORWARD_VALIDATED"
  | "PRODUCTION_APPROVED"
  | "REJECTED";

export type QualificationStage =
  | "QUEUED"
  | "IS_SCREENING"
  | "OOS"
  | "WALK_FORWARD"
  | "STRESS"
  | "MONTE_CARLO"
  | "REGIME"
  | "PORTFOLIO"
  | "FULL_PROP_PIPELINE"
  | "FUNDED_SURVIVAL"
  | "COMPLETED"
  | "ELIMINATED";

export interface CalibrationParameter {
  namespace: "STRATEGY" | "RESEARCH_POLICY";
  name: string;
  referenceValue: number;
  type: "INTEGER" | "DECIMAL";
  minimum: number;
  maximum: number;
  step: number;
  discreteValues: readonly number[];
  safeResearchRange: readonly [number, number];
  productionMutationAllowedAutomatically: false;
}

const parameter = (namespace: CalibrationParameter["namespace"], name: string, referenceValue: number, values: readonly number[], type: CalibrationParameter["type"] = "DECIMAL"): CalibrationParameter => Object.freeze({ namespace, name, referenceValue, type, minimum: Math.min(...values), maximum: Math.max(...values), step: values.length > 1 ? values[1] - values[0] : 0, discreteValues: Object.freeze([...values]), safeResearchRange: Object.freeze([Math.min(...values), Math.max(...values)]) as readonly [number, number], productionMutationAllowedAutomatically: false });
const STRATEGY_PARAMETERS: Readonly<Record<string, readonly CalibrationParameter[]>> = Object.freeze({
  "forex.london-breakout": [parameter("STRATEGY", "bodyAtr", .45, [.4,.45,.5]), parameter("STRATEGY", "extensionAtr", .9, [.8,.9,1])],
  "forex.new-york-continuation": [parameter("STRATEGY", "minimumMoveAtr", .25, [.2,.25,.3]), parameter("STRATEGY", "maximumMoveAtr", 3.2, [2.8,3.2,3.6])],
  "forex.trend-pullback": [parameter("STRATEGY", "maximumPullbackAtr", .8, [.7,.8,.9]), parameter("STRATEGY", "stopAtr", 1.4, [1.25,1.4,1.55])],
  "gold.volatility-breakout": [parameter("STRATEGY", "minimumBodyAtr", .55, [.5,.55,.6]), parameter("STRATEGY", "minimumAcceptanceAtr", .08, [.06,.08,.1])],
  "crypto.trend-pullback": [parameter("STRATEGY", "pullbackAtr", .55, [.45,.55,.65]), parameter("STRATEGY", "stopAtr", 1.65, [1.5,1.65,1.8])],
  "crypto.reversal-exhaustion": [parameter("STRATEGY", "rsiExtreme", 32, [28,32,36], "INTEGER"), parameter("STRATEGY", "stopAtr", 1.4, [1.25,1.4,1.55])],
});
export const CALIBRATION_PARAMETER_REGISTRY: Readonly<Record<string, readonly CalibrationParameter[]>> = Object.freeze(Object.fromEntries(Object.values(CANONICAL_STRATEGIES).map(strategy => [strategy.id, Object.freeze([...(STRATEGY_PARAMETERS[strategy.id] ?? []), parameter("RESEARCH_POLICY", "minimumCandidateScore", 70, strategy.market === "CRYPTO" ? [60,70,80] : [65,70,75,85], "INTEGER"), parameter("RESEARCH_POLICY", "riskPercent", 1, [.5,1,1.25])])])));

export type CalibrationSearchMethod = "GRID" | "RANDOM_SEEDED" | "LATIN_HYPERCUBE";
export interface CalibrationVariant {
  configId: string;
  configVersion: string;
  strategyParameters: Readonly<Record<string, number>>;
  researchPolicyParameters: Readonly<{ minimumCandidateScore: number; riskPercent: number }>;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}
function digest(value: unknown, prefix: string) {
  let hash = 2166136261;
  for (const char of stable(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000;
}

export function generateCalibrationVariants(input: {
  strategyId: string;
  method: CalibrationSearchMethod;
  seed: number;
  maximumVariants: number;
}): readonly CalibrationVariant[] {
  const registry = CALIBRATION_PARAMETER_REGISTRY[input.strategyId];
  if (!registry) throw new Error(`NO_CALIBRATION_REGISTRY:${input.strategyId}`);
  if (!Number.isInteger(input.maximumVariants) || input.maximumVariants < 1 || input.maximumVariants > 500) throw new Error("INVALID_VARIANT_LIMIT");
  const combinations = registry.reduce<Array<Record<string, number>>>((rows, parameter) => rows.flatMap((row) => parameter.discreteValues.map((value) => ({ ...row, [parameter.name]: value }))), [{}]);
  let selected: Array<Record<string, number>>;
  if (input.method === "GRID") selected = combinations.slice(0, input.maximumVariants);
  else {
    const random = randomGenerator(input.seed);
    if (input.method === "RANDOM_SEEDED") {
      selected = [...combinations];
      for (let index = selected.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [selected[index], selected[other]] = [selected[other], selected[index]];
      }
      selected = selected.slice(0, input.maximumVariants);
    } else {
      const count = Math.min(input.maximumVariants, combinations.length);
      selected = Array.from({ length: count }, (_, index) => Object.fromEntries(registry.map((parameter, parameterIndex) => {
        const values = parameter.discreteValues;
        const stratum = (index + parameterIndex * Math.max(1, Math.floor(count / values.length))) % count;
        const position = Math.min(values.length - 1, Math.floor(((stratum + random()) / count) * values.length));
        return [parameter.name, values[position]];
      })));
    }
  }
  const unique = [...new Map(selected.map((parameters) => [stable(parameters), parameters])).values()];
  return Object.freeze(unique.map((parameters, index) => {
    const strategyParameters = Object.freeze(Object.fromEntries(registry.filter(item => item.namespace === "STRATEGY").map(item => [item.name, parameters[item.name]])));
    const researchPolicyParameters = Object.freeze({ minimumCandidateScore: parameters.minimumCandidateScore, riskPercent: parameters.riskPercent });
    return Object.freeze({ configId: digest({ strategyId: input.strategyId, strategyParameters, researchPolicyParameters }, "config"), configVersion: `research/${input.method.toLowerCase()}/v1/${index + 1}`, strategyParameters, researchPolicyParameters });
  }));
}

export interface QualificationWeights {
  oosExpectancy: number;
  oosProfitFactor: number;
  walkForwardConsistency: number;
  returnDrawdown: number;
  parameterStability: number;
  stressResilience: number;
  monteCarloResilience: number;
  portfolioRobustness: number;
  historicalPropPerformance: number;
  fundedSurvival: number;
  costSensitivity: number;
  sampleSize: number;
}

export interface QualificationPolicy {
  id: string;
  version: string;
  product: "PERSONAL" | "PROP";
  minimumTrades: number;
  minimumOosTrades: number;
  minimumIsExpectancyR: number;
  minimumOosExpectancyR: number;
  minimumOosProfitFactor: number;
  minimumWalkForwardConsistencyPct: number;
  minimumStressProfitFactor: number;
  maximumMonteCarloDrawdownR95: number;
  maximumIsOosExpectancyDivergence: number;
  maximumSingleRegimeContributionPct: number;
  maximumSingleSymbolContributionPct: number;
  minimumResearchScore: number;
  requireFullPropPipeline: boolean;
  requireFundedSurvival: boolean;
  weights: QualificationWeights;
}

export const DEFAULT_QUALIFICATION_WEIGHTS: QualificationWeights = Object.freeze({ oosExpectancy: 12, oosProfitFactor: 10, walkForwardConsistency: 10, returnDrawdown: 10, parameterStability: 8, stressResilience: 10, monteCarloResilience: 10, portfolioRobustness: 8, historicalPropPerformance: 8, fundedSurvival: 6, costSensitivity: 4, sampleSize: 4 });
/** Canonical independent-strategy policy used by the browser research lab. */
export const CANONICAL_PERSONAL_QUALIFICATION_POLICY: QualificationPolicy = Object.freeze({
  id:"canonical-independent-personal",version:"canonical-independent-personal/v1",product:"PERSONAL",
  minimumTrades:10,minimumOosTrades:4,minimumIsExpectancyR:0,minimumOosExpectancyR:0,
  minimumOosProfitFactor:1,minimumWalkForwardConsistencyPct:50,minimumStressProfitFactor:.9,
  maximumMonteCarloDrawdownR95:15,maximumIsOosExpectancyDivergence:.75,
  maximumSingleRegimeContributionPct:85,maximumSingleSymbolContributionPct:100,
  minimumResearchScore:60,requireFullPropPipeline:false,requireFundedSurvival:false,
  weights:DEFAULT_QUALIFICATION_WEIGHTS,
});

export interface QualificationStageRecord {
  stage: QualificationStage;
  status: "COMPLETED" | "ELIMINATED" | "SKIPPED";
  reasonCodes: readonly string[];
}

export interface QualifiedVariantResult {
  binding: {
    strategyId: string;
    strategyVersion: string;
    configVersion: string;
    assetClass: "FOREX" | "METALS" | "CRYPTO";
    supportedSymbols: readonly string[];
    supportedTimeframes: readonly string[];
    researchPolicyVersion: string;
  };
  variant: CalibrationVariant;
  status: QualificationStatus;
  stageReached: QualificationStage;
  eliminationReasons: readonly string[];
  thesisDiagnostics: readonly string[];
  researchScore: number;
  pipeline: CandidatePipelineResult;
  stages: readonly QualificationStageRecord[];
  evidence: {
    inSample: ReturnType<typeof metrics>;
    outOfSample: ReturnType<typeof metrics>;
    walkForwardConsistency: number;
    stressMinimumProfitFactor: number;
    monteCarloDrawdownR95: number | null;
    maximumRegimeContributionPct: number;
    maximumSymbolContributionPct: number;
    propStatus: "NOT_REQUIRED" | "FUNDED" | "FAILED" | "INCOMPLETE";
    fundedSurvived: boolean | null;
    overfitPenalty: number;
    parameterStabilityPct?: number;
  };
}

function researchRun(strategyId: string, variant: CalibrationVariant, pipeline: CandidatePipelineResult, input: CandidatePipelineInput, seed: number): ResearchRunContract {
  const strategy = CANONICAL_STRATEGIES[strategyId], ordered = [...pipeline.trades].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  return { runId: pipeline.runHash, runHash: pipeline.runHash, strategyId, strategyVersion: strategy.version, configurationVersion: variant.configVersion, symbols: [...new Set(input.datasets.map((dataset) => dataset.symbol))], timeframes: [...new Set(input.datasets.map((dataset) => dataset.timeframe))], datasetIds: input.datasets.map((dataset) => dataset.datasetId), dateRange: { from: ordered[0]?.openedAt ?? "", to: ordered.at(-1)?.closedAt ?? "" }, trainingRange: null, validationRange: null, executionModel: { version: input.executionModel.version, provenance: input.executionModel.provenance, spread: ordered.reduce((sum, trade) => sum + trade.costs.spread, 0), slippage: ordered.reduce((sum, trade) => sum + trade.costs.slippage, 0), commission: ordered.reduce((sum, trade) => sum + trade.costs.commission, 0), swap: ordered.reduce((sum, trade) => sum + trade.costs.financing, 0) }, riskPolicyVersion: input.riskPolicy.version, capitalPolicyVersion: "candidate-pipeline/capital-v1", tradeManagementPolicyVersion: "canonical-replay/v1", initialBalance: input.initialAccount.balance, currency: input.executionModel.currency, createdAt: ordered[0]?.openedAt ?? new Date(0).toISOString(), status: ordered.length ? "COMPLETED" : "INVALID", verificationLevel: "HISTORICAL", trades: ordered, seed };
}
function ratioLargest(values: readonly number[]) {
  const absolute = values.map(Math.abs), total = absolute.reduce((sum, value) => sum + value, 0);
  return total ? Math.max(0, ...absolute) / total * 100 : 0;
}
function clampScore(value: number) { return Math.max(0, Math.min(100, value)); }
function qualificationMemory(input:QualificationCampaignInput,strategyId:string,stage:string){const memory=process.memoryUsage();console.log(`[PHASE_B_MEMORY] qualification=${input.campaignId} strategy=${strategyId} stage=${stage} rss_mb=${Math.round(memory.rss/1024/1024)} heap_used_mb=${Math.round(memory.heapUsed/1024/1024)} heap_total_mb=${Math.round(memory.heapTotal/1024/1024)}`)}
function compactPipeline(pipeline:CandidatePipelineResult):CandidatePipelineResult{return{...pipeline,accepted:[],rejected:[],trades:[]}}
export function calibrationDistance(left: CalibrationVariant, right: CalibrationVariant): number {
  const strategyKeys = new Set([...Object.keys(left.strategyParameters), ...Object.keys(right.strategyParameters)]);
  const formulaDistance = [...strategyKeys].reduce((sum, key) => sum + Math.abs((left.strategyParameters[key] ?? 0) - (right.strategyParameters[key] ?? 0)), 0);
  return formulaDistance + Math.abs(left.researchPolicyParameters.minimumCandidateScore - right.researchPolicyParameters.minimumCandidateScore) / 100 + Math.abs(left.researchPolicyParameters.riskPercent - right.researchPolicyParameters.riskPercent);
}
export function assessParameterNeighborhood(center: CalibrationVariant, neighbors: readonly { variant: CalibrationVariant; survived: boolean }[]) {
  const nearest = [...neighbors].filter(item => item.variant !== center).sort((a, b) => calibrationDistance(a.variant, center) - calibrationDistance(b.variant, center)).slice(0, 2);
  const stabilityPct = nearest.length ? nearest.filter(item => item.survived).length / nearest.length * 100 : 100;
  return Object.freeze({ stabilityPct, fragile: stabilityPct < 50, reasonCodes: stabilityPct < 50 ? Object.freeze(["FRAGILE_PARAMETER_REGION"] as const) : Object.freeze([] as const) });
}
export interface ResearchScoreComponents {
  oosExpectancy: number;
  oosProfitFactor: number;
  walkForwardConsistency: number;
  returnDrawdown: number;
  parameterStability: number;
  stressResilience: number;
  monteCarloResilience: number;
  portfolioRobustness: number;
  historicalPropPerformance: number;
  fundedSurvival: number;
  costSensitivity: number;
  sampleSize: number;
}
export function scoreResearchObjectives(components: ResearchScoreComponents, weights: QualificationWeights, overfitPenalty: number) {
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) throw new Error("QUALIFICATION_WEIGHTS_REQUIRED");
  const weighted = (Object.keys(weights) as Array<keyof QualificationWeights>).reduce((sum, key) => sum + clampScore(components[key]) * weights[key], 0);
  return clampScore(weighted / totalWeight - Math.max(0, overfitPenalty));
}

export interface QualificationCampaignInput {
  campaignId: string;
  assetClass: "FOREX" | "METALS" | "CRYPTO" | "MIXED";
  strategyInputs: Readonly<Record<string, CandidatePipelineInput>>;
  strategyIds: readonly string[];
  searchMethod: CalibrationSearchMethod;
  seed: number;
  maximumVariantsPerStrategy: number;
  certificationDate: string;
  policy: QualificationPolicy;
  prop?: { profile: PropProgramProfile; config: PropAccountConfiguration; fundedSurvivalDays: number };
}

function evaluateVariant(input: QualificationCampaignInput, strategyId: string, variant: CalibrationVariant): Omit<QualifiedVariantResult, "binding"> {
  const template = input.strategyInputs[strategyId];
  if (!template) throw new Error(`MISSING_STRATEGY_PIPELINE_INPUT:${strategyId}`);
  const pipelineInput: CandidatePipelineInput = { ...template, strategyIds: [strategyId], configurationVersion: variant.configVersion, riskPolicy: { ...template.riskPolicy, riskPercent: variant.researchPolicyParameters.riskPercent }, portfolioPolicy: { ...template.portfolioPolicy, minimumScore: variant.researchPolicyParameters.minimumCandidateScore }, parameters: { ...template.parameters, [strategyId]: Object.freeze({ ...(template.parameters?.[strategyId] ?? {}), ...variant.strategyParameters }) }, runReference: `${input.campaignId}:${variant.configId}` };
  qualificationMemory(input,strategyId,`config:${variant.configId}:replay:before`);
  const pipeline = runCandidatePipelineReplay(pipelineInput), run = researchRun(strategyId, variant, pipeline, pipelineInput, input.seed);
  qualificationMemory(input,strategyId,`config:${variant.configId}:replay:after`);
  const stages: QualificationStageRecord[] = [], eliminate = (stage: QualificationStage, reasonCodes: string[]) => stages.push({ stage, status: "ELIMINATED", reasonCodes });
  const noMetrics = metrics([], run.initialBalance);
  if (pipeline.trades.length < 2) {
    eliminate("IS_SCREENING", [pipeline.trades.length ? "LOW_SAMPLE" : "NO_CANONICAL_TRADES"]);
    return { variant, status: "INSUFFICIENT_DATA", stageReached: "ELIMINATED", eliminationReasons: stages[0].reasonCodes, thesisDiagnostics: stages[0].reasonCodes, researchScore: 0, pipeline, stages, evidence: { inSample: metrics(pipeline.trades), outOfSample: noMetrics, walkForwardConsistency: 0, stressMinimumProfitFactor: 0, monteCarloDrawdownR95: null, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  const oos = splitOos(run, 70), is = oos.inSample, validation = oos.outOfSample;
  if (is.trades < input.policy.minimumTrades || is.expectancyR < input.policy.minimumIsExpectancyR) {
    const reasons = [is.trades < input.policy.minimumTrades ? "LOW_SAMPLE" : "NEGATIVE_IS_EXPECTANCY"];
    eliminate("IS_SCREENING", reasons);
    return { variant, status: is.trades < input.policy.minimumTrades ? "INSUFFICIENT_DATA" : "REJECTED", stageReached: "ELIMINATED", eliminationReasons: reasons, thesisDiagnostics: reasons, researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: 0, stressMinimumProfitFactor: 0, monteCarloDrawdownR95: null, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  stages.push({ stage: "IS_SCREENING", status: "COMPLETED", reasonCodes: [] });
  const oosReasons = [validation.trades < input.policy.minimumOosTrades ? "LOW_OOS_SAMPLE" : "", validation.expectancyR < input.policy.minimumOosExpectancyR ? "NEGATIVE_OOS_EXPECTANCY" : "", (validation.profitFactor ?? 0) < input.policy.minimumOosProfitFactor ? "WEAK_OOS_PROFIT_FACTOR" : ""].filter(Boolean);
  if (oosReasons.length) {
    eliminate("OOS", oosReasons);
    return { variant, status: validation.trades < input.policy.minimumOosTrades ? "INSUFFICIENT_DATA" : "REJECTED", stageReached: "ELIMINATED", eliminationReasons: oosReasons, thesisDiagnostics: oosReasons, researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: 0, stressMinimumProfitFactor: 0, monteCarloDrawdownR95: null, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  stages.push({ stage: "OOS", status: "COMPLETED", reasonCodes: [] });
  const spanDays = Math.max(1, Math.ceil((Date.parse(run.dateRange.to) - Date.parse(run.dateRange.from)) / 86_400_000));
  const walk = walkForward(run, Math.max(1, Math.floor(spanDays * 0.4)), Math.max(1, Math.floor(spanDays * 0.15)), Math.max(1, Math.floor(spanDays * 0.1)));
  qualificationMemory(input,strategyId,`config:${variant.configId}:walk_forward:after`);
  if (!walk.windows.length || walk.consistency < input.policy.minimumWalkForwardConsistencyPct) {
    eliminate("WALK_FORWARD", ["UNSTABLE_WALK_FORWARD"]);
    return { variant, status: "REJECTED", stageReached: "ELIMINATED", eliminationReasons: ["UNSTABLE_WALK_FORWARD"], thesisDiagnostics: ["UNSTABLE_WALK_FORWARD"], researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: 0, monteCarloDrawdownR95: null, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  stages.push({ stage: "WALK_FORWARD", status: "COMPLETED", reasonCodes: [] });
  const stressScenarios: StressScenario[] = ["BASELINE", "SPREAD_1_5X", "SLIPPAGE_HIGH", "COMMISSION_HIGHER", "COMBINED_STRESS"];let stressPf=Infinity;for(const scenario of stressScenarios){const result=stress(run,scenario);stressPf=Math.min(stressPf,result.metrics.profitFactor??0)}
  qualificationMemory(input,strategyId,`config:${variant.configId}:stress:after`);
  if (stressPf < input.policy.minimumStressProfitFactor) {
    eliminate("STRESS", ["COST_SENSITIVE"]);
    return { variant, status: "REJECTED", stageReached: "ELIMINATED", eliminationReasons: ["COST_SENSITIVE"], thesisDiagnostics: ["COST_SENSITIVE"], researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: stressPf, monteCarloDrawdownR95: null, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  stages.push({ stage: "STRESS", status: "COMPLETED", reasonCodes: [] });
  const monte = monteCarlo(run, 500, input.seed, "TRADE_ORDER_PERMUTATION", input.policy.maximumMonteCarloDrawdownR95), monteP95 = Number(monte.maxDrawdownR.p95 ?? Infinity);
  qualificationMemory(input,strategyId,`config:${variant.configId}:monte_carlo:after`);
  if (monteP95 > input.policy.maximumMonteCarloDrawdownR95) {
    eliminate("MONTE_CARLO", ["BAD_MONTE_CARLO_TAIL"]);
    return { variant, status: "REJECTED", stageReached: "ELIMINATED", eliminationReasons: ["BAD_MONTE_CARLO_TAIL"], thesisDiagnostics: ["BAD_MONTE_CARLO_TAIL"], researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: stressPf, monteCarloDrawdownR95: monteP95, maximumRegimeContributionPct: 100, maximumSymbolContributionPct: 100, propStatus: "NOT_REQUIRED", fundedSurvived: null, overfitPenalty: 100 } };
  }
  stages.push({ stage: "MONTE_CARLO", status: "COMPLETED", reasonCodes: [] });
  const byRegime = Object.values(pipeline.accepted.reduce<Record<string, number>>((out, trade) => { out[trade.regime.classification] = (out[trade.regime.classification] ?? 0) + trade.result.netR; return out; }, {})), maximumRegime = ratioLargest(byRegime);
  stages.push({ stage: "REGIME", status: "COMPLETED", reasonCodes: maximumRegime > input.policy.maximumSingleRegimeContributionPct ? ["REGIME_DEPENDENT"] : [] });
  const maximumSymbol = ratioLargest(Object.values(pipeline.metrics.symbolContribution));
  stages.push({ stage: "PORTFOLIO", status: "COMPLETED", reasonCodes: maximumSymbol > input.policy.maximumSingleSymbolContributionPct ? ["ONE_SYMBOL_DEPENDENCY"] : [] });
  let propStatus: QualifiedVariantResult["evidence"]["propStatus"] = "NOT_REQUIRED", fundedSurvived: boolean | null = null;
  if (input.policy.requireFullPropPipeline) {
    if (!input.prop) throw new Error("PROP_QUALIFICATION_INPUT_REQUIRED");
    const start = pipelineInput.datasets.flatMap((dataset) => dataset.bars).sort((a, b) => a.timestamp - b.timestamp)[0]?.timestamp ?? 0;
    const full = runFullPropPipelineReplay({ ...pipelineInput, propConfig: input.prop.config, propProfile: input.prop.profile, propSnapshot: { timestamp: new Date(start).toISOString(), startingBalance: input.prop.config.accountSize, balance: input.prop.config.accountSize, equity: input.prop.config.accountSize, startOfDayBalance: input.prop.config.accountSize, closedPnl: 0, floatingPnl: 0, dailyClosedPnl: 0, openRisk: 0, openPositions: 0, pendingExecutableOrders: 0, tradingDays: 0, brokerTruth: false } });
    const propRun = { id: full.pipeline.runHash, label: variant.configId, strategyId, strategyVersion: CANONICAL_STRATEGIES[strategyId].version, symbol: pipelineInput.datasets[0]?.symbol ?? "", datasetIds: pipelineInput.datasets.map((dataset) => dataset.datasetId), runHash: full.pipeline.runHash, executionModelVersion: pipelineInput.executionModel.version, trades: full.pipeline.trades }, evidence = canonicalRunEvidence(propRun), challenge = simulateFullChallenge(input.prop.profile, input.prop.config, evidence);
    propStatus = challenge.status;
    stages.push({ stage: "FULL_PROP_PIPELINE", status: challenge.status === "FAILED" ? "ELIMINATED" : "COMPLETED", reasonCodes: challenge.status === "FUNDED" ? [] : [`PROP_${challenge.status}`] });
    if (challenge.status !== "FUNDED") {
      return { variant, status: "REJECTED", stageReached: "ELIMINATED", eliminationReasons: [`POOR_PROP_SURVIVAL:${challenge.status}`], thesisDiagnostics: ["POOR_PROP_SURVIVAL"], researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: stressPf, monteCarloDrawdownR95: monteP95, maximumRegimeContributionPct: maximumRegime, maximumSymbolContributionPct: maximumSymbol, propStatus, fundedSurvived, overfitPenalty: 100 } };
    }
    if (input.policy.requireFundedSurvival) {
      const snapshots = fundedSnapshotsFromTrades(input.prop.config, challenge.remainingTrades, input.prop.fundedSurvivalDays), survival = simulateFundedSurvival(input.prop.config, input.prop.profile, snapshots);
      fundedSurvived = survival.survived;
      stages.push({ stage: "FUNDED_SURVIVAL", status: survival.survived ? "COMPLETED" : "ELIMINATED", reasonCodes: survival.survived ? [] : ["POOR_PROP_SURVIVAL"] });
      if (!survival.survived) return { variant, status: "REJECTED", stageReached: "ELIMINATED", eliminationReasons: ["POOR_PROP_SURVIVAL"], thesisDiagnostics: ["POOR_PROP_SURVIVAL"], researchScore: 0, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: stressPf, monteCarloDrawdownR95: monteP95, maximumRegimeContributionPct: maximumRegime, maximumSymbolContributionPct: maximumSymbol, propStatus, fundedSurvived, overfitPenalty: 100 } };
    }
  }
  const divergence = Math.abs(is.expectancyR - validation.expectancyR) / Math.max(Math.abs(is.expectancyR), 0.01), overfitPenalty = Math.min(60, (divergence > input.policy.maximumIsOosExpectancyDivergence ? 20 : 0) + (maximumRegime > input.policy.maximumSingleRegimeContributionPct ? 12 : 0) + (maximumSymbol > input.policy.maximumSingleSymbolContributionPct ? 12 : 0) + (pipeline.trades.length < input.policy.minimumTrades * 2 ? 8 : 0) + (stressPf < (validation.profitFactor ?? 0) * 0.75 ? 8 : 0));
  const researchScore = scoreResearchObjectives({ oosExpectancy: validation.expectancyR * 50 + 50, oosProfitFactor: (validation.profitFactor ?? 0) * 40, walkForwardConsistency: walk.consistency, returnDrawdown: pipeline.metrics.netR / Math.max(pipeline.metrics.maxDrawdown, 0.25) * 20, parameterStability: 100 - maximumRegime, stressResilience: stressPf * 50, monteCarloResilience: 100 - monteP95 * 5, portfolioRobustness: 100 - maximumSymbol, historicalPropPerformance: propStatus === "FUNDED" ? 100 : input.policy.requireFullPropPipeline ? 0 : 50, fundedSurvival: fundedSurvived === true ? 100 : input.policy.requireFundedSurvival ? 0 : 50, costSensitivity: stressPf / Math.max(validation.profitFactor ?? 1, 0.01) * 100, sampleSize: pipeline.trades.length / Math.max(input.policy.minimumTrades, 1) * 50 }, input.policy.weights, overfitPenalty);
  const status: QualificationStatus = researchScore >= input.policy.minimumResearchScore ? "FORWARD_VALIDATION_CANDIDATE" : "RESEARCH_ONLY";
  const reasons = status === "RESEARCH_ONLY" ? ["RESEARCH_SCORE_BELOW_POLICY"] : [];
  stages.push({ stage: "COMPLETED", status: "COMPLETED", reasonCodes: reasons });
  return { variant, status, stageReached: "COMPLETED", eliminationReasons: reasons, thesisDiagnostics: [...(maximumRegime > input.policy.maximumSingleRegimeContributionPct ? ["REGIME_DEPENDENT"] : []), ...(maximumSymbol > input.policy.maximumSingleSymbolContributionPct ? ["ONE_SYMBOL_DEPENDENCY"] : []), ...(divergence > input.policy.maximumIsOosExpectancyDivergence ? ["IS_OOS_DIVERGENCE"] : [])], researchScore, pipeline, stages, evidence: { inSample: is, outOfSample: validation, walkForwardConsistency: walk.consistency, stressMinimumProfitFactor: stressPf, monteCarloDrawdownR95: monteP95, maximumRegimeContributionPct: maximumRegime, maximumSymbolContributionPct: maximumSymbol, propStatus, fundedSurvived, overfitPenalty } };
}

/** Evaluates one exact operator-selected configuration through the canonical qualification stages. */
export function qualifyExactStrategyConfiguration(input:{campaignId:string;certificationDate:string;assetClass:"FOREX"|"METALS"|"CRYPTO";strategyId:string;pipelineInput:CandidatePipelineInput;strategyParameters:Readonly<Record<string,number>>;policy?:QualificationPolicy;seed?:number}):QualifiedVariantResult {
  const strategy=CANONICAL_STRATEGIES[input.strategyId];if(!strategy)throw new Error(`UNKNOWN_STRATEGY:${input.strategyId}`);
  const variant:CalibrationVariant=Object.freeze({configId:digest({strategyId:input.strategyId,strategyParameters:input.strategyParameters,configurationVersion:input.pipelineInput.configurationVersion},"config"),configVersion:input.pipelineInput.configurationVersion,strategyParameters:Object.freeze({...input.strategyParameters}),researchPolicyParameters:Object.freeze({minimumCandidateScore:input.pipelineInput.portfolioPolicy.minimumScore,riskPercent:input.pipelineInput.riskPolicy.riskPercent})});
  const campaign:QualificationCampaignInput={campaignId:input.campaignId,certificationDate:input.certificationDate,assetClass:input.assetClass,strategyInputs:{[input.strategyId]:input.pipelineInput},strategyIds:[input.strategyId],searchMethod:"GRID",seed:input.seed??20260922,maximumVariantsPerStrategy:1,policy:input.policy??CANONICAL_PERSONAL_QUALIFICATION_POLICY};
  const result=evaluateVariant(campaign,input.strategyId,variant);
  return {...result,binding:{strategyId:input.strategyId,strategyVersion:strategy.version,configVersion:variant.configVersion,assetClass:strategy.market,supportedSymbols:Object.freeze([...new Set(input.pipelineInput.datasets.map(x=>x.symbol))]),supportedTimeframes:Object.freeze([...new Set(input.pipelineInput.datasets.map(x=>x.timeframe))]),researchPolicyVersion:campaign.policy.version}};
}

export interface QualifiedStrategySet {
  version: "qualified-strategy-set/v1";
  id: "FOREX_PERSONAL_QUALIFIED_SET" | "FOREX_PROP_QUALIFIED_SET" | "CRYPTO_PERSONAL_QUALIFIED_SET" | "CRYPTO_PROP_QUALIFIED_SET" | "AUTO_QUALIFIED_SET";
  setVersion: string;
  frozen: boolean;
  product: "PERSONAL" | "PROP";
  researchPolicyVersion: string;
  certifiedAt: string;
  entries: readonly {
    strategyId: string;
    strategyVersion: string;
    configId: string;
    configVersion: string;
    qualificationStatus: QualificationStatus;
    supportedSymbols: readonly string[];
    supportedTimeframes: readonly string[];
    researchRunIds: readonly string[];
    strategyParameters: Readonly<Record<string, number>>;
  }[];
}

export interface QualificationCampaignResult {
  version: "qualification-campaign/v1";
  campaignId: string;
  campaignHash: string;
  status: "COMPLETED";
  policyVersion: string;
  variantsTested: number;
  eliminated: number;
  survivors: readonly QualifiedVariantResult[];
  results: readonly QualifiedVariantResult[];
  recommendation: "QUALIFIED_WINNERS" | "NO_ROBUST_CONFIGURATION_FOUND";
  qualifiedSet: QualifiedStrategySet;
}

export function runQualificationCampaign(input: QualificationCampaignInput): QualificationCampaignResult {
  const evaluated: QualifiedVariantResult[] = input.strategyIds.flatMap((strategyId) => {
    const strategy = CANONICAL_STRATEGIES[strategyId], template = input.strategyInputs[strategyId];
    if (!strategy || !template) throw new Error(`MISSING_STRATEGY_PIPELINE_INPUT:${strategyId}`);
    return generateCalibrationVariants({ strategyId, method: input.searchMethod, seed: input.seed, maximumVariants: input.maximumVariantsPerStrategy }).map((variant) => {const evaluated=evaluateVariant(input,strategyId,variant);return { ...evaluated,pipeline:compactPipeline(evaluated.pipeline), binding: { strategyId, strategyVersion: strategy.version, configVersion: variant.configVersion, assetClass: strategy.market, supportedSymbols: Object.freeze([...new Set(template.datasets.map((dataset) => dataset.symbol))]), supportedTimeframes: Object.freeze([...new Set(template.datasets.map((dataset) => dataset.timeframe))]), researchPolicyVersion: input.policy.version } }});
  });
  const results = evaluated.map((result) => {
    if (result.stageReached === "ELIMINATED") return result;
    const resultStrategy = result.binding.strategyId;
    const peers = evaluated.filter((peer) => peer !== result && peer.binding.strategyId === resultStrategy).sort((a, b) => {
      return calibrationDistance(a.variant, result.variant) - calibrationDistance(b.variant, result.variant) || a.variant.configId.localeCompare(b.variant.configId);
    }).slice(0, 2);
    const neighborhood = assessParameterNeighborhood(result.variant, peers.map(peer => ({ variant: peer.variant, survived: peer.stageReached !== "ELIMINATED" })));
    const stability = neighborhood.stabilityPct, fragile = neighborhood.fragile, researchScore = clampScore(result.researchScore - (fragile ? 20 : stability < 100 ? 5 : 0));
    return { ...result, researchScore, status: researchScore >= input.policy.minimumResearchScore && !fragile ? "FORWARD_VALIDATION_CANDIDATE" as const : "RESEARCH_ONLY" as const, thesisDiagnostics: [...result.thesisDiagnostics, ...(fragile ? ["FRAGILE_PARAMETER_REGION"] : [])], evidence: { ...result.evidence, parameterStabilityPct: stability } };
  });
  const finalistByStrategy=new Map<string,QualifiedVariantResult>();for(const result of results){if(result.status!=="FORWARD_VALIDATION_CANDIDATE")continue;const current=finalistByStrategy.get(result.binding.strategyId);if(!current||result.researchScore>current.researchScore||(result.researchScore===current.researchScore&&result.variant.configId<current.variant.configId))finalistByStrategy.set(result.binding.strategyId,result)}const finalistIds=new Set([...finalistByStrategy.values()].map(result=>result.variant.configId));
  const hydrated=results.map(result=>{if(!finalistIds.has(result.variant.configId))return result;qualificationMemory(input,result.binding.strategyId,`finalist:${result.variant.configId}:replay:before`);const full=evaluateVariant(input,result.binding.strategyId,result.variant);qualificationMemory(input,result.binding.strategyId,`finalist:${result.variant.configId}:replay:after`);return{...result,pipeline:full.pipeline}});
  const survivors = hydrated.filter((result) => result.status === "FORWARD_VALIDATION_CANDIDATE").sort((a, b) => b.researchScore - a.researchScore || a.variant.configId.localeCompare(b.variant.configId));
  const market = input.assetClass === "CRYPTO" ? "CRYPTO" : "FOREX", setId = `${market}_${input.policy.product}_QUALIFIED_SET` as QualifiedStrategySet["id"];
  const entries = survivors.map((result) => Object.freeze({ strategyId: result.binding.strategyId, strategyVersion: result.binding.strategyVersion, configId: result.variant.configId, configVersion: result.variant.configVersion, qualificationStatus: result.status, supportedSymbols: result.binding.supportedSymbols, supportedTimeframes: result.binding.supportedTimeframes, researchRunIds: Object.freeze([result.pipeline.runHash]), strategyParameters: Object.freeze({ ...result.variant.strategyParameters }) }));
  if (!Number.isFinite(Date.parse(input.certificationDate))) throw new Error("INVALID_CERTIFICATION_DATE");
  const setCore = { version: "qualified-strategy-set/v1" as const, id: setId, setVersion: digest({ campaignId: input.campaignId, policy: input.policy.version, entries }, "set"), frozen: true, product: input.policy.product, researchPolicyVersion: input.policy.version, certifiedAt: new Date(input.certificationDate).toISOString(), entries: Object.freeze(entries) };
  const qualifiedSet = deepFreeze(setCore) as QualifiedStrategySet;
  const core = { version: "qualification-campaign/v1" as const, campaignId: input.campaignId, status: "COMPLETED" as const, policyVersion: input.policy.version, variantsTested: hydrated.length, eliminated: hydrated.filter((result) => result.stageReached === "ELIMINATED").length, survivors, results:hydrated, recommendation: survivors.length ? "QUALIFIED_WINNERS" as const : "NO_ROBUST_CONFIGURATION_FOUND" as const, qualifiedSet };
  return { ...core, campaignHash: digest({ ...core, results: results.map((result) => ({ config: result.variant, status: result.status, score: result.researchScore, runHash: result.pipeline.runHash })) }, "campaign") };
}

export function autoQualifiedSet(campaigns: readonly QualificationCampaignResult[], product: "PERSONAL" | "PROP", policyVersion: string): QualifiedStrategySet {
  const entries = campaigns.filter((campaign) => campaign.policyVersion === policyVersion && campaign.qualifiedSet.product === product).flatMap((campaign) => campaign.qualifiedSet.entries);
  return deepFreeze({ version: "qualified-strategy-set/v1", id: "AUTO_QUALIFIED_SET", setVersion: digest({ product, policyVersion, entries }, "auto-set"), frozen: false, product, researchPolicyVersion: policyVersion, certifiedAt: new Date(0).toISOString(), entries }) as QualifiedStrategySet;
}

export function freezeQualifiedForwardCandidate(result: QualifiedVariantResult, qualifiedSet: QualifiedStrategySet, input: CandidatePipelineInput, context: { approvedAt: string; propProfileId?: string; accountSize?: number; hashibotSafetyPolicyVersion?: string }) {
  if (result.status !== "FORWARD_VALIDATION_CANDIDATE") throw new Error("CONFIG_NOT_FORWARD_CANDIDATE");
  return deepFreeze({ version: "qualified-forward-config/v1", strategyId: result.binding.strategyId, strategyVersion: result.binding.strategyVersion, configId: result.variant.configId, configVersion: result.variant.configVersion, strategyParameters: result.variant.strategyParameters, researchPolicyParameters: result.variant.researchPolicyParameters, symbols: [...new Set(input.datasets.map((dataset) => dataset.symbol))], timeframes: [...new Set(input.datasets.map((dataset) => dataset.timeframe))], riskPolicy: input.riskPolicy, capitalPolicy: input.portfolioPolicy, executionModel: input.executionModel, researchEvidence: { pipelineRunHash: result.pipeline.runHash, researchScore: result.researchScore, stageEvidence: result.stages }, propProfileId: context.propProfileId ?? null, accountSize: context.accountSize ?? input.initialAccount.balance, hashibotSafetyPolicyVersion: context.hashibotSafetyPolicyVersion ?? null, researchPolicyVersion: qualifiedSet.researchPolicyVersion, qualifiedSetVersion: qualifiedSet.setVersion, approvedAt: context.approvedAt, immutable: true });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
