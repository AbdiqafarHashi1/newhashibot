import { useState, useEffect, useCallback } from 'react';
import { 
  Play, Square, RefreshCw, CheckCircle2, ShieldCheck, 
  Activity, Filter, AlertTriangle, Database
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

type ProviderControlRow = {
  id?: string;
  provider_name?: string;
  provider?: string;
  environment?: string;
  scope?: string;
  status?: string;
  is_enabled?: boolean;
  new_entries_enabled?: boolean;
  monitor_enabled?: boolean;
  protection_enabled?: boolean;
  last_error?: string | null;
  updated_at?: string | null;
};

type HeartbeatRow = {
  provider?: string;
  scope?: string;
  started_at?: string | null;
  finished_at?: string | null;
  success?: boolean;
  error_message?: string | null;
};

type TradeTruthRow = {
  provider?: string;
  position_size?: number;
  protection_status?: string;
  status?: string;
};

export default function Execution() {
  const [controls, setControls] = useState<ProviderControlRow[]>([]);
  const [heartbeats, setHeartbeats] = useState<HeartbeatRow[]>([]);
  const [trades, setTrades] = useState<TradeTruthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const fetchTruth = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [ctrlRes, hbRes, tradeRes] = await Promise.all([
        supabase.from('execution_provider_controls').select('*').order('updated_at', { ascending: false }),
        supabase.from('execution_monitor_heartbeats').select('*').order('started_at', { ascending: false }).limit(50),
        supabase.from('trade_management_truth').select('provider,position_size,protection_status,status')
      ]);

      if (ctrlRes.error) console.warn('execution_provider_controls fetch:', ctrlRes.error.message);
      if (hbRes.error) console.warn('execution_monitor_heartbeats fetch:', hbRes.error.message);
      if (tradeRes.error) console.warn('trade_management_truth fetch:', tradeRes.error.message);

      setControls((ctrlRes.data ?? []) as ProviderControlRow[]);
      setHeartbeats((hbRes.data ?? []) as HeartbeatRow[]);
      setTrades((tradeRes.data ?? []) as TradeTruthRow[]);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load execution truth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTruth();
    const interval = setInterval(() => void fetchTruth(), 15000);
    return () => clearInterval(interval);
  }, [fetchTruth]);

  const handleGlobalAction = async (action: 'resume_supervisor' | 'pause_supervisor' | 'refresh_exchange') => {
    setActionPending(true);
    setActionNotice(`Executing backend action: ${action}...`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action }
      });
      if (error) {
        setActionNotice(`Backend action failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Backend action error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice(`Action ${action} completed successfully.`);
        await fetchTruth();
      }
    } catch (err) {
      setActionNotice(`Action exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const filteredControls = controls.filter(c => {
    if (filterProvider === 'all') return true;
    const name = (c.provider_name || c.provider || '').toLowerCase();
    return name.includes(filterProvider.toLowerCase());
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-blue-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Execution Management</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Cross-Provider Execution Engines
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Backend runtime execution provider truth verified from Supabase provider controls, monitor heartbeats, and live positions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={actionPending}
              onClick={() => handleGlobalAction('resume_supervisor')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              <Play size={14} /> Start Supervisor
            </button>

            <button
              disabled={actionPending}
              onClick={() => handleGlobalAction('pause_supervisor')}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 transition disabled:opacity-50"
            >
              <Square size={14} /> Pause Supervisor
            </button>

            <button
              disabled={actionPending}
              onClick={() => handleGlobalAction('refresh_exchange')}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync All
            </button>
          </div>
        </div>

        {actionNotice && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3 text-xs text-blue-300 flex items-center gap-2 font-sans">
            <CheckCircle2 size={16} />
            <span>{actionNotice}</span>
          </div>
        )}

        {fetchError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 flex items-center gap-2 font-sans">
            <AlertTriangle size={16} />
            <span>{fetchError}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-xs">
          <Filter size={14} className="text-zinc-500" />
          <span className="text-zinc-400">Provider Scope:</span>
          {(['all', 'binance', 'bybit', 'mt5'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterProvider(p)}
              className={`px-3 py-1.5 rounded-lg font-medium uppercase transition ${
                filterProvider === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Loading / Empty / Data Display */}
        {loading && controls.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-xs text-zinc-400 font-sans">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
            <span>Querying active execution provider controls from Supabase...</span>
          </div>
        ) : filteredControls.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-8 text-center font-sans space-y-3">
            <Database size={32} className="mx-auto text-zinc-600" />
            <div className="text-sm font-semibold text-zinc-300">NO_DATA / NOT_CONFIGURED</div>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              No execution provider control records match the current filter in <code className="text-zinc-400 font-mono">execution_provider_controls</code>.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredControls.map((exec, idx) => {
              const pName = exec.provider_name || exec.provider || `Provider #${idx + 1}`;
              const env = exec.environment || exec.scope || 'Testnet';
              const isEnabled = exec.is_enabled ?? (exec.status === 'ACTIVE');

              // Find matching heartbeat
              const hb = heartbeats.find(h => (h.provider || '').toLowerCase() === pName.toLowerCase());
              const hbTime = hb?.started_at ? `${Math.round((Date.now() - new Date(hb.started_at).getTime()) / 1000)}s ago` : 'No heartbeat record';

              // Find open position count
              const providerTrades = trades.filter(t => (t.provider || '').toLowerCase().includes(pName.toLowerCase()));
              const openPosCount = providerTrades.filter(t => Math.abs(Number(t.position_size ?? 0)) > 0).length;

              return (
                <div key={exec.id || idx} className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className={isEnabled ? 'text-emerald-400' : 'text-zinc-500'} />
                      <div>
                        <h3 className="text-base font-bold text-white capitalize">{pName}</h3>
                        <p className="text-[10px] text-zinc-500 uppercase">{env} Environment</p>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                      isEnabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {isEnabled ? 'RUNNING' : 'STOPPED'}
                    </span>
                  </div>

                  {/* Data fields */}
                  <div className="space-y-2 text-xs text-zinc-300">
                    <div className="flex justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="text-zinc-500">New Entries:</span>
                      <span className={exec.new_entries_enabled !== false ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                        {exec.new_entries_enabled !== false ? 'ENABLED' : 'PAUSED'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="text-zinc-500">Monitor Engine:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <ShieldCheck size={12} /> {exec.monitor_enabled !== false ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="text-zinc-500">Open Positions:</span>
                      <span className="font-bold text-white">{openPosCount}</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="text-zinc-500">Last Heartbeat:</span>
                      <span className="text-zinc-400">{hbTime}</span>
                    </div>
                    {exec.last_error && (
                      <div className="text-[10px] text-red-400 bg-red-950/30 p-1.5 rounded border border-red-900/40">
                        Error: {exec.last_error}
                      </div>
                    )}
                  </div>

                  {/* Action Toolbar */}
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setActionNotice(`Fine-grained provider lifecycle toggle for ${pName} requires server-authorized RPC.`);
                        setTimeout(() => setActionNotice(null), 4000);
                      }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:text-white transition flex items-center justify-center gap-1"
                    >
                      <RefreshCw size={12} /> Inspect Provider
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
