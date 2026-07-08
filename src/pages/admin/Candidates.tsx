import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyCandidate } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge } from '../../components/ui/Badge';

export default function Candidates() {
  const [candidates, setCandidates] = useState<StrategyCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');

  useEffect(() => {
    const query = supabase
      .from('strategy_candidates')
      .select('id,symbol,market_type,timeframe,strategy_name,direction,grade,confidence_score,risk_reward,status,regime,reason,rejection_reason,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (filter !== 'all') query.eq('status', filter);
    if (marketFilter !== 'all') query.eq('market_type', marketFilter);
    query.then(({ data }) => { setCandidates(data ?? []); setLoading(false); });
  }, [filter, marketFilter]);

  const filters = ['all', 'candidate', 'approved', 'converted_to_signal', 'rejected'];
  const marketFilters = ['all', 'crypto', 'forex'];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Candidate Setups</h1>
        <p className="text-sm text-zinc-500 mt-0.5">All strategy outputs before and after arbitration</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {marketFilters.map(f => (
          <button key={f} onClick={() => setMarketFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${marketFilter === f ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f === 'all' ? 'All Markets' : f.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f === 'all' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
                <th className="text-left px-4 py-3">Grade</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">R/R</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Regime</th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{c.symbol}</td>
                  <td className="px-4 py-3 text-zinc-500 uppercase">{c.market_type}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.timeframe}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.strategy_name}</td>
                  <td className="px-4 py-3">{directionBadge(c.direction)}</td>
                  <td className="px-4 py-3">{gradeBadge(c.grade)}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.confidence_score}%</td>
                  <td className="px-4 py-3 text-zinc-300">{c.risk_reward}R</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">{c.regime}</td>
                  <td className="px-4 py-3 text-zinc-500 hidden xl:table-cell max-w-xs truncate">{c.reason || c.rejection_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-zinc-600">No candidates found for this filter. Run the scanner first.</div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
