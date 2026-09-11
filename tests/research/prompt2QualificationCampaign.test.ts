import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROP_PROFILES,
  type PropAccountConfiguration,
} from "../../src/lib/prop/professionalPropEngine.ts";
import type {
  CandidatePipelineInput,
  PipelineDataset,
} from "../../src/lib/research/canonicalPipelineReplay.ts";
import { runCandidatePipelineReplay } from "../../src/lib/research/canonicalPipelineReplay.ts";
import {
  CALIBRATION_PARAMETER_REGISTRY,
  assessParameterNeighborhood,
  DEFAULT_QUALIFICATION_WEIGHTS,
  autoQualifiedSet,
  freezeQualifiedForwardCandidate,
  generateCalibrationVariants,
  runQualificationCampaign,
  scoreResearchObjectives,
  type QualificationPolicy,
  type ResearchScoreComponents,
} from "../../src/lib/research/strategyQualification.ts";
import { CANONICAL_STRATEGIES } from "../../supabase/functions/_shared/trading-domain/strategies.ts";
import { resolveCanonicalStrategyParameters } from "../../supabase/functions/_shared/trading-domain/strategies.ts";
import { evaluateCryptoTrendPullback } from "../../supabase/functions/_shared/professional-strategies.ts";
import { ForexLondonBreakout } from "../../supabase/functions/_shared/forex-research-strategies.ts";
import { evaluateGoldVolatilityBreakout } from "../../supabase/functions/_shared/gold-volatility-breakout.ts";

const DAY = 86_400_000;
function cryptoDatasets(): PipelineDataset[] {
  const end = Date.UTC(2026, 8, 1), values: number[] = [];
  let price = 100;
  for (let index = 0; index < 45; index += 1) { price += 0.5; values.push(price); }
  for (let index = 0; index < 15; index += 1) { price += index % 2 === 0 ? -1 : 1; values.push(price); }
  const primary = values.map((close, index) => ({ timestamp: end - (values.length - index) * DAY, open: close, high: close, low: close, close, volume: 100 }));
  primary.push({ timestamp: end, open: price, high: price * 1.25, low: price * 0.995, close: price * 1.1, volume: 200 });
  for (let index = 1; index <= 25; index += 1) primary.push({ timestamp: end + index * DAY, open: price + index * 0.5, high: price + index * 0.5, low: price + index * 0.5, close: price + index * 0.5, volume: 100 });
  const hourly = Array.from({ length: 90 }, (_, index) => ({ timestamp: end - (90 - index) * DAY, open: 80 + index * 0.5, high: 80 + index * 0.5, low: 80 + index * 0.5, close: 80 + index * 0.5, volume: 400 }));
  return [
    { datasetId: "BINANCE:BTCUSDT:15m:qualification", symbol: "BTCUSDT", timeframe: "15m", provider: "BINANCE", bars: primary },
    { datasetId: "BINANCE:BTCUSDT:1h:qualification", symbol: "BTCUSDT", timeframe: "1h", provider: "BINANCE", bars: hourly },
  ];
}
const pipelineInput: CandidatePipelineInput = {
  datasets: cryptoDatasets(), strategyIds: ["crypto.trend-pullback"], configurationVersion: "production/reference-immutable", parameters: {},
  initialAccount: { balance: 100_000, equity: 100_000, availableCapital: 100_000, currentOpenRisk: 0, dailyLoss: 0, drawdownPercent: 0, exposedSymbols: [] },
  riskPolicy: { version: "risk/reference-v1", riskPercent: 1, maxOpenRisk: 10_000, maxDailyLoss: 5_000, maxDrawdownPercent: 10 },
  portfolioPolicy: { minimumScore: 0, oneActivePerSymbol: true, maximumConcurrentPositions: 2, maximumTotalOpenRisk: 5_000, maximumPortfolioExposure: 100_000, perSymbolExposure: {}, perStrategyExposure: {}, maxAllocationPerTrade: 2_000 },
  executionModel: { version: "binance/research-v1", currency: "USD", provenance: "HISTORICAL_ESTIMATE", crypto: { liquidity: "TAKER", makerFeeRate: 0.0002, takerFeeRate: 0.0005, slippageRate: 0.0001, quantityStep: 0.001, minimumQuantity: 0.001 } },
  runReference: "qualification-fixture",
};
const lenientPolicy: QualificationPolicy = {
  id: "crypto-personal-research", version: "crypto-personal/v1", product: "PERSONAL", minimumTrades: 1, minimumOosTrades: 1,
  minimumIsExpectancyR: -10, minimumOosExpectancyR: -10, minimumOosProfitFactor: 0, minimumWalkForwardConsistencyPct: 0,
  minimumStressProfitFactor: 0, maximumMonteCarloDrawdownR95: 100, maximumIsOosExpectancyDivergence: 100,
  maximumSingleRegimeContributionPct: 100, maximumSingleSymbolContributionPct: 100, minimumResearchScore: 0,
  requireFullPropPipeline: false, requireFundedSurvival: false, weights: DEFAULT_QUALIFICATION_WEIGHTS,
};

for (const strategy of Object.values(CANONICAL_STRATEGIES)) {
  const parameters = CALIBRATION_PARAMETER_REGISTRY[strategy.id];
  assert.ok(parameters.length >= 1, `${strategy.id} has an explicit bounded registry`);
  assert.ok(parameters.every((parameter) => parameter.productionMutationAllowedAutomatically === false));
}
const randomA = generateCalibrationVariants({ strategyId: "crypto.trend-pullback", method: "RANDOM_SEEDED", seed: 42, maximumVariants: 6 });
const randomB = generateCalibrationVariants({ strategyId: "crypto.trend-pullback", method: "RANDOM_SEEDED", seed: 42, maximumVariants: 6 });
assert.deepEqual(randomA, randomB);
assert.deepEqual(generateCalibrationVariants({ strategyId: "crypto.trend-pullback", method: "LATIN_HYPERCUBE", seed: 7, maximumVariants: 5 }), generateCalibrationVariants({ strategyId: "crypto.trend-pullback", method: "LATIN_HYPERCUBE", seed: 7, maximumVariants: 5 }));
assert.deepEqual(assessParameterNeighborhood(randomA[0], randomA.slice(1, 3).map(variant => ({ variant, survived: false }))), { stabilityPct: 0, fragile: true, reasonCodes: ["FRAGILE_PARAMETER_REGION"] }, "an isolated profitable spike is explicitly fragile");
assert.throws(() => resolveCanonicalStrategyParameters("forex.new-york-continuation", { minimumMoveAtr: 4, maximumMoveAtr: 3 }), /MOVE_RANGE/);
assert.throws(() => resolveCanonicalStrategyParameters("crypto.reversal-exhaustion", { rsiExtreme: 55 }), /RSI_EXTREME/);

const cryptoAt = "2026-09-01T00:00:00.000Z";
const cryptoContext = { symbol: "BTCUSDT", market: "crypto" as const, timeframe: "15m", evaluated_at: cryptoAt, candles: Array.from({ length: 55 }, (_, index) => ({ symbol: "BTCUSDT", market_type: "crypto" as const, timeframe: "15m", open_time: new Date(Date.parse(cryptoAt) - (55-index)*900_000).toISOString(), open: 100, high: 101, low: 99, close: 100, volume: 1, source: "binance" })), indicators: { ema20: 100, ema50: 99, atr14: 2, rsi14: 50, recent_high: 102, recent_low: 98, avg_volume: 1, body_size: 0, atr_pct: 2, range_compression_ratio: 1, momentum_score: 1, volatility_state: "normal", regime: "trend_up" } };
const cryptoReference = evaluateCryptoTrendPullback(cryptoContext);
const cryptoVariant = evaluateCryptoTrendPullback({ ...cryptoContext, strategy_parameters: { pullbackAtr: .55, stopAtr: 1.8 } });
assert.equal(cryptoReference.status, "candidate");
assert.notEqual(cryptoReference.stop_loss, cryptoVariant.stop_loss, "crypto formula parameter changes the actual evaluator plan");
const referencePipeline = runCandidatePipelineReplay(pipelineInput);
const calibratedPipeline = runCandidatePipelineReplay({ ...pipelineInput, parameters: { "crypto.trend-pullback": { pullbackAtr: .65, stopAtr: 1.8 } } });
assert.ok(referencePipeline.accepted.length && calibratedPipeline.accepted.length);
assert.notEqual(referencePipeline.accepted[0].candidate.stop, calibratedPipeline.accepted[0].candidate.stop, "Prompt 1 passes strategy parameters into the canonical evaluator before replay");

function forexFixture() {
  const at = "2026-01-15T09:00:00.000Z";
  const candles = Array.from({ length: 60 }, (_, index) => { const base = 1.1 + index * .00002, last = index === 59, close = base + (last ? .0007 : 0); return { symbol: "EURUSD", market_type: "forex" as const, timeframe: "15m", open_time: new Date(Date.parse(at) - (60-index)*900000).toISOString(), open: base, high: close + .00025, low: base - .00025, close, volume: 1000, source: "fixture" }; });
  const close = candles.at(-1)!.close;
  return { symbol: "EURUSD", market: "forex" as const, timeframe: "15m", candles, evaluated_at: at, indicators: { ema20: close-.0002, ema50: close-.0006, atr14: .001, rsi14: 56, recent_high: close, recent_low: 1.09, avg_volume: 1000, body_size: .0007, atr_pct: .1, range_compression_ratio: .7, momentum_score: .5, volatility_state: "normal", regime: "trend_up" } };
}
assert.equal(ForexLondonBreakout.evaluate(forexFixture()).status, "candidate");
assert.equal(ForexLondonBreakout.evaluate({ ...forexFixture(), strategy_parameters: { bodyAtr: 2, extensionAtr: .9 } }).rejection_reason, "breakout_unconfirmed", "forex formula parameter reaches its evaluator");

function goldFixture() {
  const evaluated_at = "2026-01-15T15:00:00.000Z";
  const candles = Array.from({ length: 70 }, (_, index) => { const center=2641+(index%2?.75:-.75); return { symbol:"XAUUSD",market_type:"forex" as const,timeframe:"15m",open_time:new Date(Date.parse(evaluated_at)-(70-index)*900000).toISOString(),open:center-.08,high:center+.16,low:center-.16,close:center+.08,volume:1000,source:"mt5" }; });
  candles[68]={...candles[68],open:2641.75,low:2641.7,high:2642.52,close:2642.45}; candles[69]={...candles[69],open:2642.48,low:2642.4,high:2642.78,close:2642.7};
  return { symbol:"XAUUSD",market:"forex" as const,timeframe:"15m",candles,evaluated_at,indicators:{ema20:2641.5,ema50:2641,atr14:1,rsi14:61,recent_high:2642,recent_low:2640,avg_volume:1000,body_size:.22,atr_pct:.04,range_compression_ratio:.4,momentum_score:.7,volatility_state:"normal",regime:"trend_up"} };
}
assert.equal(evaluateGoldVolatilityBreakout(goldFixture()).status, "candidate");
assert.equal(evaluateGoldVolatilityBreakout({ ...goldFixture(), strategy_parameters: { minimumBodyAtr: 2, minimumAcceptanceAtr: .08 } }).rejection_reason, "gold_failed_follow_through", "gold formula parameter reaches its evaluator");

const robust: ResearchScoreComponents = { oosExpectancy: 75, oosProfitFactor: 75, walkForwardConsistency: 75, returnDrawdown: 70, parameterStability: 80, stressResilience: 75, monteCarloResilience: 75, portfolioRobustness: 70, historicalPropPerformance: 70, fundedSurvival: 70, costSensitivity: 75, sampleSize: 80 };
const highRawOverfit: ResearchScoreComponents = { ...robust, returnDrawdown: 100, oosExpectancy: 30, oosProfitFactor: 35, parameterStability: 10, stressResilience: 25 };
assert.ok(scoreResearchObjectives(robust, DEFAULT_QUALIFICATION_WEIGHTS, 0) > scoreResearchObjectives(highRawOverfit, DEFAULT_QUALIFICATION_WEIGHTS, 35), "robust OOS evidence outranks high raw profit with overfit penalties");

const campaignInput = { campaignId: "crypto-personal-campaign", certificationDate: "2026-09-10T00:00:00.000Z", assetClass: "CRYPTO" as const, strategyInputs: { "crypto.trend-pullback": pipelineInput }, strategyIds: ["crypto.trend-pullback"], searchMethod: "RANDOM_SEEDED" as const, seed: 42, maximumVariantsPerStrategy: 4, policy: lenientPolicy };
const campaign = runQualificationCampaign(campaignInput), repeated = runQualificationCampaign(campaignInput);
assert.deepEqual(campaign, repeated, "seeded campaign is reproducible");
assert.equal(campaign.qualifiedSet.id, "CRYPTO_PERSONAL_QUALIFIED_SET");
assert.equal(campaign.variantsTested, 4);
assert.ok(campaign.survivors.length > 0);
assert.ok(campaign.results.every((result) => result.stages.length > 0));

const noWinner = runQualificationCampaign({ ...campaignInput, campaignId: "no-winner", policy: { ...lenientPolicy, version: "reject/v1", minimumOosExpectancyR: 999 } });
assert.equal(noWinner.recommendation, "NO_ROBUST_CONFIGURATION_FOUND");
assert.ok(noWinner.results.some((result) => result.eliminationReasons.includes("NEGATIVE_OOS_EXPECTANCY")));
assert.ok(noWinner.results.some((result) => result.evidence.inSample.netR > 0 && result.stageReached === "ELIMINATED"), "profitable IS evidence cannot bypass a bad OOS gate");

const propConfig: PropAccountConfiguration = { id: "crypto-prop", label: "Crypto custom Prop", profileId: "CUSTOM", profileVersion: PROP_PROFILES.CUSTOM.profileVersion, accountSize: 100_000, currency: "USD", mode: "HISTORICAL_PROP_SIMULATION", provider: "HISTORICAL", realPropActivationConfirmed: false, monthlyIncomeObjectivePct: 2, softProfitGuardPct: 1.7, noNewEntriesPct: 2, internalDailyLossLockPct: 2, retainedBufferPct: 0.5, control: "START" };
const propCampaign = runQualificationCampaign({ ...campaignInput, campaignId: "crypto-prop-campaign", policy: { ...lenientPolicy, id: "crypto-prop", version: "crypto-prop/v1", product: "PROP", requireFullPropPipeline: true, requireFundedSurvival: true }, prop: { profile: PROP_PROFILES.CUSTOM, config: propConfig, fundedSurvivalDays: 30 } });
assert.equal(propCampaign.qualifiedSet.id, "CRYPTO_PROP_QUALIFIED_SET");
assert.notDeepEqual(propCampaign.qualifiedSet.entries, campaign.qualifiedSet.entries, "Personal and Prop policies qualify independently");
assert.ok(propCampaign.results.some((result) => result.stages.some((stage) => stage.stage === "FULL_PROP_PIPELINE")), "Prop qualification consumes Prompt 1 full-pipeline evidence");

const winner = campaign.survivors[0];
const frozen = freezeQualifiedForwardCandidate(winner, campaign.qualifiedSet, pipelineInput, { approvedAt: "2026-09-10T01:00:00.000Z", propProfileId: "CUSTOM", accountSize: 100_000, hashibotSafetyPolicyVersion: "safety/v1" });
assert.equal(Object.isFrozen(frozen), true);
assert.equal(Object.isFrozen(frozen.strategyParameters), true);
assert.equal(frozen.hashibotSafetyPolicyVersion, "safety/v1");
assert.throws(() => { (frozen.strategyParameters as Record<string, number>).stopAtr = 9; }, TypeError);
assert.deepEqual(campaign.qualifiedSet.entries[0]?.strategyParameters, winner.variant.strategyParameters, "qualified set pins formula parameters");
assert.deepEqual(frozen.strategyParameters, winner.variant.strategyParameters, "forward freeze pins formula parameters");
assert.equal(pipelineInput.configurationVersion, "production/reference-immutable", "calibration never mutates production configuration");
const auto = autoQualifiedSet([campaign, propCampaign], "PERSONAL", "crypto-personal/v1");
assert.equal(auto.id, "AUTO_QUALIFIED_SET");
assert.deepEqual(auto.entries, campaign.qualifiedSet.entries);

const ui = readFileSync("src/pages/admin/backtest/ResearchValidationWorkspace.tsx", "utf8");
for (const label of ["CALIBRATE", "RUN QUALIFICATION CAMPAIGN", "RUN FULL VALIDATION", "COMPARE VARIANTS", "FREEZE FORWARD CANDIDATE"]) assert.match(ui, new RegExp(label));
assert.match(readFileSync("src/lib/prop/propProductRepository.ts", "utf8"), /mode_slug: "qualification_campaign"/);

console.log("prompt 2 qualification campaign tests passed",JSON.stringify({campaignHash:campaign.campaignHash,variants:campaign.variantsTested,eliminated:campaign.eliminated,survivors:campaign.survivors.length,recommendation:campaign.recommendation,winner:campaign.survivors[0]?{strategyVersion:campaign.survivors[0].binding.strategyVersion,configVersion:campaign.survivors[0].variant.configVersion,parameters:campaign.survivors[0].variant.strategyParameters}:null,frozenVersion:frozen.version,qualifiedSetVersion:campaign.qualifiedSet.setVersion,noWinner:noWinner.recommendation}));
