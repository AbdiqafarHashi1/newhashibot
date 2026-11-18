import {houseMoneyRisk,type HouseMoneyFacts,type EquityMode} from './house-money-risk.ts';
export {houseMoneyRisk,type HouseMoneyFacts,type HouseMoneyDecision} from './house-money-risk.ts';
import {
  deepFreeze,
  stableFingerprint,
  type ApprovedStrategyPlan,
  type DeepReadonly,
  type StrategyPlan,
} from "./strategy-plan.ts";

export const RISK_DECISION_SCHEMA_VERSION = "risk-decision/v1" as const;
export const RISK_CONTEXT_SCHEMA_VERSION = "risk-evaluation-context/v1" as const;
export const RISK_POLICY_SCHEMA_VERSION = "risk-policy/v1" as const;
export const PROP_POLICY_SCHEMA_VERSION = "prop-risk-policy/v1" as const;

export type RiskDomain = "BINANCE" | "BYBIT" | "MT5_PERSONAL" | "MT5_PROP";
export type RiskDecisionAction = "ACCEPT" | "REDUCE" | "REJECT";
export type TruthState = "KNOWN" | "UNKNOWN" | "STALE" | "UNAVAILABLE";
export type UnknownHandling = "REJECT" | "REDUCE" | "ADVISORY";
export type RiskGateStatus = "PASS" | "REDUCE" | "REJECT" | "UNKNOWN" | "NOT_APPLICABLE";

export interface RiskFact<T> { state: TruthState; value: T | null; observed_at?: string | null; }
export interface PositionRiskTruth {
  provider: RiskDomain;
  symbol: string;
  direction: "BUY" | "SELL";
  asset_class: "CRYPTO" | "FOREX" | "GOLD";
  risk_percent: number;
  notional: number;
  base_asset: string;
  quote_currency: string;
  currencies: readonly string[];
  correlation_group: string;
}

export interface RiskEvaluationContext {
  house_money?:{mode:EquityMode;facts:HouseMoneyFacts;topHourly:boolean;weekendMultiplier:1|0.75};
  schema_version: typeof RISK_CONTEXT_SCHEMA_VERSION;
  lineage: {
    evaluation_id: string;
    correlation_id: string;
    risk_policy_id: string;
    risk_policy_version: string;
    evaluated_at: string;
    account_id: string;
    customer_id: string | null;
    provider: RiskDomain;
    environment: "TESTNET" | "DEMO" | "LIVE";
    account_mode: RiskDomain;
  };
  request: { risk_percent: number; leverage_ceiling: number };
  account: {
    exists: boolean;
    enabled: boolean;
    customer_authorized: boolean;
    execution_enabled: boolean;
    manually_locked: boolean;
    balance: RiskFact<number>;
    equity: RiskFact<number>;
    available_margin: RiskFact<number>;
    used_margin: RiskFact<number>;
    margin_utilization_pct: RiskFact<number>;
    realized_daily_pnl: RiskFact<number>;
    unrealized_pnl: RiskFact<number>;
    daily_loss_used_pct: RiskFact<number>;
    weekly_loss_used_pct: RiskFact<number>;
    current_drawdown_pct: RiskFact<number>;
    peak_equity: RiskFact<number>;
    open_positions: RiskFact<readonly PositionRiskTruth[]>;
    pending_orders: RiskFact<number>;
    pending_risk_pct: RiskFact<number>;
    aggregate_open_risk_pct: RiskFact<number>;
    provider_health: RiskFact<"HEALTHY" | "DEGRADED" | "UNHEALTHY">;
    truth_timestamp: string | null;
    freshness: TruthState;
  };
  portfolio: {
    exposure_by_provider_pct: RiskFact<Readonly<Record<RiskDomain, number>>>;
    exposure_by_symbol_pct: RiskFact<Readonly<Record<string, number>>>;
    exposure_by_asset_class_pct: RiskFact<Readonly<Record<string, number>>>;
    exposure_by_direction_pct: RiskFact<Readonly<Record<string, number>>>;
    exposure_by_base_asset_pct: RiskFact<Readonly<Record<string, number>>>;
    exposure_by_quote_currency_pct: RiskFact<Readonly<Record<string, number>>>;
    forex_currency_exposure_pct: RiskFact<Readonly<Record<string, number>>>;
    correlated_symbol_exposure_pct: RiskFact<Readonly<Record<string, number>>>;
    gold_exposure_pct: RiskFact<number>;
    open_risk_concentration_pct: RiskFact<number>;
  };
  market: {
    session: RiskFact<string>;
    spread: RiskFact<"ELIGIBLE" | "INELIGIBLE">;
    liquidity: RiskFact<"ELIGIBLE" | "INELIGIBLE">;
    news: RiskFact<"CLEAR" | "RESTRICTED">;
    weekend: RiskFact<boolean>;
    overnight: RiskFact<boolean>;
    provider_operational: RiskFact<boolean>;
    account_lock: RiskFact<boolean>;
    customer_execution: RiskFact<boolean>;
  };
}

export interface PropRiskPolicy {
  schema_version: typeof PROP_POLICY_SCHEMA_VERSION;
  policy_id: string;
  version: string;
  firm_name?: string;
  challenge_type?: "CHALLENGE" | "VERIFICATION" | "FUNDED";
  starting_balance: number;
  daily_loss_limit_pct: number;
  maximum_drawdown_limit_pct: number;
  drawdown_type: "STATIC" | "TRAILING" | "UNKNOWN";
  calculation_basis: "BALANCE" | "EQUITY" | "BALANCE_AND_EQUITY" | "UNKNOWN";
  floating_loss_treatment: "INCLUDED" | "EXCLUDED" | "UNKNOWN";
  reset_time: string;
  timezone: string;
  weekend_holding_rule: "ALLOWED" | "FORBIDDEN" | "UNKNOWN";
  overnight_holding_rule: "ALLOWED" | "FORBIDDEN" | "UNKNOWN";
  news_rule: "ALLOWED" | "FORBIDDEN" | "UNKNOWN";
  maximum_risk_per_trade_pct: number;
  maximum_open_risk_pct: number;
  leverage_cap: number;
  consistency_rule?: string;
  minimum_trading_days?: number;
  safety_buffer_pct: number;
  unknown_fields: readonly string[];
}

export interface RiskPolicy {
  schema_version: typeof RISK_POLICY_SCHEMA_VERSION;
  policy_id: string;
  version: string;
  domain: RiskDomain;
  source: "SYSTEM" | "ACCOUNT_MODE" | "PROVIDER" | "PROP" | "CUSTOMER" | "STRATEGY" | "EMERGENCY";
  allowed_environments: readonly RiskEvaluationContext["lineage"]["environment"][];
  allowed_account_ids: readonly string[];
  allowed_asset_classes: readonly StrategyPlan["identity"]["asset_class"][];
  hard: boolean;
  limits: {
    max_risk_per_trade_pct: number;
    min_risk_per_trade_pct: number;
    leverage_cap: number;
    daily_loss_limit_pct: number;
    weekly_loss_limit_pct: number;
    maximum_drawdown_pct: number;
    maximum_open_risk_pct: number;
    maximum_concurrent_positions: number;
    maximum_pending_orders: number;
    symbol_concentration_pct: number;
    base_asset_concentration_pct: number;
    quote_currency_concentration_pct: number;
    forex_currency_concentration_pct: number;
    correlated_exposure_pct: number;
    gold_exposure_pct: number;
    provider_exposure_pct: number;
    asset_class_exposure_pct: number;
    directional_exposure_pct: number;
    margin_utilization_pct: number;
  };
  reduction: { starts_at_consumption_ratio: number; stale_context_factor: number };
  requirements: {
    truth_freshness_ms: number;
    one_active_position_per_symbol: boolean;
    provider_health_required: boolean;
    allowed_sessions: readonly string[];
    session: UnknownHandling;
    spread: UnknownHandling;
    liquidity: UnknownHandling;
    news: UnknownHandling;
    weekend: UnknownHandling;
    overnight: UnknownHandling;
  };
  prop_policy?: PropRiskPolicy;
}

export interface ResolvedRiskPolicy extends Omit<RiskPolicy, "source" | "hard"> {
  fingerprint: string;
  resolution_sources: readonly { policy_id: string; version: string; source: RiskPolicy["source"]; hard: boolean }[];
  provenance: Readonly<Record<string, { value: unknown; policy_id: string; version: string; source: RiskPolicy["source"] }>>;
}

export interface RiskGate {
  id: string;
  category: "CONTRACT" | "ACCOUNT" | "TRUTH" | "LOSS" | "PORTFOLIO" | "CONCENTRATION" | "MARKET" | "AUTHORIZATION";
  status: RiskGateStatus;
  observed: unknown;
  permitted: unknown;
  unit: string;
  reason_code: string;
  explanation: string;
  policy_source: string;
  effect: "HARD" | "REDUCING" | "ADVISORY" | "INFORMATIONAL";
}

export interface RiskDecision {
  schema_version: typeof RISK_DECISION_SCHEMA_VERSION;
  decision_id: string;
  correlation_id: string;
  evaluation_id: string;
  evaluated_at: string;
  approved_strategy_plan: DeepReadonly<ApprovedStrategyPlan>;
  account: { id: string; customer_id: string | null; provider: RiskDomain; environment: RiskEvaluationContext["lineage"]["environment"]; mode: RiskDomain };
  decision: RiskDecisionAction;
  authorized_envelope: null | {
    requested_risk_percent: number;
    authorized_risk_percent: number;
    requested_risk_amount: number;
    maximum_authorized_risk_amount: number;
    requested_leverage_ceiling: number;
    leverage_ceiling: number;
    maximum_notional: number | null;
    maximum_margin: number | null;
    maximum_quantity: null;
    permitted_provider: RiskDomain;
    permitted_account_id: string;
    policy_id: string;
    policy_version: string;
  };
  gate_ledger: readonly RiskGate[];
  reductions: readonly { rule_id: string; source: string; original: number; reduced: number; transformation: string; binding: boolean }[];
  explanation: { summary: string; decisive_rule: string; near_exhaustion: readonly string[]; unknown_context: readonly string[]; downstream_may_append: readonly string[]; immutable_strategy_fields: readonly string[] };
  diagnostics: { evaluator_status: "COMPLETED"; policy_resolution_source: string; effective_policy_fingerprint: string; missing_context: readonly string[]; stale_context: readonly string[]; warnings: readonly string[]; runtime: { canonical: false; duration_ms: null } };
}

const sourceRank: Record<RiskPolicy["source"], number> = { SYSTEM: 0, ACCOUNT_MODE: 1, PROVIDER: 2, PROP: 3, CUSTOMER: 4, STRATEGY: 5, EMERGENCY: 6 };
const unknownRank: Record<UnknownHandling, number> = { ADVISORY: 0, REDUCE: 1, REJECT: 2 };
const limitKeys: readonly (keyof RiskPolicy["limits"])[] = ["max_risk_per_trade_pct", "min_risk_per_trade_pct", "leverage_cap", "daily_loss_limit_pct", "weekly_loss_limit_pct", "maximum_drawdown_pct", "maximum_open_risk_pct", "maximum_concurrent_positions", "maximum_pending_orders", "symbol_concentration_pct", "base_asset_concentration_pct", "quote_currency_concentration_pct", "forex_currency_concentration_pct", "correlated_exposure_pct", "gold_exposure_pct", "provider_exposure_pct", "asset_class_exposure_pct", "directional_exposure_pct", "margin_utilization_pct"];

export function resolveRiskPolicy(policies: readonly RiskPolicy[], domain: RiskDomain): DeepReadonly<ResolvedRiskPolicy> {
  const applicable = policies.filter((policy) => policy.domain === domain).sort((a, b) => sourceRank[a.source] - sourceRank[b.source] || a.policy_id.localeCompare(b.policy_id) || a.version.localeCompare(b.version));
  if (!applicable.length) throw new Error(`risk_policy_missing:${domain}`);
  const base = structuredClone(applicable[0]);
  const provenance: Record<string, { value: unknown; policy_id: string; version: string; source: RiskPolicy["source"] }> = {};
  for (const key of limitKeys) {
    let selected = base.limits[key], owner = applicable[0];
    for (const policy of applicable.slice(1)) {
      const candidate = policy.limits[key];
      if (key === "min_risk_per_trade_pct" ? candidate > selected : candidate < selected) { selected = candidate; owner = policy; }
    }
    base.limits[key] = selected;
    provenance[`limits.${key}`] = { value: selected, policy_id: owner.policy_id, version: owner.version, source: owner.source };
  }
  for (const key of ["session", "spread", "liquidity", "news", "weekend", "overnight"] as const) {
    let owner = applicable[0];
    for (const policy of applicable.slice(1)) if (unknownRank[policy.requirements[key]] > unknownRank[owner.requirements[key]]) owner = policy;
    base.requirements[key] = owner.requirements[key];
    provenance[`requirements.${key}`] = { value: owner.requirements[key], policy_id: owner.policy_id, version: owner.version, source: owner.source };
  }
  base.requirements.truth_freshness_ms = Math.min(...applicable.map((p) => p.requirements.truth_freshness_ms));
  base.requirements.one_active_position_per_symbol = applicable.some((p) => p.requirements.one_active_position_per_symbol);
  base.requirements.provider_health_required = applicable.some((p) => p.requirements.provider_health_required);
  const sessionSets = applicable.map((p) => p.requirements.allowed_sessions).filter((rows) => rows.length);
  base.requirements.allowed_sessions = sessionSets.length ? sessionSets.reduce((current, rows) => current.filter((value) => rows.includes(value)), [...sessionSets[0]]) : [];
  base.reduction.starts_at_consumption_ratio = Math.min(...applicable.map((p) => p.reduction.starts_at_consumption_ratio));
  base.reduction.stale_context_factor = Math.min(...applicable.map((p) => p.reduction.stale_context_factor));
  base.allowed_environments = applicable.reduce((current, policy) => current.filter((value) => policy.allowed_environments.includes(value)), [...applicable[0].allowed_environments]);
  base.allowed_asset_classes = applicable.reduce((current, policy) => current.filter((value) => policy.allowed_asset_classes.includes(value)), [...applicable[0].allowed_asset_classes]);
  const explicitAccounts = applicable.filter((p) => p.allowed_account_ids.length).flatMap((p) => p.allowed_account_ids);
  base.allowed_account_ids = [...new Set(explicitAccounts)];
  const propPolicies = applicable.map((p) => p.prop_policy).filter((p): p is PropRiskPolicy => Boolean(p));
  if (domain === "MT5_PROP" && !propPolicies.length) throw new Error("prop_policy_missing:MT5_PROP");
  if (propPolicies.length) {
    const prop = propPolicies.at(-1)!;
    base.prop_policy = structuredClone(prop);
    const propLimits: Partial<Record<keyof RiskPolicy["limits"], number>> = {
      max_risk_per_trade_pct: prop.maximum_risk_per_trade_pct,
      leverage_cap: prop.leverage_cap,
      daily_loss_limit_pct: prop.daily_loss_limit_pct,
      maximum_drawdown_pct: prop.maximum_drawdown_limit_pct,
      maximum_open_risk_pct: prop.maximum_open_risk_pct,
    };
    for (const [key, value] of Object.entries(propLimits) as [keyof RiskPolicy["limits"], number][]) {
      if (value < base.limits[key]) {
        base.limits[key] = value;
        provenance[`limits.${key}`] = { value, policy_id: prop.policy_id, version: prop.version, source: "PROP" };
      }
    }
  }
  const resolvedWithoutFingerprint = {
    ...base,
    source: undefined,
    hard: undefined,
    resolution_sources: applicable.map(({ policy_id, version, source, hard }) => ({ policy_id, version, source, hard })),
    provenance,
  };
  delete (resolvedWithoutFingerprint as { source?: unknown }).source;
  delete (resolvedWithoutFingerprint as { hard?: unknown }).hard;
  const fingerprint = stableFingerprint(resolvedWithoutFingerprint);
  return deepFreeze({ ...resolvedWithoutFingerprint, fingerprint } as ResolvedRiskPolicy);
}

const factMissing = (fact: RiskFact<unknown>) => fact.state !== "KNOWN" || fact.value === null;
const numberFact = (fact: RiskFact<number>): number | null => fact.state === "KNOWN" && Number.isFinite(fact.value) ? fact.value : null;
const recordValue = (fact: RiskFact<Readonly<Record<string, number>>>): Readonly<Record<string, number>> | null => fact.state === "KNOWN" && fact.value ? fact.value : null;
const normalizeSymbol = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function gate(id: string, category: RiskGate["category"], status: RiskGateStatus, observed: unknown, permitted: unknown, unit: string, reason: string, explanation: string, policy: ResolvedRiskPolicy, effect: RiskGate["effect"]): RiskGate {
  return { id, category, status, observed, permitted, unit, reason_code: reason, explanation, policy_source: `${policy.policy_id}@${policy.version}`, effect };
}

export function evaluateRisk(approved: DeepReadonly<ApprovedStrategyPlan>, context: RiskEvaluationContext, policy: DeepReadonly<ResolvedRiskPolicy>): DeepReadonly<RiskDecision> {
  const gates: RiskGate[] = [], reductions: RiskDecision["reductions"] extends readonly (infer T)[] ? T[] : never = [], missing: string[] = [], stale: string[] = [], warnings: string[] = [];
  let hardReason = "", authorizedPct = context.request.risk_percent, leverage = context.request.leverage_ceiling;
  const reject = (id: string, category: RiskGate["category"], observed: unknown, permitted: unknown, unit: string, reason: string, explanation: string) => { gates.push(gate(id, category, "REJECT", observed, permitted, unit, reason, explanation, policy, "HARD")); if (!hardReason) hardReason = reason; };
  const pass = (id: string, category: RiskGate["category"], observed: unknown, permitted: unknown, unit: string, reason: string, explanation: string) => gates.push(gate(id, category, "PASS", observed, permitted, unit, reason, explanation, policy, "HARD"));
  const reduce = (id: string, category: RiskGate["category"], next: number, unit: string, reason: string, explanation: string) => {
    const original = authorizedPct; authorizedPct = Math.max(0, Math.min(authorizedPct, next));
    gates.push(gate(id, category, authorizedPct < original ? "REDUCE" : "PASS", original, authorizedPct, unit, reason, explanation, policy, "REDUCING"));
    if (authorizedPct < original) reductions.push({ rule_id: id, source: `${policy.policy_id}@${policy.version}`, original, reduced: authorizedPct, transformation: `min(${original}, ${next})`, binding: true });
  };

  // 1. Contract integrity
  if (!approved || !Object.isFrozen(approved) || !Object.isFrozen(approved.strategy_plan)) reject("contract.immutable", "CONTRACT", Boolean(approved && Object.isFrozen(approved)), true, "boolean", "mutable_approved_plan", "ApprovedStrategyPlan and nested StrategyPlan must be deeply frozen."); else pass("contract.immutable", "CONTRACT", true, true, "boolean", "approved_plan_immutable", "Approved strategy plan is immutable.");
  const plan: DeepReadonly<StrategyPlan> | null = approved?.strategy_plan ?? null;
  if (!plan || plan.decision.action === "NO_TRADE" || !plan.decision.qualified) reject("contract.tradeable", "CONTRACT", plan?.decision.action ?? null, "BUY|SELL", "decision", "strategy_plan_not_tradeable", "Risk authorization requires a qualified BUY or SELL plan."); else pass("contract.tradeable", "CONTRACT", plan.decision.action, "BUY|SELL", "decision", "strategy_plan_tradeable", "Strategy decision is tradeable.");
  const expectedCorrelation = plan?.provenance.evaluation_id ?? null;
  if (context.lineage.evaluation_id !== expectedCorrelation || context.lineage.correlation_id !== expectedCorrelation || approved?.correlation_id !== expectedCorrelation) reject("contract.correlation", "CONTRACT", context.lineage.correlation_id, expectedCorrelation, "id", "correlation_mismatch", "Plan, approval and risk context lineage must match."); else pass("contract.correlation", "CONTRACT", expectedCorrelation, expectedCorrelation, "id", "correlation_match", "Risk lineage matches the strategy evaluation.");
  if (context.lineage.provider !== context.lineage.account_mode || policy.domain !== context.lineage.account_mode || context.lineage.risk_policy_id !== policy.policy_id || context.lineage.risk_policy_version !== policy.version) reject("contract.domain", "CONTRACT", `${context.lineage.provider}/${context.lineage.account_mode}`, policy.domain, "domain", "provider_account_mode_mismatch", "Provider, account mode and resolved policy domain must match."); else pass("contract.domain", "CONTRACT", policy.domain, policy.domain, "domain", "risk_domain_match", "Provider-aware domain is consistent.");

  if(context.house_money){
   const h=context.house_money,f=h.facts,d=houseMoneyRisk(h.mode,f,context.lineage.evaluated_at,h.topHourly,h.weekendMultiplier);
   if(f.accountId!==context.lineage.account_id||f.customerId!==context.lineage.customer_id||d.block_reason||context.request.risk_percent>d.applied_risk_pct+1e-9)reject('account.house_money','ACCOUNT',context.request.risk_percent,d.applied_risk_pct,'percent',d.block_reason??'HOUSE_MONEY_RISK_CEILING','Current account phase limits requested risk.');
  }
  // 2. Account eligibility
  const accountEligible = context.account.exists && context.account.enabled && context.account.customer_authorized && context.account.execution_enabled && !context.account.manually_locked;
  if (!accountEligible) reject("account.eligibility", "ACCOUNT", { exists: context.account.exists, enabled: context.account.enabled, customer_authorized: context.account.customer_authorized, execution_enabled: context.account.execution_enabled, locked: context.account.manually_locked }, "all enabled and unlocked", "state", !context.account.exists ? "account_missing" : !context.account.enabled ? "account_disabled" : !context.account.customer_authorized ? "customer_unauthorized" : !context.account.execution_enabled ? "execution_disabled" : "account_locked", "Account must exist, be enabled and authorized, and remain unlocked."); else pass("account.eligibility", "ACCOUNT", "eligible", "eligible", "state", "account_eligible", "Account eligibility passed.");
  if (!policy.allowed_environments.includes(context.lineage.environment) || (policy.allowed_account_ids.length > 0 && !policy.allowed_account_ids.includes(context.lineage.account_id))) reject("account.policy_scope", "ACCOUNT", `${context.lineage.environment}/${context.lineage.account_id}`, "allowed policy scope", "scope", "account_provider_not_authorized", "Account/environment is outside the resolved policy scope."); else pass("account.policy_scope", "ACCOUNT", `${context.lineage.environment}/${context.lineage.account_id}`, "allowed", "scope", "account_provider_authorized", "Account and environment are authorized by policy.");
  if (!plan || !policy.allowed_asset_classes.includes(plan.identity.asset_class)) reject("account.asset_class", "ACCOUNT", plan?.identity.asset_class ?? null, policy.allowed_asset_classes, "asset_class", "asset_class_not_authorized", "Resolved account policy does not authorize this strategy asset class."); else pass("account.asset_class", "ACCOUNT", plan.identity.asset_class, policy.allowed_asset_classes, "asset_class", "asset_class_authorized", "Strategy asset class is authorized for the account policy.");

  // 3. Truth quality (fail safe)
  const truthFacts: [string, RiskFact<unknown>][] = [["balance", context.account.balance], ["equity", context.account.equity], ["available_margin", context.account.available_margin], ["used_margin", context.account.used_margin], ["margin_utilization", context.account.margin_utilization_pct], ["open_positions", context.account.open_positions], ["pending_orders", context.account.pending_orders], ["pending_risk", context.account.pending_risk_pct], ["aggregate_open_risk", context.account.aggregate_open_risk_pct], ["provider_health", context.account.provider_health]];
  const badTruth = truthFacts.filter(([, fact]) => factMissing(fact));
  for (const [name, fact] of badTruth) { (fact.state === "STALE" ? stale : missing).push(name); }
  const truthAge = context.account.truth_timestamp ? Date.parse(context.lineage.evaluated_at) - Date.parse(context.account.truth_timestamp) : Infinity;
  if (context.account.freshness !== "KNOWN" || badTruth.length || !Number.isFinite(truthAge) || truthAge < 0 || truthAge > policy.requirements.truth_freshness_ms) reject("truth.account_snapshot", "TRUTH", { freshness: context.account.freshness, age_ms: truthAge, missing: badTruth.map(([name]) => name) }, { state: "KNOWN", maximum_age_ms: policy.requirements.truth_freshness_ms }, "state/ms", context.account.freshness === "STALE" || truthAge > policy.requirements.truth_freshness_ms ? "account_truth_stale" : "account_truth_unavailable", "Live authorization fails safe when account or exposure truth is stale or unavailable."); else pass("truth.account_snapshot", "TRUTH", truthAge, policy.requirements.truth_freshness_ms, "ms", "account_truth_fresh", "Required account truth is fresh and present.");
  const equity = numberFact(context.account.equity), balance = numberFact(context.account.balance);
  if (equity === null || balance === null || equity <= 0 || balance <= 0) reject("truth.capital", "TRUTH", { equity, balance }, "> 0", "account currency", "invalid_account_capital", "Balance and equity must be finite and positive."); else pass("truth.capital", "TRUTH", { equity, balance }, "> 0", "account currency", "account_capital_valid", "Balance and equity are valid.");
  const health = context.account.provider_health.value;
  if (policy.requirements.provider_health_required && health !== "HEALTHY") reject("truth.provider_health", "TRUTH", health, "HEALTHY", "state", health === "UNHEALTHY" ? "provider_unhealthy" : "provider_health_unknown", "Provider health must be known healthy."); else pass("truth.provider_health", "TRUTH", health, "HEALTHY", "state", "provider_healthy", "Provider health requirement passed.");
  const marginUtilization = numberFact(context.account.margin_utilization_pct);
  if (marginUtilization === null) reject("truth.margin_utilization", "TRUTH", context.account.margin_utilization_pct.state, policy.limits.margin_utilization_pct, "percent", "margin_utilization_unknown", "Margin utilization truth is required.");
  else if (marginUtilization >= policy.limits.margin_utilization_pct) reject("truth.margin_utilization", "TRUTH", marginUtilization, policy.limits.margin_utilization_pct, "percent", "margin_utilization_breach", "Margin utilization limit reached.");
  else if (marginUtilization / policy.limits.margin_utilization_pct >= policy.reduction.starts_at_consumption_ratio) reduce("truth.margin_utilization", "TRUTH", authorizedPct * Math.max(0, (1 - marginUtilization / policy.limits.margin_utilization_pct) / (1 - policy.reduction.starts_at_consumption_ratio)), "percent", "margin_utilization_reduction", "Risk reduces linearly as margin utilization approaches its limit.");
  else pass("truth.margin_utilization", "TRUTH", marginUtilization, policy.limits.margin_utilization_pct, "percent", "margin_utilization_available", "Margin utilization remains below the reduction threshold.");

  // 4. Loss and drawdown controls
  const consumptionGate = (id: string, fact: RiskFact<number>, limit: number, breach: string) => {
    const observed = numberFact(fact);
    if (observed === null) { reject(id, "LOSS", fact.state, limit, "percent", `${id}_unknown`, `${id} truth is required.`); return; }
    if (observed >= limit) { reject(id, "LOSS", observed, limit, "percent", breach, `${id} reached or exceeded its hard limit.`); return; }
    const ratio = limit > 0 ? observed / limit : 1;
    if (ratio >= policy.reduction.starts_at_consumption_ratio) {
      const availableRatio = Math.max(0, (1 - ratio) / (1 - policy.reduction.starts_at_consumption_ratio));
      reduce(id, "LOSS", authorizedPct * availableRatio, "percent", `${id}_proximity_reduction`, `${id} consumed ${(ratio * 100).toFixed(2)}%; risk scales linearly to zero at the limit.`);
    } else pass(id, "LOSS", observed, limit, "percent", `${id}_within_limit`, `${id} is below its reduction threshold.`);
  };
  consumptionGate("loss.daily", context.account.daily_loss_used_pct, policy.limits.daily_loss_limit_pct, "daily_loss_breach");
  consumptionGate("loss.weekly", context.account.weekly_loss_used_pct, policy.limits.weekly_loss_limit_pct, "weekly_loss_breach");
  consumptionGate("loss.drawdown", context.account.current_drawdown_pct, policy.limits.maximum_drawdown_pct, "maximum_drawdown_breach");
  if (policy.domain === "MT5_PROP" && policy.prop_policy) {
    const unknowns = policy.prop_policy.unknown_fields;
    if (unknowns.length) reject("loss.prop_policy_completeness", "LOSS", unknowns, [], "fields", "prop_policy_required_rules_unknown", "Unknown prop rules are not silently treated as safe."); else pass("loss.prop_policy_completeness", "LOSS", [], [], "fields", "prop_policy_complete", "Required prop policy fields are known.");
    const dd = numberFact(context.account.current_drawdown_pct);
    const safeLimit = Math.max(0, policy.prop_policy.maximum_drawdown_limit_pct - policy.prop_policy.safety_buffer_pct);
    if (dd !== null && dd >= safeLimit) reject("loss.prop_safety_buffer", "LOSS", dd, safeLimit, "percent", "prop_drawdown_safety_buffer_breached", "Prop drawdown safety buffer is breached."); else if (dd !== null && dd >= safeLimit * policy.reduction.starts_at_consumption_ratio) reduce("loss.prop_safety_buffer", "LOSS", authorizedPct * Math.max(0, (safeLimit - dd) / Math.max(safeLimit * (1 - policy.reduction.starts_at_consumption_ratio), 0.0001)), "percent", "prop_safety_buffer_reduction", "Risk reduced as prop safety buffer approaches."); else pass("loss.prop_safety_buffer", "LOSS", dd, safeLimit, "percent", "prop_safety_buffer_available", "Prop safety buffer remains available.");
  }

  // 5. Existing portfolio risk
  const openRisk = numberFact(context.account.aggregate_open_risk_pct);
  if (openRisk === null) reject("portfolio.aggregate_open_risk", "PORTFOLIO", context.account.aggregate_open_risk_pct.state, policy.limits.maximum_open_risk_pct, "percent", "aggregate_open_risk_unknown", "Aggregate open risk is required."); else if (openRisk >= policy.limits.maximum_open_risk_pct) reject("portfolio.aggregate_open_risk", "PORTFOLIO", openRisk, policy.limits.maximum_open_risk_pct, "percent", "aggregate_open_risk_breach", "No aggregate open-risk capacity remains."); else reduce("portfolio.aggregate_open_risk", "PORTFOLIO", policy.limits.maximum_open_risk_pct - openRisk, "percent", "aggregate_open_risk_capacity", "Authorized risk cannot exceed remaining aggregate open-risk capacity.");
  const pendingRisk = numberFact(context.account.pending_risk_pct);
  if (pendingRisk === null) reject("portfolio.pending_risk", "PORTFOLIO", context.account.pending_risk_pct.state, policy.limits.maximum_open_risk_pct, "percent", "pending_risk_unknown", "Pending-order risk is required.");
  else if (openRisk !== null && openRisk + pendingRisk >= policy.limits.maximum_open_risk_pct) reject("portfolio.pending_risk", "PORTFOLIO", openRisk + pendingRisk, policy.limits.maximum_open_risk_pct, "percent", "aggregate_pending_risk_breach", "Open plus pending risk leaves no capacity.");
  else if (openRisk !== null) reduce("portfolio.pending_risk", "PORTFOLIO", policy.limits.maximum_open_risk_pct - openRisk - pendingRisk, "percent", "aggregate_pending_risk_capacity", "Authorized risk cannot exceed remaining open-plus-pending capacity.");
  const positions = context.account.open_positions.state === "KNOWN" ? context.account.open_positions.value : null;
  if (!positions) reject("portfolio.concurrent_positions", "PORTFOLIO", context.account.open_positions.state, policy.limits.maximum_concurrent_positions, "count", "open_positions_unknown", "Open-position truth is required."); else if (positions.length >= policy.limits.maximum_concurrent_positions) reject("portfolio.concurrent_positions", "PORTFOLIO", positions.length, policy.limits.maximum_concurrent_positions, "count", "concurrent_position_breach", "Concurrent-position limit reached."); else pass("portfolio.concurrent_positions", "PORTFOLIO", positions.length, policy.limits.maximum_concurrent_positions, "count", "concurrent_positions_available", "Concurrent-position capacity remains.");
  const pending = numberFact(context.account.pending_orders);
  if (pending !== null && pending >= policy.limits.maximum_pending_orders) reject("portfolio.pending_orders", "PORTFOLIO", pending, policy.limits.maximum_pending_orders, "count", "pending_order_breach", "Pending-order limit reached."); else pass("portfolio.pending_orders", "PORTFOLIO", pending, policy.limits.maximum_pending_orders, "count", "pending_orders_available", "Pending-order capacity remains.");

  // 6. Concentration and correlation, including cross-provider economic exposure
  const symbol = normalizeSymbol(plan?.market_context.symbol ?? "");
  const assetClass = plan?.identity.asset_class ?? "CRYPTO";
  const quote = assetClass === "CRYPTO" ? ["USDT", "USDC", "BUSD", "USD"].find((suffix) => symbol.endsWith(suffix)) ?? "UNKNOWN" : symbol.length >= 6 ? symbol.slice(3, 6) : "UNKNOWN";
  const baseAsset = assetClass === "CRYPTO" ? (quote === "UNKNOWN" ? symbol : symbol.slice(0, -quote.length)) : symbol.length >= 3 ? symbol.slice(0, 3) : "UNKNOWN";
  if (positions && policy.requirements.one_active_position_per_symbol && positions.some((position) => normalizeSymbol(position.symbol) === symbol)) reject("concentration.duplicate_symbol", "CONCENTRATION", symbol, "no active duplicate", "symbol", "duplicate_symbol_exposure", "An active position already carries the same economic symbol, regardless of provider."); else pass("concentration.duplicate_symbol", "CONCENTRATION", symbol, "no active duplicate", "symbol", "no_duplicate_symbol", "No duplicate symbol position was found.");
  const concentrationChecks: [string, RiskFact<Readonly<Record<string, number>>>, string, number, string][] = [
    ["concentration.symbol", context.portfolio.exposure_by_symbol_pct, symbol, policy.limits.symbol_concentration_pct, "symbol_concentration"],
    ["concentration.provider", context.portfolio.exposure_by_provider_pct as RiskFact<Readonly<Record<string, number>>>, context.lineage.provider, policy.limits.provider_exposure_pct, "provider_exposure"],
    ["concentration.asset_class", context.portfolio.exposure_by_asset_class_pct, plan?.identity.asset_class ?? "", policy.limits.asset_class_exposure_pct, "asset_class_exposure"],
    ["concentration.direction", context.portfolio.exposure_by_direction_pct, plan?.decision.action ?? "", policy.limits.directional_exposure_pct, "directional_exposure"],
    ["concentration.correlation", context.portfolio.correlated_symbol_exposure_pct, symbol, policy.limits.correlated_exposure_pct, "correlated_exposure"],
    ["concentration.base_asset", context.portfolio.exposure_by_base_asset_pct, baseAsset, policy.limits.base_asset_concentration_pct, "base_asset_concentration"],
    ["concentration.quote_currency", context.portfolio.exposure_by_quote_currency_pct, quote, policy.limits.quote_currency_concentration_pct, "quote_currency_concentration"],
  ];
  for (const [id, fact, key, limit, reason] of concentrationChecks) {
    const values = recordValue(fact), observed = values?.[key];
    if (observed === undefined) { missing.push(id); reject(id, "CONCENTRATION", fact.state, limit, "percent", `${reason}_unknown`, `${id} truth is required for economic exposure control.`); }
    else if (observed >= limit) reject(id, "CONCENTRATION", observed, limit, "percent", `${reason}_breach`, `${id} limit is already reached.`);
    else reduce(id, "CONCENTRATION", limit - observed, "percent", `${reason}_capacity`, `Risk is capped by remaining ${id} capacity.`);
  }
  if (assetClass === "FOREX" || assetClass === "GOLD") {
    for (const currency of [...new Set([baseAsset, quote])]) {
      const forex = recordValue(context.portfolio.forex_currency_exposure_pct), observed = forex?.[currency];
      if (observed === undefined) reject(`concentration.forex_currency.${currency}`, "CONCENTRATION", context.portfolio.forex_currency_exposure_pct.state, policy.limits.forex_currency_concentration_pct, "percent", "forex_currency_exposure_unknown", `Forex currency exposure for ${currency} is required.`);
      else if (observed >= policy.limits.forex_currency_concentration_pct) reject(`concentration.forex_currency.${currency}`, "CONCENTRATION", observed, policy.limits.forex_currency_concentration_pct, "percent", "forex_currency_concentration_breach", `${currency} concentration limit reached.`);
      else reduce(`concentration.forex_currency.${currency}`, "CONCENTRATION", policy.limits.forex_currency_concentration_pct - observed, "percent", "forex_currency_capacity", `Risk is capped by remaining ${currency} currency exposure.`);
    }
  }
  if (plan?.identity.asset_class === "GOLD") {
    const gold = numberFact(context.portfolio.gold_exposure_pct);
    if (gold === null) reject("concentration.gold", "CONCENTRATION", context.portfolio.gold_exposure_pct.state, policy.limits.gold_exposure_pct, "percent", "gold_exposure_unknown", "Gold exposure truth is required."); else if (gold >= policy.limits.gold_exposure_pct) reject("concentration.gold", "CONCENTRATION", gold, policy.limits.gold_exposure_pct, "percent", "gold_exposure_breach", "Gold concentration limit reached."); else reduce("concentration.gold", "CONCENTRATION", policy.limits.gold_exposure_pct - gold, "percent", "gold_exposure_capacity", "Risk is capped by remaining gold exposure.");
  } else gates.push(gate("concentration.gold", "CONCENTRATION", "NOT_APPLICABLE", plan?.identity.asset_class, "GOLD", "asset class", "gold_not_applicable", "Gold concentration is not applicable.", policy, "INFORMATIONAL"));

  // 7. Market-operational restrictions
  const operational = <T>(id: string, fact: RiskFact<T>, handling: UnknownHandling, forbidden: (value: T) => boolean, forbiddenReason: string) => {
    if (fact.state !== "KNOWN" || fact.value === null) {
      missing.push(id);
      if (handling === "REJECT") reject(id, "MARKET", fact.state, "KNOWN", "state", `${id}_required_unknown`, `${id} is required by policy.`);
      else if (handling === "REDUCE") { const original = authorizedPct; authorizedPct *= policy.reduction.stale_context_factor; gates.push(gate(id, "MARKET", "REDUCE", fact.state, policy.reduction.stale_context_factor, "factor", `${id}_unknown_reduction`, `${id} unknown; deterministic policy factor applied.`, policy, "REDUCING")); reductions.push({ rule_id: id, source: `${policy.policy_id}@${policy.version}`, original, reduced: authorizedPct, transformation: `${original} * ${policy.reduction.stale_context_factor}`, binding: true }); }
      else { warnings.push(`${id}_unknown`); gates.push(gate(id, "MARKET", "UNKNOWN", fact.state, "KNOWN", "state", `${id}_unknown_advisory`, `${id} unavailable and retained as advisory unknown.`, policy, "ADVISORY")); }
    } else if (forbidden(fact.value)) reject(id, "MARKET", fact.value, "eligible", "state", forbiddenReason, `${id} violates policy.`);
    else pass(id, "MARKET", fact.value, "eligible", "state", `${id}_eligible`, `${id} is eligible.`);
  };
  operational("market.session", context.market.session, policy.requirements.session, (value) => policy.requirements.allowed_sessions.length > 0 && !policy.requirements.allowed_sessions.includes(value), "session_forbidden");
  operational("market.spread", context.market.spread, policy.requirements.spread, (v) => v === "INELIGIBLE", "spread_ineligible");
  operational("market.liquidity", context.market.liquidity, policy.requirements.liquidity, (v) => v === "INELIGIBLE", "liquidity_ineligible");
  operational("market.news", context.market.news, policy.requirements.news, (v) => v === "RESTRICTED", "news_restricted");
  operational("market.weekend", context.market.weekend, policy.requirements.weekend, (v) => v === true && policy.prop_policy?.weekend_holding_rule === "FORBIDDEN", "prop_weekend_forbidden");
  operational("market.overnight", context.market.overnight, policy.requirements.overnight, (v) => v === true && policy.prop_policy?.overnight_holding_rule === "FORBIDDEN", "prop_overnight_forbidden");
  operational("market.provider_operational", context.market.provider_operational, "REJECT", (v) => v === false, "provider_unhealthy");
  operational("market.account_lock", context.market.account_lock, "REJECT", (v) => v === true, "account_locked");
  operational("market.customer_execution", context.market.customer_execution, "REJECT", (v) => v === false, "customer_execution_disabled");

  // 8-9. Requested risk and final decision
  if (!Number.isFinite(context.request.risk_percent) || context.request.risk_percent <= 0) reject("authorization.request", "AUTHORIZATION", context.request.risk_percent, "> 0", "percent", "invalid_requested_risk", "Requested risk must be finite and positive.");
  reduce("authorization.per_trade_cap", "AUTHORIZATION", policy.limits.max_risk_per_trade_pct, "percent", "per_trade_risk_cap", "Authorized risk cannot exceed the resolved per-trade cap.");
  const requestedLeverage = leverage; leverage = Math.min(leverage, policy.limits.leverage_cap);
  gates.push(gate("authorization.leverage", "AUTHORIZATION", leverage < requestedLeverage ? "REDUCE" : "PASS", requestedLeverage, leverage, "x", leverage < requestedLeverage ? "leverage_cap_reduction" : "leverage_within_cap", "Leverage ceiling is constrained by resolved policy.", policy, "REDUCING"));
  if (leverage < requestedLeverage) reductions.push({ rule_id: "authorization.leverage", source: `${policy.policy_id}@${policy.version}`, original: requestedLeverage, reduced: leverage, transformation: `min(${requestedLeverage}, ${policy.limits.leverage_cap})`, binding: true });
  if (authorizedPct < policy.limits.min_risk_per_trade_pct) { reject("authorization.minimum_viable_risk", "AUTHORIZATION", authorizedPct, policy.limits.min_risk_per_trade_pct, "percent", "no_safe_risk_remaining", "No policy-permitted viable risk remains."); authorizedPct = 0; }
  const decision: RiskDecisionAction = hardReason ? "REJECT" : authorizedPct < context.request.risk_percent || leverage < context.request.leverage_ceiling ? "REDUCE" : "ACCEPT";
  const validEquity = equity && equity > 0 ? equity : null;
  const requestedAmount = validEquity ? validEquity * context.request.risk_percent / 100 : 0;
  const authorizedAmount = decision === "REJECT" || !validEquity ? 0 : validEquity * authorizedPct / 100;
  const entry = plan?.entry_plan.zone ? (plan.entry_plan.zone.low + plan.entry_plan.zone.high) / 2 : null, stop = plan?.risk_proposal.initial_stop ?? null;
  const stopPct = entry && stop ? Math.abs(entry - stop) / entry * 100 : null;
  const riskNotional = authorizedAmount > 0 && stopPct && stopPct > 0 ? authorizedAmount / (stopPct / 100) : null;
  const leverageNotional = validEquity ? validEquity * leverage : null;
  const maximumNotional = riskNotional !== null && leverageNotional !== null ? Math.min(riskNotional, leverageNotional) : null;
  const near = gates.filter((item) => item.status === "REDUCE").map((item) => item.id);
  const unknown = gates.filter((item) => item.status === "UNKNOWN" || /unknown|unavailable/.test(item.reason_code)).map((item) => item.id);
  const result: RiskDecision = {
    schema_version: RISK_DECISION_SCHEMA_VERSION,
    decision_id: stableFingerprint({ correlation: context.lineage.correlation_id, account: context.lineage.account_id, provider: context.lineage.provider, policy: policy.fingerprint, evaluated_at: context.lineage.evaluated_at, request: context.request, gates: gates.map(({ id, status, reason_code }) => ({ id, status, reason_code })) }),
    correlation_id: context.lineage.correlation_id,
    evaluation_id: context.lineage.evaluation_id,
    evaluated_at: context.lineage.evaluated_at,
    approved_strategy_plan: approved,
    account: { id: context.lineage.account_id, customer_id: context.lineage.customer_id, provider: context.lineage.provider, environment: context.lineage.environment, mode: context.lineage.account_mode },
    decision,
    authorized_envelope: decision === "REJECT" ? null : { requested_risk_percent: context.request.risk_percent, authorized_risk_percent: authorizedPct, requested_risk_amount: requestedAmount, maximum_authorized_risk_amount: authorizedAmount, requested_leverage_ceiling: context.request.leverage_ceiling, leverage_ceiling: leverage, maximum_notional: maximumNotional, maximum_margin: maximumNotional !== null && leverage > 0 ? maximumNotional / leverage : null, maximum_quantity: null, permitted_provider: context.lineage.provider, permitted_account_id: context.lineage.account_id, policy_id: policy.policy_id, policy_version: policy.version },
    gate_ledger: gates,
    reductions,
    explanation: { summary: decision === "ACCEPT" ? "Accepted at the requested policy-permitted risk." : decision === "REDUCE" ? `Reduced from ${context.request.risk_percent}% to ${authorizedPct}% by the most restrictive risk rule.` : `Rejected by ${hardReason}.`, decisive_rule: hardReason || reductions.at(-1)?.rule_id || "authorization_full_accept", near_exhaustion: near, unknown_context: unknown, downstream_may_append: ["capital allocation", "provider routing confirmation", "venue execution instructions", "actual fills", "protection and reporting facts"], immutable_strategy_fields: ["identity", "version", "direction", "entry", "stop", "targets", "risk_reward", "confidence", "evidence", "invalidation_thesis"] },
    diagnostics: { evaluator_status: "COMPLETED", policy_resolution_source: policy.resolution_sources.map((item) => `${item.source}:${item.policy_id}@${item.version}`).join(" -> "), effective_policy_fingerprint: policy.fingerprint, missing_context: [...new Set(missing)], stale_context: [...new Set(stale)], warnings: [...new Set(warnings)], runtime: { canonical: false, duration_ms: null } },
  };
  return deepFreeze(result);
}
