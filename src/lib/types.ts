export interface Package {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  duration_days: number | null;
  active: boolean;
  features: string[];
  telegram_access_required: boolean;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'cancelled';
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
  status: 'pending' | 'approved' | 'rejected' | 'converted_to_access';
  admin_note: string;
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
  direction: 'buy' | 'sell';
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
  score_breakdown: Record<string, number>;
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
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
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
  min_score: number;
  min_rr: number;
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
  status: 'pending' | 'sent_to_bridge' | 'accepted' | 'rejected' | 'filled' | 'failed' | 'cancelled';
  bridge_order_id: string;
  mt5_ticket: string;
  error_message: string;
  created_at: string;
  updated_at: string;
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
}
