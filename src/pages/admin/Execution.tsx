import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { BinanceExecutionOrder, ExecutionSettings, Signal } from '../../lib/types';
import { Shield, AlertTriangle, Cpu, Activity, Send, RefreshCw, XCircle, PlayCircle, FlaskConical, Trash2, RotateCcw, PauseCircle, StopCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';
import { getMonitorTruth, shortOperatorText } from '../../lib/monitorTruth';

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  pending_submit: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
  entry_submitted: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  entry_filled: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  protected_native: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  sl_submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  tp_submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  partially_closed: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  closed_tp: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  closed_tp2: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  closed_profit_lock: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  closed_sl: 'text-red-400 bg-red-500/10 border-red-500/20',
  closed_timeout: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  closed_expired: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  closed_expired_after_tp1: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  closed_manual: 'text-zinc-300 bg-zinc-800 border-zinc-700',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  skipped: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  cancelled: 'text-zinc-400 bg-zinc-800 border-zinc-700',
};


type ExecutionSettingsSnapshot = {
  latest_monitor_run_at: string | null;
  latest_monitor_status: string;
  latest_monitor_result: Record<string, unknown> | null;
  latest_monitor_error?: string | null;
  latest_sync_error?: string | null;
  open_binance_positions: unknown[] | null;
  open_binance_orders: unknown[] | null;
  pnl_snapshot: Record<string, unknown> | null;
  stale_rows_cleaned: number | null;
  open_positions_count: number | null;
  unrealized_pnl: number | null;
  account_total_margin_balance: number | null;
  account_total_wallet_balance: number | null;
  latest_sync_time: string | null;
  latest_account_state_at?: string | null;
  last_managed_exit_action?: Record<string, unknown> | null;
};


type ProviderControl = {
  provider_name: 'binance' | 'bybit' | 'mt5';
  provider?: 'binance' | 'bybit' | 'mt5';
  enabled: boolean;
  entry_enabled?: boolean | null;
  parallel_enabled: boolean;
  primary_provider: boolean;
  read_only: boolean;
  profit_lock_enabled: boolean;
  monitor_enabled: boolean;
  protection_recovery_enabled: boolean;
  recovery_enabled?: boolean | null;
  provider_kill_switch: boolean;
  kill_switch?: boolean | null;
  status: string;
  last_error: string | null;
};

type ProviderControlsErrorKind = 'missing_table' | 'rls_blocked' | 'rows_missing' | 'query_failed' | '';

type ProviderGlobalControls = {
  id: number;
  primary_provider: 'binance' | 'bybit' | 'mt5';
  parallel_mode_enabled: boolean;
  live_trading_enabled: boolean;
};

type ProviderSymbolCacheRow = {
  provider: 'binance' | 'bybit';
  symbol: string;
  status: string;
};

type OperatorRoutingSnapshot = {
  last_admin_alert?: { created_at?: string; delivery_status?: string; error_message?: string; delivery_type?: string } | null;
  last_admin_digest?: { created_at?: string; delivery_status?: string; error_message?: string; delivery_type?: string } | null;
  free_selected_today?: number;
  telegram_health?: Record<string, { latest_status?: string; latest_at?: string; latest_error?: string }>;
};

interface StatusPayload {
  success: boolean;
  settings?: ExecutionSettings;
  env?: {
    execution_mode: string;
    exchange: string;
    testnet_enabled: boolean;
    live_trading_enabled: boolean;
    base_url: string;
    api_key_configured: boolean;
    api_secret_configured: boolean;
  };
  executions?: BinanceExecutionOrder[];
  failed_count?: number;
  skipped_count?: number;
  latest_error?: { error_message?: string; last_exchange_error?: string } | null;
  last_insufficient_margin?: { reason?: string; backup_attempted?: boolean; backup_asset_used?: string; final_result?: string } | null;
  capital?: { raw_total_margin_balance?: number; raw_total_wallet_balance?: number; raw_available_usdt?: number; raw_available_usdc?: number; selected_capital_used?: number; capital_basis?: string; max_capital_cap_applied?: boolean };
  account_state?: { totalMarginBalance?: number; totalWalletBalance?: number; availableBalance?: number; availableUsdt?: number; availableUsdc?: number; unrealizedPnl?: number; openPositions?: number; marginRatio?: number | null; openOrderCount?: number; positions?: Array<{ symbol: string; positionAmt: number; unrealizedPnl: number; notional: number }> };
  governor?: { state?: string; effective_state?: string; display_state?: string; reason?: string; risk_multiplier?: number; adjusted_max_leverage?: number; adjusted_max_open_positions?: number; daily_pnl_pct?: number | null; unrealized_pnl?: number | null; current_equity?: number | null; blocks_execution?: boolean };
  governor_display?: { mode: string; state: string; execution_allowed: boolean };
  effective_risk_pct?: number | null;
  effective_leverage?: number | null;
  risk_source?: string;
  leverage_source?: string;
  current_open_risk_pct?: number;
  max_total_open_risk_pct?: number;
  remaining_risk_capacity_pct?: number;
  execution_allowed?: boolean;
  error?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  reason?: string;
  execution_id?: string;
  status?: string;
  plan?: Record<string, unknown>;
  governor_state?: string;
  governor_reason?: string;
  last_governor_checked_at?: string;
  execution_allowed?: boolean;
  admin_action_needed?: string;
  result?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  checks?: Record<string, unknown>;
  connected?: boolean;
  safe_for_test_order?: boolean;
  missing_permissions?: string[];
  error_reason?: string | null;
  balances?: unknown[];
  positions?: unknown[];
  open_orders?: unknown[];
  account_state?: Record<string, unknown> | null;
  governor?: Record<string, unknown>;
  cleaned_count?: number;
  symbols_checked?: number;
}

export default function Execution() {
  const { session } = useAuth();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [monitorState, setMonitorState] = useState<ExecutionSettingsSnapshot | null>(null);
  const [operatorRouting, setOperatorRouting] = useState<OperatorRoutingSnapshot>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'all' | 'binance' | 'bybit' | 'mt5'>('binance');
  const [providerControls, setProviderControls] = useState<ProviderControl[]>([]);
  const [providerGlobalControls, setProviderGlobalControls] = useState<ProviderGlobalControls | null>(null);
  const [providerSymbolCache, setProviderSymbolCache] = useState<ProviderSymbolCacheRow[]>([]);
  const [providerControlsError, setProviderControlsError] = useState<{ kind: ProviderControlsErrorKind; message: string }>({ kind: '', message: '' });
  const [bybitDebug, setBybitDebug] = useState<ActionResult | null>(null);
  const providerStatus = useMemo(() => new Map(providerControls.map((control) => [control.provider_name, control])), [providerControls]);
  const requestedPrimaryProvider = providerGlobalControls?.primary_provider ?? providerControls.find((control) => control.primary_provider)?.provider_name ?? 'binance';
  const bybitConnected = providerStatus.get('bybit')?.status === 'connected' || bybitDebug?.connected === true;
  const bybitDiagnosticsIncomplete = !bybitConnected;
  const effectivePrimaryProvider = requestedPrimaryProvider === 'bybit' && bybitDiagnosticsIncomplete ? 'binance' : requestedPrimaryProvider;
  const providerSafetyWarning = bybitDiagnosticsIncomplete ? 'Bybit diagnostics incomplete' : '';

  const executions = useMemo(() => {
    const rows = status?.executions ?? [];
    if (selectedProvider === 'all') return rows;
    return rows.filter((execution) => (execution.execution_provider ?? 'binance') === selectedProvider);
  }, [selectedProvider, status?.executions]);
  const allProviderExecutions = useMemo(() => status?.executions ?? [], [status?.executions]);
  const providerCards = useMemo(() => {
    const providers = ['binance', 'bybit', 'mt5'] as const;
    return providers.map((provider) => {
      const rows = allProviderExecutions.filter((execution) => (execution.execution_provider ?? 'binance') === provider);
      const active = rows.filter((execution) => ['pending', 'pending_submit', 'entry_submitted', 'entry_filled', 'protected', 'protected_native', 'protected_managed', 'pending_protection', 'pending_managed_protection', 'partially_closed'].includes(execution.status));
      const pnl = rows.reduce((sum, execution) => sum + Number(execution.current_pnl ?? execution.latest_unrealized_pnl ?? 0), 0);
      const protectedCount = active.filter((execution) => ['protected', 'protected_native', 'protected_managed', 'protection_recovered'].includes(String(execution.protection_status ?? execution.status))).length;
      const recoveryFailures = rows.filter((execution) => execution.protection_status === 'protection_failed' || execution.latest_protection_error || execution.latest_monitor_error).length;
      const profitLockActive = rows.filter((execution) => execution.profit_lock_sl_active || execution.profit_lock_status === 'locked' || execution.status === 'closed_profit_lock').length;
      return { provider, rows, active, pnl, protectedCount, recoveryFailures, profitLockActive };
    });
  }, [allProviderExecutions]);
  const openExecutions = useMemo(() => executions.filter(e => ['pending', 'pending_submit', 'entry_submitted', 'entry_filled', 'protected', 'protected_native', 'protected_managed', 'pending_protection', 'pending_managed_protection', 'sl_submitted', 'tp_submitted', 'partially_closed'].includes(e.status)), [executions]);
  const failedExecutions = executions.filter(e => e.status === 'failed');
  const skippedExecutions = executions.filter(e => e.status === 'skipped');
  const selectedSignalValid = useMemo(() => Boolean(selectedSignalId && signals.some(s => s.id === selectedSignalId)), [selectedSignalId, signals]);
  const governorMode = status?.settings?.testnet_governor_mode ?? 'normal';
  const stressMode = status?.settings?.stress_override_enabled === true && status?.settings?.execution_mode === 'testnet';
  const governorDisplayState = status?.governor_display?.state ?? (governorMode === 'off_for_testing' ? 'IGNORED' : (status?.governor?.display_state ?? status?.governor?.state ?? status?.settings?.governor_state ?? 'normal').toUpperCase());
  const executionAllowedDisplay = status?.governor_display?.execution_allowed ?? status?.execution_allowed ?? !(status?.governor?.blocks_execution || status?.settings?.governor_state === 'paused');
  const monitorResultStatus = String(monitorState?.latest_monitor_result?.monitor_status ?? monitorState?.latest_monitor_status ?? 'unknown');
  const reconciliationSummary = (monitorState?.latest_monitor_result?.reconciliation_summary ?? {}) as Record<string, unknown>;
  const monitorTruth = getMonitorTruth({
    latest_monitor_run_at: monitorState?.latest_monitor_run_at,
    latest_account_state_at: monitorState?.latest_account_state_at,
    latest_monitor_status: monitorState?.latest_monitor_status,
    latest_monitor_error: monitorState?.latest_monitor_error,
    latest_sync_error: monitorState?.latest_sync_error,
    latest_monitor_result: monitorState?.latest_monitor_result,
  });
  const monitorUnhealthyReason = monitorTruth.level === 'healthy' ? '' : monitorTruth.reason;
  const selectedProviderControl = providerControls.find((control) => control.provider_name === (selectedProvider === 'all' ? effectivePrimaryProvider : selectedProvider));
  const entryEngineOn = status?.settings?.auto_execute_testnet === true && status?.settings?.testnet_enabled === true && status?.settings?.kill_switch_enabled !== true && status?.settings?.bot_paused !== true && selectedProviderControl?.enabled === true && (selectedProviderControl?.entry_enabled ?? selectedProviderControl?.enabled) === true && selectedProviderControl?.provider_kill_switch !== true;
  const monitorEngineOn = status?.settings?.bot_paused !== true;
  const recoveryEngineOn = status?.settings?.bot_paused !== true;
  const emergencyStopOn = status?.settings?.bot_paused === true;
  const killSwitchOn = status?.settings?.kill_switch_enabled === true;
  const existingPositionsProtected = monitorTruth.level !== 'critical' && !openExecutions.some((execution) => ['protection_failed', 'unprotected'].includes(String(execution.protection_status ?? execution.status)));
  const monitorTruthStatus = monitorTruth.label;
  const profitLockMode = status?.settings?.enable_profit_lock_engine !== true
    ? 'disabled'
    : status?.settings?.enable_testnet_profit_lock_engine === true
      ? 'testnet_action'
      : 'study_only';
  const allowMarginAssets = String(status?.settings?.allow_margin_assets ?? 'USDT,USDC').split(',').map(asset => asset.trim().toUpperCase()).filter(Boolean);
  const fallbackAttempts = executions.filter(e => e.margin_backup_attempted);
  const lastFallbackAttempt = fallbackAttempts[0];
  const successfulFallbacks = executions.filter(e => e.margin_backup_attempted && (e.margin_backup_asset_used === 'USDC' || e.selected_margin_asset === 'USDC') && e.status !== 'failed' && e.status !== 'skipped').length;
  const failedFallbacks = executions.filter(e => e.margin_backup_attempted && (e.status === 'failed' || e.insufficient_margin_reason)).length;
  const unsupportedSymbolCount = executions.filter(e => e.insufficient_margin_reason === 'usdc_market_unavailable').length;
  const openTradesUnderMonitoring = openExecutions.filter(e => { const checked = e.last_monitor_checked_at ? new Date(e.last_monitor_checked_at).getTime() : NaN; return Number.isFinite(checked) && Date.now() - checked <= 2 * 60_000; }).length;
  const tradesEligibleForLock = openExecutions.filter(e => Number(e.current_r ?? e.profit_lock_r_current ?? 0) >= Number(status?.settings?.profit_lock_min_r ?? 0.3)).length;
  const tradesAlreadyLocked = executions.filter(e => e.profit_lock_sl_active || e.profit_lock_status === 'locked' || e.status === 'closed_profit_lock').length;
  const slReplacementsVerified = executions.filter(e => e.replacement_sl_verified).length;
  const slReplacementFailures = executions.filter(e => e.profit_lock_skipped_reason || (e.lock_recommendation && !e.replacement_sl_verified && Number(e.profit_lock_action_count ?? 0) > 0)).length;
  const oldSlPreservedCount = executions.filter(e => e.old_sl_preserved !== false).length;
  const recoveryTotal = slReplacementsVerified + slReplacementFailures;
  const recoverySuccessRate = recoveryTotal > 0 ? `${Math.round((slReplacementsVerified / recoveryTotal) * 100)}%` : '—';
  const nowMs = Date.now();
  const secondsSinceEntryFill = (e: BinanceExecutionOrder): number | null => {
    const value = e.entry_filled_at ? new Date(e.entry_filled_at).getTime() : NaN;
    return Number.isFinite(value) ? Math.max(0, Math.floor((nowMs - value) / 1000)) : null;
  };
  const providerSymbolStatus = useMemo(() => {
    const map = new Map<string, ProviderSymbolCacheRow>();
    providerSymbolCache.forEach(row => map.set(`${row.provider}:${row.symbol.toUpperCase()}`, row));
    return map;
  }, [providerSymbolCache]);
  const approvedExecutionProofRows = useMemo(() => signals
    .filter(signal => ['A', 'A+'].includes(String(signal.grade ?? '').toUpperCase()))
    .slice(0, 20)
    .map(signal => {
      const symbol = String(signal.symbol ?? '').toUpperCase();
      const bybitSymbol = symbol.replace(/USDC$/i, 'USDT');
      const binanceSupported = providerSymbolStatus.get(`binance:${symbol}`)?.status === 'TRADING';
      const bybitSupported = providerSymbolStatus.get(`bybit:${bybitSymbol}`)?.status === 'Trading';
      const rows = allProviderExecutions.filter(execution => execution.signal_id === signal.id);
      const binance = rows.find(execution => (execution.execution_provider ?? 'binance') === 'binance');
      const bybit = rows.find(execution => execution.execution_provider === 'bybit');
      const blocker = [binance, bybit].find(row => row?.latest_auto_skip_reason || row?.error_message || row?.last_exchange_error);
      const submitted = rows.some(row => Boolean(row.entry_order_id || row.binance_entry_order_id));
      const created = rows.length > 0;
      const setupBlocker = !providerGlobalControls ? 'missing_global_provider_controls' : providerControls.length === 0 ? 'missing_provider_controls' : '';
      const supportBlocker = !binanceSupported || !bybitSupported ? `unsupported provider symbol: ${!binanceSupported ? 'binance' : ''}${!binanceSupported && !bybitSupported ? '+' : ''}${!bybitSupported ? 'bybit' : ''}` : '';
      const shouldExecute = !setupBlocker && !supportBlocker && providerGlobalControls?.parallel_mode_enabled === true;
      return { signal, rows, binance, bybit, blocker, submitted, created, shouldExecute, binanceSupported, bybitSupported, setupBlocker, supportBlocker };
    }), [allProviderExecutions, providerControls.length, providerGlobalControls, providerSymbolStatus, signals]);
  const protectionSlaState = (e: BinanceExecutionOrder): 'pass' | 'fail' | 'pending' | 'n/a' => {
    if (['closed_timeout', 'closed_expired', 'closed_expired_after_tp1', 'closed_manual', 'closed_unprotected_safety', 'closed_synced', 'stale_closed', 'closed_tp', 'closed_tp2', 'closed_profit_lock', 'closed_sl', 'cancelled', 'failed', 'skipped'].includes(e.status)) return 'n/a';
    if (e.protection_status === 'protected_native' || e.protection_status === 'protected_managed' || e.status === 'protected_native' || e.status === 'protected_managed') return 'pass';
    const seconds = secondsSinceEntryFill(e);
    if (seconds === null) return ['pending_submit', 'entry_submitted', 'entry_filled', 'pending_protection', 'pending_managed_protection'].includes(e.status) ? 'pending' : 'n/a';
    return seconds > 60 ? 'fail' : 'pending';
  };
  const freshnessState = (e: BinanceExecutionOrder): 'fresh' | 'stale' => {
    const checked = e.last_monitor_checked_at ? new Date(e.last_monitor_checked_at).getTime() : NaN;
    return Number.isFinite(checked) && nowMs - checked <= 2 * 60_000 ? 'fresh' : 'stale';
  };

  async function updateExecutionSettings(settingsPatch: Record<string, unknown>) {
    return callExecution('update_settings', { settings: settingsPatch });
  }

  function classifyProviderControlsError(message: string): { kind: ProviderControlsErrorKind; message: string } {
    const lower = message.toLowerCase();
    if (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('42p01')) return { kind: 'missing_table', message: 'Provider controls table missing.' };
    if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('42501') || lower.includes('forbidden')) return { kind: 'rls_blocked', message: 'Provider controls blocked by RLS policy.' };
    return { kind: 'query_failed', message: `Provider controls query failed: ${message}` };
  }

  async function updateProviderControl(providerName: ProviderControl['provider_name'], patch: Partial<ProviderControl>) {
    const { error } = await supabase
      .from('execution_provider_controls')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('provider_name', providerName);
    if (error) {
      const classified = classifyProviderControlsError(error.message);
      setProviderControlsError(classified);
      setResult({ success: false, error: classified.message });
      return;
    }
    await load();
  }

  async function updateProviderGlobalControls(patch: Partial<ProviderGlobalControls>) {
    const requestedPrimary = patch.primary_provider;
    if (requestedPrimary && requestedPrimary !== 'binance') {
      const requestedControl = providerStatus.get(requestedPrimary);
      if (!requestedControl || requestedControl.status !== 'connected') {
        setProviderControlsError({ kind: 'query_failed', message: 'Bybit diagnostics incomplete' });
        setResult({ success: false, error: 'Bybit diagnostics incomplete', reason: 'Disconnected providers cannot become active execution providers. Primary Provider remains Binance.' });
        const { error: forceError } = await supabase.from('execution_provider_global_controls').update({ primary_provider: 'binance', live_trading_enabled: false, updated_at: new Date().toISOString() }).eq('id', 1);
        if (!forceError) await load();
        return;
      }
    }
    const safePatch = { ...patch, live_trading_enabled: false, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('execution_provider_global_controls').update(safePatch).eq('id', 1);
    if (error) {
      const classified = classifyProviderControlsError(error.message);
      setProviderControlsError(classified);
      setResult({ success: false, error: classified.message });
      return;
    }
    await load();
  }

  async function callExecution(action: string, payload: Record<string, unknown> = {}): Promise<ActionResult> {
    if (!session) return { success: false, error: 'No admin session' } as ActionResult;
    setActing(true);
    setResult(null);
    try {
      const res = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/binance-testnet-execution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json() as ActionResult;
      setResult(data);
      await load();
      return data;
    } catch (e) {
      const data = { success: false, error: e instanceof Error ? e.message : 'Network error' };
      setResult(data);
      return data;
    } finally {
      setActing(false);
    }
  }

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [statusRes, signalsRes, monitorRes, adminAlertRes, adminDigestRes, freeSelectedRes, telegramHealthRes, providerControlsRes, providerGlobalControlsRes, providerSymbolCacheRes] = await Promise.all([
      fetch(`${getFrontendSupabaseUrl()}/functions/v1/binance-testnet-execution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      }).then(r => r.json()).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : 'Status failed' })),
      supabase.from('signals').select('*').eq('market_type', 'crypto').order('created_at', { ascending: false }).limit(25),
      supabase.from('execution_settings').select('latest_monitor_run_at,latest_monitor_status,latest_monitor_result,latest_monitor_error,latest_sync_error,open_binance_positions,open_binance_orders,pnl_snapshot,stale_rows_cleaned,open_positions_count,unrealized_pnl,account_total_margin_balance,account_total_wallet_balance,latest_sync_time,latest_account_state_at,last_managed_exit_action').eq('id', 1).maybeSingle(),
      supabase.from('telegram_deliveries').select('created_at,delivery_status,error_message,delivery_type').eq('destination_channel', 'admin').like('delivery_type', 'admin_%alert%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('telegram_deliveries').select('created_at,delivery_status,error_message,delivery_type').eq('destination_channel', 'admin').like('delivery_type', 'admin_%digest%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('telegram_deliveries').select('id', { count: 'exact', head: true }).eq('destination_channel', 'free').eq('delivery_type', 'free_selected_signal').eq('delivery_status', 'sent').gte('created_at', dayStart.toISOString()),
      supabase.from('telegram_deliveries').select('destination_channel,delivery_status,error_message,created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('execution_provider_controls').select('*').order('provider_name'),
      supabase.from('execution_provider_global_controls').select('*').eq('id', 1).maybeSingle(),
      supabase.from('provider_symbol_cache').select('provider,symbol,status').in('provider', ['binance', 'bybit']).limit(5000),
    ]);
    const statusPayload = statusRes as StatusPayload;
    setStatus(statusPayload);
    const recentSignals = (signalsRes.data ?? []) as Signal[];
    setSignals(recentSignals);
    setSelectedSignalId(current => recentSignals.some(s => s.id === current) ? current : (recentSignals[0]?.id || ''));
    setMonitorState((monitorRes.data ?? null) as ExecutionSettingsSnapshot | null);
    const health: OperatorRoutingSnapshot['telegram_health'] = {};
    for (const row of ((telegramHealthRes.data ?? []) as Array<{ destination_channel?: string; delivery_status?: string; error_message?: string; created_at?: string }>)) {
      const channel = row.destination_channel ?? 'unknown';
      if (!health[channel]) health[channel] = { latest_status: row.delivery_status, latest_error: row.error_message, latest_at: row.created_at };
    }
    setOperatorRouting({ last_admin_alert: adminAlertRes.data ?? null, last_admin_digest: adminDigestRes.data ?? null, free_selected_today: freeSelectedRes.count ?? 0, telegram_health: health });
    const controlsError = providerControlsRes.error ?? providerGlobalControlsRes.error;
    if (controlsError) {
      setProviderControlsError(classifyProviderControlsError(controlsError.message));
      setProviderControls([]);
      setProviderGlobalControls(null);
    } else {
      const controls = (providerControlsRes.data ?? []) as ProviderControl[];
      setProviderControls(controls);
      setProviderGlobalControls((providerGlobalControlsRes.data ?? null) as ProviderGlobalControls | null);
      setProviderControlsError(controls.length === 0 ? { kind: 'rows_missing', message: 'Provider controls rows missing.' } : { kind: '', message: '' });
    }
    setProviderSymbolCache(((providerSymbolCacheRes.data ?? []) as ProviderSymbolCacheRow[]));
    setLoading(false);
  }, [session]);

  async function callSelectedExecution(action: 'dry_run' | 'execute_signal' | 'manual_test_flow', extra: Record<string, unknown> = {}) {
    if (!selectedSignalId) {
      const data = { success: false, error: 'missing_signal_id' } as ActionResult;
      setResult(data);
      return data;
    }
    if (!signals.some(s => s.id === selectedSignalId)) {
      const data = { success: false, error: 'invalid_selected_signal', reason: 'Selected signal is stale or no longer in the refreshed dropdown.' } as ActionResult;
      setResult(data);
      await load();
      return data;
    }
    return callExecution(action, { signal_id: selectedSignalId, ...extra });
  }


  async function runBybitDebug(label: string) {
    const data = await callExecution('diagnose_bybit_testnet_connection', { debug_panel: label });
    setBybitDebug(data);
    return data;
  }

  async function resetTestnetGovernor() {
    await callExecution('reset_testnet_governor');
  }

  async function cleanStaleTestnetExecutions() {
    setCleaning(true);
    setCleanupMsg('Checking Binance testnet truth before clearing stale execution blockers...');
    try {
      const data = await callExecution('clean_stale_execution_rows', selectedSignalId ? { symbol } : {});
      if (!data.success) throw new Error(data.error ?? data.reason ?? 'cleanup failed');
      const cleaned = typeof data?.cleaned_count === 'number' ? data.cleaned_count : 0;
      const checked = typeof data?.symbols_checked === 'number' ? data.symbols_checked : 0;
      setCleanupMsg(`Clean stale testnet executions complete: ${cleaned} row(s) cleaned across ${checked} symbol(s).`);
      await load();
    } catch (err) {
      setCleanupMsg(`Clean stale testnet executions failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setCleaning(false);
    }
  }

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!session || requestedPrimaryProvider !== 'bybit' || !bybitDiagnosticsIncomplete) return;
    void supabase
      .from('execution_provider_global_controls')
      .update({ primary_provider: 'binance', live_trading_enabled: false, updated_at: new Date().toISOString() })
      .eq('id', 1);
  }, [bybitDiagnosticsIncomplete, requestedPrimaryProvider, session]);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Execution Overview</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Scanner → Arbitrator → Signal → Exchange Router → Exchange Adapters. Binance testnet remains the only active adapter — NOT LIVE.</p>
      </div>

      {governorMode === 'off_for_testing' && (
        <div className="bg-red-600/15 border border-red-500/40 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle size={18} className="text-red-300 mt-0.5 shrink-0" />
          <div className="text-sm text-red-200">
            <strong>TESTNET GOVERNOR OFF.</strong> Governor Mode: OFF_FOR_TESTING · Governor State: IGNORED · Execution Allowed: TRUE. Live trading remains impossible and monitor protection stays active.
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">GLOBAL CONTROL ROOM</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Entries, monitoring, recovery, kill switch and emergency stop are separate states. Kill switch blocks entries only; emergency stop blocks all engines.</p>
          </div>
          <Badge variant={existingPositionsProtected ? 'green' : 'red'}>Existing positions protected: {existingPositionsProtected ? 'YES' : 'NO'}</Badge>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Entries</div><div className={entryEngineOn ? 'text-emerald-300 mt-1' : 'text-red-300 mt-1'}>{entryEngineOn ? 'ON' : 'OFF'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Monitor</div><div className={monitorEngineOn ? 'text-emerald-300 mt-1' : 'text-red-300 mt-1'}>{monitorEngineOn ? 'ON' : 'OFF'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Recovery</div><div className={recoveryEngineOn ? 'text-emerald-300 mt-1' : 'text-red-300 mt-1'}>{recoveryEngineOn ? 'ON' : 'OFF'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Kill Switch</div><div className={killSwitchOn ? 'text-red-300 mt-1' : 'text-emerald-300 mt-1'}>{killSwitchOn ? 'ON' : 'OFF'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Emergency Stop</div><div className={emergencyStopOn ? 'text-red-300 mt-1' : 'text-emerald-300 mt-1'}>{emergencyStopOn ? 'ON' : 'OFF'}</div></div>
        </div>
      </div>

      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-sm text-yellow-300/90">
          <strong>Testnet only.</strong> Live trading is blocked by env and database guards. API keys stay server-side in Supabase Edge Function secrets and are never shown here.
        </div>
      </div>


      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Execution Overview</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Provider-aware execution routing foundation. Binance remains operational; Bybit and MT5 are placeholders until adapters are enabled.</p>
          </div>
          <select
            value={selectedProvider}
            onChange={(event) => setSelectedProvider(event.target.value as 'all' | 'binance' | 'bybit' | 'mt5')}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
          >
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
            <option value="mt5">MT5</option>
            <option value="all">All Providers</option>
          </select>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {providerCards.map((card) => (
            <button
              key={card.provider}
              type="button"
              onClick={() => setSelectedProvider(card.provider)}
              className={`text-left rounded-xl border p-4 transition-colors ${selectedProvider === card.provider ? 'border-blue-500/50 bg-blue-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold uppercase text-sm text-zinc-100">{card.provider}</div>
                <Badge variant={card.provider === 'binance' ? 'green' : 'gray'}>{card.provider === 'binance' ? 'adapter ready' : 'pending'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div><div className="text-zinc-500">Active Positions</div><div className="font-mono text-zinc-200">{card.active.length}</div></div>
                <div><div className="text-zinc-500">Executions</div><div className="font-mono text-zinc-200">{card.rows.length}</div></div>
                <div><div className="text-zinc-500">PnL</div><div className={`font-mono ${card.pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{card.pnl.toFixed(2)}</div></div>
                <div><div className="text-zinc-500">Protection Health</div><div className="font-mono text-zinc-200">{card.active.length ? `${card.protectedCount}/${card.active.length}` : '—'}</div></div>
                <div><div className="text-zinc-500">Recovery Health</div><div className={card.recoveryFailures ? 'font-mono text-yellow-300' : 'font-mono text-emerald-300'}>{card.recoveryFailures ? `${card.recoveryFailures} issue(s)` : 'OK'}</div></div>
                <div><div className="text-zinc-500">Monitor Health</div><div className="font-mono text-zinc-200">{card.provider === 'binance' ? monitorTruthStatus : (providerStatus.get(card.provider)?.monitor_enabled ? 'Enabled' : 'Off')}</div></div>
                <div className="col-span-2"><div className="text-zinc-500">Profit Lock Status</div><div className="font-mono text-zinc-200">{card.profitLockActive} locked/protected</div></div>
              </div>
            </button>
          ))}
        </div>
      </div>


      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Execution Proof Panel</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Latest 20 approved A/A+ signals with provider rows, submitted order proof, and exact blocker text. No live trading.</p>
          </div>
          <button type="button" disabled={acting} onClick={() => callExecution('execute_latest_approved_signal')} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:border-emerald-400">Execute Latest Approved Signal on Enabled Testnet Providers</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="py-2 pr-3 text-left">signal</th><th className="py-2 pr-3 text-left">grade</th><th className="py-2 pr-3 text-left">should execute</th><th className="py-2 pr-3 text-left">Binance result</th><th className="py-2 pr-3 text-left">Bybit result</th><th className="py-2 pr-3 text-left">blocker</th><th className="py-2 pr-3 text-left">created execution row</th><th className="py-2 pr-3 text-left">submitted order</th><th className="py-2 pr-3 text-left">error</th>
              </tr>
            </thead>
            <tbody>
              {approvedExecutionProofRows.map(({ signal, binance, bybit, blocker, created, submitted, shouldExecute, binanceSupported, bybitSupported, setupBlocker, supportBlocker }) => (
                <tr key={signal.id} className="border-b border-zinc-900 text-zinc-300">
                  <td className="py-2 pr-3 font-mono">{signal.symbol} <span className="text-zinc-600">{signal.id.slice(0, 8)}</span></td>
                  <td className="py-2 pr-3">{signal.grade}</td>
                  <td className={shouldExecute ? 'py-2 pr-3 text-emerald-300' : 'py-2 pr-3 text-yellow-300'}>{shouldExecute ? 'yes' : 'research-only'}</td>
                  <td className="py-2 pr-3">{binance?.status ?? (binanceSupported ? 'no row' : 'unsupported')}</td>
                  <td className="py-2 pr-3">{bybit?.status ?? (bybitSupported ? 'no row' : 'unsupported')}</td>
                  <td className="py-2 pr-3 text-yellow-300">{String(blocker?.latest_auto_skip_reason || blocker?.error_message || blocker?.last_exchange_error || setupBlocker || supportBlocker || '—')}</td>
                  <td className="py-2 pr-3">{created ? 'yes' : 'no'}</td>
                  <td className="py-2 pr-3">{submitted ? 'yes' : 'no'}</td>
                  <td className="py-2 pr-3 text-red-300">{String(blocker?.error_message ?? blocker?.last_exchange_error ?? '—')}</td>
                </tr>
              ))}
              {approvedExecutionProofRows.length === 0 && <tr><td colSpan={9} className="py-4 text-zinc-500">No approved A/A+ signals loaded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Provider Controls</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Global: Testnet execution {status?.settings?.auto_execute_testnet ? 'ON' : 'OFF'} · Parallel mode {providerGlobalControls?.parallel_mode_enabled ? 'ON' : 'OFF'} · Primary {effectivePrimaryProvider} · Live Trading: OFF. Providers expose independent Entry, Monitor, Recovery and Kill Switch state.</p>
          </div>
          <Badge variant={providerGlobalControls?.parallel_mode_enabled ? 'blue' : 'gray'}>{providerGlobalControls?.parallel_mode_enabled ? 'Parallel Mode ON' : 'Parallel Mode OFF'}</Badge>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <button type="button" onClick={() => updateProviderGlobalControls({ parallel_mode_enabled: !providerGlobalControls?.parallel_mode_enabled })} className={`rounded-lg border px-3 py-2 text-sm ${providerGlobalControls?.parallel_mode_enabled ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>Parallel Mode: {providerGlobalControls?.parallel_mode_enabled ? 'ON' : 'OFF'}</button>
          <label className="text-sm text-zinc-400 flex items-center gap-2">Primary Provider
            <select value={effectivePrimaryProvider} onChange={(event) => updateProviderGlobalControls({ primary_provider: event.target.value as 'binance' | 'bybit' | 'mt5' })} className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="binance">Binance</option><option value="bybit" disabled={!bybitConnected}>Bybit</option><option value="mt5" disabled={providerStatus.get('mt5')?.status !== 'connected'}>MT5</option>
            </select>
          </label>
          <button type="button" onClick={() => runBybitDebug('health')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Test Bybit Connection <span className="sr-only">Bybit Health Check</span></button>
          <button type="button" onClick={() => runBybitDebug('account_capital')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Diagnose Bybit Account <span className="sr-only">Bybit Account/Capital Debug</span></button>
          <button type="button" onClick={() => runBybitDebug('balances')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Fetch Balances</button>
          <button type="button" onClick={() => runBybitDebug('positions_orders')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Fetch Positions / Fetch Orders <span className="sr-only">Bybit Positions/Orders Debug</span></button>
          <button type="button" onClick={() => runBybitDebug('symbols')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Validate Symbols</button>
          <button type="button" onClick={() => runBybitDebug('dry_run_signal')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-blue-500/40">Dry Run Signal</button>
          <Badge variant="gray">Live Trading: OFF</Badge>
        </div>
        {providerSafetyWarning && <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">{providerSafetyWarning}. Primary Provider forced to Binance until Bybit health is connected.</div>}
        {providerControlsError.message && <div className={`mb-4 rounded-lg border p-3 text-sm ${providerControlsError.kind === 'rls_blocked' || providerControlsError.kind === 'missing_table' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'}`}>{providerControlsError.message}</div>}
        <div className="grid md:grid-cols-3 gap-3">
          {providerControls.map((control) => (
            <div key={control.provider_name} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-semibold uppercase text-sm">{control.provider_name}</div>
                <Badge variant={control.provider_kill_switch ? 'red' : control.status === 'connected' ? 'green' : control.status === 'degraded' ? 'yellow' : 'gray'}>{control.provider_kill_switch ? 'kill switch' : control.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['enabled', 'ON/OFF'],
                  ['entry_enabled', 'Entry'],
                  ['read_only', 'Read-only'],
                  ['profit_lock_enabled', 'Profit Lock'],
                  ['monitor_enabled', 'Monitor'],
                  ['protection_recovery_enabled', 'Recovery'],
                  ['provider_kill_switch', 'Kill Switch'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateProviderControl(control.provider_name, { [key]: !Boolean(control[key as keyof ProviderControl]) } as Partial<ProviderControl>)}
                    className={`rounded-lg border px-2 py-2 text-left ${Boolean(control[key as keyof ProviderControl]) ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}
                  >
                    {label}: {Boolean(control[key as keyof ProviderControl]) ? 'ON' : 'OFF'}
                  </button>
                ))}
              </div>
              {control.last_error && <div className="mt-3 text-xs text-red-300">{control.last_error}</div>}
            </div>
          ))}
          {providerControls.length === 0 && !providerControlsError.message && <div className="text-sm text-zinc-500">Provider controls rows missing.</div>}
        </div>
      </div>


      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Bybit Testnet Monitor</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Read-only Bybit diagnostics for health, account/capital, positions and open orders. These controls never place trades.</p>
          </div>
          <Badge variant={bybitDebug?.connected ? 'green' : 'gray'}>{bybitDebug?.connected ? 'Connected' : 'Empty / not checked'}</Badge>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Health</div><div className={bybitDebug?.connected ? 'text-emerald-300 mt-1' : 'text-zinc-400 mt-1'}>{bybitDebug ? (bybitDebug.connected ? 'healthy' : 'not connected') : 'No Bybit health check run'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Safe For Test Order</div><div className="text-zinc-200 mt-1">{bybitDebug?.safe_for_test_order ? 'YES' : 'NO'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Capital Rows</div><div className="text-zinc-200 mt-1">{bybitDebug?.balances?.length ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Positions / Orders</div><div className="text-zinc-200 mt-1">{bybitDebug?.positions?.length ?? 0} / {bybitDebug?.open_orders?.length ?? 0}</div></div>
        </div>
        <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400" open={Boolean(bybitDebug)}>
          <summary className="cursor-pointer text-zinc-300">Bybit account/capital/positions/orders raw debug</summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify({ checks: bybitDebug?.checks ?? {}, balances: bybitDebug?.balances ?? [], positions: bybitDebug?.positions ?? [], open_orders: bybitDebug?.open_orders ?? [], missing_permissions: bybitDebug?.missing_permissions ?? [], error_reason: bybitDebug?.error_reason ?? null }, null, 2)}</pre>
        </details>
      </div>

      {/* Bot State Control Panel */}
      {(() => {
        const killActive = status?.settings?.kill_switch_enabled === true;
        const paused = status?.settings?.bot_paused === true;
        const running = !killActive && !paused && status?.settings?.auto_execute_testnet === true;
        const botState = killActive ? 'kill_switch' : paused ? 'paused' : running ? 'running' : 'idle';
        const autoOffReason = killActive
          ? 'OFF because kill_switch_enabled=true'
          : paused
            ? `OFF because bot_paused=true${status?.settings?.bot_paused_reason ? ` (${status.settings.bot_paused_reason})` : ''}`
            : status?.settings?.auto_execute_testnet !== true
              ? 'OFF because auto_execute_testnet=false'
              : 'ON';
        const stateConfig = {
          kill_switch: { label: 'Kill Switch ON', sub: 'No new entries. Monitor still manages open positions.', ring: 'border-red-500/50', bg: 'bg-red-500/10', dot: 'bg-red-400', text: 'text-red-300' },
          paused:      { label: 'Bot Paused',     sub: 'No new entries. Monitor still manages open positions.', ring: 'border-yellow-500/50', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', text: 'text-yellow-300' },
          running:     { label: 'Bot Running',    sub: 'Auto-executing qualified scanner signals.', ring: 'border-emerald-500/50', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', text: 'text-emerald-300' },
          idle:        { label: 'Idle (auto-off)', sub: 'Auto-execute is disabled. Manual execution still works.', ring: 'border-zinc-600', bg: 'bg-zinc-800/50', dot: 'bg-zinc-500', text: 'text-zinc-400' },
        }[botState];
        return (
          <div className={`rounded-xl border p-5 mb-6 ${stateConfig.ring} ${stateConfig.bg}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`inline-block w-3 h-3 rounded-full ${stateConfig.dot} animate-pulse shrink-0`} />
                <div>
                  <div className={`font-semibold ${stateConfig.text}`}>{stateConfig.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{stateConfig.sub}</div>
                  {paused && status?.settings?.bot_paused_reason && (
                    <div className="text-xs text-yellow-300/80 mt-1">Pause reason: {status.settings.bot_paused_reason}</div>
                  )}
                  <div className="text-xs text-zinc-400 mt-1">Auto execution reason: {autoOffReason}</div>
                  <div className="text-xs text-zinc-600 mt-1">Scanner, Signal Mode, Telegram signals and outcome tracking are unaffected by bot state.</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  disabled={acting}
                  onClick={() => updateExecutionSettings({ start_bot: true, provider: selectedProvider === 'all' ? effectivePrimaryProvider : selectedProvider, auto_execute_testnet: true, testnet_enabled: true, execution_mode: 'testnet', bot_paused: false, bot_paused_reason: null, kill_switch_enabled: false, live_trading_enabled: false })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors">
                  <CheckCircle2 size={14} />Start Bot
                </button>
                <button
                  disabled={acting || !entryEngineOn}
                  onClick={() => updateExecutionSettings({ pause_entries: true, provider: selectedProvider === 'all' ? effectivePrimaryProvider : selectedProvider, bot_paused: false, bot_paused_reason: 'Entries paused by admin; monitor/recovery remain enabled' })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-yellow-600 hover:bg-yellow-500 text-white disabled:opacity-40 transition-colors">
                  <PauseCircle size={14} />Pause Bot
                </button>
                <button
                  disabled={acting || selectedProviderControl?.provider_kill_switch === true}
                  onClick={() => updateExecutionSettings({ provider_kill_switch: true, provider: selectedProvider === 'all' ? effectivePrimaryProvider : selectedProvider, kill_switch_enabled: false })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 transition-colors">
                  <StopCircle size={14} />Kill Switch
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-zinc-500">Auto-Execute</div>
                <div className={`font-mono mt-1 ${status?.settings?.auto_execute_testnet ? 'text-emerald-300' : 'text-zinc-400'}`}>{status?.settings?.auto_execute_testnet ? 'ON' : 'OFF'}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-zinc-500">Governor</div>
                <div className={`font-mono mt-1 ${governorMode === 'off_for_testing' ? 'text-red-300' : status?.settings?.governor_state === 'paused' ? 'text-red-300' : status?.settings?.governor_state === 'defensive' ? 'text-yellow-300' : status?.settings?.governor_state === 'aggressive_allowed' ? 'text-blue-300' : 'text-emerald-300'}`}>{governorMode} / {governorDisplayState}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-zinc-500">Open Positions</div>
                <div className="font-mono mt-1 text-zinc-200">{openExecutions.length} / {status?.settings?.max_open_testnet_positions ?? 3}</div>
              </div>
            </div>
          </div>
        );
      })()}


      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Binance Testnet Monitor</h2>
            <p className="text-xs text-zinc-500 mt-0.5">1-minute bot supervisor snapshot. Binance Demo only — live trading remains disabled.</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${monitorTruth.level === 'critical' || monitorTruth.level === 'stale' ? 'border-red-500/30 bg-red-500/10 text-red-300' : monitorTruth.level === 'warning' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
            {monitorTruthStatus} · {monitorResultStatus}
          </span>
        </div>
        <div className="grid sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Last Run</div><div className="text-zinc-200 mt-1">{monitorState?.latest_monitor_run_at ? new Date(monitorState.latest_monitor_run_at).toLocaleString() : '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Open Positions</div><div className="text-zinc-200 mt-1">{monitorState?.open_positions_count ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Open Orders</div><div className="text-zinc-200 mt-1">{monitorState?.open_binance_orders?.length ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Unrealized PnL</div><div className="text-zinc-200 mt-1">{monitorState?.unrealized_pnl ?? '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Wallet</div><div className="text-zinc-200 mt-1">{monitorState?.account_total_wallet_balance ?? '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Stale Cleaned</div><div className="text-zinc-200 mt-1">{monitorState?.stale_rows_cleaned ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Account Fetch</div><div className="text-zinc-200 mt-1">{monitorState?.latest_account_state_at ? new Date(monitorState.latest_account_state_at).toLocaleString() : '—'}</div></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs mt-3">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Reconciled Symbols</div><div className="text-zinc-200 mt-1">{String(reconciliationSummary.symbols_checked ?? 0)}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Stale / Orphan Orders</div><div className="text-zinc-200 mt-1">{String(reconciliationSummary.stale_or_orphan_order_count ?? 0)}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Duplicate Conditionals</div><div className="text-zinc-200 mt-1">{String(reconciliationSummary.duplicate_conditional_count ?? 0)}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Unprotected Positions</div><div className={(Number(reconciliationSummary.unprotected_position_count ?? 0) > 0 ? 'text-red-300' : 'text-emerald-300') + ' mt-1'}>{String(reconciliationSummary.unprotected_position_count ?? 0)}</div></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs mt-3">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Last Admin Alert</div><div className="text-zinc-200 mt-1">{operatorRouting.last_admin_alert?.created_at ? `${new Date(operatorRouting.last_admin_alert.created_at).toLocaleString()} · ${operatorRouting.last_admin_alert.delivery_status}` : '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Last Admin Digest</div><div className="text-zinc-200 mt-1">{operatorRouting.last_admin_digest?.created_at ? `${new Date(operatorRouting.last_admin_digest.created_at).toLocaleString()} · ${operatorRouting.last_admin_digest.delivery_status}` : '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Free Selected Today</div><div className="text-zinc-200 mt-1">{operatorRouting.free_selected_today ?? 0} / 2</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Telegram Health</div><div className="text-zinc-200 mt-1">admin {operatorRouting.telegram_health?.admin?.latest_status ?? '—'} · free {operatorRouting.telegram_health?.free?.latest_status ?? '—'} · vip {operatorRouting.telegram_health?.vip?.latest_status ?? '—'}</div></div>
        </div>
        {monitorUnhealthyReason && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
            Monitor truth guard: unhealthy because {monitorUnhealthyReason}. UI does not mark the monitor healthy unless the latest run is recent and non-critical.
          </div>
        )}
        <div className="mt-3 grid sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Monitor Truth</div><div className="text-zinc-200 mt-1">{monitorTruth.label}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Latest Short Error</div><div className="text-zinc-200 mt-1">{shortOperatorText(monitorState?.latest_monitor_error || monitorState?.latest_sync_error || 'None')}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Truth Reason</div><div className="text-zinc-200 mt-1">{monitorTruth.reason}</div></div>
        </div>
        <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">View raw details</summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify({ latest_monitor_result: monitorState?.latest_monitor_result ?? {}, open_binance_positions: monitorState?.open_binance_positions ?? [], open_binance_orders: monitorState?.open_binance_orders ?? [], last_managed_exit_action: monitorState?.last_managed_exit_action ?? {} }, null, 2)}</pre>
        </details>
        {(monitorState?.latest_monitor_error || monitorState?.latest_sync_error) && (
          <div className="mt-2 text-xs text-red-300 font-mono truncate" title={`${monitorState?.latest_monitor_error ?? ''} ${monitorState?.latest_sync_error ?? ''}`}>
            Monitor error: {monitorState?.latest_monitor_error || '—'} · Sync error: {monitorState?.latest_sync_error || '—'}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={cleanStaleTestnetExecutions}
            disabled={cleaning}
            title="Checks Binance testnet positions/orders before marking stale DB blockers closed"
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-amber-300 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {cleaning
              ? <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
              : <Trash2 size={13} />}
            Clean stale testnet executions
          </button>
          {cleanupMsg && <span className="text-xs text-zinc-400">{cleanupMsg}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <StatusCard icon={<Cpu size={14} />} label="Execution Mode" value={status?.env?.execution_mode ?? 'signal_only'} note="Default remains signal_only" />
        <StatusCard icon={<Shield size={14} />} label="Testnet Enabled" value={status?.env?.testnet_enabled ? 'YES' : 'NO'} valueClass={status?.env?.testnet_enabled ? 'text-emerald-400' : 'text-zinc-500'} note="Requires TESTNET_ENABLED=true" />
        <StatusCard icon={<XCircle size={14} />} label="Kill Switch" value={status?.settings?.kill_switch_enabled ? 'ON' : 'OFF'} valueClass={status?.settings?.kill_switch_enabled ? 'text-red-400' : 'text-emerald-400'} note="DB admin safety switch" />
        <StatusCard icon={<Activity size={14} />} label="Open / Max" value={`${openExecutions.length} / ${status?.settings?.max_open_testnet_positions ?? 3}`} note="One active per symbol by default" />
      </div>


      <div className="grid xl:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-sm">USDT/USDC Capital Controls</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Admin controls for existing X-B margin fallback flags only.</p>
            </div>
            <StatusBadge active={status?.settings?.enable_usdc_margin_backup === true} activeLabel="USDC BACKUP ON" inactiveLabel="USDC BACKUP OFF" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="font-semibold text-sm">USDC Margin Backup</div>
                <ToggleButtons disabled={acting} value={status?.settings?.enable_usdc_margin_backup === true} onToggle={value => updateExecutionSettings({ enable_usdc_margin_backup: value })} />
              </div>
              <p className="text-xs text-zinc-500 mb-3">If USDT margin is insufficient, attempt USDC-supported contract execution when available.</p>
              <div className="space-y-2 text-xs">
                <ProofRow label="Current setting" value={status?.settings?.enable_usdc_margin_backup ? 'ON' : 'OFF'} />
                <ProofRow label="Last fallback attempt" value={lastFallbackAttempt?.updated_at ? new Date(lastFallbackAttempt.updated_at).toLocaleString() : lastFallbackAttempt?.created_at ? new Date(lastFallbackAttempt.created_at).toLocaleString() : '—'} />
                <ProofRow label="Successful fallbacks" value={String(successfulFallbacks)} />
                <ProofRow label="Failed fallbacks" value={String(failedFallbacks)} />
                <ProofRow label="Unsupported symbol count" value={String(unsupportedSymbolCount)} />
              </div>
            </div>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
              <label className="block text-xs text-zinc-500 mb-1.5">Preferred Margin Asset</label>
              <select value={status?.settings?.prefer_margin_asset ?? 'USDT'} disabled={acting} onChange={e => updateExecutionSettings({ prefer_margin_asset: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-3">
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
              <ProofRow label="Current active asset preference" value={String(status?.settings?.prefer_margin_asset ?? 'USDT')} />
              <div className="mt-4 text-xs text-zinc-500 mb-2">Margin Asset Allow List</div>
              <div className="flex gap-3 mb-3">
                {['USDT', 'USDC'].map(asset => (
                  <label key={asset} className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input type="checkbox" checked={allowMarginAssets.includes(asset)} disabled={acting} onChange={e => {
                      const next = new Set(allowMarginAssets);
                      if (e.target.checked) next.add(asset); else next.delete(asset);
                      updateExecutionSettings({ allow_margin_assets: Array.from(next).sort().join(',') || 'USDT' });
                    }} /> {asset}
                  </label>
                ))}
              </div>
              <ProofRow label="Runtime value" value={String(status?.settings?.allow_margin_assets ?? 'USDT,USDC')} />
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
            <h3 className="font-semibold text-sm mb-3">Margin Diagnostics</h3>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <ProofRow label="Available USDT" value={String(status?.capital?.raw_available_usdt ?? status?.account_state?.availableUsdt ?? '—')} />
              <ProofRow label="Available USDC" value={String(status?.capital?.raw_available_usdc ?? status?.account_state?.availableUsdc ?? '—')} />
              <ProofRow label="Last insufficient margin event" value={String(status?.last_insufficient_margin?.reason ?? '—')} />
              <ProofRow label="Last fallback reason" value={String(lastFallbackAttempt?.insufficient_margin_reason ?? status?.last_insufficient_margin?.reason ?? '—')} />
              <ProofRow label="Last exchange rejection" value={String(status?.latest_error?.last_exchange_error ?? status?.latest_error?.error_message ?? '—')} />
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-sm">Profit Lock Control Panel</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Expose existing X-B profit-lock flags and runtime state without changing strategy logic.</p>
            </div>
            <ModeBadge mode={profitLockMode} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <ControlCard title="Profit Lock Engine" status={status?.settings?.enable_profit_lock_engine === true} onToggle={value => updateExecutionSettings({ enable_profit_lock_engine: value })} disabled={acting}>
              <ProofRow label="Current mode" value={profitLockMode} />
              <ProofRow label="Maps to" value="enable_profit_lock_engine" />
            </ControlCard>
            <ControlCard title="Testnet Profit Lock" status={status?.settings?.enable_testnet_profit_lock_engine === true} onToggle={value => updateExecutionSettings({ enable_testnet_profit_lock_engine: value })} disabled={acting}>
              <ProofRow label="Maps to" value="enable_testnet_profit_lock_engine" />
              <div className="mt-2 text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/20 rounded p-2">Only affects Binance Testnet.</div>
            </ControlCard>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4 text-xs">
            <label className="block rounded-lg bg-zinc-950/60 border border-zinc-800 p-4"><span className="text-zinc-500">Before TP1 Profit Lock</span><select value={status?.settings?.profit_lock_before_tp1 ?? 'research_only'} disabled={acting} onChange={e => updateExecutionSettings({ profit_lock_before_tp1: e.target.value, profit_lock_before_tp1_testnet_allowed: e.target.value === 'testnet_action' })} className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2"><option value="disabled">DISABLED</option><option value="research_only">RESEARCH ONLY</option><option value="testnet_action">TESTNET ACTION</option></select><div className="mt-2 text-zinc-500">Maps to profit_lock_before_tp1</div></label>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4"><div className="flex items-center justify-between gap-3"><span className="text-zinc-500">Profit Lock After TP1</span><ToggleButtons disabled={acting} value={status?.settings?.profit_lock_after_tp1 !== false} onToggle={value => updateExecutionSettings({ profit_lock_after_tp1: value })} /></div><div className="mt-2 text-zinc-500">Maps to profit_lock_after_tp1</div></div>
          </div>
          <div className="mt-4 rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
            <h3 className="font-semibold text-sm mb-3">Profit Lock Parameters</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <NumberSetting label="Profit Lock Min R" value={status?.settings?.profit_lock_min_r ?? 0.3} step="0.01" onChange={value => updateExecutionSettings({ profit_lock_min_r: value })} disabled={acting} />
              <NumberSetting label="Aggressive Min R" value={status?.settings?.profit_lock_aggressive_min_r ?? 0.15} step="0.01" onChange={value => updateExecutionSettings({ profit_lock_aggressive_min_r: value })} disabled={acting} />
              <NumberSetting label="Buffer R" value={status?.settings?.profit_lock_buffer_r ?? 0.03} step="0.01" onChange={value => updateExecutionSettings({ profit_lock_buffer_r: value })} disabled={acting} />
              <NumberSetting label="Cooldown Minutes" value={status?.settings?.profit_lock_cooldown_minutes ?? 5} step="1" onChange={value => updateExecutionSettings({ profit_lock_cooldown_minutes: value })} disabled={acting} />
              <NumberSetting label="Max Updates Per Trade" value={status?.settings?.profit_lock_max_updates_per_trade ?? 3} step="1" onChange={value => updateExecutionSettings({ profit_lock_max_updates_per_trade: value })} disabled={acting} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-3">Live Status Panel</h2>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <ProofRow label="Profit Lock Engine" value={status?.settings?.enable_profit_lock_engine ? 'ON' : 'OFF'} />
            <ProofRow label="Testnet Action" value={status?.settings?.enable_testnet_profit_lock_engine ? 'ON' : 'OFF'} />
            <ProofRow label="Current Mode" value={profitLockMode} />
            <ProofRow label="Open Trades Under Monitoring" value={String(openTradesUnderMonitoring)} />
            <ProofRow label="Trades Eligible For Lock" value={String(tradesEligibleForLock)} />
            <ProofRow label="Trades Already Locked" value={String(tradesAlreadyLocked)} />
            <ProofRow label="SL Replacements Verified" value={String(slReplacementsVerified)} />
            <ProofRow label="SL Replacement Failures" value={String(slReplacementFailures)} />
            <ProofRow label="Old SL Preserved Count" value={String(oldSlPreservedCount)} />
            <ProofRow label="Recovery Success Rate" value={recoverySuccessRate} />
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-3">Safety Guards</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <GuardBadge label="LIVE TRADING" value="DISABLED" tone="red" />
            <GuardBadge label="TESTNET" value={status?.env?.testnet_enabled ? 'ACTIVE' : 'DISABLED'} tone={status?.env?.testnet_enabled ? 'green' : 'red'} />
            <GuardBadge label="USDC BACKUP" value={status?.settings?.enable_usdc_margin_backup ? 'ON' : 'OFF'} tone={status?.settings?.enable_usdc_margin_backup ? 'green' : 'red'} />
            <GuardBadge label="PROFIT LOCK" value={status?.settings?.enable_profit_lock_engine ? 'ON' : 'OFF'} tone={status?.settings?.enable_profit_lock_engine ? (profitLockMode === 'study_only' ? 'yellow' : 'green') : 'red'} />
            <GuardBadge label="BEFORE TP1 ACTION" value={status?.settings?.profit_lock_before_tp1 === 'testnet_action' ? 'ON' : 'OFF'} tone={status?.settings?.profit_lock_before_tp1 === 'research_only' ? 'yellow' : status?.settings?.profit_lock_before_tp1 === 'testnet_action' ? 'green' : 'red'} />
            <GuardBadge label="AFTER TP1 ACTION" value={status?.settings?.profit_lock_after_tp1 !== false ? 'ON' : 'OFF'} tone={status?.settings?.profit_lock_after_tp1 !== false ? 'green' : 'red'} />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-sm">Risk Governor / PnL Brain</h2>
          <div className="flex gap-2">
            <ActionButton disabled={acting} onClick={() => callExecution('refresh_account_state')} icon={<RefreshCw size={14} />} label="Refresh Binance Account State" />
            <ActionButton disabled={acting} onClick={() => callExecution('evaluate_governor')} icon={<Shield size={14} />} label="Re-evaluate Governor" />
            <ActionButton disabled={acting} onClick={() => updateExecutionSettings({ testnet_governor_mode: 'normal' })} icon={<Shield size={14} />} label="Governor Normal" />
            <ActionButton disabled={acting} onClick={() => updateExecutionSettings({ testnet_governor_mode: 'readonly' })} icon={<Shield size={14} />} label="Governor Readonly" />
            <ActionButton disabled={acting} onClick={() => updateExecutionSettings({ testnet_governor_mode: 'off_for_testing' })} icon={<AlertTriangle size={14} />} label="Governor Off For Testing" danger />
            <ActionButton disabled={acting} onClick={resetTestnetGovernor} icon={<RotateCcw size={14} />} label="Reset Testnet Governor / Start New Test Day" danger />
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3 text-xs">
          <ProofRow label="Governor mode" value={governorMode} />
          <ProofRow label="Governor enabled" value={status?.settings?.governor_enabled ? 'true' : 'false'} />
          <ProofRow label="Governor state" value={governorDisplayState} />
          <ProofRow label="Governor reason" value={status?.governor?.reason ?? status?.settings?.last_governor_reason ?? '—'} />
          <ProofRow label="Current equity" value={String(status?.governor?.current_equity ?? status?.settings?.current_equity ?? '—')} />
          <ProofRow label="Daily start equity" value={String(status?.settings?.daily_start_equity ?? '—')} />
          <ProofRow label="Daily realized PnL" value={String(status?.settings?.daily_realized_pnl ?? '—')} />
          <ProofRow label="Daily PnL %" value={String(status?.governor?.daily_pnl_pct ?? status?.settings?.daily_pnl_pct ?? '—')} />
          <ProofRow label="Unrealized PnL" value={String(status?.governor?.unrealized_pnl ?? status?.settings?.daily_unrealized_pnl ?? '—')} />
          <ProofRow label="Open positions" value={String(status?.account_state?.openPositions ?? status?.settings?.account_open_positions ?? '—')} />
          <ProofRow label="Open orders" value={String(status?.account_state?.openOrderCount ?? status?.settings?.account_open_order_count ?? '—')} />
          <ProofRow label="Available balance" value={String(status?.account_state?.availableBalance ?? status?.settings?.account_available_balance ?? '—')} />
          <ProofRow label="Margin ratio" value={String(status?.account_state?.marginRatio ?? status?.settings?.account_margin_ratio ?? '—')} />
          <ProofRow label="Max daily loss %" value={`${status?.settings?.max_daily_loss_pct ?? '—'}%`} />
          <ProofRow label="Max unrealized DD %" value={`${status?.settings?.max_unrealized_drawdown_pct ?? '—'}%`} />
          <ProofRow label="Failed execution streak" value={String(status?.settings?.failed_execution_streak ?? 0)} />
          <ProofRow label="Closed SL streak" value={String(status?.settings?.closed_sl_streak ?? 0)} />
          <ProofRow label="Risk multiplier" value={String(status?.governor?.risk_multiplier ?? '—')} />
          <ProofRow label="Effective max lev" value={`${status?.governor?.adjusted_max_leverage ?? status?.settings?.testnet_max_leverage ?? 7}x`} />
          <ProofRow label="Effective risk %" value={status?.governor?.state === 'defensive' ? '0.5x configured' : status?.governor?.state === 'aggressive_allowed' ? 'A 0.75 / A+ 1.0 cap' : 'configured'} />
          <ProofRow label="Last checked" value={status?.settings?.last_governor_checked_at ? new Date(status.settings.last_governor_checked_at).toLocaleString() : '—'} />
          <ProofRow label="Execution allowed" value={String(executionAllowedDisplay)} />
        </div>
        {governorMode === 'off_for_testing' && <div className="mt-3 text-xs text-red-200 bg-red-500/10 border border-red-500/20 rounded p-3">Governor Mode: OFF_FOR_TESTING · Governor State: IGNORED · Execution Allowed: TRUE. Historical governor reasons remain visible, but new Binance Testnet entries are not governor-blocked. Live trading remains blocked.</div>}
        {governorMode === 'readonly' && <div className="mt-3 text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/20 rounded p-3">Governor readonly: PnL/risk/streaks are calculated and warnings remain visible, but testnet entries are not governor-blocked.</div>}
        <div className="mt-3 text-xs text-zinc-400">Governor reset is testnet-only and does not delete signals, scanner runs, performance history, Binance positions, or Binance orders.</div>
        {(status?.governor?.state === 'paused' || status?.settings?.governor_state === 'paused') && (
          <div className="mt-3 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            Admin action needed: review kill switch, account PnL/drawdown, consecutive failure/SL streaks, and governor thresholds. HashiBot will not silently unpause execution.
          </div>
        )}
        {status?.account_state?.positions && status.account_state.positions.length > 0 && <div className="mt-3 text-xs text-zinc-500 font-mono">Positions: {status.account_state.positions.map(p => `${p.symbol} size ${p.positionAmt} uPnL ${p.unrealizedPnl}`).join(' · ')}</div>}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Auto Execution Gate</h2>
          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Auto-execute new scanner signals</span>
              <button disabled={acting} onClick={() => updateExecutionSettings({ auto_execute_testnet: !status?.settings?.auto_execute_testnet })} className={`px-3 py-1 rounded-full border text-xs ${status?.settings?.auto_execute_testnet ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{status?.settings?.auto_execute_testnet ? 'ON' : 'OFF'}</button>
            </label>
            <ProofRow label="DB mode" value={status?.settings?.execution_mode ?? 'signal_only'} />
            <ProofRow label="DB testnet" value={status?.settings?.testnet_enabled ? 'true' : 'false'} />
            <ProofRow label="One active/symbol" value={status?.settings?.one_active_execution_per_symbol ? 'true' : 'false'} />
            <ProofRow label="Max open positions" value={String(status?.settings?.max_open_testnet_positions ?? 3)} />
            <ProofRow label="Max total open risk" value={stressMode && status?.settings?.stress_ignore_open_risk_limit ? 'IGNORED_FOR_STRESS_TEST' : `${status?.settings?.max_total_open_risk_pct ?? 3}%`} />
            <ProofRow label="Current open risk" value={stressMode && status?.settings?.stress_ignore_open_risk_limit ? 'IGNORED_FOR_STRESS_TEST' : `${status?.current_open_risk_pct ?? 0}%`} />
            <ProofRow label="Remaining risk" value={stressMode && status?.settings?.stress_ignore_open_risk_limit ? 'IGNORED_FOR_STRESS_TEST' : `${status?.remaining_risk_capacity_pct ?? 0}%`} />
            <label className="block pt-2"><span className="text-zinc-500">Set max open (1-10)</span><input type="number" min={1} max={10} value={status?.settings?.max_open_testnet_positions ?? 3} onChange={e => updateExecutionSettings({ max_open_testnet_positions: Math.min(10, Math.max(1, Number(e.target.value))) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Capital Basis</h2>
          <select value={status?.settings?.capital_basis ?? 'available_usdt'} disabled={acting} onChange={e => updateExecutionSettings({ capital_basis: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-3">
            <option value="available_usdt">available_usdt</option>
            <option value="available_usdc_plus_usdt">available_usdc_plus_usdt</option>
            <option value="total_margin_balance">total_margin_balance</option>
            <option value="total_wallet_balance">total_wallet_balance</option>
            <option value="manual_override">manual_override</option>
          </select>
          <div className="space-y-2 text-xs">
            <ProofRow label="Selected capital" value={String(status?.capital?.selected_capital_used ?? '—')} />
            <ProofRow label="Total margin" value={String(status?.capital?.raw_total_margin_balance ?? '—')} />
            <ProofRow label="Total wallet" value={String(status?.capital?.raw_total_wallet_balance ?? '—')} />
            <ProofRow label="Available USDT" value={String(status?.capital?.raw_available_usdt ?? '—')} />
            <ProofRow label="Available USDC" value={String(status?.capital?.raw_available_usdc ?? '—')} />
            <ProofRow label="Preferred asset" value={String(status?.settings?.prefer_margin_asset ?? 'USDT')} />
            <ProofRow label="Allowed assets" value={String(status?.settings?.allow_margin_assets ?? 'USDT,USDC')} />
            <ProofRow label="USDC backup" value={status?.settings?.enable_usdc_margin_backup ? 'enabled' : 'disabled/testnet default'} />
            <ProofRow label="Last margin reason" value={String(status?.last_insufficient_margin?.reason ?? '—')} />
            <ProofRow label="Backup attempted" value={status?.last_insufficient_margin?.backup_attempted ? 'yes' : 'no'} />
            <ProofRow label="Backup asset used" value={String(status?.last_insufficient_margin?.backup_asset_used ?? '—')} />
            <ProofRow label="Final margin result" value={String(status?.last_insufficient_margin?.final_result ?? '—')} />
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Risk / Leverage</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <ProofRow label="Profit-lock engine" value={status?.settings?.enable_profit_lock_engine ? 'ON' : 'OFF'} />
            <ProofRow label="Testnet profit-lock" value={status?.settings?.enable_testnet_profit_lock_engine ? 'ON' : 'OFF'} />
            <ProofRow label="PL min R" value={String(status?.settings?.profit_lock_min_r ?? 0.3)} />
            <ProofRow label="PL cooldown" value={`${status?.settings?.profit_lock_cooldown_minutes ?? 5}m`} />
            <ProofRow label="PL study counters" value={JSON.stringify(status?.settings?.profit_lock_study_counters ?? {})} />
            <ProofRow label="PL actions taken" value={String(status?.settings?.profit_lock_actions_taken ?? 0)} />
            <ProofRow label="PL skipped" value={JSON.stringify(status?.settings?.profit_lock_skipped_reasons ?? {})} />
            <ProofRow label="Stress Mode" value={stressMode ? 'ON' : 'OFF'} />
            <ProofRow label="Execution Mode" value={status?.settings?.execution_mode ?? 'signal_only'} />
            <ProofRow label="Current Effective Risk" value={status?.effective_risk_pct !== null && status?.effective_risk_pct !== undefined ? `${status.effective_risk_pct}%` : 'normal logic'} />
            <ProofRow label="Current Effective Leverage" value={status?.effective_leverage !== null && status?.effective_leverage !== undefined ? `${status.effective_leverage}x` : 'normal logic'} />
            <ProofRow label="Risk Source" value={status?.risk_source ?? '—'} />
            <ProofRow label="Leverage Source" value={status?.leverage_source ?? '—'} />
            <ProofRow label="Governor Mode" value={status?.governor_display?.mode ?? governorMode.toUpperCase()} />
            <ProofRow label="Governor State" value={governorDisplayState} />
            <ProofRow label="Execution Allowed" value={String(executionAllowedDisplay)} />
            <ProofRow label="Risk A" value={`${status?.settings?.testnet_risk_a ?? 0.5}%`} />
            <ProofRow label="Risk A+" value={`${status?.settings?.testnet_risk_a_plus ?? 0.75}%`} />
            <ProofRow label="Max risk" value={`${status?.settings?.max_testnet_risk_pct ?? 1}%`} />
            <ProofRow label="Lev A" value={`${status?.settings?.testnet_leverage_a ?? 3}x`} />
            <ProofRow label="Lev A+" value={`${status?.settings?.testnet_leverage_a_plus ?? 5}x`} />
            <ProofRow label="Max lev" value={`${status?.settings?.testnet_max_leverage ?? 7}x`} />
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <span className="text-zinc-400">Stress Mode</span>
              <button disabled={acting} onClick={() => updateExecutionSettings({ stress_override_enabled: !status?.settings?.stress_override_enabled })} className={`px-3 py-1 rounded-full border text-xs ${status?.settings?.stress_override_enabled ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{status?.settings?.stress_override_enabled ? 'ON' : 'OFF'}</button>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <span className="text-zinc-400">Ignore Open Risk Limit</span>
              <button disabled={acting} onClick={() => updateExecutionSettings({ stress_ignore_open_risk_limit: !status?.settings?.stress_ignore_open_risk_limit })} className={`px-3 py-1 rounded-full border text-xs ${status?.settings?.stress_ignore_open_risk_limit ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{status?.settings?.stress_ignore_open_risk_limit ? 'ON' : 'OFF'}</button>
            </label>
            <label className="block"><span className="text-zinc-500">Stress Risk %</span><input type="number" step="0.1" min={0} max={2} value={status?.settings?.stress_risk_pct ?? 2} onChange={e => updateExecutionSettings({ stress_risk_pct: Math.min(2, Math.max(0, Number(e.target.value))) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
            <label className="block"><span className="text-zinc-500">Stress Leverage</span><input type="number" min={1} max={10} value={status?.settings?.stress_leverage ?? 10} onChange={e => updateExecutionSettings({ stress_leverage: Math.min(10, Math.max(1, Number(e.target.value))) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          </div>
          {stressMode && <div className="mt-3 text-xs text-red-200 bg-red-500/10 border border-red-500/20 rounded p-3">Stress mode is active: every qualified testnet execution uses {status?.settings?.stress_risk_pct ?? 2}% risk, {status?.settings?.stress_leverage ?? 10}x leverage, risk_source/leverage_source testnet_stress_override, and open-risk guard {status?.settings?.stress_ignore_open_risk_limit ? 'IGNORED_FOR_STRESS_TEST' : 'ACTIVE'}.</div>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 md:col-span-2">
          <h2 className="font-semibold mb-4 text-sm">Manual Test Actions</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <ActionButton disabled={acting} onClick={() => callExecution('test_connection')} icon={<Send size={14} />} label="Test Binance Connection" />
            <ActionButton disabled={acting} onClick={() => callExecution('validate_symbol', { symbol })} icon={<FlaskConical size={14} />} label="Validate Symbol" />
            <ActionButton disabled={acting || !selectedSignalValid} onClick={() => callSelectedExecution('dry_run')} icon={<FlaskConical size={14} />} label="Dry-run Selected Signal" />
            <ActionButton disabled={acting || !selectedSignalValid} onClick={() => callSelectedExecution('execute_signal', { manual: true })} icon={<PlayCircle size={14} />} label="Execute Selected Signal" danger />
            <ActionButton disabled={acting || !selectedSignalValid} onClick={() => callSelectedExecution('manual_test_flow')} icon={<Shield size={14} />} label="Run E2E Test Flow" danger />
            <ActionButton disabled={acting} onClick={() => callExecution('positions')} icon={<RefreshCw size={14} />} label="Fetch Open Positions" />
            <ActionButton disabled={acting || !symbol} onClick={() => callExecution('cancel_orders', { symbol })} icon={<XCircle size={14} />} label="Cancel Symbol Orders" danger />
            <ActionButton disabled={acting || !symbol} onClick={() => callExecution('close_position', { symbol })} icon={<XCircle size={14} />} label="Close Position Now" danger />
            <ActionButton disabled={acting || !symbol} onClick={() => callExecution('clean_stale_execution_rows', { symbol })} icon={<Trash2 size={14} />} label="Clean Stale Rows Now" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="block">
              <span className="text-xs text-zinc-500">Symbol action target</span>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">Recent signal for dry-run/manual execution</span>
              <select value={selectedSignalId} onChange={e => setSelectedSignalId(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                <option value="" disabled>{signals.length === 0 ? 'No executable crypto signals available' : 'Select a signal'}</option>
                {signals.map(s => <option key={s.id} value={s.id}>{s.symbol} {s.direction.toUpperCase()} · {s.grade} · {new Date(s.created_at).toLocaleString()}</option>)}
              </select>
              {!selectedSignalValid && <div className="text-[11px] text-yellow-300 mt-1">Refresh removed stale/deleted signals from this dropdown. Select a valid fresh signal before execution.</div>}
            </label>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Connection Status</h2>
          <div className="space-y-2 text-xs">
            <ProofRow label="Exchange" value={status?.env?.exchange ?? 'binance_usdm_testnet'} />
            <ProofRow label="Base URL" value={status?.env?.base_url ?? 'https://demo-fapi.binance.com'} />
            <ProofRow label="API key" value={status?.env?.api_key_configured ? 'Configured' : 'Missing'} />
            <ProofRow label="API secret" value={status?.env?.api_secret_configured ? 'Configured' : 'Missing'} />
            <ProofRow label="Live trading" value={status?.env?.live_trading_enabled ? 'BLOCK UI / ENV INVALID' : 'Disabled'} />
            <ProofRow label="Failed / skipped" value={`${status?.failed_count ?? 0} / ${status?.skipped_count ?? 0}`} />
          </div>
          {status?.latest_error && <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2">{status.latest_error.last_exchange_error || status.latest_error.error_message}</div>}
        </div>
      </div>

      {result && (
        <div className={`mb-6 rounded-xl border p-4 ${result.success ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className={`text-sm font-semibold mb-2 ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>{result.success ? 'Action completed' : 'Action failed / skipped'}</div>
          <pre className="text-xs text-zinc-300 overflow-auto max-h-72 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Latest Testnet Executions</h2>
            <button onClick={() => load()} className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Provider</th><th className="text-left px-4 py-3">Symbol</th><th className="text-left px-4 py-3">Side</th><th className="text-left px-4 py-3">Lev</th><th className="text-left px-4 py-3">Qty</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Blocker</th><th className="text-left px-4 py-3">Submitted Order</th><th className="text-left px-4 py-3">Protection</th><th className="text-left px-4 py-3">Orders</th><th className="text-left px-4 py-3">Stress Test Timer</th><th className="text-left px-4 py-3">Lock/Capital</th><th className="text-left px-4 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {executions.length === 0 ? <tr><td colSpan={13} className="px-4 py-8 text-center text-zinc-500">No Binance testnet executions yet.</td></tr> : executions.map(e => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 uppercase text-xs text-zinc-300">{e.execution_provider ?? 'binance'}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{e.symbol}</td>
                  <td className="px-4 py-3"><span className={e.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{e.side}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-400"><div>{e.leverage ? `${e.leverage}x` : '—'}</div><div className="text-[11px] text-zinc-600">{e.leverage_source ?? '—'}</div><div className="text-[11px] text-zinc-600">Risk: {e.risk_pct ?? '—'}% · {e.risk_source ?? '—'}</div></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{e.quantity ?? e.volume}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[e.status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>{e.status}</span><div className="mt-1 text-[11px] text-zinc-500">Entry: {e.entry_filled_at ? 'filled' : e.binance_entry_order_id || e.entry_order_id ? 'submitted' : '—'}</div><div className={freshnessState(e) === 'fresh' ? 'mt-1 text-[11px] text-emerald-300' : 'mt-1 text-[11px] text-yellow-300'}>{freshnessState(e)}</div></td>
                  <td className="px-4 py-3 text-xs text-yellow-300">{e.latest_auto_skip_reason || e.error_message || e.last_exchange_error || '—'}</td>
                  <td className="px-4 py-3 text-xs">{e.entry_order_id || e.binance_entry_order_id ? 'yes' : 'no'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500"><div>{e.bracket_mode || '—'}</div><div className={e.protection_status === 'unprotected_failed' ? 'text-red-300' : e.protection_status === 'protected' || e.protection_status === 'protected_native' || e.protection_status === 'protected_managed' ? 'text-emerald-300' : 'text-zinc-500'}>{e.protection_status || '—'}</div><div>Protection mode: {e.bracket_mode || 'pending'}</div><div>TP1 status: {e.tp1_closed_at || e.tp1_filled ? 'filled/closed' : e.tp1_algo_id || e.binance_tp1_order_id ? 'open/native' : e.bracket_mode === 'managed_exit_fallback' ? 'managed' : 'pending'}</div><div>TP2 status: {e.tp2_closed_at ? 'filled/closed' : e.tp2_algo_id || e.binance_tp2_order_id ? 'open/native' : e.bracket_mode === 'managed_exit_fallback' ? 'managed' : 'pending'}</div><div>SL/BE status: {e.sl_closed_at ? 'closed' : e.sl_moved_to_be ? `BE ${e.be_stop_level ?? ''}` : e.sl_algo_id || e.binance_sl_order_id ? 'open/native SL' : e.bracket_mode === 'managed_exit_fallback' ? 'managed SL' : 'pending'}</div><div>Remaining: {e.remaining_quantity ?? '—'}</div>{e.latest_protection_error && <div className="text-red-300">{e.latest_protection_error}</div>}{e.latest_auto_skip_reason && <div className="text-yellow-300">{e.latest_auto_skip_reason}</div>}{e.last_exchange_error && <div className="text-red-300">{e.last_exchange_error}</div>}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                    <div className="font-semibold text-zinc-400 mb-1">{e.bracket_mode === 'exchange_native' ? 'Native algo orders' : e.bracket_mode === 'managed_exit_fallback' ? 'Managed fallback' : 'Pending'}</div>
                    <div>Entry: {e.entry_order_id || e.binance_entry_order_id || '—'}</div>
                    {(e.sl_algo_id || e.binance_sl_order_id) && (
                      <div className="mt-1 text-zinc-400">
                        <div>SL algo: {e.sl_algo_id || e.binance_sl_order_id}</div>
                        {e.sl_client_algo_id && <div className="text-zinc-600">client: {e.sl_client_algo_id}</div>}
                        <div>trigger: {e.intended_sl ?? e.stop_loss ?? '—'} · STOP_MARKET · reduceOnly</div>
                      </div>
                    )}
                    {(e.tp1_algo_id || e.binance_tp1_order_id) && (
                      <div className="mt-1 text-zinc-400">
                        <div>TP1 algo: {e.tp1_algo_id || e.binance_tp1_order_id}</div>
                        {e.tp1_client_algo_id && <div className="text-zinc-600">client: {e.tp1_client_algo_id}</div>}
                        <div>trigger: {e.intended_tp1 ?? e.tp1 ?? '—'} · TP_MARKET · qty: {e.tp1_quantity ?? '—'}</div>
                      </div>
                    )}
                    {(e.tp2_algo_id || e.binance_tp2_order_id) && (
                      <div className="mt-1 text-zinc-400">
                        <div>TP2 algo: {e.tp2_algo_id || e.binance_tp2_order_id}</div>
                        {e.tp2_client_algo_id && <div className="text-zinc-600">client: {e.tp2_client_algo_id}</div>}
                        <div>trigger: {e.intended_tp2 ?? e.tp2 ?? '—'} · TP_MARKET · qty: {e.tp2_quantity ?? '—'}</div>
                      </div>
                    )}
                    <div className="mt-1">Native verified: <span className={e.native_protection_verified ? 'text-emerald-300' : 'text-zinc-600'}>{e.native_protection_verified ? 'yes' : 'no'}</span></div>
                    <div>Managed fallback: <span className={e.managed_fallback_active || e.bracket_mode === 'managed_exit_fallback' ? 'text-yellow-300' : 'text-zinc-600'}>{e.managed_fallback_active || e.bracket_mode === 'managed_exit_fallback' ? 'yes' : 'no'}</span></div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500"><div>Opened: {e.opened_at ? new Date(e.opened_at).toLocaleString() : e.entry_filled_at ? new Date(e.entry_filled_at).toLocaleString() : '—'}</div><div>Expires: {e.expires_at || e.time_stop_deadline_at ? new Date(e.expires_at ?? e.time_stop_deadline_at ?? '').toLocaleString() : '—'}</div><div>Minutes left: {minutesRemaining(e.expires_at ?? e.time_stop_deadline_at)}</div><div>Max hold: {e.max_hold_minutes ?? '—'}m</div><div>Mark: {e.latest_mark_price ?? '—'} · uPnL: {e.latest_unrealized_pnl ?? '—'}</div><div>Last monitor: {e.last_monitor_action || '—'}</div><div>Monitor error: <span className={e.latest_monitor_error ? 'text-red-300' : 'text-zinc-600'}>{e.latest_monitor_error || '—'}</span></div><div>Sync error: <span className={e.latest_sync_error ? 'text-red-300' : 'text-zinc-600'}>{e.latest_sync_error || '—'}</span></div><div>Seconds since fill: {secondsSinceEntryFill(e) ?? '—'}</div><div>Protection SLA: <span className={protectionSlaState(e) === 'pass' ? 'text-emerald-300' : protectionSlaState(e) === 'fail' ? 'text-red-300' : 'text-yellow-300'}>{protectionSlaState(e)}</span></div><div>Checked: {e.last_monitor_checked_at ? new Date(e.last_monitor_checked_at).toLocaleString() : '—'}</div></td>
                  <td className="px-4 py-3 text-xs text-zinc-500"><div>Asset: {e.selected_margin_asset ?? 'USDT'}</div><div>Margin reason: {e.insufficient_margin_reason ?? '—'}</div><div>Backup: {e.margin_backup_attempted ? 'yes' : 'no'} {e.margin_backup_asset_used ?? ''}</div><div>Mode: {e.profit_lock_engine_mode ?? '—'}</div><div>Current R/PnL: {e.current_r ?? e.profit_lock_r_current ?? '—'} / {e.current_pnl ?? e.latest_unrealized_pnl ?? '—'}</div><div>Highest R/PnL: {e.highest_positive_r_observed ?? '—'} / {e.highest_positive_pnl_observed ?? '—'}</div><div>Recommendation: {e.lock_recommendation ?? '—'}</div><div>Lock: {e.profit_lock_status ?? '—'}</div><div>Verified SL repl: {e.replacement_sl_verified ? 'yes' : 'no'}</div><div>Old SL preserved: {e.old_sl_preserved === false ? 'no' : 'yes'}</div><div>Actions: {e.profit_lock_action_count ?? 0}</div><div>Skipped: {e.profit_lock_skipped_reason ?? '—'}</div></td>
                  <td className="px-4 py-3"><button onClick={() => callExecution('sync_execution', { execution_id: e.id })} className="text-xs text-blue-400 hover:text-blue-300">Sync</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <MiniList title="Failed Executions" rows={failedExecutions} />
        <MiniList title="Skipped Executions" rows={skippedExecutions} />
      </div>
    </AdminLayout>
  );
}

function ToggleButtons({ value, onToggle, disabled }: { value: boolean; onToggle: (value: boolean) => void; disabled?: boolean }) {
  return <div className="inline-flex rounded-lg border border-zinc-800 overflow-hidden"><button disabled={disabled || value} onClick={() => onToggle(true)} className={`px-3 py-1 text-xs font-semibold disabled:opacity-60 ${value ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>ON</button><button disabled={disabled || !value} onClick={() => onToggle(false)} className={`px-3 py-1 text-xs font-semibold border-l border-zinc-800 disabled:opacity-60 ${!value ? 'bg-red-500/20 text-red-300' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>OFF</button></div>;
}

function StatusBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{active ? activeLabel : inactiveLabel}</span>;
}

function ModeBadge({ mode }: { mode: string }) {
  const cls = mode === 'testnet_action' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : mode === 'study_only' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' : 'border-red-500/30 bg-red-500/10 text-red-300';
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{mode.toUpperCase()}</span>;
}

function ControlCard({ title, status, onToggle, disabled, children }: { title: string; status: boolean; onToggle: (value: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4"><div className="flex items-center justify-between gap-3 mb-3"><div><div className="font-semibold text-sm">{title}</div><div className={status ? 'text-xs text-emerald-300 mt-1' : 'text-xs text-red-300 mt-1'}>Status: {status ? 'ON' : 'OFF'}</div></div><ToggleButtons value={status} onToggle={onToggle} disabled={disabled} /></div><div className="space-y-2 text-xs">{children}</div></div>;
}

function NumberSetting({ label, value, step, disabled, onChange }: { label: string; value: number; step: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="block"><span className="text-zinc-500">{label}</span><input type="number" step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /><div className="mt-1 text-[11px] text-zinc-600">Current: {value}</div></label>;
}

function GuardBadge({ label, value, tone }: { label: string; value: string; tone: 'green' | 'yellow' | 'red' }) {
  const cls = tone === 'green' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : tone === 'yellow' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' : 'border-red-500/30 bg-red-500/10 text-red-300';
  return <div className={`rounded-lg border p-3 ${cls}`}><div className="text-[11px] opacity-80">{label}</div><div className="font-mono font-semibold mt-1">{value}</div></div>;
}

function minutesRemaining(expiresAt?: string | null): string {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '—';
  return String(Math.max(0, Math.ceil(ms / 60_000)));
}

function StatusCard({ icon, label, value, note, valueClass = 'text-zinc-100' }: { icon: ReactNode; label: string; value: string; note: string; valueClass?: string }) {
  return <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="flex items-center gap-2 mb-2 text-zinc-500">{icon}<span className="text-xs uppercase tracking-wide">{label}</span></div><div className={`font-semibold text-sm font-mono ${valueClass}`}>{value}</div><div className="text-xs text-zinc-600 mt-1">{note}</div></div>;
}

function ActionButton({ disabled, onClick, icon, label, danger = false }: { disabled: boolean; onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>{icon}{label}</button>;
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-zinc-500">{label}</span><span className="text-zinc-300 font-mono text-right">{value}</span></div>;
}

function MiniList({ title, rows }: { title: string; rows: BinanceExecutionOrder[] }) {
  return <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold text-sm mb-3">{title}</h3>{rows.length === 0 ? <div className="text-xs text-zinc-500">None in latest 25.</div> : <div className="space-y-2">{rows.slice(0, 5).map(r => <div key={r.id} className="text-xs flex items-center justify-between gap-2"><span className="font-mono text-zinc-300">{r.symbol}</span><Badge variant={r.status === 'failed' ? 'red' : 'gray'}>{r.status}</Badge></div>)}</div>}</div>;
}
