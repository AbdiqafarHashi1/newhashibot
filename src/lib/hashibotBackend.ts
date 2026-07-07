import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompactScannerRun {
  id: string;
  status: string;
  run_type: string;
  started_at: string;
  finished_at: string | null;
  symbols_scanned: number;
  signals_created: number;
  candidates_found: number;
  telegram_sent_count: number;
  market_mode: string;
  error_message: string;
}

export interface CompactSignal {
  id: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  direction: string;
  strategy_name: string;
  grade: string;
  confidence_score: number;
  risk_reward: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export interface CompactExecutionOrder {
  id: string;
  signal_id: string | null;
  symbol: string;
  direction: string;
  execution_provider: string | null;
  status: string;
  lifecycle_state: string | null;
  protection_status: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  volume: number;
  created_at: string;
  updated_at: string;
}

export interface ProtectionSummary {
  total_positions: number;
  protected_count: number;
  unprotected_count: number;
  recovery_required_count: number;
  failed_repairs_count: number;
  orphan_positions_count: number;
  missing_sl_tp_count: number;
  last_protection_scan: string | null;
}

export interface RetentionReportRow {
  table_name: string;
  display_name: string;
  retention_days: number;
  is_enabled: boolean;
  is_protected: boolean;
  total_rows: number;
  expired_rows: number;
  last_run_at: string | null;
  last_rows_affected: number | null;
}

export interface SymbolUniverseGroup {
  id: string;
  group_name: string;
  display_name: string;
  market_type: string;
  symbols: string[];
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
  description: string;
}

export interface FeatureFlag {
  flag_name: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  category: string;
}

export interface HashiBridgeRegistry {
  id: string;
  bridge_id: string;
  user_id: string | null;
  device_name: string;
  mt5_account_number: string;
  mt5_server: string;
  capital_mode: string;
  bridge_status: string;
  last_heartbeat_at: string | null;
  validation_status: string;
  is_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

const SCANNER_RUN_COLUMNS = 'id,status,run_type,started_at,finished_at,symbols_scanned,signals_created,candidates_found,telegram_sent_count,market_mode,error_message' as const;

export async function getScannerRunsCompact(limit = 20): Promise<CompactScannerRun[]> {
  const { data, error } = await supabase
    .from('scanner_runs')
    .select(SCANNER_RUN_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return (data ?? []) as CompactScannerRun[];
}

export async function getScannerRunById(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('scanner_runs')
    .select('id,status,run_type,started_at,finished_at,symbols_scanned,signals_created,candidates_found,telegram_sent_count,market_mode,error_message,strategy_evaluation_summary')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

const SIGNAL_COLUMNS = 'id,symbol,market_type,timeframe,direction,strategy_name,grade,confidence_score,risk_reward,entry_low,entry_high,stop_loss,tp1,tp2,status,created_at,expires_at' as const;

export async function getSignalsCompact(limit = 50, offset = 0): Promise<{ data: CompactSignal[]; total: number }> {
  const { data, error, count } = await supabase
    .from('signals')
    .select(SIGNAL_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: (data ?? []) as CompactSignal[], total: count ?? 0 };
}

export async function getActiveSignalsCompact(): Promise<CompactSignal[]> {
  const { data, error } = await supabase
    .from('signals')
    .select(SIGNAL_COLUMNS)
    .in('status', ['waiting', 'active', 'tp1_hit', 'tp2_hit'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as CompactSignal[];
}

// ─── Execution ────────────────────────────────────────────────────────────────

const EXECUTION_ORDER_COLUMNS = 'id,signal_id,symbol,direction,execution_provider,status,lifecycle_state,protection_status,entry_price,stop_loss,tp1,tp2,volume,created_at,updated_at' as const;

export async function getExecutionOrdersCompact(limit = 50, offset = 0): Promise<{ data: CompactExecutionOrder[]; total: number }> {
  const { data, error, count } = await supabase
    .from('execution_orders')
    .select(EXECUTION_ORDER_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: (data ?? []) as CompactExecutionOrder[], total: count ?? 0 };
}

export async function getActiveExecutionOrders(): Promise<CompactExecutionOrder[]> {
  const { data, error } = await supabase
    .from('execution_orders')
    .select(EXECUTION_ORDER_COLUMNS)
    .in('status', ['entry_submitted', 'entry_filled', 'protected', 'protected_managed', 'pending_protection', 'protection_pending', 'partially_closed'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as CompactExecutionOrder[];
}

// ─── Protection ───────────────────────────────────────────────────────────────

export async function getProtectionSummary(): Promise<ProtectionSummary> {
  const { data, error } = await supabase.rpc('get_protection_summary');
  if (error) throw error;
  return (data ?? {
    total_positions: 0,
    protected_count: 0,
    unprotected_count: 0,
    recovery_required_count: 0,
    failed_repairs_count: 0,
    orphan_positions_count: 0,
    missing_sl_tp_count: 0,
    last_protection_scan: null,
  }) as ProtectionSummary;
}

export async function getProtectionEventsCompact(limit = 30): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('protection_events')
    .select('id,execution_order_id,provider,symbol,event_type,protection_status,has_sl,has_tp,is_orphan,recovery_required,repair_attempted,repair_succeeded,error_message,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Execution Lifecycle ──────────────────────────────────────────────────────

export async function getExecutionLifecycleSummary(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_execution_lifecycle_summary');
  if (error) throw error;
  return data ?? [];
}

export async function getLifecycleEventsCompact(limit = 30): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('execution_lifecycle_events')
    .select('id,execution_order_id,provider,symbol,lifecycle_state,previous_state,event_type,event_message,telegram_sent,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Retention ────────────────────────────────────────────────────────────────

export async function getRetentionReport(): Promise<RetentionReportRow[]> {
  const { data, error } = await supabase.rpc('get_retention_report');
  if (error) throw error;
  return (data ?? []) as RetentionReportRow[];
}

export async function runRetentionDryRun(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('run_retention_dry_run');
  if (error) throw error;
  return data ?? [];
}

export async function runRetentionCleanup(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('run_retention_cleanup');
  if (error) throw error;
  return data ?? [];
}

// ─── Symbol Universe ──────────────────────────────────────────────────────────

export async function getSymbolUniverseGroups(): Promise<SymbolUniverseGroup[]> {
  const { data, error } = await supabase
    .from('symbol_universe_groups')
    .select('id,group_name,display_name,market_type,symbols,is_enabled,is_default,sort_order,description')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SymbolUniverseGroup[];
}

export async function getEnabledUniverseGroup(): Promise<SymbolUniverseGroup | null> {
  const { data, error } = await supabase
    .from('scanner_config')
    .select('enabled_universe_group')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const groupName = data?.enabled_universe_group ?? 'crypto_core';
  const { data: group, error: groupError } = await supabase
    .from('symbol_universe_groups')
    .select('id,group_name,display_name,market_type,symbols,is_enabled,is_default,sort_order,description')
    .eq('group_name', groupName)
    .maybeSingle();
  if (groupError) throw groupError;
  return group as SymbolUniverseGroup | null;
}

export async function updateEnabledUniverseGroup(groupName: string): Promise<void> {
  const { error } = await supabase
    .from('scanner_config')
    .update({ enabled_universe_group: groupName })
    .eq('id', 1);
  if (error) throw error;
}

export async function getScannedSymbolCount(): Promise<number> {
  const { data, error } = await supabase
    .from('scanner_runs')
    .select('symbols_scanned')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.symbols_scanned ?? 0;
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('flag_name,display_name,description,is_enabled,category')
    .order('category', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FeatureFlag[];
}

export async function getFeatureFlag(flagName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('is_enabled')
    .eq('flag_name', flagName)
    .maybeSingle();
  if (error) throw error;
  return data?.is_enabled ?? false;
}

export async function updateFeatureFlag(flagName: string, isEnabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('feature_flags')
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq('flag_name', flagName);
  if (error) throw error;
}

// ─── HashiBridge ──────────────────────────────────────────────────────────────

export async function getHashiBridgeRegistry(): Promise<HashiBridgeRegistry[]> {
  const { data, error } = await supabase
    .from('hashibridge_registry')
    .select('id,bridge_id,user_id,device_name,mt5_account_number,mt5_server,capital_mode,bridge_status,last_heartbeat_at,validation_status,is_enabled,metadata,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HashiBridgeRegistry[];
}

export async function getHashiBridgeCommandQueue(bridgeId?: string): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from('hashibridge_command_queue')
    .select('id,bridge_id,command_type,command_payload,status,result,error_message,created_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (bridgeId) query = query.eq('bridge_id', bridgeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Telegram ──────────────────────────────────────────────────────────────────

export async function getTelegramDeliveriesCompact(limit = 30, offset = 0): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { data, error, count } = await supabase
    .from('telegram_deliveries')
    .select('id,signal_id,delivery_type,chat_id,status,telegram_message_id,error_message,destination_channel,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Candidates ───────────────────────────────────────────────────────────────

export async function getStrategyCandidatesCompact(limit = 50, offset = 0): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { data, error, count } = await supabase
    .from('strategy_candidates')
    .select('id,symbol,market_type,timeframe,strategy_name,direction,confidence_score,grade,status,rejection_reason,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Provider Status ──────────────────────────────────────────────────────────

export async function getProviderStatusCompact(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('provider_status')
    .select('id,provider_name,market_type,status,last_success_at,last_error_at,error_message,data_source_label,updated_at')
    .order('provider_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Scanner Config ───────────────────────────────────────────────────────────

export async function getScannerConfigCompact(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('scanner_config')
    .select('id,is_enabled,schedule_enabled,scan_interval_minutes,active_timeframes,scan_crypto_enabled,scan_forex_enabled,auto_send_telegram,min_auto_send_grade,heartbeat_status,heartbeat_updated_at,enabled_universe_group,persist_candles_enabled,persist_indicators_enabled,max_scanner_runs_retention_days,max_strategy_candidates_retention_days')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Strategy Configs ────────────────────────────────────────────────────────

export async function getStrategyConfigsCompact(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('strategy_configs')
    .select('id,strategy_name,enabled,market_type,signal_style,risk_mode,min_score,min_rr,max_active_signals,one_active_signal_per_symbol,allowed_timeframes,created_at,updated_at')
    .order('strategy_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Mode Configs ────────────────────────────────────────────────────────────

export async function getModeConfigsCompact(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('mode_configs')
    .select('id,slug,display_name,description,is_enabled,paper_execution_enabled,max_active_signals,allowed_timeframes,created_at,updated_at')
    .order('slug', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Symbols ──────────────────────────────────────────────────────────────────

export async function getSymbolsCompact(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('symbols')
    .select('id,symbol,display_name,market_type,provider,is_active,created_at')
    .order('market_type', { ascending: true })
    .order('symbol', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function getSymbolCount(): Promise<number> {
  const { count, error } = await supabase
    .from('symbols')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (error) throw error;
  return count ?? 0;
}

// ─── Candle Count (count-only, no row data) ──────────────────────────────────

export async function getCandleCount(): Promise<number> {
  const { count, error } = await supabase
    .from('candles')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// ─── Signal Count (count-only) ───────────────────────────────────────────────

export async function getActiveSignalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']);
  if (error) throw error;
  return count ?? 0;
}

// ─── Candidate Count (count-only) ────────────────────────────────────────────

export async function getCandidateCount(): Promise<number> {
  const { count, error } = await supabase
    .from('strategy_candidates')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// ─── User Count (count-only) ────────────────────────────────────────────────

export async function getUserCount(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// ─── Latest Forex Scanner Run ────────────────────────────────────────────────

export async function getLatestForexScannerRun(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('scanner_runs')
    .select('id,started_at,finished_at,forex_symbols_scanned,market_mode,status')
    .gt('forex_symbols_scanned', 0)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Signal Updates ──────────────────────────────────────────────────────────

export async function getSignalUpdatesCompact(limit = 30): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('signal_updates')
    .select('id,signal_id,message,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Outcome Telegram Deliveries ─────────────────────────────────────────────

export async function getOutcomeTelegramDeliveries(limit = 50): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('telegram_deliveries')
    .select('id,signal_id,delivery_type,chat_id,status,error_message,created_at')
    .like('delivery_type', 'outcome_%')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Paper Execution Intent Count ────────────────────────────────────────────

export async function getPaperIntentCount(): Promise<{ total: number; blocked: number }> {
  const [totalRes, blockedRes] = await Promise.all([
    supabase.from('paper_execution_intents').select('id', { count: 'exact', head: true }),
    supabase.from('paper_execution_intents').select('id', { count: 'exact', head: true }).eq('risk_check_passed', false),
  ]);
  return {
    total: totalRes.count ?? 0,
    blocked: blockedRes.count ?? 0,
  };
}

// ─── Rejected Candidates ─────────────────────────────────────────────────────

export async function getRejectedCandidatesCompact(limit = 50, offset = 0): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { data, error, count } = await supabase
    .from('strategy_candidates')
    .select('id,symbol,market_type,timeframe,strategy_name,direction,confidence_score,grade,rejection_reason,created_at', { count: 'exact' })
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Provider Parity Audit ───────────────────────────────────────────────────

export async function getProviderParityAuditCompact(limit = 50): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('provider_parity_audit')
    .select('id,provider,symbol,binance_tradable,bybit_tradable,parity_status,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Provider Execution Performance ──────────────────────────────────────────

export async function getProviderExecutionPerformance(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('provider_execution_performance')
    .select('id,provider_name,total_orders,successful_orders,failed_orders,success_rate,created_at')
    .order('provider_name', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ─── Execution Provider Controls ─────────────────────────────────────────────

export async function getExecutionProviderControls(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('execution_provider_controls')
    .select('id,provider_name,is_enabled,primary_provider,parallel_mode_enabled,updated_at')
    .order('provider_name', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ─── Execution Provider Global Controls ──────────────────────────────────────

export async function getExecutionProviderGlobalControls(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('execution_provider_global_controls')
    .select('id,primary_provider,parallel_mode_enabled,mirror_required_for_vip,execute_supported_provider_only,live_trading_enabled,updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Provider Symbol Cache ───────────────────────────────────────────────────

export async function getProviderSymbolCacheCompact(limit = 200): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('provider_symbol_cache')
    .select('provider,symbol,status')
    .in('provider', ['binance', 'bybit'])
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw error;
  return data ?? [];
}

// ─── Execution Monitor Heartbeats ────────────────────────────────────────────

export async function getExecutionMonitorHeartbeats(limit = 30): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('execution_monitor_heartbeats')
    .select('id,provider,started_at,finished_at,status,error_message')
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Execution Monitor Schedules ────────────────────────────────────────────

export async function getExecutionMonitorSchedules(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('execution_monitor_schedules')
    .select('id,provider,cron_expression,is_enabled,last_run_at,next_run_at')
    .order('provider', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ─── Active Trade Management Truth ───────────────────────────────────────────

export async function getActiveTradeManagementTruth(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('active_trade_management_truth')
    .select('provider,symbol,side,qty,entry_price,stop_loss,take_profit,latest_sync_at')
    .in('provider', ['binance', 'bybit'])
    .order('latest_sync_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

// ─── Replay Datasets ─────────────────────────────────────────────────────────

export async function getReplayDatasetsCompact(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('replay_datasets')
    .select('id,name,description,symbol,timeframe,candle_count,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ─── Telegram Admin Deliveries ──────────────────────────────────────────────

export async function getTelegramAdminDeliveries(limit = 50): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('telegram_deliveries')
    .select('id,signal_id,delivery_type,chat_id,status,error_message,destination_channel,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

// ─── Signals with Filters ────────────────────────────────────────────────────

export async function getSignalsFiltered(limit = 50, offset = 0, statusFilter?: string, marketFilter?: string): Promise<{ data: Record<string, unknown>[]; total: number }> {
  let query = supabase
    .from('signals')
    .select('id,symbol,market_type,timeframe,direction,strategy_name,grade,confidence_score,risk_reward,entry_low,entry_high,stop_loss,tp1,tp2,status,created_at,expires_at', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);
  if (marketFilter && marketFilter !== 'all') query = query.eq('market_type', marketFilter);
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Scanner Config Telegram Fields ─────────────────────────────────────────

export async function getScannerConfigTelegramFields(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('scanner_config')
    .select('allow_demo_telegram_sending,auto_send_telegram,min_auto_send_grade,min_signal_grade')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Scanner Config Schedule Fields ─────────────────────────────────────────

export async function getScannerConfigScheduleFields(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('scanner_config')
    .select('auto_send_telegram,schedule_enabled,cron_job_active')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Execution Settings Monitor Fields ───────────────────────────────────────

export async function getExecutionSettingsMonitorFields(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('execution_settings')
    .select('id,execution_mode,testnet_enabled,live_trading_enabled,kill_switch_enabled,auto_execute_testnet,max_open_testnet_positions,bot_paused,bot_paused_reason,latest_monitor_run_at,latest_monitor_status,latest_monitor_error')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
