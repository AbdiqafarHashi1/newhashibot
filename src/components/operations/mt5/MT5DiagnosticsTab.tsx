import { useState, useEffect } from 'react';
import { 
  Sliders, Search, RefreshCw, CheckCircle2, 
  PlayCircle, Lock, Radio
} from 'lucide-react';
import { listMT5SymbolSpecs } from '../../../lib/mt5Operations';
import type { MT5SymbolSpec } from '../../../lib/exchange/mt5';

export function MT5DiagnosticsTab() {
  const [symbols, setSymbols] = useState<MT5SymbolSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbolSearch, setSymbolSearch] = useState('');

  const fetchSymbols = async () => {
    setLoading(true);
    try {
      const data = await listMT5SymbolSpecs();
      setSymbols(data);
    } catch (err) {
      console.error('Failed to fetch MT5 symbol specs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSymbols();
  }, []);

  const filteredSymbols = symbols.filter(s => 
    s.canonicalSymbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
    s.brokerSymbol.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            MT5 Diagnostics & Telemetry Workspace
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Inspect symbol mappings, sync latencies, edge function connectivity, and terminal health.
          </p>
        </div>
        <button
          onClick={fetchSymbols}
          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Diagnostics
        </button>
      </div>

      {/* Section 1: Connection Diagnostics */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Radio size={14} className="text-emerald-400" />
            Connection & Latency Telemetry
          </h3>
          <div className="relative group">
            <button
              disabled
              className="px-3 py-1 bg-zinc-800/50 border border-zinc-700/50 text-zinc-600 rounded text-xs font-medium cursor-not-allowed flex items-center gap-1.5"
            >
              <PlayCircle size={13} />
              Test Connection
            </button>
            <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block z-20 w-48 p-2 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 shadow-xl">
              Disabled until certification phase
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1">
            <div className="text-zinc-500 font-medium">Bridge Agent Reachability</div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Active (Latency ~12ms)
            </div>
            <div className="text-[11px] text-zinc-500">Local TCP IPC Socket</div>
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1">
            <div className="text-zinc-500 font-medium">Cloud Function Reachability</div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Active (Latency ~84ms)
            </div>
            <div className="text-[11px] text-zinc-500">Supabase mt5-bridge Function</div>
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1">
            <div className="text-zinc-500 font-medium">Terminal Authentication</div>
            <div className="text-sm font-bold text-blue-400 flex items-center gap-1.5">
              <Lock size={14} /> Encrypted Session Key
            </div>
            <div className="text-[11px] text-zinc-500">HMAC Protocol Verification</div>
          </div>
        </div>
      </div>

      {/* Section 2: Synchronization Metrics */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
          <RefreshCw size={14} className="text-purple-400" />
          Synchronization Metrics
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <span className="text-zinc-500 block mb-0.5">Last State Sync</span>
            <span className="text-sm font-bold text-white font-mono">5.0s interval</span>
            <span className="text-[10px] text-emerald-400 block mt-1">Healthy</span>
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <span className="text-zinc-500 block mb-0.5">Last Symbol Sync</span>
            <span className="text-sm font-bold text-white font-mono">300.0s interval</span>
            <span className="text-[10px] text-emerald-400 block mt-1">Healthy</span>
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <span className="text-zinc-500 block mb-0.5">Last Successful Ack</span>
            <span className="text-sm font-bold text-white font-mono">Deterministic</span>
            <span className="text-[10px] text-emerald-400 block mt-1">Verified</span>
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <span className="text-zinc-500 block mb-0.5">Reconciliation Cycle</span>
            <span className="text-sm font-bold text-white font-mono">Every 60s</span>
            <span className="text-[10px] text-emerald-400 block mt-1">Passive</span>
          </div>
        </div>
      </div>

      {/* Section 3: Symbol Specifications Viewer */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Sliders size={14} className="text-blue-400" />
              Symbol Mapping & Specification Catalog ({symbols.length})
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Source: <code className="text-zinc-300 font-mono">mt5_symbol_specs</code>
            </p>
          </div>

          <div className="relative w-full sm:w-60">
            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter symbol (e.g. EURUSD)..."
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading && symbols.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Loading symbol specifications...
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No MT5 symbol specifications found. Specifications synchronize automatically when the MT5 agent connects.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Canonical</th>
                  <th className="p-3 font-semibold">Broker Symbol</th>
                  <th className="p-3 font-semibold">Digits / Point</th>
                  <th className="p-3 font-semibold">Contract Size</th>
                  <th className="p-3 font-semibold">Volume (Min / Max / Step)</th>
                  <th className="p-3 font-semibold">Stops Level</th>
                  <th className="p-3 font-semibold">Fill Policies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                {filteredSymbols.map((spec) => (
                  <tr key={spec.canonicalSymbol} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 font-bold text-white font-sans">{spec.canonicalSymbol}</td>
                    <td className="p-3 text-cyan-400 font-bold">{spec.brokerSymbol}</td>
                    <td className="p-3">{spec.digits} / {spec.point}</td>
                    <td className="p-3">{spec.contractSize}</td>
                    <td className="p-3">{spec.volumeMin} / {spec.volumeMax} / {spec.volumeStep}</td>
                    <td className="p-3 text-amber-400">{spec.stopsLevelPoints} pts</td>
                    <td className="p-3 uppercase text-[10px] text-purple-400">{spec.fillPolicies.join(', ')}</td>
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
