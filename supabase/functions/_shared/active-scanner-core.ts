import { arbitrate, type ArbitrationCandidate, type ArbitrationOptions, type ArbitrationResult } from "./arbitrator.ts";
import type { ProfessionalStrategyRegistry, RegistryEvaluation, StrategyEvaluationContext } from "./professional-strategies.ts";

/** Single operational qualification/arbitration boundary used by market-scanner and parity replay. */
export const ACTIVE_SCANNER_FRAMEWORK = "professional-strategy-registry/v1" as const;
export const ACTIVE_SCANNER_ARBITRATOR = "arbitrator.root-compat-v1" as const;
export function evaluateActiveStrategies(registry: ProfessionalStrategyRegistry, context: StrategyEvaluationContext): RegistryEvaluation[] {
  return registry.evaluate(context);
}
export function arbitrateActiveScanner(candidates: readonly ArbitrationCandidate[], options: ArbitrationOptions): ArbitrationResult {
  return arbitrate(candidates, options);
}
