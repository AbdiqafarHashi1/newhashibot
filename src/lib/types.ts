import type { SignalDirection } from './runtimeContracts/index.js';

export interface Package {
  id: string;
  name: string;
  slug: string;
  price: number;
  price_kes?: number | null;
  currency: string;
  billing_period?: string | null;
  duration_days: number | null;
  active: boolean;
  features: string[];
  telegram_access_required: boolean;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
export type AccessRequestStatus = 'pending_payment' | 'pending_admin_approval' | 'pending' | 'approved' | 'rejected' | 'converted_to_access' | 'cancelled' | 'expired';
export type AccessStatus = 'active' | 'inactive' | 'expired';
export type TelegramStatus = 'not_invited' | 'invited' | 'joined' | 'removed';

export interface CustomerSubscription {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  email: string;
  full_name: string;
  package_id: string | null;
  package_name: string;
  payment_status: PaymentStatus;
  access_status: AccessStatus;
  amount_paid: number | null;
  currency: string;
  payment_reference: string;
  payment_method: string;
  starts_at: string | null;
  expires_at: string | null;
  telegram_status: TelegramStatus;
  telegram_username: string;
  telegram_chat_id: string;
  notes: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
}

export interface AccessRequest {
  id: string;
  user_id: string;
  product_slug: string;
  full_name: string;
  email: string;
  phone: string;
  telegram_username: string;
  telegram_chat_id: string;
  payment_method: string;
  notes: string;
  payment_reference?: string;
  risk_preset?: string;
  contact_preference?: string;
  status: AccessRequestStatus;
  admin_note: string;
  created_at: string;
  updated_at: string;
}


export interface CustomerBotSetup {
  id: string;
  user_id: string;
  package_slug: string;
  subscription_id: string | null;
  access_request_id: string | null;
  bot_type: 'crypto_personal' | 'forex_mt5_personal' | 'forex_mt5_prop';
  capital_mode: 'personal' | 'prop';
  setup_status: 'not_configured' | 'setup_requested' | 'pending_admin_setup' | 'configured' | 'paused' | 'running' | 'disabled';
  risk_preset: string;
  account_size: number | null;
  account_currency: string;
  platform: string;
  broker_name: string;
  exchange_name: string;
  prop_firm_name: string;
  account_type: string;
  preferred_symbols: string[];
  max_risk_per_trade_pct: number | null;
  max_daily_loss_pct: number | null;
  drawdown_limit_pct: number | null;
  min_trading_days: number | null;
  leverage_profile: string;
  customer_notes: string;
  admin_notes: string;
  acknowledged_no_execution: boolean;
  created_at: string;
  updated_at: string;
}

export interface TelegramLink {
  id: string;
  user_id: string;
  telegram_username: string;
  telegram_chat_id: string;
  phone: string;
  status: 'pending' | 'connected' | 'revoked';
  notes: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
}

export interface ScannerConfigRow {
  id: number;
  is_enabled: boolean;
  demo_mode_enabled: boolean;
  min_signal_grade: string;
  prevent_duplicate_symbol_signals: boolean;
  crypto_scan_interval_minutes: number;
  forex_scan_interval_minutes: number;
  active_timeframes: string[];
  allow_demo_telegram_sending: boolean;
  last_updated_by: string | null;
  updated_at: string;
  // Phase 5A fields
  schedule_enabled: boolean;
  scan_interval_minutes: number;
  auto_send_telegram: boolean;
  min_auto_send_grade: string;
  scan_crypto_enabled: boolean;
  scan_forex_enabled: boolean;
  last_scheduled_scan_at: string | null;
  last_manual_scan_at: string | null;
  heartbeat_status: 'healthy' | 'stale' | 'inactive' | 'error';
  heartbeat_updated_at: string | null;
  cron_job_active: boolean;
  cron_job_name: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  created_at: string;
}

export interface UserAccess {
  id: string;
  user_id: string;
  product_slug: string;
  status: 'active' | 'inactive' | 'expired';
  started_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Symbol {
  id: string;
  symbol: string;
  display_name: string;
  market_type: 'crypto' | 'forex';
  provider: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export interface Signal {
  id: string;
  candidate_id: string | null;
  symbol: string;
  market_type: string;
  timeframe: string;
  direction: SignalDirection;
  entry_type: string;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
  risk_reward: number;
  strategy_name: string;
  regime: string;
  grade: string;
  confidence_score: number;
  reason: string;
  invalidation: string;
  status: 'new' | 'approved' | 'waiting' | 'active' | 'tp1_hit' | 'tp2_hit' | 'sl_hit' | 'expired' | 'cancelled';
  source: 'scanner' | 'manual';
  mode_slug: string | null;
  arbitrator_decision: Record<string, unknown> | null;
  risk_profile_snapshot: Record<string, unknown> | null;
  paper_execution_intent_id: string | null;
  data_source: string | null;
  capital_mode: string | null;
  risk_profile: string | null;
  strategy_risk_class: string | null;
  recommended_risk_pct: number | null;
  suggested_leverage_min: number | null;
  suggested_leverage_max: number | null;
  leverage_cap: number | null;
  position_sizing_note: string | null;
  strategy_specific_warning: string | null;
  risk_warning: string | null;
  recommendation_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModeConfig {
  id: string;
  slug: 'signal_mode' | 'personal_mode' | 'prop_mode';
  display_name: string;
  description: string;
  is_enabled: boolean;
  paper_execution_enabled: boolean;
  min_score_override: number | null;
  min_rr_override: number | null;
  max_active_signals: number;
  allowed_timeframes: string[] | null;
  risk_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskProfile {
  id: string;
  name: string;
  mode_slug: string;
  max_daily_loss_pct: number;
  max_drawdown_pct: number;
  max_open_positions: number;
  max_trades_per_day: number;
  max_consecutive_losses: number;
  cooldown_minutes: number;
  default_risk_pct: number;
  account_equity: number;
  created_at: string;
  updated_at: string;
}

export interface PaperExecutionIntent {
  id: string;
  signal_id: string | null;
  mode_slug: string;
  symbol: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  risk_pct: number;
  account_equity: number;
  position_size_lots: number;
  status: 'pending' | 'filled' | 'cancelled' | 'expired';
  risk_check_passed: boolean;
  risk_block_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacktestRun {
  id: string;
  strategy_name: string;
  symbol: string;
  timeframe: string;
  from_date: string;
  to_date: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_trades: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number | null;
  net_return_pct: number | null;
  error_message: string | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyCandidate {
  id: string;
  scanner_run_id: string | null;
  symbol: string;
  market_type: string;
  timeframe: string;
  strategy_name: string;
  direction: string;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  risk_reward: number | null;
  regime: string;
  confidence_score: number;
  grade: string;
  reason: string;
  rejection_reason: string;
  status: 'candidate' | 'approved' | 'rejected' | 'converted_to_signal';
  data_source: string;
  score_breakdown: Record<string, number | string | boolean>;
  created_at: string;
}

export interface ProviderStatus {
  id: string;
  provider_name: string;
  market_type: string;
  status: 'active' | 'error' | 'not_configured' | 'unknown' | 'disabled' | 'inactive' | 'off';
  last_success_at: string | null;
  last_error_at: string | null;
  error_message: string;
  data_source_label: string | null;
  updated_at: string;
}

export interface TelegramDelivery {
  id: string;
  signal_id: string | null;
  delivery_type: string;
  chat_id: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  telegram_message_id: string;
  error_message: string;
  event_id?: string | null;
  event_type?: string | null;
  destination_channel?: 'admin' | 'free' | 'vip' | null;
  destination_chat_id?: string | null;
  sent_at?: string | null;
  delivery_status?: 'pending' | 'sent' | 'failed' | 'skipped' | null;
  retry_count?: number | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  telegram_sent?: boolean;
  created_at: string;
}

export interface IndicatorSnapshot {
  id: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  candle_time: string;
  ema20: number;
  ema50: number;
  atr14: number;
  rsi14: number;
  recent_high: number;
  recent_low: number;
  volatility_state: string;
  regime: string;
  created_at: string;
}

export interface StrategyConfig {
  id: string;
  strategy_name: string;
  enabled: boolean;
  market_type: string;
  allowed_symbols: string[];
  allowed_timeframes: string[];
  signal_style: string;
  risk_mode: string;
  min_score: number;
  min_rr: number;
  min_stop_distance_pct: number;
  min_tp1_distance_pct: number;
  min_tp2_distance_pct: number;
  max_bars_in_trade: number;
  max_active_signals: number;
  one_active_signal_per_symbol: boolean;
  params: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface ExecutionOrder {
  id: string;
  signal_id: string | null;
  symbol: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  volume: number;
  execution_mode: string;
  execution_provider?: string | null;
  provider_order_id?: string | null;
  provider_position_id?: string | null;
  provider_status?: string | null;
  provider_error?: string | null;
  provider_fill_price?: number | null;
  provider_fee?: number | null;
  provider_slippage?: number | null;
  provider_metadata?: Record<string, unknown> | null;
  execution_group_id?: string | null;
  status: 'pending' | 'sent_to_bridge' | 'accepted' | 'rejected' | 'filled' | 'failed' | 'cancelled' | 'skipped' | 'entry_submitted' | 'entry_filled' | 'protected' | 'pending_protection' | 'protection_pending' | 'protection_failed' | 'protection_recovered' | 'partially_closed' | 'protected_managed' | 'pending_managed_protection' | 'stale_closed' | 'closed_tp' | 'closed_sl' | 'closed_breakeven' | string;
  latest_auto_skip_reason?: string | null;
  protection_status?: 'unprotected' | 'pending_protection' | 'protection_pending' | 'protection_failed' | 'protection_recovered' | 'protected' | 'protected_native' | 'protected_managed' | 'pending_managed_protection' | 'unprotected_failed' | null;
  bracket_mode?: '' | 'exchange_native' | 'managed_exit_fallback' | 'failed' | null;
  binance_entry_order_id?: string | null;
  binance_sl_order_id?: string | null;
  binance_tp1_order_id?: string | null;
  binance_tp2_order_id?: string | null;
  intended_sl?: number | null;
  intended_tp1?: number | null;
  intended_tp2?: number | null;
  tp1_quantity?: number | null;
  tp2_quantity?: number | null;
  remaining_quantity?: number | null;
  remaining_qty?: number | null;
  partial_close_qty?: number | null;
  runner_active?: boolean | null;
  lifecycle_state?: string | null;
  profit_lock_enabled?: boolean | null;
  profit_lock_r?: number | null;
  profit_lock_price?: number | null;
  profit_lock_status?: string | null;
  original_sl_price?: number | null;
  replacement_sl_price?: number | null;
  replacement_sl_order_id?: string | null;
  replacement_sl_algo_id?: string | null;
  replacement_sl_verified?: boolean | null;
  old_sl_cancelled_after_tp1?: boolean | null;
  sl_replaced_after_tp1?: boolean | null;
  tp2_pending?: boolean | null;
  tp2_filled?: boolean | null;
  profit_lock_sl_active?: boolean | null;
  profit_lock_sl_hit?: boolean | null;
  runner_expired?: boolean | null;
  runner_closed?: boolean | null;
  tp1_fill_price?: number | null;
  tp1_fill_time?: string | null;
  tp1_closed_at?: string | null;
  tp2_closed_at?: string | null;
  sl_closed_at?: string | null;
  sl_moved_to_be?: boolean | null;
  stale_checked_at?: string | null;
  stale_cleanup_reason?: string | null;
  current_position_size?: number | null;
  latest_mark_price?: number | null;
  latest_unrealized_pnl?: number | null;
  position_size?: number | null;
  current_price?: number | null;
  sl_status?: string | null;
  tp1_status?: string | null;
  tp2_status?: string | null;
  expiry_status?: string | null;
  recovery_status?: string | null;
  cleanup_status?: string | null;
  last_telegram_event_sent?: string | null;
  latest_telegram_event_at?: string | null;
  latest_account_total_margin_balance?: number | null;
  latest_account_total_wallet_balance?: number | null;
  latest_available_usdt?: number | null;
  latest_available_usdc?: number | null;
  latest_sync_at?: string | null;
  bridge_order_id: string;
  mt5_ticket: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface StrategyEvaluationStats {
  evaluated?: number;
  accepted?: number;
  rejected?: number;
  arbitration_blocked?: number;
  duplicate_active_signal?: number;
  runtime_errors?: number;
  skipped?: number;
  skip_reasons?: Record<string, number>;
}

export interface ScannerRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'completed' | 'error' | 'failed';
  symbols_scanned: number;
  candles_fetched: number;
  candidates_found: number;
  signals_created: number;
  indicators_calculated: number;
  strategy_evaluations_count: number;
  rejected_candidates_count: number;
  errors: string[];
  error_message: string;
  created_at: string;
  // Phase 5A fields
  run_type: 'manual' | 'scheduled';
  source?: string | null;
  triggered_by?: string | null;
  is_automatic?: boolean | null;
  telegram_sent_count: number;
  telegram_blocked_count: number;
  telegram_skipped_count?: number;
  telegram_failed_count?: number;
  duplicate_symbol_blocked?: number;
  outcome_checked?: boolean | null;
  outcomes_updated?: number | null;
  outcome_telegram_sent?: number | null;
  outcome_telegram_skipped?: number | null;
  outcome_telegram_failed?: number | null;
  market_mode?: string;
  crypto_symbols_scanned?: number;
  forex_symbols_scanned?: number;
  scanned_crypto_count?: number;
  scanned_forex_count?: number;
  forex_skipped_count?: number;
  forex_skipped_rate_limit?: boolean;
  forex_budget_limited?: boolean;
  forex_provider_calls_attempted?: number;
  forex_provider_calls_planned?: number;
  forex_provider_call_limit?: number;
  last_forex_scan_at?: string | null;
  forex_next_allowed_scan_at?: string | null;
  strategy_evaluation_summary?: Record<string, StrategyEvaluationStats> | null;
}

export interface BinanceExecutionOrder extends Omit<ExecutionOrder, 'status'> {
  exchange: string;
  environment: 'testnet' | 'live';
  execution_provider?: 'binance' | 'bybit' | 'mt5' | string | null;
  provider_status?: string | null;
  provider_symbol?: string | null;
  provider_entry_enabled?: boolean | null;
  execution_group_id?: string | null;
  side: 'long' | 'short' | string;
  leverage: number | null;
  quantity: number | null;
  entry_order_id: string | null;
  sl_order_id: string | null;
  tp1_order_id: string | null;
  tp2_order_id: string | null;
  binance_entry_order_id?: string | null;
  binance_sl_order_id?: string | null;
  binance_tp1_order_id?: string | null;
  binance_tp2_order_id?: string | null;
  sl_algo_id?: string | null;
  tp1_algo_id?: string | null;
  tp2_algo_id?: string | null;
  sl_client_algo_id?: string | null;
  tp1_client_algo_id?: string | null;
  tp2_client_algo_id?: string | null;
  native_protection_verified?: boolean | null;
  managed_fallback_active?: boolean | null;
  raw_exchange_response: Record<string, unknown> | null;
  testnet_enabled_at: string | null;
  last_exchange_error: string | null;
  bracket_mode: '' | 'exchange_native' | 'managed_exit_fallback' | 'failed' | null;
  protection_status: 'unprotected' | 'protected' | 'protected_native' | 'protected_managed' | 'pending_protection' | 'protection_pending' | 'protection_failed' | 'protection_recovered' | 'pending_managed_protection' | 'unprotected_failed' | null;
  capital_basis: string | null;
  raw_total_margin_balance: number | null;
  raw_total_wallet_balance: number | null;
  raw_available_usdt: number | null;
  raw_available_usdc: number | null;
  selected_capital_used: number | null;
  max_capital_cap_applied: boolean | null;
  risk_pct: number | null;
  risk_amount: number | null;
  notional: number | null;
  leverage_source: string | null;
  risk_source?: string | null;
  stress_mode?: boolean | null;
  open_risk_guard?: string | null;
  latest_auto_skip_reason: string | null;
  breakeven_sl_order_id: string | null;
  tp1_filled: boolean | null;
  sl_moved_to_be: boolean | null;
  be_stop_level: number | null;
  latest_protection_error: string | null;
  latest_monitor_error?: string | null;
  latest_sync_error?: string | null;
  current_open_risk_pct: number | null;
  total_open_risk_after_trade: number | null;
  intended_sl?: number | null;
  intended_tp1?: number | null;
  intended_tp2?: number | null;
  tp1_quantity?: number | null;
  tp2_quantity?: number | null;
  remaining_quantity?: number | null;
  remaining_qty?: number | null;
  partial_close_qty?: number | null;
  runner_active?: boolean | null;
  lifecycle_state?: string | null;
  profit_lock_enabled?: boolean | null;
  profit_lock_r?: number | null;
  profit_lock_price?: number | null;
  profit_lock_status?: string | null;
  original_sl_price?: number | null;
  replacement_sl_price?: number | null;
  replacement_sl_order_id?: string | null;
  replacement_sl_algo_id?: string | null;
  replacement_sl_verified?: boolean | null;
  old_sl_cancelled_after_tp1?: boolean | null;
  sl_replaced_after_tp1?: boolean | null;
  tp2_pending?: boolean | null;
  tp2_filled?: boolean | null;
  profit_lock_sl_active?: boolean | null;
  profit_lock_sl_hit?: boolean | null;
  runner_expired?: boolean | null;
  runner_closed?: boolean | null;
  tp1_fill_price?: number | null;
  tp1_fill_time?: string | null;
  tp1_closed_at?: string | null;
  tp2_closed_at?: string | null;
  sl_closed_at?: string | null;
  stale_checked_at?: string | null;
  stale_cleanup_reason?: string | null;
  current_position_size?: number | null;
  latest_mark_price?: number | null;
  latest_unrealized_pnl?: number | null;
  position_size?: number | null;
  current_price?: number | null;
  sl_status?: string | null;
  tp1_status?: string | null;
  tp2_status?: string | null;
  expiry_status?: string | null;
  recovery_status?: string | null;
  cleanup_status?: string | null;
  last_telegram_event_sent?: string | null;
  latest_telegram_event_at?: string | null;
  latest_account_total_margin_balance?: number | null;
  latest_account_total_wallet_balance?: number | null;
  latest_available_usdt?: number | null;
  latest_available_usdc?: number | null;
  latest_sync_at?: string | null;
  entry_filled_at?: string | null;
  protection_submitted_at?: string | null;
  protected_at?: string | null;
  time_stop_deadline_at?: string | null;
  opened_at?: string | null;
  expires_at?: string | null;
  max_hold_minutes?: number | null;
  expiry_reason?: string | null;
  last_monitor_checked_at?: string | null;
  timeout_closed_at?: string | null;
  last_monitor_action?: string | null;
  margin_mode?: string | null;
  selected_margin_asset?: 'USDT' | 'USDC' | string | null;
  insufficient_margin_reason?: string | null;
  margin_backup_attempted?: boolean | null;
  margin_backup_asset_used?: string | null;
  requested_margin?: number | null;
  current_r?: number | null;
  profit_lock_r_current?: number | null;
  current_pnl?: number | null;
  highest_positive_r_observed?: number | null;
  highest_positive_pnl_observed?: number | null;
  profit_lock_action_count?: number | null;
  max_adverse_r_observed?: number | null;
  reached_0_1r?: boolean | null;
  reached_0_2r?: boolean | null;
  reached_0_3r?: boolean | null;
  reached_0_5r?: boolean | null;
  later_reversed_after_positive_excursion?: boolean | null;
  profit_lock_engine_mode?: string | null;
  lock_recommendation?: string | null;
  profit_lock_skipped_reason?: string | null;
  last_verified_sl_replacement?: Record<string, unknown> | null;
  old_sl_preserved?: boolean | null;
  governor_state: 'normal' | 'defensive' | 'aggressive_allowed' | 'paused' | null;
  governor_reason: string | null;
  risk_multiplier: number | null;
  adjusted_risk_pct: number | null;
  adjusted_max_leverage: number | null;
  status: 'pending' | 'entry_submitted' | 'entry_filled' | 'sl_submitted' | 'tp_submitted' | 'partially_closed' | 'closed_tp' | 'closed_tp2' | 'closed_profit_lock' | 'closed_sl' | 'closed_breakeven' | 'closed_timeout' | 'closed_expired' | 'closed_expired_after_tp1' | 'closed_manual' | 'cancelled' | 'failed' | 'skipped' | string;
}

export interface ExecutionEventLog {
  id: string;
  execution_id: string | null;
  execution_order_id?: string | null;
  signal_id?: string | null;
  symbol?: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  telegram_sent?: boolean;
  created_at: string;
}

export interface ConnectedExecutionAccount {
  id: string;
  customer_id: string;
  provider: 'binance' | 'bybit';
  account_id: string;
  credential_ref: string;
  execution_instance_id: string;
  environment: 'testnet' | 'demo' | 'live';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MT5Account {
  id: string;
  user_id: string;
  broker: string;
  server: string;
  account_number_masked?: string;
  nickname: string;
  currency: string;
  leverage: number;
  account_type: 'personal' | 'prop' | 'demo';
  execution_mode: 'personal' | 'prop_challenge' | 'demo';
  margin_mode: 'hedging' | 'netting';
  execution_enabled: boolean;
  connection_status: 'pending' | 'connected' | 'degraded' | 'disconnected' | 'disabled';
  provider_health: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  bridge_id?: string | null;
  last_heartbeat_at?: string | null;
  last_sync_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeManagementTruth {
  id: string;
  execution_order_id?: string | null;
  provider: string;
  environment: string;
  symbol: string;
  direction: string;
  status: string;
  protection_status: string;
  sl_present: boolean;
  tp1_present: boolean;
  tp2_present: boolean;
  entry_price?: number | null;
  mark_price?: number | null;
  unrealized_pnl?: number | null;
  quantity?: number | null;
  leverage?: number | null;
  sl_price?: number | null;
  tp1_price?: number | null;
  tp2_price?: number | null;
  latest_sync_at?: string | null;
  recovery_status?: string | null;
  latest_error?: string | null;
  last_action_taken?: string | null;
  customer_id?: string | null;
  account_id?: string | null;
  execution_scope_key?: string | null;
}

export interface ExecutionSettings {
  id: number;
  execution_mode: 'signal_only' | 'testnet';
  exchange: 'binance_usdm_testnet';
  testnet_enabled: boolean;
  live_trading_enabled: false;
  kill_switch_enabled: boolean;
  auto_execute_testnet: boolean;
  max_open_testnet_positions: number;
  max_open_testnet_positions_allowed_max: number;
  max_total_open_risk_pct: number;
  one_active_execution_per_symbol: boolean;
  testnet_enabled_at: string | null;
  fallback_account_balance: number;
  capital_basis: 'available_usdt' | 'available_usdc_plus_usdt' | 'total_margin_balance' | 'total_wallet_balance' | 'manual_override';
  testnet_capital_override_usdt: number | null;
  max_capital_used_usdt: number | null;
  testnet_risk_a: number;
  testnet_risk_a_plus: number;
  max_testnet_risk_pct: number;
  testnet_leverage_a: number;
  testnet_leverage_a_plus: number;
  testnet_max_leverage: number;
  stress_override_enabled: boolean;
  stress_risk_pct: number;
  stress_leverage: number;
  stress_ignore_open_risk_limit: boolean;
  governor_enabled: boolean;
  testnet_governor_mode: 'normal' | 'readonly' | 'off_for_testing';
  governor_state: 'normal' | 'defensive' | 'aggressive_allowed' | 'paused';
  daily_start_equity: number | null;
  current_equity: number | null;
  daily_realized_pnl: number | null;
  daily_unrealized_pnl: number | null;
  daily_pnl_pct: number | null;
  max_daily_loss_pct: number;
  max_unrealized_drawdown_pct: number;
  aggressive_allowed_profit_pct: number;
  defensive_loss_pct: number;
  max_consecutive_failed_executions: number;
  max_consecutive_closed_sl: number;
  last_governor_reason: string | null;
  last_governor_checked_at: string | null;
  failed_execution_streak: number;
  closed_sl_streak: number;
  account_total_margin_balance: number | null;
  account_total_wallet_balance: number | null;
  account_available_balance: number | null;
  account_available_usdt: number | null;
  account_available_usdc: number | null;
  account_unrealized_pnl: number | null;
  account_open_positions: number | null;
  account_margin_ratio: number | null;
  account_open_order_count: number | null;
  latest_account_state_at?: string | null;
  latest_monitor_run_at?: string | null;
  latest_monitor_status?: string;
  latest_monitor_result?: Record<string, unknown> | null;
  latest_monitor_error?: string | null;
  latest_sync_error?: string | null;
  open_binance_positions?: unknown[] | null;
  open_binance_orders?: unknown[] | null;
  pnl_snapshot?: Record<string, unknown> | null;
  stale_rows_cleaned?: number | null;
  current_position_size?: number | null;
  mark_price?: number | null;
  unrealized_pnl?: number | null;
  available_usdt?: number | null;
  available_usdc?: number | null;
  current_open_risk_pct?: number | null;
  open_positions_count?: number | null;
  latest_sync_time?: string | null;
  last_managed_exit_action?: Record<string, unknown> | null;
  binance_monitor_cron_active?: boolean | null;
  binance_monitor_cron_job_name?: string | null;
  bot_paused: boolean;
  bot_paused_reason: string | null;
  enable_usdc_margin_backup?: boolean | null;
  prefer_margin_asset?: 'USDT' | 'USDC' | string | null;
  allow_margin_assets?: string | null;
  max_retry_assets?: number | null;
  enable_profit_lock_engine?: boolean | null;
  enable_testnet_profit_lock_engine?: boolean | null;
  profit_lock_min_r?: number | null;
  profit_lock_aggressive_min_r?: number | null;
  profit_lock_buffer_r?: number | null;
  profit_lock_after_tp1?: boolean | null;
  profit_lock_before_tp1?: string | null;
  profit_lock_before_tp1_testnet_allowed?: boolean | null;
  profit_lock_max_updates_per_trade?: number | null;
  profit_lock_cooldown_minutes?: number | null;
  profit_lock_study_counters?: Record<string, unknown> | null;
  profit_lock_actions_taken?: number | null;
  profit_lock_skipped_reasons?: Record<string, unknown> | null;
  updated_at: string;
}


