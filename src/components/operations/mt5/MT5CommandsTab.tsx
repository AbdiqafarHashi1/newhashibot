import { useState, useEffect } from 'react';
import { 
  Terminal, Search, RefreshCw
} from 'lucide-react';
import { listMT5Commands, type MT5CommandRecord } from '../../../lib/mt5Operations';

export function MT5CommandsTab() {
  const [commands, setCommands] = useState<MT5CommandRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchCommands = async () => {
    setLoading(true);
    try {
      const data = await listMT5Commands(100);
      setCommands(data);
    } catch (err) {
      console.error('Failed to fetch MT5 commands:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommands();
  }, []);

  const filteredCommands = commands.filter((cmd) => {
    const matchesSearch = 
      cmd.id.toLowerCase().includes(search.toLowerCase()) ||
      (cmd.symbol && cmd.symbol.toLowerCase().includes(search.toLowerCase())) ||
      cmd.operation.toLowerCase().includes(search.toLowerCase()) ||
      cmd.account_id.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || cmd.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredCommands.length / pageSize) || 1;
  const paginatedCommands = filteredCommands.slice((page - 1) * pageSize, page * pageSize);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'acknowledged':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Acknowledged</span>;
      case 'claimed':
      case 'executing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">Claimed</span>;
      case 'pending':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>;
      case 'failed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">Failed</span>;
      case 'retrying':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">Retrying</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-800 text-zinc-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal size={16} className="text-blue-400" />
            MT5 Command Queue Monitor
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Read-only operational queue tracking atomic leases, acknowledgements, and retry metrics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ID, symbol, action..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={fetchCommands}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Commands Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider">
            Command Stream ({filteredCommands.length} records)
          </span>
          <span className="text-zinc-500">
            Lease Timeout: <code className="text-zinc-300 font-mono">120s (2 mins)</code>
          </span>
        </div>

        {loading && commands.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Loading MT5 command stream...
          </div>
        ) : filteredCommands.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No MT5 commands match the selected filter query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Timestamp</th>
                  <th className="p-3 font-semibold">Command ID</th>
                  <th className="p-3 font-semibold">Symbol / Operation</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Bridge</th>
                  <th className="p-3 font-semibold">Attempts</th>
                  <th className="p-3 font-semibold text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {paginatedCommands.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 text-zinc-400 font-sans text-[11px]">
                      {new Date(cmd.created_at).toLocaleTimeString('en-US', { hour12: false })}
                    </td>
                    <td className="p-3 text-zinc-300 font-bold">
                      {cmd.id.slice(0, 16)}...
                    </td>
                    <td className="p-3 font-sans">
                      <div className="font-bold text-white uppercase">{cmd.operation}</div>
                      <div className="text-[11px] text-zinc-400">{cmd.symbol || 'N/A'}</div>
                    </td>
                    <td className="p-3 font-sans">
                      {statusBadge(cmd.status)}
                    </td>
                    <td className="p-3 text-zinc-400">
                      {cmd.bridge_id || 'bridge-mt5-001'}
                    </td>
                    <td className="p-3 text-zinc-300 font-sans">
                      {cmd.attempts} / 3
                    </td>
                    <td className="p-3 text-right text-zinc-400 font-sans">
                      {cmd.duration_ms ? `${cmd.duration_ms}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-zinc-800 flex items-center justify-between text-xs bg-zinc-950/40">
            <span className="text-zinc-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
