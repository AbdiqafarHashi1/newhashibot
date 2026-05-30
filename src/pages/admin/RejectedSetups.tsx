import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyCandidate } from '../../lib/types';
import { directionBadge, Badge } from '../../components/ui/Badge';

export default function RejectedSetups() {
  const [items, setItems] = useState<StrategyCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketFilter, setMarketFilter] = useState('all');

  useEffect(() => {
    let query = supabase.from('strategy_candidates').select('*').eq('status', 'rejected')
      .order('created_at', { ascending: false }).limit(100);
    if (marketFilter !== 'all') query = query.eq('market_type', marketFilter);
    query.then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [marketFilter]);

  const reasonColors: Record<string, 'red' | 'yellow' | 'orange' | 'gray'> = {
    low_score: 'red',
    bad_regime: 'yellow',
    duplicate_signal: 'orange',
    insufficient_candles: 'gray',
    risk_reward_too_low: 'red',
    volatility_too_low: 'yellow',
    volatility_too_high: 'orange',
    unclear_trend: 'gray',
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Rejected Setups</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{items.length} rejected candidates</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {['all', 'crypto', 'forex'].map(f => (
          <button key={f} onClick={() => setMarketFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${marketFilter === f ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f === 'all' ? 'All Markets' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No rejected setups. Run the scanner to see arbitration decisions.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-left px-4 py-3">Market</th>
                <th className="text-left px-4 py-3">TF</th>
                <th className="text-left px-4 py-3">Strategy</th>
                <th className="text-left px-4 py-3">Dir</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">R/R</th>
                <th className="text-left px-4 py-3">Rejection Reason</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Regime</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-300">{c.symbol}</td>
                  <td className="px-4 py-3 text-zinc-500 uppercase">{c.market_type}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.timeframe}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.strategy_name}</td>
                  <td className="px-4 py-3">{directionBadge(c.direction)}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.confidence_score}%</td>
                  <td className="px-4 py-3 text-zinc-400">{c.risk_reward}R</td>
                  <td className="px-4 py-3">
                    <Badge variant={reasonColors[c.rejection_reason] ?? 'gray'}>
                      {c.rejection_reason.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">{c.regime}</td>
                  <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
