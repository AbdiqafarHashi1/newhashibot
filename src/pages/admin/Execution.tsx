import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { ExecutionOrder, PaperExecutionIntent } from '../../lib/types';
import { Shield, AlertTriangle, Cpu, Activity, Send, FileText, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  sent_to_bridge: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  accepted: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  rejected: 'text-red-400 bg-red-500/10 border-red-500/20',
  filled: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
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
};

const PAPER_STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  filled: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  cancelled: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  expired: 'text-zinc-500 bg-zinc-800 border-zinc-700',
};

export default function Execution() {
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [paperIntents, setPaperIntents] = useState<PaperExecutionIntent[]>([]);
  const [paperStats, setPaperStats] = useState({ total: 0, blocked: 0, pending: 0 });
  const [monitorState, setMonitorState] = useState<ExecutionSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [tab, setTab] = useState<'paper' | 'orders'>('paper');

  async function load() {
    const [ordersRes, paperRes, blockedRes, monitorRes] = await Promise.all([
      supabase.from('execution_orders').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('paper_execution_intents').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('paper_execution_intents').select('id', { count: 'exact' }).eq('risk_check_passed', false),
      supabase.from('execution_settings').select('latest_monitor_run_at,latest_monitor_status,latest_monitor_result,open_binance_positions,open_binance_orders,pnl_snapshot,stale_rows_cleaned,open_positions_count,unrealized_pnl,account_total_margin_balance,account_total_wallet_balance,latest_sync_time').eq('id', 1).maybeSingle(),
    ]);
    setOrders((ordersRes.data ?? []) as ExecutionOrder[]);
    const pi = (paperRes.data ?? []) as PaperExecutionIntent[];
    setPaperIntents(pi);
    const pending = pi.filter(p => p.status === 'pending').length;
    setPaperStats({ total: pi.length, blocked: blockedRes.count ?? 0, pending });
    setMonitorState((monitorRes.data ?? null) as ExecutionSettingsSnapshot | null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function testBridgeConnection() {
    setTesting(true);
    setTestMsg('MT5 execution bridge is not yet enabled. Set MT5_EXECUTION_ENABLED=true and configure MT5_EXECUTION_BRIDGE_BASE_URL to activate.');
    setTesting(false);
  }

  async function cleanStaleTestnetExecutions() {
    setCleaning(true);
    setTestMsg('Checking Binance testnet truth before clearing stale execution blockers...');
    try {
      const { data, error } = await supabase.functions.invoke('admin-scheduler-action', {
        body: { action: 'clean_stale_testnet_executions' },
      });
      if (error) throw error;
      const cleaned = typeof data?.cleaned_count === 'number' ? data.cleaned_count : 0;
      const checked = typeof data?.symbols_checked === 'number' ? data.symbols_checked : 0;
      setTestMsg(`Clean stale testnet executions complete: ${cleaned} row(s) cleaned across ${checked} symbol(s).`);
      await load();
    } catch (err) {
      setTestMsg(`Clean stale testnet executions failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setCleaning(false);
    }
  }

  const executionMode = 'signal_only';
  const executionEnabled = false;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">MT5 Execution Bridge</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Paper execution intents + future MT5 bridge architecture</p>
      </div>

      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
        <div className="text-sm text-yellow-300/90">
          <strong>No real trades are placed by this app.</strong> Paper intents are simulated records of what would be traded in Personal/Prop modes. The MT5 bridge is a future integration.
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
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Last Run</div><div className="text-zinc-200 mt-1">{monitorState?.latest_monitor_run_at ? new Date(monitorState.latest_monitor_run_at).toLocaleString() : '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Open Positions</div><div className="text-zinc-200 mt-1">{monitorState?.open_positions_count ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Open Orders</div><div className="text-zinc-200 mt-1">{monitorState?.open_binance_orders?.length ?? 0}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Unrealized PnL</div><div className="text-zinc-200 mt-1">{monitorState?.unrealized_pnl ?? '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Wallet</div><div className="text-zinc-200 mt-1">{monitorState?.account_total_wallet_balance ?? '—'}</div></div>
          <div className="bg-zinc-950/60 rounded-lg p-3"><div className="text-zinc-500">Stale Cleaned</div><div className="text-zinc-200 mt-1">{monitorState?.stale_rows_cleaned ?? 0}</div></div>
        </div>
        <div className="mt-3 text-xs text-zinc-500 font-mono truncate" title={JSON.stringify(monitorState?.latest_monitor_result ?? {})}>
          Latest sync result: {JSON.stringify(monitorState?.latest_monitor_result ?? {})}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Execution Mode</span>
          </div>
          <div className="font-semibold text-sm font-mono">{executionMode}</div>
          <div className="text-xs text-zinc-600 mt-1">signal_only | paper | bridge_future</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Bridge Enabled</span>
          </div>
          <div className={`font-semibold text-sm ${executionEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {executionEnabled ? 'YES — Active' : 'NO — Disabled'}
          </div>
          <div className="text-xs text-zinc-600 mt-1">Set MT5_EXECUTION_ENABLED=true to activate</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Bridge URL</span>
          </div>
          <div className="font-semibold text-sm text-zinc-500">Not configured</div>
          <div className="text-xs text-zinc-600 mt-1">Set MT5_EXECUTION_BRIDGE_BASE_URL in secrets</div>
        </div>
      </div>

      {/* Paper intent stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-zinc-100 mb-0.5">{paperStats.total}</div>
          <div className="text-xs text-zinc-500">Total Paper Intents</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400 mb-0.5">{paperStats.pending}</div>
          <div className="text-xs text-zinc-500">Pending Fill</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400 mb-0.5">{paperStats.blocked}</div>
          <div className="text-xs text-zinc-500">Risk-Blocked</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={testBridgeConnection}
          disabled={testing}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm transition-colors">
          {testing
            ? <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            : <Activity size={13} />}
          Test MT5 Bridge
        </button>
        <button
          disabled
          title="Requires MT5_EXECUTION_ENABLED=true and bridge configured"
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-600 px-4 py-2 rounded-lg text-sm cursor-not-allowed">
          <Send size={13} /> Send Test Demo Order
          <span className="text-xs text-zinc-600 ml-1">(disabled)</span>
        </button>
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
      </div>

      {testMsg && (
        <div className="mb-6 bg-zinc-800/60 border border-zinc-700 text-zinc-300 px-4 py-3 rounded-lg text-sm">
          {testMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        <button
          onClick={() => setTab('paper')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'paper' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}>
          <div className="flex items-center gap-1.5">
            <FileText size={13} />
            Paper Intents ({paperStats.total})
          </div>
        </button>
        <button
          onClick={() => setTab('orders')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'orders' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}>
          <div className="flex items-center gap-1.5">
            <Cpu size={13} />
            MT5 Orders ({orders.length})
          </div>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'paper' ? (
        paperIntents.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500">
            No paper intents yet. Enable Personal Mode or Prop Mode in Mode Control, then run the scanner.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Symbol</th>
                  <th className="text-left px-4 py-3">Dir</th>
                  <th className="text-left px-4 py-3">Entry</th>
                  <th className="text-left px-4 py-3">Lots</th>
                  <th className="text-left px-4 py-3">Risk%</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Risk Check</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {paperIntents.map(p => (
                  <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-2.5">
                      <Badge variant={p.mode_slug === 'prop_mode' ? 'yellow' : 'cyan'} className="text-xs">{p.mode_slug}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-xs text-zinc-100">{p.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${p.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400 font-mono">{p.entry_price.toFixed(5)}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{p.position_size_lots.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{p.risk_pct}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${PAPER_STATUS_COLORS[p.status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.risk_check_passed
                        ? <span className="text-xs text-emerald-400">Passed</span>
                        : <span className="text-xs text-red-400" title={p.risk_block_reason ?? ''}>Blocked</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        orders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500">
            No MT5 orders yet. The bridge will be activated in a future phase.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Symbol</th>
                  <th className="text-left px-4 py-3">Direction</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Volume</th>
                  <th className="text-left px-4 py-3">MT5 Ticket</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-mono font-semibold text-xs">{o.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${o.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {o.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{o.execution_mode}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ORDER_STATUS_COLORS[o.status] ?? 'text-zinc-400 bg-zinc-800 border-zinc-700'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{o.volume}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{o.mt5_ticket || '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Bridge contract */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mt-6">
        <h2 className="font-semibold mb-3 text-sm">Future Bridge Contract</h2>
        <div className="space-y-3 text-xs font-mono text-zinc-400">
          <div>
            <div className="text-zinc-600 mb-1">Candle feed (GET):</div>
            <div className="bg-zinc-800/80 px-3 py-2 rounded text-zinc-300">{'${MT5_BRIDGE_BASE_URL}/candles?symbol=EURUSD&timeframe=15m&limit=300'}</div>
          </div>
          <div>
            <div className="text-zinc-600 mb-1">Execution endpoint (POST):</div>
            <div className="bg-zinc-800/80 px-3 py-2 rounded text-zinc-300">{'${MT5_EXECUTION_BRIDGE_BASE_URL}/orders'}</div>
          </div>
          <div className="text-zinc-600">Auth: <span className="text-zinc-400">x-bridge-secret header (server-side only)</span></div>
        </div>
      </div>
    </AdminLayout>
  );
}
