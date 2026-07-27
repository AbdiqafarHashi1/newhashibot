import { deepFreeze, stableFingerprint, type DeepReadonly } from "./strategy-plan.ts";
import type { ExecutionPlan } from "./professional-execution-planning.ts";

export const PROTECTION_VERIFICATION_VERSION = "protection-verification/v1" as const;
export const PROTECTION_FAILURE_POLICY_VERSION = "protection-failure-policy/v1" as const;
export type ProtectionResult = "VERIFIED" | "DEGRADED" | "MISSING" | "UNVERIFIABLE";
export type ProtectionRole = "STOP" | "TP1" | "TP2" | "UNKNOWN";

export interface ObservedProtectionOrder { role: ProtectionRole; client_order_id: string | null; provider_order_id: string; account_id: string; provider_symbol: string; side: "BUY" | "SELL"; quantity: number; trigger_price: number | null; active: boolean; reduce_only_equivalent: boolean; trigger_direction_correct: boolean; }
export interface ProtectionFailurePolicy { schema_version: typeof PROTECTION_FAILURE_POLICY_VERSION; policy_id: string; version: string; stop_absence_grace_ms: number; truth_maximum_age_ms: number; stop_failure_action: "RECONCILE_THEN_SAFETY_CLOSE"; target_failure_action: "RECONCILE_AND_DEGRADE"; unknown_truth_action: "OPERATOR_INCIDENT"; }
export interface ProtectionVerificationContext { execution_plan: DeepReadonly<ExecutionPlan>; execution_attempt: number; actual_filled_quantity: number; actual_open_quantity: number; remaining_entry_quantity: number; truth_observed_at: string; verified_at: string; truth_state: "KNOWN" | "UNKNOWN" | "STALE" | "UNAVAILABLE"; observed_orders: readonly ObservedProtectionOrder[]; policy: ProtectionFailurePolicy; }
export interface ProtectionVerification { schema_version: typeof PROTECTION_VERIFICATION_VERSION; verification_id: string; execution_plan_id: string; execution_fingerprint: string; correlation_id: string; provider: ExecutionPlan["provider"]; account_id: string; actual_filled_quantity: number; actual_open_quantity: number; required: { stop_quantity: number; tp1_quantity: number; tp2_quantity: number }; observed: { stop_quantity: number; tp1_quantity: number; tp2_quantity: number }; coverage: { stop: "FULL" | "UNDER" | "OVER" | "MISSING"; targets: "FULL" | "UNDER" | "OVER" | "MISSING"; residual_quantity: number; over_coverage: number; duplicates: readonly string[]; orphans: readonly string[]; trigger_correct: boolean; reduce_only_correct: boolean }; result: ProtectionResult; remediation: "NONE" | "WAIT_FOR_FILL" | "RECONCILE" | "SAFETY_CLOSE" | "OPERATOR_INCIDENT"; verified_at: string; truth_observed_at: string; evidence: readonly string[]; fingerprint: string; }

const sum = (orders: readonly ObservedProtectionOrder[], role: ProtectionRole) => orders.filter((o) => o.active && o.role === role).reduce((n, o) => n + o.quantity, 0);
const classify = (observed: number, required: number): "FULL" | "UNDER" | "OVER" | "MISSING" => observed <= 1e-9 ? "MISSING" : Math.abs(observed - required) <= 1e-9 ? "FULL" : observed < required ? "UNDER" : "OVER";

export function verifyProtection(context: ProtectionVerificationContext): DeepReadonly<ProtectionVerification> {
  const plan = context.execution_plan; const route = plan.routing;
  if (!Object.isFrozen(plan) || !route || plan.status !== "PLANNED") throw new Error("immutable_planned_execution_required");
  const age = Date.parse(context.verified_at) - Date.parse(context.truth_observed_at);
  const protectionOrders = plan.orders.filter((o) => o.reduce_only && (o.role === "STOP_LOSS" || o.role === "TAKE_PROFIT_1" || o.role === "TAKE_PROFIT_2"));
  const plannedTotal = protectionOrders.filter((o) => o.role === "TAKE_PROFIT_1" || o.role === "TAKE_PROFIT_2").reduce((n, o) => n + o.quantity, 0) || plan.capital_allocation_plan.allocation!.quantity;
  const tp1Ratio = protectionOrders.filter((o) => o.role === "TAKE_PROFIT_1").reduce((n, o) => n + o.quantity, 0) / plannedTotal;
  const required = { stop_quantity: context.actual_open_quantity, tp1_quantity: context.actual_open_quantity * tp1Ratio, tp2_quantity: context.actual_open_quantity * (1 - tp1Ratio) };
  const observed = { stop_quantity: sum(context.observed_orders, "STOP"), tp1_quantity: sum(context.observed_orders, "TP1"), tp2_quantity: sum(context.observed_orders, "TP2") };
  const duplicateIds = [...new Set(context.observed_orders.filter((o) => o.active && o.role !== "UNKNOWN").filter((o, i, a) => a.findIndex((x) => x.role === o.role) !== i).map((o) => o.provider_order_id))];
  const orphans = context.observed_orders.filter((o) => o.active && (o.account_id !== route.account_id || o.provider_symbol !== route.provider_symbol || o.role === "UNKNOWN")).map((o) => o.provider_order_id);
  const applicable = context.observed_orders.filter((o) => o.active && !orphans.includes(o.provider_order_id));
  const triggerCorrect = applicable.every((o) => o.trigger_direction_correct);
  const reduceOnlyCorrect = applicable.every((o) => o.reduce_only_equivalent);
  const stop = classify(observed.stop_quantity, required.stop_quantity); const targetObserved = observed.tp1_quantity + observed.tp2_quantity; const targetRequired = required.tp1_quantity + required.tp2_quantity; const targets = classify(targetObserved, targetRequired);
  let result: ProtectionResult; let remediation: ProtectionVerification["remediation"];
  const evidence: string[] = [];
  if (context.truth_state !== "KNOWN" || !Number.isFinite(age) || age < 0 || age > context.policy.truth_maximum_age_ms) { result = "UNVERIFIABLE"; remediation = "OPERATOR_INCIDENT"; evidence.push("Provider protection truth is unavailable or stale; protection is not claimed."); }
  else if (context.actual_open_quantity <= 1e-9) { result = "UNVERIFIABLE"; remediation = "WAIT_FOR_FILL"; evidence.push("No open fill requires protection yet."); }
  else if (stop === "MISSING" || stop === "UNDER") { result = "MISSING"; remediation = age > context.policy.stop_absence_grace_ms ? "SAFETY_CLOSE" : "RECONCILE"; evidence.push("Certified stop does not cover actual open quantity."); }
  else if (stop !== "FULL" || targets !== "FULL" || !triggerCorrect || !reduceOnlyCorrect || duplicateIds.length || orphans.length) { result = "DEGRADED"; remediation = "RECONCILE"; evidence.push("Protection exists but coverage, identity, trigger, or reduce-only semantics are not exact."); }
  else { result = "VERIFIED"; remediation = "NONE"; evidence.push("Provider truth verifies exact stop and target coverage for actual open quantity."); }
  const core = { schema_version: PROTECTION_VERIFICATION_VERSION, execution_plan_id: plan.execution_plan_id, execution_fingerprint: plan.execution_fingerprint, correlation_id: plan.correlation_id, provider: plan.provider, account_id: route.account_id, actual_filled_quantity: context.actual_filled_quantity, actual_open_quantity: context.actual_open_quantity, required, observed, coverage: { stop, targets, residual_quantity: Math.max(0, context.actual_open_quantity - observed.stop_quantity), over_coverage: Math.max(0, observed.stop_quantity - context.actual_open_quantity, targetObserved - context.actual_open_quantity), duplicates: duplicateIds, orphans, trigger_correct: triggerCorrect, reduce_only_correct: reduceOnlyCorrect }, result, remediation, verified_at: context.verified_at, truth_observed_at: context.truth_observed_at, evidence };
  const fingerprint = stableFingerprint(core);
  return deepFreeze({ ...core, verification_id: `${PROTECTION_VERIFICATION_VERSION}:${fingerprint.slice(0, 24)}`, fingerprint });
}
