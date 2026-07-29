import { useState, useEffect } from 'react';
import { 
  Server, RefreshCw, CheckCircle2, Power, RotateCcw
} from 'lucide-react';
import { listMT5Bridges, requestMT5BridgeControl, unassignMT5BridgeAccount, type MT5BridgeInfo } from '../../../lib/mt5Operations';

export function MT5BridgesTab() {
  const [bridges, setBridges] = useState<MT5BridgeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBridge, setSelectedBridge] = useState<MT5BridgeInfo | null>(null);

  const fetchBridges = async () => {
    setLoading(true);
    try {
      const data = await listMT5Bridges();
      setBridges(data);
    } catch (err) {
      console.error('Failed to fetch MT5 bridges:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBridges();
  }, []);

  const control = async (action: 'graceful_stop' | 'restart' | 'read_only_sync' | 'revoke') => {
    if (!selectedBridge) return;
    await requestMT5BridgeControl(selectedBridge.bridge_id, action);
    await fetchBridges();
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
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Server size={16} className="text-blue-400" />
            MT5 Bridge Daemon Management
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Monitor the outbound-only Python manager. Bridge process required until it is running locally; this browser cannot launch Windows processes.
          </p>
        </div>
        <button
          onClick={fetchBridges}
          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Bridges
        </button>
      </div>

      {/* Bridge Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Canonically Registered Bridges ({bridges.length})
          </span>
          <span className="text-[11px] text-zinc-500">
            Protocol: <code className="text-zinc-300 font-mono">v1.0.0-phase8c</code>
          </span>
        </div>

        {loading && bridges.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Loading MT5 bridge telemetry...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Bridge ID</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Hostname / OS</th>
                  <th className="p-3 font-semibold">Connected Account</th>
                  <th className="p-3 font-semibold">Last Heartbeat</th>
                  <th className="p-3 font-semibold">Agent / Runtime</th>
                  <th className="p-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {bridges.map((bridge) => (
                  <tr key={bridge.bridge_id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-white">
                      {bridge.bridge_id}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        bridge.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        bridge.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          bridge.status === 'online' ? 'bg-emerald-400 animate-pulse' :
                          bridge.status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'
                        }`} />
                        {bridge.health}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-zinc-200">{bridge.hostname}</div>
                      <div className="text-[11px] text-zinc-500">{bridge.os}</div>
                    </td>
                    <td className="p-3 font-mono text-zinc-300">
                      {bridge.assigned_account_count} · {bridge.connected_account || 'None'}
                    </td>
                    <td className="p-3 text-zinc-400">
                      {timeAgo(bridge.last_heartbeat_at)}
                    </td>
                    <td className="p-3">
                      <div className="text-zinc-300">{bridge.agent_version}</div>
                      <div className="text-[11px] font-mono text-zinc-500">{bridge.version}</div>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedBridge(bridge)}
                        className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded text-[11px] font-medium transition-colors"
                      >
                        Inspect Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bridge Detail Drawer / Modal */}
      {selectedBridge && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Bridge Detail Inspector</h3>
                  <p className="text-[11px] text-zinc-400 font-mono">{selectedBridge.bridge_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBridge(null)}
                className="text-zinc-500 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div>
                <span className="text-zinc-500 block">Bridge ID</span>
                <span className="font-mono text-white font-semibold">{selectedBridge.bridge_id}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Version & Build</span>
                <span className="font-mono text-white font-semibold">{selectedBridge.version} (Build 8c2)</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Hostname</span>
                <span className="text-white font-medium">{selectedBridge.hostname}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Operating System</span>
                <span className="text-white font-medium">{selectedBridge.os}</span>
              </div>
              <div><span className="text-zinc-500 block">Worker / PID</span><span className="font-mono text-white">{selectedBridge.worker_id || 'unknown'} / {selectedBridge.process_id || 'unknown'}</span></div>
              <div><span className="text-zinc-500 block">Startup / Polling</span><span className="text-white">{selectedBridge.startup_stage || 'unknown'} / {selectedBridge.command_polling_state || 'unknown'}</span></div>
            </div>

            {/* Connectivity Status */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Connectivity Status</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <span className="text-zinc-400">MT5 Terminal Connected</span>
                  <span className={selectedBridge.terminal_authenticated ? 'text-emerald-400 font-semibold flex items-center gap-1' : 'text-amber-400 font-semibold'}>
                    {selectedBridge.terminal_authenticated ? <><CheckCircle2 size={13} /> Authenticated</> : 'Not authenticated'}
                  </span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <span className="text-zinc-400">Cloud Gateway Connected</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Yes
                  </span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between"><span className="text-zinc-400">Credential / Execution</span><span className="text-zinc-300">{selectedBridge.credential_capability} / {selectedBridge.execution_enabled ? 'enabled' : 'disabled'}</span></div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between"><span className="text-zinc-400">Last Sync</span><span className="text-zinc-300">{timeAgo(selectedBridge.last_sync_at)}</span></div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <span className="text-zinc-400">Account Bound</span>
                  <span className="text-white font-mono">{selectedBridge.assigned_account_count} assigned</span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <span className="text-zinc-400">Last Heartbeat</span>
                  <span className="text-zinc-300">{timeAgo(selectedBridge.last_heartbeat_at)}</span>
                </div>
              </div>
            </div>

            {/* Canonical assignments */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Assigned accounts (canonical truth)</h4>
              <div className="space-y-2 text-xs">
                {selectedBridge.assigned_accounts.map(account => (
                  <div key={account.id} className="p-2 bg-zinc-950 border border-zinc-800/80 rounded flex items-center justify-between text-zinc-300">
                    <span>{account.masked} · {account.account_class} · {account.credential_capability} · execution {account.execution_enabled ? 'enabled' : 'disabled'} · terminal {account.terminal_authenticated ? 'authenticated' : 'not authenticated'} · snapshot {timeAgo(account.last_snapshot_at)}</span>
                    <button onClick={async () => { await unassignMT5BridgeAccount(account.id); await fetchBridges(); }} className="text-amber-400 hover:text-amber-300">Safe unassign</button>
                  </div>
                ))}
                {!selectedBridge.assigned_accounts.length && <div className="text-zinc-500">No assigned accounts.</div>}
              </div>
            </div>

            {(selectedBridge.last_error_code || selectedBridge.last_error_message) && <div className="rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-300">{selectedBridge.last_error_code}: {selectedBridge.last_error_message}</div>}

            {/* Future Controls - Disabled until Certification */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <div className="text-[11px] text-zinc-500">
                Controls create requests for an already-running manager; this browser never launches a process.
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => control('read_only_sync')} className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs font-medium">Read-only test</button>
                <button onClick={() => control('restart')} className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs font-medium flex items-center gap-1">
                  <RotateCcw size={12} />
                  Request restart
                </button>
                <button onClick={() => control('graceful_stop')} className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-xs font-medium flex items-center gap-1">
                  <Power size={12} />
                  Request stop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
