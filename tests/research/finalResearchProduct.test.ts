import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  certify,
  freezeForwardCandidate,
  groupedAnalysis,
  metrics,
  monteCarlo,
  parameterRobustness,
  portfolio,
  splitOos,
  stress,
  validateResearchRun,
  walkForward,
  type ResearchRunContract,
} from "../../src/lib/research/researchValidation";
import type { CanonicalCompletedTradeResult } from "../../supabase/functions/_shared/trading-domain/contracts.ts";
import {
  historicalQualityGate,
  normalizeAndValidate,
} from "../../src/lib/historicalData/validation";
const trade = (
  i: number,
  r: number,
  symbol = "EURUSD",
  strategy = "forex.london-breakout",
): CanonicalCompletedTradeResult => {
  const opened = new Date(Date.UTC(2024, 0, 1 + i * 7)).toISOString(),
    closed = new Date(Date.UTC(2024, 0, 2 + i * 7)).toISOString(),
    risk = 100;
  return {
    version: "completed-trade-result/v1",
    tradeId: `${strategy}:${symbol}:${i}`,
    strategyId: strategy,
    strategyVersion: "1.0.0",
    configurationVersion: "reference/v1",
    symbol,
    market: symbol === "XAUUSD" ? "METALS" : "FOREX",
    primaryTimeframe: "15m",
    datasetIds: [`dataset:${symbol}`],
    entryIntent: 1.1,
    fill: {
      price: 1.1,
      timestamp: opened,
      quantity: 1,
      provenance: "HISTORICAL_SIMULATION",
      observationId: `fill:${i}`,
    },
    stop: 1.09,
    targets: [1.11, 1.12],
    exits: [
      {
        price: r >= 0 ? 1.1 + r * 0.01 : 1.1 + r * 0.01,
        timestamp: closed,
        fraction: 1,
        reason: r > 0 ? "TARGET" : "STOP",
        eventId: `exit:${i}`,
      },
    ],
    closePrice: 1.1 + r * 0.01,
    closeReason: r > 0 ? "TARGET" : "STOP",
    openedAt: opened,
    closedAt: closed,
    grossR: r + 0.1,
    netR: r,
    grossPnl: (r + 0.1) * risk,
    netPnl: r * risk,
    costs: {
      version: "cost/v1",
      spread: 2,
      slippage: 2,
      commission: 6,
      financing: 0,
      latencyMs: 0,
      currency: "USD",
    },
    ambiguity: {
      ambiguousBars: i % 17 === 0 ? 1 : 0,
      unresolved: 0,
      conservativeStopFirst: i % 17 === 0 ? 1 : 0,
      resolutionMethods: i % 17 === 0 ? ["CONSERVATIVE_STOP_FIRST"] : [],
    },
    provenance: "HISTORICAL_SIMULATION",
    lifecycleEventIds: [`exit:${i}`],
    runReference: "canonical-run",
  };
};
const trades = Array.from({ length: 60 }, (_, i) =>
  trade(i, i % 3 === 0 ? -1 : i % 5 === 0 ? 0 : 1.2),
);
const run: ResearchRunContract = {
  runId: "run-1",
  runHash: "hash-1",
  strategyId: "forex.london-breakout",
  strategyVersion: "1.0.0",
  configurationVersion: "reference/v1",
  symbols: ["EURUSD"],
  timeframes: ["15m", "1h"],
  datasetIds: ["dataset:EURUSD"],
  dateRange: { from: trades[0].openedAt, to: trades.at(-1)!.closedAt },
  trainingRange: null,
  validationRange: null,
  executionModel: {
    version: "cost/v1",
    provenance: "HISTORICAL_ESTIMATE",
    spread: 120,
    slippage: 120,
    commission: 360,
    swap: 0,
  },
  riskPolicyVersion: "risk/v1",
  capitalPolicyVersion: "capital/v1",
  tradeManagementPolicyVersion: "tm/v1",
  initialBalance: 100000,
  currency: "USD",
  createdAt: trades[0].openedAt,
  status: "COMPLETED",
  verificationLevel: "HISTORICAL",
  trades,
  seed: 42,
};
assert.equal(validateResearchRun(run).status, "PASS");
const quality = normalizeAndValidate(
  [{ timestamp: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  "15m",
  { from: 0, to: 0 },
);
assert.equal(historicalQualityGate(quality.quality).status, "FAIL");
const base = metrics(trades, 100000);
assert.equal(base.trades, 60);
assert.ok(base.costs > 0);
assert.ok(Object.keys(base.monthly).length > 1);
const oos = splitOos(run, 70);
assert.equal(oos.inSample.trades, 42);
assert.equal(oos.outOfSample.trades, 18);
assert.ok(
  Date.parse(oos.trainingRange.to) < Date.parse(oos.validationRange.from),
);
const wf = walkForward(run, 90, 30, 30);
assert.ok(
  wf.windows.every(
    (w) => Date.parse(w.trainingEnd) === Date.parse(w.testStart),
  ),
);
assert.equal(
  wf.aggregateOos.trades,
  wf.windows.reduce((n, w) => n + w.test.trades, 0),
);
const stressed = stress(run, "SPREAD_2X");
assert.ok(stressed.metrics.netR < base.netR);
const mc1 = monteCarlo(run, 1000, 42, "TRADE_ORDER_PERMUTATION", 10),
  mc2 = monteCarlo(run, 1000, 42, "TRADE_ORDER_PERMUTATION", 10);
assert.deepEqual(mc1, mc2);
assert.equal(mc1.label, "EMPIRICAL_MONTE_CARLO_FREQUENCY");
for (const p of ["p5", "p25", "p50", "p75", "p95"])
  assert.ok(p in mc1.maxDrawdownR);
const groups = groupedAnalysis(run);
assert.ok(groups.direction.LONG);
assert.ok(Object.keys(groups.session).length);
assert.ok(Object.keys(groups.regime).length);
const other = {
  ...run,
  runId: "run-2",
  runHash: "hash-2",
  symbols: ["XAUUSD"],
  datasetIds: ["dataset:XAUUSD"],
  trades: trades
    .slice(0, 20)
    .map((t, i) => trade(i, 0.5, "XAUUSD", "gold.volatility-breakout")),
};
const port = portfolio([run, other], {
  initialBalance: 100000,
  maxConcurrentPositions: 1,
  maxOpenRiskR: 1,
  oneActivePerSymbol: true,
});
assert.ok(port.trades.length);
assert.ok(port.rejected.length);
assert.ok(
  port.rejected.every((r) =>
    [
      "SYMBOL_ALREADY_ACTIVE",
      "PORTFOLIO_RISK_LIMIT",
      "CAPITAL_UNAVAILABLE",
    ].includes(r.reason),
  ),
);
const robust = parameterRobustness(run, [
  {
    ...run,
    runId: "variant",
    runHash: "variant-hash",
    configurationVersion: "candidate/v1",
  },
]);
assert.equal(robust.rows.length, 2);
const certification = certify({
  run,
  oos,
  walk: wf,
  stresses: [stress(run, "BASELINE"), stressed],
  monte: mc1,
  policy: {
    minimumTrades: 30,
    minimumOOSTrades: 10,
    minimumPF: 0.5,
    minimumExpectancyR: -1,
    maximumDrawdownR: 50,
    minimumWalkForwardConsistency: 0,
    maximumOOSDegradation: 10,
    stressMinimumPF: 0.1,
    monteCarloMaxDdP95: 50,
  },
});
assert.notEqual(certification.status, "PRODUCTION_APPROVED");
const frozen = freezeForwardCandidate(
  run,
  { threshold: 1 },
  {
    profileId: "FTMO_TWO_STEP",
    accountSize: 100000,
    safetyPolicyVersion: "safety/v1",
  },
  "2026-09-10T00:00:00Z",
);
assert.ok(Object.isFrozen(frozen));
assert.throws(() => {
  (frozen.parameters as { threshold: number }).threshold = 2;
});
const ui = readFileSync(
    "src/pages/admin/backtest/ResearchValidationWorkspace.tsx",
    "utf8",
  ),
  page = readFileSync("src/pages/admin/BacktestLab.tsx", "utf8");
assert.match(page, /PhaseMOperationsPanel/);assert.match(page,/ProductPortfolioResearch/);
for (const label of [
  "OOS",
  "WALK_FORWARD",
  "STRESS",
  "MONTE_CARLO",
  "MULTI_ASSET",
  "COMPARISON",
  "PROP_VALIDATION",
  "CERTIFICATION",
  "TRADES",
  "FAILURES",
  "FREEZE FORWARD CANDIDATE",
])
  assert.ok(ui.includes(label), label);
console.log("final research product tests passed");
