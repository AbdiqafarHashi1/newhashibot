import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atr, atrRootV1, candleGeometry, ema, emaRootV1, highestHigh, lowestLow, normalizeClosedCandles, normalizedDistance, percentageChange, relativeVolume, riskReward, rollingAverageVolume, rollingRange, rsi, rsiRootV1, sma, trueRange, INDICATOR_VERSIONS, type IndicatorCandle } from "../../supabase/functions/_shared/indicator-engine.ts";
import { arbitrate, ARBITRATOR_VERSION, type ArbitrationCandidate } from "../../supabase/functions/_shared/arbitrator.ts";

const candles: IndicatorCandle[] = Array.from({ length: 60 }, (_, i) => ({ open_time: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1_000 + i * 10 }));
assert.equal(sma([1, 2, 3, 4], 3).value, 3);
assert.equal(emaRootV1([1, 2], 3), 2, "root-v1 short EMA parity");
assert.equal(ema([1, 2, 3, 4], 3).value, 3);
assert.equal(rsiRootV1(Array(16).fill(10)), 50);
assert.equal(rsi(candles.slice(0, 20).map((c) => c.close), 14).value, 100 - 100 / 101, "preserve zero-loss production quirk");
assert.equal(trueRange(candles[1], candles[0].close), 3);
assert.equal(atrRootV1(candles, 14), 3);
assert.equal(atr(candles, 14).value, 3);
assert.equal(highestHigh(candles, 20), 161);
assert.equal(lowestLow(candles, 20), 139);
assert.equal(rollingRange(candles, 20), 22);
assert.deepEqual(candleGeometry({ ...candles[0], open: 100, high: 105, low: 98, close: 103 }), { body: 3, upperWick: 2, lowerWick: 2, bodyToRange: 3 / 7 });
assert.equal(rollingAverageVolume(candles, 20), candles.slice(-20).reduce((n, c) => n + c.volume, 0) / 20);
assert.ok(relativeVolume(candles, 20) > 1);
assert.equal(percentageChange(100, 105), 5);
assert.equal(normalizedDistance(100, 95), 5);
assert.equal(riskReward(100, 98, 104), 2);
assert.equal(sma([1], 2).ok, false);
assert.equal(ema([1, Number.NaN, 3], 3).ok, false);
assert.equal(normalizeClosedCandles([...candles.slice(0, 2), candles[1]]).ok, false, "duplicate timestamps rejected");
assert.equal(normalizeClosedCandles([candles[1], candles[0]]).ok, false, "out-of-order rejected rather than reordered/looked ahead");
assert.equal(normalizeClosedCandles(candles.slice(0, 2), { closeBoundary: new Date(candles[1].open_time) }).ok, false, "forming/future boundary rejected");
assert.equal(normalizeClosedCandles(candles.slice(0, 2), { now: new Date("2026-02-01T00:00:00Z"), staleAfterMs: 60_000 }).ok, false);
assert.deepEqual(ema(candles.map((c) => c.close), 20), ema(candles.map((c) => c.close), 20), "deterministic repetition");
assert.equal(INDICATOR_VERSIONS.atr, "indicator.atr/root-v1");

const base: ArbitrationCandidate = { id: "a", strategyId: "crypto.micro-scalper", strategyVersion: "1.0.0", market: "crypto", symbol: "BTCUSDT", timeframe: "5m", side: "buy", confidence: 80, grade: "A", score: 0.8, entry: 100, stop: 98, targets: [102, 104], riskReward: 2, expiry: "2026-01-01T01:00:00Z", fresh: true, lifecycle: "ENABLED", publicationMode: "LIVE", evidence: {}, rejectionReasons: [], priority: 60 };
const now = new Date("2026-01-01T00:00:00Z");
assert.equal(arbitrate([], { now }).decision, "NO_TRADE");
assert.equal(arbitrate([base], { now }).winner?.id, "a");
const better = { ...base, id: "b", side: "sell" as const, entry: 100, stop: 102, targets: [98, 96], score: 0.9 };
assert.equal(arbitrate([base, better], { now }).winner?.id, "b", "conflicting sides preserve score winner");
const priorityWinner = { ...base, id: "priority", score: 0.80005, priority: 80 };
const tieDecision = arbitrate([base, priorityWinner], { now });
assert.equal(tieDecision.winner?.id, "priority");
assert.ok(tieDecision.tieBreakEvidence.includes("identity_fit_priority"));
assert.equal(arbitrate([{ ...base, score: 0.2 }], { now, minimumScore: 0.5 }).decision, "NO_TRADE");
assert.equal(arbitrate([{ ...base, fresh: false }], { now }).rejected[0].reasons[0], "stale_candidate");
assert.ok(arbitrate([{ ...base, expiry: "2025-01-01T00:00:00Z" }], { now }).rejected[0].reasons.includes("expired_candidate"));
assert.ok(arbitrate([{ ...base, stop: 101 }], { now }).rejected[0].reasons.includes("invalid_price_structure"));
assert.ok(arbitrate([{ ...base, riskReward: 0 }], { now }).rejected[0].reasons.includes("invalid_risk_reward"));
assert.equal(arbitrate([{ ...base, grade: "B" }], { now, allowedGrades: ["A", "A+"] }).decision, "NO_TRADE");
const research = { ...base, id: "research", lifecycle: "RESEARCH" as const, publicationMode: "SHADOW" as const };
assert.ok(arbitrate([research], { now }).rejected[0].reasons.includes("research_or_non_live_excluded"));
const frozenInput = Object.freeze({ ...base, evidence: Object.freeze({ source: "fixture" }), targets: Object.freeze([102, 104]) });
arbitrate([frozenInput], { now });
assert.deepEqual(frozenInput.targets, [102, 104], "input remains immutable");
assert.equal(arbitrate([base, better], { now }).decisionKey, arbitrate([base, better], { now }).decisionKey);
assert.equal(arbitrate([base], { now, forceNoTradeReason: "legacy_no_trade" }).decision, "NO_TRADE");
assert.equal(ARBITRATOR_VERSION, "arbitrator.root-compat-v1");

const scanner = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
const cryptoEvaluators = readFileSync("supabase/functions/_shared/crypto-production-evaluators.ts", "utf8");
for (const name of ["evalMicroScalper", "evalQuickScalp", "evalCompressionBreakout", "evalSwingContinuation"]) {
  assert.ok(scanner.includes(name), `${name} wired into scanner`);
  assert.ok(cryptoEvaluators.includes(`export function ${name}(`), `${name} shared production evaluator retained`);
}
for (const name of ["evalForexMicroScalper", "evalForexSwingContinuation"]) {assert.ok(scanner.includes(name));assert.ok(readFileSync("supabase/functions/_shared/forex-legacy-evaluators.ts","utf8").includes(`function ${name}(`));}
assert.equal((scanner.match(/const arbitrationDecision = arbitrateActiveScanner\(/g) ?? []).length, 1, "one shared production arbitration decision");
assert.doesNotMatch(scanner, /from ["'][^"']*v2\//);
assert.match(scanner, /if \(!evaluation\.publishable\) arbitrationDiagnostics\.researchExcluded\(\);\s*if \(!evaluation\.publishable\) continue;/, "research excluded before allEvals and candidate persistence");
assert.match(scanner, /professional_strategy_diagnostics/);
assert.match(scanner, /shared_indicator_diagnostics/);
assert.match(scanner, /arbitration_diagnostics/);
console.log("Phase 4 indicator and arbitrator tests passed");

