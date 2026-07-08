import { supabase } from './supabase';

export type RetentionTarget = {
  table_name: string;
  timestamp_column: string;
  retention_days: number;
  archive_enabled: boolean;
  enabled: boolean;
  reason: string | null;
  rows_estimate: number;
  cutoff_at: string;
};

export type RetentionCleanupRow = RetentionTarget & {
  rows_matched: number;
  rows_archived: number;
  rows_deleted: number;
};

export type RetentionBatchResult = {
  table_name: string | null;
  expired_before: string | null;
  archived_count: number;
  deleted_count: number;
  remaining_expired: number;
  batch_limited: boolean;
  next_recommended_action: string;
};

export type RetentionCleanupResult = {
  mode: 'dry_run' | 'execute';
  generated_at: string;
  archive: boolean;
  targets: RetentionCleanupRow[];
  totals: { matched: number; archived: number; deleted: number };
  batch_result?: RetentionBatchResult | null;
};

export type RuntimeHealthSummary = {
  generated_at: string;
  scanner: Record<string, unknown>;
  execution: Record<string, unknown>;
  providers: Record<string, unknown>[];
  queues: Record<string, unknown>;
};

function unwrapRpc<T>(result: { data: T | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function getRetentionReport() {
  return unwrapRpc<RetentionCleanupResult>(await supabase.rpc('hashibot_retention_report'));
}

export async function previewRetentionCleanup() {
  return unwrapRpc<RetentionCleanupResult>(await supabase.rpc('hashibot_cleanup_noncritical', { p_execute: false, p_archive: true }));
}

export async function executeRetentionCleanup({ archive = true, batchSize = 5000 }: { archive?: boolean; batchSize?: number } = {}) {
  return unwrapRpc<RetentionCleanupResult>(await supabase.rpc('hashibot_cleanup_noncritical', { p_execute: true, p_archive: archive, p_batch_size: batchSize }));
}

export async function getRuntimeHealthSummary() {
  return unwrapRpc<RuntimeHealthSummary>(await supabase.rpc('hashibot_runtime_health_summary'));
}

export async function listScannerRunsCompact(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from('scanner_runs')
    .select('id,run_type,status,started_at,finished_at,symbols_scanned,signals_created,telegram_sent_count,telegram_failed_count,error_message')
    .order('started_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getScannerRuns(limit = 50) {
  return listScannerRunsCompact(limit);
}

export async function getTelegramLogs(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from('telegram_deliveries')
    .select('id,signal_id,event_id,delivery_type,destination_channel,destination_chat_id,chat_id,delivery_status,status,retry_count,telegram_message_id,success,error_message,created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAuditLogs(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,actor_user_id,action,entity_type,entity_id,metadata,telegram_sent,created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPerformanceSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_performance_summary'));
}

export async function getProviderOperationsSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_provider_operations_summary'));
}

export async function getTradingBrainSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_trading_brain_summary'));
}

export async function getSignalsManagerSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_signals_manager_summary'));
}

export async function getScannerCandidates(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from('strategy_candidates')
    .select('id,symbol,market_type,timeframe,strategy_name,direction,confidence_score,grade,status,rejection_reason,created_at')
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCandidates(limit = 50) {
  return getScannerCandidates(limit);
}

export async function getRetentionStatus() {
  return getRetentionReport();
}

export async function getStorageReport() {
  return getRetentionReport();
}

export async function getRejectedSetups(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from('strategy_candidates')
    .select('id,symbol,market_type,timeframe,strategy_name,confidence_score,grade,rejection_reason,created_at')
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProviderHealthSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_provider_health_summary'));
}

export async function getProviderComparisonSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_provider_comparison_summary'));
}

export async function getOutcomeTrackingSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_outcome_tracking_summary'));
}

export async function getTelegramStatus() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_telegram_status'));
}

export async function getExecutionSummary() {
  return unwrapRpc<Record<string, unknown>>(await supabase.rpc('hashibot_execution_summary'));
}
