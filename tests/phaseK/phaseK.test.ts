import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arbitrateCanonical, buildCanonicalMarketView, calibrationEvidence, evaluateForLiveScanner, evaluateForReplay, evaluateSignalOutcome, PHASE_K_EXECUTION_ENABLED, PHASE_K_FOREX_UNIVERSE, PHASE_K_LIMITS, PhaseKTruthStore, phaseKHash, projectSignal, runPhaseKCycle, validateClosedCandles, type Candidate, type CanonicalSignal, type DomainCandle } from "../../supabase/functions/_shared/trading-domain/index.ts";

const asOf = "2026-01-02T14:00:00.000Z";
function candles(timeframe: "15m" | "1h", count = 60): DomainCandle[] { const step = timeframe === "15m" ? 900_000 : 3_600_000, end = Date.parse(asOf) - step; return Array.from({ length: count }, (_, i) => { const p = 1.1 + i * .0001; return { datasetId: "fixture-phase-k-v1", symbol: "EURUSD", timeframe, openTime: new Date(end - (count - 1 - i) * step).toISOString(), open: p, high: p + .0003, low: p - .0002, close: p + .0001, volume: 100 + i }; }); }
const datasets = { "15m": candles("15m"), "1h": candles("1h") };
const scanner = { symbol: "EURUSD", asOf, datasets, strategies: [{ strategyId: "forex.london-breakout", configurationVersion: "phase-k-fixture-v1", parameters: {} }], minimumScore: 75, session: { open: true, code: "FIXTURE_OPEN" } } as const;

assert.equal(PHASE_K_EXECUTION_ENABLED, false, "signal validation cannot enable execution");
assert.deepEqual(PHASE_K_FOREX_UNIVERSE, ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"]);
assert.deepEqual(PHASE_K_LIMITS, { symbols: 31, cryptoSymbols: 25, forexSymbols: 6, timeframes: 4, requests: 124, retries: 2, concurrency: 4 });

assert.equal(validateClosedCandles(undefined, asOf).rejection, "MISSING_CANDLES");
assert.equal(validateClosedCandles([{ ...datasets["15m"][0], high: 1, low: 2 }], asOf).rejection, "MALFORMED_CANDLE");
assert.equal(validateClosedCandles([datasets["15m"][0], datasets["15m"][0]], asOf).rejection, "DUPLICATE_CANDLE");
assert.equal(validateClosedCandles([{ ...datasets["15m"][59], openTime: asOf }], asOf).rejection, "MUTABLE_CANDLE");
assert.equal(validateClosedCandles([datasets["15m"][0]], asOf).rejection, "STALE_CANDLE");
assert.equal(validateClosedCandles(datasets["15m"], asOf).rejection, null);

const store = new PhaseKTruthStore(), first = runPhaseKCycle({ adapter: "FOREX", source: "FIXTURE_REPLAY", scanner, store }), retry = runPhaseKCycle({ adapter: "FOREX", source: "FIXTURE_REPLAY", scanner, store });
assert.strictEqual(retry, first, "restart/retry resolves to the atomically committed cycle");
assert.equal(store.cycles.size, 1, "same interval and configuration cannot overlap or duplicate");
assert.equal(first.executionSideEffects, 0); assert.ok(first.runId && first.cycleKey); assert.ok(first.strategyIdentities[0]?.strategyVersion); assert.equal(first.arbitration.decision === "NO_TRADE", first.signalId === null);
const cooldown = runPhaseKCycle({ adapter: "FOREX", source: "FIXTURE_REPLAY", scanner: { ...scanner, asOf: "2026-01-02T14:15:00.000Z" }, store, cooldownSymbols: ["EURUSD"] });
assert.equal(cooldown.publication.reason, "COOLDOWN"); assert.equal(cooldown.safeState, "BLOCKED");
const active = runPhaseKCycle({ adapter: "FOREX", source: "FIXTURE_REPLAY", scanner: { ...scanner, asOf: "2026-01-02T14:30:00.000Z" }, store, activeSignalSymbols: ["EURUSD"] });
assert.equal(active.publication.reason, "ACTIVE_SIGNAL");

const candidate = (id: string, score: number): Candidate => ({ id, strategyId: "forex.london-breakout", strategyVersion: "1.0.0", configurationVersion: "v1", timestamp: asOf, symbol: "EURUSD", primaryTimeframe: "15m", side: "BUY", entry: 1.1, stop: 1.09, targets: [1.11, 1.12], score, evidence: { reasonCodes: ["FIXTURE"], indicators: {}, observations: {} } });
const one = arbitrateCanonical([candidate("b", 80), candidate("a", 80)], { minimumScore: 75, blockedSymbols: [] }); assert.equal(one.chosen?.id, "a"); assert.equal(one.rejected.length, 1);
assert.equal(arbitrateCanonical([candidate("low", 70)], { minimumScore: 75, blockedSymbols: [] }).decision, "NO_TRADE");
assert.equal(phaseKHash("candidate", candidate("a", 80)), phaseKHash("candidate", candidate("a", 80)), "candidate evidence hashes deterministically");

const parityInput = { strategyId: "forex.london-breakout", strategyInput: { market: buildCanonicalMarketView({ symbol: "EURUSD", asOf, primaryTimeframe: "15m", requiredTimeframes: ["15m", "1h"], datasets, warmupBars: 55, session: { open: true, code: "FIXTURE" } }), configurationVersion: "v1", parameters: {} }, account: { balance: 1000, equity: 1000, availableCapital: 1000, currentOpenRisk: 0, dailyLoss: 0, drawdownPercent: 0, exposedSymbols: [] }, riskPolicy: { version: "v1", riskPercent: 1, maxOpenRisk: 5, maxDailyLoss: 5, maxDrawdownPercent: 10 }, minimumScore: 75, maxAllocation: 1000, expiryBars: 1 } as const;
assert.deepEqual(evaluateForLiveScanner(parityInput), evaluateForReplay(parityInput), "live and replay adapters call the same production decision path");
const evidence = calibrationEvidence({ datasetIds: ["fixture-phase-k-v1"], range: { from: datasets["15m"][0].openTime, to: asOf }, symbol: "EURUSD", timeframe: "15m", costs: { spread: .0001, slippage: .00002, commission: 0 }, strategy: { id: "forex.london-breakout", codeVersion: "1.0.0", parameterVersion: "v1" }, selectionTimes: ["2025-01-01"], holdoutTimes: ["2026-01-01"], liveProviderVerified: false, sampleSize: 60 });
assert.equal(evidence.verdict, "BLOCKED"); assert.deepEqual(evidence.flags, ["THIN_SAMPLE", "NO_LIVE_PROVIDER_EVIDENCE"]);
assert.equal(calibrationEvidence({ ...evidence, liveProviderVerified: true, sampleSize: 200, selectionTimes: ["same"], holdoutTimes: ["same"] }).verdict, "FAILED", "overlapping holdout fails closed");

const signal: CanonicalSignal = { version: "canonical-signal/v1", id: "signal_fixture", candidateId: "a", decisionTimestamp: asOf, symbol: "EURUSD", timeframe: "15m", side: "BUY", entry: 1.1, stop: 1.09, targets: [1.11, 1.12], strategy: { id: "forex.london-breakout", version: "1.0.0", configurationVersion: "v1" }, evidence: candidate("a", 80).evidence, arbitration: { authority: "trading-domain.arbitrateCanonical", version: "arbitration/v1", reasonCodes: [], rejected: [] } };
const observations = [{ id: "before", timestamp: "2026-01-02T13:00:00.000Z", open: 1.1, high: 2, low: 0, close: 1.1, provenance: "HISTORICAL_SIMULATION" as const }, { id: "tp", timestamp: "2026-01-02T14:15:00.000Z", open: 1.1, high: 1.115, low: 1.099, close: 1.11, provenance: "HISTORICAL_SIMULATION" as const }];
const outcome1 = evaluateSignalOutcome(signal, observations, "2026-01-02T15:00:00.000Z"), outcome2 = evaluateSignalOutcome(signal, [...observations].reverse(), "2026-01-02T15:00:00.000Z"); assert.deepEqual(outcome1, outcome2); assert.equal(outcome1.state, "TP");
for (const audience of ["FREE", "VIP", "OWNER_RESEARCH", "ADMIN_DIAGNOSTIC"] as const) assert.equal(projectSignal(signal, audience).deliveryAttempted, false, "projection cannot deliver Telegram messages");

const scannerSource = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
const scannerLimitsSource = readFileSync("supabase/functions/_shared/scanner-limits.ts", "utf8");
assert.match(scannerSource, /boundedScannerUniverse/); assert.match(scannerLimitsSource, /UNSAFE_SCANNER_LIMIT/); assert.match(scannerLimitsSource, /forexSymbols: 6/); assert.doesNotMatch(scannerSource, /PHASE_K_EXECUTION_ENABLED = true/);
const scheduled = readFileSync("supabase/functions/scheduled-market-scanner/index.ts", "utf8"); assert.match(scheduled, /market-scanner/, "scheduler delegates to the one root scanner");
console.log("Phase K scanner signal calibration tests passed");
