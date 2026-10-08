/**
 * HashiBot Unified Trade Management Engine — Factory Contracts & Default Policies
 * Phase 6 Architecture
 */

import {
  InvariantViolation,
  MarketContext,
  ProviderCapabilities,
  ProviderHealthContext,
  TradeLifecycleEvent,
  TradeLifecycleSnapshot,
  TradeLifecycleState,
  TradeManagementEvaluation,
  TradeManagementIntent,
  TradeManagementIntentType,
  TradeManagementPolicy,
  TradeProvider,
} from "./types.ts";

export const TRADE_MANAGEMENT_ENGINE_VERSION = "trade-management-engine/v1.0" as const;

/**
 * Default Trade Management Policy for MT5 Personal Accounts
 */
export const DEFAULT_MT5_PERSONAL_TRADE_POLICY: TradeManagementPolicy = Object.freeze({
  policy_id: "pol_tm_mt5_personal_v1",
  policy_version: "1.0.0",
  provider: "MT5_PERSONAL",
  account_type: "PERSONAL",
  tp1_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 1.5,
    close_fraction: 0.5,
  }),
  tp2_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 3.0,
    close_fraction: 0.5,
  }),
  breakeven_policy: Object.freeze({
    enabled: true,
    trigger_mode: "AFTER_TP1",
    trigger_value: 1.5,
    profit_lock_offset_pct: 0.0005, // 0.05% offset above/below entry
  }),
  runner_policy: Object.freeze({
    enabled: true,
  }),
  trailing_policy: Object.freeze({
    mode: "STRUCTURE",
    activation_mode: "R_MULTIPLE",
    activation_value: 2.0,
    distance: 0.002,
    min_update_distance: 0.0005,
    cooldown_seconds: 60,
    runner_only: true,
  }),
  timeout_policy: Object.freeze({
    max_holding_hours: 120, // 5 days for forex swing trades
    action_on_timeout: "CLOSE_MARKET",
  }),
  weekend_policy: Object.freeze({
    mode: "CLOSE_BEFORE_WEEKEND",
    close_cutoff_utc: "21:00:00",
  }),
  news_policy: Object.freeze({
    mode: "ALLOW",
    buffer_minutes: 0,
  }),
  emergency_policy: Object.freeze({
    action: "SAFETY_CLOSE",
  }),
  protection_repair_policy: Object.freeze({
    enabled: true,
    max_repair_attempts: 3,
  }),
  stale_data_policy: Object.freeze({
    max_market_data_age_ms: 30000,
    max_truth_age_ms: 60000,
    action: "BLOCK_LIFECYCLE",
  }),
  provider_outage_policy: Object.freeze({
    action: "MARK_RECOVERY",
  }),
  manual_operator_policy: Object.freeze({
    allow_override: true,
  }),
});

/**
 * Default Trade Management Policy for MT5 Prop Accounts (Evaluation & Funded)
 */
export const DEFAULT_MT5_PROP_TRADE_POLICY: TradeManagementPolicy = Object.freeze({
  policy_id: "pol_tm_mt5_prop_v1",
  policy_version: "1.0.0",
  provider: "MT5_PROP",
  account_type: "PROP_FUNDED",
  tp1_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 1.5,
    close_fraction: 0.5,
  }),
  tp2_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 3.0,
    close_fraction: 0.5,
  }),
  breakeven_policy: Object.freeze({
    enabled: true,
    trigger_mode: "AFTER_TP1",
    trigger_value: 1.5,
    profit_lock_offset_pct: 0.0005,
  }),
  runner_policy: Object.freeze({
    enabled: true,
  }),
  trailing_policy: Object.freeze({
    mode: "FIXED_DISTANCE",
    activation_mode: "R_MULTIPLE",
    activation_value: 1.5,
    distance: 0.0015,
    min_update_distance: 0.0003,
    cooldown_seconds: 30,
    runner_only: true,
  }),
  timeout_policy: Object.freeze({
    max_holding_hours: 48,
    action_on_timeout: "CLOSE_MARKET",
  }),
  weekend_policy: Object.freeze({
    mode: "MANDATORY_CLOSE",
    close_cutoff_utc: "20:30:00",
  }),
  news_policy: Object.freeze({
    mode: "CLOSE_BEFORE_NEWS",
    buffer_minutes: 5,
  }),
  emergency_policy: Object.freeze({
    action: "SAFETY_CLOSE",
  }),
  protection_repair_policy: Object.freeze({
    enabled: true,
    max_repair_attempts: 2,
  }),
  stale_data_policy: Object.freeze({
    max_market_data_age_ms: 15000,
    max_truth_age_ms: 30000,
    action: "EMERGENCY_CLOSE",
  }),
  provider_outage_policy: Object.freeze({
    action: "MARK_RECOVERY",
  }),
  manual_operator_policy: Object.freeze({
    allow_override: true,
  }),
});

/**
 * Default Trade Management Policy for Binance Personal Crypto Futures
 */
export const DEFAULT_BINANCE_PERSONAL_TRADE_POLICY: TradeManagementPolicy = Object.freeze({
  policy_id: "pol_tm_binance_personal_v1",
  policy_version: "1.0.0",
  provider: "BINANCE",
  account_type: "PERSONAL",
  tp1_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 1.5,
    close_fraction: 0.5,
  }),
  tp2_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 3.0,
    close_fraction: 0.5,
  }),
  breakeven_policy: Object.freeze({
    enabled: true,
    trigger_mode: "AFTER_TP1",
    trigger_value: 1.5,
    profit_lock_offset_pct: 0.001, // 0.1% for crypto
  }),
  runner_policy: Object.freeze({
    enabled: true,
  }),
  trailing_policy: Object.freeze({
    mode: "ATR",
    activation_mode: "R_MULTIPLE",
    activation_value: 2.0,
    distance: 0.01,
    min_update_distance: 0.002,
    cooldown_seconds: 60,
    runner_only: true,
  }),
  timeout_policy: Object.freeze({
    max_holding_hours: 72,
    action_on_timeout: "CLOSE_MARKET",
  }),
  weekend_policy: Object.freeze({
    mode: "ALLOW", // Crypto trades 24/7
    close_cutoff_utc: "23:59:59",
  }),
  news_policy: Object.freeze({
    mode: "ALLOW",
    buffer_minutes: 0,
  }),
  emergency_policy: Object.freeze({
    action: "SAFETY_CLOSE",
  }),
  protection_repair_policy: Object.freeze({
    enabled: true,
    max_repair_attempts: 3,
  }),
  stale_data_policy: Object.freeze({
    max_market_data_age_ms: 20000,
    max_truth_age_ms: 45000,
    action: "BLOCK_LIFECYCLE",
  }),
  provider_outage_policy: Object.freeze({
    action: "MARK_RECOVERY",
  }),
  manual_operator_policy: Object.freeze({
    allow_override: true,
  }),
});

/**
 * Default Trade Management Policy for Bybit Personal Crypto Futures
 */
export const DEFAULT_BYBIT_PERSONAL_TRADE_POLICY: TradeManagementPolicy = Object.freeze({
  policy_id: "pol_tm_bybit_personal_v1",
  policy_version: "1.0.0",
  provider: "BYBIT",
  account_type: "PERSONAL",
  tp1_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 1.5,
    close_fraction: 0.5,
  }),
  tp2_policy: Object.freeze({
    enabled: true,
    trigger_mode: "R_MULTIPLE",
    trigger_value: 3.0,
    close_fraction: 0.5,
  }),
  breakeven_policy: Object.freeze({
    enabled: true,
    trigger_mode: "AFTER_TP1",
    trigger_value: 1.5,
    profit_lock_offset_pct: 0.001,
  }),
  runner_policy: Object.freeze({
    enabled: true,
  }),
  trailing_policy: Object.freeze({
    mode: "ATR",
    activation_mode: "R_MULTIPLE",
    activation_value: 2.0,
    distance: 0.01,
    min_update_distance: 0.002,
    cooldown_seconds: 60,
    runner_only: true,
  }),
  timeout_policy: Object.freeze({
    max_holding_hours: 72,
    action_on_timeout: "CLOSE_MARKET",
  }),
  weekend_policy: Object.freeze({
    mode: "ALLOW",
    close_cutoff_utc: "23:59:59",
  }),
  news_policy: Object.freeze({
    mode: "ALLOW",
    buffer_minutes: 0,
  }),
  emergency_policy: Object.freeze({
    action: "SAFETY_CLOSE",
  }),
  protection_repair_policy: Object.freeze({
    enabled: true,
    max_repair_attempts: 3,
  }),
  stale_data_policy: Object.freeze({
    max_market_data_age_ms: 20000,
    max_truth_age_ms: 45000,
    action: "BLOCK_LIFECYCLE",
  }),
  provider_outage_policy: Object.freeze({
    action: "MARK_RECOVERY",
  }),
  manual_operator_policy: Object.freeze({
    allow_override: true,
  }),
});

export function createDefaultTradeManagementPolicy(
  provider: TradeProvider,
  accountId: string
): TradeManagementPolicy {
  const base =
    provider === "MT5_PERSONAL"
      ? DEFAULT_MT5_PERSONAL_TRADE_POLICY
      : provider === "MT5_PROP"
      ? DEFAULT_MT5_PROP_TRADE_POLICY
      : provider === "BINANCE"
      ? DEFAULT_BINANCE_PERSONAL_TRADE_POLICY
      : DEFAULT_BYBIT_PERSONAL_TRADE_POLICY;

  return Object.freeze({
    ...base,
    policy_id: `pol_tm_${provider.toLowerCase()}_${accountId}`,
  });
}

/**
 * Composes a TradeManagementPolicy with custom overrides immutably.
 */
export function composeTradeManagementPolicy(
  base: TradeManagementPolicy,
  overrides?: Partial<TradeManagementPolicy>
): TradeManagementPolicy {
  if (!overrides || Object.keys(overrides).length === 0) {
    return base;
  }
  return Object.freeze({
    ...base,
    ...overrides,
    tp1_policy: overrides.tp1_policy
      ? Object.freeze({ ...base.tp1_policy, ...overrides.tp1_policy })
      : base.tp1_policy,
    tp2_policy: overrides.tp2_policy
      ? Object.freeze({ ...base.tp2_policy, ...overrides.tp2_policy })
      : base.tp2_policy,
    breakeven_policy: overrides.breakeven_policy
      ? Object.freeze({ ...base.breakeven_policy, ...overrides.breakeven_policy })
      : base.breakeven_policy,
    runner_policy: overrides.runner_policy
      ? Object.freeze({ ...base.runner_policy, ...overrides.runner_policy })
      : base.runner_policy,
    trailing_policy: overrides.trailing_policy
      ? Object.freeze({ ...base.trailing_policy, ...overrides.trailing_policy })
      : base.trailing_policy,
    timeout_policy: overrides.timeout_policy
      ? Object.freeze({ ...base.timeout_policy, ...overrides.timeout_policy })
      : base.timeout_policy,
    weekend_policy: overrides.weekend_policy
      ? Object.freeze({ ...base.weekend_policy, ...overrides.weekend_policy })
      : base.weekend_policy,
    news_policy: overrides.news_policy
      ? Object.freeze({ ...base.news_policy, ...overrides.news_policy })
      : base.news_policy,
    emergency_policy: overrides.emergency_policy
      ? Object.freeze({ ...base.emergency_policy, ...overrides.emergency_policy })
      : base.emergency_policy,
    protection_repair_policy: overrides.protection_repair_policy
      ? Object.freeze({ ...base.protection_repair_policy, ...overrides.protection_repair_policy })
      : base.protection_repair_policy,
    stale_data_policy: overrides.stale_data_policy
      ? Object.freeze({ ...base.stale_data_policy, ...overrides.stale_data_policy })
      : base.stale_data_policy,
    provider_outage_policy: overrides.provider_outage_policy
      ? Object.freeze({ ...base.provider_outage_policy, ...overrides.provider_outage_policy })
      : base.provider_outage_policy,
    manual_operator_policy: overrides.manual_operator_policy
      ? Object.freeze({ ...base.manual_operator_policy, ...overrides.manual_operator_policy })
      : base.manual_operator_policy,
  });
}

/**
 * Generates a deterministic idempotency key for trade management intents.
 */
export function generateIntentIdempotencyKey(params: {
  trade_id: string;
  position_id: string;
  intent_type: TradeManagementIntentType;
  lifecycle_version: number;
  position_version: number;
  policy_id: string;
  trigger_identity?: string;
}): string {
  const triggerPart = params.trigger_identity ? `_${params.trigger_identity}` : "";
  return `idempotent_${params.trade_id}_${params.position_id}_${params.intent_type}_v${params.lifecycle_version}_pv${params.position_version}_${params.policy_id}${triggerPart}`;
}

/**
 * Calculates current R-multiple deterministically based on entry, price, stop loss, and side.
 */
export function calculateRMultiple(
  entryPrice: number,
  currentPrice: number,
  stopLossPrice: number | null,
  side: "BUY" | "SELL"
): number {
  if (!stopLossPrice || stopLossPrice <= 0 || entryPrice <= 0) return 0;
  const slDistance = Math.abs(entryPrice - stopLossPrice);
  if (slDistance <= 0) return 0;

  const move = side === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice;
  return Number((move / slDistance).toFixed(4));
}

/**
 * Creates an immutable TradeManagementIntent artifact.
 */
export function createTradeManagementIntent(params: {
  intent_id?: string;
  intent_type: TradeManagementIntentType;
  account_id: string;
  provider: TradeProvider;
  position_id: string;
  signal_id?: string | null;
  lifecycle_state_before: TradeLifecycleState;
  requested_lifecycle_state_after: TradeLifecycleState;
  policy_id: string;
  policy_version: string;
  reason_code: string;
  evidence?: Record<string, unknown>;
  created_at?: string;
  expected_position_version: number;
  lifecycle_version: number;
  provider_capability_requirements?: string[];
  parameters?: Record<string, unknown>;
  trigger_identity?: string;
}): TradeManagementIntent {
  const createdAt = params.created_at ?? new Date().toISOString();
  const intentId =
    params.intent_id ?? `intent_${params.provider.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const idempotencyKey = generateIntentIdempotencyKey({
    trade_id: params.position_id,
    position_id: params.position_id,
    intent_type: params.intent_type,
    lifecycle_version: params.lifecycle_version,
    position_version: params.expected_position_version,
    policy_id: params.policy_id,
    trigger_identity: params.trigger_identity,
  });

  return Object.freeze({
    intent_id: intentId,
    intent_type: params.intent_type,
    account_id: params.account_id,
    provider: params.provider,
    position_id: params.position_id,
    signal_id: params.signal_id ?? null,
    lifecycle_state_before: params.lifecycle_state_before,
    requested_lifecycle_state_after: params.requested_lifecycle_state_after,
    policy_id: params.policy_id,
    policy_version: params.policy_version,
    reason_code: params.reason_code,
    evidence: Object.freeze(params.evidence ?? {}),
    created_at: createdAt,
    idempotency_key: idempotencyKey,
    expected_position_version: params.expected_position_version,
    provider_capability_requirements: Object.freeze(params.provider_capability_requirements ?? []),
    parameters: Object.freeze(params.parameters ?? {}),
  });
}

/**
 * Creates an immutable TradeLifecycleEvent artifact.
 */
export function createTradeLifecycleEvent(params: {
  event_id?: string;
  trade_id: string;
  account_id: string;
  provider: TradeProvider;
  position_id: string;
  previous_state: TradeLifecycleState;
  next_state: TradeLifecycleState;
  event_type: string;
  source?: string;
  reason_code: string;
  evidence?: Record<string, unknown>;
  policy_version: string;
  position_version: number;
  correlation_id?: string;
  causation_id?: string;
  timestamp?: string;
}): TradeLifecycleEvent {
  const ts = params.timestamp ?? new Date().toISOString();
  const eventId = params.event_id ?? `evt_tm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  return Object.freeze({
    event_id: eventId,
    trade_id: params.trade_id,
    account_id: params.account_id,
    provider: params.provider,
    position_id: params.position_id,
    previous_state: params.previous_state,
    next_state: params.next_state,
    event_type: params.event_type,
    source: params.source ?? "UnifiedTradeManagementEngine",
    reason_code: params.reason_code,
    evidence: Object.freeze(params.evidence ?? {}),
    policy_version: params.policy_version,
    position_version: params.position_version,
    correlation_id: params.correlation_id ?? `corr_${params.trade_id}`,
    causation_id: params.causation_id ?? `cause_${eventId}`,
    timestamp: ts,
  });
}

/**
 * Creates an immutable TradeLifecycleSnapshot artifact.
 */
export function createTradeLifecycleSnapshot(
  params: Partial<TradeLifecycleSnapshot> & {
    trade_id: string;
    account_id: string;
    provider: TradeProvider;
    symbol: string;
    side: "BUY" | "SELL";
    opened_quantity: number;
    average_entry: number;
  }
): TradeLifecycleSnapshot {
  const now = new Date().toISOString();

  return Object.freeze({
    trade_id: params.trade_id,
    account_id: params.account_id,
    provider: params.provider,
    symbol: params.symbol,
    side: params.side,
    current_lifecycle_state: params.current_lifecycle_state ?? "FILLED",
    opened_quantity: params.opened_quantity,
    remaining_quantity: params.remaining_quantity ?? params.opened_quantity,
    average_entry: params.average_entry,
    current_stop: params.current_stop ?? null,
    current_tp1: params.current_tp1 ?? null,
    current_tp2: params.current_tp2 ?? null,
    tp1_state: params.tp1_state ?? "PENDING",
    tp2_state: params.tp2_state ?? "PENDING",
    breakeven_state: params.breakeven_state ?? "INACTIVE",
    trailing_state: params.trailing_state ?? "INACTIVE",
    protection_state: params.protection_state ?? "UNVERIFIED",
    realized_profit: params.realized_profit ?? 0,
    unrealized_profit: params.unrealized_profit ?? 0,
    current_r_multiple: params.current_r_multiple ?? 0,
    opened_time: params.opened_time ?? now,
    last_event_time: params.last_event_time ?? now,
    position_version: params.position_version ?? 1,
    lifecycle_version: params.lifecycle_version ?? 1,
    active_lock: params.active_lock ?? false,
    recovery_status: params.recovery_status ?? "NONE",
  });
}

/**
 * Creates an immutable InvariantViolation artifact.
 */
export function createInvariantViolation(params: {
  rule_id: string;
  severity: "WARNING" | "CRITICAL_BLOCK" | "FATAL";
  message: string;
  evidence?: Record<string, unknown>;
}): InvariantViolation {
  return Object.freeze({
    rule_id: params.rule_id,
    severity: params.severity,
    message: params.message,
    evidence: Object.freeze(params.evidence ?? {}),
  });
}

/**
 * Creates an immutable TradeManagementEvaluation artifact.
 */
export function createTradeManagementEvaluation(params: {
  current_state: TradeLifecycleState;
  proposed_next_state: TradeLifecycleState;
  intents?: TradeManagementIntent[];
  events?: TradeLifecycleEvent[];
  invariant_violations?: readonly InvariantViolation[];
  explanation: string;
  evaluation_timestamp?: string;
  snapshot: TradeLifecycleSnapshot;
}): TradeManagementEvaluation {
  return Object.freeze({
    current_state: params.current_state,
    proposed_next_state: params.proposed_next_state,
    intents: Object.freeze(params.intents ?? []),
    events: Object.freeze(params.events ?? []),
    invariant_violations: Object.freeze(params.invariant_violations ?? []),
    explanation: params.explanation,
    evaluation_timestamp: params.evaluation_timestamp ?? new Date().toISOString(),
    snapshot: params.snapshot,
  });
}
