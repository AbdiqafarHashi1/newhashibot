/**
 * HashiBot Unified Trade Management Engine — Core Type Definitions
 * Phase 6 Architecture
 */

export type TradeProvider = "MT5_PERSONAL" | "MT5_PROP" | "BINANCE" | "BYBIT";
export type TradeAccountType = "PERSONAL" | "PROP_CHALLENGE" | "PROP_FUNDED";

export type TradeLifecycleState =
  | "SIGNAL_CREATED"
  | "QUALIFIED"
  | "POSITION_SIZED"
  | "ORDER_SUBMITTED"
  | "FILLED"
  | "PROTECTION_PENDING"
  | "PROTECTED"
  | "TP1_ELIGIBLE"
  | "TP1_EXECUTION_PENDING"
  | "TP1"
  | "BREAK_EVEN_PENDING"
  | "BREAK_EVEN"
  | "TP2_ELIGIBLE"
  | "TP2_EXECUTION_PENDING"
  | "TP2"
  | "RUNNER"
  | "CLOSE_PENDING"
  | "CLOSED"
  | "ARCHIVED"
  // Exceptional / Safety States
  | "PROTECTION_FAILED"
  | "PROTECTION_REPAIR_PENDING"
  | "EXIT_PENDING"
  | "EMERGENCY_EXIT_PENDING"
  | "RECOVERY_REQUIRED"
  | "LIFECYCLE_BLOCKED";

export type TradeManagementIntentType =
  | "NO_ACTION"
  | "VERIFY_PROTECTION"
  | "REPAIR_PROTECTION"
  | "PLACE_STOP_LOSS"
  | "PLACE_TAKE_PROFIT"
  | "PARTIAL_CLOSE"
  | "MOVE_STOP_TO_BREAK_EVEN"
  | "MOVE_STOP_TO_LOCKED_PROFIT"
  | "START_TRAILING"
  | "UPDATE_TRAILING_STOP"
  | "CANCEL_REMAINING_ORDERS"
  | "CLOSE_POSITION"
  | "EMERGENCY_CLOSE"
  | "MARK_RECOVERY_REQUIRED"
  | "ARCHIVE_TRADE";

export interface TradeManagementPolicy {
  readonly policy_id: string;
  readonly policy_version: string;
  readonly provider: TradeProvider;
  readonly account_type: TradeAccountType;

  readonly tp1_policy: Readonly<{
    enabled: boolean;
    trigger_mode: "R_MULTIPLE" | "PERCENTAGE";
    trigger_value: number; // e.g. 1.0 R or 1.5%
    close_fraction: number; // e.g. 0.5 (50%)
  }>;

  readonly tp2_policy: Readonly<{
    enabled: boolean;
    trigger_mode: "R_MULTIPLE" | "PERCENTAGE";
    trigger_value: number; // e.g. 2.0 R or 3.0%
    close_fraction: number; // e.g. 0.5 (50% of remaining or total)
  }>;

  readonly breakeven_policy: Readonly<{
    enabled: boolean;
    trigger_mode: "AFTER_TP1" | "R_MULTIPLE" | "PERCENTAGE";
    trigger_value: number; // R or % if independent
    profit_lock_offset_pct: number; // e.g. 0.001 (0.1%) offset above/below entry
  }>;

  readonly runner_policy: Readonly<{
    enabled: boolean;
  }>;

  readonly trailing_policy: Readonly<{
    mode: "OFF" | "FIXED_DISTANCE" | "ATR" | "PERCENTAGE" | "STRUCTURE";
    activation_mode: "IMMEDIATE" | "R_MULTIPLE" | "PERCENTAGE";
    activation_value: number;
    distance: number;
    min_update_distance: number;
    cooldown_seconds: number;
    runner_only: boolean;
  }>;

  readonly timeout_policy: Readonly<{
    max_holding_hours: number;
    action_on_timeout: "CLOSE_MARKET" | "NO_ACTION" | "EMERGENCY_CLOSE";
  }>;

  readonly weekend_policy: Readonly<{
    mode: "ALLOW" | "CLOSE_BEFORE_WEEKEND" | "MANDATORY_CLOSE";
    close_cutoff_utc: string; // e.g. "21:00:00"
  }>;

  readonly news_policy: Readonly<{
    mode: "ALLOW" | "CLOSE_BEFORE_NEWS" | "NO_NEW_ENTRY";
    buffer_minutes: number;
  }>;

  readonly emergency_policy: Readonly<{
    action: "SAFETY_CLOSE" | "MARK_RECOVERY" | "OPERATOR_INCIDENT";
  }>;

  readonly protection_repair_policy: Readonly<{
    enabled: boolean;
    max_repair_attempts: number;
  }>;

  readonly stale_data_policy: Readonly<{
    max_market_data_age_ms: number;
    max_truth_age_ms: number;
    action: "BLOCK_LIFECYCLE" | "EMERGENCY_CLOSE";
  }>;

  readonly provider_outage_policy: Readonly<{
    action: "BLOCK_LIFECYCLE" | "MARK_RECOVERY";
  }>;

  readonly manual_operator_policy: Readonly<{
    allow_override: boolean;
  }>;
}

export interface TradeLifecycleSnapshot {
  readonly trade_id: string;
  readonly account_id: string;
  readonly provider: TradeProvider;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly current_lifecycle_state: TradeLifecycleState;
  readonly opened_quantity: number;
  readonly remaining_quantity: number;
  readonly average_entry: number;
  readonly current_stop: number | null;
  readonly current_tp1: number | null;
  readonly current_tp2: number | null;
  readonly tp1_state: "PENDING" | "EXECUTED" | "SKIPPED";
  readonly tp2_state: "PENDING" | "EXECUTED" | "SKIPPED";
  readonly breakeven_state: "INACTIVE" | "TRIGGERED" | "APPLIED";
  readonly trailing_state: "INACTIVE" | "ACTIVE" | "UPDATED";
  readonly protection_state: "UNVERIFIED" | "VERIFIED" | "FAILED" | "REPAIRING";
  readonly realized_profit: number;
  readonly unrealized_profit: number;
  readonly current_r_multiple: number;
  readonly opened_time: string;
  readonly last_event_time: string;
  readonly position_version: number;
  readonly lifecycle_version: number;
  readonly active_lock: boolean;
  readonly recovery_status: "NONE" | "REQUIRED" | "IN_PROGRESS";
}

export interface TradeManagementIntent {
  readonly intent_id: string;
  readonly intent_type: TradeManagementIntentType;
  readonly account_id: string;
  readonly provider: TradeProvider;
  readonly position_id: string;
  readonly signal_id: string | null;
  readonly lifecycle_state_before: TradeLifecycleState;
  readonly requested_lifecycle_state_after: TradeLifecycleState;
  readonly policy_id: string;
  readonly policy_version: string;
  readonly reason_code: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly idempotency_key: string;
  readonly expected_position_version: number;
  readonly provider_capability_requirements: ReadonlyArray<string>;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface TradeLifecycleEvent {
  readonly event_id: string;
  readonly trade_id: string;
  readonly account_id: string;
  readonly provider: TradeProvider;
  readonly position_id: string;
  readonly previous_state: TradeLifecycleState;
  readonly next_state: TradeLifecycleState;
  readonly event_type: string;
  readonly source: string;
  readonly reason_code: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly policy_version: string;
  readonly position_version: number;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly timestamp: string;
}

export interface InvariantViolation {
  readonly rule_id: string;
  readonly severity: "WARNING" | "CRITICAL_BLOCK" | "FATAL";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface TradeManagementEvaluation {
  readonly current_state: TradeLifecycleState;
  readonly proposed_next_state: TradeLifecycleState;
  readonly intents: ReadonlyArray<TradeManagementIntent>;
  readonly events: ReadonlyArray<TradeLifecycleEvent>;
  readonly invariant_violations: ReadonlyArray<InvariantViolation>;
  readonly explanation: string;
  readonly evaluation_timestamp: string;
  readonly snapshot: TradeLifecycleSnapshot;
}

export interface MarketContext {
  readonly current_price: number;
  readonly bid: number;
  readonly ask: number;
  readonly atr: number | null;
  readonly is_market_open: boolean;
  readonly in_high_impact_news: boolean;
  readonly news_title?: string | null;
  readonly is_weekend: boolean;
  readonly data_timestamp: string;
}

export interface ProviderHealthContext {
  readonly is_healthy: boolean;
  readonly bridge_status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  readonly last_heartbeat_at: string;
}

export interface ProviderCapabilities {
  readonly provider: TradeProvider;
  readonly supports_partial_close: boolean;
  readonly supports_amend_stop_loss: boolean;
  readonly supports_amend_take_profit: boolean;
  readonly supports_reduce_only: boolean;
  readonly supports_hedge_mode: boolean;
  readonly supports_one_way_mode: boolean;
  readonly supports_native_trailing_stop: boolean;
  readonly supports_client_side_trailing: boolean;
  readonly supports_multiple_tp_orders: boolean;
  readonly supports_close_by_position_id: boolean;
  readonly supports_close_by_symbol: boolean;
  readonly supports_protection_query: boolean;
  readonly supports_order_repair: boolean;
  readonly supports_atomic_protection: boolean;
  readonly minimum_order_quantity: number;
  readonly quantity_step: number;
  readonly price_tick: number;
}
