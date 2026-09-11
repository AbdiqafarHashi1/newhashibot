import assert from "node:assert/strict";
import {
  applyControl,
  assertRealPropActivation,
  buildChallengeWindows,
  calculatePayout,
  canonicalRunEvidence,
  confirmPayout,
  deriveMonetaryRules,
  evaluateFunded,
  fundedSnapshotsFromTrades,
  mapVirtualMt5Snapshot,
  PROP_PROFILES,
  routeSignalByAccount,
  simulateChallenge,
  simulateFullChallenge,
  simulateFullChallengeWindows,
  simulateFundedSurvival,
  simulateMultipleChallenges,
  simulatePayoutCycle,
  type HistoricalTradeEvidence,
  type PropAccountConfiguration,
  type PropAccountSnapshot,
} from "../../src/lib/prop/professionalPropEngine";
import { readFileSync } from "node:fs";
const profile = PROP_PROFILES.FTMO_TWO_STEP,
  config: PropAccountConfiguration = {
    id: "a",
    label: "FTMO $100K",
    profileId: "FTMO_TWO_STEP",
    profileVersion: profile.profileVersion,
    accountSize: 100000,
    currency: "USD",
    mode: "HISTORICAL_PROP_SIMULATION",
    provider: "HISTORICAL",
    realPropActivationConfirmed: false,
    monthlyIncomeObjectivePct: 2,
    softProfitGuardPct: 1.7,
    noNewEntriesPct: 2,
    internalDailyLossLockPct: 2,
    retainedBufferPct: 0.5,
    control: "START",
  };
assert.equal(deriveMonetaryRules(profile, 100000).dailyLossAmount, 5000);
assert.equal(deriveMonetaryRules(profile, 100000).maxLossAmount, 10000);
assert.equal(profile.phases[0].profitTargetPct, 10);
assert.equal(profile.phases[1].profitTargetPct, 5);
assert.equal(
  PROP_PROFILES.FUNDEDNEXT_STELLAR_TWO_STEP.verificationStatus,
  "PENDING_VERIFICATION",
);
assert.equal(PROP_PROFILES.CUSTOM.verificationStatus, "CUSTOM");
const evidence = (values: number[]): HistoricalTradeEvidence[] =>
  values.map((netPnl, i) => ({
    id: String(i),
    closedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    netPnl,
    provenance: "HISTORICAL_SIMULATION",
  }));
assert.equal(
  simulateChallenge(
    profile,
    config,
    "PHASE_1",
    evidence([2500, 2500, 2500, 2500]),
  ).status,
  "PASSED",
);
assert.equal(
  simulateChallenge(
    profile,
    config,
    "VERIFICATION",
    evidence([1250, 1250, 1250, 1250]),
  ).state,
  "PHASE_2_PASSED",
);
assert.equal(
  simulateChallenge(profile, config, "PHASE_1", evidence([-5100])).state,
  "FAILED_DAILY_LOSS",
);
assert.equal(
  simulateChallenge(profile, config, "PHASE_1", evidence([-4000, -4000, -2500]))
    .state,
  "FAILED_MAX_LOSS",
);
assert.equal(
  simulateChallenge(profile, config, "PHASE_1", evidence([10000]))
    .reasonCodes[0],
  "MINIMUM_TRADING_DAYS_NOT_MET",
);
assert.equal(
  simulateChallenge(
    PROP_PROFILES.FUNDEDNEXT_STELLAR_TWO_STEP,
    { ...config, profileId: "FUNDEDNEXT_STELLAR_TWO_STEP" },
    "PHASE_1",
    [],
  ).status,
  "INCOMPLETE",
);
const snapshot = (
  closedPnl: number,
  floatingPnl: number,
  openPositions: number,
  pending = 0,
): PropAccountSnapshot => ({
  timestamp: "2026-03-01T00:00:00Z",
  startingBalance: 100000,
  balance: 100000 + closedPnl,
  equity: 100000 + closedPnl + floatingPnl,
  startOfDayBalance: 100000,
  closedPnl,
  floatingPnl,
  dailyClosedPnl: 0,
  openRisk: 0,
  openPositions,
  pendingExecutableOrders: pending,
  tradingDays: 10,
  brokerTruth: false,
});
const near = evaluateFunded(config, snapshot(1820, 160, 1), profile);
assert.equal(near.state, "SOFT_PROFIT_GUARD");
assert.equal(near.entryDecision, "REDUCE");
assert.equal(near.manageExisting, true);
assert.equal(near.forceClose, false);
assert.notEqual(near.payoutStatus, "READY_TO_REQUEST");
const over = evaluateFunded(config, snapshot(2070, 0, 1), profile);
assert.equal(over.state, "MANAGE_EXISTING_POSITIONS_ONLY");
assert.equal(over.entryDecision, "BLOCK");
assert.equal(over.forceClose, false);
assert.equal(evaluateFunded(config, snapshot(2070, 0, 0), profile).flat, true);
const custom = {
    ...PROP_PROFILES.CUSTOM,
    payout: { ...PROP_PROFILES.CUSTOM.payout, waitingDays: 14 },
  },
  fundedConfig = {
    ...config,
    profileId: "CUSTOM" as const,
    profileVersion: "custom/v1",
    fundedSince: "2026-01-01T00:00:00Z",
  };
assert.equal(
  evaluateFunded(
    fundedConfig,
    snapshot(3000, 0, 0),
    custom,
    "2026-02-01T00:00:00Z",
  ).payoutStatus,
  "READY_TO_REQUEST",
);
const payout = calculatePayout(3000, 80, "WITHDRAW_RECOMMENDED", 0, 500);
assert.equal(payout.traderReward, 2400);
assert.equal(payout.requestedReward, 1900);
assert.equal(payout.retainedBuffer, 500);
assert.throws(() => confirmPayout(config, null));
assert.equal(confirmPayout(config, "operator-proof").verifiedRealPayout, false);
const normal = { config, snapshot: snapshot(0, 0, 0), profile },
  blocked = {
    config: { ...config, id: "b", control: "MANAGE_ONLY" as const },
    snapshot: snapshot(0, 0, 1),
    profile,
  },
  reduced = {
    config: { ...config, id: "c" },
    snapshot: snapshot(1820, 160, 1),
    profile,
  };
const routed = routeSignalByAccount([blocked, normal, reduced]);
assert.deepEqual(
  routed.map((r) => r.entryDecision),
  ["BLOCK", "ALLOW", "REDUCE"],
);
assert.equal(
  applyControl(config, "PAUSE_NEW_ENTRIES", snapshot(0, 0, 1)).config.control,
  "PAUSE_NEW_ENTRIES",
);
assert.equal(
  applyControl(
    { ...config, control: "EMERGENCY_STOP" },
    "START",
    snapshot(0, 0, 1),
  ).config.control,
  "EMERGENCY_STOP",
);
const multi = simulateMultipleChallenges(
  profile,
  config,
  Array.from({ length: 10 }, () => evidence([2500, 2500, 2500, 2500])),
);
assert.equal(multi.attemptCount, 10);
assert.equal(multi.historicalPassRate, 100);
assert.equal(
  simulateFundedSurvival(
    config,
    profile,
    Array.from({ length: 30 }, (_, i) => ({
      ...snapshot(0, 0, 0),
      timestamp: new Date(Date.UTC(2026, 2, i + 1)).toISOString(),
    })),
  ).daysSurvived,
  30,
);
const virtual = {
  ...config,
  mode: "VIRTUAL_PROP_ON_MT5" as const,
  provider: "MT5" as const,
};
assert.equal(
  mapVirtualMt5Snapshot(virtual, {
    timestamp: "2026-01-01T00:00:00Z",
    balance: 100100,
    equity: 100120,
    openPositions: 1,
    pendingOrders: 2,
    closedPnl: 100,
    floatingPnl: 20,
  }).brokerTruth,
  true,
);
assert.throws(
  () =>
    assertRealPropActivation(
      { ...config, mode: "REAL_PROP", realPropActivationConfirmed: false },
      profile,
    ),
  /CONFIRMATION/,
);
assert.throws(
  () =>
    assertRealPropActivation(
      {
        ...config,
        mode: "REAL_PROP",
        realPropActivationConfirmed: true,
        platform: "MT5",
      },
      profile,
    ),
  /VERIFICATION/,
);
const fullEvidence = evidence([
  2500, 2500, 2500, 2500, 1250, 1250, 1250, 1250, 100,
]);
assert.equal(fundedSnapshotsFromTrades(config, fullEvidence, 90).length, 90);
const fullChallenge = simulateFullChallenge(profile, config, fullEvidence);
assert.equal(fullChallenge.status, "FUNDED");
assert.equal(fullChallenge.phase1.state, "PHASE_1_PASSED");
assert.equal(fullChallenge.verification?.state, "PHASE_2_PASSED");
assert.equal(fullChallenge.remainingTrades.length, 1);
const randomA = buildChallengeWindows(
  fullEvidence,
  100,
  "SEEDED_RANDOM",
  60,
  42,
);
const randomB = buildChallengeWindows(
  fullEvidence,
  100,
  "SEEDED_RANDOM",
  60,
  42,
);
assert.deepEqual(randomA, randomB);
assert.equal(
  simulateFullChallengeWindows(profile, config, randomA, "canonical-run-hash")
    .attemptCount,
  100,
);
const cycleSnapshots = [
  snapshot(1820, 160, 1),
  { ...snapshot(2070, 0, 1), timestamp: "2026-03-02T00:00:00Z" },
  { ...snapshot(3000, 0, 0), timestamp: "2026-03-03T00:00:00Z" },
];
const payoutCycle = simulatePayoutCycle(fundedConfig, custom, cycleSnapshots);
assert.ok(
  payoutCycle.events.some(
    (event) => event.state === "SIMULATED_PAYOUT_CONFIRMED" && event.simulated,
  ),
);
const canonicalTrade = {
  version: "completed-trade-result/v1" as const,
  tradeId: "canonical-1",
  strategyId: "forex.london-breakout",
  strategyVersion: "1.0.0",
  configurationVersion: "cfg",
  symbol: "EURUSD",
  market: "FOREX" as const,
  primaryTimeframe: "15m" as const,
  datasetIds: ["dataset-1"],
  entryIntent: 1,
  fill: {
    price: 1,
    quantity: 1,
    timestamp: "2026-01-01T00:00:00Z",
    provenance: "HISTORICAL_SIMULATION" as const,
    observationId: "fill",
  },
  stop: 0.99,
  targets: [1.01],
  exits: [
    {
      price: 1.01,
      timestamp: "2026-01-02T00:00:00Z",
      fraction: 1,
      reason: "TARGET" as const,
      eventId: "exit",
    },
  ],
  closePrice: 1.01,
  closeReason: "TARGET" as const,
  openedAt: "2026-01-01T00:00:00Z",
  closedAt: "2026-01-02T00:00:00Z",
  grossR: 1,
  netR: 0.9,
  grossPnl: 100,
  netPnl: 90,
  costs: {
    version: "cost/v1",
    spread: 1,
    slippage: 2,
    commission: 7,
    financing: 0,
    latencyMs: 0,
    currency: "USD",
  },
  ambiguity: {
    ambiguousBars: 0,
    unresolved: 0,
    conservativeStopFirst: 0,
    resolutionMethods: [],
  },
  provenance: "HISTORICAL_SIMULATION" as const,
  lifecycleEventIds: ["exit"],
  runReference: "run-1",
};
assert.deepEqual(
  canonicalRunEvidence({
    id: "run",
    label: "run",
    strategyId: canonicalTrade.strategyId,
    strategyVersion: canonicalTrade.strategyVersion,
    symbol: canonicalTrade.symbol,
    datasetIds: canonicalTrade.datasetIds,
    runHash: "hash",
    executionModelVersion: "cost/v1",
    trades: [canonicalTrade],
  }),
  [
    {
      id: "canonical-1",
      closedAt: "2026-01-02T00:00:00Z",
      netPnl: 90,
      provenance: "HISTORICAL_SIMULATION",
    },
  ],
);
const page = readFileSync("src/pages/admin/PropTradingPanel.tsx", "utf8"),
  workspace = readFileSync(
    "src/pages/admin/prop/ProfessionalPropWorkspace.tsx",
    "utf8",
  );
assert.match(page, /ProfessionalPropWorkspace/);
for (const text of [
  "PROP OPERATIONS",
  "FTMO 2-Step",
  "Historical Prop Simulation",
  "Virtual Prop on MT5",
  "RUN FULL CHALLENGE",
  "RUN MULTI-CHALLENGE",
  "RUN FUNDED SURVIVAL",
  "Server-Persisted Account Controls",
  "Audit History",
])
  assert.ok(workspace.includes(text), text);
const repository = readFileSync(
  "src/lib/prop/propProductRepository.ts",
  "utf8",
);
for (const table of [
  "prop_account_configs",
  "prop_audit_events",
  "prop_simulation_runs",
  "backtest_runs",
  "mt5_accounts_safe",
])
  assert.ok(repository.includes(table));
const execution = readFileSync(
  "supabase/functions/binance-testnet-execution/index.ts",
  "utf8",
);
assert.ok(execution.includes("decideAccountExecution"));
assert.ok(execution.includes("ACCOUNT_GATE_DECIDED"));
assert.ok(execution.includes("softMultiplier"));
console.log("professional prop product tests passed");
