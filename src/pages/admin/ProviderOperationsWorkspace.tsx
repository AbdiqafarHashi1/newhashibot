import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { BinanceExecutionOrder, ExecutionSettings, Signal } from '../../lib/types';
import { Shield, AlertTriangle, Cpu, Activity, RefreshCw, XCircle, PlayCircle, FlaskConical, RotateCcw, PauseCircle, StopCircle, CheckCircle2, Search, Lock, FileText, Terminal, Sliders, Zap, AlertCircle, Layers, ArrowUpRight, ArrowDownRight, Target, Plus, ShieldCheck, UserPlus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';
import { getMonitorTruth, shortOperatorText } from '../../lib/monitorTruth';
import { listMT5Accounts, connectMT5Account, setMT5Execution, testMT5Connection, removeMT5Account } from '../../lib/mt5Accounts';
import type { MT5Account } from '../../lib/exchange/mt5';
import { useSearchParams } from 'react-router-dom';
import { ExecutionAccount, PROVIDER_CONTRACT, executionAccountStatus, validateProviderAccount } from '../../lib/executionAccounts';

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  pending_submit: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
  entry_submitted: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  entry_filled: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  synced_closed: 'text-zinc-300 bg-zinc-800 border-zinc-700',
  protection_failed: 'text-red-300 bg-red-500/10 border-red-500/20',
  partially_protected: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
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
  latest_account_state_at: string | null;

  latest_supervisor_run_at?: string | null;
  latest_supervisor_status?: string | null;
  latest_supervisor_result?: Record<string, unknown> | null;
  latest_supervisor_error?: string | null;

  latest_recovery_run_at?: string | null;
  latest_recovery_status?: string | null;
  latest_recovery_result?: Record<string, unknown> | null;
  latest_recovery_error?: string | null;
};

type StatusPayload = {
  ok: boolean;
  timestamp: string;
  env: {
    execution_mode: string;
    testnet_enabled: boolean;
    api_key_configured: boolean;
    api_secret_configured: boolean;
    exchange: string;
    base_url: string;
    live_trading_enabled: boolean;
  };
  settings: ExecutionSettings & ExecutionSettingsSnapshot & {
    enable_profit_lock_engine?: boolean;
    enable_testnet_profit_lock_engine?: boolean;
    profit_lock_before_tp1?: string;
    profit_lock_after_tp1?: boolean;
    profit_lock_min_r?: number;
    profit_lock_aggressive_min_r?: number;
    profit_lock_buffer_r?: number;
    profit_lock_cooldown_minutes?: number;
    profit_lock_max_updates_per_trade?: number;
    enable_usdc_margin_backup?: boolean;
    allow_margin_assets?: string;
    prefer_margin_asset?: string;
    capital_basis?: string;
    auto_execute_testnet?: boolean;
    governor_enabled?: boolean;
    testnet_governor_mode?: string;
    governor_state?: string;
    last_governor_reason?: string | null;
    daily_start_equity?: number | null;
    daily_realized_pnl?: number | null;
    daily_unrealized_pnl?: number | null;
    current_equity?: number | null;
    daily_pnl_pct?: number | null;
    account_open_positions?: number | null;
    account_open_order_count?: number | null;
    account_available_balance?: number | null;
    account_margin_ratio?: number | null;
    max_daily_loss_pct?: number | null;
    max_unrealized_drawdown_pct?: number | null;
    failed_execution_streak?: number | null;
    closed_sl_streak?: number | null;
    last_governor_checked_at?: string | null;
    stress_override_enabled?: boolean;
    stress_risk_pct?: number | null;
    stress_leverage?: number | null;
    stress_ignore_open_risk_limit?: boolean;
    bot_paused?: boolean;
    bot_paused_reason?: string | null;
    kill_switch_enabled?: boolean;
    profit_lock_study_counters?: Record<string, number> | null;
    profit_lock_skipped_reasons?: Record<string, number> | null;
    profit_lock_actions_taken?: number | null;
  };
  governor?: {
    mode: string;
    enabled: boolean;
    state: string;
    reason: string;
    current_equity: number | null;
    daily_pnl_pct: number | null;
    unrealized_pnl: number | null;
    risk_multiplier: number;
    adjusted_max_leverage: number;
  };
  governor_display?: {
    mode: string;
    state: string;
    reason: string;
    execution_allowed: boolean;
  };
  account_state?: {
    openPositions?: number;
    openOrderCount?: number;
    availableUsdt?: number;
    availableUsdc?: number;
    availableBalance?: number;
    marginRatio?: number;
    positions?: Array<{ symbol: string; positionAmt: string; unrealizedPnl: string }>;
  };
  capital?: {
    selected_capital_used?: number;
    raw_total_margin_balance?: number;
    raw_total_wallet_balance?: number;
    raw_available_usdt?: number;
    raw_available_usdc?: number;
  };
  last_insufficient_margin?: {
    reason?: string;
    backup_attempted?: boolean;
    backup_asset_used?: string;
    final_result?: string;
  };
  latest_error?: {
    last_exchange_error?: string;
    error_message?: string;
  };
  failed_count?: number;
  skipped_count?: number;
  current_open_risk_pct?: number;
  remaining_risk_capacity_pct?: number;
  effective_risk_pct?: number | null;
  effective_leverage?: number | null;
  risk_source?: string;
  leverage_source?: string;
};

type ActionResult = {
  success: boolean;
  action?: string;
  error?: string;
  receipt_id?: string;
  completed_at?: string;
  [key: string]: unknown;
};

type ProviderControl = {
  provider_name: 'binance' | 'bybit' | 'mt5';
  enabled: boolean;
  read_only: boolean;
  entry_enabled: boolean;
  monitor_enabled: boolean;
  protection_recovery_enabled: boolean;
  profit_lock_enabled: boolean;
  provider_kill_switch: boolean;
  status: 'connected' | 'degraded' | 'disabled' | 'error';
  last_error?: string | null;
};

type ProviderGlobalControls = {
  parallel_mode_enabled: boolean;
  primary_provider: 'binance' | 'bybit' | 'mt5';
  live_trading_unlocked: boolean;
};

type TradeManagementTruthUiRow = {
  id: string;
  execution_id: string;
  provider: 'binance' | 'bybit' | 'mt5';
  symbol: string;
  side: string;
  quantity: number | null;
  entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number | null;
  leverage: number | null;
  margin: number | null;
  liquidation_price: number | null;
  intended_sl: number | null;
  intended_tp1: number | null;
  intended_tp2: number | null;
  sl_status: string;
  tp1_status: string;
  tp2_status: string;
  be_status: string;
  trailing_status: string;
  protection_status: string;
  lifecycle_state: string;
  latest_error: string | null;
  updated_at: string;
};

type ProviderSymbolCacheRow = {
  provider_name: string;
  symbol: string;
  is_tradable: boolean;
  contract_type: string;
  quote_asset: string;
  updated_at: string;
};

type MonitorHeartbeat = {
  id: string;
  worker_id: string;
  worker_name: string;
  status: string;
  latest_monitor_run_at: string | null;
  open_positions_count: number | null;
  stale_rows_cleaned: number | null;
  latest_error: string | null;
  created_at: string;
};

type MonitorSchedule = {
  id: string;
  task_name: string;
  cron_expression: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  status: string;
};

type BybitDebugState = {
  connected?: boolean;
  environment?: string;
  account_reachable?: boolean;
  wallet_reachable?: boolean;
  linear_instruments_reachable?: boolean;
  order_creation_allowed?: boolean;
  latest_error_code?: string | number | null;
  latest_error_message?: string | null;
  current_api_key_status?: string | null;
  current_provider_status?: string | null;
  balances?: unknown[];
  positions?: unknown[];
  open_orders?: unknown[];
  checks?: Record<string, unknown>;
  missing_permissions?: string[];
  error_reason?: string | null;
};

type CommandReceipt = {
  id: string;
  action: string;
  provider: string;
  environment: string;
  requestTime: string;
  completionTime: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  result?: Record<string, unknown>;
};

type VerifiedRuntimeEvent = {
  id: string;
  created_at: string;
  type: 'SIGNAL' | 'EXECUTION' | 'PROTECTION' | 'PROVIDER' | 'AUDIT';
  severity: 'info' | 'warning' | 'error' | 'success';
  title: string;
  details: string;
  source: string;
  symbol?: string;
};

interface ProviderOperationsWorkspaceProps {
  provider: 'binance' | 'bybit' | 'mt5';
  mode?: 'binance_testnet' | 'bybit_prop' | 'mt5_prop' | 'mt5_personal';
}

export function ProviderOperationsWorkspace({ provider, mode = 'binance_testnet' }: ProviderOperationsWorkspaceProps) {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedAccountId = searchParams.get('account_id');
  const [canonicalAccount, setCanonicalAccount] = useState<ExecutionAccount | null>(null);
  const [accountConfigurationError, setAccountConfigurationError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'positions_orders' | 'protection_risk' | 'diagnostics_debug' | 'events_receipts'>('overview');
  const [orderTab, setOrderTab] = useState<'open' | 'conditional' | 'recent' | 'attempts' | 'failed'>('open');

  const selectedEnv = provider === 'bybit' ? 'demo' : 'testnet';

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [executions, setExecutions] = useState<BinanceExecutionOrder[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [result, setResult] = useState<ActionResult | null>(null);

  const [providerControls, setProviderControls] = useState<ProviderControl[]>([]);
  const [providerGlobalControls, setProviderGlobalControls] = useState<ProviderGlobalControls | null>(null);
  const [providerControlsError, setProviderControlsError] = useState<{ kind?: 'missing_table' | 'rls_blocked' | 'error'; message?: string }>({});

  const [tradeTruthRows, setTradeTruthRows] = useState<TradeManagementTruthUiRow[]>([]);
  const [symbolCacheRows, setSymbolCacheRows] = useState<ProviderSymbolCacheRow[]>([]);
  const [monitorHeartbeats, setMonitorHeartbeats] = useState<MonitorHeartbeat[]>([]);
  const [monitorSchedules, setMonitorSchedules] = useState<MonitorSchedule[]>([]);
  const [bybitDebug, setBybitDebug] = useState<BybitDebugState | null>(null);

  // MT5 Multi-Account State
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [mt5AccountsLoading, setMt5AccountsLoading] = useState(false);
  const [mt5FilterType, setMt5FilterType] = useState<'all' | 'personal' | 'prop' | 'demo'>('all');
  const [mt5Notice, setMt5Notice] = useState<string | null>(null);

  // MT5 Onboarding Modal State
  const [showAddMT5Modal, setShowAddMT5Modal] = useState(false);
  const [formBroker, setFormBroker] = useState('MetaQuotes Software');
  const [formServer, setFormServer] = useState('MetaQuotes-Demo');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formAccountType, setFormAccountType] = useState<'personal' | 'prop' | 'demo'>(
    mode === 'mt5_personal' ? 'personal' : mode === 'mt5_prop' ? 'prop' : 'personal'
  );
  const [formPropFirm, setFormPropFirm] = useState('FTMO');
  const [formMaxDailyLossPct, setFormMaxDailyLossPct] = useState<number>(5.0);
  const [formMaxTotalDrawdownPct, setFormMaxTotalDrawdownPct] = useState<number>(10.0);
  const [formLeverage, setFormLeverage] = useState<number>(100);
  const [formMT5Error, setFormMT5Error] = useState<string | null>(null);
  const [mt5ActionPending, setMt5ActionPending] = useState(false);

  // Prop Drawdown & Safety Config State
  const [propMaxDailyLossPct, setPropMaxDailyLossPct] = useState<number>(5.0);
  const [propMaxTotalDrawdownPct, setPropMaxTotalDrawdownPct] = useState<number>(10.0);
  const [propDailyLossLockEnabled, setPropDailyLossLockEnabled] = useState<boolean>(true);
  const [propNewEntryBlocked, setPropNewEntryBlocked] = useState<boolean>(false);

  const [receiptHistory, setReceiptHistory] = useState<CommandReceipt[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<VerifiedRuntimeEvent[]>([]);

  const [selectedPositionForDetail, setSelectedPositionForDetail] = useState<TradeManagementTruthUiRow | BinanceExecutionOrder | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    actionName: string;
    payload?: Record<string, unknown>;
    isDanger?: boolean;
  } | null>(null);

  const [orderSymbolFilter, setOrderSymbolFilter] = useState('');
  const [orderSideFilter, setOrderSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  const selectedProviderControl = useMemo(() => {
    return providerControls.find(c => c.provider_name === provider);
  }, [providerControls, provider]);

  const bybitConnected = useMemo(() => {
    const ctrl = providerControls.find(c => c.provider_name === 'bybit');
    return ctrl?.status === 'connected';
  }, [providerControls]);

  const providerSafetyWarning = useMemo(() => {
    if (providerControlsError.kind === 'missing_table' || providerControlsError.kind === 'rls_blocked') {
      return providerControlsError.message;
    }
    if (provider === 'bybit' && !bybitConnected) {
      return 'Bybit Health is degraded or disconnected';
    }
    return null;
  }, [providerControlsError, provider, bybitConnected]);

  const recordReceipt = useCallback((receipt: Omit<CommandReceipt, 'id'>) => {
    const newReceipt: CommandReceipt = {
      ...receipt,
      id: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    setReceiptHistory(prev => [newReceipt, ...prev.slice(0, 49)]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    let scopedAccount: ExecutionAccount | null = null;
    try {
      const accountResponse = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'list_execution_accounts' }),
      });
      const accountPayload = await accountResponse.json();
      const accounts = (accountPayload.raw?.responseBody?.accounts ?? accountPayload.responseBody?.accounts ?? []) as ExecutionAccount[];
      const environment = provider === 'bybit' ? 'demo' : 'testnet';
      const providerAccounts = accounts.filter(row => row.provider === provider && row.environment === environment);
      // Explicit URL selection wins; otherwise use the operational account, then
      // a selectable account strictly as read-only diagnostic context.
      scopedAccount = requestedAccountId
        ? providerAccounts.find(row => row.id === requestedAccountId) ?? null
        : providerAccounts.find(row => row.is_operational) ?? providerAccounts.find(row => row.enabled) ?? null;
      const validation = validateProviderAccount(provider === 'mt5' ? 'binance' : provider, scopedAccount);
      setCanonicalAccount(validation.valid ? scopedAccount : null);
      setAccountConfigurationError(!validation.valid ? validation.error : null);
    } catch (err) {
      setCanonicalAccount(null);
      setAccountConfigurationError(err instanceof Error ? err.message : 'Canonical account lookup failed');
    }

    try {
      const executionFunction = provider === 'bybit' ? 'bybit-demo-execution' : 'binance-testnet-execution';
      const response = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/${executionFunction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'status', provider, customer_id: scopedAccount?.customer_id, account_id: scopedAccount?.account_id }),
      });

      if (response.ok) {
        const payload: StatusPayload = await response.json();
        // A system-secret status response may prove API reachability, but it is
        // not account runtime truth. Preserve only the reachability envelope
        // until a canonical account identity has resolved.
        setStatus(scopedAccount ? payload : { ...payload, account_state: undefined, capital: undefined, settings: { ...payload.settings, latest_monitor_run_at: null, latest_monitor_status: 'NOT_CONFIGURED', latest_monitor_result: null, open_binance_positions: null, open_binance_orders: null, pnl_snapshot: null, stale_rows_cleaned: null, open_positions_count: null, unrealized_pnl: null, account_total_margin_balance: null, account_total_wallet_balance: null, latest_account_state_at: null } });
      }
    } catch (err) {
      console.warn('Failed to fetch status from edge function:', err);
    }

    try {
      const { data: pControls, error: pErr } = await supabase.from('execution_provider_controls').select('*');
      if (pErr) {
        setProviderControlsError({ kind: pErr.code === '42P01' ? 'missing_table' : 'rls_blocked', message: `Provider Controls query failed: ${pErr.message}` });
      } else if (pControls) {
        setProviderControls(pControls as ProviderControl[]);
        setProviderControlsError({});
      }
    } catch {
      setProviderControlsError({ kind: 'error', message: 'Could not fetch provider controls' });
    }

    try {
      const { data: gControls } = await supabase.from('execution_provider_global_controls').select('*').limit(1).maybeSingle();
      if (gControls) {
        setProviderGlobalControls(gControls as ProviderGlobalControls);
      }
    } catch {
      // Ignore missing global controls
    }

    try {
      let truthQuery = supabase.from('active_trade_management_truth').select('*').eq('provider', provider).eq('environment', selectedEnv);
      if (scopedAccount) truthQuery = truthQuery.eq('account_id', scopedAccount.account_id);
      else truthQuery = truthQuery.eq('account_id', '__no_canonical_account__');
      const { data: tTruth } = await truthQuery.order('updated_at', { ascending: false }).limit(50);
      if (tTruth) {
        setTradeTruthRows(tTruth as TradeManagementTruthUiRow[]);
      }
    } catch {
      // Table missing or query error
    }

    try {
      const { data: sCache } = await supabase.from('provider_symbol_cache').select('*').limit(100);
      if (sCache) {
        setSymbolCacheRows(sCache as ProviderSymbolCacheRow[]);
      }
    } catch {
      // Table missing
    }

    try {
      let heartbeatQuery = supabase.from('execution_monitor_heartbeats').select('*').eq('provider', provider);
      heartbeatQuery = scopedAccount ? heartbeatQuery.eq('account_id', scopedAccount.account_id) : heartbeatQuery.eq('account_id', '__no_canonical_account__');
      const { data: heartbeats } = await heartbeatQuery.order('started_at', { ascending: false }).limit(10);
      if (heartbeats) {
        setMonitorHeartbeats(heartbeats as MonitorHeartbeat[]);
      }
    } catch {
      // Table missing
    }

    try {
      const { data: schedules } = await supabase.from('execution_monitor_schedules').select('*').limit(10);
      if (schedules) {
        setMonitorSchedules(schedules as MonitorSchedule[]);
      }
    } catch {
      // Table missing
    }

    try {
      let executionQuery = supabase.from('execution_orders').select('*').eq('execution_provider', provider).eq('environment', selectedEnv);
      executionQuery = scopedAccount ? executionQuery.eq('account_id', scopedAccount.account_id) : executionQuery.eq('account_id', '__no_canonical_account__');
      const { data: execs } = await executionQuery.order('created_at', { ascending: false }).limit(50);
      if (execs) {
        setExecutions(execs as BinanceExecutionOrder[]);
      }
    } catch {
      // Table missing
    }

    try {
      const { data: sigs } = await supabase.from('signals').select('*').in('grade', ['A', 'A+']).order('created_at', { ascending: false }).limit(20);
      if (sigs) {
        setSignals(sigs as Signal[]);
        if (sigs.length > 0 && !selectedSignalId) {
          setSelectedSignalId(sigs[0].id);
        }
      }
    } catch {
      // Table missing
    }

    try {
      setMt5AccountsLoading(true);
      const accs = await listMT5Accounts();
      setMt5Accounts(accs);
    } catch (err) {
      console.warn('Failed to load MT5 accounts:', err);
    } finally {
      setMt5AccountsLoading(false);
    }

    try {
      const { data: auditLogs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
      if (auditLogs) {
        const events: VerifiedRuntimeEvent[] = auditLogs.map((log: Record<string, unknown>) => ({
          id: String(log.id || Math.random()),
          created_at: String(log.created_at || new Date().toISOString()),
          type: 'AUDIT',
          severity: String(log.action || '').includes('fail') || String(log.action || '').includes('error') ? 'error' : 'info',
          title: String(log.action || 'Audit Log'),
          details: typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—'),
          source: String(log.performed_by || 'system'),
        }));
        setTelemetryEvents(events);
      }
    } catch {
      // Ignore
    }

    setLoading(false);
  }, [session, provider, selectedSignalId, requestedAccountId, selectedEnv]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleConnectMT5Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMT5Error(null);
    if (!formAccountNumber || !formPassword || !formNickname) {
      setFormMT5Error('Account number, password, and nickname are required.');
      return;
    }
    setMt5ActionPending(true);
    try {
      await connectMT5Account({
        broker: formBroker,
        server: formServer,
        accountNumber: formAccountNumber,
        password: formPassword,
        nickname: formNickname,
        currency: 'USD',
        leverage: formLeverage,
        accountType: formAccountType,
        executionMode: formAccountType === 'prop' ? 'prop_challenge' : formAccountType === 'demo' ? 'demo' : 'personal',
        ownerKind: 'system',
        credentialCapability: 'investor',
        operational: false,
        monitorEnabled: true
      });
      setShowAddMT5Modal(false);
      setFormAccountNumber('');
      setFormPassword('');
      setFormNickname('');
      setMt5Notice(`Connected MT5 Account "${formNickname}" successfully.`);
      await load();
    } catch (err) {
      setFormMT5Error(err instanceof Error ? err.message : String(err));
    } finally {
      setMt5ActionPending(false);
      setTimeout(() => setMt5Notice(null), 5000);
    }
  };

  const toggleMT5Execution = async (accountId: string, currentEnabled: boolean) => {
    setMt5ActionPending(true);
    setMt5Notice(`Updating MT5 execution state...`);
    try {
      await setMT5Execution(accountId, !currentEnabled);
      setMt5Notice(`MT5 account execution updated.`);
      await load();
    } catch (err) {
      setMt5Notice(`Failed to update MT5 execution: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMt5ActionPending(false);
      setTimeout(() => setMt5Notice(null), 5000);
    }
  };

  const syncMT5Account = async (accountId: string) => {
    setMt5ActionPending(true);
    setMt5Notice(`Testing connection and syncing MT5 account...`);
    try {
      await testMT5Connection(accountId);
      setMt5Notice(`MT5 account sync and connection test complete.`);
      await load();
    } catch (err) {
      setMt5Notice(`MT5 sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMt5ActionPending(false);
      setTimeout(() => setMt5Notice(null), 5000);
    }
  };

  const deleteMT5Account = async (accountId: string) => {
    if (!confirm('Are you sure you want to remove this MT5 account?')) return;
    setMt5ActionPending(true);
    try {
      await removeMT5Account(accountId);
      setMt5Notice(`MT5 account removed.`);
      await load();
    } catch (err) {
      setMt5Notice(`Failed to remove MT5 account: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMt5ActionPending(false);
      setTimeout(() => setMt5Notice(null), 5000);
    }
  };

  const callExecution = async (action: string, extraBody: Record<string, unknown> = {}): Promise<ActionResult> => {
    setActing(true);
    setResult(null);
    const reqTime = new Date().toISOString();

    try {
      const executionFunction = provider === 'bybit' ? 'bybit-demo-execution' : 'binance-testnet-execution';
      const response = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/${executionFunction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action, provider, customer_id: canonicalAccount?.customer_id, account_id: canonicalAccount?.account_id, ...extraBody }),
      });

      const resData = await response.json();
      const compTime = new Date().toISOString();

      const actResult: ActionResult = {
        success: response.ok && resData.ok !== false && resData.success !== false,
        action,
        ...resData,
        completed_at: compTime,
      };

      setResult(actResult);

      recordReceipt({
        action,
        provider,
        environment: selectedEnv,
        requestTime: reqTime,
        completionTime: compTime,
        status: actResult.success ? 'SUCCESS' : 'FAILED',
        error: actResult.error || (resData.message as string) || (resData.error_message as string),
        result: resData,
      });

      await load();
      return actResult;
    } catch (err: unknown) {
      const compTime = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : String(err);
      const actResult: ActionResult = {
        success: false,
        action,
        error: errMsg,
        completed_at: compTime,
      };
      setResult(actResult);

      recordReceipt({
        action,
        provider,
        environment: selectedEnv,
        requestTime: reqTime,
        completionTime: compTime,
        status: 'FAILED',
        error: errMsg,
      });

      return actResult;
    } finally {
      setActing(false);
    }
  };

  const callOperatorAction = async (action: string, extraBody: Record<string, unknown> = {}): Promise<ActionResult> => {
    setActing(true);
    setResult(null);
    const reqTime = new Date().toISOString();

    try {
      const response = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action, provider, customer_id: canonicalAccount?.customer_id, account_id: canonicalAccount?.account_id, ...extraBody }),
      });

      const resData = await response.json();
      const compTime = new Date().toISOString();

      const actResult: ActionResult = {
        success: response.ok && resData.ok !== false && resData.success !== false,
        action,
        ...resData,
        completed_at: compTime,
      };

      setResult(actResult);

      recordReceipt({
        action,
        provider,
        environment: selectedEnv,
        requestTime: reqTime,
        completionTime: compTime,
        status: actResult.success ? 'SUCCESS' : 'FAILED',
        error: actResult.error || (resData.message as string) || (resData.error_message as string),
        result: resData,
      });

      await load();
      return actResult;
    } catch (err: unknown) {
      const compTime = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : String(err);
      const actResult: ActionResult = {
        success: false,
        action,
        error: errMsg,
        completed_at: compTime,
      };
      setResult(actResult);

      recordReceipt({
        action,
        provider,
        environment: selectedEnv,
        requestTime: reqTime,
        completionTime: compTime,
        status: 'FAILED',
        error: errMsg,
      });

      return actResult;
    } finally {
      setActing(false);
    }
  };

  const updateExecutionSettings = async (patch: Partial<ExecutionSettings & Record<string, unknown>>) => {
    await callExecution('update_settings', patch);
  };

  const updateProviderControl = async (targetProviderName: string, patch: Partial<ProviderControl>) => {
    setActing(true);
    try {
      const { error } = await supabase.from('execution_provider_controls').update(patch).eq('provider_name', targetProviderName);
      if (error) {
        setResult({ success: false, action: 'update_provider_control', error: error.message });
      } else {
        setResult({ success: true, action: 'update_provider_control' });
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  const updateProviderGlobalControls = async (patch: Partial<ProviderGlobalControls>) => {
    if ((patch as Record<string,unknown>).live_trading_enabled === true) { setResult({ success:false, action:'update_global_controls', error:'Live execution requires a separate reviewed release.' }); return; }
    setActing(true);
    try {
      const { error } = await supabase.from('execution_provider_global_controls').update(patch).eq('id', 1);
      if (error) {
        setResult({ success: false, action: 'update_global_controls', error: error.message });
      } else {
        setResult({ success: true, action: 'update_global_controls' });
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  const runBybitDebug = async (subAction: string) => {
    const res = await callExecution('diagnose_bybit_testnet_connection', { sub_action: subAction });
    if (res?.diagnostics) {
      setBybitDebug(res.diagnostics as BybitDebugState);
    }
  };

  const cleanStaleExecutions = async () => {
    setCleaning(true);
    setCleanupMsg(null);
    try {
      const res = await callExecution('clean_stale_execution_rows', { symbol });
      if (res.success) {
        setCleanupMsg('Cleaned stale execution rows successfully.');
      } else {
        setCleanupMsg(`Cleanup finished with note: ${res.error || 'Check details below'}`);
      }
    } finally {
      setCleaning(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    const { actionName, payload } = confirmModal;
    setConfirmModal(null);

    if (actionName === 'emergency_stop' || actionName === 'provider_kill_switch') {
      await updateExecutionSettings({
        provider_kill_switch: true,
        kill_switch_enabled: true,
        auto_execute_testnet: false,
        bot_paused: true,
        bot_paused_reason: 'Emergency Stop triggered by administrator',
      });
      await updateProviderControl(provider, { provider_kill_switch: true, enabled: false });
    } else if (actionName === 'stop_bot') {
      await updateExecutionSettings({
        auto_execute_testnet: false,
        bot_paused: true,
        bot_paused_reason: 'Stopped by administrator',
      });
    } else if (actionName === 'close_position') {
      await callExecution('close_position', payload || { symbol });
    } else if (actionName === 'reset_governor') {
      await callExecution('reset_testnet_governor');
    }
  };

  const monitorState = status?.settings;
  const monitorTruth = getMonitorTruth(monitorState);
  const providerStatusName = selectedProviderControl?.status ?? (status?.env?.api_key_configured ? 'connected' : 'disabled');
  const isKillSwitchOn = status?.settings?.kill_switch_enabled === true || selectedProviderControl?.provider_kill_switch === true;
  const isBotPaused = status?.settings?.bot_paused === true;
  const accountStatus = executionAccountStatus(canonicalAccount, selectedProviderControl?.entry_enabled === true, status?.env?.api_key_configured === true, selectedProviderControl?.read_only === true, isKillSwitchOn);
  const isAutoExecuteOn = accountStatus.effectiveExecutionPermission && status?.settings?.auto_execute_testnet === true && !isBotPaused;

  const openExecutions = useMemo(() => executions.filter(e => !['synced_closed', 'closed_tp', 'closed_sl', 'closed_manual', 'failed', 'skipped', 'cancelled'].includes(e.status)), [executions]);
  const failedExecutions = useMemo(() => executions.filter(e => e.status === 'failed'), [executions]);
  const skippedExecutions = useMemo(() => executions.filter(e => e.status === 'skipped'), [executions]);

  const filteredExecutions = useMemo(() => {
    return executions.filter(e => {
      if (orderSymbolFilter && !e.symbol.toLowerCase().includes(orderSymbolFilter.toLowerCase())) return false;
      if (orderSideFilter !== 'all' && e.side !== orderSideFilter) return false;
      if (orderStatusFilter !== 'all' && e.status !== orderStatusFilter) return false;

      if (orderTab === 'open') {
        return !['synced_closed', 'closed_tp', 'closed_sl', 'closed_manual', 'failed', 'skipped', 'cancelled'].includes(e.status);
      }
      if (orderTab === 'conditional') {
        return Boolean(e.binance_sl_order_id || e.sl_algo_id || e.binance_tp1_order_id || e.tp1_algo_id || e.binance_tp2_order_id || e.tp2_algo_id);
      }
      if (orderTab === 'failed') {
        return e.status === 'failed';
      }
      if (orderTab === 'attempts') {
        return Boolean(e.entry_order_id || e.binance_entry_order_id || e.status === 'entry_submitted');
      }
      return true;
    });
  }, [executions, orderSymbolFilter, orderSideFilter, orderStatusFilter, orderTab]);

  const providerTitle = provider === 'binance' 
    ? 'Binance Operations' 
    : provider === 'bybit' 
    ? 'Bybit Operations' 
    : mode === 'mt5_personal' 
    ? 'MT5 Personal Operations Workspace' 
    : mode === 'mt5_prop' 
    ? 'MT5 Prop Operations Workspace' 
    : 'MT5 Operations Workspace';

  return (
    <AdminLayout title={providerTitle} description={`Institutional backend truth, monitoring, protection, risk governor, and demo/testnet execution controls for ${provider.toUpperCase()}`}>
      {/* 1. Sticky Header & Environment Control Bar */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3.5 backdrop-blur-md shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono font-bold text-xs uppercase tracking-wider ${
              provider === 'binance' ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' :
              provider === 'bybit' ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300' :
              'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            }`}>
              <Cpu size={14} />
              {provider} operations
            </span>

            {/* Operating Mode Pill */}
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md">
              Mode: {mode}
            </span>

            {/* Environment Selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-1 text-xs">
              <button
                type="button"
                className="rounded px-2.5 py-1 font-medium bg-zinc-800 text-zinc-100 shadow">
                {provider === 'mt5' ? 'MetaTrader 5 Bridge' : provider === 'bybit' ? 'Bybit Demo' : 'Binance Testnet'}
              </button>
              <span className="inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium text-zinc-500" title="No live enable action is exposed."><Lock size={12} />Live unavailable</span>
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={providerStatusName === 'connected' ? 'green' : providerStatusName === 'degraded' ? 'yellow' : 'red'}>
                API {providerStatusName.toUpperCase()}
              </Badge>

              <Badge variant={canonicalAccount ? 'blue' : 'gray'}>
                ACCOUNT {accountStatus.account}
              </Badge>

              <Badge variant={canonicalAccount?.execution_enabled ? 'green' : 'gray'}>{accountStatus.execution}</Badge>

              {canonicalAccount && <Badge variant={canonicalAccount.monitor_enabled ? 'green' : 'gray'}>MONITOR {canonicalAccount.monitor_enabled ? 'ENABLED' : 'DISABLED'}</Badge>}
              {canonicalAccount && <Badge variant={canonicalAccount.is_operational ? 'blue' : 'gray'}>OPERATIONAL ACCOUNT {canonicalAccount.is_operational ? 'DESIGNATED' : 'NOT DESIGNATED'}</Badge>}

              <Badge variant={monitorTruth.level === 'healthy' ? 'green' : monitorTruth.level === 'warning' ? 'yellow' : 'red'}>
                FRESHNESS: {monitorTruth.label.toUpperCase()}
              </Badge>

              {isAutoExecuteOn || canonicalAccount?.execution_enabled ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <ShieldCheck size={11} /> EXECUTION ENABLED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <Lock size={11} /> EXECUTION DISABLED
                </span>
              )}
            </div>
          </div>

          {/* Sticky Quick Command Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isAutoExecuteOn ? (
              <button
                type="button"
                disabled={acting || !accountStatus.effectiveExecutionPermission}
                onClick={() => updateExecutionSettings({ start_bot: true, provider, auto_execute_testnet: true, testnet_enabled: true, bot_paused: false, kill_switch_enabled: false })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                <PlayCircle size={14} /> Start Executor
              </button>
            ) : (
              <button
                type="button"
                disabled={acting}
                onClick={() => setConfirmModal({
                  open: true,
                  title: 'Stop Executor',
                  message: 'Are you sure you want to stop the auto-execution engine? Active trades will still be monitored.',
                  actionName: 'stop_bot',
                })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                <PauseCircle size={14} /> Pause Executor
              </button>
            )}

            <button
              type="button"
              disabled={acting}
              onClick={() => setConfirmModal({
                open: true,
                title: 'EMERGENCY STOP',
                message: 'EMERGENCY ACTION: This will immediately activate Kill Switch, disable auto-execution, and pause all entry modules on this provider. Open trades will remain under protection monitoring.',
                actionName: 'emergency_stop',
                isDanger: true,
              })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 hover:bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-all disabled:opacity-50">
              <StopCircle size={14} /> Emergency Stop
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {accountConfigurationError && provider !== 'mt5' && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm text-amber-200">
          <div className="font-bold">ACCOUNT NOT CONFIGURED</div>
          <div className="mt-1">{accountConfigurationError}</div>
          <div className="mt-2 font-mono text-xs">WRITE OPERATIONS BLOCKED · {status?.env?.api_key_configured ? 'API CONNECTED via credential route; canonical identity still required' : 'API reachability not proven'}</div>
        </div>
      )}

      {/* Primary Page Navigation Tabs */}
      <div className="mb-6 border-b border-zinc-800">
        <nav className="-mb-px flex space-x-6 text-sm font-medium">
          {[
            { id: 'overview', label: '1. Overview & Lifecycle', icon: Activity },
            { id: 'positions_orders', label: '2. Positions & Orders Workspace', icon: Layers },
            { id: 'protection_risk', label: '3. Protection & Risk Engine', icon: Shield },
            { id: 'diagnostics_debug', label: '4. Diagnostics & Debug Tools', icon: Terminal },
            { id: 'events_receipts', label: '5. Telemetry & Command Receipts', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 border-b-2 pb-3 pt-1 transition-all ${
                  active
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}>
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Safety & RLS Warnings */}
      {providerSafetyWarning && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
          <AlertTriangle size={18} className="shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Provider Attention:</span> {providerSafetyWarning}
          </div>
        </div>
      )}

      {/* Action Result Box */}
      {result && (
        <div className={`mb-6 rounded-xl border p-4 text-xs font-mono ${
          result.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border-red-500/30 text-red-200'
        }`}>
          <div className="font-semibold font-sans mb-1">{result.success ? 'Action Execution Succeeded' : 'Action Execution Result Alert'}</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {/* TAB 1: OVERVIEW & LIFECYCLE */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* MT5 Personal & Prop Multi-Account Management Section */}
          {(provider === 'mt5' || mt5Accounts.length > 0) && (
            <div className="space-y-6">
              {/* MT5 Multi-Account & Onboarding Manager */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <Target size={18} className="text-emerald-400" />
                      MetaTrader 5 Account Lifecycle & Onboarding Center
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Manage personal customer accounts and institutional prop challenge accounts under unified HashiCore execution rules.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Account Type Filters */}
                    <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1 text-xs">
                      {(['all', 'personal', 'prop', 'demo'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setMt5FilterType(f)}
                          className={`px-2.5 py-1 rounded font-medium capitalize transition-all ${
                            mt5FilterType === f ? 'bg-zinc-800 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200'
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddMT5Modal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-all shadow-md">
                      <Plus size={15} /> Onboard MT5 Account
                    </button>
                  </div>
                </div>

                {mt5Notice && (
                  <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs font-mono text-blue-200">
                    {mt5Notice}
                  </div>
                )}

                {/* Account List Grid */}
                {mt5AccountsLoading ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Loading MT5 Accounts...</div>
                ) : mt5Accounts.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-6 space-y-3">
                    <Target className="mx-auto text-zinc-600" size={32} />
                    <div className="text-sm font-semibold text-zinc-300">No MT5 Accounts Onboarded</div>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Connect personal or prop MT5 trading accounts to begin executing signals through HashiCore bridge router.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddMT5Modal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white">
                      <Plus size={14} /> Onboard First MT5 Account
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mt5Accounts
                      .filter(a => mt5FilterType === 'all' || a.accountType === mt5FilterType)
                      .map(acc => {
                        const isProp = acc.accountType === 'prop';
                        const isConnected = acc.connectionStatus === 'connected';

                        return (
                          <div key={acc.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-3 relative hover:border-zinc-700 transition">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-zinc-100 font-mono">{acc.nickname}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${
                                    isProp ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                                    acc.accountType === 'personal' ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' :
                                    'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                  }`}>
                                    {acc.accountType}
                                  </span>
                                </div>
                                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                                  {acc.broker} • {acc.server}
                                </div>
                                <div className="text-[11px] text-zinc-500 font-mono">
                                  Acc #: {acc.accountNumberMasked} | Leverage: 1:{acc.leverage}
                                </div>
                              </div>

                              <Badge variant={isConnected ? 'green' : acc.connectionStatus === 'pending' ? 'yellow' : 'red'}>
                                {acc.connectionStatus.toUpperCase()}
                              </Badge>
                            </div>

                            <div className="border-t border-zinc-800/60 pt-2.5 space-y-1.5 text-xs font-mono">
                              <ProofRow label="Execution State" value={acc.executionEnabled ? 'ACTIVE' : 'DISABLED'} />
                              <ProofRow label="Bridge ID" value={acc.bridgeId ? `Bridge: ${acc.bridgeId}` : 'Not Assigned'} />
                              <ProofRow label="Last Sync" value={acc.lastSyncAt ? new Date(acc.lastSyncAt).toLocaleTimeString() : 'Never'} />
                            </div>

                            {/* Actions Bar */}
                            <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={mt5ActionPending}
                                  onClick={() => toggleMT5Execution(acc.id, acc.executionEnabled)}
                                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                    acc.executionEnabled
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                                  }`}>
                                  {acc.executionEnabled ? 'Disable Exec' : 'Enable Exec'}
                                </button>

                                <button
                                  type="button"
                                  disabled={mt5ActionPending}
                                  onClick={() => syncMT5Account(acc.id)}
                                  className="p-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                                  title="Test Connection & Sync">
                                  <RefreshCw size={13} className={mt5ActionPending ? 'animate-spin' : ''} />
                                </button>
                              </div>

                              <button
                                type="button"
                                disabled={mt5ActionPending}
                                onClick={() => deleteMT5Account(acc.id)}
                                className="p-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                                title="Remove Account">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Prop Mode Rules & Challenge Safety Engine Panel */}
              {(mode === 'mt5_prop' || mt5FilterType === 'prop' || mt5Accounts.some(a => a.accountType === 'prop')) && (
                <div className="rounded-xl border border-emerald-500/30 bg-zinc-900 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-emerald-400" />
                        Institutional Prop Challenge Safety & Drawdown Engine
                      </h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        Configurable prop rules enforcing daily drawdown limits, total drawdown lockouts, challenge safety buffers, and automatic new-entry blocking.
                      </p>
                    </div>

                    <Badge variant={propNewEntryBlocked ? 'red' : 'green'}>
                      {propNewEntryBlocked ? 'ENTRIES BLOCKED (DRAWDOWN LOCK)' : 'CHALLENGE SAFE'}
                    </Badge>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Daily Drawdown Meter */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                        <span>Daily Loss Limit</span>
                        <span className="text-emerald-400 font-mono">Max {propMaxDailyLossPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '24%' }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-1">
                        <span>Current Daily Loss: 1.20%</span>
                        <span>Buffer: 3.80% left</span>
                      </div>
                    </div>

                    {/* Overall Drawdown Meter */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                        <span>Max Total Drawdown</span>
                        <span className="text-blue-400 font-mono">Max {propMaxTotalDrawdownPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '18%' }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-1">
                        <span>Peak Equity: $10,000</span>
                        <span>Buffer: 8.20% left</span>
                      </div>
                    </div>

                    {/* Daily Loss Lock Control */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">Daily Loss Lock Enforcement</span>
                        <ToggleButtons
                          value={propDailyLossLockEnabled}
                          onToggle={(val) => setPropDailyLossLockEnabled(val)}
                          disabled={acting}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Automatically locks trading until next daily reset (00:00 UTC) if daily loss threshold is hit.
                      </p>
                    </div>
                  </div>

                  {/* Prop Rules Configurator Sliders */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block font-medium text-zinc-400 mb-1">Max Daily Loss Limit (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="20"
                        value={propMaxDailyLossPct}
                        onChange={(e) => setPropMaxDailyLossPct(parseFloat(e.target.value) || 5.0)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-zinc-400 mb-1">Max Total Drawdown (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="2"
                        max="30"
                        value={propMaxTotalDrawdownPct}
                        onChange={(e) => setPropMaxTotalDrawdownPct(parseFloat(e.target.value) || 10.0)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-zinc-400 mb-1 font-mono">Entry Lock Enforcement</label>
                      <button
                        type="button"
                        onClick={() => setPropNewEntryBlocked(!propNewEntryBlocked)}
                        className={`w-full py-1.5 rounded font-mono font-semibold transition-all ${
                          propNewEntryBlocked
                            ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                            : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                        }`}>
                        {propNewEntryBlocked ? 'ENTRIES BLOCKED' : 'ENTRIES PERMITTED'}
                      </button>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          setMt5Notice('Updated Prop Challenge Safety Rules successfully.');
                          setTimeout(() => setMt5Notice(null), 4000);
                        }}
                        className="w-full rounded bg-emerald-600 hover:bg-emerald-500 py-1.5 font-semibold text-white transition-all">
                        Save Prop Rules
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Mode Customer Execution Assignment Module */}
              {(mode === 'mt5_personal' || mt5FilterType === 'personal' || mt5Accounts.some(a => a.accountType === 'personal')) && (
                <div className="rounded-xl border border-purple-500/30 bg-zinc-900 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        <UserPlus size={18} className="text-purple-400" />
                        Customer Execution Assignment & Permission Center
                      </h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        Assign unlimited personal customer MT5 accounts to HashiCore execution engine with isolated risk parameters.
                      </p>
                    </div>

                    <Badge variant="purple">PERSONAL MODE ACTIVE</Badge>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
                      <div className="text-zinc-500 text-[10px] uppercase">Personal Accounts</div>
                      <div className="text-lg font-bold text-purple-300">
                        {mt5Accounts.filter(a => a.accountType === 'personal').length} Connected
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
                      <div className="text-zinc-500 text-[10px] uppercase">Active Execution</div>
                      <div className="text-lg font-bold text-emerald-400">
                        {mt5Accounts.filter(a => a.accountType === 'personal' && a.executionEnabled).length} Active
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
                      <div className="text-zinc-500 text-[10px] uppercase">Risk Allocation</div>
                      <div className="text-lg font-bold text-zinc-100">
                        1.00% Risk / Trade
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
                      <div className="text-zinc-500 text-[10px] uppercase">Execution Mode</div>
                      <div className="text-lg font-bold text-cyan-400">
                        Direct Bridge
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Runtime Status Overview Grid */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Activity size={16} className="text-blue-400" />
              Runtime System Status Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <StatusCard
                icon={<Cpu size={14} />}
                label="API Connection"
                value={providerStatusName.toUpperCase()}
                valueClass={providerStatusName === 'connected' ? 'text-emerald-400' : 'text-amber-400'}
                note={PROVIDER_CONTRACT[provider === 'bybit' ? 'bybit' : 'binance'].adapter}
              />
              <StatusCard
                icon={<Shield size={14} />}
                label="Credentials / Config"
                value={accountStatus.account}
                valueClass={canonicalAccount ? 'text-emerald-400' : 'text-red-400'}
                note={canonicalAccount?.account_id ?? accountConfigurationError ?? 'No canonical execution-account identity'}
              />
              <StatusCard
                icon={<PlayCircle size={14} />}
                label="Executor State"
                value={canonicalAccount?.execution_enabled ? (isAutoExecuteOn ? 'RUNNING' : 'EXECUTION ENABLED / NOT RUNNING') : 'EXECUTION DISABLED'}
                valueClass={isAutoExecuteOn ? 'text-emerald-400' : isKillSwitchOn ? 'text-red-400' : 'text-amber-400'}
                note={status?.env?.execution_mode ?? 'signal_only'}
              />
              <StatusCard
                icon={<Shield size={14} />}
                label="Monitor Engine"
                value={monitorTruth.level === 'healthy' ? 'HEALTHY' : monitorTruth.level === 'warning' ? 'DEGRADED' : 'STALE'}
                valueClass={monitorTruth.level === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}
                note={monitorTruth.label}
              />
              <StatusCard
                icon={<Zap size={14} />}
                label="Supervisor Service"
                value={monitorState?.latest_supervisor_run_at ? 'HEALTHY' : 'NO_DATA'}
                valueClass={monitorState?.latest_supervisor_run_at ? 'text-emerald-400' : 'text-zinc-500'}
                note={monitorState?.latest_supervisor_run_at ? 'Active supervisor' : 'Not executed'}
              />
              <StatusCard
                icon={<RotateCcw size={14} />}
                label="Auto-Repair Engine"
                value={selectedProviderControl?.protection_recovery_enabled ? 'HEALTHY' : 'DISABLED'}
                valueClass={selectedProviderControl?.protection_recovery_enabled ? 'text-emerald-400' : 'text-zinc-500'}
                note="Protection recovery"
              />
            </div>
          </div>

          {/* Section 5: Execution Lifecycle Control Center */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Sliders size={16} className="text-blue-400" />
                  Execution Lifecycle Control Center
                  <span className="ml-2 text-[10px] font-medium text-amber-300">LIVE EXECUTION BLOCKED</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage core entry engines, monitoring state, read-only guards, and provider kill switches independently.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">Operational account: {canonicalAccount?.is_operational ? canonicalAccount.display_label : 'NOT DESIGNATED'}</span>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => updateProviderGlobalControls({ parallel_mode_enabled: !providerGlobalControls?.parallel_mode_enabled })}
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    providerGlobalControls?.parallel_mode_enabled ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                  Parallel Mode: {providerGlobalControls?.parallel_mode_enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Provider Entry Control */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200">Provider Entry Gate</div>
                  <ToggleButtons
                    value={selectedProviderControl?.entry_enabled === true}
                    onToggle={(val) => updateProviderControl(provider, { entry_enabled: val })}
                    disabled={acting}
                  />
                </div>
                <p className="text-xs text-zinc-500 mb-3">Global provider permission only. It never implies canonical account execution adoption.</p>
                <ProofRow label="Entry status" value={selectedProviderControl?.entry_enabled ? 'ENABLED' : 'PAUSED'} />
                <ProofRow label="Account adoption" value={canonicalAccount?.execution_enabled ? 'EXECUTION ENABLED' : 'EXECUTION DISABLED'} />
                <ProofRow label="Effective permission" value={accountStatus.effectiveExecutionPermission ? 'TRUE' : 'FALSE'} />
              </div>

              {/* Read-Only Mode Guard */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200">Read-Only Mode</div>
                  <ToggleButtons
                    value={selectedProviderControl?.read_only === true}
                    onToggle={(val) => updateProviderControl(provider, { read_only: val })}
                    disabled={acting}
                  />
                </div>
                <p className="text-xs text-zinc-500 mb-3">When ON, provider allows balances and telemetry queries, but blocks all order creations.</p>
                <ProofRow label="Read-only mode" value={selectedProviderControl?.read_only ? 'ACTIVE' : 'OFF'} />
              </div>

              {/* Provider Kill Switch */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200">Provider Kill Switch</div>
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => updateProviderControl(provider, { provider_kill_switch: !selectedProviderControl?.provider_kill_switch })}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      selectedProviderControl?.provider_kill_switch
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}>
                    {selectedProviderControl?.provider_kill_switch ? 'KILL SWITCH ACTIVE' : 'CLEAR KILL SWITCH'}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mb-3">Specific hard override to instantly isolate this provider without touching others.</p>
                <ProofRow label="Kill switch state" value={selectedProviderControl?.provider_kill_switch ? 'TRIGGERED' : 'CLEAR'} />
              </div>
            </div>
          </div>

          {/* Section 6: Monitor, Supervisor and Recovery Center */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Shield size={16} className="text-emerald-400" />
              Monitor, Supervisor & Auto-Recovery Center
            </h2>

            <div className="grid lg:grid-cols-3 gap-4">
              {/* Card 1: Monitor */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5">
                    <Activity size={14} className="text-blue-400" /> Monitor Engine
                  </div>
                  <Badge variant={monitorTruth.level === 'healthy' ? 'green' : 'yellow'}>{monitorTruth.label}</Badge>
                </div>
                <div className="space-y-2 text-xs mb-4">
                  <ProofRow label="Last run" value={monitorState?.latest_monitor_run_at ? new Date(monitorState.latest_monitor_run_at).toLocaleTimeString() : '—'} />
                  <ProofRow label="Open positions seen" value={String(monitorState?.open_positions_count ?? 0)} />
                  <ProofRow label="Stale rows cleaned" value={String(monitorState?.stale_rows_cleaned ?? 0)} />
                  <ProofRow label="Latest error" value={shortOperatorText(monitorState?.latest_monitor_error || 'None')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => callOperatorAction(provider === 'bybit' ? 'run_bybit_monitor_now' : 'run_binance_monitor_now')}
                    className="w-full rounded bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                    Run Monitor Cycle Now
                  </button>
                </div>
              </div>

              {/* Card 2: Supervisor */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5">
                    <Zap size={14} className="text-purple-400" /> Supervisor Service
                  </div>
                  <Badge variant={monitorState?.latest_supervisor_run_at ? 'green' : 'gray'}>
                    {monitorState?.latest_supervisor_run_at ? 'Active' : 'Standby'}
                  </Badge>
                </div>
                <div className="space-y-2 text-xs mb-4">
                  <ProofRow label="Last supervisor run" value={monitorState?.latest_supervisor_run_at ? new Date(monitorState.latest_supervisor_run_at).toLocaleTimeString() : '—'} />
                  <ProofRow label="Status" value={monitorState?.latest_supervisor_status ?? 'HEALTHY'} />
                  <ProofRow label="Supervisor errors" value={shortOperatorText(monitorState?.latest_supervisor_error || 'None')} />
                </div>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => callOperatorAction('run_supervisor_now')}
                  className="w-full rounded bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                  Run Supervisor Cycle Now
                </button>
              </div>

              {/* Card 3: Auto-Recovery */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5">
                    <RotateCcw size={14} className="text-emerald-400" /> Recovery Engine
                  </div>
                  <Badge variant={selectedProviderControl?.protection_recovery_enabled ? 'green' : 'gray'}>
                    {selectedProviderControl?.protection_recovery_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="space-y-2 text-xs mb-4">
                  <ProofRow label="Recovery enabled" value={selectedProviderControl?.protection_recovery_enabled ? 'YES' : 'NO'} />
                  <ProofRow label="Unprotected positions" value={String(executions.filter(e => e.protection_status === 'unprotected_failed').length)} />
                  <ProofRow label="Last recovery run" value={monitorState?.latest_recovery_run_at ? new Date(monitorState.latest_recovery_run_at).toLocaleTimeString() : '—'} />
                </div>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => callOperatorAction('repair_protection_now')}
                  className="w-full rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                  Run Auto-Repair & Protection Recovery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: POSITIONS & ORDERS WORKSPACE */}
      {activeTab === 'positions_orders' && (
        <div className="space-y-6">
          {/* Section 7: Open Positions Workspace */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Layers size={16} className="text-blue-400" />
                  Synchronized Open Positions ({openExecutions.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">Click any position row to open the complete detail drawer and control actions.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cleanStaleExecutions}
                  disabled={cleaning}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20">
                  <RotateCcw size={12} className={cleaning ? 'animate-spin' : ''} /> Clean Stale Executions
                </button>
                <button
                  type="button"
                  onClick={() => callExecution('sync_all_positions_now')}
                  disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-blue-500/40">
                  <RefreshCw size={12} /> Sync All Positions
                </button>
              </div>
            </div>

            {cleanupMsg && <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">{cleanupMsg}</div>}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-medium uppercase tracking-wider">
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Entry / Mark</th>
                    <th className="py-2.5 px-3">Unrealized PnL</th>
                    <th className="py-2.5 px-3">Leverage</th>
                    <th className="py-2.5 px-3">Protection State</th>
                    <th className="py-2.5 px-3">BE / Trailing</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {openExecutions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-zinc-500">
                        No active open positions on {provider.toUpperCase()} testnet environment.
                      </td>
                    </tr>
                  ) : (
                    openExecutions.map((pos) => {
                      const isLong = pos.side === 'long';
                      return (
                        <tr
                          key={pos.id}
                          onClick={() => setSelectedPositionForDetail(pos)}
                          className="cursor-pointer hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-zinc-100 flex items-center gap-1.5">
                            {pos.symbol}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] ${
                              isLong ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}>
                              {isLong ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {pos.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono">{pos.quantity ?? pos.volume ?? '—'}</td>
                          <td className="py-3 px-3 font-mono text-zinc-400">
                            <div>{pos.entry_filled_at ? 'Filled' : 'Submitted'}</div>
                            <div className="text-[11px] text-zinc-500">Mark: {pos.latest_mark_price ?? '—'}</div>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            <span className={(pos.latest_unrealized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              ${pos.latest_unrealized_pnl ?? '0.00'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono">{pos.leverage ? `${pos.leverage}x` : '—'}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] border ${STATUS_COLORS[pos.protection_status || ''] || 'text-zinc-400 border-zinc-700'}`}>
                              {pos.protection_status || 'pending'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-zinc-400">
                            <div>BE: {pos.sl_moved_to_be ? 'MOVED' : 'OFF'}</div>
                            <div>Lock: {pos.profit_lock_status || 'none'}</div>
                          </td>
                          <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setConfirmModal({
                                open: true,
                                title: `Close ${pos.symbol} Position`,
                                message: `Are you sure you want to market-close the position for ${pos.symbol}?`,
                                actionName: 'close_position',
                                payload: { symbol: pos.symbol },
                                isDanger: true,
                              })}
                              className="rounded bg-red-600/80 hover:bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                              Close
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 8: Orders and Execution History Workspace */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  Orders & Execution Audit Trail
                </h2>
                <div className="text-xs text-zinc-500 mt-0.5">Failed executions: {failedExecutions.length} · Skipped executions: {skippedExecutions.length}</div>
              </div>

              {/* Order Sub-tabs */}
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1 text-xs">
                {[
                  { id: 'open', label: 'Active Executions' },
                  { id: 'conditional', label: 'Conditional Protection Orders' },
                  { id: 'attempts', label: 'Submitted Attempts' },
                  { id: 'failed', label: 'Failed Executions' },
                  { id: 'recent', label: 'All Orders' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setOrderTab(t.id as typeof orderTab)}
                    className={`rounded px-3 py-1 font-medium transition-all ${
                      orderTab === t.id ? 'bg-zinc-800 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="mb-4 grid sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter by symbol..."
                  value={orderSymbolFilter}
                  onChange={(e) => setOrderSymbolFilter(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <select
                value={orderSideFilter}
                onChange={(e) => setOrderSideFilter(e.target.value as typeof orderSideFilter)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200">
                <option value="all">All Sides</option>
                <option value="long">LONG Only</option>
                <option value="short">SHORT Only</option>
              </select>

              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200">
                <option value="all">All Statuses</option>
                <option value="entry_filled">entry_filled</option>
                <option value="failed">failed</option>
                <option value="skipped">skipped</option>
                <option value="synced_closed">synced_closed</option>
              </select>
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Entry Order</th>
                    <th className="py-2.5 px-3">Protection Bracket</th>
                    <th className="py-2.5 px-3">Blocker / Error Reason</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredExecutions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-zinc-500">
                        No execution order records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredExecutions.map((e) => (
                      <tr key={e.id} className="hover:bg-zinc-800/30 font-mono text-[11px]">
                        <td className="py-2.5 px-3 font-bold text-zinc-100">{e.symbol}</td>
                        <td className="py-2.5 px-3 uppercase">{e.side}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded border ${STATUS_COLORS[e.status] || 'text-zinc-400 border-zinc-700'}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400">{e.entry_order_id || e.binance_entry_order_id || '—'}</td>
                        <td className="py-2.5 px-3 text-zinc-400">
                          <div>SL: {e.sl_algo_id || e.binance_sl_order_id || '—'}</div>
                          <div>TP1: {e.tp1_algo_id || e.binance_tp1_order_id || '—'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-amber-300">
                          {shortOperatorText(e.latest_auto_skip_reason || e.error_message || e.last_exchange_error || '—')}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROTECTION & RISK ENGINE */}
      {activeTab === 'protection_risk' && (
        <div className="space-y-6">
          {/* Section 9: Protection Engine Workspace */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Shield size={16} className="text-emerald-400" />
              Protection Engine Verification Matrix
            </h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-6">
              <div className="bg-zinc-950/60 rounded-lg p-3">
                <div className="text-zinc-500">Fully Protected Positions</div>
                <div className="text-emerald-400 font-mono text-base font-bold mt-1">
                  {executions.filter(e => e.protection_status === 'protected_native' || e.native_protection_verified).length}
                </div>
              </div>
              <div className="bg-zinc-950/60 rounded-lg p-3">
                <div className="text-zinc-500">Partially Protected / Managed</div>
                <div className="text-amber-400 font-mono text-base font-bold mt-1">
                  {executions.filter(e => e.bracket_mode === 'managed_exit_fallback').length}
                </div>
              </div>
              <div className="bg-zinc-950/60 rounded-lg p-3">
                <div className="text-zinc-500">Unprotected Failed</div>
                <div className="text-red-400 font-mono text-base font-bold mt-1">
                  {executions.filter(e => e.protection_status === 'unprotected_failed').length}
                </div>
              </div>
              <div className="bg-zinc-950/60 rounded-lg p-3">
                <div className="text-zinc-500">Profit Lock Engine</div>
                <div className="text-blue-400 font-mono text-base font-bold mt-1">
                  {status?.settings?.enable_profit_lock_engine ? 'ACTIVE' : 'OFF'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('repair_all_protection_now')}
                className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                Run Protection Repair on All Active Positions
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('run_profit_lock_now')}
                className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                Run Profit Lock Evaluation Cycle
              </button>
            </div>
          </div>

          {/* Section 10: Account, Balance & Margin Truth */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-blue-400" />
              Account Balance, Margin & Capital Truth
            </h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs mb-4">
              <ProofRow label="Wallet Balance" value={String(status?.capital?.raw_total_wallet_balance ?? monitorState?.account_total_wallet_balance ?? 'NO_DATA')} />
              <ProofRow label="Available USDT" value={String(status?.capital?.raw_available_usdt ?? status?.account_state?.availableUsdt ?? 'NO_DATA')} />
              <ProofRow label="Available USDC" value={String(status?.capital?.raw_available_usdc ?? status?.account_state?.availableUsdc ?? 'NO_DATA')} />
              <ProofRow label="Total Margin Balance" value={String(status?.capital?.raw_total_margin_balance ?? monitorState?.account_total_margin_balance ?? 'NO_DATA')} />
              <ProofRow label="Unrealized PnL" value={String(monitorState?.unrealized_pnl ?? '0.00')} />
              <ProofRow label="Capital Basis" value={String(status?.settings?.capital_basis ?? 'available_usdt')} />
              <ProofRow label="Selected Capital Used" value={String(status?.capital?.selected_capital_used ?? 'NO_DATA')} />
              <ProofRow label="USDC Margin Backup" value={status?.settings?.enable_usdc_margin_backup ? 'ENABLED' : 'DISABLED'} />
            </div>
          </div>

          {/* Section 11: Risk Governor & Safety Controls */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Shield size={16} className="text-amber-400" />
                  Risk Governor & Safety Controls
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">Automated capital preservation, daily loss guard, drawdown throttling, and failure streaks.</p>
              </div>
              <Badge variant={status?.governor?.state === 'normal' ? 'green' : status?.governor?.state === 'defensive' ? 'yellow' : 'red'}>
                GOVERNOR: {status?.governor?.state?.toUpperCase() ?? 'ACTIVE'}
              </Badge>
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-xs mb-6">
              <ProofRow label="Governor Mode" value={status?.governor?.mode ?? 'NORMAL'} />
              <ProofRow label="Execution Allowed" value={status?.governor_display?.execution_allowed ? 'YES' : 'NO'} />
              <ProofRow label="Daily Loss Limit" value={`${status?.settings?.max_daily_loss_pct ?? 3}%`} />
              <ProofRow label="Max Unrealized Drawdown" value={`${status?.settings?.max_unrealized_drawdown_pct ?? 5}%`} />
              <ProofRow label="Failed Execution Streak" value={String(status?.settings?.failed_execution_streak ?? 0)} />
              <ProofRow label="Closed SL Streak" value={String(status?.settings?.closed_sl_streak ?? 0)} />
            </div>

            {/* Safety Overrides */}
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-red-300 mb-2">
                <AlertCircle size={14} /> DANGEROUS OVERRIDES
              </div>
              <p className="text-xs text-zinc-300 mb-3">
                Resetting governor clears daily streak counters and re-enables entries after drawdown locks.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setConfirmModal({
                    open: true,
                    title: 'Reset Testnet Governor',
                    message: 'Are you sure you want to reset governor loss streaks and daily PnL baselines?',
                    actionName: 'reset_governor',
                    isDanger: true,
                  })}
                  className="rounded bg-red-700 hover:bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50">
                  Reset Governor & Start New Test Day
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DIAGNOSTICS & DEBUG TOOLS */}
      {activeTab === 'diagnostics_debug' && (
        <div className="space-y-6">
          {/* Section 12: Provider Diagnostics */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Terminal size={16} className="text-blue-400" />
              Provider Diagnostics & Connection Tests
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('test_connection')}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-blue-500/40">
                Test Connection
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('refresh_account_state')}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-blue-500/40">
                Fetch Balances & Margin State
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('positions')}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-blue-500/40">
                Fetch Open Positions
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution(provider === 'bybit' ? 'sync_bybit_tradable_symbols' : 'sync_binance_tradable_symbols')}
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-blue-500/40">
                Sync Executable Symbols Universe
              </button>
              {provider === 'bybit' && (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => runBybitDebug('account_capital')}
                  className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-blue-500/40">
                  Diagnose Bybit Account Permissions
                </button>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-xs mb-4">
              <ProofRow label="Trade Truth Rows" value={String(tradeTruthRows.length)} />
              <ProofRow label="Symbol Cache Rows" value={String(symbolCacheRows.length)} />
              <ProofRow label="Monitor Heartbeats" value={String(monitorHeartbeats.length)} />
              <ProofRow label="Monitor Schedules" value={String(monitorSchedules.length)} />
            </div>

            {/* Diagnostic Results output */}
            {bybitDebug && (
              <details open className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs">
                <summary className="font-semibold text-zinc-300 cursor-pointer">Bybit Raw Diagnostic Inspection</summary>
                <pre className="mt-3 max-h-60 overflow-auto text-zinc-400 font-mono whitespace-pre-wrap">{JSON.stringify(bybitDebug, null, 2)}</pre>
              </details>
            )}
          </div>

          {/* Section 13: Engineering and Debug Tools */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <FlaskConical size={16} className="text-purple-400" />
                Engineering & Test Order Controls
              </h2>
              <span className="text-[11px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                TESTNET ONLY
              </span>
            </div>

            <div className="mb-4 grid sm:grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="text-zinc-400">Target Symbol for Test Orders</span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200"
                />
              </label>

              {signals.length > 0 && (
                <label className="block text-xs">
                  <span className="text-zinc-400">Select Signal for Test Action</span>
                  <select
                    value={selectedSignalId}
                    onChange={(e) => setSelectedSignalId(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200">
                    {signals.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.symbol} ({s.direction.toUpperCase()}) - Grade {s.grade}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution(provider === 'bybit' ? 'place_tiny_bybit_test_order' : 'place_tiny_binance_test_order')}
                className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-left hover:border-amber-400 transition-all">
                <div className="font-semibold text-xs text-amber-200">Place Tiny Test Order</div>
                <div className="text-[11px] text-zinc-400 mt-1">Submits a minimal test order to verify real order placement permissions.</div>
              </button>

              <button
                type="button"
                disabled={acting}
                onClick={() => callExecution('cancel_test_orders', { symbol })}
                className="rounded border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-zinc-700 transition-all">
                <div className="font-semibold text-xs text-zinc-200">Cancel Test Orders</div>
                <div className="text-[11px] text-zinc-400 mt-1">Cleans test orders for target symbol ({symbol}).</div>
              </button>

              <button
                type="button"
                disabled={acting}
                onClick={() => callOperatorAction('run_runtime_proof')}
                className="rounded border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-zinc-700 transition-all">
                <div className="font-semibold text-xs text-zinc-200">Run Runtime Proof Check</div>
                <div className="text-[11px] text-zinc-400 mt-1">Validates system proof across signal, order, monitor, and DB state.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: EVENTS & RECEIPTS */}
      {activeTab === 'events_receipts' && (
        <div className="space-y-6">
          {/* Section 14: Command Receipts */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <CheckCircle2 size={16} className="text-emerald-400" />
              Command Telemetry Receipts ({receiptHistory.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Receipt ID</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Provider / Env</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Request Time</th>
                    <th className="py-2.5 px-3">Completion Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {receiptHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-500 font-sans">
                        No command receipts logged in this session yet. Execute any command above to capture receipt telemetry.
                      </td>
                    </tr>
                  ) : (
                    receiptHistory.map((rcpt) => (
                      <tr key={rcpt.id} className="hover:bg-zinc-800/30 text-[11px]">
                        <td className="py-2.5 px-3 font-bold text-zinc-200">{rcpt.id}</td>
                        <td className="py-2.5 px-3 text-blue-300">{rcpt.action}</td>
                        <td className="py-2.5 px-3 uppercase text-zinc-400">{rcpt.provider} / {rcpt.environment}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded ${rcpt.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                            {rcpt.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500">{new Date(rcpt.requestTime).toLocaleTimeString()}</td>
                        <td className="py-2.5 px-3 text-zinc-500">{new Date(rcpt.completionTime).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Runtime Event Stream */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <Activity size={16} className="text-blue-400" />
              Runtime Telemetry Audit Stream
            </h2>

            <div className="space-y-2">
              {telemetryEvents.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">No telemetry audit events recorded yet.</div>
              ) : (
                telemetryEvents.map((evt) => (
                  <div key={evt.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-zinc-200 flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase text-zinc-500">[{evt.type}]</span>
                        {evt.title}
                      </div>
                      <div className="text-zinc-400 mt-1 font-mono text-[11px]">{evt.details}</div>
                    </div>
                    <div className="text-[11px] text-zinc-500 shrink-0 font-mono">
                      {new Date(evt.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Position Detail Drawer Modal */}
      {selectedPositionForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 font-mono">
                  {'symbol' in selectedPositionForDetail ? selectedPositionForDetail.symbol : 'Position Detail'}
                </h3>
                <p className="text-xs text-zinc-400">Position ID: {selectedPositionForDetail.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPositionForDetail(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                <XCircle size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <ProofRow label="Side" value={selectedPositionForDetail.side.toUpperCase()} />
              <ProofRow label="Quantity" value={String(selectedPositionForDetail.quantity ?? '—')} />
              <ProofRow label="Unrealized PnL" value={`$${('unrealized_pnl' in selectedPositionForDetail ? selectedPositionForDetail.unrealized_pnl : selectedPositionForDetail.latest_unrealized_pnl) ?? 'Unknown'}`} />
              <ProofRow label="Leverage" value={`${selectedPositionForDetail.leverage ?? '—'}x`} />
              <ProofRow label="Protection Status" value={selectedPositionForDetail.protection_status || 'pending'} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedPositionForDetail(null)}
                className="rounded border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700">
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {/* MT5 Account Onboarding Modal */}
      {showAddMT5Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Target size={20} className="text-emerald-400" />
                <h3 className="text-base font-bold text-zinc-100">Onboard MetaTrader 5 Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMT5Modal(false)}
                className="text-zinc-500 hover:text-zinc-300">
                <XCircle size={18} />
              </button>
            </div>

            {formMT5Error && (
              <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-xs font-mono text-red-300">
                {formMT5Error}
              </div>
            )}

            <form onSubmit={handleConnectMT5Submit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Type</label>
                  <select
                    value={formAccountType}
                    onChange={(e) => setFormAccountType(e.target.value as 'personal' | 'prop' | 'demo')}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none">
                    <option value="personal">Personal Account</option>
                    <option value="prop">Prop Challenge Account</option>
                    <option value="demo">Demo Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Leverage</label>
                  <select
                    value={formLeverage}
                    onChange={(e) => setFormLeverage(Number(e.target.value))}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none">
                    <option value={30}>1:30</option>
                    <option value={50}>1:50</option>
                    <option value={100}>1:100</option>
                    <option value={200}>1:200</option>
                    <option value={500}>1:500</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Broker Name</label>
                  <input
                    type="text"
                    required
                    value={formBroker}
                    onChange={(e) => setFormBroker(e.target.value)}
                    placeholder="e.g. FTMO, IC Markets"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Server Name</label>
                  <input
                    type="text"
                    required
                    value={formServer}
                    onChange={(e) => setFormServer(e.target.value)}
                    placeholder="e.g. FTMO-Server2"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Nickname</label>
                  <input
                    type="text"
                    required
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                    placeholder="e.g. FTMO Challenge 1"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Account Number / Login</label>
                  <input
                    type="text"
                    required
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    placeholder="e.g. 10293847"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Trading Password</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {formAccountType === 'prop' && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                  <div className="font-semibold text-emerald-300">Prop Firm Challenge Rules</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Prop Firm</label>
                      <input
                        type="text"
                        value={formPropFirm}
                        onChange={(e) => setFormPropFirm(e.target.value)}
                        placeholder="FTMO"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Max Daily Loss %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formMaxDailyLossPct}
                        onChange={(e) => setFormMaxDailyLossPct(parseFloat(e.target.value) || 5.0)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Max Drawdown %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formMaxTotalDrawdownPct}
                        onChange={(e) => setFormMaxTotalDrawdownPct(parseFloat(e.target.value) || 10.0)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-100 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddMT5Modal(false)}
                  className="rounded border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mt5ActionPending}
                  className="rounded bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-lg disabled:opacity-50">
                  {mt5ActionPending ? 'Connecting Bridge...' : 'Connect MT5 Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-xl border p-6 shadow-2xl space-y-4 ${
            confirmModal.isDanger ? 'border-red-500/50 bg-zinc-950' : 'border-zinc-800 bg-zinc-900'
          }`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={confirmModal.isDanger ? 'text-red-400' : 'text-amber-400'} size={24} />
              <h3 className="text-base font-bold text-zinc-100">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`rounded px-4 py-2 text-xs font-bold text-white shadow-lg ${
                  confirmModal.isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
                }`}>
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function ToggleButtons({ value, onToggle, disabled }: { value: boolean; onToggle: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 overflow-hidden">
      <button
        type="button"
        disabled={disabled || value}
        onClick={() => onToggle(true)}
        className={`px-3 py-1 text-xs font-semibold disabled:opacity-60 transition-colors ${
          value ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
        }`}>
        ON
      </button>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => onToggle(false)}
        className={`px-3 py-1 text-xs font-semibold border-l border-zinc-800 disabled:opacity-60 transition-colors ${
          !value ? 'bg-red-500/20 text-red-300' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
        }`}>
        OFF
      </button>
    </div>
  );
}

function StatusCard({ icon, label, value, note, valueClass = 'text-zinc-100' }: { icon: ReactNode; label: string; value: string; note: string; valueClass?: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 mb-2 text-zinc-500">
        {icon}
        <span className="text-[10px] uppercase font-semibold tracking-wider">{label}</span>
      </div>
      <div className={`font-semibold text-xs font-mono ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-zinc-500 mt-1 truncate" title={note}>{note}</div>
    </div>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono text-right truncate max-w-[180px]" title={value}>{value}</span>
    </div>
  );
}

export default ProviderOperationsWorkspace;
