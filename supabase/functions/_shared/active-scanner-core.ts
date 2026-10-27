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
export function candidateCostRejection(candidate:ArbitrationCandidate):string|undefined {
  const cost=candidate.evidence.estimated_round_trip_cost_bps,minimum=candidate.evidence.minimum_net_target_r;
  if(cost===undefined)return;
  if(typeof cost!=="number"||!Number.isFinite(cost)||cost<0||minimum!==undefined&&(typeof minimum!=="number"||!Number.isFinite(minimum)||minimum<0))return "invalid_declared_execution_cost";
  const risk=Math.abs(candidate.entry-candidate.stop);
  if(risk<=0||!candidate.targets.length)return "invalid_cost_geometry";
  // Canonical signal projection: 50% TP1 and 50% final target, before account sizing.
  const gross=(Math.abs(candidate.targets[0]-candidate.entry)+Math.abs(candidate.targets.at(-1)!-candidate.entry))/2/risk;
  const costR=candidate.entry*cost/10000/risk;
  return gross-costR<=Number(minimum??0)?"costs_exceed_target_payoff":undefined;
}
export function arbitrateActiveScanner(candidates: readonly ArbitrationCandidate[], options: ArbitrationOptions & {marketContext?:MarketContext; adaptivePolicy?:boolean}): ArbitrationResult {
  const checked:ArbitrationCandidate[]=candidates.map(candidate=>{
    const adaptiveReason=options.marketContext&&(options.adaptivePolicy??candidate.evidence.adaptive_policy_approved===true)?adaptiveCandidateBlock(candidate,options.marketContext.adaptive):undefined;
    const reason=candidateCostRejection(candidate)||adaptiveReason;
    const evidence={...candidate.evidence,...(options.marketContext?{adaptive_market:options.marketContext.adaptive}:{})};
    return reason?{...candidate,eligible:false,rejectionReasons:[...candidate.rejectionReasons,reason],evidence}:{...candidate,evidence};
  });
  const eligible=checked.filter(c=>c.eligible!==false&&c.lifecycle==='ENABLED'&&c.publicationMode==='LIVE'&&c.fresh&&c.score>=(options.minimumScore??0)&&Date.parse(c.expiry)>options.now.getTime());
  const opposing=eligible.some(c=>c.evidence.team_policy==='crypto-team/v1')?eligible.flatMap(a=>eligible.filter(b=>b.symbol===a.symbol&&b.side!==a.side).map(b=>Math.abs(a.score-b.score))):[];
  const conflict=opposing.some(margin=>margin<=.08)?'OPPOSING_SETUP_SCORES_TOO_CLOSE':undefined;
  const result=arbitrate(checked, {...options,forceNoTradeReason:options.forceNoTradeReason??conflict});
  return {...result,evidence:{...result.evidence,...(options.marketContext?{market_context:options.marketContext,adaptive_policy_enabled:options.adaptivePolicy??checked.some(c=>c.evidence.adaptive_policy_approved===true),market_policy_version:"adaptive-market/v1"}:{})}};
}
