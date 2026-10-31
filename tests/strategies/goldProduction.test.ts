import assert from "node:assert/strict";
import { evaluateGoldVolatilityBreakout, GOLD_EVALUATOR_ID, GOLD_STRATEGY_ID } from "../../supabase/functions/_shared/gold-volatility-breakout.ts";
import { FOREX_PRODUCTION_EVALUATORS, validateProductionEvaluatorRegistry } from "../../supabase/functions/_shared/forex-production-strategies.ts";
import { FOREX_STRATEGY_CONTRACTS, forexScannerFetchPlan, forexStrategyEligibility } from "../../supabase/functions/_shared/forex-runtime-contracts.ts";
import type { StrategyEvaluationContext } from "../../supabase/functions/_shared/professional-strategies.ts";

const evaluated_at = "2026-01-15T15:00:00.000Z";
function fixture(direction: "buy" | "sell" = "buy"): StrategyEvaluationContext {
  const candles = Array.from({ length: 70 }, (_, index) => {
    const center = 2641 + (index % 2 ? .75 : -.75);
    const open = center - .08, close = center + .08;
    return { symbol: "XAUUSD", market_type: "forex", timeframe: "15m", open_time: new Date(Date.parse(evaluated_at) - (70 - index) * 900_000).toISOString(), open, high: Math.max(open, close) + .08, low: Math.min(open, close) - .08, close, volume: 1000, source: "mt5" };
  });
  if (direction === "buy") {
    candles[68] = { ...candles[68], open: 2641.75, low: 2641.7, high: 2642.52, close: 2642.45 };
    candles[69] = { ...candles[69], open: 2642.48, low: 2642.4, high: 2642.78, close: 2642.7 };
  } else {
    candles[68] = { ...candles[68], open: 2640.25, high: 2640.3, low: 2639.48, close: 2639.55 };
    candles[69] = { ...candles[69], open: 2639.52, high: 2639.6, low: 2639.22, close: 2639.3 };
  }
  const price = candles.at(-1)!.close;
  return { symbol: "XAUUSD", market: "forex", timeframe: "15m", candles, evaluated_at, indicators: { ema20: direction === "buy" ? 2641.5 : 2640.5, ema50: 2641, atr14: 1, rsi14: direction === "buy" ? 61 : 39, recent_high: 2642, recent_low: 2640, avg_volume: 1000, body_size: .22, atr_pct: 1 / price * 100, range_compression_ratio: .4, momentum_score: direction === "buy" ? .7 : -.7, volatility_state: "normal", regime: direction === "buy" ? "trend_up" : "trend_down" } };
}

for (const direction of ["buy", "sell"] as const) {
  const input = fixture(direction), snapshot = structuredClone(input.candles);
  const result = evaluateGoldVolatilityBreakout(input);
  assert.equal(result.status, "candidate", `${direction} fixture is accepted`);
  assert.equal(result.direction, direction);
  assert.equal(result.score_breakdown.strategy_id, GOLD_STRATEGY_ID);
  assert.equal(result.score_breakdown.evaluator_identity, GOLD_EVALUATOR_ID);
  assert.equal(result.score_breakdown.certification, "MEASURED_RELEASE_REQUIRED");
  assert.match(String(result.score_breakdown.deterministic_fingerprint), /^fnv1a32:/);
  assert.deepEqual(input.candles, snapshot, "evaluator does not mutate shared candles");
  assert.deepEqual(result, evaluateGoldVolatilityBreakout(input), "result is deterministic");
}

const wrong = { ...fixture(), symbol: "EURUSD", candles: fixture().candles.map(c => ({ ...c, symbol: "EURUSD" })) };
assert.equal(evaluateGoldVolatilityBreakout(wrong).rejection_reason, "gold_symbol_not_supported");
const falseBreak = fixture();
falseBreak.candles = falseBreak.candles.map((c, i) => i === 68 ? { ...c, high: 2643.3, close: 2642.2 } : c);
assert.equal(evaluateGoldVolatilityBreakout(falseBreak).rejection_reason, "gold_false_breakout");
const exhausted = fixture(); exhausted.indicators = { ...exhausted.indicators, ema20: 2639.8, ema50: 2639 };
assert.equal(evaluateGoldVolatilityBreakout(exhausted).rejection_reason, "gold_exhaustion_detected");
const event = fixture() as StrategyEvaluationContext & { event_risk: { available: boolean; high_impact_usd: boolean } };
event.event_risk = { available: true, high_impact_usd: true };
assert.equal(evaluateGoldVolatilityBreakout(event).rejection_reason, "gold_event_risk_blocked");

const goldContract = FOREX_STRATEGY_CONTRACTS.find(c => c.id === GOLD_STRATEGY_ID)!;
assert.deepEqual(forexStrategyEligibility(goldContract, "XAUUSD"), { eligible: true, reason: null });
for (const contract of FOREX_STRATEGY_CONTRACTS.filter(c => c.id.startsWith("forex."))) assert.equal(forexStrategyEligibility(contract, "XAUUSD").reason, "strategy_instrument_class_not_supported");
assert.deepEqual(forexStrategyEligibility(goldContract, "EURUSD"), { eligible: false, reason: "strategy_instrument_class_not_supported" });
assert.deepEqual(forexScannerFetchPlan(), ["5m", "15m", "1h"]);

const entries = Object.entries(FOREX_PRODUCTION_EVALUATORS);
validateProductionEvaluatorRegistry(FOREX_STRATEGY_CONTRACTS.map(c=>c.id), entries);
assert.throws(() => validateProductionEvaluatorRegistry([GOLD_STRATEGY_ID], []), /NOT_REGISTERED/);
assert.throws(() => validateProductionEvaluatorRegistry([GOLD_STRATEGY_ID], [[GOLD_STRATEGY_ID, evaluateGoldVolatilityBreakout], [GOLD_STRATEGY_ID, evaluateGoldVolatilityBreakout]]), /DUPLICATE_STRATEGY_EVALUATOR/);
assert.throws(() => validateProductionEvaluatorRegistry([GOLD_STRATEGY_ID], [["unknown", evaluateGoldVolatilityBreakout]]), /UNCONTRACTED/);
assert.throws(() => validateProductionEvaluatorRegistry([GOLD_STRATEGY_ID], [[GOLD_STRATEGY_ID, null]]), /INVALID/);
console.log("Gold production and strategy registry tests passed");
