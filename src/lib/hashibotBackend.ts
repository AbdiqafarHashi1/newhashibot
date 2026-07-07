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
