import { ForexLondonBreakout, ForexNewYorkContinuation, ForexTrendPullback } from "./forex-research-strategies.ts";
import type { LegacyStrategyResult, StrategyEvaluationContext } from "./professional-strategies.ts";

/** Certified adapters preserve the audited indicator, session, scoring, entry,
 * stop and target pipelines while replacing research-only provenance. Gold is
 * deliberately absent: XAUUSD remains market-data-only. */
function certify(result: LegacyStrategyResult, id: string): LegacyStrategyResult {
  const score = { ...result.score_breakdown };
  delete score.research_only;
  score.strategy_id = id;
  score.strategy_version = "1.0.0";
  score.certification = "PRODUCTION";
  return { ...result, reason: result.reason.replace(" research setup", " certified setup"), score_breakdown: score };
}

export const FOREX_PRODUCTION_EVALUATORS = {
  "forex.london-breakout": (context: StrategyEvaluationContext) => certify(ForexLondonBreakout.evaluate(context), "forex.london-breakout"),
  "forex.new-york-continuation": (context: StrategyEvaluationContext) => certify(ForexNewYorkContinuation.evaluate(context), "forex.new-york-continuation"),
  "forex.trend-pullback": (context: StrategyEvaluationContext) => certify(ForexTrendPullback.evaluate(context), "forex.trend-pullback"),
} as const;
