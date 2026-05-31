import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';

export default function SignalHistory() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const query = supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') {
      query.eq('status', filter);
    } else {
      query.not('status', 'in', '("waiting","active")');
    }

    query.then(({ data }) => {
      setSignals(data ?? []);
      setLoading(false);
    });
  }, [filter]);

  const statuses = ['all', 'tp1_hit', 'tp2_hit', 'sl_hit', 'expired', 'cancelled'];

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Signal History</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Completed and closed signals</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}>
            {s === 'all' ? 'All Closed' : s.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-sm text-zinc-500">No signals found for this filter.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-left px-4 py-3">TF</th>
                <th className="text-left px-4 py-3">Dir</th>
                <th className="text-left px-4 py-3">Grade</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Source</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">R/R</th>
                <th className="text-left px-4 py-3">Guidance</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Strategy</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(sig => {
                const isRealData = sig.data_source === 'REAL DATA';
                return (
                  <tr key={sig.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/app/signals/${sig.id}`} className="font-mono font-semibold hover:text-blue-400 transition-colors">{sig.symbol}</Link>
                        <Badge variant={isRealData ? 'green' : 'orange'} className="text-xs">{isRealData ? 'REAL' : 'UNVERIFIED'}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{sig.timeframe}</td>
                    <td className="px-4 py-3">{directionBadge(sig.direction)}</td>
                    <td className="px-4 py-3">{gradeBadge(sig.grade)}</td>
                    <td className="px-4 py-3">{statusBadge(sig.status)}</td>
                    <td className="px-4 py-3 text-zinc-500 capitalize hidden sm:table-cell">{sig.source}</td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{sig.risk_reward}R</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {sig.recommended_risk_pct != null && sig.suggested_leverage_min != null && sig.suggested_leverage_max != null ? (
                        <div>
                          <div>{Number(sig.recommended_risk_pct).toFixed(2)}% risk</div>
                          <div className="text-zinc-600">{Number(sig.suggested_leverage_min).toFixed(0)}x–{Number(sig.suggested_leverage_max).toFixed(0)}x · guidance only</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">{sig.strategy_name}</td>
                    <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">{new Date(sig.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
