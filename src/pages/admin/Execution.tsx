import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { BinanceExecutionOrder, ExecutionSettings, Signal } from '../../lib/types';
import { Shield, AlertTriangle, Cpu, Activity, Send, RefreshCw, XCircle, PlayCircle, FlaskConical, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  entry_submitted: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  entry_filled: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  sl_submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  tp_submitted: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  partially_closed: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  closed_tp: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  closed_sl: 'text-red-400 bg-red-500/10 border-red-500/20',
  closed_timeout: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  skipped: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  cancelled: 'text-zinc-400 bg-zinc-800 border-zinc-700',
};


type ExecutionSettingsSnapshot = {
  latest_monitor_run_at: string | null;
  latest_monitor_status: string;
  latest_monitor_result: Record<string, unknown> | null;
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
  capital?: { raw_total_margin_balance?: number; raw_total_wallet_balance?: number; raw_available_usdt?: number; raw_available_usdc?: number; selected_capital_used?: number; capital_basis?: string; max_capital_cap_applied?: boolean };
  account_state?: { totalMarginBalance?: number; totalWalletBalance?: number; availableBalance?: number; availableUsdt?: number; availableUsdc?: number; unrealizedPnl?: number; openPositions?: number; marginRatio?: number | null; openOrderCount?: number; positions?: Array<{ symbol: string; positionAmt: number; unrealizedPnl: number; notional: number }> };
  governor?: { state?: string; reason?: string; risk_multiplier?: number; adjusted_max_leverage?: number; adjusted_max_open_positions?: number; daily_pnl_pct?: number | null; unrealized_pnl?: number | null; current_equity?: number | null };
  current_open_risk_pct?: number;
  max_total_open_risk_pct?: number;
  remaining_risk_capacity_pct?: number;
  error?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  reason?: string;
  execution_id?: string;
  status?: string;
  plan?: Record<string, unknown>;
  rules?: Record<string, unknown>;
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
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);

  const executions = useMemo(() => status?.executions ?? [], [status?.executions]);
  const openExecutions = useMemo(() => executions.filter(e => ['pending', 'entry_submitted', 'entry_filled', 'protected', 'protected_native', 'protected_managed', 'pending_protection', 'pending_managed_protection', 'sl_submitted', 'tp_submitted', 'partially_closed'].includes(e.status)), [executions]);
  const failedExecutions = executions.filter(e => e.status === 'failed');
  const skippedExecutions = executions.filter(e => e.status === 'skipped');

  async function updateExecutionSettings(settingsPatch: Record<string, unknown>) {
    return callExecution('update_settings', { settings: settingsPatch });
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
    const [statusRes, signalsRes, monitorRes] = await Promise.all([
      fetch(`${getFrontendSupabaseUrl()}/functions/v1/binance-testnet-execution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      }).then(r => r.json()).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : 'Status failed' })),
      supabase.from('signals').select('*').eq('market_type', 'crypto').order('created_at', { ascending: false }).limit(25),
      supabase.from('execution_settings').select('latest_monitor_run_at,latest_monitor_status,latest_monitor_result,open_binance_positions,open_binance_orders,pnl_snapshot,stale_rows_cleaned,open_positions_count,unrealized_pnl,account_total_margin_balance,account_total_wallet_balance,latest_sync_time,latest_account_state_at,last_managed_exit_action').eq('id', 1).maybeSingle(),
    ]);
    const statusPayload = statusRes as StatusPayload;
    setStatus(statusPayload);
    const recentSignals = (signalsRes.data ?? []) as Signal[];
    setSignals(recentSignals);
    setSelectedSignalId(current => current || recentSignals[0]?.id || '');
    setMonitorState((monitorRes.data ?? null) as ExecutionSettingsSnapshot | null);
    setLoading(false);
  }, [session]);


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

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Binance USD-M Testnet Execution</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Testnet-only connector for qualified HashiBot crypto signals. BINANCE TESTNET — NOT LIVE.</p>
      </div>

      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-sm text-yellow-300/90">
          <strong>Testnet only.</strong> Live trading is blocked by env and database guards. API keys stay server-side in Supabase Edge Function secrets and are never shown here.
        </div>
      </div>


      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-sm">Binance Testnet Monitor</h2>
            <p className="text-xs text-zinc-500 mt-0.5">1-minute bot supervisor snapshot. Binance Demo only — live trading remains disabled.</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            {monitorState?.latest_monitor_status ?? 'not configured'}
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
        <div className="mt-3 text-xs text-zinc-500 font-mono truncate" title={JSON.stringify(monitorState?.latest_monitor_result ?? {})}>
          Latest sync result: {JSON.stringify(monitorState?.latest_monitor_result ?? {})}
        </div>
        <div className="mt-2 text-xs text-zinc-500 font-mono truncate" title={JSON.stringify(monitorState?.open_binance_positions ?? [])}>
          Open Binance positions: {JSON.stringify(monitorState?.open_binance_positions ?? [])}
        </div>
        <div className="mt-2 text-xs text-zinc-500 font-mono truncate" title={JSON.stringify(monitorState?.open_binance_orders ?? [])}>
          Open Binance orders: {JSON.stringify(monitorState?.open_binance_orders ?? [])}
        </div>
        <div className="mt-2 text-xs text-zinc-500 font-mono truncate" title={JSON.stringify(monitorState?.last_managed_exit_action ?? {})}>
          Last managed TP/SL action: {JSON.stringify(monitorState?.last_managed_exit_action ?? {})}
        </div>
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





      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-sm">Risk Governor / PnL Brain</h2>
          <div className="flex gap-2">
            <ActionButton disabled={acting} onClick={() => callExecution('refresh_account_state')} icon={<RefreshCw size={14} />} label="Refresh Binance Account State" />
            <ActionButton disabled={acting} onClick={() => callExecution('evaluate_governor')} icon={<Shield size={14} />} label="Re-evaluate Governor" />
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3 text-xs">
          <ProofRow label="Governor enabled" value={status?.settings?.governor_enabled ? 'true' : 'false'} />
          <ProofRow label="Governor state" value={status?.governor?.state ?? status?.settings?.governor_state ?? 'normal'} />
          <ProofRow label="Current equity" value={String(status?.governor?.current_equity ?? status?.settings?.current_equity ?? '—')} />
          <ProofRow label="Daily start equity" value={String(status?.settings?.daily_start_equity ?? '—')} />
          <ProofRow label="Daily PnL %" value={String(status?.governor?.daily_pnl_pct ?? status?.settings?.daily_pnl_pct ?? '—')} />
          <ProofRow label="Unrealized PnL" value={String(status?.governor?.unrealized_pnl ?? status?.settings?.daily_unrealized_pnl ?? '—')} />
          <ProofRow label="Open positions" value={String(status?.account_state?.openPositions ?? status?.settings?.account_open_positions ?? '—')} />
          <ProofRow label="Open orders" value={String(status?.account_state?.openOrderCount ?? status?.settings?.account_open_order_count ?? '—')} />
          <ProofRow label="Available balance" value={String(status?.account_state?.availableBalance ?? status?.settings?.account_available_balance ?? '—')} />
          <ProofRow label="Margin ratio" value={String(status?.account_state?.marginRatio ?? status?.settings?.account_margin_ratio ?? '—')} />
          <ProofRow label="Risk multiplier" value={String(status?.governor?.risk_multiplier ?? '—')} />
          <ProofRow label="Effective max lev" value={`${status?.governor?.adjusted_max_leverage ?? status?.settings?.testnet_max_leverage ?? 7}x`} />
          <ProofRow label="Effective risk %" value={status?.governor?.state === 'defensive' ? '0.5x configured' : status?.governor?.state === 'aggressive_allowed' ? 'A 0.75 / A+ 1.0 cap' : 'configured'} />
          <ProofRow label="Last checked" value={status?.settings?.last_governor_checked_at ? new Date(status.settings.last_governor_checked_at).toLocaleString() : '—'} />
        </div>
        <div className="mt-3 text-xs text-zinc-400">Governor reason: {status?.governor?.reason ?? status?.settings?.last_governor_reason ?? '—'}</div>
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
            <ProofRow label="Max total open risk" value={`${status?.settings?.max_total_open_risk_pct ?? 3}%`} />
            <ProofRow label="Current open risk" value={`${status?.current_open_risk_pct ?? 0}%`} />
            <ProofRow label="Remaining risk" value={`${status?.remaining_risk_capacity_pct ?? 0}%`} />
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
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm">Risk / Leverage</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <ProofRow label="Risk A" value={`${status?.settings?.testnet_risk_a ?? 0.5}%`} />
            <ProofRow label="Risk A+" value={`${status?.settings?.testnet_risk_a_plus ?? 0.75}%`} />
            <ProofRow label="Max risk" value={`${status?.settings?.max_testnet_risk_pct ?? 1}%`} />
            <ProofRow label="Lev A" value={`${status?.settings?.testnet_leverage_a ?? 3}x`} />
            <ProofRow label="Lev A+" value={`${status?.settings?.testnet_leverage_a_plus ?? 5}x`} />
            <ProofRow label="Max lev" value={`${status?.settings?.testnet_max_leverage ?? 7}x`} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 md:col-span-2">
          <h2 className="font-semibold mb-4 text-sm">Manual Test Actions</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <ActionButton disabled={acting} onClick={() => callExecution('test_connection')} icon={<Send size={14} />} label="Test Binance Connection" />
            <ActionButton disabled={acting} onClick={() => callExecution('validate_symbol', { symbol })} icon={<FlaskConical size={14} />} label="Validate Symbol" />
            <ActionButton disabled={acting || !selectedSignalId} onClick={() => callExecution('dry_run', { signal_id: selectedSignalId })} icon={<FlaskConical size={14} />} label="Dry-run Selected Signal" />
            <ActionButton disabled={acting || !selectedSignalId} onClick={() => callExecution('execute_signal', { signal_id: selectedSignalId, manual: true })} icon={<PlayCircle size={14} />} label="Execute Selected Signal" danger />
            <ActionButton disabled={acting || !selectedSignalId} onClick={() => callExecution('manual_test_flow', { signal_id: selectedSignalId })} icon={<Shield size={14} />} label="Run E2E Test Flow" danger />
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
                {signals.map(s => <option key={s.id} value={s.id}>{s.symbol} {s.direction.toUpperCase()} · {s.grade} · {new Date(s.created_at).toLocaleString()}</option>)}
              </select>
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
                <th className="text-left px-4 py-3">Symbol</th><th className="text-left px-4 py-3">Side</th><th className="text-left px-4 py-3">Lev</th><th className="text-left px-4 py-3">Qty</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Protection</th><th className="text-left px-4 py-3">Orders</th><th className="text-left px-4 py-3">Market / Timer</th><th className="text-left px-4 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {executions.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-500">No Binance testnet executions yet.</td></tr> : executions.map(e => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{e.symbol}</td>
                  <td className="px-4 py-3"><span className={e.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{e.side}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{e.leverage ? `${e.leverage}x` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{e.quantity ?? e.volume}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[e.status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>{e.status}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-500"><div>{e.bracket_mode || '—'}</div><div className={e.protection_status === 'unprotected_failed' ? 'text-red-300' : e.protection_status === 'protected' || e.protection_status === 'protected_managed' ? 'text-emerald-300' : 'text-zinc-500'}>{e.protection_status || '—'}</div><div>TP1 filled: {e.tp1_filled || e.tp1_closed_at ? 'yes' : 'no'}</div><div>SL BE: {e.sl_moved_to_be ? 'yes' : 'no'} {e.be_stop_level ?? ''}</div><div>Remaining: {e.remaining_quantity ?? '—'}</div>{e.latest_protection_error && <div className="text-red-300">{e.latest_protection_error}</div>}{e.latest_auto_skip_reason && <div className="text-yellow-300">{e.latest_auto_skip_reason}</div>}{e.last_exchange_error && <div className="text-red-300">{e.last_exchange_error}</div>}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 font-mono">E:{e.entry_order_id || '—'} SL:{e.sl_order_id || '—'} TP:{e.tp1_order_id || '—'}/{e.tp2_order_id || '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500"><div>Mark: {e.latest_mark_price ?? '—'}</div><div>uPnL: {e.latest_unrealized_pnl ?? '—'}</div><div>Deadline: {e.time_stop_deadline_at ? new Date(e.time_stop_deadline_at).toLocaleString() : '—'}</div><div>Last: {e.last_monitor_action || '—'}</div></td>
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
