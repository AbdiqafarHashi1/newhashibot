/**
 * HashiBot Account Execution Brain — Type Definitions
 * Phase 1A Architectural Contract Layer
 */

export type BrainProvider = "BINANCE" | "BYBIT" | "MT5_PERSONAL" | "MT5_PROP";
export type BrainAccountType = "PERSONAL" | "PROP_EVALUATION" | "PROP_FUNDED";
export type BrainEnvironment = "DEMO" | "TESTNET" | "LIVE";

export interface OpenPositionSummary {
  readonly ticket_or_id: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly quantity: number;
  readonly entry_price: number;
  readonly current_price: number;
  readonly unrealized_pnl: number;
  readonly stop_loss: number | null;
  readonly take_profit: number | null;
  readonly open_risk_amount: number;
  readonly open_risk_pct: number;
  readonly notional_value: number;
  readonly opened_at: string;
}

export interface PortfolioExposure {
  readonly total_notional_usd: number;
  readonly total_open_risk_usd: number;
  readonly total_open_risk_pct: number;
  readonly active_position_count: number;
  readonly positions_by_symbol: Readonly<Record<string, number>>;
}

export interface DailyDrawdownState {
  readonly starting_balance: number;
  readonly peak_equity: number;
  readonly current_drawdown_amount: number;
  readonly current_drawdown_pct: number;
  readonly max_allowed_pct: number;
  readonly is_violated: boolean;
}

export interface TotalDrawdownState {
  readonly initial_balance: number;
  readonly high_water_mark: number;
  readonly current_drawdown_amount: number;
  readonly current_drawdown_pct: number;
  readonly max_allowed_pct: number;
  readonly is_violated: boolean;
}

export interface AccountRiskProfile {
  readonly max_risk_per_trade_pct: number;
  readonly max_open_risk_pct: number;
  readonly max_leverage: number;
  readonly min_notional_usd: number;
}

export interface PropRulesState {
  readonly program_id?: "FTMO_TWO_STEP_SWING";
  readonly daily_loss_cap_pct: number;
  readonly total_trailing_drawdown_cap_pct: number;
  readonly news_trading_allowed: boolean;
  readonly weekend_holding_allowed: boolean;
  readonly min_trading_days: number;
  readonly current_trading_days: number;
  readonly breach_status: "HEALTHY" | "WARNING" | "BREACHED";
}

export interface SessionState {
  readonly is_session_open: boolean;
  readonly active_session_name: string;
  readonly current_time_utc: string;
}

export interface NewsState {
  readonly in_high_impact_news_window: boolean;
  readonly news_event_title: string | null;
  readonly minutes_to_news: number | null;
  readonly minutes_after_news: number | null;
}

export interface RuntimeHealthState {
  readonly is_healthy: boolean;
  readonly last_heartbeat_at: string;
  readonly bridge_status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  readonly error_count_last_hour: number;
}

/**
 * Immutable Account Execution Context containing all information
 * an Account Execution Brain needs to evaluate a signal.
 */
export interface AccountExecutionContext {
  /** Required by the production authorization loader; isolated historical fixtures may omit it. */
  readonly provider_contract?: import("../professional-capital-allocation.ts").ProviderContractSpecification;
  readonly account_id: string;
  readonly user_id: string | null;
  readonly provider: BrainProvider;
  readonly account_type: BrainAccountType;
  readonly environment: BrainEnvironment;
  readonly balance: number;
  readonly equity: number;
  readonly free_margin: number;
  readonly used_margin: number;
  readonly leverage: number;
  readonly open_positions: ReadonlyArray<OpenPositionSummary>;
  readonly exposure: PortfolioExposure;
  readonly daily_drawdown: DailyDrawdownState;
  readonly total_drawdown: TotalDrawdownState;
  readonly risk_profile: AccountRiskProfile;
  readonly prop_rules: PropRulesState | null;
  readonly session_state: SessionState;
  readonly news_state: NewsState;
  readonly runtime_health: RuntimeHealthState;
  readonly updated_at: string;
}

export interface NewsPolicyRestriction {
  readonly mode: "ALLOW" | "BLOCK_ENTRY" | "MANDATORY_CLOSE";
  readonly buffer_minutes_before: number;
  readonly buffer_minutes_after: number;
}

export interface WeekendPolicyRestriction {
  readonly mode: "ALLOW" | "BLOCK_ENTRY" | "MANDATORY_CLOSE";
  readonly close_cutoff_utc: string;
}

/**
 * Composable Account Policy representing account restrictions across Personal, Prop, Binance, Bybit & MT5.
 */
export interface AccountPolicy {
  /** Isolated historical study only. Never loaded from customer account policy. */
  readonly historical_static_loss_basis?: true;
  readonly policy_id: string;
  readonly policy_version: string;
  readonly provider: BrainProvider;
  readonly account_type: BrainAccountType;
  readonly max_risk_per_trade_pct: number;
  readonly max_portfolio_risk_pct: number;
  readonly max_daily_drawdown_pct: number;
  readonly max_total_drawdown_pct: number;
  readonly max_open_positions_total: number;
  readonly max_open_positions_per_symbol: number;
  readonly news_restriction: NewsPolicyRestriction;
  readonly weekend_restriction: WeekendPolicyRestriction;
  readonly allowed_symbols: ReadonlyArray<string> | null;
  readonly max_leverage_allowed: number;
  readonly require_certified_claim: boolean;
}

export type RuleViolationCategory =
  | "DRAWDOWN_LIMIT"
  | "RISK_CAP"
  | "EXPOSURE_CAP"
  | "NEWS_RESTRICTION"
  | "WEEKEND_RESTRICTION"
  | "SESSION_RESTRICTION"
  | "SYMBOL_LIMIT"
  | "HEALTH_CHECK"
  | "POLICY_MISMATCH";

export type RuleViolationSeverity = "INFO" | "WARNING" | "CRITICAL_BLOCK" | "BREACH_LOCK";

export type RuleRecommendedAction =
  | "RETRY_LATER"
  | "SKIP_SIGNAL"
  | "REDUCE_POSITION_SIZE"
  | "CLOSE_OPEN_POSITIONS"
  | "MANUAL_INVESTIGATION";

export interface RuleViolation {
  readonly rule_id: string;
  readonly rule_category: RuleViolationCategory;
  readonly severity: RuleViolationSeverity;
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly recommended_action: RuleRecommendedAction;
}

export type AccountLockReason =
  | "DAILY_LOSS_BREACH"
  | "MAX_DRAWDOWN_BREACH"
  | "MANUAL_OPERATOR_LOCK"
  | "MAINTENANCE_LOCK"
  | "PROVIDER_OFFLINE"
  | "PROP_FIRM_VIOLATION";

export interface AccountLock {
  readonly lock_id: string;
  readonly account_id: string;
  readonly reason: AccountLockReason;
  readonly is_locked: boolean;
  readonly locked_at: string;
  readonly locked_by: string;
  readonly release_conditions: string;
  readonly violations: ReadonlyArray<RuleViolation>;
}

export type ExecutionDecisionKind = "EXECUTE" | "SKIP" | "REDUCE_RISK" | "LOCK_ACCOUNT";

export type ExecutionDecisionCode =
  | "APPROVED_FULL_RISK"
  | "APPROVED_SCALED_RISK"
  | "SKIPPED_MAX_POSITIONS_REACHED"
  | "SKIPPED_SYMBOL_POSITION_EXISTS"
  | "SKIPPED_NEWS_RESTRICTION"
  | "SKIPPED_WEEKEND_RESTRICTION"
  | "SKIPPED_MARKET_CLOSED"
  | "SKIPPED_PROVIDER_DEGRADED"
  | "SKIPPED_LOW_CONFIDENCE"
  | "REDUCED_PORTFOLIO_EXPOSURE_CAP"
  | "REDUCED_DRAWDOWN_SAFETY_BUFFER"
  | "LOCKED_DAILY_LOSS_BREACH"
  | "LOCKED_MAX_DRAWDOWN_BREACH"
  | "LOCKED_PROP_RULE_VIOLATION"
  | "LOCKED_MANUAL_OVERRIDE";

export interface ExecutionDecision {
  readonly decision: ExecutionDecisionKind;
  readonly decision_code: ExecutionDecisionCode;
  readonly reason: string;
  readonly account_id: string;
  readonly signal_id: string;
  readonly authorized_risk_pct: number;
  readonly rule_violations: ReadonlyArray<RuleViolation>;
  readonly lock_details: AccountLock | null;
  readonly timestamp: string;
}

export interface PositionPlan {
  readonly plan_id: string;
  readonly signal_id: string;
  readonly account_id: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly order_type: "MARKET" | "LIMIT" | "STOP";
  readonly entry_price: number;
  readonly stop_loss: number;
  readonly take_profit_1: number;
  readonly take_profit_2: number | null;
  readonly quantity: number;
  readonly leverage: number;
  readonly required_margin: number;
  readonly expected_risk_amount: number;
  readonly expected_risk_pct: number;
  readonly expected_notional: number;
  readonly contract_size: number;
  readonly time_in_force: "GTC" | "IOC" | "FOK";
  readonly reduce_only: boolean;
  readonly idempotency_key: string;
}

export interface TradeManagementPlan {
  readonly management_plan_id: string;
  readonly signal_id: string;
  readonly account_id: string;
  readonly tp1_policy: Readonly<{
    ratio: number;
    exit_pct: number;
    move_sl_to_be: boolean;
    profit_lock_offset: number;
  }>;
  readonly tp2_policy: Readonly<{
    ratio: number;
    exit_pct: number;
    enable_trailing: boolean;
  }>;
  readonly breakeven_policy: Readonly<{
    trigger_rr: number;
    lock_offset_price: number;
  }>;
  readonly trailing_policy: Readonly<{
    type: "ATR_TRAILING" | "PERCENT_TRAILING" | "STEP_TRAILING";
    distance: number;
  }>;
  readonly timeout_policy: Readonly<{
    max_holding_hours: number;
    action_on_timeout: "CLOSE_MARKET" | "CANCEL_PENDING" | "NOTIFY_ONLY";
  }>;
}

export interface SignalContract {
  readonly signal_id: string;
  readonly symbol: string;
  readonly market_type: "crypto" | "forex" | "metal";
  readonly direction: "BUY" | "SELL";
  readonly entry_price: number;
  readonly stop_loss: number;
  readonly tp1: number;
  readonly tp2: number | null;
  readonly confidence_score: number;
  readonly grade: string;
  readonly strategy_id: string;
  readonly timeframe: string;
  readonly created_at: string;
}

export type {AccountExecutionBrain} from './brain-interface.ts';
