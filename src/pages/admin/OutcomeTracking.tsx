import { useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle, Play, CheckCircle } from 'lucide-react';

interface EvalResult {
  signal_id: string;
  symbol: string;
  direction: string;
  current_price: number | null;
  stop_loss: number;
  tp1: number;
  tp2: number;
  would_be_status: string;
  note: string;
}

export default function OutcomeTracking() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function runPreview() {
    if (!session) return;
    setLoading(true);
    setResults(null);
    setMsg('');
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-signal-outcomes`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setMsg(data.message);
        setResults(data.results ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  const statusColor: Record<string, string> = {
    sl_hit: 'text-red-400',
    tp1_hit: 'text-cyan-400',
    tp2_hit: 'text-emerald-400',
    active: 'text-blue-400',
    waiting: 'text-yellow-400',
    price_unavailable: 'text-zinc-500',
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Signal Outcome Tracking</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Preview what outcomes would be if live tracking were active</p>
      </div>

      <div className="max-w-3xl space-y-4">
        {/* Not active warning */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={16} className="text-orange-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-orange-400 mb-1">Outcome tracking is not active</div>
            <div className="text-xs text-orange-300/80 leading-relaxed">
              Signals are <strong>not automatically updated</strong> based on live price.
              Signal statuses (waiting, active, tp1_hit, tp2_hit, sl_hit) must be updated manually
              from the Signals Manager, or you can run the preview below to see what the outcomes
              would be based on current Binance prices for crypto.
            </div>
          </div>
        </div>

        {/* What is planned */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-3">Phase 3 plan: automatic outcome tracking</div>
          <ul className="text-xs text-zinc-500 space-y-1.5 leading-relaxed">
            <li>• <span className="text-zinc-400">Crypto:</span> Binance REST price feed (free, no key required)</li>
            <li>• <span className="text-zinc-400">Forex:</span> Requires a real forex data provider (Alpha Vantage, Twelve Data, or OANDA)</li>
            <li>• Scheduled via pg_cron every 1–5 minutes, same as the scanner</li>
            <li>• Writes signal_updates records for every status change</li>
            <li>• Triggers Telegram update messages when TP1, TP2, or SL is hit</li>
          </ul>
          <div className="mt-3 text-xs text-zinc-600">
            To activate: implement the <code className="bg-zinc-800 px-1 rounded">evaluate-signal-outcomes</code> Edge
            Function (currently a preview stub) and schedule it via pg_cron.
          </div>
        </div>

        {/* Preview button */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-1">Preview Outcome Check (read-only)</div>
          <p className="text-xs text-zinc-500 mb-4">
            Fetches current Binance prices for active crypto signals and shows what status
            each signal <em>would</em> have. Does not write any changes.
          </p>
          <button onClick={runPreview} disabled={loading}
            className="inline-flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 text-blue-400 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {loading
              ? <><div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> Running...</>
              : <><Play size={14} /> Run Preview</>}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {msg && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-2">
            <AlertTriangle size={14} className="text-orange-400 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-400">{msg}</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">
              Preview Results — no changes written
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-2.5">Symbol</th>
                  <th className="text-left px-4 py-2.5">Dir</th>
                  <th className="text-left px-4 py-2.5">Current Price</th>
                  <th className="text-left px-4 py-2.5">Would Be</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.signal_id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-2.5 font-mono font-semibold text-zinc-200">{r.symbol}</td>
                    <td className="px-4 py-2.5 text-zinc-400 uppercase">{r.direction}</td>
                    <td className="px-4 py-2.5 font-mono text-zinc-300">
                      {r.current_price !== null ? r.current_price.toFixed(4) : <span className="text-zinc-600">N/A</span>}
                    </td>
                    <td className={`px-4 py-2.5 font-medium ${statusColor[r.would_be_status] ?? 'text-zinc-400'}`}>
                      {r.would_be_status.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 hidden md:table-cell max-w-xs truncate">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <CheckCircle size={24} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No active signals to evaluate. Run the scanner to create signals first.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
