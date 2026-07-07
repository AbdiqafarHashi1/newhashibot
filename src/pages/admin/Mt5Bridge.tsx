import { useState, useEffect, useCallback } from 'react';
import { Cable, AlertTriangle, CheckCircle, Loader2, Activity, User } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getHashiBridgeRegistry, getHashiBridgeCommandQueue, getFeatureFlag, type HashiBridgeRegistry } from '../../lib/hashibotBackend';

export default function Mt5Bridge() {
  const [bridges, setBridges] = useState<HashiBridgeRegistry[]>([]);
  const [queue, setQueue] = useState<Record<string, unknown>[]>([]);
  const [mt5Enabled, setMt5Enabled] = useState(false);
  const [mt5LiveEnabled, setMt5LiveEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, q, bridgeFlag, liveFlag] = await Promise.all([
        getHashiBridgeRegistry(),
        getHashiBridgeCommandQueue(),
        getFeatureFlag('mt5_bridge_enabled'),
        getFeatureFlag('mt5_live_execution_enabled'),
      ]);
      setBridges(b);
      setQueue(q);
      setMt5Enabled(bridgeFlag);
      setMt5LiveEnabled(liveFlag);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MT5 bridge data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Cable size={24} className="text-blue-400" />
            MT5 / HashiBridge Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Bridge registry, heartbeats, command queue, and validation status.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Status banner */}
        <div className={`border rounded-xl p-4 ${mt5LiveEnabled ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <div className="flex items-center gap-3">
            {mt5LiveEnabled ? (
              <AlertTriangle size={20} className="text-red-400" />
            ) : (
              <CheckCircle size={20} className="text-green-400" />
            )}
            <div>
              <div className="text-sm font-medium text-zinc-100">
                MT5 Live Execution: {mt5LiveEnabled ? 'ENABLED' : 'Disabled (default)'}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                MT5 Bridge: {mt5Enabled ? 'Enabled' : 'Disabled (default)'} — Live execution remains disabled until validated
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {/* Bridge Registry */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
                <Cable size={16} className="text-blue-400" />
                Bridge Registry ({bridges.length})
              </h3>
              {bridges.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle size={24} className="text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No bridges registered.</p>
                  <p className="text-xs text-zinc-600 mt-1">Customers must register their MT5 bridge from their account page.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bridges.map((bridge) => {
                    const heartbeatAge = bridge.last_heartbeat_at
                      ? Math.round((Date.now() - new Date(bridge.last_heartbeat_at).getTime()) / 60000)
                      : null;
                    const isStale = heartbeatAge !== null && heartbeatAge > 5;
                    return (
                      <div key={bridge.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100">{bridge.bridge_id}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              bridge.bridge_status === 'online' ? 'bg-green-500/20 text-green-400' :
                              bridge.bridge_status === 'offline' ? 'bg-zinc-700 text-zinc-400' :
                              'bg-orange-500/20 text-orange-400'
                            }`}>
                              {bridge.bridge_status}
                            </span>
                          </div>
                          <span className={`text-xs ${bridge.is_enabled ? 'text-green-400' : 'text-zinc-600'}`}>
                            {bridge.is_enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                          <div className="flex items-center gap-1">
                            <User size={12} />
                            {bridge.device_name || 'Unknown device'}
                          </div>
                          <div>MT5: {bridge.mt5_account_number || 'N/A'}</div>
                          <div>Mode: {bridge.capital_mode}</div>
                          <div>Server: {bridge.mt5_server || 'N/A'}</div>
                          <div className="flex items-center gap-1">
                            <Activity size={12} />
                            {bridge.last_heartbeat_at
                              ? `${heartbeatAge}m ago${isStale ? ' (stale)' : ''}`
                              : 'Never'}
                          </div>
                          <div>Validation: {bridge.validation_status}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Command Queue */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">Command Queue ({queue.length})</h3>
              {queue.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-4">No commands queued.</p>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 10).map((cmd, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-zinc-800/50 rounded-lg p-2">
                      <span className="text-zinc-300">{String(cmd.command_type)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        cmd.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        cmd.status === 'pending' ? 'bg-blue-500/20 text-blue-400' :
                        cmd.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-zinc-700 text-zinc-400'
                      }`}>
                        {String(cmd.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
