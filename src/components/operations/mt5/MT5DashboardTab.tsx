import { useState, useEffect } from 'react';
import { 
  Activity, RefreshCw, Database, Radio, Server, Cpu, Zap
} from 'lucide-react';
import { getMT5OperationsOverview, type MT5OperationsOverview } from '../../../lib/mt5Operations';

interface Props {
  onNavigateTab: (tab: string) => void;
}

export function MT5DashboardTab({ onNavigateTab }: Props) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MT5OperationsOverview | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const data = await getMT5OperationsOverview();
      setOverview(data);
    } catch (err) {
      console.error('Failed to fetch MT5 operations overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading && !overview) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900/80 rounded-xl border border-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const timeAgo = (iso?: string | null) => {
    if (!iso) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="space-y-6">
      {/* Top Health Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Activity size={14} className="text-blue-400" />
            Operational Health
          </h2>
          <button 
            onClick={fetchOverview}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div 
            onClick={() => onNavigateTab('accounts')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Total Accounts</div>
            <div className="text-2xl font-bold text-white">{overview?.totalAccounts ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
              <span>Personal & Prop EA</span>
            </div>
          </div>

          <div 
            onClick={() => onNavigateTab('accounts')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Connected Accounts</div>
            <div className="text-2xl font-bold text-emerald-400">{overview?.connectedAccounts ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1">Terminal connection only</div>
          </div>

          <div 
            onClick={() => onNavigateTab('bridges')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Active Bridges</div>
            <div className="text-2xl font-bold text-blue-400">{overview?.activeBridges ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1">Daemon instances</div>
          </div>

          <div 
            onClick={() => onNavigateTab('bridges')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Offline Bridges</div>
            <div className="text-2xl font-bold text-amber-400">{overview?.offlineBridges ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1">Awaiting Agent</div>
          </div>

          <div 
            onClick={() => onNavigateTab('commands')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Pending Commands</div>
            <div className="text-2xl font-bold text-yellow-400">{overview?.pendingCommands ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1">Queue Depth</div>
          </div>

          <div 
            onClick={() => onNavigateTab('commands')}
            className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 cursor-pointer transition-all"
          >
            <div className="text-xs text-zinc-500 font-medium mb-1">Failed Commands</div>
            <div className="text-2xl font-bold text-red-400">{overview?.failedCommands ?? 0}</div>
            <div className="text-[11px] text-zinc-400 mt-1">Error count</div>
          </div>

          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl col-span-2 sm:col-span-1 lg:col-span-2">
            <div className="text-xs text-zinc-500 font-medium mb-1">Runtime Status</div>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${overview?.connectedAccounts ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-sm font-bold text-zinc-100">{overview?.runtimeStatus}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              HashiBot MT5 Bridge Engine v1.0.0
            </div>
          </div>
        </div>
      </div>

      {/* Live Connectivity Status Cards */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <Radio size={14} className="text-emerald-400" />
          Live Connection Telemetry
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${overview?.bridgeOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <Server size={20} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium">Bridge connected</div>
              <div className="text-sm font-semibold text-white">
                {overview?.bridgeOnline ? 'Bridge Online' : 'Bridge Standby'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Heartbeat: {timeAgo(overview?.lastHeartbeatAt)}
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${overview?.mt5Connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
              <Cpu size={20} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium">Terminal authenticated</div>
              <div className="text-sm font-semibold text-white">
                {overview?.terminalAuthenticated ? 'Authenticated' : 'Not authenticated'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                State Sync: {timeAgo(overview?.lastStateSyncAt)}
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${overview?.cloudConnected ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <Zap size={20} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium">Market data active</div>
              <div className="text-sm font-semibold text-white">
                {overview?.marketDataActive ? 'Fresh MT5 rows' : 'Inactive / stale'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Symbol Sync: {timeAgo(overview?.lastSymbolSyncAt)}
              </div>
            </div>
          </div>
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 font-medium">Command path certified</div>
            <div className="text-sm font-semibold text-white mt-1">{overview?.commandPathCertified ? 'PASS' : 'NOT CERTIFIED'}</div>
          </div>
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 font-medium">Execution enabled</div>
            <div className="text-sm font-semibold text-white mt-1">{overview?.executionEnabled ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      </div>

      {/* Runtime Summary Section */}
      <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-purple-400" />
            <h3 className="text-sm font-bold text-white">MT5 Accounts Portfolio Runtime Summary</h3>
          </div>
          <button 
            onClick={() => onNavigateTab('runtime')}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            Inspect Detailed Live Runtime →
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-zinc-500">Total Equity</div>
            <div className="text-lg font-bold text-white mt-0.5">{formatCurrency(overview?.totalEquity ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Floating P/L</div>
            <div className={`text-lg font-bold mt-0.5 ${(overview?.totalFloatingPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {(overview?.totalFloatingPnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(overview?.totalFloatingPnl ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Used Margin</div>
            <div className="text-lg font-bold text-zinc-200 mt-0.5">{formatCurrency(overview?.totalMargin ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Free Margin</div>
            <div className="text-lg font-bold text-cyan-400 mt-0.5">{formatCurrency(overview?.freeMargin ?? 0)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/60 text-xs">
          <div>
            <span className="text-zinc-500">Accounts Connected: </span>
            <span className="font-semibold text-zinc-200">{overview?.connectedAccounts} of {overview?.totalAccounts}</span>
          </div>
          <div>
            <span className="text-zinc-500">Open Positions: </span>
            <span className="font-semibold text-zinc-200">{overview?.openPositionsCount} active</span>
          </div>
          <div>
            <span className="text-zinc-500">Pending Orders: </span>
            <span className="font-semibold text-zinc-200">{overview?.pendingOrdersCount} queued</span>
          </div>
        </div>
      </div>
    </div>
  );
}
