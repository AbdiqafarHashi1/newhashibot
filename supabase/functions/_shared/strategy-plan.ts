import type {
  LegacyStrategyResult,
  StrategyDefinition,
  StrategyEvaluationContext,
  StrategyIndicatorSnapshot,
} from "./professional-strategies.ts";

export const STRATEGY_PLAN_SCHEMA_VERSION = "strategy-plan/v1" as const;
export const SIZED_EXECUTION_PLAN_SCHEMA_VERSION = "sized-execution-plan/v1-design" as const;
export const STRATEGY_CONFIG_SCHEMA_VERSION = "strategy-config/v1" as const;
export const INDICATOR_ENGINE_VERSION = "indicator.root-v1/ema-rsi-atr" as const;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type StrategyPlanDecision = "BUY" | "SELL" | "NO_TRADE";
export type KnowledgeStatus = "KNOWN" | "UNKNOWN";
export type QualificationStatus = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export interface QualificationGate {
  id: string;
  category: "DATA" | "ELIGIBILITY" | "TREND" | "MOMENTUM" | "VOLATILITY" | "STRUCTURE" | "LIQUIDITY" | "NEWS" | "RISK_REWARD" | "CONFIDENCE" | "EVALUATOR";
  status: QualificationStatus;
  reason: string;
  observed?: string | number | boolean | null;
  required?: string | number | boolean | null;
  source: "CONTEXT" | "CONFIG" | "EVALUATOR" | "UNAVAILABLE";
}

export interface StrategyPlan {
  schema_version: typeof STRATEGY_PLAN_SCHEMA_VERSION;
  identity: {
    strategy_id: string;
    strategy_name: string;
    strategy_version: string;
    asset_class: "CRYPTO" | "FOREX" | "GOLD";
    lifecycle: StrategyDefinition["lifecycle"];
    certification_status: "PRODUCTION" | "RESEARCH";
    publication_mode: "LIVE" | "SHADOW";
  };
  provenance: {
    evaluation_id: string;
    evaluated_at: string;
    config_version: typeof STRATEGY_CONFIG_SCHEMA_VERSION;
    config_hash: string;
    measured_release_id?: string | null;
    evaluated_parameters?:Readonly<Record<string,number>>;
    indicator_engine_version: typeof INDICATOR_ENGINE_VERSION;
    market_data_source: string;
    candle_boundary: { first_open_time: string | null; last_open_time: string | null; candle_count: number; closed_only: boolean };
  };
  market_context: {
    symbol: string;
    timeframe: string;
    market_regime: string;
    volatility_state: string;
    trend_state: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
    session: string;
    liquidity: { status: KnowledgeStatus; value: string | null };
    news: { status: KnowledgeStatus; value: string | null };
  };
  decision: {
    action: StrategyPlanDecision;
    qualified: boolean;
    reasons: readonly string[];
  };
  qualification_ledger: readonly QualificationGate[];
  entry_plan: {
    type: "ZONE" | "NONE";
    zone: { low: number; high: number } | null;
    expires_at: string | null;
    maximum_slippage: { status: KnowledgeStatus; value: number | null; unit: "PERCENT" };
    order_validity: "UNTIL_ENTRY_EXPIRY" | "NOT_APPLICABLE";
  };
  risk_proposal: {
    initial_stop: number | null;
    invalidation_thesis: string;
    tp1: number | null;
    tp2: number | null;
    additional_targets: readonly number[];
    proposed_risk_reward: number;
    maximum_holding: { bars: number; timeframe: string } | null;
  };
  management_intent: {
    break_even: string;
    trailing: string;
    partial_exits: readonly string[];
    cancel_conditions: readonly string[];
    time_exit: string;
  };
  evidence: {
    indicators: StrategyIndicatorSnapshot;
    strategy_specific: Record<string, unknown>;
    explanation: string;
  };
  diagnostics: {
    warnings: readonly string[];
    runtime_ms: number | null;
    confidence: number;
    grade: string;
    evaluator_status: "CANDIDATE" | "REJECTED" | "RUNTIME_ERROR";
    rejection_category: string | null;
  };
}

/** Downstream-only design seam. It appends account/execution facts while retaining
 * the exact immutable strategy plan; the active scanner does not construct this yet. */
export interface SizedExecutionPlan {
  schema_version: typeof SIZED_EXECUTION_PLAN_SCHEMA_VERSION;
  strategy_plan: DeepReadonly<StrategyPlan>;
  correlation_id: string;
  risk_engine: { version: string; decision: string };
  capital_allocation: { capital_basis: number; currency: string };
  portfolio_exposure: { before: number; after: number; unit: string };
  provider: { id: string; account_id: string; venue: string };
  sizing: { position_size: number; leverage: number; margin: number; unit: string };
  execution_instructions: Record<string, unknown>;
  protection_policy: { version: string; policy: Record<string, unknown> };
  reporting_metadata: Record<string, unknown>;
}

export interface ApprovedStrategyPlan {
  schema_version: "approved-strategy-plan/v1";
  strategy_plan: DeepReadonly<StrategyPlan>;
  approved_at: string;
  correlation_id: string;
  arbitration: {
    policy_version: string;
    winner_reason: string;
    competing_strategies: readonly { strategy_id: string; decision: "LOST" | "REJECTED"; reason: string }[];
  };
}

export type SizedExecutionAppendix = Omit<SizedExecutionPlan, "schema_version" | "strategy_plan">;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** Stable FNV-1a-64 fingerprint. This is a provenance fingerprint, not a security primitive. */
export function stableFingerprint(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function timeframeMilliseconds(timeframe: string): number | null {
  const match = /^(\d+)(m|h|d)$/.exec(timeframe);
  if (!match) return null;
  return Number(match[1]) * (match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000);
}

function isClosedBoundary(context: StrategyEvaluationContext): boolean {
  const last = context.candles[context.candles.length - 1], interval = timeframeMilliseconds(context.timeframe);
  return Boolean(last && interval && Date.parse(last.open_time) + interval <= Date.parse(context.evaluated_at));
}

function assetClass(definition: StrategyDefinition, legacy: LegacyStrategyResult): StrategyPlan["identity"]["asset_class"] {
  const explicit = String(legacy.score_breakdown.asset_class ?? "").toLowerCase();
  return definition.id.startsWith("gold.") || explicit === "gold" ? "GOLD" : definition.market === "forex" ? "FOREX" : "CRYPTO";
}

function trendState(indicators: StrategyIndicatorSnapshot): StrategyPlan["market_context"]["trend_state"] {
  return indicators.ema20 > indicators.ema50 ? "UP" : indicators.ema20 < indicators.ema50 ? "DOWN" : Number.isFinite(indicators.ema20) && Number.isFinite(indicators.ema50) ? "FLAT" : "UNKNOWN";
}

const CATEGORY_BY_REASON: Readonly<Record<string, QualificationGate["category"]>> = {
  unsupported_symbol: "ELIGIBILITY", unsupported_timeframe: "ELIGIBILITY", insufficient_candles: "DATA", invalid_candles: "DATA", malformed_candles: "DATA", stale_candles: "DATA",
  invalid_atr_or_price: "VOLATILITY", volatility_too_low: "VOLATILITY", volatility_too_high: "VOLATILITY", volatility_unstable: "VOLATILITY",
  trend_filter_failed: "TREND", trend_not_established: "TREND", no_directional_structure: "TREND", htf_trend_not_confirmed: "TREND",
  momentum_failed: "MOMENTUM", momentum_unconfirmed: "MOMENTUM", rsi_not_confirmed: "MOMENTUM", candle_body_too_small: "MOMENTUM",
  compression_not_ready: "STRUCTURE", breakout_not_confirmed: "STRUCTURE", breakout_unconfirmed: "STRUCTURE", pullback_not_ready: "STRUCTURE", pullback_invalid: "STRUCTURE", reclaim_not_confirmed: "STRUCTURE",
  spread_too_wide: "LIQUIDITY", provider_budget_exhausted: "DATA", rr_too_low: "RISK_REWARD", confidence_too_low: "CONFIDENCE", runtime_error: "EVALUATOR",
};

export function rejectionCategory(reason: string): string {
  return CATEGORY_BY_REASON[reason] ?? (reason ? "STRATEGY_SPECIFIC" : "NONE");
}

function qualificationLedger(definition: StrategyDefinition, context: StrategyEvaluationContext, legacy: LegacyStrategyResult): QualificationGate[] {
  const primary = String(legacy.score_breakdown.primary_failed_gate ?? legacy.rejection_reason ?? (legacy.status === "candidate" ? "passed" : "rejected"));
  const gates: QualificationGate[] = [
    { id: "closed_candle", category: "DATA", status: isClosedBoundary(context) ? "PASS" : "FAIL", reason: isClosedBoundary(context) ? "latest candle is closed at evaluation boundary" : "latest candle close is after evaluation boundary", source: "CONTEXT" },
    { id: "candle_integrity", category: "DATA", status: ["invalid_candles", "malformed_candles", "insufficient_candles", "stale_candles"].includes(primary) ? "FAIL" : "PASS", reason: ["invalid_candles", "malformed_candles", "insufficient_candles", "stale_candles"].includes(primary) ? primary : "evaluator accepted candle preflight", source: "EVALUATOR" },
    { id: "symbol_eligible", category: "ELIGIBILITY", status: primary === "unsupported_symbol" ? "FAIL" : "PASS", reason: primary === "unsupported_symbol" ? primary : "registry symbol eligibility passed", source: "CONFIG" },
    { id: "timeframe_eligible", category: "ELIGIBILITY", status: primary === "unsupported_timeframe" ? "FAIL" : "PASS", reason: primary === "unsupported_timeframe" ? primary : "registry timeframe eligibility passed", source: "CONFIG" },
    { id: "atr_valid", category: "VOLATILITY", status: Number.isFinite(context.indicators.atr14) && context.indicators.atr14 > 0 ? "PASS" : "FAIL", reason: Number.isFinite(context.indicators.atr14) && context.indicators.atr14 > 0 ? "ATR is finite and positive" : "ATR unavailable or invalid", observed: context.indicators.atr14, source: "CONTEXT" },
    { id: "liquidity_context", category: "LIQUIDITY", status: "UNKNOWN", reason: "authoritative liquidity context unavailable to strategy", source: "UNAVAILABLE" },
    { id: "news_context", category: "NEWS", status: "UNKNOWN", reason: "authoritative news context unavailable to strategy", source: "UNAVAILABLE" },
    { id: "risk_reward", category: "RISK_REWARD", status: legacy.status === "candidate" ? "PASS" : primary === "rr_too_low" ? "FAIL" : "NOT_APPLICABLE", reason: legacy.status === "candidate" ? "risk/reward gate passed" : primary === "rr_too_low" ? primary : "evaluation rejected before risk/reward became the deciding gate", observed: legacy.risk_reward, required: definition.config.min_rr, source: "EVALUATOR" },
    { id: "confidence", category: "CONFIDENCE", status: legacy.status === "candidate" ? "PASS" : ["confidence_too_low", "score_below_min"].includes(primary) ? "FAIL" : "NOT_APPLICABLE", reason: legacy.status === "candidate" ? "confidence gate passed" : ["confidence_too_low", "score_below_min"].includes(primary) ? primary : "evaluation rejected before confidence became the deciding gate", observed: legacy.confidence_score, required: definition.config.min_score, source: "EVALUATOR" },
    { id: "evaluator_decision", category: CATEGORY_BY_REASON[primary] ?? "EVALUATOR", status: legacy.status === "candidate" ? "PASS" : "FAIL", reason: legacy.status === "candidate" ? "all evaluator gates passed" : primary, source: "EVALUATOR" },
  ];
  const already = new Set(gates.map((gate) => gate.id));
  for (const [key, value] of Object.entries(legacy.score_breakdown)) {
    if (already.has(key) || key === "primary_failed_gate" || !(/_confirmed$|_ready$|_pass$|_gate$/.test(key)) || typeof value !== "boolean") continue;
    gates.push({ id: key, category: /trend|ema|reclaim/.test(key) ? "TREND" : /momentum|rsi|body/.test(key) ? "MOMENTUM" : /atr|volatility/.test(key) ? "VOLATILITY" : "STRUCTURE", status: value ? "PASS" : legacy.status === "candidate" ? "NOT_APPLICABLE" : "FAIL", reason: value ? `${key} confirmed` : legacy.status === "candidate" ? `${key} was not required by the accepted evaluator path` : `${key} not confirmed`, observed: value, source: "EVALUATOR" });
  }
  return gates;
}

function managementIntent(definition: StrategyDefinition, maxBars: number): StrategyPlan["management_intent"] {
  const scalp = definition.id.includes("scalp");
  return {
    break_even: "Use the currently certified downstream protection policy; strategy does not authorize an independent level mutation.",
    trailing: "No strategy-specific trailing rule is encoded; downstream must record the applied protection policy.",
    partial_exits: ["TP1 and TP2 are the strategy-owned target levels; quantities remain downstream-owned."],
    cancel_conditions: ["Cancel if the entry plan expires before fill.", "Cancel if downstream qualification or risk authorization refuses the plan."],
    time_exit: `Exit or escalate under the existing downstream time-stop policy after ${maxBars} ${definition.config.allowed_timeframes.join("/") || "eligible-timeframe"} bars; do not extend ${scalp ? "a scalp" : "the trade"} silently.`,
  };
}

export function createStrategyPlan(definition: StrategyDefinition, context: StrategyEvaluationContext, legacy: LegacyStrategyResult, runtimeMs: number | null = null): DeepReadonly<StrategyPlan> {
  const direction = legacy.direction.toLowerCase();
  const action: StrategyPlanDecision = legacy.status === "candidate" && direction === "buy" ? "BUY" : legacy.status === "candidate" && direction === "sell" ? "SELL" : "NO_TRADE";
  const rejection = legacy.rejection_reason || (legacy.status === "rejected" ? legacy.reason : "");
  const sources = [...new Set(context.candles.map((row) => row.source).filter(Boolean))];
  const last = context.candles[context.candles.length - 1] ?? null, first = context.candles[0] ?? null;
  const configHash = stableFingerprint(definition.config);
  const expiresAt = action === "NO_TRADE" ? null : expiryFromBars(context.evaluated_at, context.timeframe, definition.config.max_bars_in_trade);
  const evidence = clone(legacy.score_breakdown);
  const sessionEvidence = evidence.session ?? evidence.session_context;
  const session = typeof sessionEvidence === "string" || typeof sessionEvidence === "number" ? String(sessionEvidence) : "UNKNOWN";
  const warnings = ["liquidity_context_unknown", "news_context_unknown"];
  if (definition.lifecycle !== "ENABLED") warnings.push("research_shadow_non_publishable");
  if (runtimeMs === null) warnings.push("runtime_duration_unavailable");
  const plan: StrategyPlan = {
    schema_version: STRATEGY_PLAN_SCHEMA_VERSION,
    identity: { strategy_id: definition.id, strategy_name: definition.legacyName, strategy_version: definition.version, asset_class: assetClass(definition, legacy), lifecycle: definition.lifecycle, certification_status: definition.certification ?? (definition.lifecycle === "RESEARCH" ? "RESEARCH" : "PRODUCTION"), publication_mode: definition.publicationMode ?? "LIVE" },
    provenance: { evaluation_id: stableFingerprint({ strategy: definition.id, version: definition.version, evaluated_at: context.evaluated_at, symbol: context.symbol, timeframe: context.timeframe, candle: last?.open_time ?? null, config: configHash }), evaluated_at: context.evaluated_at, config_version: STRATEGY_CONFIG_SCHEMA_VERSION, config_hash: configHash, measured_release_id:definition.config.config_source?.startsWith("measured_release:")?definition.config.config_source.slice("measured_release:".length):null,evaluated_parameters:clone(definition.config.params), indicator_engine_version: INDICATOR_ENGINE_VERSION, market_data_source: sources.length === 1 ? sources[0] : sources.length ? `mixed:${sources.sort().join(",")}` : "unknown", candle_boundary: { first_open_time: first?.open_time ?? null, last_open_time: last?.open_time ?? null, candle_count: context.candles.length, closed_only: isClosedBoundary(context) } },
    market_context: { symbol: context.symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase(), timeframe: context.timeframe, market_regime: context.indicators.regime || "UNKNOWN", volatility_state: context.indicators.volatility_state || "UNKNOWN", trend_state: trendState(context.indicators), session, liquidity: { status: "UNKNOWN", value: null }, news: { status: "UNKNOWN", value: null } },
    decision: { action, qualified: action !== "NO_TRADE", reasons: rejection ? [rejection] : [legacy.reason] },
    qualification_ledger: qualificationLedger(definition, context, legacy),
    entry_plan: { type: action === "NO_TRADE" ? "NONE" : "ZONE", zone: action === "NO_TRADE" ? null : { low: legacy.entry_low, high: legacy.entry_high }, expires_at: expiresAt, maximum_slippage: { status: "UNKNOWN", value: null, unit: "PERCENT" }, order_validity: action === "NO_TRADE" ? "NOT_APPLICABLE" : "UNTIL_ENTRY_EXPIRY" },
    risk_proposal: { initial_stop: action === "NO_TRADE" ? null : legacy.stop_loss, invalidation_thesis: action === "NO_TRADE" ? `No risk proposal: ${rejection || "strategy rejected"}` : `The strategy thesis is invalidated at the certified initial stop (${legacy.stop_loss}); basis: ${legacy.reason}.`, tp1: action === "NO_TRADE" ? null : legacy.tp1, tp2: action === "NO_TRADE" ? null : legacy.tp2, additional_targets: [], proposed_risk_reward: legacy.risk_reward, maximum_holding: action === "NO_TRADE" ? null : { bars: definition.config.max_bars_in_trade, timeframe: context.timeframe } },
    management_intent: managementIntent(definition, definition.config.max_bars_in_trade),
    evidence: { indicators: clone(context.indicators), strategy_specific: evidence, explanation: legacy.reason },
    diagnostics: { warnings, runtime_ms: runtimeMs, confidence: legacy.confidence_score, grade: legacy.grade, evaluator_status: legacy.status === "candidate" ? "CANDIDATE" : rejection === "runtime_error" || legacy.score_breakdown.runtime_error === true ? "RUNTIME_ERROR" : "REJECTED", rejection_category: action === "NO_TRADE" ? rejectionCategory(legacy.rejection_reason || String(legacy.score_breakdown.primary_failed_gate ?? "")) : null },
  };
  return deepFreeze(plan);
}

function expiryFromBars(evaluatedAt: string, timeframe: string, bars: number): string | null {
  const interval = timeframeMilliseconds(timeframe), value = Date.parse(evaluatedAt);
  return interval && bars > 0 && Number.isFinite(value) ? new Date(value + interval * bars).toISOString() : null;
}

export function appendSizedExecutionPlan(strategyPlan: DeepReadonly<StrategyPlan>, appendix: SizedExecutionAppendix): DeepReadonly<SizedExecutionPlan> {
  if (!Object.isFrozen(strategyPlan)) throw new Error("strategy_plan_must_be_immutable");
  if (appendix.correlation_id !== strategyPlan.provenance.evaluation_id) throw new Error("strategy_plan_correlation_mismatch");
  return deepFreeze({ schema_version: SIZED_EXECUTION_PLAN_SCHEMA_VERSION, strategy_plan: strategyPlan, ...clone(appendix) });
}

/** Arbitration appends its decision without receiving a mutable strategy object. */
export function approveStrategyPlan(strategyPlan: DeepReadonly<StrategyPlan>, approval: Omit<ApprovedStrategyPlan, "schema_version" | "strategy_plan" | "correlation_id">): DeepReadonly<ApprovedStrategyPlan> {
  if (!Object.isFrozen(strategyPlan)) throw new Error("strategy_plan_must_be_immutable");
  if (!strategyPlan.decision.qualified || strategyPlan.decision.action === "NO_TRADE") throw new Error("strategy_plan_not_qualifiable");
  return deepFreeze({ schema_version: "approved-strategy-plan/v1", strategy_plan: strategyPlan, correlation_id: strategyPlan.provenance.evaluation_id, ...clone(approval) });
}
