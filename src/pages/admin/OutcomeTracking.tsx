import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { Play, RefreshCw, CheckCircle, AlertTriangle, Activity, XCircle } from 'lucide-react';
import { callEdgeFunction, EdgeFunctionReachability } from '../../lib/edgeFunctionStatus';

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

interface TelegramDelivery {
  id: string;
  signal_id: string | null;
  delivery_type: string;
  status: 'sent' | 'failed' | 'skipped' | 'pending';
  error_message: string | null;
  created_at: string;
}

interface OutcomeRunResult {
  success?: boolean;
  market_mode?: string;
  signals_checked?: number;
  signals_updated?: number;
  scanned?: number;
  changed?: number;
  expired?: number;
  price_unavailable?: number;
  forex_skipped?: boolean;
  forex_skipped_count?: number;
  telegram_sent?: number;
  telegram_skipped?: number;
  telegram_failed?: number;
  telegram_skip_reasons?: string[];
  updates?: Array<{ signal_id: string; symbol: string; from: string; to: string; price: number | null; telegram_status?: string; telegram_reason?: string }>;
}

export default function OutcomeTracking() {
  const { session } = useAuth();
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<OutcomeRunResult | null>(null);
  const [rawRunResponse, setRawRunResponse] = useState<unknown>(null);
  const [outcomeFunctionStatus, setOutcomeFunctionStatus] = useState<EdgeFunctionReachability>('unknown');
  const [runError, setRunError] = useState('');
  const [loadWarning, setLoadWarning] = useState('');
  const [activeSignals, setActiveSignals] = useState<SignalRow[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<(SignalUpdate & { signals?: { symbol: string; direction: string } })[]>([]);
  const [deliveries, setDeliveries] = useState<TelegramDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadWarning('');
    try {
      const [sigsRes, updatesRes, deliveryRes] = await Promise.all([
        supabase.from('signals').select('*').eq('market_type', 'crypto').eq('data_source', 'REAL DATA').in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']).order('created_at', { ascending: false }).limit(50),
        supabase.from('signal_updates').select('*, signals(symbol, direction)').order('created_at', { ascending: false }).limit(30),
        supabase.from('telegram_deliveries').select('*').like('delivery_type', 'outcome_%').order('created_at', { ascending: false }).limit(100),
      ]);
      if (sigsRes.error || updatesRes.error || deliveryRes.error) {
        setLoadWarning(sigsRes.error?.message ?? updatesRes.error?.message ?? deliveryRes.error?.message ?? 'Outcome data load warning');
      }
      setActiveSignals((sigsRes.data ?? []) as SignalRow[]);
      setRecentUpdates((updatesRes.data ?? []) as (SignalUpdate & { signals?: { symbol: string; direction: string } })[]);
      setDeliveries((deliveryRes.data ?? []) as TelegramDelivery[]);
      try {
        const probe = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-signal-outcomes`, { method: 'OPTIONS' });
        setOutcomeFunctionStatus(probe.status === 404 ? 'missing' : probe.ok ? 'deployed' : 'unknown');
      } catch {
        setOutcomeFunctionStatus('unreachable');
      }
    } catch (e) {
      setLoadWarning(e instanceof Error ? e.message : 'Outcome data load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runOutcomeCheck() {
    if (!session) return;
    setRunning(true);
    setRunResult(null);
    setRunError('');
    try {
      const result = await callEdgeFunction<OutcomeRunResult & { error?: string }>('evaluate-signal-outcomes', {}, session.access_token);
      setOutcomeFunctionStatus(result.reachability);
      setRawRunResponse(result.data ?? result.text);
      const data = result.data;
      if (result.reachability === 'missing') {
        setRunError('Outcome function missing/deployment needed. Deploy supabase/functions/evaluate-signal-outcomes/index.ts.');
      } else if (!result.ok || data?.success === false || data?.error) {
        setRunError(data?.error ?? `Outcome check failed with HTTP ${result.status}`);
      } else {
        setRunResult(data);
        await load();
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  const fromStatus = (u: SignalUpdate) => u.previous_status ?? u.old_status ?? '?';

  const statusColor: Record<string, string> = {
    sl_hit: 'text-red-400',
    tp1_hit: 'text-cyan-400',
    tp2_hit: 'text-emerald-400',
    active: 'text-blue-400',
    waiting: 'text-yellow-400',
    approved: 'text-emerald-300',
    new: 'text-zinc-300',
    expired: 'text-zinc-500',
  };

  function outcomeDelivery(signalId: string, status: string) {
    const type = `outcome_${status}`;
    return deliveries.find(d => d.signal_id === signalId && d.delivery_type === type) ?? deliveries.find(d => d.signal_id === signalId && d.delivery_type.startsWith('outcome_'));
  }

  const checked = runResult?.signals_checked ?? runResult?.scanned ?? 0;
  const changed = runResult?.signals_updated ?? runResult?.changed ?? 0;

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Signal Outcome Tracking</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Crypto-only TP/SL/expiry evaluation against Binance latest price</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-200 flex flex-wrap gap-3">
        <span><strong>Market mode:</strong> Crypto-only</span>
        <span><strong>Price source:</strong> Binance latest ticker</span>
        <span><strong>Forex:</strong> Disabled for MVP — future MT5/OANDA phase</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Outcome function</div>
          <div className={outcomeFunctionStatus === 'deployed' ? 'text-sm font-semibold text-emerald-400' : outcomeFunctionStatus === 'missing' ? 'text-sm font-semibold text-red-400' : 'text-sm font-semibold text-yellow-400'}>
            {outcomeFunctionStatus === 'deployed' ? 'deployed/verified' : outcomeFunctionStatus === 'missing' ? 'missing/deployment needed' : outcomeFunctionStatus}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Open crypto signals</div>
          <div className="text-sm font-semibold text-zinc-200">{activeSignals.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Latest outcome TG</div>
          <div className="text-sm font-semibold text-zinc-200">{deliveries[0] ? `${deliveries[0].status} (${new Date(deliveries[0].created_at).toLocaleString()})` : 'not verified'}</div>
        </div>
      </div>

      {outcomeFunctionStatus === 'missing' && (
        <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>Outcome function missing/deployment needed. Deploy supabase/functions/evaluate-signal-outcomes/index.ts.</span>
        </div>
      )}

      {loadWarning && (
        <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          {loadWarning}
        </div>
      )}

      {runResult && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-300">Outcome check complete</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs">
            <div><span className="text-zinc-500">Checked:</span> <span className="text-zinc-200 font-medium">{checked}</span></div>
            <div><span className="text-zinc-500">Updated:</span> <span className="text-emerald-400 font-medium">{changed}</span></div>
            <div><span className="text-zinc-500">Expired:</span> <span className="text-yellow-400 font-medium">{runResult.expired ?? 0}</span></div>
            <div><span className="text-zinc-500">No price:</span> <span className="text-zinc-400 font-medium">{runResult.price_unavailable ?? 0}</span></div>
            <div><span className="text-zinc-500">TG sent:</span> <span className="text-blue-400 font-medium">{runResult.telegram_sent ?? 0}</span></div>
            <div><span className="text-zinc-500">TG skipped/failed:</span> <span className="text-zinc-300 font-medium">{runResult.telegram_skipped ?? 0}/{runResult.telegram_failed ?? 0}</span></div>
          </div>
          {runResult.forex_skipped && <div className="mt-2 text-xs text-zinc-500">Forex skipped neutrally for MVP ({runResult.forex_skipped_count ?? 0} rows).</div>}
          {(runResult.telegram_skip_reasons?.length ?? 0) > 0 && <div className="mt-2 text-xs text-yellow-400">TG skip reasons: {runResult.telegram_skip_reasons?.join(', ')}</div>}
          {rawRunResponse !== null && <pre className="mt-3 whitespace-pre-wrap break-words text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-72 overflow-auto">{String(JSON.stringify(rawRunResponse, null, 2) ?? rawRunResponse)}</pre>}
          {(runResult.updates?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1">
              {runResult.updates?.map((u, i) => (
                <div key={i} className="text-xs flex gap-2 flex-wrap">
                  <span className="font-mono text-zinc-300">{u.symbol}</span>
                  <span className="text-zinc-600">{u.from}</span>
                  <span className="text-zinc-500">→</span>
                  <span className={statusColor[u.to] ?? 'text-zinc-300'}>{u.to.replace(/_/g, ' ').toUpperCase()}</span>
                  {u.price !== null && <span className="text-zinc-600">@ {u.price.toFixed(5)}</span>}
                  {u.telegram_status && <span className="text-blue-400">TG {u.telegram_status}{u.telegram_reason ? ` (${u.telegram_reason})` : ''}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {runError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="break-words">{runError}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-zinc-500" />Crypto Signals Being Monitored</div>
            <span className="text-xs text-zinc-500">{activeSignals.length} signals</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : activeSignals.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-600">No open crypto REAL DATA signals. Run the scanner first.</div>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-[500px] overflow-y-auto">
              {activeSignals.map(sig => {
                const ageMins = Math.round((Date.now() - new Date(sig.created_at).getTime()) / 60000);
                return (
                  <div key={sig.id} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-sm text-zinc-100">{sig.symbol}</span>
                      <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                      {directionBadge(sig.direction)}
                      {gradeBadge(sig.grade)}
                      {statusBadge(sig.status)}
                      <Badge variant="blue">CRYPTO</Badge>
                      <Badge variant="green">REAL DATA</Badge>
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

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><CheckCircle size={14} className="text-zinc-500" />Recent Outcome Updates</div>
            <span className="text-xs text-zinc-500">{recentUpdates.length} records</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : recentUpdates.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-600">No outcome updates yet. Run the check above.</div>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-[500px] overflow-y-auto">
              {recentUpdates.map(u => {
                const delivery = outcomeDelivery(u.signal_id, u.new_status);
                return (
                  <div key={u.id} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-mono font-bold text-sm text-zinc-100">{(u.signals as { symbol?: string } | undefined)?.symbol ?? u.signal_id.slice(0, 8)}</span>
                      <span className="text-xs text-zinc-600">{fromStatus(u)}</span>
                      <span className="text-zinc-700">→</span>
                      <span className={`text-xs font-medium ${statusColor[u.new_status] ?? 'text-zinc-300'}`}>{u.new_status.replace(/_/g, ' ').toUpperCase()}</span>
                      {delivery?.status === 'sent' && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">Outcome TG sent</span>}
                      {delivery?.status === 'skipped' && <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">Outcome TG skipped</span>}
                      {delivery?.status === 'failed' && <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">Outcome TG failed</span>}
                    </div>
                    <div className="text-xs text-zinc-600 flex gap-3 flex-wrap">
                      {u.price !== null && <span>Price: <span className="font-mono text-zinc-400">{Number(u.price).toFixed(5)}</span></span>}
                      <span>{u.reason ?? ''}</span>
                      <span>{new Date(u.created_at).toLocaleString()}</span>
                      {delivery?.error_message && <span className="text-yellow-400 flex items-center gap-1"><XCircle size={10} /> {delivery.error_message}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed">
        <div className="font-medium text-zinc-300 mb-2">How outcome tracking works</div>
        <div className="space-y-1">
          <div><span className="text-zinc-400">Crypto:</span> Fetches the latest price from Binance REST API (free, no key required).</div>
          <div><span className="text-zinc-400">Forex:</span> Disabled for MVP — no Finnhub, TwelveData, OANDA, MT5, or demo forex calls are made.</div>
          <div><span className="text-zinc-400">Buy signals:</span> SL hit if price ≤ stop loss · TP1 if price ≥ TP1 · TP2 if price ≥ TP2.</div>
          <div><span className="text-zinc-400">Sell signals:</span> SL hit if price ≥ stop loss · TP1 if price ≤ TP1 · TP2 if price ≤ TP2.</div>
          <div><span className="text-zinc-400">Expiry:</span> Uses an explicit expiry field when present, otherwise preserves the existing 6-hour max-age behavior.</div>
          <div><span className="text-zinc-400">Idempotent:</span> Same status transition and same outcome Telegram event are not sent twice.</div>
          <div><span className="text-zinc-400">Limitation:</span> Latest ticker price is used; intrabar TP/SL order is not inferred from candles.</div>
        </div>
      </div>
    </AdminLayout>
  );
}
