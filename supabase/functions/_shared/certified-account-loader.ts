import { deepFreeze, stableFingerprint, type DeepReadonly, type StrategyPlan } from "./strategy-plan.ts";
import { RISK_CONTEXT_SCHEMA_VERSION, type ResolvedRiskPolicy, type RiskEvaluationContext, type RiskFact, type RiskDomain } from "./professional-risk-engine.ts";
import { CAPITAL_ALLOCATION_CONTEXT_VERSION, type AllocationAccountCandidate, type CapitalAllocationContext, type ProviderContractSpecification } from "./professional-capital-allocation.ts";
import { EXECUTION_PLANNING_CONTEXT_VERSION, type ExecutionPlanningContext, type ExecutionRoutingPolicy, type ProviderRoutingCapabilities } from "./professional-execution-planning.ts";
import type { ExecutionAccountInput } from "./certified-runtime.ts";

export const CERTIFIED_ACCOUNT_TRUTH_VERSION = "certified-account-truth/v1" as const;

export interface CertifiedAccountTruthRow {
  schema_version: typeof CERTIFIED_ACCOUNT_TRUTH_VERSION;
  customer_id: string;
  execution_profile_id: string;
  account_id: string;
  provider: RiskDomain;
  environment: "TESTNET" | "DEMO" | "LIVE";
  account_mode: RiskDomain;
  enabled: boolean;
  adoption_enabled: boolean;
  customer_authorized: boolean;
  manually_locked: boolean;
  provider_operational: boolean;
  policy_version: string;
  adoption_policy_version: string;
  observed_at: string;
  maximum_truth_age_ms: number;
  balance: number;
  equity: number;
  available_margin: number;
  used_margin: number;
  realized_daily_pnl: number;
  realized_weekly_pnl: number;
  unrealized_pnl: number;
  peak_equity: number;
  pending_orders: number;
  pending_risk_pct: number;
  aggregate_open_risk_pct: number;
  open_positions: RiskEvaluationContext["account"]["open_positions"] extends RiskFact<infer T> ? T : never;
  portfolio: { exposure_by_provider_pct: Record<RiskDomain, number>; exposure_by_symbol_pct: Record<string, number>; exposure_by_asset_class_pct: Record<string, number>; exposure_by_direction_pct: Record<string, number>; exposure_by_base_asset_pct: Record<string, number>; exposure_by_quote_currency_pct: Record<string, number>; forex_currency_exposure_pct: Record<string, number>; correlated_symbol_exposure_pct: Record<string, number>; gold_exposure_pct: number; open_risk_concentration_pct: number };
  market: { session: string; spread: "ELIGIBLE"|"INELIGIBLE"; liquidity: "ELIGIBLE"|"INELIGIBLE"; news: "CLEAR"|"RESTRICTED"; weekend: boolean; overnight: boolean; };
  provider_health: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  risk_percent: number;
  leverage_ceiling: number;
  risk_policy: DeepReadonly<ResolvedRiskPolicy>;
  contract_specification: ProviderContractSpecification;
  routing_policy: ExecutionRoutingPolicy;
  capabilities: ProviderRoutingCapabilities;
  allowed_strategy_ids: readonly string[];
  allowed_symbols: readonly string[];
  minimum_signal_grade: string;
}

export interface CertifiedAccountTruthRepository {
  list(strategyPlan: DeepReadonly<StrategyPlan>): Promise<readonly CertifiedAccountTruthRow[]>;
}

export interface AccountTruthRejection { account_id: string | null; execution_profile_id: string | null; reason: string; }
export interface CertifiedAccountLoadResult { accounts: readonly ExecutionAccountInput[]; rejected: readonly AccountTruthRejection[]; }

const known = <T>(value: T, at: string): RiskFact<T> => ({ state: "KNOWN", value, observed_at: at });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const normalized = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** One root loader. Repository implementations must return observed backend
 * facts; this function has deliberately no fallback/default policy. */
export async function loadCertifiedExecutionAccounts(input: { strategy_plan: DeepReadonly<StrategyPlan>; repository: CertifiedAccountTruthRepository; now: string }): Promise<CertifiedAccountLoadResult> {
  const rows = await input.repository.list(input.strategy_plan);
  const accounts: ExecutionAccountInput[] = [], rejected: AccountTruthRejection[] = [], seen = new Set<string>();
  for (const row of rows) {
    const reject = (reason: string) => rejected.push({ account_id: row?.account_id ?? null, execution_profile_id: row?.execution_profile_id ?? null, reason });
    if (!row || row.schema_version !== CERTIFIED_ACCOUNT_TRUTH_VERSION) { reject("account_truth_schema_invalid"); continue; }
    if (!row.account_id || !row.customer_id || !row.execution_profile_id || !row.policy_version || !row.adoption_policy_version) { reject("account_identity_missing"); continue; }
    if (seen.has(row.account_id)) { reject("duplicate_account"); continue; } seen.add(row.account_id);
    if (!row.enabled || !row.adoption_enabled || !row.customer_authorized || row.manually_locked || !row.provider_operational) { reject("account_or_adoption_disabled"); continue; }
    if (row.environment === "LIVE") { reject("production_environment_forbidden"); continue; }
    const age = Date.parse(input.now) - Date.parse(row.observed_at);
    if (!Number.isFinite(age) || age < 0 || age > row.maximum_truth_age_ms) { reject("account_truth_stale"); continue; }
    if (![row.balance,row.equity,row.available_margin,row.used_margin,row.realized_daily_pnl,row.realized_weekly_pnl,row.unrealized_pnl,row.peak_equity,row.pending_orders,row.pending_risk_pct,row.aggregate_open_risk_pct,row.risk_percent,row.leverage_ceiling].every(finite)) { reject("account_truth_missing_or_malformed"); continue; }
    if (row.balance <= 0 || row.equity <= 0 || row.available_margin <= 0 || row.peak_equity <= 0) { reject("account_capital_unavailable"); continue; }
    if (row.provider !== row.account_mode || row.capabilities.provider !== row.provider || row.contract_specification.provider !== row.provider || row.routing_policy.provider !== row.provider || row.risk_policy.domain !== row.provider) { reject("provider_lineage_mismatch"); continue; }
    if (!row.allowed_strategy_ids.includes(input.strategy_plan.identity.strategy_id)) { reject("strategy_not_allowed"); continue; }
    const gradeRank = (grade:string) => ["REJECT","C","B","A","A+"].indexOf(grade.toUpperCase());
    if (gradeRank(input.strategy_plan.diagnostics.grade) < gradeRank(row.minimum_signal_grade)) { reject("minimum_signal_grade_not_met"); continue; }
    if (row.allowed_symbols.length && !row.allowed_symbols.map(normalized).includes(normalized(input.strategy_plan.market_context.symbol))) { reject("symbol_not_allowed"); continue; }
    if (normalized(row.contract_specification.symbol) !== normalized(input.strategy_plan.market_context.symbol)) { reject("contract_symbol_mismatch"); continue; }
    if (row.provider_health !== "HEALTHY") { reject("provider_unhealthy"); continue; }
    if (!row.portfolio || !row.market || Object.values(row.portfolio).some((value) => typeof value === "number" ? !finite(value) : !value || typeof value !== "object")) { reject("portfolio_or_market_truth_missing"); continue; }
    const riskContext: RiskEvaluationContext = {
      schema_version: RISK_CONTEXT_SCHEMA_VERSION,
      lineage: { evaluation_id: input.strategy_plan.provenance.evaluation_id, correlation_id: input.strategy_plan.provenance.evaluation_id, risk_policy_id: row.risk_policy.policy_id, risk_policy_version: row.policy_version, evaluated_at: input.now, account_id: row.account_id, customer_id: row.customer_id, provider: row.provider, environment: row.environment, account_mode: row.account_mode },
      request: { risk_percent: row.risk_percent, leverage_ceiling: row.leverage_ceiling },
      account: { exists:true, enabled:true, customer_authorized:row.customer_authorized, execution_enabled:true, manually_locked:row.manually_locked, balance:known(row.balance,row.observed_at), equity:known(row.equity,row.observed_at), available_margin:known(row.available_margin,row.observed_at), used_margin:known(row.used_margin,row.observed_at), margin_utilization_pct:known(row.used_margin / row.equity * 100,row.observed_at), realized_daily_pnl:known(row.realized_daily_pnl,row.observed_at), unrealized_pnl:known(row.unrealized_pnl,row.observed_at), daily_loss_used_pct:known(Math.max(0,-row.realized_daily_pnl/row.equity*100),row.observed_at), weekly_loss_used_pct:known(Math.max(0,-row.realized_weekly_pnl/row.equity*100),row.observed_at), current_drawdown_pct:known(Math.max(0,(row.peak_equity-row.equity)/row.peak_equity*100),row.observed_at), peak_equity:known(row.peak_equity,row.observed_at), open_positions:known(row.open_positions,row.observed_at), pending_orders:known(row.pending_orders,row.observed_at), pending_risk_pct:known(row.pending_risk_pct,row.observed_at), aggregate_open_risk_pct:known(row.aggregate_open_risk_pct,row.observed_at), provider_health:known(row.provider_health,row.observed_at), truth_timestamp:row.observed_at, freshness:"KNOWN" },
      portfolio: { exposure_by_provider_pct:known(row.portfolio.exposure_by_provider_pct,row.observed_at), exposure_by_symbol_pct:known(row.portfolio.exposure_by_symbol_pct,row.observed_at), exposure_by_asset_class_pct:known(row.portfolio.exposure_by_asset_class_pct,row.observed_at), exposure_by_direction_pct:known(row.portfolio.exposure_by_direction_pct,row.observed_at), exposure_by_base_asset_pct:known(row.portfolio.exposure_by_base_asset_pct,row.observed_at), exposure_by_quote_currency_pct:known(row.portfolio.exposure_by_quote_currency_pct,row.observed_at), forex_currency_exposure_pct:known(row.portfolio.forex_currency_exposure_pct,row.observed_at), correlated_symbol_exposure_pct:known(row.portfolio.correlated_symbol_exposure_pct,row.observed_at), gold_exposure_pct:known(row.portfolio.gold_exposure_pct,row.observed_at), open_risk_concentration_pct:known(row.portfolio.open_risk_concentration_pct,row.observed_at) },
      market: { session:known(row.market.session,row.observed_at), spread:known(row.market.spread,row.observed_at), liquidity:known(row.market.liquidity,row.observed_at), news:known(row.market.news,row.observed_at), weekend:known(row.market.weekend,row.observed_at), overnight:known(row.market.overnight,row.observed_at), provider_operational:known(row.provider_operational,row.observed_at), account_lock:known(row.manually_locked,row.observed_at), customer_execution:known(row.customer_authorized,row.observed_at) },
    };
    const allocationAccount: AllocationAccountCandidate = { account_id:row.account_id, customer_id:row.customer_id, provider:row.provider, environment:row.environment, enabled:true, execution_enabled:true, provider_health:row.provider_health, policy_priority:0, balance:row.balance, equity:row.equity, available_capital:Math.min(row.balance,row.equity), available_margin:row.available_margin, used_margin:row.used_margin, utilization_pct:row.used_margin/row.equity*100, account_currency:row.contract_specification.kind === "MT5" ? row.contract_specification.account_currency : row.contract_specification.quote_currency, provider_timestamp:row.observed_at, freshness:"KNOWN" };
    accounts.push({ account_id:row.account_id, adoption_policy_version:row.adoption_policy_version, risk_context:riskContext, risk_policy:row.risk_policy,
      capital_context(decision) { return { schema_version:CAPITAL_ALLOCATION_CONTEXT_VERSION, risk_decision:decision, evaluation_id:decision.evaluation_id, correlation_id:decision.correlation_id, evaluated_at:input.now, provider:row.provider, permitted_account_ids:[row.account_id], accounts:[allocationAccount], contract_specification:row.contract_specification, provider_timestamp:row.observed_at, freshness:"KNOWN", maximum_truth_age_ms:row.maximum_truth_age_ms }; },
      execution_context(allocation) { return { schema_version:EXECUTION_PLANNING_CONTEXT_VERSION, capital_allocation_plan:allocation, evaluation_id:allocation.evaluation_id, correlation_id:allocation.correlation_id, provider:row.provider, environment:row.environment, account_id:row.account_id, contract_specification:row.contract_specification, contract_specification_fingerprint:stableFingerprint(row.contract_specification), provider_truth_timestamp:row.observed_at, routing_timestamp:input.now, freshness:"KNOWN", routing_policy:row.routing_policy, capabilities:row.capabilities }; } });
  }
  return deepFreeze({ accounts, rejected });
}
