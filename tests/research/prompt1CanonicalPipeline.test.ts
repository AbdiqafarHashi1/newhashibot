import assert from "node:assert/strict";
import {
  runCandidatePipelineReplay,
  runPathAwareStress,
  type CandidatePipelineInput,
  type PipelineDataset,
} from "../../src/lib/research/canonicalPipelineReplay.ts";
import {
  identifyFastPropReplay,
  runFullPropPipelineReplay,
  runRollingFullPropChallenges,
} from "../../src/lib/research/fullPropPipelineReplay.ts";
import {
  PROP_PROFILES,
  type PropAccountConfiguration,
} from "../../src/lib/prop/professionalPropEngine.ts";

const step = 900_000, end = Date.UTC(2026, 8, 9, 12);
function trend(symbol: string, provider: PipelineDataset["provider"], offset = 0): PipelineDataset[] {
  const values: number[] = [];
  let price = 100 + offset;
  for (let i = 0; i < 45; i++) { price += 0.5; values.push(price); }
  for (let i = 0; i < 15; i++) { price += i % 2 === 0 ? -1 : 1; values.push(price); }
  const primary = values.map((close, i) => ({ timestamp: end - (values.length - i) * step, open: close, high: close, low: close, close, volume: 100 }));
  // Genuine retained future path: target, then another setup period and stop path.
  primary.push({ timestamp: end, open: price, high: price * 1.2, low: price * 0.995, close: price * 1.1, volume: 200 });
  primary.push(...Array.from({ length: 20 }, (_, i) => ({ timestamp: end + (i + 1) * step, open: price + i * 0.5, high: price + i * 0.5, low: price + i * 0.5, close: price + i * 0.5, volume: 100 })));
  const hourly = Array.from({ length: 80 }, (_, i) => ({ timestamp: end - (80 - i) * 3_600_000, open: 80 + i * 0.5, high: 80 + i * 0.5, low: 80 + i * 0.5, close: 80 + i * 0.5, volume: 400 }));
  return [
    { datasetId: `${provider}:${symbol}:15m`, symbol, timeframe: "15m", provider, bars: primary },
    { datasetId: `${provider}:${symbol}:1h`, symbol, timeframe: "1h", provider, bars: hourly },
  ];
}
const base = (datasets: PipelineDataset[], strategyIds = ["crypto.trend-pullback"]): CandidatePipelineInput => ({
  datasets,
  strategyIds,
  configurationVersion: "reference/v1",
  initialAccount: { balance: 100_000, equity: 100_000, availableCapital: 100_000, currentOpenRisk: 0, dailyLoss: 0, drawdownPercent: 0, exposedSymbols: [] },
  riskPolicy: { version: "risk/v1", riskPercent: 1, maxOpenRisk: 10_000, maxDailyLoss: 10_000, maxDrawdownPercent: 10 },
  portfolioPolicy: { minimumScore: 0, oneActivePerSymbol: true, maximumConcurrentPositions: 2, maximumTotalOpenRisk: 3_000, maximumPortfolioExposure: 3_000, perSymbolExposure: {}, perStrategyExposure: {}, maxAllocationPerTrade: 1_000 },
  executionModel: { version: "exchange/v1", currency: "USD", provenance: "HISTORICAL_ESTIMATE", crypto: { liquidity: "TAKER", makerFeeRate: 0.0002, takerFeeRate: 0.0005, slippageRate: 0.0001, quantityStep: 0.001, minimumQuantity: 0.001 } },
  runReference: "prompt1",
});

const binance = runCandidatePipelineReplay(base(trend("BTCUSDT", "BINANCE")));
assert.ok(binance.trades.length > 0, "Binance candles must create canonical crypto trades");
assert.equal(binance.trades[0].market, "CRYPTO");
assert.match(binance.trades[0].costs.version, /crypto:taker/);
assert.ok(binance.trades[0].costs.commission > 0);
assert.ok(binance.regimes.every((r) => r.lastInputOpenTime < r.timestamp), "regime only uses closed candles");

const bybit = runCandidatePipelineReplay(base(trend("BTCUSDT", "BYBIT")));
assert.ok(bybit.trades.length > 0, "Bybit candles must create canonical crypto trades");
assert.deepEqual(runCandidatePipelineReplay(base(trend("BTCUSDT", "BYBIT"))), bybit, "portfolio replay is deterministic");

const mixed = runCandidatePipelineReplay(base([
  ...trend("BTCUSDT", "BINANCE"),
  ...trend("ETHUSDT", "BYBIT", 30),
]));
assert.ok(mixed.rejected.some((r) => r.reasonCodes.includes("LOWER_RANK")), "simultaneous candidates arbitrate before replay");
const rejectedIds = new Set(mixed.rejected.map((r) => r.candidateId));
assert.ok(mixed.trades.every((t) => !rejectedIds.has(t.tradeId.replace(/^trade:/, ""))), "rejected opportunities cannot become trades");
assert.ok(mixed.exposureTimeline.length && mixed.capitalTimeline.length);
assert.ok(mixed.accepted.every((a) => a.accountBefore.currentOpenRisk <= 3_000), "acceptance snapshots precede outcomes");

const pathTrade = binance.accepted[0];
assert.ok(runPathAwareStress(pathTrade, "ENTRY_DELAY_1_BAR").result, "entry delay replays retained observations");
assert.equal(runPathAwareStress(pathTrade, "WORSE_FILL").provenance, "RETAINED_CANDLE_PATH");

const config: PropAccountConfiguration = {
  id: "prop", label: "Historical full pipeline", profileId: "FTMO_TWO_STEP", profileVersion: PROP_PROFILES.FTMO_TWO_STEP.profileVersion,
  accountSize: 100_000, currency: "USD", mode: "HISTORICAL_PROP_SIMULATION", provider: "HISTORICAL", realPropActivationConfirmed: false,
  monthlyIncomeObjectivePct: 2, softProfitGuardPct: 1.7, noNewEntriesPct: 2, internalDailyLossLockPct: 2, retainedBufferPct: 0.5, control: "START",
};
const full = runFullPropPipelineReplay({ ...base(trend("BTCUSDT", "BINANCE")), propConfig: config, propProfile: PROP_PROFILES.FTMO_TWO_STEP, propSnapshot: { timestamp: new Date(end).toISOString(), startingBalance: 100_000, balance: 100_000, equity: 100_000, startOfDayBalance: 100_000, closedPnl: 0, floatingPnl: 0, dailyClosedPnl: 0, openRisk: 0, openPositions: 0, pendingExecutableOrders: 0, tradingDays: 0, brokerTruth: false } });
assert.equal(full.mode, "FULL_PROP_PIPELINE_REPLAY");
assert.ok(full.propDecisions.length);
assert.equal(identifyFastPropReplay(), "FAST_PROP_REPLAY");
assert.notDeepEqual(full.pipeline.runHash, binance.runHash, "full and fast modes retain distinct provenance");
const soft = runFullPropPipelineReplay({ ...base(trend("BTCUSDT", "BINANCE")), propConfig: { ...config, softProfitGuardPct: 0.5, noNewEntriesPct: 5, internalDailyLossLockPct: 4 }, propProfile: PROP_PROFILES.FTMO_TWO_STEP, propSnapshot: { ...full.endingSnapshot, timestamp: new Date(end).toISOString(), balance: 100_000, equity: 100_000, closedPnl: 0, dailyClosedPnl: 0, openPositions: 0 } });
assert.ok(soft.propDecisions.some((d) => d.decision === "REDUCE" && d.riskMultiplier < 1), "soft guard reduces a later candidate before planning");
const locked = runFullPropPipelineReplay({ ...base(trend("BTCUSDT", "BINANCE")), propConfig: config, propProfile: PROP_PROFILES.FTMO_TWO_STEP, propSnapshot: { ...full.endingSnapshot, timestamp: new Date(end).toISOString(), balance: 97_500, equity: 97_500, closedPnl: -2_500, dailyClosedPnl: -2_500, openPositions: 0 } });
assert.ok(locked.propDecisions.every((d) => d.decision === "BLOCK" && d.state === "DAILY_SAFETY_LOCK"));
const rolling=runRollingFullPropChallenges({...base(trend("BTCUSDT","BINANCE")),propConfig:config,propProfile:PROP_PROFILES.FTMO_TWO_STEP,propSnapshot:{...full.endingSnapshot,timestamp:new Date(end).toISOString(),balance:100_000,equity:100_000,closedPnl:0,dailyClosedPnl:0,openPositions:0},attempts:2,windowDays:3,cadenceDays:1,fundedSurvivalDays:30});
assert.equal(rolling.requestedAttempts,2);
assert.equal(rolling.attemptCount,rolling.validAvailableAttempts,"rolling replay caps attempts to complete historical windows");
assert.ok(rolling.attemptCount <= 2);
assert.ok(rolling.attempts.every(attempt=>attempt.initialBalance===100_000),"each challenge gets isolated starting state");
assert.deepEqual(runRollingFullPropChallenges({...base(trend("BTCUSDT","BINANCE")),propConfig:config,propProfile:PROP_PROFILES.FTMO_TWO_STEP,propSnapshot:{...full.endingSnapshot,timestamp:new Date(end).toISOString(),balance:100_000,equity:100_000,closedPnl:0,dailyClosedPnl:0,openPositions:0},attempts:2,windowDays:3,cadenceDays:1,fundedSurvivalDays:30}),rolling,"rolling replay is reproducible");

const ui = await import("node:fs").then((fs) => fs.readFileSync("src/pages/admin/backtest/ResearchValidationWorkspace.tsx", "utf8"));
assert.match(ui, /RUN RAW-BAR CANONICAL PIPELINE/);
assert.match(ui, /custom-walk-forward-controls/);
assert.match(ui, /FULL_PROP_PIPELINE/);
for(const action of ["CALIBRATE &amp; QUALIFY","RUN FULL PROP EVALUATION","RUN MULTI-CHALLENGE","START FORWARD VALIDATION"])assert.match(ui,new RegExp(action));
const singleRuntime = await import("node:fs").then((fs) => fs.readFileSync("src/pages/admin/backtest/simulationEngine.ts", "utf8"));
assert.match(singleRuntime, /const canonicalPipeline = canonicalSingleReplay/);
assert.match(singleRuntime, /CryptoReversalExhaustion: 'crypto\.reversal-exhaustion'/);

console.log("prompt 1 canonical pipeline tests passed",JSON.stringify({singleRunHash:binance.runHash,portfolioRunHash:mixed.runHash,rollingRunHashes:rolling.attempts.map(attempt=>attempt.pipelineRunHash),singleTrades:binance.trades.length,portfolioTrades:mixed.trades.length,rollingAttempts:rolling.attemptCount}));
