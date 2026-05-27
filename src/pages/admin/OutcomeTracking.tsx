import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { gradeBadge, directionBadge, statusBadge } from '../../components/ui/Badge';
import { Play, RefreshCw, CheckCircle, AlertTriangle, Activity } from 'lucide-react';

interface SignalUpdate {
  id: string;
  signal_id: string;
  previous_status: string | null;
  old_status: string | null;
  new_status: string;
  price: number | null;
  reason: string | null;
  telegram_sent: boolean;
  created_at: string;
}

interface SignalRow {
  id: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  direction: string;
  grade: string;
  status: string;
  data_source: string | null;
  stop_loss: number;
  tp1: number;
  tp2: number;
  entry_low: number;
  entry_high: number;
  created_at: string;
}

export default function OutcomeTracking() {
  const { session } = useAuth();
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ scanned: number; changed: number; expired: number; price_unavailable: number; updates: Array<{ signal_id: string; symbol: string; from: string; to: string; price: number | null }> } | null>(null);
  const [runError, setRunError] = useState('');
  const [activeSignals, setActiveSignals] = useState<SignalRow[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<(SignalUpdate & { signals?: { symbol: string; direction: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [sigsRes, updatesRes] = await Promise.all([
      supabase.from('signals').select('*').in('status', ['waiting', 'active', 'tp1_hit']).order('created_at', { ascending: false }).limit(50),
      supabase.from('signal_updates').select('*, signals(symbol, direction)').order('created_at', { ascending: false }).limit(30),
    ]);
    setActiveSignals((sigsRes.data ?? []) as SignalRow[]);
    setRecentUpdates((updatesRes.data ?? []) as (SignalUpdate & { signals?: { symbol: string; direction: string } })[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runOutcomeCheck() {
    if (!session) return;
    setRunning(true);
    setRunResult(null);
    setRunError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-signal-outcomes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.error) {
        setRunError(data.error);
      } else {
        setRunResult(data);
        await load();
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Network error');
    }
    setRunning(false);
  }

  const fromStatus = (u: SignalUpdate) => u.previous_status ?? u.old_status ?? '?';

  const statusColor: Record<string, string> = {
    sl_hit: 'text-red-400',
    tp1_hit: 'text-cyan-400',
    tp2_hit: 'text-emerald-400',
    active: 'text-blue-400',
    waiting: 'text-yellow-400',
    expired: 'text-zinc-500',
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Signal Outcome Tracking</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Evaluate open signals against live prices and update statuses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={runOutcomeCheck} disabled={running}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {running
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running...</>
              : <><Play size={14} /> Run Outcome Check</>}
          </button>
        </div>
      </div>

      {/* Run result */}
      {runResult && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-300">Outcome check complete</span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div><span className="text-zinc-500">Scanned:</span> <span className="text-zinc-200 font-medium">{runResult.scanned}</span></div>
            <div><span className="text-zinc-500">Changed:</span> <span className="text-emerald-400 font-medium">{runResult.changed}</span></div>
            <div><span className="text-zinc-500">Expired:</span> <span className="text-yellow-400 font-medium">{runResult.expired}</span></div>
            <div><span className="text-zinc-500">No price:</span> <span className="text-zinc-400 font-medium">{runResult.price_unavailable}</span></div>
          </div>
          {runResult.updates.length > 0 && (
            <div className="mt-3 space-y-1">
              {runResult.updates.map((u, i) => (
                <div key={i} className="text-xs flex gap-2">
                  <span className="font-mono text-zinc-300">{u.symbol}</span>
                  <span className="text-zinc-600">{u.from}</span>
                  <span className="text-zinc-500">→</span>
                  <span className={statusColor[u.to] ?? 'text-zinc-300'}>{u.to.replace(/_/g, ' ').toUpperCase()}</span>
                  {u.price !== null && <span className="text-zinc-600">@ {u.price.toFixed(5)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {runError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          {runError}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active signals */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Activity size={14} className="text-zinc-500" />
              Open Signals
            </div>
            <span className="text-xs text-zinc-500">{activeSignals.length} signals</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeSignals.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-600">No open signals. Run the scanner first.</div>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-[500px] overflow-y-auto">
              {activeSignals.map(sig => {
                const isDemo = (sig.data_source ?? '').toUpperCase() !== 'REAL DATA';
                const ageMins = Math.round((Date.now() - new Date(sig.created_at).getTime()) / 60000);
                return (
                  <div key={sig.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-sm text-zinc-100">{sig.symbol}</span>
                      <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                      {directionBadge(sig.direction)}
                      {gradeBadge(sig.grade)}
                      {statusBadge(sig.status)}
                      {isDemo && (
                        <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded">DEMO</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 flex gap-3 flex-wrap">
                      <span>SL: <span className="font-mono text-red-400">{Number(sig.stop_loss).toFixed(5)}</span></span>
                      <span>TP1: <span className="font-mono text-blue-400">{Number(sig.tp1).toFixed(5)}</span></span>
                      <span>TP2: <span className="font-mono text-emerald-400">{Number(sig.tp2).toFixed(5)}</span></span>
                      <span className="text-zinc-600">{ageMins}m old</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent updates */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle size={14} className="text-zinc-500" />
              Recent Outcome Updates
            </div>
            <span className="text-xs text-zinc-500">{recentUpdates.length} records</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recentUpdates.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-600">No outcome updates yet. Run the check above.</div>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-[500px] overflow-y-auto">
              {recentUpdates.map(u => (
                <div key={u.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono font-bold text-sm text-zinc-100">
                      {(u.signals as { symbol?: string } | undefined)?.symbol ?? u.signal_id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-zinc-600">{fromStatus(u)}</span>
                    <span className="text-zinc-700">→</span>
                    <span className={`text-xs font-medium ${statusColor[u.new_status] ?? 'text-zinc-300'}`}>
                      {u.new_status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    {u.telegram_sent && (
                      <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">TG sent</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-600 flex gap-3 flex-wrap">
                    {u.price !== null && <span>Price: <span className="font-mono text-zinc-400">{Number(u.price).toFixed(5)}</span></span>}
                    <span>{u.reason ?? ''}</span>
                    <span>{new Date(u.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed">
        <div className="font-medium text-zinc-300 mb-2">How outcome tracking works</div>
        <div className="space-y-1">
          <div><span className="text-zinc-400">Crypto:</span> Fetches live price from Binance REST API (free, no key required).</div>
          <div><span className="text-zinc-400">Forex:</span> Uses FOREX_DATA_PROVIDER — Finnhub (live) or TwelveData. Demo provider returns no price.</div>
          <div><span className="text-zinc-400">Buy signals:</span> SL hit if price ≤ stop loss · TP1 if price ≥ TP1 · TP2 if price ≥ TP2.</div>
          <div><span className="text-zinc-400">Sell signals:</span> SL hit if price ≥ stop loss · TP1 if price ≤ TP1 · TP2 if price ≤ TP2.</div>
          <div><span className="text-zinc-400">Expiry:</span> Signals older than 6 hours with no TP/SL hit are marked expired.</div>
          <div><span className="text-zinc-400">Idempotent:</span> Same status transition is never written twice.</div>
          <div><span className="text-zinc-400">Telegram:</span> TP1, TP2, SL, and expired events auto-send outcome messages if bot is configured.</div>
          <div><span className="text-zinc-400">Automate:</span> Schedule <code className="bg-zinc-800 px-1 rounded">evaluate-signal-outcomes</code> via pg_cron every 1–5 minutes for continuous tracking.</div>
        </div>
      </div>
    </AdminLayout>
  );
}
