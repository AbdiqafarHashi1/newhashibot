import { deepFreeze, stableFingerprint, type DeepReadonly } from "./strategy-plan.ts";
import type { ExecutionPlan, PlannedOrder, PlannedProviderConfiguration } from "./professional-execution-planning.ts";
import type { RiskDomain, TruthState } from "./professional-risk-engine.ts";

export const EXECUTION_ADOPTION_POLICY_VERSION = "execution-adoption-policy/v1" as const;
export const EXECUTION_ATTEMPT_VERSION = "execution-attempt/v1" as const;
export const EXECUTION_EVENT_VERSION = "execution-event/v1" as const;
export const FILL_BINDING_POLICY_VERSION = "fill-binding-policy/v1" as const;
export const EXECUTION_CONTROL_VERSION = "execution-adoption-control/v1" as const;

export type AdoptionCertificationState = "DISABLED" | "LIVE_APPROVED" | "FORWARD_TEST" | "SHADOW_COMPARE" | "CERTIFIED_TESTNET" | "CERTIFIED_DEMO" | "BLOCKED" | "ROLLED_BACK";
export type CanonicalExecutionState = "PLANNED" | "CLAIMED" | "CONFIGURING" | "READY_TO_SUBMIT" | "SUBMITTING" | "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED" | "PROTECTION_PENDING" | "PROTECTED" | "PROTECTION_DEGRADED" | "CANCELLING" | "CANCELLED" | "REJECTED" | "RECONCILING" | "SAFETY_CLOSING" | "CLOSED" | "FAILED" | "TERMINAL";
export type ExecutionEventType = "PLAN_ACCEPTED" | "PLAN_REJECTED" | "CLAIM_ACQUIRED" | "CLAIM_CONFLICT" | "CONFIGURATION_REQUESTED" | "CONFIGURATION_ACKNOWLEDGED" | "ENTRY_SUBMISSION_REQUESTED" | "ENTRY_ACKNOWLEDGED" | "ENTRY_REJECTED" | "ENTRY_PARTIALLY_FILLED" | "ENTRY_FILLED" | "ENTRY_CANCELLED" | "ENTRY_EXPIRED" | "PROTECTION_SUBMISSION_REQUESTED" | "PROTECTION_ACKNOWLEDGED" | "PROTECTION_REJECTED" | "PROTECTION_VERIFIED" | "PROTECTION_DEGRADED" | "PROTECTION_MISSING" | "SAFETY_CLOSE_REQUESTED" | "SAFETY_CLOSE_ACKNOWLEDGED" | "RECONCILIATION_STARTED" | "RECONCILIATION_RESOLVED" | "RECONCILIATION_UNRESOLVED" | "EXECUTION_TERMINAL";

export interface ExecutionAdoptionPolicy {
  schema_version: typeof EXECUTION_ADOPTION_POLICY_VERSION;
  policy_id: string;
  version: string;
  provider: RiskDomain;
  environment: "TESTNET" | "DEMO" | "LIVE";
  account_ids: readonly string[];
  execution_modes: readonly ("PAPER" | "TESTNET" | "DEMO" | "LIVE")[];
  customer_scope: { mode: "ALL_AUTHORIZED" | "ALLOWLIST"; customer_ids: readonly string[] };
  supported_plan_versions: readonly string[];
  enabled: boolean;
  certification_state: AdoptionCertificationState;
  rollout_percentage: number;
  rollback_state: "ACTIVE" | "NOT_ROLLED_BACK";
  minimum_provider_health: "HEALTHY";
  maximum_plan_age_ms: number;
  require_contract_fingerprint_parity: boolean;
  require_capability_fingerprint_parity: boolean;
  required_protection_mode: "NATIVE_CONDITIONAL" | "ATTACHED";
  required_reconciliation_mode: "CLIENT_ID_LOOKUP_BEFORE_RETRY";
  partial_fill_policy_id: string;
  protection_failure_policy_id: string;
}

export function disabledAdoptionPolicy(provider: RiskDomain, environment: "TESTNET" | "DEMO"): DeepReadonly<ExecutionAdoptionPolicy> {
  return deepFreeze({ schema_version: EXECUTION_ADOPTION_POLICY_VERSION, policy_id: `${provider.toLowerCase()}-${environment.toLowerCase()}-disabled`, version: "1.0.0", provider, environment, account_ids: [], execution_modes: [], customer_scope: { mode: "ALLOWLIST", customer_ids: [] }, supported_plan_versions: ["execution-plan/v1"], enabled: false, certification_state: "DISABLED", rollout_percentage: 0, rollback_state: "NOT_ROLLED_BACK", minimum_provider_health: "HEALTHY", maximum_plan_age_ms: 0, require_contract_fingerprint_parity: true, require_capability_fingerprint_parity: true, required_protection_mode: provider.startsWith("MT5") ? "ATTACHED" : "NATIVE_CONDITIONAL", required_reconciliation_mode: "CLIENT_ID_LOOKUP_BEFORE_RETRY", partial_fill_policy_id: "partial-fill/protect-filled-cancel-remainder-v1", protection_failure_policy_id: "protection-failure/safety-close-v1" });
}

export interface ExecutionAttempt {
  schema_version: typeof EXECUTION_ATTEMPT_VERSION;
  execution_plan_id: string;
  execution_fingerprint: string;
  correlation_id: string;
  evaluation_id: string;
  allocation_id: string;
  risk_decision_id: string;
  provider: RiskDomain;
  environment: ExecutionPlan["routing"] extends { environment: infer T } ? T : "TESTNET" | "DEMO" | "LIVE";
  account_id: string;
  plan_idempotency_key: string;
  order_idempotency_keys: readonly string[];
  adoption_policy_id: string;
  adoption_policy_version: string;
  attempt_number: number;
  claimed_at: string;
  executor_identity: string;
  lease_expires_at: string;
  canonical_state: CanonicalExecutionState;
}

export interface ExecutionEvent {
  schema_version: typeof EXECUTION_EVENT_VERSION;
  event_id: string;
  sequence: number;
  event_type: ExecutionEventType;
  provider: RiskDomain;
  account_id: string;
  environment: "TESTNET" | "DEMO" | "LIVE";
  correlation_id: string;
  evaluation_id: string;
  execution_plan_id: string;
  execution_attempt_number: number;
  planned_order_role: PlannedOrder["role"] | null;
  deterministic_client_id: string | null;
  provider_order_id: string | null;
  provider_position_id: string | null;
  request_timestamp: string | null;
  provider_timestamp: string | null;
  observed_timestamp: string;
  raw_status: string;
  normalized_status: string;
  quantity: number | null;
  filled_quantity: number | null;
  average_fill_price: number | null;
  fees: { amount: number; currency: string } | null;
  realized_slippage: { amount: number; unit: "PRICE" | "BPS" } | null;
  provider_response_fingerprint: string | null;
  source_component: string;
  error: { taxonomy: string; message: string } | null;
  redacted_provider_evidence: Readonly<Record<string, unknown>>;
}

export interface AdoptionTruth {
  live_permission_verified?: boolean;
  observed_at: string;
  freshness: TruthState;
  provider_health: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  account_health: "HEALTHY" | "LOCKED" | "UNAVAILABLE";
  provider: RiskDomain;
  environment: "TESTNET" | "DEMO" | "LIVE";
  account_id: string;
  customer_id: string | null;
  execution_mode: "PAPER" | "TESTNET" | "DEMO" | "LIVE";
  canonical_symbol: string;
  provider_symbol: string;
  contract_fingerprint: string;
  capability_fingerprint: string;
  routing_fingerprint: string;
  execution_fingerprint: string;
  available_margin: number;
  conflicting_position: boolean;
  conflicting_open_entry: boolean;
  active_client_ids: readonly string[];
  configuration_change_safe: boolean;
  provider_operational: boolean;
  prop?: { account_mode: "MT5_PROP"; stage: string; policy_version: string; session_allowed: boolean; news_allowed: boolean; holding_allowed: boolean };
}

export interface AdoptionRevalidation {
  allowed: boolean;
  reasons: readonly string[];
  checks: readonly { id: string; status: "PASS" | "REJECT"; explanation: string }[];
  capability_fingerprint: string;
}

function deterministicRolloutEligible(accountId: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const bucket = Number.parseInt(stableFingerprint(accountId).split(":")[1].slice(0, 8), 16) % 100;
  return bucket < percentage;
}

export function revalidateAdoption(plan: DeepReadonly<ExecutionPlan>, policy: DeepReadonly<ExecutionAdoptionPolicy>, truth: AdoptionTruth, now: string): DeepReadonly<AdoptionRevalidation> {
  const checks: { id: string; status: "PASS" | "REJECT"; explanation: string }[] = [], reasons: string[] = [];
  const check = (id: string, ok: boolean, reason: string, explanation: string) => { checks.push({ id, status: ok ? "PASS" : "REJECT", explanation }); if (!ok) reasons.push(reason); };
  const route = plan.routing, allocation = plan.capital_allocation_plan.allocation;
  check("contract.immutable", Object.isFrozen(plan) && Object.isFrozen(plan.capital_allocation_plan) && Object.isFrozen(plan.risk_decision) && Object.isFrozen(plan.strategy_plan), "mutable_execution_plan", "Execution plan and all upstream references are deeply immutable.");
  check("contract.planned", plan.status === "PLANNED" && Boolean(route) && Boolean(allocation), "execution_plan_not_planned", "Only PLANNED artifacts are adoptable.");
  check("policy.enabled", policy.enabled, "adoption_disabled", "Adoption must be explicitly enabled; missing policy never enables it.");
  check("policy.certified", policy.certification_state === "CERTIFIED_TESTNET" || policy.certification_state === "CERTIFIED_DEMO" || policy.certification_state === "SHADOW_COMPARE" || policy.certification_state === "FORWARD_TEST" || policy.certification_state === "LIVE_APPROVED", "provider_not_certified", "Policy is certified for its non-production environment or shadow compare.");
  check("policy.production_impossible", truth.environment === "LIVE" ? (route?.environment === "LIVE" && policy.environment === "LIVE" && policy.certification_state === "LIVE_APPROVED" && truth.live_permission_verified === true) : (route?.environment !== "LIVE" && policy.environment !== "LIVE" && policy.certification_state !== "LIVE_APPROVED"), "production_environment_forbidden", "Phase 1F categorically forbids production.");
  check("policy.rollback", policy.rollback_state === "NOT_ROLLED_BACK" && policy.certification_state !== "ROLLED_BACK", "adoption_rolled_back", "Rollback state prevents certified submission.");
  check("policy.route", policy.provider === plan.provider && policy.environment === truth.environment && policy.account_ids.includes(truth.account_id) && route?.account_id === truth.account_id && policy.execution_modes.includes(truth.execution_mode as "PAPER" | "TESTNET" | "DEMO"), "adoption_route_not_permitted", "Provider, environment, account and execution mode are explicitly allowed.");
  const customerAllowed = policy.customer_scope.mode === "ALL_AUTHORIZED" || Boolean(truth.customer_id && policy.customer_scope.customer_ids.includes(truth.customer_id));
  check("policy.customer", customerAllowed, "customer_scope_not_permitted", "Customer assignment is inside policy scope.");
  check("policy.plan_version", policy.supported_plan_versions.includes(plan.schema_version), "plan_version_unsupported", "Execution plan version is explicitly supported.");
  check("policy.rollout", deterministicRolloutEligible(truth.account_id, policy.rollout_percentage), "account_outside_rollout", "Account-based deterministic rollout includes this account.");
  const planAge = Date.parse(now) - Date.parse(plan.planned_at);
  check("truth.plan_age", Number.isFinite(planAge) && planAge >= 0 && planAge <= policy.maximum_plan_age_ms, "execution_plan_expired", "Plan remains inside the maximum adoption age.");
  const truthAge = Date.parse(now) - Date.parse(truth.observed_at);
  check("truth.fresh", truth.freshness === "KNOWN" && Number.isFinite(truthAge) && truthAge >= 0 && truthAge <= policy.maximum_plan_age_ms, "provider_truth_stale", "Provider truth is known and inside the maximum permitted age.");
  check("truth.health", truth.provider_health === policy.minimum_provider_health && truth.account_health === "HEALTHY" && truth.provider_operational, "provider_or_account_unhealthy", "Provider/account health and operational status are healthy.");
  check("identity.lineage", plan.evaluation_id === plan.strategy_plan.provenance.evaluation_id && plan.correlation_id === plan.strategy_plan.provenance.evaluation_id, "execution_lineage_mismatch", "Execution lineage remains exact.");
  check("identity.route", truth.provider === plan.provider && truth.account_id === route?.account_id && truth.canonical_symbol === route?.canonical_symbol && truth.provider_symbol === route?.provider_symbol, "provider_identity_mismatch", "Provider/account/symbol mapping remains exact.");
  check("fingerprint.contract", !policy.require_contract_fingerprint_parity || truth.contract_fingerprint === plan.capital_allocation_plan.diagnostics.contract_fingerprint, "contract_fingerprint_drift", "Contract fingerprint matches certified allocation.");
  check("fingerprint.capability", !policy.require_capability_fingerprint_parity || truth.capability_fingerprint === plan.capability_fingerprint, "capability_fingerprint_drift", "Capability fingerprint matches the certified capability snapshot.");
  check("fingerprint.routing", truth.routing_fingerprint === plan.routing_fingerprint, "routing_fingerprint_drift", "Routing fingerprint remains exact.");
  check("fingerprint.execution", truth.execution_fingerprint === plan.execution_fingerprint, "execution_fingerprint_drift", "Execution fingerprint remains exact.");
  const plannedEntryQuantity = plan.orders.reduce((sum, order) => order.role === "ENTRY" || order.role.startsWith("ENTRY_TP") ? sum + order.quantity : sum, 0);
  const leverageInstructions = plan.provider_configuration.filter((item) => item.action === "SET_LEVERAGE" || item.action === "VERIFY_PRECONFIGURED_LEVERAGE");
  const leveragePreserved = leverageInstructions.length===1 && leverageInstructions.every(item=>{
    const values=['leverage','authorized_leverage','requiredLeverage','maximumLeverage'].filter(key=>item.provider_payload[key]!==undefined).map(key=>Number(item.provider_payload[key]));
    return values.length>0&&values.every(value=>Number.isFinite(value)&&value>0&&value===allocation?.leverage);
  });
  check("allocation.preserved", Boolean(allocation && Math.abs(plannedEntryQuantity - allocation.quantity) <= 1e-9 && leveragePreserved), "allocation_not_preserved", "Entry instructions preserve total quantity/lots and any planned leverage action preserves the allocation leverage.");
  check("provider.conflicts", !truth.conflicting_position && !truth.conflicting_open_entry, "conflicting_provider_position_or_entry", "No prohibited position or entry conflict exists.");
  check("provider.client_ids", !plan.orders.some((order) => truth.active_client_ids.includes(order.client_order_id)), "deterministic_client_id_already_active", "No planned deterministic client ID is already active.");
  check("provider.configuration", truth.configuration_change_safe, "provider_configuration_change_unsafe", "Margin/leverage configuration can be applied or verified safely.");
  check("provider.margin", Boolean(allocation && truth.available_margin >= allocation.margin), "insufficient_current_margin", "Current available margin covers the certified allocation.");
  if (plan.provider === "MT5_PROP") check("prop.revalidation", Boolean(truth.prop && truth.prop.account_mode === "MT5_PROP" && truth.prop.policy_version === plan.risk_decision.authorized_envelope?.policy_version && truth.prop.session_allowed && truth.prop.news_allowed && truth.prop.holding_allowed), "mt5_prop_revalidation_failed", "MT5 Prop stage/policy/restrictions remain eligible with no Personal fallback.");
  return deepFreeze({ allowed: reasons.length === 0, reasons: [...new Set(reasons)], checks, capability_fingerprint: truth.capability_fingerprint });
}

export interface ClaimRequest { key: string; owner: string; now: string; lease_expires_at: string; completed_replay_is_noop: true; }
export interface AtomicClaimResult { outcome: "ACQUIRED" | "CONFLICT" | "RECOVERED_STALE" | "COMPLETED_NOOP"; claim_token: string | null; existing_owner: string | null; }
export interface AtomicExecutionClaimStore { claimBatch(requests: readonly ClaimRequest[]): Promise<Readonly<Record<string, AtomicClaimResult>>>; markCompleted(keys: readonly string[], owner: string, completedAt: string): Promise<void>; }
export interface AppendOnlyExecutionEventStore { append(event: DeepReadonly<ExecutionEvent>): Promise<{ appended: boolean; duplicate: boolean }>; list(executionPlanId: string): Promise<readonly DeepReadonly<ExecutionEvent>[]>; }

export interface ProviderSubmissionResult {
  outcome: "ACKNOWLEDGED" | "REJECTED" | "AMBIGUOUS";
  provider_order_id: string | null;
  provider_position_id: string | null;
  raw_status: string;
  provider_timestamp: string | null;
  redacted_evidence: Readonly<Record<string, unknown>>;
  error: { taxonomy: string; message: string } | null;
}
export interface ProviderLookupResult { found: boolean; result: ProviderSubmissionResult | null; }
export interface CertifiedProviderPort {
  configure(instruction: PlannedProviderConfiguration): Promise<ProviderSubmissionResult>;
  submit(order: PlannedOrder): Promise<ProviderSubmissionResult>;
  lookupByClientId(clientOrderId: string): Promise<ProviderLookupResult>;
}

function normalizedProviderStatus(provider: RiskDomain, raw: string, outcome: ProviderSubmissionResult["outcome"]): string {
  const value = raw.trim().toUpperCase();
  if (outcome === "AMBIGUOUS") return "SUBMISSION_UNCERTAIN";
  if (outcome === "REJECTED") return "PROVIDER_REJECTED";
  if (provider === "BINANCE" && ["NEW", "ACCEPTED"].includes(value)) return "ACKNOWLEDGED";
  if (provider === "BYBIT" && ["NEW", "CREATED", "UNTRIGGERED"].includes(value)) return "ACKNOWLEDGED";
  if (provider.startsWith("MT5") && ["DONE", "PLACED", "ACKNOWLEDGED"].includes(value)) return "ACKNOWLEDGED";
  return "ACKNOWLEDGED_UNCLASSIFIED_PROVIDER_STATUS";
}

function event(plan: DeepReadonly<ExecutionPlan>, attempt: number, sequence: number, type: ExecutionEventType, observedAt: string, source: string, details: Partial<ExecutionEvent> = {}): DeepReadonly<ExecutionEvent> {
  const role = details.planned_order_role ?? null, client = details.deterministic_client_id ?? null;
  const body = { schema_version: EXECUTION_EVENT_VERSION, sequence, event_type: type, provider: plan.provider, account_id: plan.routing?.account_id ?? "unknown", environment: (plan.routing?.environment ?? "DEMO") as "TESTNET" | "DEMO" | "LIVE", correlation_id: plan.correlation_id, evaluation_id: plan.evaluation_id, execution_plan_id: plan.execution_plan_id, execution_attempt_number: attempt, planned_order_role: role, deterministic_client_id: client, provider_order_id: null, provider_position_id: null, request_timestamp: null, provider_timestamp: null, observed_timestamp: observedAt, raw_status: "NOT_APPLICABLE", normalized_status: type, quantity: null, filled_quantity: null, average_fill_price: null, fees: null, realized_slippage: null, provider_response_fingerprint: null, source_component: source, error: null, redacted_provider_evidence: {}, ...details } satisfies Omit<ExecutionEvent, "event_id">;
  return deepFreeze({ ...body, event_id: stableFingerprint({ plan: plan.execution_plan_id, attempt, sequence, type, role, client, observedAt, providerOrder: body.provider_order_id, normalized: body.normalized_status }) });
}

const eventState: Readonly<Record<ExecutionEventType, CanonicalExecutionState>> = { PLAN_ACCEPTED: "PLANNED", PLAN_REJECTED: "REJECTED", CLAIM_ACQUIRED: "CLAIMED", CLAIM_CONFLICT: "REJECTED", CONFIGURATION_REQUESTED: "CONFIGURING", CONFIGURATION_ACKNOWLEDGED: "READY_TO_SUBMIT", ENTRY_SUBMISSION_REQUESTED: "SUBMITTING", ENTRY_ACKNOWLEDGED: "ACKNOWLEDGED", ENTRY_REJECTED: "REJECTED", ENTRY_PARTIALLY_FILLED: "PARTIALLY_FILLED", ENTRY_FILLED: "FILLED", ENTRY_CANCELLED: "CANCELLED", ENTRY_EXPIRED: "CANCELLED", PROTECTION_SUBMISSION_REQUESTED: "PROTECTION_PENDING", PROTECTION_ACKNOWLEDGED: "PROTECTION_PENDING", PROTECTION_REJECTED: "PROTECTION_DEGRADED", PROTECTION_VERIFIED: "PROTECTED", PROTECTION_DEGRADED: "PROTECTION_DEGRADED", PROTECTION_MISSING: "PROTECTION_DEGRADED", SAFETY_CLOSE_REQUESTED: "SAFETY_CLOSING", SAFETY_CLOSE_ACKNOWLEDGED: "CLOSED", RECONCILIATION_STARTED: "RECONCILING", RECONCILIATION_RESOLVED: "ACKNOWLEDGED", RECONCILIATION_UNRESOLVED: "FAILED", EXECUTION_TERMINAL: "TERMINAL" };
const terminalStates = new Set<CanonicalExecutionState>(["CANCELLED", "REJECTED", "CLOSED", "FAILED", "TERMINAL"]);
const allowedTransitions: Readonly<Record<CanonicalExecutionState, readonly CanonicalExecutionState[]>> = {
  PLANNED: ["PLANNED", "CLAIMED", "REJECTED"], CLAIMED: ["CLAIMED", "CONFIGURING", "READY_TO_SUBMIT", "REJECTED"], CONFIGURING: ["CONFIGURING", "READY_TO_SUBMIT", "REJECTED", "RECONCILING", "FAILED"], READY_TO_SUBMIT: ["READY_TO_SUBMIT", "CONFIGURING", "SUBMITTING", "REJECTED"], SUBMITTING: ["SUBMITTING", "ACKNOWLEDGED", "REJECTED", "RECONCILING"], ACKNOWLEDGED: ["ACKNOWLEDGED", "SUBMITTING", "PARTIALLY_FILLED", "FILLED", "CANCELLING", "RECONCILING"], PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "PROTECTION_PENDING", "CANCELLING", "RECONCILING", "SAFETY_CLOSING"], FILLED: ["FILLED", "PROTECTION_PENDING", "PROTECTION_DEGRADED", "SAFETY_CLOSING"], PROTECTION_PENDING: ["PROTECTION_PENDING", "PROTECTED", "PROTECTION_DEGRADED", "RECONCILING", "SAFETY_CLOSING"], PROTECTED: ["PROTECTED", "PROTECTION_DEGRADED", "CANCELLING", "CLOSED"], PROTECTION_DEGRADED: ["PROTECTION_DEGRADED", "PROTECTION_PENDING", "PROTECTED", "RECONCILING", "SAFETY_CLOSING"], CANCELLING: ["CANCELLING", "CANCELLED", "RECONCILING"], CANCELLED: ["CANCELLED", "TERMINAL"], REJECTED: ["REJECTED", "TERMINAL"], RECONCILING: ["RECONCILING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "PROTECTION_PENDING", "PROTECTED", "PROTECTION_DEGRADED", "FAILED", "CANCELLED"], SAFETY_CLOSING: ["SAFETY_CLOSING", "CLOSED", "FAILED"], CLOSED: ["CLOSED", "TERMINAL"], FAILED: ["FAILED", "TERMINAL"], TERMINAL: ["TERMINAL"] };

export interface ExecutionProjection { state: CanonicalExecutionState; applied_event_ids: readonly string[]; ignored_duplicate_event_ids: readonly string[]; errors: readonly string[]; }
export function projectExecutionEvents(events: readonly DeepReadonly<ExecutionEvent>[]): DeepReadonly<ExecutionProjection> {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence || a.event_id.localeCompare(b.event_id));
  const seen = new Set<string>(), applied: string[] = [], duplicates: string[] = [], errors: string[] = [];
  let state: CanonicalExecutionState = "PLANNED";
  for (const item of ordered) {
    if (!item.normalized_status) { errors.push(`missing_normalized_status:${item.event_id}`); continue; }
    if (seen.has(item.event_id)) { duplicates.push(item.event_id); continue; }
    seen.add(item.event_id);
    const next = eventState[item.event_type];
    if (terminalStates.has(state) && next !== state && next !== "TERMINAL") { errors.push(`terminal_reopen_rejected:${state}->${next}:${item.event_id}`); continue; }
    if (!allowedTransitions[state].includes(next)) { errors.push(`invalid_transition:${state}->${next}:${item.event_id}`); continue; }
    state = next; applied.push(item.event_id);
  }
  return deepFreeze({ state, applied_event_ids: applied, ignored_duplicate_event_ids: duplicates, errors });
}

export interface AdoptionRunResult { submitted: boolean; shadow_only: boolean; attempt: DeepReadonly<ExecutionAttempt> | null; events: readonly DeepReadonly<ExecutionEvent>[]; projection: DeepReadonly<ExecutionProjection>; }

export async function adoptExecutionPlan(input: { plan: DeepReadonly<ExecutionPlan>; policy: DeepReadonly<ExecutionAdoptionPolicy>; truth: AdoptionTruth; now: string; executor_identity: string; attempt_number: number; lease_ms: number; claim_store: AtomicExecutionClaimStore; event_store: AppendOnlyExecutionEventStore; port: CertifiedProviderPort }): Promise<AdoptionRunResult> {
  const { plan, policy, truth } = input;
  const validation = revalidateAdoption(plan, policy, truth, input.now);
  let sequence = 1; const emitted: DeepReadonly<ExecutionEvent>[] = [];
  const append = async (item: DeepReadonly<ExecutionEvent>) => { const result = await input.event_store.append(item); if (result.appended) emitted.push(item); };
  if (!validation.allowed) {
    await append(event(plan, input.attempt_number, sequence++, "PLAN_REJECTED", input.now, "certified-adoption-revalidator", { raw_status: validation.reasons.join(","), normalized_status: "REJECTED", error: { taxonomy: validation.reasons[0] ?? "adoption_rejected", message: validation.reasons.join(", ") }, redacted_provider_evidence: { checks: validation.checks } }));
    const all = await input.event_store.list(plan.execution_plan_id); return { submitted: false, shadow_only: policy.certification_state === "SHADOW_COMPARE", attempt: null, events: all, projection: projectExecutionEvents(all) };
  }
  await append(event(plan, input.attempt_number, sequence++, "PLAN_ACCEPTED", input.now, "certified-adoption-revalidator", { normalized_status: policy.certification_state === "SHADOW_COMPARE" ? "SHADOW_ACCEPTED" : "ADOPTION_ACCEPTED" }));
  if (policy.certification_state === "SHADOW_COMPARE") {
    const all = await input.event_store.list(plan.execution_plan_id); return { submitted: false, shadow_only: true, attempt: null, events: all, projection: projectExecutionEvents(all) };
  }
  const leaseExpires = new Date(Date.parse(input.now) + input.lease_ms).toISOString();
  const keys = [plan.idempotency_key, ...plan.provider_configuration.map((item) => item.idempotency_key), ...plan.orders.map((item) => item.idempotency_key)];
  const claims = await input.claim_store.claimBatch(keys.map((key) => ({ key, owner: input.executor_identity, now: input.now, lease_expires_at: leaseExpires, completed_replay_is_noop: true })));
  const outcomes = Object.values(claims);
  const claimBlocked = outcomes.some((item) => item.outcome === "CONFLICT" || item.outcome === "COMPLETED_NOOP");
  if (claimBlocked) {
    await append(event(plan, input.attempt_number, sequence++, "CLAIM_CONFLICT", input.now, "execution-idempotency-claim", { raw_status: outcomes.map((item) => item.outcome).join(","), normalized_status: outcomes.some((item) => item.outcome === "COMPLETED_NOOP") ? "COMPLETED_REPLAY_NOOP" : "CLAIM_CONFLICT", redacted_provider_evidence: { claim_outcomes: outcomes.map((item) => item.outcome) } }));
    const all = await input.event_store.list(plan.execution_plan_id); return { submitted: false, shadow_only: false, attempt: null, events: all, projection: projectExecutionEvents(all) };
  }
  const attempt: DeepReadonly<ExecutionAttempt> = deepFreeze({ schema_version: EXECUTION_ATTEMPT_VERSION, execution_plan_id: plan.execution_plan_id, execution_fingerprint: plan.execution_fingerprint, correlation_id: plan.correlation_id, evaluation_id: plan.evaluation_id, allocation_id: plan.capital_allocation_plan.allocation_id, risk_decision_id: plan.risk_decision.decision_id, provider: plan.provider, environment: truth.environment, account_id: truth.account_id, plan_idempotency_key: plan.idempotency_key, order_idempotency_keys: plan.orders.map((item) => item.idempotency_key), adoption_policy_id: policy.policy_id, adoption_policy_version: policy.version, attempt_number: input.attempt_number, claimed_at: input.now, executor_identity: input.executor_identity, lease_expires_at: leaseExpires, canonical_state: "CLAIMED" });
  await append(event(plan, input.attempt_number, sequence++, "CLAIM_ACQUIRED", input.now, "execution-idempotency-claim", { normalized_status: outcomes.some((item) => item.outcome === "RECOVERED_STALE") ? "STALE_CLAIM_RECOVERED" : "CLAIMED" }));
  for (const configuration of plan.provider_configuration) {
    await append(event(plan, input.attempt_number, sequence++, "CONFIGURATION_REQUESTED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, { deterministic_client_id: configuration.idempotency_key, request_timestamp: input.now, normalized_status: configuration.action }));
    const response = await input.port.configure(configuration);
    if (response.outcome !== "ACKNOWLEDGED") {
      await append(event(plan, input.attempt_number, sequence++, response.outcome === "AMBIGUOUS" ? "RECONCILIATION_STARTED" : "PLAN_REJECTED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, responseDetails(response, null, configuration.idempotency_key)));
      const all = await input.event_store.list(plan.execution_plan_id); return { submitted: false, shadow_only: false, attempt, events: all, projection: projectExecutionEvents(all) };
    }
    await append(event(plan, input.attempt_number, sequence++, "CONFIGURATION_ACKNOWLEDGED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, responseDetails(response, null, configuration.idempotency_key)));
  }
  const entryOrders = plan.orders.filter((order) => order.role === "ENTRY" || order.role.startsWith("ENTRY_TP"));
  for (const order of entryOrders) {
    await append(event(plan, input.attempt_number, sequence++, "ENTRY_SUBMISSION_REQUESTED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, { planned_order_role: order.role, deterministic_client_id: order.client_order_id, request_timestamp: input.now, normalized_status: "SUBMITTING", quantity: order.quantity, redacted_provider_evidence: { payload_fingerprint: stableFingerprint(order.provider_payload) } }));
    let response = await input.port.submit(order);
    if (response.outcome === "AMBIGUOUS") {
      await append(event(plan, input.attempt_number, sequence++, "RECONCILIATION_STARTED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, responseDetails(response, order, order.client_order_id)));
      const lookup = await input.port.lookupByClientId(order.client_order_id);
      if (!lookup.found || !lookup.result) {
        await append(event(plan, input.attempt_number, sequence++, "RECONCILIATION_UNRESOLVED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, { planned_order_role: order.role, deterministic_client_id: order.client_order_id, raw_status: "NOT_FOUND_BY_CLIENT_ID", normalized_status: "SUBMISSION_UNCERTAIN", error: { taxonomy: "ambiguous_submission_unresolved", message: "Provider lookup found no deterministic client identity; no retry submitted." } }));
        const all = await input.event_store.list(plan.execution_plan_id); return { submitted: true, shadow_only: false, attempt, events: all, projection: projectExecutionEvents(all) };
      }
      response = lookup.result;
      await append(event(plan, input.attempt_number, sequence++, "RECONCILIATION_RESOLVED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, responseDetails(response, order, order.client_order_id)));
    }
    const acknowledged = response.outcome === "ACKNOWLEDGED";
    await append(event(plan, input.attempt_number, sequence++, acknowledged ? "ENTRY_ACKNOWLEDGED" : "ENTRY_REJECTED", input.now, `${plan.provider.toLowerCase()}-certified-adoption`, responseDetails(response, order, order.client_order_id)));
    if (!acknowledged) { const all = await input.event_store.list(plan.execution_plan_id); return { submitted: true, shadow_only: false, attempt, events: all, projection: projectExecutionEvents(all) }; }
  }
  await input.claim_store.markCompleted(keys, input.executor_identity, input.now);
  const all = await input.event_store.list(plan.execution_plan_id); return { submitted: entryOrders.length > 0, shadow_only: false, attempt, events: all, projection: projectExecutionEvents(all) };
}

function responseDetails(response: ProviderSubmissionResult, order: PlannedOrder | null, identity: string): Partial<ExecutionEvent> {
  return { planned_order_role: order?.role ?? null, deterministic_client_id: order?.client_order_id ?? identity, provider_order_id: response.provider_order_id, provider_position_id: response.provider_position_id, provider_timestamp: response.provider_timestamp, raw_status: response.raw_status || "MISSING_PROVIDER_STATUS", normalized_status: normalizedProviderStatus(order?.provider ?? "BINANCE", response.raw_status, response.outcome), quantity: order?.quantity ?? null, provider_response_fingerprint: stableFingerprint(response.redacted_evidence), error: response.error, redacted_provider_evidence: response.redacted_evidence };
}

export interface FillBindingPolicy { schema_version: typeof FILL_BINDING_POLICY_VERSION; policy_id: string; version: string; partial_fill_action: "PROTECT_FILLED_AND_CANCEL_REMAINDER" | "WAIT_WITHIN_LIFETIME"; maximum_wait_ms: number; never_increase_quantity: true; }
export interface FillFact { order_role: PlannedOrder["role"]; provider_order_id: string; provider_position_id: string | null; filled_quantity: number; remaining_quantity: number; average_fill_price: number; fee: { amount: number; currency: string } | null; provider_timestamp: string; }
export interface BoundFill { planned_quantity: number; filled_quantity: number; remaining_quantity: number; average_fill_price: number; slippage: { amount: number; unit: "PRICE" }; protection_quantity_ceiling: number; action: "WAIT" | "CANCEL_REMAINDER_AND_PROTECT" | "PROTECT_FULL_FILL" | "REJECT_OVERFILL"; }
export function bindFill(plan: DeepReadonly<ExecutionPlan>, fact: FillFact, policy: FillBindingPolicy): DeepReadonly<BoundFill> {
  const order = plan.orders.find((item) => item.role === fact.order_role && item.provider === plan.provider);
  if (!order) throw new Error("fill_order_role_not_planned");
  if (![fact.filled_quantity, fact.remaining_quantity, fact.average_fill_price].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("invalid_fill_fact");
  if (fact.filled_quantity > order.quantity + 1e-9) return deepFreeze({ planned_quantity: order.quantity, filled_quantity: fact.filled_quantity, remaining_quantity: fact.remaining_quantity, average_fill_price: fact.average_fill_price, slippage: { amount: fact.average_fill_price - (order.price ?? plan.capital_allocation_plan.allocation!.entry_reference), unit: "PRICE" }, protection_quantity_ceiling: order.quantity, action: "REJECT_OVERFILL" });
  const full = Math.abs(fact.filled_quantity - order.quantity) <= 1e-9;
  return deepFreeze({ planned_quantity: order.quantity, filled_quantity: fact.filled_quantity, remaining_quantity: fact.remaining_quantity, average_fill_price: fact.average_fill_price, slippage: { amount: fact.average_fill_price - (order.price ?? plan.capital_allocation_plan.allocation!.entry_reference), unit: "PRICE" }, protection_quantity_ceiling: fact.filled_quantity, action: full ? "PROTECT_FULL_FILL" : policy.partial_fill_action === "PROTECT_FILLED_AND_CANCEL_REMAINDER" ? "CANCEL_REMAINDER_AND_PROTECT" : "WAIT" });
}

export interface ExecutionAdoptionControl { schema_version: typeof EXECUTION_CONTROL_VERSION; control_id: string; action: "DISABLE_ADOPTION" | "ENABLE_SHADOW_COMPARE" | "REQUEST_RECONCILIATION" | "HALT_SUBMISSION" | "ENABLE_PROTECTION_ONLY_RECOVERY" | "ROLLBACK_TO_LEGACY" | "ACKNOWLEDGE_INCIDENT"; provider: RiskDomain; environment: "TESTNET" | "DEMO" | "LIVE"; account_id: string | null; requested_by: string; requested_at: string; authorization_reference: string; idempotency_key: string; audit_required: true; provider_confirmation_required: boolean; }
