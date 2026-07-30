import assert from "node:assert/strict";
import { FOREX_PRODUCTION_EVALUATORS } from "../../supabase/functions/_shared/forex-production-strategies.ts";
import { FOREX_STRATEGY_CONTRACTS, forexStrategyEligibility } from "../../supabase/functions/_shared/forex-runtime-contracts.ts";
import type { StrategyEvaluationContext } from "../../supabase/functions/_shared/professional-strategies.ts";

const evaluatedAt = "2026-01-15T09:00:00.000Z";
const candles = Array.from({ length: 60 }, (_, index) => {
  const close = 1.1 + index * .00002 + (index === 59 ? .0007 : 0);
  const open = close - (index === 59 ? .0005 : .00008);
  return { symbol: "EURUSD", market_type: "forex", timeframe: "15m", open_time: new Date(Date.parse(evaluatedAt) - (60 - index) * 900_000).toISOString(), open, high: close + .00025, low: open - .00025, close, volume: 1000, source: "mt5" };
});
const last = candles.at(-1)!;
const context: StrategyEvaluationContext = { symbol: "EURUSD", market: "forex", timeframe: "15m", candles, evaluated_at: evaluatedAt, indicators: { ema20: last.close - .0001, ema50: last.close - .0006, atr14: .001, rsi14: 56, recent_high: Math.max(...candles.slice(-20).map(c => c.high)), recent_low: Math.min(...candles.slice(-20).map(c => c.low)), avg_volume: 1000, body_size: last.close - last.open, atr_pct: .1, range_compression_ratio: .7, momentum_score: .5, volatility_state: "normal", regime: "trend_up" } };

assert.deepEqual(Object.keys(FOREX_PRODUCTION_EVALUATORS).sort(), ["forex.london-breakout", "forex.new-york-continuation", "forex.trend-pullback"]);
for (const [id, evaluator] of Object.entries(FOREX_PRODUCTION_EVALUATORS)) {
  const contract = FOREX_STRATEGY_CONTRACTS.find(row => row.id === id);
  assert.ok(contract, `${id} has a canonical contract`);
  assert.deepEqual(forexStrategyEligibility(contract!, "XAUUSD"), { eligible: false, reason: "gold_strategy_not_certified" });
  const first = evaluator(context), second = evaluator(context);
  assert.deepEqual(first, second, `${id} is deterministic`);
  assert.equal(first.score_breakdown.research_only, undefined);
  assert.equal(first.score_breakdown.certification, "PRODUCTION");
  assert.equal(first.score_breakdown.strategy_version, "1.0.0");
}
console.log("Forex production suite tests passed");
