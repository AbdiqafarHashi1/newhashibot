import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getRejectedCandidatesCompact } from '../../lib/hashibotBackend';
import { gradeBadge, directionBadge } from '../../components/ui/Badge';

export default function RejectedSetups() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stratFilter, setStratFilter] = useState('all');
  const LIMIT = 50;

  useEffect(() => {
    setLoading(true);
    getRejectedCandidatesCompact(LIMIT, page * LIMIT)
      .then(({ data, total: t }) => {
        let filtered = data;
        if (stratFilter !== 'all') filtered = data.filter(c => c.strategy_name === stratFilter);
        setItems(filtered);
        setTotal(t);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [page, stratFilter]);

  const strategies = ['all', 'MicroScalper', 'CompressionBreakout', 'SwingContinuation', 'QuickScalp', 'ForexMicroScalper', 'ForexSwingContinuation'];

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Rejected Setups</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{total} total rejected candidates</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {strategies.map(s => (
          <button key={s} onClick={() => { setStratFilter(s); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${stratFilter === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {s === 'all' ? 'All Strategies' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No rejected setups found. Run the scanner to see rejection reasons.
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-4 py-3">Symbol</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">TF</th>
                  <th className="text-left px-4 py-3">Strategy</th>
                  <th className="text-left px-4 py-3">Dir</th>
                  <th className="text-left px-4 py-3">Grade</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Rejection Reason</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Time</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr key={String(c.id)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{String(c.symbol ?? '')}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">{String(c.timeframe ?? '')}</td>
                    <td className="px-4 py-3 text-zinc-400">{String(c.strategy_name ?? '')}</td>
                    <td className="px-4 py-3">{directionBadge(String(c.direction ?? ''))}</td>
                    <td className="px-4 py-3">{gradeBadge(String(c.grade ?? ''))}</td>
                    <td className="px-4 py-3 text-zinc-300">{Number(c.confidence_score ?? 0)}%</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono">{String(c.rejection_reason ?? '')}</td>
                    <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">{new Date(String(c.created_at)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 bg-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-700">Previous</button>
            <span>Page {page + 1} · {Math.min((page + 1) * LIMIT, total)} of {total}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}
              className="px-4 py-2 bg-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-700">Next</button>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
