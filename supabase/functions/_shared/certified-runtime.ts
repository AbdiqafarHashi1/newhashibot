import { arbitrate, type ArbitrationCandidate, type ArbitrationOptions, type ArbitrationResult } from "./arbitrator.ts";
import { approveStrategyPlan, deepFreeze, type ApprovedStrategyPlan, type DeepReadonly, type StrategyPlan } from "./strategy-plan.ts";
import { evaluateRisk, type ResolvedRiskPolicy, type RiskDecision, type RiskEvaluationContext } from "./professional-risk-engine.ts";
import { allocateCapital, type CapitalAllocationContext, type CapitalAllocationPlan } from "./professional-capital-allocation.ts";
import { planExecution, type ExecutionPlan, type ExecutionPlanningContext } from "./professional-execution-planning.ts";

export const CERTIFIED_RUNTIME_VERSION = "certified-runtime/phase-1g-a" as const;

export interface ExecutionAccountInput {
  readonly account_id: string;
  readonly customer_id: string;
  readonly execution_product: "FOREX_PERSONAL" | "FOREX_PROP" | "CRYPTO_PERSONAL" | "CRYPTO_PROP";
  readonly adoption_policy_version: string;
  readonly risk_context: RiskEvaluationContext;
  readonly risk_policy: DeepReadonly<ResolvedRiskPolicy>;
  capital_context(decision: DeepReadonly<RiskDecision>): CapitalAllocationContext;
  execution_context(allocation: DeepReadonly<CapitalAllocationPlan>): ExecutionPlanningContext;
}

export interface CertifiedRuntimeInput {
  readonly candidates: readonly ArbitrationCandidate[];
  readonly strategy_plans: Readonly<Record<string, DeepReadonly<StrategyPlan>>>;
  readonly arbitration: ArbitrationOptions;
  readonly accounts: readonly ExecutionAccountInput[];
  /** The active scanner supplies its already-computed root decision. This
   * prevents a second arbitration pass. Tests/tools may omit it. */
  readonly arbitration_result?: ArbitrationResult;
}

export type CertifiedRuntimeResult = DeepReadonly<{
  schema_version: typeof CERTIFIED_RUNTIME_VERSION;
  arbitration: ArbitrationResult;
  approved_strategy_plan: ApprovedStrategyPlan | null;
  accounts: readonly {
    account_id: string;
    risk_decision: RiskDecision;
    capital_allocation_plan: CapitalAllocationPlan | null;
    execution_plan: ExecutionPlan | null;
  }[];
}>;

/**
 * The active root pipeline seam. It owns selection and fans the one immutable
 * winner out only after arbitration. Each account supplies its own fresh truth;
 * no balance, equity, loss state, contract or provider fact is shared.
 */
export function runCertifiedRuntime(input: CertifiedRuntimeInput): CertifiedRuntimeResult {
  const arbitration = input.arbitration_result ?? arbitrate(input.candidates, input.arbitration);
  // A supplied NO_TRADE decision has no winner by design. Validate lineage only
  // when an external decision actually selected a candidate.
  if (input.arbitration_result?.winner && !input.candidates.some((candidate) => candidate.id === input.arbitration_result.winner?.id)) throw new Error("arbitration_result_not_in_candidate_snapshot");
  if (arbitration.decision === "NO_TRADE" || !arbitration.winner) {
    return deepFreeze({ schema_version: CERTIFIED_RUNTIME_VERSION, arbitration, approved_strategy_plan: null, accounts: [] });
  }

  const winner = input.strategy_plans[arbitration.winner.id];
  if (!winner) throw new Error("arbitrator_winner_strategy_plan_missing");
  if (!Object.isFrozen(winner)) throw new Error("arbitrator_winner_strategy_plan_mutable");
  if (winner.identity.strategy_id !== arbitration.winner.strategyId) throw new Error("arbitrator_winner_lineage_mismatch");

  const approved = approveStrategyPlan(winner, {
    approved_at: input.arbitration.now.toISOString(),
    arbitration: {
      policy_version: arbitration.version,
      winner_reason: `winner:${arbitration.winner.id};decision:${arbitration.decisionKey}`,
      competing_strategies: arbitration.rejected.map((row) => ({
        strategy_id: input.candidates.find((candidate) => candidate.id === row.candidateId)?.strategyId ?? row.candidateId,
        decision: row.reasons.includes("arbitration_blocked") ? "LOST" as const : "REJECTED" as const,
        reason: row.reasons.join(","),
      })),
    },
  });

  const seen = new Set<string>();
  const accounts = input.accounts.map((account) => {
    if (!account.account_id || seen.has(account.account_id)) throw new Error("duplicate_or_missing_execution_account");
    seen.add(account.account_id);
    if (account.risk_context.lineage.account_id !== account.account_id) throw new Error("risk_context_account_mismatch");
    const risk = evaluateRisk(approved, account.risk_context, account.risk_policy);
    if (risk.decision === "REJECT" || !risk.authorized_envelope) return { account_id: account.account_id, risk_decision: risk, capital_allocation_plan: null, execution_plan: null };
    const capitalContext = account.capital_context(risk);
    if (capitalContext.risk_decision !== risk || capitalContext.permitted_account_ids.some((id) => id !== account.account_id)) throw new Error("capital_context_cross_account_scope");
    const capital = allocateCapital(capitalContext);
    if (capital.status !== "ALLOCATED") return { account_id: account.account_id, risk_decision: risk, capital_allocation_plan: capital, execution_plan: null };
    const executionContext = account.execution_context(capital);
    if (executionContext.capital_allocation_plan !== capital || executionContext.account_id !== account.account_id) throw new Error("execution_context_lineage_mismatch");
    const execution = planExecution(executionContext);
    return { account_id: account.account_id, risk_decision: risk, capital_allocation_plan: capital, execution_plan: execution };
  });
  return deepFreeze({ schema_version: CERTIFIED_RUNTIME_VERSION, arbitration, approved_strategy_plan: approved, accounts });
}

/** Executors call this at their boundary; provider payloads are transport data,
 * never an alternate trade intent. */
export function assertCertifiedExecutionInput(plan: DeepReadonly<ExecutionPlan>, accountId: string): void {
  if (!Object.isFrozen(plan) || plan.status !== "PLANNED" || !plan.routing) throw new Error("execution_plan_not_certified");
  if (plan.routing.account_id !== accountId || plan.capital_allocation_plan.account?.account_id !== accountId || plan.risk_decision.account.id !== accountId) throw new Error("execution_plan_account_lineage_mismatch");
  if (plan.provider !== plan.risk_decision.account.provider || plan.provider !== plan.capital_allocation_plan.provider) throw new Error("execution_plan_provider_lineage_mismatch");
}
