import { ForexLondonBreakout, ForexNewYorkContinuation, ForexTrendPullback } from "./forex-research-strategies.ts";
import { evaluateGoldVolatilityBreakout } from "./gold-volatility-breakout.ts";
import type { LegacyStrategyResult, StrategyEvaluationContext } from "./professional-strategies.ts";

/** Certified adapters preserve the audited indicator, session, scoring, entry,
 * stop and target pipelines while replacing research-only provenance. */
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
  "gold.volatility-breakout": evaluateGoldVolatilityBreakout,
} as const;

export type ProductionEvaluatorId = keyof typeof FOREX_PRODUCTION_EVALUATORS;
export function validateProductionEvaluatorRegistry(contractIds: readonly string[], entries: readonly (readonly [string, unknown])[]): void {
  const contracts = new Set(contractIds), mapped = new Set<string>();
  if (contracts.size !== contractIds.length) throw new Error("DUPLICATE_STRATEGY_CONTRACT_ID");
  for (const [id, evaluator] of entries) {
    if (mapped.has(id)) throw new Error(`DUPLICATE_STRATEGY_EVALUATOR:${id}`);
    if (!contracts.has(id)) throw new Error(`STRATEGY_EVALUATOR_UNCONTRACTED:${id}`);
    if (typeof evaluator !== "function") throw new Error(`STRATEGY_EVALUATOR_INVALID:${id}`);
    mapped.add(id);
  }
  for (const id of contracts) if (!mapped.has(id)) throw new Error(`STRATEGY_EVALUATOR_NOT_REGISTERED:${id}`);
}
