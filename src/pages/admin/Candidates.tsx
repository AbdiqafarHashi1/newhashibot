import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getStrategyCandidatesCompact } from '../../lib/hashibotBackend';
import { gradeBadge, directionBadge, statusBadge } from '../../components/ui/Badge';

export default function Candidates() {
  const [candidates, setCandidates] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await getStrategyCandidatesCompact(100, 0);
        let filtered = data;
        if (filter !== 'all') filtered = filtered.filter(c => c.status === filter);
        if (marketFilter !== 'all') filtered = filtered.filter(c => c.market_type === marketFilter);
        setCandidates(filtered);
      } catch {
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    }
    load();
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
      ) : candidates.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No candidates found for this filter. Run the scanner first.
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
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={String(c.id)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{String(c.symbol ?? '')}</td>
                  <td className="px-4 py-3 text-zinc-500 uppercase">{String(c.market_type ?? '')}</td>
                  <td className="px-4 py-3 text-zinc-500">{String(c.timeframe ?? '')}</td>
                  <td className="px-4 py-3 text-zinc-400">{String(c.strategy_name ?? '')}</td>
                  <td className="px-4 py-3">{directionBadge(String(c.direction ?? ''))}</td>
                  <td className="px-4 py-3">{gradeBadge(String(c.grade ?? ''))}</td>
                  <td className="px-4 py-3 text-zinc-300">{Number(c.confidence_score ?? 0)}%</td>
                  <td className="px-4 py-3">{statusBadge(String(c.status ?? ''))}</td>
                  <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell max-w-xs truncate">{String(c.rejection_reason ?? c.reason ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
