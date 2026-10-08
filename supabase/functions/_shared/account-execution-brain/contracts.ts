/**
 * HashiBot Account Execution Brain — Contract Helpers & Factories
 * Phase 1A Architectural Contract Layer
 */

import {
  AccountExecutionContext,
  AccountLock,
  AccountLockReason,
  AccountPolicy,
  ExecutionDecision,
  ExecutionDecisionCode,
  ExecutionDecisionKind,
  RuleViolation,
  RuleViolationCategory,
  RuleViolationSeverity,
  RuleRecommendedAction,
  BrainProvider,
  BrainAccountType,
  PositionPlan,
  SignalContract,
} from "./types.ts";
import { calculateCapitalManagerPositionPlan } from "../professional-capital-allocation.ts";

/**
 * Validates an AccountExecutionContext against required fields and finite numeric bounds.
 */
export function validateAccountExecutionContext(context: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!context || typeof context !== "object") {
    return { valid: false, errors: ["Context must be a non-null object"] };
  }

  const ctx = context as Partial<AccountExecutionContext>;

  if (!ctx.account_id || typeof ctx.account_id !== "string") {
    errors.push("account_id must be a non-empty string");
  }

  const validProviders: BrainProvider[] = ["BINANCE", "BYBIT", "MT5_PERSONAL", "MT5_PROP"];
  if (!ctx.provider || !validProviders.includes(ctx.provider)) {
    errors.push(`provider must be one of: ${validProviders.join(", ")}`);
  }

  const validTypes: BrainAccountType[] = ["PERSONAL", "PROP_EVALUATION", "PROP_FUNDED"];
  if (!ctx.account_type || !validTypes.includes(ctx.account_type)) {
    errors.push(`account_type must be one of: ${validTypes.join(", ")}`);
  }

  if (typeof ctx.balance !== "number" || !Number.isFinite(ctx.balance) || ctx.balance < 0) {
    errors.push("balance must be a non-negative finite number");
  }

  if (typeof ctx.equity !== "number" || !Number.isFinite(ctx.equity) || ctx.equity < 0) {
    errors.push("equity must be a non-negative finite number");
  }

  if (!ctx.daily_drawdown || typeof ctx.daily_drawdown !== "object") {
    errors.push("daily_drawdown state must be provided");
  } else {
    if (typeof ctx.daily_drawdown.current_drawdown_pct !== "number" || !Number.isFinite(ctx.daily_drawdown.current_drawdown_pct)) {
      errors.push("daily_drawdown.current_drawdown_pct must be a finite number");
    }
  }

  if (!ctx.total_drawdown || typeof ctx.total_drawdown !== "object") {
    errors.push("total_drawdown state must be provided");
  } else {
    if (typeof ctx.total_drawdown.current_drawdown_pct !== "number" || !Number.isFinite(ctx.total_drawdown.current_drawdown_pct)) {
      errors.push("total_drawdown.current_drawdown_pct must be a finite number");
    }
  }

  if (!ctx.runtime_health || typeof ctx.runtime_health !== "object") {
    errors.push("runtime_health state must be provided");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an AccountPolicy against policy rules and bounds.
 */
export function validateAccountPolicy(policy: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!policy || typeof policy !== "object") {
    return { valid: false, errors: ["Policy must be a non-null object"] };
  }

  const pol = policy as Partial<AccountPolicy>;

  if (!pol.policy_id || typeof pol.policy_id !== "string") {
    errors.push("policy_id must be a non-empty string");
  }

  if (typeof pol.max_risk_per_trade_pct !== "number" || pol.max_risk_per_trade_pct <= 0 || pol.max_risk_per_trade_pct > 100) {
    errors.push("max_risk_per_trade_pct must be between 0 (exclusive) and 100");
  }

  if (typeof pol.max_daily_drawdown_pct !== "number" || pol.max_daily_drawdown_pct <= 0 || pol.max_daily_drawdown_pct > 100) {
    errors.push("max_daily_drawdown_pct must be between 0 (exclusive) and 100");
  }

  if (typeof pol.max_total_drawdown_pct !== "number" || pol.max_total_drawdown_pct <= 0 || pol.max_total_drawdown_pct > 100) {
    errors.push("max_total_drawdown_pct must be between 0 (exclusive) and 100");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Factory for creating immutable RuleViolation objects.
 */
export function createRuleViolation(params: {
  rule_id: string;
  rule_category: RuleViolationCategory;
  severity: RuleViolationSeverity;
  message: string;
  evidence?: Record<string, unknown>;
  recommended_action: RuleRecommendedAction;
}): RuleViolation {
  return Object.freeze({
    rule_id: params.rule_id,
    rule_category: params.rule_category,
    severity: params.severity,
    message: params.message,
    evidence: Object.freeze({ ...(params.evidence ?? {}) }),
    recommended_action: params.recommended_action,
  });
}

/**
 * Factory for creating deterministic ExecutionDecision objects.
 */
export function createExecutionDecision(params: {
  decision: ExecutionDecisionKind;
  decision_code: ExecutionDecisionCode;
  reason: string;
  account_id: string;
  signal_id: string;
  authorized_risk_pct: number;
  rule_violations?: readonly RuleViolation[];
  lock_details?: AccountLock | null;
  timestamp?: string;
}): ExecutionDecision {
  return Object.freeze({
    decision: params.decision,
    decision_code: params.decision_code,
    reason: params.reason,
    account_id: params.account_id,
    signal_id: params.signal_id,
    authorized_risk_pct: params.authorized_risk_pct,
    rule_violations: Object.freeze([...(params.rule_violations ?? [])]),
    lock_details: params.lock_details ? Object.freeze({ ...params.lock_details }) : null,
    timestamp: params.timestamp ?? new Date().toISOString(),
  });
}

/**
 * Factory for creating standard AccountLock objects.
 */
export function createAccountLock(params: {
  lock_id: string;
  account_id: string;
  reason: AccountLockReason;
  locked_by?: string;
  release_conditions: string;
  violations?: readonly RuleViolation[];
}): AccountLock {
  return Object.freeze({
    lock_id: params.lock_id,
    account_id: params.account_id,
    reason: params.reason,
    is_locked: true,
    locked_at: new Date().toISOString(),
    locked_by: params.locked_by ?? "ACCOUNT_EXECUTION_BRAIN",
    release_conditions: params.release_conditions,
    violations: Object.freeze([...(params.violations ?? [])]),
  });
}

/**
 * Composes a base AccountPolicy with custom overrides while maintaining contract immutability.
 */
export function composeAccountPolicy(
  base: AccountPolicy,
  overrides: Partial<AccountPolicy>
): AccountPolicy {
  const composed: AccountPolicy = {
    ...base,
    ...overrides,
    news_restriction: {
      ...base.news_restriction,
      ...(overrides.news_restriction ?? {}),
    },
    weekend_restriction: {
      ...base.weekend_restriction,
      ...(overrides.weekend_restriction ?? {}),
    },
    allowed_symbols: overrides.allowed_symbols !== undefined
      ? (overrides.allowed_symbols ? Object.freeze([...overrides.allowed_symbols]) : null)
      : base.allowed_symbols,
  };

  const validation = validateAccountPolicy(composed);
  if (!validation.valid) {
    throw new Error(`Invalid composed AccountPolicy: ${validation.errors.join("; ")}`);
  }

  return Object.freeze(composed);
}

// Default Policy Templates for reference & testing
export const DEFAULT_BINANCE_PERSONAL_POLICY: AccountPolicy = Object.freeze({
  policy_id: "pol_binance_personal_v1",
  policy_version: "1.0.0",
  provider: "BINANCE",
  account_type: "PERSONAL",
  max_risk_per_trade_pct: 1.0,
  max_portfolio_risk_pct: 3.0,
  max_daily_drawdown_pct: 5.0,
  max_total_drawdown_pct: 15.0,
  max_open_positions_total: 5,
  max_open_positions_per_symbol: 1,
  news_restriction: Object.freeze({
    mode: "ALLOW",
    buffer_minutes_before: 0,
    buffer_minutes_after: 0,
  }),
  weekend_restriction: Object.freeze({
    mode: "ALLOW",
    close_cutoff_utc: "23:59:59",
  }),
  allowed_symbols: null,
  max_leverage_allowed: 20,
  require_certified_claim: false,
});

export const DEFAULT_BYBIT_PERSONAL_POLICY: AccountPolicy = Object.freeze({
  policy_id: "pol_bybit_personal_v1",
  policy_version: "1.0.0",
  provider: "BYBIT",
  account_type: "PERSONAL",
  max_risk_per_trade_pct: 1.0,
  max_portfolio_risk_pct: 3.0,
  max_daily_drawdown_pct: 5.0,
  max_total_drawdown_pct: 15.0,
  max_open_positions_total: 5,
  max_open_positions_per_symbol: 1,
  news_restriction: Object.freeze({
    mode: "ALLOW",
    buffer_minutes_before: 0,
    buffer_minutes_after: 0,
  }),
  weekend_restriction: Object.freeze({
    mode: "ALLOW",
    close_cutoff_utc: "23:59:59",
  }),
  allowed_symbols: null,
  max_leverage_allowed: 20,
  require_certified_claim: false,
});

export const DEFAULT_MT5_PERSONAL_POLICY: AccountPolicy = Object.freeze({
  policy_id: "pol_mt5_personal_v1",
  policy_version: "1.0.0",
  provider: "MT5_PERSONAL",
  account_type: "PERSONAL",
  max_risk_per_trade_pct: 1.0,
  max_portfolio_risk_pct: 3.0,
  max_daily_drawdown_pct: 6.0,
  max_total_drawdown_pct: 20.0,
  max_open_positions_total: 4,
  max_open_positions_per_symbol: 1,
  news_restriction: Object.freeze({
    mode: "ALLOW",
    buffer_minutes_before: 0,
    buffer_minutes_after: 0,
  }),
  weekend_restriction: Object.freeze({
    mode: "ALLOW",
    close_cutoff_utc: "21:00:00",
  }),
  allowed_symbols: null,
  max_leverage_allowed: 30,
  require_certified_claim: true,
});

export const DEFAULT_MT5_PROP_EVALUATION_POLICY: AccountPolicy = Object.freeze({
  policy_id: "pol_mt5_prop_eval_v1",
  policy_version: "1.0.0",
  provider: "MT5_PROP",
  account_type: "PROP_EVALUATION",
  max_risk_per_trade_pct: 0.5,
  max_portfolio_risk_pct: 1.5,
  max_daily_drawdown_pct: 4.5,
  max_total_drawdown_pct: 9.0,
  max_open_positions_total: 3,
  max_open_positions_per_symbol: 1,
  news_restriction: Object.freeze({
    mode: "BLOCK_ENTRY",
    buffer_minutes_before: 5,
    buffer_minutes_after: 5,
  }),
  weekend_restriction: Object.freeze({
    mode: "MANDATORY_CLOSE",
    close_cutoff_utc: "20:00:00",
  }),
  allowed_symbols: Object.freeze(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "XAUUSD"]),
  max_leverage_allowed: 100,
  require_certified_claim: true,
});

export const DEFAULT_MT5_PROP_FUNDED_POLICY: AccountPolicy = Object.freeze({
  policy_id: "pol_mt5_prop_funded_v1",
  policy_version: "1.0.0",
  provider: "MT5_PROP",
  account_type: "PROP_FUNDED",
  max_risk_per_trade_pct: 0.5,
  max_portfolio_risk_pct: 1.5,
  max_daily_drawdown_pct: 4.0,
  max_total_drawdown_pct: 8.0,
  max_open_positions_total: 3,
  max_open_positions_per_symbol: 1,
  news_restriction: Object.freeze({
    mode: "MANDATORY_CLOSE",
    buffer_minutes_before: 3,
    buffer_minutes_after: 3,
  }),
  weekend_restriction: Object.freeze({
    mode: "MANDATORY_CLOSE",
    close_cutoff_utc: "19:30:00",
  }),
  allowed_symbols: Object.freeze(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "XAUUSD"]),
  max_leverage_allowed: 100,
  require_certified_claim: true,
});

/**
 * Unified Position Plan Factory for MT5 Execution Brains (Personal & Prop).
 * Delegates position sizing & capital allocation math to Capital Manager.
 */
export function createMt5PositionPlan(params: {
  decision: ExecutionDecision;
  signal: SignalContract;
  context: AccountExecutionContext;
  policy: AccountPolicy;
}): PositionPlan | null {
  return calculateCapitalManagerPositionPlan({
    provider: params.context.provider,
    decision: params.decision,
    signal: params.signal,
    context: params.context,
    policy: params.policy,
  });
}

