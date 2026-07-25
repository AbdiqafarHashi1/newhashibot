import { useState, useEffect } from 'react';
import { 
  Activity, Search, RefreshCw
} from 'lucide-react';
import { listMT5RuntimeEvents, type MT5RuntimeEvent } from '../../../lib/mt5Operations';

export function MT5EventsTab() {
  const [events, setEvents] = useState<MT5RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await listMT5RuntimeEvents(100);
      setEvents(data);
    } catch (err) {
      console.error('Failed to fetch MT5 runtime events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = events.filter((evt) => {
    const matchesSearch = 
      evt.message.toLowerCase().includes(search.toLowerCase()) ||
      evt.component.toLowerCase().includes(search.toLowerCase());

    const matchesSeverity = severityFilter === 'all' || evt.severity === severityFilter;
    const matchesCategory = categoryFilter === 'all' || evt.category === categoryFilter;

    return matchesSearch && matchesSeverity && matchesCategory;
  });

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">Error</span>;
      case 'warning':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">Warning</span>;
      case 'info':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">Info</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            MT5 Runtime Event Stream
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Audit log stream for bridge heartbeats, state synchronizations, and execution events
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error / Critical</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            <option value="heartbeat">Heartbeat</option>
            <option value="synchronization">Synchronization</option>
            <option value="command_failure">Command Failure</option>
            <option value="mt5_error">MT5 Error</option>
            <option value="reconciliation">Reconciliation</option>
          </select>

          <button
            onClick={fetchEvents}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Events Stream Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider">
            Event Log Stream ({filteredEvents.length} events)
          </span>
          <span className="text-zinc-500">Live Audit Stream</span>
        </div>

        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Loading runtime event stream...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No runtime events match the current filter query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Timestamp</th>
                  <th className="p-3 font-semibold">Severity</th>
                  <th className="p-3 font-semibold">Component</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {filteredEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 text-zinc-400 font-sans text-[11px] whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-sans">
                      {severityBadge(evt.severity)}
                    </td>
                    <td className="p-3 text-zinc-200 font-bold font-sans">
                      {evt.component}
                    </td>
                    <td className="p-3 text-purple-400 font-semibold uppercase text-[11px] font-sans">
                      {evt.category}
                    </td>
                    <td className="p-3 text-zinc-300 font-sans leading-relaxed">
                      {evt.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
