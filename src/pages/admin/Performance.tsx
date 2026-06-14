import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { getMonitorTruth } from '../../lib/monitorTruth';
import { gradeBadge, directionBadge } from '../../components/ui/Badge';
import { RefreshCw, TrendingUp, TrendingDown, Minus, BarChart2, AlertTriangle, Shield, Activity } from 'lucide-react';
import { DEFAULT_CAPITAL_ASSUMPTIONS, estimateCapitalFromR, formatMoney, formatPct, validCapitalAssumptions, CapitalAssumptions } from '../../lib/capitalAnalytics';
import { calculateOpportunityRankScore, classifyStrategySurvival, classifySymbolQuality, correlationGroup, correlationPenalty, customerSpamScore } from '../../lib/capitalHardness';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignalAnalyticsRow {
  signal_id: string;
  strategy_name: string | null;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  market_type: string;
  data_source: string | null;
  current_status: string;
  outcome_category: string;
  r_result: number | null;
  close_price: number | null;
  closed_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
}

interface ExecutionOrderRow {
  id: string;
  signal_id: string | null;
  symbol: string;
  direction: string;
  execution_mode: string | null;
  status: string;
  latest_auto_skip_reason: string | null;
  error_message: string | null;
  last_exchange_error: string | null;
  latest_monitor_error: string | null;
  latest_sync_error: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  entry_order_id: string | null;
  binance_entry_order_id: string | null;
  sl_algo_id: string | null;
  tp1_algo_id: string | null;
  tp2_algo_id: string | null;
  binance_sl_order_id: string | null;
  binance_tp1_order_id: string | null;
  binance_tp2_order_id: string | null;
  entry_filled_at: string | null;
  protection_submitted_at: string | null;
  protected_at: string | null;
  protection_status: string | null;
  bracket_mode: string | null;
  native_protection_verified: boolean | null;
  managed_fallback_active: boolean | null;
  current_position_size: number | null;
  remaining_quantity: number | null;
  remaining_qty?: number | null;
  runner_active?: boolean | null;
  profit_lock_sl_active?: boolean | null;
  tp1_filled?: boolean | null;
  tp1_closed_at: string | null;
  tp2_closed_at: string | null;
  sl_closed_at: string | null;
  timeout_closed_at: string | null;
  stale_checked_at: string | null;
  stale_cleanup_reason: string | null;
  last_monitor_action: string | null;
  latest_mark_price: number | null;
  latest_unrealized_pnl: number | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionSettingsRow {
  latest_monitor_run_at: string | null;
  latest_monitor_status: string | null;
  latest_monitor_result: Record<string, unknown> | null;
  latest_monitor_error: string | null;
  latest_sync_error: string | null;
  open_binance_positions: Array<Record<string, unknown>> | null;
  open_binance_orders: Array<Record<string, unknown>> | null;
  stale_rows_cleaned: number | null;
  open_positions_count: number | null;
  latest_sync_time: string | null;
  latest_account_state_at: string | null;
}

interface ExecutionEventLogRow {
  event_type: string;
  message: string;
  created_at: string;
}

interface Filters {
  market: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  outcome: string;
  datePreset: DatePreset;
  customStart: string;
  customEnd: string;
}

interface ResetCountRow {
  table_name: string;
  deleted_count: number;
  status?: string;
}

type ResetRemainingCounts = Record<string, number>;

type ResetResponse = {
  completed_at?: string;
  timestamp?: string;
  success?: boolean;
  has_more?: boolean;
  step?: string;
  deleted_count?: number;
  deleted_counts?: Record<string, { deleted_count?: number; status?: string } | number | string>;
  remaining_counts?: ResetRemainingCounts;
};

type DatePreset = 'today' | 'last24h' | 'last7d' | 'last30d' | 'baseline' | 'custom';

type MetricSummary = {
  totalSignals: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  expired: number;
  tp1Hits: number;
  tp2Hits: number;
  slHits: number;
  winRatePct: number | null;
  profitFactor: number | null;
  totalR: number | null;
  avgR: number | null;
  bestR: number | null;
  worstR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  lastSignalTime: string | null;
};

type BreakdownRow = MetricSummary & {
  key: string;
  label: string;
  rows: SignalAnalyticsRow[];
  market?: string;
  mostUsedStrategy?: string | null;
};

interface StrategyConfigRow {
  strategy_name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESET_CONFIRMATION_TEXT = 'RESET PERFORMANCE HISTORY';
const BASELINE_STORAGE_KEY = 'hashibot.adminPerformance.baselineStartedAt';
const CAPITAL_STORAGE_KEY = 'hashibot.adminPerformance.capitalAssumptions';
const REQUIRED_STRATEGIES = [
  'MicroScalper',
  'CompressionBreakout',
  'SwingContinuation',
  'ForexMicroScalper',
  'ForexSwingContinuation',
];

const OUTCOME_COLORS: Record<string, string> = {
  WIN: 'text-emerald-400',
  LOSS: 'text-red-400',
  EXPIRED: 'text-zinc-500',
  OPEN: 'text-blue-400',
  CANCELLED: 'text-zinc-600',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────



function resetRowsFromResponse(data: unknown): ResetCountRow[] {
  const payload = (data ?? {}) as ResetResponse;
  const counts = payload.deleted_counts ?? {};
  return Object.entries(counts).map(([table_name, value]) => {
    if (typeof value === 'number') return { table_name, deleted_count: value, status: 'deleted' };
    if (typeof value === 'string') return { table_name, deleted_count: 0, status: value };
    return { table_name, deleted_count: Number(value?.deleted_count ?? 0), status: value?.status };
  });
}

function mergeResetRows(existing: ResetCountRow[], next: ResetCountRow[]) {
  const merged = new Map<string, ResetCountRow>();
  [...existing, ...next].forEach(row => {
    const current = merged.get(row.table_name);
    merged.set(row.table_name, {
      table_name: row.table_name,
      deleted_count: (current?.deleted_count ?? 0) + row.deleted_count,
      status: row.status ?? current?.status,
    });
  });
  return Array.from(merged.values());
}

function normalizeResetBatch(data: unknown, rows: ResetCountRow[]): { rows: ResetCountRow[]; timestamp: string; remainingCounts: ResetRemainingCounts; hasMore: boolean; success: boolean; step: string; deletedCount: number } {
  const payload = (data ?? {}) as ResetResponse;
  const remainingCounts = payload.remaining_counts ?? {};
  const success = payload.success === true;
  return {
    rows,
    timestamp: payload.completed_at ?? payload.timestamp ?? new Date().toISOString(),
    remainingCounts,
    hasMore: Boolean(payload.has_more),
    success,
    step: payload.step ?? 'unknown',
    deletedCount: Number(payload.deleted_count ?? 0),
  };
}

function getStoredCapitalAssumptions(): CapitalAssumptions {
  if (typeof window === 'undefined') return DEFAULT_CAPITAL_ASSUMPTIONS;
  try {
    const raw = window.localStorage.getItem(CAPITAL_STORAGE_KEY);
    if (!raw) return DEFAULT_CAPITAL_ASSUMPTIONS;
    const parsed = JSON.parse(raw) as Partial<CapitalAssumptions>;
    return validCapitalAssumptions({
      startingCapital: Number(parsed.startingCapital),
      riskPct: Number(parsed.riskPct),
    });
  } catch {
    return DEFAULT_CAPITAL_ASSUMPTIONS;
  }
}

function rValuesByCreatedAt(rows: SignalAnalyticsRow[]) {
  return [...rows]
    .filter(row => row.r_result !== null && row.r_result !== undefined && !Number.isNaN(Number(row.r_result)))
    .sort((a, b) => new Date(a.closed_at ?? a.created_at).getTime() - new Date(b.closed_at ?? b.created_at).getTime())
    .map(row => Number(row.r_result));
}

function capitalForRows(rows: SignalAnalyticsRow[], assumptions: CapitalAssumptions) {
  return estimateCapitalFromR(rValuesByCreatedAt(rows), assumptions);
}

function CapitalText({ estimate }: { estimate: ReturnType<typeof estimateCapitalFromR> }) {
  const color = (estimate.estimatedPnl ?? 0) > 0 ? 'text-emerald-400' : (estimate.estimatedPnl ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400';
  if (estimate.estimatedPnl === null) return <span className="text-zinc-500">—</span>;
  return <span className={color}>{formatPct(estimate.totalReturnPct, true)} / {formatMoney(estimate.estimatedPnl)}</span>;
}

function getStoredBaselineTimestamp() {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(BASELINE_STORAGE_KEY);
  return stored && !Number.isNaN(new Date(stored).getTime()) ? stored : null;
}

function initialFilters(): Filters {
  const baselineStartedAt = getStoredBaselineTimestamp();
  return {
    market: 'crypto',
    strategy: '',
    symbol: '',
    timeframe: '',
    direction: '',
    grade: '',
    outcome: '',
    datePreset: baselineStartedAt ? 'baseline' : 'last30d',
    customStart: '',
    customEnd: '',
  };
}

function fmtR(n: number | null | undefined, empty = '—') {
  if (n === null || n === undefined || Number.isNaN(n)) return <span className="text-zinc-500">{empty}</span>;
  const color = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400';
  return <span className={color}>{n > 0 ? '+' : ''}{n.toFixed(2)}R</span>;
}

function fmtSignalR(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return <span className="text-zinc-500">open</span>;
  return fmtR(n);
}

function fmtPF(pf: number | null | undefined) {
  if (pf === null || pf === undefined || Number.isNaN(pf)) return <span className="text-zinc-500">—</span>;
  if (!Number.isFinite(pf)) return <span className="text-emerald-400">∞</span>;
  const color = pf >= 1.5 ? 'text-emerald-400' : pf >= 1 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{pf.toFixed(2)}</span>;
}

function fmtWinRate(wr: number | null | undefined) {
  if (wr === null || wr === undefined || Number.isNaN(wr)) return <span className="text-zinc-500">—</span>;
  const color = wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{wr.toFixed(1)}%</span>;
}

function fmtDuration(mins: number | null | undefined) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
}

function forexDecimals(symbol: string) {
  return symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase().endsWith('JPY') ? 3 : 5;
}

function fmtPrice(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return n >= 100 ? n.toFixed(2) : n.toFixed(5);
}

function fmtMarketPrice(row: SignalAnalyticsRow, n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  if (row.market_type === 'forex') return n.toFixed(forexDecimals(row.symbol));
  return fmtPrice(n);
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRangeForFilters(filters: Filters, baselineStartedAt: string | null) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;

  if (filters.datePreset === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
  } else if (filters.datePreset === 'last24h') {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'last7d') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'last30d') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'baseline' && baselineStartedAt) {
    start = new Date(baselineStartedAt);
  } else if (filters.datePreset === 'custom') {
    if (filters.customStart) {
      start = new Date(`${filters.customStart}T00:00:00`);
    }
    if (filters.customEnd) {
      end = new Date(`${filters.customEnd}T23:59:59.999`);
    }
  }

  return { start, end };
}

function isWinLoss(row: SignalAnalyticsRow) {
  return row.outcome_category === 'WIN' || row.outcome_category === 'LOSS';
}


function normalizedSignalStatus(row: SignalAnalyticsRow) {
  return (row.outcome_category || 'OPEN').toUpperCase();
}

function hasFilledEntry(row: ExecutionOrderRow) {
  if (row.entry_filled_at) return true;
  return ['entry_filled', 'protected', 'protected_native', 'protected_managed', 'pending_protection', 'pending_managed_protection', 'partially_closed', 'tp1_hit', 'sl_moved_to_be', 'closed_tp', 'closed_tp2', 'closed_profit_lock', 'closed_sl', 'closed_breakeven', 'closed_timeout', 'closed_expired', 'closed_expired_after_tp1', 'closed_manual', 'closed_unprotected_safety', 'closed_synced'].includes(row.status);
}

function isClosedFilledTrade(row: ExecutionOrderRow) {
  return hasFilledEntry(row) && ['closed_tp', 'closed_tp2', 'closed_profit_lock', 'closed_sl', 'closed_breakeven', 'closed_timeout', 'closed_expired', 'closed_expired_after_tp1', 'closed_manual', 'closed_unprotected_safety', 'closed_synced'].includes(row.status);
}

function hasExecutionAttempt(row: ExecutionOrderRow) {
  return row.execution_mode !== 'signal_only' || Boolean(row.entry_order_id || row.binance_entry_order_id) || row.status !== 'skipped';
}

function executionDisplayStatus(row?: ExecutionOrderRow): string {
  if (!row) return 'NOT_EXECUTED';
  const status = row.status;
  if (status === 'skipped') return 'SKIPPED';
  if (status === 'entry_submitted') return 'ENTRY_SUBMITTED';
  if (status === 'entry_timeout_cancelled') return 'ENTRY_TIMEOUT_CANCELLED';
  if (status === 'entry_filled') return 'ENTRY_FILLED';
  if (status === 'protected_native') return 'PROTECTED_NATIVE';
  if (status === 'protected_managed') return 'PROTECTED_MANAGED';
  if (status === 'closed_tp' || status === 'closed_tp2') return 'CLOSED_TP2';
  if (status === 'closed_profit_lock') return 'CLOSED_PROFIT_LOCK';
  if (status === 'closed_sl') return 'CLOSED_SL';
  if (status === 'closed_timeout' || status === 'closed_expired') return 'CLOSED_EXPIRED';
  if (status === 'closed_expired_after_tp1') return 'CLOSED_EXPIRED_AFTER_TP1';
  if (status === 'closed_manual') return 'CLOSED_MANUAL';
  if (status === 'closed_synced' || status === 'stale_closed') return 'CLOSED_SYNCED';
  if (status === 'closed_unprotected_safety') return 'CLOSED_UNPROTECTED_SAFETY';
  if (hasFilledEntry(row)) return 'ENTRY_FILLED';
  if (row.entry_order_id || row.binance_entry_order_id) return 'ENTRY_SUBMITTED';
  return status.toUpperCase();
}

function executionReason(row?: ExecutionOrderRow) {
  if (!row) return 'signal_mode_only / not_selected';
  if (row.status === 'entry_timeout_cancelled') return 'limit_entry_not_filled';
  return row.latest_auto_skip_reason || row.stale_cleanup_reason || row.last_monitor_action || row.error_message || row.last_exchange_error || '—';
}

function estimateExecutionR(row: ExecutionOrderRow): number | null {
  if (!hasFilledEntry(row)) return null;
  const entry = Number(row.entry_price);
  const stop = Number(row.stop_loss);
  const tp2 = Number(row.tp2);
  const risk = Math.abs(entry - stop);
  if (row.status === 'closed_profit_lock') return 0.3;
  if (row.status === 'closed_sl' || (row.sl_closed_at && !row.tp1_filled && !row.tp1_closed_at)) return -1;
  if (row.status === 'closed_breakeven') return 0;
  if (row.status === 'closed_tp' || row.status === 'closed_tp2' || row.tp2_closed_at) {
    return Number.isFinite(entry) && Number.isFinite(tp2) && risk > 0 ? Math.abs(tp2 - entry) / risk : null;
  }
  if (row.status === 'closed_timeout' || row.status === 'closed_expired' || row.status === 'closed_expired_after_tp1' || row.status === 'closed_manual' || row.status === 'closed_synced') return null;
  return null;
}

function calculateExecutionSummary(rows: ExecutionOrderRow[], eligibleSignals: number) {
  const attempted = rows.filter(hasExecutionAttempt);
  const filled = rows.filter(hasFilledEntry);
  const closedFilled = rows.filter(isClosedFilledTrade);
  const skipped = rows.filter(row => row.status === 'skipped');
  const timeoutCancelled = rows.filter(row => row.status === 'entry_timeout_cancelled');
  const submitted = rows.filter(row => row.entry_order_id || row.binance_entry_order_id || row.status === 'entry_submitted');
  const rRows = closedFilled.map(row => estimateExecutionR(row)).filter((value): value is number => value !== null && !Number.isNaN(value));
  const wins = closedFilled.filter(row => row.status === 'closed_tp' || row.status === 'closed_tp2' || row.status === 'closed_profit_lock' || Boolean(row.tp2_closed_at)).length;
  const losses = closedFilled.filter(row => row.status === 'closed_sl' || row.status === 'closed_unprotected_safety' || (Boolean(row.sl_closed_at) && row.status !== 'closed_profit_lock')).length;
  const positiveR = rRows.filter(r => r > 0).reduce((sum, r) => sum + r, 0);
  const negativeR = rRows.filter(r => r < 0).reduce((sum, r) => sum + r, 0);
  const skipReasonCount = (needle: string) => skipped.filter(row => (row.latest_auto_skip_reason ?? '').includes(needle)).length;
  return {
    eligibleSignals,
    executionAttempted: attempted.length,
    entrySubmitted: submitted.length,
    entryFilled: filled.length,
    closedTradeCount: closedFilled.length,
    entryTimeoutCancelled: timeoutCancelled.length,
    skippedExecutions: skipped.length,
    governorBlocked: skipReasonCount('governor'),
    botPaused: skipReasonCount('paused'),
    duplicateBlocked: skipReasonCount('duplicate'),
    sameSymbolBlocked: skipReasonCount('same_symbol'),
    riskCapBlocked: skipReasonCount('risk'),
    maxPositionBlocked: skipReasonCount('max_position'),
    missingCredentials: skipReasonCount('credential'),
    invalidSymbol: skipReasonCount('invalid_symbol'),
    protectionUnavailable: rows.filter(row => row.protection_status === 'unprotected_failed' || row.status === 'closed_unprotected_safety').length,
    wins,
    losses,
    botWinRatePct: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    botProfitFactor: positiveR > 0 && negativeR < 0 ? positiveR / Math.abs(negativeR) : positiveR > 0 && negativeR === 0 ? Number.POSITIVE_INFINITY : null,
    botTotalR: rRows.length > 0 ? rRows.reduce((sum, r) => sum + r, 0) : null,
    tp1Hits: filled.filter(row => Boolean(row.tp1_closed_at || row.tp1_filled)).length,
    tp2Hits: closedFilled.filter(row => Boolean(row.tp2_closed_at) || row.status === 'closed_tp' || row.status === 'closed_tp2').length,
    slHits: closedFilled.filter(row => row.status === 'closed_sl' || row.status === 'closed_unprotected_safety').length,
    profitLockSlHits: closedFilled.filter(row => row.status === 'closed_profit_lock').length,
    closedExpired: closedFilled.filter(row => row.status === 'closed_expired').length,
    closedExpiredAfterTp1: closedFilled.filter(row => row.status === 'closed_expired_after_tp1').length,
    closedManual: closedFilled.filter(row => row.status === 'closed_manual').length,
    openRunnerCount: filled.filter(row => row.runner_active && !isClosedFilledTrade(row)).length,
    protectedRunnerCount: filled.filter(row => row.runner_active && row.profit_lock_sl_active && !isClosedFilledTrade(row)).length,
    pendingSync: closedFilled.filter(row => estimateExecutionR(row) === null).length,
  };
}

function protectionSlaState(row: ExecutionOrderRow): 'pass' | 'fail' | 'pending' | 'n/a' {
  if (!hasFilledEntry(row) || ['closed_tp', 'closed_tp2', 'closed_profit_lock', 'closed_sl', 'closed_timeout', 'closed_expired', 'closed_expired_after_tp1', 'closed_manual', 'closed_unprotected_safety', 'closed_synced', 'stale_closed', 'cancelled', 'failed', 'skipped', 'entry_timeout_cancelled'].includes(row.status)) return 'n/a';
  if (row.protection_status === 'protected_native' || row.protection_status === 'protected_managed' || row.native_protection_verified || row.managed_fallback_active) return 'pass';
  const filledAt = row.entry_filled_at ? new Date(row.entry_filled_at).getTime() : NaN;
  if (!Number.isFinite(filledAt)) return 'pending';
  return Date.now() - filledAt > 60_000 ? 'fail' : 'pending';
}

function secondsFromFillToProtection(row: ExecutionOrderRow) {
  if (!row.entry_filled_at || !row.protected_at) return null;
  return Math.max(0, Math.round((new Date(row.protected_at).getTime() - new Date(row.entry_filled_at).getTime()) / 1000));
}

function hasNativeProtectionIds(row: ExecutionOrderRow) {
  return Boolean((row.sl_algo_id || row.binance_sl_order_id) && (row.tp1_algo_id || row.binance_tp1_order_id) && (row.tp2_algo_id || row.binance_tp2_order_id));
}


function monitorResultArray(result: Record<string, unknown>, key: string): unknown[] {
  const value = result[key];
  return Array.isArray(value) ? value : [];
}

function monitorResultCount(result: Record<string, unknown>, key: string): number {
  const value = result[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  return monitorResultArray(result, key.replace(/_count$/, '')).length;
}

function monitorCriticalStatus(status: string | null | undefined, result?: Record<string, unknown>, settings?: ExecutionSettingsRow | null): string {
  if (!status && !result) return 'never_run';
  const truth = getMonitorTruth({
    latest_monitor_run_at: settings?.latest_monitor_run_at,
    latest_account_state_at: settings?.latest_account_state_at,
    latest_monitor_status: status,
    latest_monitor_error: settings?.latest_monitor_error,
    latest_sync_error: settings?.latest_sync_error,
    latest_monitor_result: result,
  });
  return truth.level;
}

function positionSafety(row: ExecutionOrderRow) {
  if (!hasFilledEntry(row) || Number(row.current_position_size ?? row.remaining_quantity ?? 0) === 0) return 'not_open';
  if ((row.protection_status === 'protected_native' || row.native_protection_verified) && hasNativeProtectionIds(row)) return 'safe';
  if (row.protection_status === 'protected_native' && !hasNativeProtectionIds(row)) return 'unsafe_or_desynced';
  if (row.protection_status === 'protected_managed' || row.managed_fallback_active) return 'managed_fallback';
  return 'unsafe_untracked_position';
}

function calculateSummary(rows: SignalAnalyticsRow[]): MetricSummary {
  const closedRows = rows.filter(row => row.outcome_category !== 'OPEN');
  const rRows = closedRows.filter(row => row.r_result !== null && row.r_result !== undefined);
  const wins = rows.filter(row => row.outcome_category === 'WIN').length;
  const losses = rows.filter(row => row.outcome_category === 'LOSS').length;
  const positiveR = rRows.filter(row => (row.r_result ?? 0) > 0).reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const negativeR = rRows.filter(row => (row.r_result ?? 0) < 0).reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const totalR = rRows.reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const rValues = rRows.map(row => row.r_result ?? 0);
  const winLossCount = wins + losses;

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  [...rows]
    .filter(isWinLoss)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach(row => {
      if (row.outcome_category === 'WIN') {
        currentWinStreak += 1;
        currentLossStreak = 0;
      } else {
        currentLossStreak += 1;
        currentWinStreak = 0;
      }
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    });

  return {
    totalSignals: rows.length,
    closedTrades: closedRows.length,
    openTrades: rows.filter(row => row.outcome_category === 'OPEN').length,
    wins,
    losses,
    expired: rows.filter(row => row.outcome_category === 'EXPIRED').length,
    tp1Hits: rows.filter(row => row.current_status === 'tp1_hit').length,
    tp2Hits: rows.filter(row => row.current_status === 'tp2_hit').length,
    slHits: rows.filter(row => row.current_status === 'sl_hit').length,
    winRatePct: winLossCount > 0 ? (wins / winLossCount) * 100 : null,
    profitFactor: positiveR > 0 && negativeR < 0 ? positiveR / Math.abs(negativeR) : null,
    totalR: rRows.length > 0 ? totalR : null,
    avgR: rRows.length > 0 ? totalR / rRows.length : null,
    bestR: rValues.length > 0 ? Math.max(...rValues) : null,
    worstR: rValues.length > 0 ? Math.min(...rValues) : null,
    avgWinR: wins > 0 ? positiveR / wins : null,
    avgLossR: losses > 0 ? negativeR / losses : null,
    maxWinStreak,
    maxLossStreak,
    lastSignalTime: rows.reduce<string | null>((latest, row) => {
      if (!latest) return row.created_at;
      return new Date(row.created_at) > new Date(latest) ? row.created_at : latest;
    }, null),
  };
}

function groupBreakdown(rows: SignalAnalyticsRow[], getKey: (row: SignalAnalyticsRow) => string, getExtra?: (key: string, keyRows: SignalAnalyticsRow[]) => Partial<BreakdownRow>): BreakdownRow[] {
  const groups = new Map<string, SignalAnalyticsRow[]>();
  rows.forEach(row => {
    const key = getKey(row) || '—';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.entries()].map(([key, keyRows]) => ({
    key,
    label: key,
    rows: keyRows,
    ...calculateSummary(keyRows),
    ...(getExtra?.(key, keyRows) ?? {}),
  })).sort((a, b) => b.totalSignals - a.totalSignals || a.label.localeCompare(b.label));
}

function mostUsedStrategy(rows: SignalAnalyticsRow[]) {
  const counts = new Map<string, number>();
  rows.forEach(row => counts.set(row.strategy_name ?? 'unnamed', (counts.get(row.strategy_name ?? 'unnamed') ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-zinc-100 leading-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-zinc-500">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DatePresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-blue-600/20 border-blue-500/60 text-blue-200' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'}`}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Performance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState<SignalAnalyticsRow[]>([]);
  const [executionOrders, setExecutionOrders] = useState<ExecutionOrderRow[]>([]);
  const [executionSettings, setExecutionSettings] = useState<ExecutionSettingsRow | null>(null);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEventLogRow[]>([]);
  const [configuredStrategies, setConfiguredStrategies] = useState<string[]>(REQUIRED_STRATEGIES);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [baselineStartedAt, setBaselineStartedAt] = useState<string | null>(() => getStoredBaselineTimestamp());
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetResult, setResetResult] = useState<{ rows: ResetCountRow[]; timestamp: string; remainingCounts: ResetRemainingCounts; hasMore: boolean; success: boolean; step: string; deletedCount: number } | null>(null);
  const [resetProgress, setResetProgress] = useState('');
  const [capitalAssumptions, setCapitalAssumptions] = useState<CapitalAssumptions>(() => getStoredCapitalAssumptions());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sigRes, stratConfigRes, execRes, settingsRes, eventRes] = await Promise.all([
        supabase.from('signal_analytics_view')
          .select('signal_id,strategy_name,symbol,market_type,timeframe,direction,grade,data_source,current_status,outcome_category,r_result,close_price,closed_at,duration_minutes,created_at,entry_price,stop_loss,tp1,tp2')
          .eq('data_source', 'REAL DATA')
          .neq('outcome_category', 'CANCELLED')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('strategy_configs').select('strategy_name').order('strategy_name'),
        supabase.from('execution_orders')
          .select('id,signal_id,symbol,direction,execution_mode,status,latest_auto_skip_reason,error_message,last_exchange_error,latest_monitor_error,latest_sync_error,entry_price,stop_loss,tp1,tp2,entry_order_id,binance_entry_order_id,sl_algo_id,tp1_algo_id,tp2_algo_id,binance_sl_order_id,binance_tp1_order_id,binance_tp2_order_id,entry_filled_at,protection_submitted_at,protected_at,protection_status,bracket_mode,native_protection_verified,managed_fallback_active,current_position_size,remaining_quantity,remaining_qty,runner_active,profit_lock_sl_active,tp1_filled,tp2_filled,tp1_closed_at,tp2_closed_at,sl_closed_at,timeout_closed_at,stale_checked_at,stale_cleanup_reason,last_monitor_action,latest_mark_price,latest_unrealized_pnl,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('execution_settings')
          .select('latest_monitor_run_at,latest_monitor_status,latest_monitor_result,latest_monitor_error,latest_sync_error,latest_account_state_at,open_binance_positions,open_binance_orders,stale_rows_cleaned,open_positions_count,latest_sync_time')
          .eq('id', 1)
          .maybeSingle(),
        supabase.from('execution_event_logs')
          .select('event_type,message,created_at')
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);

      if (sigRes.error) throw new Error(sigRes.error.message);
      if (stratConfigRes.error) throw new Error(stratConfigRes.error.message);
      if (execRes.error) throw new Error(execRes.error.message);
      if (settingsRes.error) throw new Error(settingsRes.error.message);
      if (eventRes.error) throw new Error(eventRes.error.message);

      setSignals((sigRes.data ?? []) as SignalAnalyticsRow[]);
      setExecutionOrders((execRes.data ?? []) as ExecutionOrderRow[]);
      setExecutionSettings((settingsRes.data ?? null) as ExecutionSettingsRow | null);
      setExecutionEvents((eventRes.data ?? []) as ExecutionEventLogRow[]);
      const names = new Set(REQUIRED_STRATEGIES);
      ((stratConfigRes.data ?? []) as StrategyConfigRow[]).forEach(row => {
        if (row.strategy_name) names.add(row.strategy_name);
      });
      setConfiguredStrategies([...names].sort());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.localStorage.setItem(CAPITAL_STORAGE_KEY, JSON.stringify(capitalAssumptions));
  }, [capitalAssumptions]);

  function setFilter(key: keyof Filters, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  function setDatePreset(datePreset: DatePreset) {
    setFilters(f => {
      const next = { ...f, datePreset };
      if (datePreset === 'custom' && !next.customStart && !next.customEnd) {
        next.customStart = toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        next.customEnd = toDateInputValue(new Date());
      }
      return next;
    });
  }

  async function handleResetTradingHistory() {
    if (resetInput !== RESET_CONFIRMATION_TEXT || resetting) return;

    setResetting(true);
    setResetError('');
    setResetProgress('Starting small-batch reset…');
    try {
      let aggregateRows: ResetCountRow[] = [];
      let normalized: ReturnType<typeof normalizeResetBatch> | null = null;

      for (let iteration = 0; iteration < 10000; iteration += 1) {
        const { data, error: rpcError } = await supabase.rpc('admin_reset_trading_history_batch', { p_batch_size: 25, p_until_empty: false });
        if (rpcError) throw new Error(rpcError.message);

        aggregateRows = mergeResetRows(aggregateRows, resetRowsFromResponse(data));
        normalized = normalizeResetBatch(data, aggregateRows);
        setResetProgress(`Batch ${iteration + 1}: ${normalized.step} deleted ${normalized.deletedCount}; ${normalized.hasMore ? 'continuing…' : 'verifying completion…'}`);

        if (normalized.success) break;
        if (!normalized.hasMore) break;
      }

      if (!normalized) throw new Error('Reset did not return a result');
      if (!normalized.success) throw new Error('Reset stopped before all performance rows were cleared. Please run reset again.');

      window.localStorage.setItem(BASELINE_STORAGE_KEY, normalized.timestamp);
      setBaselineStartedAt(normalized.timestamp);
      setFilters(f => ({ ...f, datePreset: 'baseline', customStart: '', customEnd: '' }));
      setResetResult(normalized);
      setResetInput('');
      setResetProgress('Reset complete. Refreshing Performance data…');
      await load();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to reset trading history');
    } finally {
      setResetting(false);
      setResetProgress('');
    }
  }

  const filterOpts = useMemo(() => {
    const marketScopedSignals = filters.market ? signals.filter(s => s.market_type === filters.market) : signals;
    return {
      strategies: configuredStrategies,
      symbols: [...new Set(marketScopedSignals.map(s => s.symbol).filter(Boolean))].sort(),
      timeframes: [...new Set(marketScopedSignals.map(s => s.timeframe).filter(Boolean))].sort(),
      directions: [...new Set(marketScopedSignals.map(s => s.direction).filter(Boolean))].sort(),
      grades: [...new Set(marketScopedSignals.map(s => s.grade).filter(Boolean))].sort(),
    };
  }, [configuredStrategies, signals, filters.market]);

  const { start: dateStart, end: dateEnd } = useMemo(() => dateRangeForFilters(filters, baselineStartedAt), [filters, baselineStartedAt]);

  const filteredSignals = useMemo(() => signals.filter(s => {
    const created = new Date(s.created_at);
    if (dateStart && created < dateStart) return false;
    if (dateEnd && created > dateEnd) return false;
    if (filters.market && s.market_type !== filters.market) return false;
    if (filters.strategy && (s.strategy_name ?? 'unnamed') !== filters.strategy) return false;
    if (filters.symbol && s.symbol !== filters.symbol) return false;
    if (filters.timeframe && s.timeframe !== filters.timeframe) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.grade && s.grade !== filters.grade) return false;
    if (filters.outcome && s.outcome_category !== filters.outcome) return false;
    return true;
  }), [signals, filters, dateStart, dateEnd]);

  const baselineSignals = useMemo(() => {
    if (!baselineStartedAt) return signals;
    const baselineDate = new Date(baselineStartedAt);
    return signals.filter(signal => new Date(signal.created_at) >= baselineDate);
  }, [baselineStartedAt, signals]);

  const filteredSignalIds = useMemo(() => new Set(filteredSignals.map(signal => signal.signal_id)), [filteredSignals]);
  const filteredExecutionOrders = useMemo(() => executionOrders.filter(order => {
    const created = new Date(order.created_at);
    if (dateStart && created < dateStart) return false;
    if (dateEnd && created > dateEnd) return false;
    if (order.signal_id && filteredSignalIds.has(order.signal_id)) return true;
    return !order.signal_id && !filters.symbol && !filters.strategy && !filters.timeframe && !filters.direction && !filters.grade && !filters.outcome;
  }), [executionOrders, filteredSignalIds, dateStart, dateEnd, filters.symbol, filters.strategy, filters.timeframe, filters.direction, filters.grade, filters.outcome]);
  const latestExecutionBySignalId = useMemo(() => {
    const map = new Map<string, ExecutionOrderRow>();
    filteredExecutionOrders.forEach(order => {
      if (!order.signal_id) return;
      const current = map.get(order.signal_id);
      if (!current || new Date(order.created_at) > new Date(current.created_at)) map.set(order.signal_id, order);
    });
    return map;
  }, [filteredExecutionOrders]);
  const executionSummary = useMemo(() => calculateExecutionSummary(filteredExecutionOrders, filteredSignals.length), [filteredExecutionOrders, filteredSignals.length]);
  const botHealth = useMemo(() => {
    const activeRows = filteredExecutionOrders.filter(row => hasFilledEntry(row) && !['closed_tp', 'closed_tp2', 'closed_profit_lock', 'closed_sl', 'closed_timeout', 'closed_expired', 'closed_expired_after_tp1', 'closed_manual', 'closed_unprotected_safety', 'closed_synced', 'stale_closed', 'cancelled', 'failed', 'skipped', 'entry_timeout_cancelled'].includes(row.status));
    const slaStates = activeRows.map(protectionSlaState);
    const protectionSeconds = activeRows.map(secondsFromFillToProtection).filter((value): value is number => value !== null);
    const eventText = (needle: string) => executionEvents.filter(event => `${event.event_type} ${event.message}`.toLowerCase().includes(needle)).length;
    const monitorResult = executionSettings?.latest_monitor_result ?? {};
    const monitorHttpStatus = typeof monitorResult.http_status === 'number' || typeof monitorResult.http_status === 'string' ? String(monitorResult.http_status) : '—';
    const monitorCriticalStatusValue = monitorCriticalStatus(executionSettings?.latest_monitor_status, monitorResult, executionSettings);
    const monitorWarningsCount = monitorResultCount(monitorResult, 'warnings_count');
    const monitorRowErrorsCount = monitorResultCount(monitorResult, 'row_errors_count');
    const monitorCriticalErrorsCount = monitorResultCount(monitorResult, 'critical_errors_count');
    const monitor500Count = eventText('500') + (String(monitorHttpStatus).startsWith('5') ? 1 : 0);
    return {
      activeRows,
      monitorStatus: executionSettings?.latest_monitor_status ?? 'never_run',
      monitorCriticalStatus: monitorCriticalStatusValue,
      latestMonitorHttpStatus: monitorHttpStatus,
      monitorWarningsCount,
      monitorRowErrorsCount,
      monitorCriticalErrorsCount,
      monitor500Count,
      protectedNative: filteredExecutionOrders.filter(row => row.protection_status === 'protected_native' || row.native_protection_verified).length,
      protectedManaged: filteredExecutionOrders.filter(row => row.protection_status === 'protected_managed' || row.managed_fallback_active).length,
      closedUnprotectedSafety: filteredExecutionOrders.filter(row => row.status === 'closed_unprotected_safety').length,
      unprotectedOpenPositions: activeRows.filter(row => ['fail', 'pending'].includes(protectionSlaState(row)) && positionSafety(row).startsWith('unsafe')).length,
      protectionSla: slaStates.some(state => state === 'fail') ? 'fail' : slaStates.some(state => state === 'pending') ? 'pending' : 'pass',
      avgSecondsToProtection: protectionSeconds.length > 0 ? Math.round(protectionSeconds.reduce((sum, value) => sum + value, 0) / protectionSeconds.length) : null,
      orphanOrdersCleaned: eventText('orphan'),
      staleRowsCleaned: executionSettings?.stale_rows_cleaned ?? filteredExecutionOrders.filter(row => row.status === 'stale_closed').length,
      entryTimeoutCancelled: filteredExecutionOrders.filter(row => row.status === 'entry_timeout_cancelled').length,
      manualCloseSynced: filteredExecutionOrders.filter(row => row.status === 'closed_synced' || row.status === 'stale_closed').length,
      conditionalOrdersCancelledExternally: eventText('conditional') + eventText('externally'),
      openBinancePositions: executionSettings?.open_binance_positions ?? [],
      openBinanceOrders: executionSettings?.open_binance_orders ?? [],
    };
  }, [filteredExecutionOrders, executionEvents, executionSettings]);

  const summary = useMemo(() => calculateSummary(filteredSignals), [filteredSignals]);
  const aGradeCount = useMemo(() => filteredSignals.filter(signal => signal.grade === 'A').length, [filteredSignals]);
  const aPlusGradeCount = useMemo(() => filteredSignals.filter(signal => signal.grade === 'A+').length, [filteredSignals]);
  const summaryCapital = useMemo(() => capitalForRows(filteredSignals, capitalAssumptions), [filteredSignals, capitalAssumptions]);
  const strategyBreakdown = useMemo(() => {
    const grouped = new Map(groupBreakdown(filteredSignals, row => row.strategy_name ?? 'unnamed').map(row => [row.key, row]));
    return configuredStrategies.map(strategy => grouped.get(strategy) ?? {
      key: strategy,
      label: strategy,
      rows: [],
      ...calculateSummary([]),
    });
  }, [configuredStrategies, filteredSignals]);
  const symbolBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.symbol, (_key, rows) => ({
    market: [...new Set(rows.map(row => row.market_type))].join(', '),
    mostUsedStrategy: mostUsedStrategy(rows),
  })), [filteredSignals]);
  const timeframeBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.timeframe), [filteredSignals]);
  const gradeBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.grade), [filteredSignals]);
  const expiryBreakdown = useMemo(() => groupBreakdown(filteredSignals.filter(row => row.outcome_category === 'EXPIRED'), row => row.current_status || 'expired'), [filteredSignals]);
  const riskAmount = capitalAssumptions.startingCapital * (capitalAssumptions.riskPct / 100);
  const capitalHardness = useMemo(() => {
    const closedCount = executionSummary.closedTradeCount;
    const tp1ThenBeSl = filteredExecutionOrders.filter(row => (row.tp1_filled || row.tp1_closed_at) && (row.sl_closed_at || row.status === 'closed_breakeven' || row.status === 'closed_profit_lock' || row.status === 'closed_expired_after_tp1')).length;
    const tp1ThenTp2 = filteredExecutionOrders.filter(row => (row.tp1_filled || row.tp1_closed_at) && (row.tp2_closed_at || row.status === 'closed_tp' || row.status === 'closed_tp2')).length;
    const tp1HitCount = Math.max(1, executionSummary.tp1Hits);
    const signalDays = Math.max(1, (dateEnd?.getTime() ?? Date.now()) - (dateStart?.getTime() ?? (filteredSignals.length > 0 ? new Date(filteredSignals[filteredSignals.length - 1].created_at).getTime() : Date.now()))) / (24 * 60 * 60 * 1000);
    const spamScore = customerSpamScore(filteredSignals.length / Math.max(1, signalDays), summary.openTrades, 0, executionEvents.length / Math.max(1, signalDays));
    const symbolRows = symbolBreakdown.slice(0, 8).map(row => {
      const symbolExec = filteredExecutionOrders.filter(order => order.symbol === row.key);
      const execFilled = symbolExec.filter(hasFilledEntry).length;
      const protectedCount = symbolExec.filter(order => order.native_protection_verified || order.managed_fallback_active || order.protection_status === 'protected_native' || order.protection_status === 'protected_managed').length;
      const classification = classifySymbolQuality({
        completedTrades: row.closedTrades,
        winRatePct: row.winRatePct,
        profitFactor: row.profitFactor,
        avgR: row.avgR,
        executionReliabilityPct: row.totalSignals > 0 ? (execFilled / row.totalSignals) * 100 : null,
        protectionReliabilityPct: execFilled > 0 ? (protectedCount / execFilled) * 100 : null,
      });
      const rank = calculateOpportunityRankScore({
        scannerScore: 70,
        confidence: 70,
        rr: 2,
        symbolQualityScore: classification === 'approved' ? 90 : classification === 'watchlist' ? 70 : classification === 'probation' ? 50 : 30,
        strategySurvivalScore: 60,
        regimeCompatibilityScore: 60,
        volatilityConditionScore: 60,
        recentSymbolPerformanceScore: Math.max(0, Math.min(100, 50 + (row.avgR ?? 0) * 50)),
        executionReliabilityPct: row.totalSignals > 0 ? (execFilled / row.totalSignals) * 100 : 0,
        protectionReliabilityPct: execFilled > 0 ? (protectedCount / execFilled) * 100 : 0,
        tp1ProbabilityPct: row.closedTrades > 0 ? (row.tp1Hits / row.closedTrades) * 100 : 0,
        tp2ProbabilityPct: row.closedTrades > 0 ? (row.tp2Hits / row.closedTrades) * 100 : 0,
        givebackRiskPct: tp1ThenBeSl / tp1HitCount * 100,
        correlationPenalty: correlationPenalty(0, false),
        duplicatePenalty: 0,
        completedTrades: row.closedTrades,
      });
      return { ...row, classification, rank, group: correlationGroup(row.key) };
    });
    const strategyRows = strategyBreakdown.map(row => ({
      ...row,
      survival: classifyStrategySurvival({
        completedTrades: row.closedTrades,
        winRatePct: row.winRatePct,
        profitFactor: row.profitFactor,
        avgR: row.avgR,
        slRatePct: row.closedTrades > 0 ? (row.slHits / row.closedTrades) * 100 : null,
        givebackAfterTp1R: tp1ThenBeSl / tp1HitCount,
      }),
    }));
    return {
      completedTradeObservationReady: closedCount >= 100,
      tp1ThenBeSlRate: executionSummary.tp1Hits > 0 ? (tp1ThenBeSl / executionSummary.tp1Hits) * 100 : null,
      tp1ThenTp2Rate: executionSummary.tp1Hits > 0 ? (tp1ThenTp2 / executionSummary.tp1Hits) * 100 : null,
      spamScore,
      symbolRows,
      strategyRows,
    };
  }, [dateEnd, dateStart, executionEvents.length, executionSummary, filteredExecutionOrders, filteredSignals, strategyBreakdown, summary.openTrades, symbolBreakdown]);

  const activeFilterCount = [filters.market, filters.strategy, filters.symbol, filters.timeframe, filters.direction, filters.grade, filters.outcome].filter(Boolean).length + (filters.datePreset !== (baselineStartedAt ? 'baseline' : 'last30d') || filters.customStart || filters.customEnd ? 1 : 0);
  const hasSignalsInBaseline = baselineSignals.length > 0;
  const emptyMessage = !hasSignalsInBaseline
    ? 'No tracked signals in this baseline yet. Run the scanner to begin collecting fresh results.'
    : 'No signals match this filter/date range.';

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 size={22} className="text-blue-400" />
            Performance Truth Separation
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Three separate truths: strategy signal performance, Binance testnet execution performance, and bot health/protection safety.</p>
          <p className="text-xs text-zinc-500 mt-2">
            {baselineStartedAt ? `Current baseline started: ${fmtDateTime(baselineStartedAt)}` : 'Baseline: all available trading history'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 self-start"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* ── Reset Danger Zone ── */}
      <section className="mb-8 bg-red-950/20 border border-red-900/60 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-red-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={16} /> Danger Zone
            </h2>
            <h3 className="text-base font-semibold text-zinc-100 mt-2">Reset Performance History</h3>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
              Clears signal/performance history only: Telegram delivery rows linked to signals, signal-linked execution logs/orders, signal updates, signal outcomes, signals, strategy candidates, and rejected setups. It preserves scanner settings, strategy settings, execution settings, customers, packages, subscriptions, profiles, Telegram config, bot setup records, Binance credentials, account balances, and real Binance positions/orders. It does not reset the testnet governor or disable the scanner; the next scheduled scanner run will repopulate fresh rows if setups qualify.
            </p>
            <p className="text-xs text-zinc-500 mt-3">
              Type <span className="font-mono text-red-200">{RESET_CONFIRMATION_TEXT}</span> to enable this manual reset.
            </p>
          </div>
          <div className="w-full lg:w-80 space-y-2">
            <input
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder={RESET_CONFIRMATION_TEXT}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-500 text-zinc-100 text-xs rounded-lg px-3 py-2 outline-none"
              disabled={resetting}
            />
            <button
              onClick={handleResetTradingHistory}
              disabled={resetInput !== RESET_CONFIRMATION_TEXT || resetting}
              className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {resetting && <RefreshCw size={12} className="animate-spin" />}
              Reset Performance History
            </button>
            {resetProgress && <div className="text-xs text-zinc-300 bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2">{resetProgress}</div>}
            {resetError && <div className="text-xs text-red-300 bg-red-950/50 border border-red-900/50 rounded-lg px-3 py-2">{resetError}</div>}
            {resetResult && (
              <div className="text-xs text-zinc-400 bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2 space-y-1">
                <div className="font-medium text-emerald-300">Reset Complete at {new Date(resetResult.timestamp).toLocaleString()}.</div>
                <div className="pt-1 font-medium text-zinc-300">Deleted</div>
                {resetResult.rows.map(row => (
                  <div key={row.table_name} className="flex justify-between gap-3">
                    <span className="font-mono">{row.table_name}</span>
                    <span>{row.deleted_count}{row.status ? ` (${row.status})` : ''}</span>
                  </div>
                ))}
                <div className="pt-2 font-medium text-zinc-300">Remaining</div>
                {['signals', 'telegram_deliveries_linked_to_signals', 'execution_event_logs_linked', 'execution_orders', 'signal_updates', 'signal_outcomes', 'strategy_candidates', 'rejected_setups'].map(table => {
                  const count = resetResult.remainingCounts[table] ?? 0;
                  return (
                    <div key={table} className={`flex justify-between gap-3 ${count > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                      <span className="font-mono">{table}</span>
                      <span>{count}</span>
                    </div>
                  );
                })}
                {Object.entries(resetResult.remainingCounts).filter(([table, count]) => count > 0 && !['signals', 'telegram_deliveries_linked_to_signals', 'telegram_deliveries', 'execution_event_logs_linked', 'execution_orders', 'signal_updates', 'signal_outcomes', 'strategy_candidates', 'rejected_setups'].includes(table)).map(([table, count]) => (
                  <div key={table} className="flex justify-between gap-3 text-red-300">
                    <span className="font-mono">Responsible: {table}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <FilterSelect label="Market" value={filters.market} onChange={v => setFilter('market', v)} options={['crypto', 'forex']} />
          <FilterSelect label="Strategy" value={filters.strategy} onChange={v => setFilter('strategy', v)} options={filterOpts.strategies} />
          <FilterSelect label="Symbol" value={filters.symbol} onChange={v => setFilter('symbol', v)} options={filterOpts.symbols} />
          <FilterSelect label="Timeframe" value={filters.timeframe} onChange={v => setFilter('timeframe', v)} options={filterOpts.timeframes} />
          <FilterSelect label="Direction" value={filters.direction} onChange={v => setFilter('direction', v)} options={filterOpts.directions} />
          <FilterSelect label="Grade" value={filters.grade} onChange={v => setFilter('grade', v)} options={filterOpts.grades} />
          <FilterSelect label="Outcome" value={filters.outcome} onChange={v => setFilter('outcome', v)} options={['OPEN', 'WIN', 'LOSS', 'EXPIRED']} />
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ ...initialFilters(), datePreset: baselineStartedAt ? 'baseline' : 'last30d' })}
              className="text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-2 py-1.5 rounded-lg transition-colors"
            >
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Date range</span>
            <div className="flex flex-wrap gap-2">
              <DatePresetButton active={filters.datePreset === 'today'} onClick={() => setDatePreset('today')}>Today</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last24h'} onClick={() => setDatePreset('last24h')}>Last 24h</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last7d'} onClick={() => setDatePreset('last7d')}>Last 7 days</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last30d'} onClick={() => setDatePreset('last30d')}>Last 30 days</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'baseline'} onClick={() => setDatePreset('baseline')}>All baseline</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'custom'} onClick={() => setDatePreset('custom')}>Custom</DatePresetButton>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-zinc-500">Custom start date</label>
            <input
              type="date"
              value={filters.customStart}
              onChange={e => setFilters(f => ({ ...f, customStart: e.target.value, datePreset: 'custom' }))}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-zinc-500">Custom end date</label>
            <input
              type="date"
              value={filters.customEnd}
              onChange={e => setFilters(f => ({ ...f, customEnd: e.target.value, datePreset: 'custom' }))}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="text-xs text-zinc-600">
            Applied: {dateStart ? fmtDateTime(dateStart.toISOString()) : 'beginning'} → {dateEnd ? fmtDateTime(dateEnd.toISOString()) : 'now'}
          </div>
        </div>
      </section>

      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-300">Capital assumptions</h2>
            <p className="text-xs text-zinc-500 mt-1">Admin-only estimates for signal reporting. These do not change scanner, provider, strategy, or execution logic.</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-zinc-500">Starting capital (USD)</label>
              <input type="number" min="1" step="50" value={capitalAssumptions.startingCapital}
                onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, startingCapital: Number(e.target.value) }))}
                className="w-32 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-zinc-500">Risk per signal (%)</label>
              <input type="number" min="0.01" step="0.05" value={capitalAssumptions.riskPct}
                onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, riskPct: Number(e.target.value) }))}
                className="w-28 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
              Estimated risk / signal: <span className="font-semibold text-zinc-200">{formatMoney(riskAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {loading && signals.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Overall Performance Cards ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Strategy Signal Performance — Overall</h2>
        {filteredSignals.length === 0 && !loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 text-center text-sm text-zinc-600">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
              <StatCard label="Total Signals" value={summary.totalSignals} sub={`${summary.closedTrades} closed · ${summary.openTrades} open`} />
              <StatCard label="Closed Signals" value={summary.closedTrades} sub="resolved or expired" />
              <StatCard label="Open Signals" value={summary.openTrades} sub="awaiting outcome" />
              <StatCard label="Win Rate" value={fmtWinRate(summary.winRatePct)} sub={`${summary.wins}W / ${summary.losses}L`} />
              <StatCard label="Profit Factor" value={fmtPF(summary.profitFactor)} sub="wins vs losses only" />
              <StatCard label="Total R" value={fmtR(summary.totalR)} sub={`avg ${summary.avgR === null ? '—' : `${summary.avgR > 0 ? '+' : ''}${summary.avgR.toFixed(2)}R`} / closed`} />
              <StatCard label={`Estimated P/L @ ${capitalAssumptions.riskPct.toFixed(2)}%`} value={<CapitalText estimate={summaryCapital} />} sub={`on ${formatMoney(capitalAssumptions.startingCapital)} baseline`} />
              <StatCard label="Estimated Equity" value={formatMoney(summaryCapital.estimatedFinalCapital)} sub={`max DD est. ${formatPct(summaryCapital.maxDrawdownPct)}`} />
              <StatCard label="Average R / Closed" value={fmtR(summary.avgR)} sub={`est. ${formatPct(summaryCapital.avgReturnPct, true)} / ${formatMoney(summaryCapital.avgPnl)}`} />
              <StatCard label="Best Trade" value={fmtR(summary.bestR)} sub={`worst: ${summary.worstR === null ? '—' : `${summary.worstR.toFixed(2)}R`}`} />
              <StatCard label="Worst Trade" value={fmtR(summary.worstR)} sub={`best: ${summary.bestR === null ? '—' : `${summary.bestR > 0 ? '+' : ''}${summary.bestR.toFixed(2)}R`}`} />
              <StatCard label="TP1 Hits" value={summary.tp1Hits} sub="partial wins" />
              <StatCard label="TP2 Hits" value={summary.tp2Hits} sub="full target hits" />
              <StatCard label="SL Hits" value={summary.slHits} sub="stop losses" />
              <StatCard label="A vs A+" value={`${aGradeCount} / ${aPlusGradeCount}`} sub="strategy grades only" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Expired" value={summary.expired} sub="not counted as W/L" />
              <StatCard label="Max Win Streak" value={summary.maxWinStreak} sub="WIN outcomes only" />
              <StatCard label="Max Loss Streak" value={summary.maxLossStreak} sub="LOSS outcomes only" />
              <StatCard label="Last Signal" value={fmtDate(summary.lastSignalTime)} sub={summary.lastSignalTime ? fmtDateTime(summary.lastSignalTime) : '—'} />
            </div>
          </>
        )}
      </section>

      {/* ── Strategy Performance Table ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Strategy Signal Breakdown</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Strategy</th>
                  <th className="text-right px-3 py-3 font-medium">Trades</th>
                  <th className="text-right px-3 py-3 font-medium">Closed</th>
                  <th className="text-right px-3 py-3 font-medium">Open</th>
                  <th className="text-right px-3 py-3 font-medium">Wins</th>
                  <th className="text-right px-3 py-3 font-medium">Losses</th>
                  <th className="text-right px-3 py-3 font-medium">Expired</th>
                  <th className="text-right px-3 py-3 font-medium">Win Rate</th>
                  <th className="text-right px-3 py-3 font-medium">PF</th>
                  <th className="text-right px-3 py-3 font-medium">Total R</th>
                  <th className="text-right px-3 py-3 font-medium">Est. P/L</th>
                  <th className="text-right px-3 py-3 font-medium">Avg Est.</th>
                  <th className="text-right px-3 py-3 font-medium">Est. DD</th>
                  <th className="text-right px-3 py-3 font-medium">Avg R</th>
                  <th className="text-right px-3 py-3 font-medium">Best R</th>
                  <th className="text-right px-3 py-3 font-medium">Worst R</th>
                  <th className="text-right px-3 py-3 font-medium">TP1</th>
                  <th className="text-right px-3 py-3 font-medium">TP2</th>
                  <th className="text-right px-3 py-3 font-medium">SL</th>
                  <th className="text-right px-4 py-3 font-medium">Last Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {strategyBreakdown.map(row => (
                  <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200 max-w-[180px]"><span className="truncate block" title={row.label}>{row.label}</span></td>
                    <td className="px-3 py-3 text-right text-zinc-300">{row.totalSignals}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{row.closedTrades}</td>
                    <td className="px-3 py-3 text-right text-blue-400">{row.openTrades}</td>
                    <td className="px-3 py-3 text-right text-emerald-400">{row.wins}</td>
                    <td className="px-3 py-3 text-right text-red-400">{row.losses}</td>
                    <td className="px-3 py-3 text-right text-zinc-500">{row.expired}</td>
                    <td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td>
                    <td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td>
                    {(() => { const est = capitalForRows(row.rows, capitalAssumptions); return <>
                      <td className="px-3 py-3 text-right"><CapitalText estimate={est} /></td>
                      <td className="px-3 py-3 text-right text-zinc-300">{formatMoney(est.avgPnl)}</td>
                      <td className="px-3 py-3 text-right text-red-400">{formatPct(est.maxDrawdownPct)}</td>
                    </>; })()}
                    <td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.bestR)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.worstR)}</td>
                    <td className="px-3 py-3 text-right text-cyan-400">{row.tp1Hits}</td>
                    <td className="px-3 py-3 text-right text-emerald-400">{row.tp2Hits}</td>
                    <td className="px-3 py-3 text-right text-red-400">{row.slHits}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{fmtDate(row.lastSignalTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Symbol Breakdown ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Symbol Breakdown</h2>
        {symbolBreakdown.length === 0 ? <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-8 text-center text-sm text-zinc-600">{emptyMessage}</div> : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
              {['Symbol','Market','Trades','Closed','Open','Win Rate','PF','Total R','Est. P/L','Avg Est.','Avg R','Best R','Worst R','Most Used Strategy','Last Signal'].map((h, i) => <th key={h} className={`${i < 2 || i === 11 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{symbolBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-3 py-3 font-mono font-bold text-zinc-100">{row.label}</td><td className="px-3 py-3 text-zinc-400 uppercase">{row.market}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{row.closedTrades}</td><td className="px-3 py-3 text-right text-blue-400">{row.openTrades}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td>{(() => { const est = capitalForRows(row.rows, capitalAssumptions); return <><td className="px-3 py-3 text-right"><CapitalText estimate={est} /></td><td className="px-3 py-3 text-right text-zinc-300">{formatMoney(est.avgPnl)}</td></>; })()}<td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-right">{fmtR(row.bestR)}</td><td className="px-3 py-3 text-right">{fmtR(row.worstR)}</td><td className="px-3 py-3 text-zinc-400">{row.mostUsedStrategy ?? '—'}</td><td className="px-3 py-3 text-right text-zinc-500">{fmtDate(row.lastSignalTime)}</td>
            </tr>)}</tbody>
          </table></div></div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* ── Timeframe Breakdown ── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Timeframe Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Timeframe','Trades','Win Rate','PF','Total R','Est. P/L','Avg R','TP2','SL'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{timeframeBreakdown.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-600">{emptyMessage}</td></tr> : timeframeBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3 font-medium text-zinc-200">{row.label}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td><td className="px-3 py-3 text-right"><CapitalText estimate={capitalForRows(row.rows, capitalAssumptions)} /></td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-right text-emerald-400">{row.tp2Hits}</td><td className="px-3 py-3 text-right text-red-400">{row.slHits}</td></tr>)}</tbody>
          </table></div></div>
        </section>

        {/* ── Grade Breakdown ── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Grade Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Grade','Trades','Win Rate','PF','Total R','Est. P/L','Avg R'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{gradeBreakdown.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-600">{emptyMessage}</td></tr> : gradeBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3">{row.label !== '—' ? gradeBadge(row.label) : <span className="text-zinc-600">—</span>}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td><td className="px-3 py-3 text-right"><CapitalText estimate={capitalForRows(row.rows, capitalAssumptions)} /></td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td></tr>)}</tbody>
          </table></div></div>
        </section>
      </div>


      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Strategy Expiry Cause Breakdown</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Expiry Cause','Expired Signals','Total R','Last Signal'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-800/60">{expiryBreakdown.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-600">No expired strategy signals in this filter.</td></tr> : expiryBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3 font-medium text-zinc-200">{row.label}</td><td className="px-3 py-3 text-right text-zinc-500">{row.expired}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td><td className="px-3 py-3 text-right text-zinc-500">{fmtDate(row.lastSignalTime)}</td></tr>)}</tbody>
        </table></div></div>
      </section>

      {/* ── Capital Allocation / Strategy Hardness ── */}
      <section id="capital-allocation-strategy-hardness" className="mb-8">
        <div className="flex items-start gap-2 mb-3">
          <Shield size={16} className="text-purple-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Capital Allocation / Strategy Hardness</h2>
            <p className="text-xs text-zinc-500 mt-1">Research mode only: separates paper signal truth from Binance execution truth and previews future capital-ranking evidence without changing scanner, strategy entry, routing, or live execution rules.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
          <StatCard label="100-trade readiness" value={<span className={capitalHardness.completedTradeObservationReady ? 'text-emerald-400' : 'text-yellow-400'}>{capitalHardness.completedTradeObservationReady ? 'ready' : 'observe'}</span>} sub={`${executionSummary.closedTradeCount}/100 executed closed trades`} />
          <StatCard label="TP1 → BE/SL" value={formatPct(capitalHardness.tp1ThenBeSlRate)} sub="giveback after TP1" />
          <StatCard label="TP1 → TP2" value={formatPct(capitalHardness.tp1ThenTp2Rate)} sub="runner usefulness" />
          <StatCard label="Signal spam score" value={<span className={capitalHardness.spamScore >= 60 ? 'text-red-400' : capitalHardness.spamScore >= 35 ? 'text-yellow-400' : 'text-emerald-400'}>{capitalHardness.spamScore.toFixed(0)}/100</span>} sub="density + open load" />
          <StatCard label="Governance" value="research-only" sub="no capital enforcement yet" />
          <StatCard label="Exit decision" value={<span className="text-yellow-400">not final</span>} sub="requires 100 completed trades" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Symbol Quality / Opportunity Preview</h3>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Symbol','Group','Signals','Closed','Win','PF','Avg R','Class','Rank'].map((h, i) => <th key={h} className={`${i < 2 || i >= 7 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-800/60">{capitalHardness.symbolRows.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-600">No symbol rows in this filter.</td></tr> : capitalHardness.symbolRows.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3 font-mono font-bold text-zinc-100">{row.label}</td><td className="px-3 py-3 text-zinc-400">{row.group}</td><td className="px-3 py-3 text-right text-zinc-400">{row.totalSignals}</td><td className="px-3 py-3 text-right text-zinc-400">{row.closedTrades}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-zinc-300">{row.classification}</td><td className="px-3 py-3 text-zinc-300">{row.rank.tier}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Strategy Survival Matrix Preview</h3>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Strategy','Signals','Closed','Win','TP1','TP2','SL','PF','Avg R','Survival'].map((h, i) => <th key={h} className={`${i === 0 || i === 9 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-800/60">{capitalHardness.strategyRows.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3 font-medium text-zinc-100">{row.label}</td><td className="px-3 py-3 text-right text-zinc-400">{row.totalSignals}</td><td className="px-3 py-3 text-right text-zinc-400">{row.closedTrades}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right text-zinc-400">{row.tp1Hits}</td><td className="px-3 py-3 text-right text-zinc-400">{row.tp2Hits}</td><td className="px-3 py-3 text-right text-zinc-400">{row.slHits}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-zinc-300">{row.survival}</td></tr>)}</tbody>
            </table></div>
          </div>
        </div>
      </section>

      {/* ── Binance Execution Performance ── */}
      <section id="binance-execution-performance" className="mb-8">
        <div className="flex items-start gap-2 mb-3">
          <Activity size={16} className="text-cyan-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Binance Testnet Execution Performance</h2>
            <p className="text-xs text-zinc-500 mt-1">Execution truth only. Unfilled limit entries are shown as no_trade and are excluded from bot win rate, PF, R, TP, and SL stats.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
          <StatCard label="Eligible signals" value={executionSummary.eligibleSignals} sub="qualified signal rows" />
          <StatCard label="Execution attempted" value={executionSummary.executionAttempted} sub={`${executionSummary.entrySubmitted} entry submitted`} />
          <StatCard label="Filled trades" value={executionSummary.entryFilled} sub="only these count as bot trades" />
          <StatCard label="Closed trade count" value={executionSummary.closedTradeCount} sub="filled and closed only" />
          <StatCard label="Entry timeout count" value={executionSummary.entryTimeoutCancelled} sub="no_trade · limit_entry_not_filled" />
          <StatCard label="Skipped executions" value={executionSummary.skippedExecutions} sub="blocked before order fill" />
          <StatCard label="Bot win rate" value={fmtWinRate(executionSummary.botWinRatePct)} sub={`${executionSummary.wins}W / ${executionSummary.losses}L filled only`} />
          <StatCard label="Bot PF" value={fmtPF(executionSummary.botProfitFactor)} sub="filled closed trades only" />
          <StatCard label="Bot total R" value={fmtR(executionSummary.botTotalR)} sub={executionSummary.pendingSync > 0 ? `${executionSummary.pendingSync} pending sync` : 'synced filled trades'} />
          <StatCard label="Filled TP1" value={executionSummary.tp1Hits} sub="filled-trade count" />
          <StatCard label="Filled TP2" value={executionSummary.tp2Hits} sub="filled-trade count" />
          <StatCard label="Profit-Lock Count" value={executionSummary.profitLockSlHits} sub="closed_profit_lock only" />
          <StatCard label="Direct SL Count" value={executionSummary.slHits} sub="excludes profit-lock closures" />
          <StatCard label="Expiry Count" value={executionSummary.closedExpired + executionSummary.closedExpiredAfterTp1} sub={`${executionSummary.closedExpiredAfterTp1} after TP1`} />
          <StatCard label="Manual Close Count" value={executionSummary.closedManual} sub="Binance manual/synced closes" />
          <StatCard label="Open Runner Count" value={executionSummary.openRunnerCount} sub="filled open runners" />
          <StatCard label="Protected Runner Count" value={executionSummary.protectedRunnerCount} sub="runner + profit-lock active" />
          <StatCard label="Pending sync count" value={executionSummary.pendingSync} sub="closed but missing R truth" />
          <StatCard label="Protection unavailable count" value={executionSummary.protectionUnavailable} sub="execution safety failures" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  {['Reason','Count'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {[
                  ['Governor blocked', executionSummary.governorBlocked],
                  ['Bot paused', executionSummary.botPaused],
                  ['Duplicate blocked', executionSummary.duplicateBlocked],
                  ['Same-symbol blocked', executionSummary.sameSymbolBlocked],
                  ['Risk cap blocked', executionSummary.riskCapBlocked],
                  ['Max position blocked', executionSummary.maxPositionBlocked],
                  ['Missing credentials', executionSummary.missingCredentials],
                  ['Invalid symbol', executionSummary.invalidSymbol],
                ].map(([label, count]) => <tr key={String(label)}><td className="px-3 py-3 text-zinc-300">{label}</td><td className="px-3 py-3 text-right text-zinc-300">{count}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Bot Health ── */}
      <section id="bot-health" className="mb-8">
        <div className="flex items-start gap-2 mb-3">
          <Shield size={16} className="text-emerald-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Bot Health / Protection Performance</h2>
            <p className="text-xs text-zinc-500 mt-1">System safety truth from execution rows plus monitor-synced Binance positions and orders.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
          <StatCard label="HTTP status" value={botHealth.latestMonitorHttpStatus} sub="Supabase function response" />
          <StatCard label="Monitor critical status" value={<span className={botHealth.monitorCriticalStatus === 'critical_error' ? 'text-red-400' : botHealth.monitorCriticalStatus === 'healthy' ? 'text-emerald-400' : 'text-yellow-400'}>{botHealth.monitorCriticalStatus}</span>} sub={botHealth.monitorStatus} />
          <StatCard label="Monitor warnings" value={<span className={botHealth.monitorWarningsCount > 0 ? 'text-yellow-400' : 'text-emerald-400'}>{botHealth.monitorWarningsCount}</span>} sub="recoverable row/order issues" />
          <StatCard label="Row errors" value={<span className={botHealth.monitorRowErrorsCount > 0 ? 'text-red-400' : 'text-emerald-400'}>{botHealth.monitorRowErrorsCount}</span>} sub={`${botHealth.monitorCriticalErrorsCount} critical`} />
          <StatCard label="Protection SLA" value={<span className={botHealth.protectionSla === 'pass' ? 'text-emerald-400' : botHealth.protectionSla === 'fail' ? 'text-red-400' : 'text-yellow-400'}>{botHealth.protectionSla}</span>} sub={botHealth.avgSecondsToProtection === null ? 'avg fill→protect —' : `avg ${botHealth.avgSecondsToProtection}s fill→protect`} />
          <StatCard label="Native protected" value={botHealth.protectedNative} sub="DB + Binance IDs" />
          <StatCard label="Managed fallback" value={botHealth.protectedManaged} sub="HashiBot managed exits" />
          <StatCard label="Unprotected open positions" value={<span className={botHealth.unprotectedOpenPositions > 0 ? 'text-red-400' : 'text-emerald-400'}>{botHealth.unprotectedOpenPositions}</span>} sub="unsafe if > 0" />
          <StatCard label="Orphans cleaned" value={botHealth.orphanOrdersCleaned} sub="monitor event logs" />
          <StatCard label="Stale rows cleaned" value={botHealth.staleRowsCleaned} sub="DB stale sync" />
          <StatCard label="HTTP 500s" value={botHealth.monitor500Count} sub="transport/server failures" />
          <StatCard label="Entry timeouts" value={botHealth.entryTimeoutCancelled} sub="not unprotected trades" />
          <StatCard label="Manual close synced" value={botHealth.manualCloseSynced} sub="closed_synced/stale_closed" />
          <StatCard label="External conditional cancels" value={botHealth.conditionalOrdersCancelledExternally} sub="event-log evidence" />
          <StatCard label="Open Binance positions" value={botHealth.openBinancePositions.length || executionSettings?.open_positions_count || 0} sub={`${botHealth.openBinanceOrders.length} open orders`} />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  {['Symbol','Status','Position','SL','TP1','TP2','Native verified','Managed fallback','Safety','Last monitor'].map((h, i) => <th key={h} className={`${i < 2 || i === 8 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {botHealth.activeRows.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-zinc-600">No open filled Binance execution rows require protection.</td></tr> : botHealth.activeRows.map(row => {
                  const safety = positionSafety(row);
                  return <tr key={row.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-3 py-3 font-mono font-bold text-zinc-100">{row.symbol}</td>
                    <td className="px-3 py-3 text-zinc-300">{row.status}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{row.current_position_size ?? row.remaining_quantity ?? '—'}</td>
                    <td className="px-3 py-3 text-right">{row.sl_algo_id || row.binance_sl_order_id ? <span className="text-emerald-400">yes</span> : <span className="text-red-400">no</span>}</td>
                    <td className="px-3 py-3 text-right">{row.tp1_algo_id || row.binance_tp1_order_id ? <span className="text-emerald-400">yes</span> : <span className="text-red-400">no</span>}</td>
                    <td className="px-3 py-3 text-right">{row.tp2_algo_id || row.binance_tp2_order_id ? <span className="text-emerald-400">yes</span> : <span className="text-red-400">no</span>}</td>
                    <td className="px-3 py-3 text-right">{row.native_protection_verified ? 'yes' : 'no'}</td>
                    <td className="px-3 py-3 text-right">{row.managed_fallback_active ? 'yes' : 'no'}</td>
                    <td className={`px-3 py-3 ${safety === 'safe' || safety === 'managed_fallback' ? 'text-emerald-400' : 'text-red-400'}`}>{safety}</td>
                    <td className="px-3 py-3 text-right text-zinc-500">{row.last_monitor_action || '—'}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Recent Signals Table ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Tracked Signals — Signal Truth + Execution Truth</h2>
          <span className="text-xs text-zinc-600">{filteredSignals.length} {activeFilterCount > 0 ? 'matching' : 'total'}</span>
        </div>

        {loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 flex justify-center">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 text-center text-sm text-zinc-600">
            {emptyMessage}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Symbol</th>
                    <th className="text-left px-3 py-3 font-medium">Market</th>
                    <th className="text-left px-3 py-3 font-medium">Strategy</th>
                    <th className="text-left px-3 py-3 font-medium">Timeframe</th>
                    <th className="text-left px-3 py-3 font-medium">Direction</th>
                    <th className="text-left px-3 py-3 font-medium">Grade</th>
                    <th className="text-left px-3 py-3 font-medium">Signal Status</th>
                    <th className="text-left px-3 py-3 font-medium">Execution Status</th>
                    <th className="text-left px-3 py-3 font-medium">Execution Reason</th>
                    <th className="text-right px-3 py-3 font-medium">Signal R</th>
                    <th className="text-right px-3 py-3 font-medium">Entry</th>
                    <th className="text-right px-3 py-3 font-medium">Stop Loss</th>
                    <th className="text-right px-3 py-3 font-medium">TP1</th>
                    <th className="text-right px-3 py-3 font-medium">TP2</th>
                    <th className="text-right px-3 py-3 font-medium">Close Price</th>
                    <th className="text-right px-3 py-3 font-medium">Duration</th>
                    <th className="text-right px-3 py-3 font-medium">Created</th>
                    <th className="text-right px-4 py-3 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredSignals.map(sig => {
                    const execution = latestExecutionBySignalId.get(sig.signal_id);
                    const executionStatus = executionDisplayStatus(execution);
                    const signalOpenExecutionNotOpen = normalizedSignalStatus(sig) === 'OPEN' && (!execution || !hasFilledEntry(execution));
                    return (
                    <tr key={sig.signal_id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-zinc-100">{sig.symbol}</td>
                      <td className="px-3 py-3 text-zinc-400 uppercase">{sig.market_type}</td>
                      <td className="px-3 py-3 text-zinc-400 max-w-[140px]"><span className="truncate block" title={sig.strategy_name ?? undefined}>{sig.strategy_name ?? <span className="text-zinc-600 italic">—</span>}</span></td>
                      <td className="px-3 py-3 text-zinc-400">{sig.timeframe}</td>
                      <td className="px-3 py-3">{directionBadge(sig.direction)}</td>
                      <td className="px-3 py-3">{gradeBadge(sig.grade)}</td>
                      <td className="px-3 py-3">
                        <span className={`font-medium ${OUTCOME_COLORS[sig.outcome_category] ?? 'text-zinc-400'}`}>
                          {sig.outcome_category === 'WIN'
                            ? <span className="flex items-center gap-1"><TrendingUp size={10} />WIN</span>
                            : sig.outcome_category === 'LOSS'
                            ? <span className="flex items-center gap-1"><TrendingDown size={10} />LOSS</span>
                            : sig.outcome_category === 'EXPIRED'
                            ? <span className="flex items-center gap-1"><Minus size={10} />EXPIRED</span>
                            : sig.outcome_category}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className={executionStatus === 'NOT_EXECUTED' || executionStatus === 'SKIPPED' || executionStatus === 'ENTRY_TIMEOUT_CANCELLED' ? 'text-yellow-300' : executionStatus.startsWith('CLOSED') || executionStatus.startsWith('PROTECTED') || executionStatus === 'ENTRY_FILLED' ? 'text-emerald-300' : 'text-blue-300'}>{executionStatus}</div>
                        {signalOpenExecutionNotOpen && <div className="text-[10px] text-yellow-400 mt-0.5">Signal open · execution not open</div>}
                      </td>
                      <td className="px-3 py-3 text-zinc-500 max-w-[180px]"><span className="truncate block" title={executionReason(execution)}>{executionReason(execution)}</span></td>
                      <td className="px-3 py-3 text-right">{fmtSignalR(sig.r_result)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.entry_price)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.stop_loss)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.tp1)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.tp2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.close_price)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500">{fmtDuration(sig.duration_minutes)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500 whitespace-nowrap">{fmtDateTime(sig.created_at)}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 whitespace-nowrap">{fmtDateTime(sig.closed_at)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Footer note */}
      <div className="mt-6 text-xs text-zinc-600 leading-relaxed">
        <span className="font-medium text-zinc-500">Data notes:</span>{' '}
        Strategy signal rows are loaded from <code className="bg-zinc-800 px-1 rounded">signal_analytics_view</code>; Binance execution truth is loaded from{' '}
        <code className="bg-zinc-800 px-1 rounded">execution_orders</code>; bot health is loaded from <code className="bg-zinc-800 px-1 rounded">execution_settings</code> and <code className="bg-zinc-800 px-1 rounded">execution_event_logs</code>.
        Strategy cards and breakdowns are recalculated client-side from the filtered signal/outcome set; execution cards are recalculated only from execution rows.
        Open signals are counted separately and excluded from win/loss/PF/R aggregates.
        Expired signals are shown separately and are not treated as wins or losses.
        Profit factor shows “—” when there are no losses or no closed R results, avoiding unsafe infinity values.
      </div>
    </AdminLayout>
  );
}
