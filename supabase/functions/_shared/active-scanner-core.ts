import {adaptiveCandidateBlock} from "./adaptive-market-policy.ts";
import type {MarketContext} from "./scanner-market-context.ts";
import { arbitrate, type ArbitrationCandidate, type ArbitrationOptions, type ArbitrationResult } from "./arbitrator.ts";
import type { ProfessionalStrategyRegistry, RegistryEvaluation, StrategyEvaluationContext } from "./professional-strategies.ts";

/** Single operational qualification/arbitration boundary used by market-scanner and parity replay. */
export const ACTIVE_SCANNER_FRAMEWORK = "professional-strategy-registry/v1" as const;
export const ACTIVE_SCANNER_ARBITRATOR = "arbitrator.root-compat-v1" as const;
export function evaluateActiveStrategies(registry: ProfessionalStrategyRegistry, context: StrategyEvaluationContext): RegistryEvaluation[] {
  return registry.evaluate(context);
}
export function arbitrateActiveScanner(candidates: readonly ArbitrationCandidate[], options: ArbitrationOptions & {marketContext?:MarketContext; adaptivePolicy?:boolean}): ArbitrationResult {
  const checked:ArbitrationCandidate[]=candidates.map(candidate=>{const reason=options.marketContext&&(options.adaptivePolicy??candidate.evidence.adaptive_policy_approved===true)?adaptiveCandidateBlock(candidate,options.marketContext.adaptive):undefined;return reason?{...candidate,eligible:false,rejectionReasons:[...candidate.rejectionReasons,reason],evidence:{...candidate.evidence,adaptive_market:options.marketContext!.adaptive}}:{...candidate,evidence:{...candidate.evidence,...(options.marketContext?{adaptive_market:options.marketContext.adaptive}:{})}};});
  const result=arbitrate(checked, options);
  return {...result,evidence:{...result.evidence,...(options.marketContext?{market_context:options.marketContext,adaptive_policy_enabled:options.adaptivePolicy??checked.some(c=>c.evidence.adaptive_policy_approved===true),market_policy_version:"adaptive-market/v1"}:{})}};
}
