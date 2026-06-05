import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { BinanceExecutionOrder, ExecutionSettings, Signal } from '../../lib/types';
import { Shield, AlertTriangle, Cpu, Activity, Send, RefreshCw, XCircle, PlayCircle, FlaskConical } from 'lucide-react';
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
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  skipped: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  cancelled: 'text-zinc-400 bg-zinc-800 border-zinc-700',
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
}

export default function Execution() {
  const { session } = useAuth();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const executions = useMemo(() => status?.executions ?? [], [status?.executions]);
  const openExecutions = useMemo(() => executions.filter(e => ['pending', 'entry_submitted', 'entry_filled', 'sl_submitted', 'tp_submitted', 'partially_closed'].includes(e.status)), [executions]);
  const failedExecutions = executions.filter(e => e.status === 'failed');
  const skippedExecutions = executions.filter(e => e.status === 'skipped');

  async function callExecution(action: string, payload: Record<string, unknown> = {}) {
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
    const [statusRes, signalsRes] = await Promise.all([
      fetch(`${getFrontendSupabaseUrl()}/functions/v1/binance-testnet-execution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      }).then(r => r.json()).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : 'Status failed' })),
      supabase.from('signals').select('*').eq('market_type', 'crypto').order('created_at', { ascending: false }).limit(25),
    ]);
    const statusPayload = statusRes as StatusPayload;
    setStatus(statusPayload);
    const recentSignals = (signalsRes.data ?? []) as Signal[];
    setSignals(recentSignals);
    setSelectedSignalId(current => current || recentSignals[0]?.id || '');
    setLoading(false);
  }, [session]);

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

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <StatusCard icon={<Cpu size={14} />} label="Execution Mode" value={status?.env?.execution_mode ?? 'signal_only'} note="Default remains signal_only" />
        <StatusCard icon={<Shield size={14} />} label="Testnet Enabled" value={status?.env?.testnet_enabled ? 'YES' : 'NO'} valueClass={status?.env?.testnet_enabled ? 'text-emerald-400' : 'text-zinc-500'} note="Requires TESTNET_ENABLED=true" />
        <StatusCard icon={<XCircle size={14} />} label="Kill Switch" value={status?.settings?.kill_switch_enabled ? 'ON' : 'OFF'} valueClass={status?.settings?.kill_switch_enabled ? 'text-red-400' : 'text-emerald-400'} note="DB admin safety switch" />
        <StatusCard icon={<Activity size={14} />} label="Open / Max" value={`${openExecutions.length} / ${status?.settings?.max_open_testnet_positions ?? 3}`} note="One active per symbol by default" />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 md:col-span-2">
          <h2 className="font-semibold mb-4 text-sm">Manual Test Actions</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <ActionButton disabled={acting} onClick={() => callExecution('test_connection')} icon={<Send size={14} />} label="Test Binance Connection" />
            <ActionButton disabled={acting} onClick={() => callExecution('validate_symbol', { symbol })} icon={<FlaskConical size={14} />} label="Validate Symbol" />
            <ActionButton disabled={acting || !selectedSignalId} onClick={() => callExecution('dry_run', { signal_id: selectedSignalId })} icon={<FlaskConical size={14} />} label="Dry-run Selected Signal" />
            <ActionButton disabled={acting || !selectedSignalId} onClick={() => callExecution('execute_signal', { signal_id: selectedSignalId, manual: true })} icon={<PlayCircle size={14} />} label="Execute Selected Signal" danger />
            <ActionButton disabled={acting} onClick={() => callExecution('positions')} icon={<RefreshCw size={14} />} label="Fetch Open Positions" />
            <ActionButton disabled={acting || !symbol} onClick={() => callExecution('cancel_orders', { symbol })} icon={<XCircle size={14} />} label="Cancel Symbol Orders" danger />
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
                <th className="text-left px-4 py-3">Symbol</th><th className="text-left px-4 py-3">Side</th><th className="text-left px-4 py-3">Lev</th><th className="text-left px-4 py-3">Qty</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Orders</th><th className="text-left px-4 py-3">Created</th><th className="text-left px-4 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {executions.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No Binance testnet executions yet.</td></tr> : executions.map(e => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{e.symbol}</td>
                  <td className="px-4 py-3"><span className={e.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{e.side}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{e.leverage ? `${e.leverage}x` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{e.quantity ?? e.volume}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[e.status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>{e.status}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-500 font-mono">E:{e.entry_order_id || '—'} SL:{e.sl_order_id || '—'} TP:{e.tp1_order_id || '—'}/{e.tp2_order_id || '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{new Date(e.created_at).toLocaleString()}</td>
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
