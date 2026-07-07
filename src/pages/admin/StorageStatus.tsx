import { useState, useEffect, useCallback } from 'react';
import { HardDrive, Database, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getFeatureFlags, getScannerConfigCompact, getSymbolUniverseGroups, type FeatureFlag, type SymbolUniverseGroup } from '../../lib/hashibotBackend';

export default function StorageStatus() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [groups, setGroups] = useState<SymbolUniverseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, c, g] = await Promise.all([
        getFeatureFlags(),
        getScannerConfigCompact(),
        getSymbolUniverseGroups(),
      ]);
      setFlags(f);
      setConfig(c);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load storage status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const enabledGroup = groups.find((g) => g.group_name === (config?.enabled_universe_group ?? 'crypto_core'));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <HardDrive size={24} className="text-blue-400" />
            Storage Status
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Monitor storage-related settings and symbol universe configuration.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
                  <Database size={16} className="text-blue-400" />
                  Candle Persistence
                </h3>
                <div className="flex items-center gap-2">
                  {config?.persist_candles_enabled ? (
                    <>
                      <AlertTriangle size={16} className="text-orange-400" />
                      <span className="text-sm text-orange-400">Enabled (storage growth risk)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-green-400" />
                      <span className="text-sm text-green-400">Disabled (exchange fetch only)</span>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
                  <Database size={16} className="text-blue-400" />
                  Indicator Persistence
                </h3>
                <div className="flex items-center gap-2">
                  {config?.persist_indicators_enabled ? (
                    <>
                      <AlertTriangle size={16} className="text-orange-400" />
                      <span className="text-sm text-orange-400">Enabled (storage growth risk)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-green-400" />
                      <span className="text-sm text-green-400">Disabled (recomputed on scan)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">Symbol Universe</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Active Universe Group</span>
                  <span className="text-sm font-medium text-blue-400">
                    {enabledGroup?.display_name ?? String(config?.enabled_universe_group ?? 'crypto_core')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Scanned Symbol Count</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {enabledGroup?.symbols.length ?? 5} symbols
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Scanner Runs Retention</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {Number(config?.max_scanner_runs_retention_days ?? 14)} days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Candidates Retention</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {Number(config?.max_strategy_candidates_retention_days ?? 14)} days
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">Universe Groups</h3>
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{group.display_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-500">{group.symbols.length} symbols</span>
                      {group.is_enabled ? (
                        <span className="text-green-400 text-xs">Enabled</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">Disabled</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">Feature Flags</h3>
              <div className="space-y-2">
                {flags.map((flag) => (
                  <div key={flag.flag_name} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-zinc-300">{flag.display_name}</span>
                      <span className="text-zinc-600 text-xs ml-2">{flag.category}</span>
                    </div>
                    {flag.is_enabled ? (
                      <span className="text-green-400 text-xs">Enabled</span>
                    ) : (
                      <span className="text-zinc-600 text-xs">Disabled</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
