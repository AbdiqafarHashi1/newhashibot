import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Filter, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

type SubsystemIncident = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  subsystem: string;
  provider: string;
  environment: string;
  account: string;
  state: 'DETECTED' | 'INVESTIGATING' | 'REPAIRING' | 'RESOLVED';
  detectedTime: string;
  recoveryAttempts: number;
  error: string;
  rawEventId?: string;
};

export default function Recovery() {
  const [incidents, setIncidents] = useState<SubsystemIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterSubsystem, setFilterSubsystem] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [eventsRes, hbRes, tradeRes, tgRes] = await Promise.all([
        supabase.from('operator_runtime_events').select('*').eq('result', 'FAILED').order('created_at', { ascending: false }).limit(50),
        supabase.from('execution_monitor_heartbeats').select('*').eq('success', false).order('started_at', { ascending: false }).limit(20),
        supabase.from('trade_management_truth').select('*').not('latest_error', 'is', null).limit(20),
        supabase.from('telegram_deliveries').select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(20)
      ]);

      const items: SubsystemIncident[] = [];

      // 1. Runtime event failures
      (eventsRes.data ?? []).forEach((row: Record<string, unknown>) => {
        items.push({
          id: `EVT-${String(row.id).slice(0, 8)}`,
          severity: 'critical',
          subsystem: String(row.action || row.source || 'executor'),
          provider: String(row.provider || 'System'),
          environment: 'Live',
          account: String(row.actor_user_id || 'System Process'),
          state: 'DETECTED',
          detectedTime: row.created_at ? `${Math.round((Date.now() - new Date(String(row.created_at)).getTime()) / 60000)}m ago` : 'recently',
          recoveryAttempts: 1,
          error: String(row.error || row.summary || 'Runtime execution failure'),
          rawEventId: String(row.id)
        });
      });

      // 2. Heartbeat failures
      (hbRes.data ?? []).forEach((row: Record<string, unknown>) => {
        items.push({
          id: `HB-${String(row.id || 'hb').slice(0, 8)}`,
          severity: 'warning',
          subsystem: 'monitor',
          provider: String(row.provider || 'Monitor Engine'),
          environment: String(row.scope || 'Testnet'),
          account: 'Monitor Daemon',
          state: 'DETECTED',
          detectedTime: row.started_at ? `${Math.round((Date.now() - new Date(String(row.started_at)).getTime()) / 60000)}m ago` : 'recently',
          recoveryAttempts: 1,
          error: String(row.error_message || 'Monitor heartbeat reported failure')
        });
      });

      // 3. Trade errors
      (tradeRes.data ?? []).forEach((row: Record<string, unknown>) => {
        items.push({
          id: `TRD-${String(row.id).slice(0, 8)}`,
          severity: 'warning',
          subsystem: 'protection',
          provider: String(row.provider || 'Exchange'),
          environment: String(row.scope || row.environment || 'Live'),
          account: String(row.account_name || 'Trading Account'),
          state: 'DETECTED',
          detectedTime: row.latest_sync_at ? `${Math.round((Date.now() - new Date(String(row.latest_sync_at)).getTime()) / 60000)}m ago` : 'recently',
          recoveryAttempts: 1,
          error: String(row.latest_error || 'Position protection error')
        });
      });

      // 4. Telegram failures
      (tgRes.data ?? []).forEach((row: Record<string, unknown>) => {
        items.push({
          id: `TG-${String(row.id).slice(0, 8)}`,
          severity: 'info',
          subsystem: 'telegram',
          provider: 'Telegram Gateway',
          environment: 'Global',
          account: String(row.destination_channel || row.chat_id || 'Telegram Channel'),
          state: 'DETECTED',
          detectedTime: row.created_at ? `${Math.round((Date.now() - new Date(String(row.created_at)).getTime()) / 60000)}m ago` : 'recently',
          recoveryAttempts: Number(row.retry_count || 1),
          error: String(row.error_message || 'Telegram delivery failed')
        });
      });

      setIncidents(items);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to query subsystem incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIncidents();
    const interval = setInterval(() => void fetchIncidents(), 20000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  const handleScanSubsystems = async () => {
    setActionPending(true);
    setActionNotice('Scanning all active subsystems via supervisor inspection cycle...');
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'run_supervisor_now' }
      });
      if (error) {
        setActionNotice(`Subsystem scan failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Scan error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice('Subsystem scan completed successfully.');
        await fetchIncidents();
      }
    } catch (err) {
      setActionNotice(`Scan exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleRepair = async (id: string, provider: string) => {
    setActionPending(true);
    setActionNotice(`Executing automated repair sequence for ${id}...`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'repair_protection_now', provider: provider !== 'System' ? provider : 'all' }
      });
      if (error) {
        setActionNotice(`Repair failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Repair error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice(`Repair sequence executed for ${id}. Refreshing failure logs...`);
        await fetchIncidents();
      }
    } catch (err) {
      setActionNotice(`Repair exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleResolve = (id: string) => {
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, state: 'RESOLVED' } : i));
    setActionNotice(`Incident ${id} marked RESOLVED in UI view.`);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const filteredIncidents = incidents.filter(i => {
    if (filterSubsystem !== 'all' && !i.subsystem.toLowerCase().includes(filterSubsystem.toLowerCase())) return false;
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-red-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Recovery Center</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Subsystem Incidents & Automated Recovery
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Centralized triage, repair actions, and reconciliation verified from database runtime failure logs.
            </p>
          </div>

          <button
            disabled={actionPending}
            onClick={handleScanSubsystems}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Scan All Subsystems
          </button>
        </div>

        {actionNotice && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3 text-xs text-blue-300 flex items-center gap-2 font-sans">
            <Wrench size={16} />
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            <Filter size={14} className="text-red-400" />
            Incident Scope & Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-zinc-400 uppercase block mb-1">Subsystem</label>
              <select
                value={filterSubsystem}
                onChange={e => setFilterSubsystem(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
              >
                <option value="all">All Subsystems</option>
                <option value="scanner">Scanner Engine</option>
                <option value="executor">Executor Engine</option>
                <option value="monitor">Protection Monitor</option>
                <option value="provider">Provider Connectivity</option>
                <option value="telegram">Telegram Gateway</option>
                <option value="protection">Protection Verifier</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 uppercase block mb-1">Severity</label>
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>
        </div>

        {/* Incidents Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-300">Active Incidents ({filteredIncidents.length})</span>
            <span className="text-zinc-500">Live failure triage logs</span>
          </div>

          {loading && incidents.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-sans">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-red-400" />
              <span>Checking runtime failure records across database tables...</span>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-8 text-center font-sans space-y-2">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
              <div className="text-sm font-semibold text-zinc-300">NO_ACTIVE_INCIDENTS</div>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                No active subsystem incidents or failures detected across scanner, executor, monitor, or telegram logs.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {filteredIncidents.map(inc => (
                <div key={inc.id} className="p-4 space-y-3 hover:bg-zinc-800/40 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        inc.severity === 'critical'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : inc.severity === 'warning'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-white font-bold text-sm">{inc.id}</span>
                      <span className="text-zinc-500 text-xs">• {inc.subsystem} • {inc.provider} ({inc.environment})</span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      inc.state === 'RESOLVED'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    }`}>
                      {inc.state}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 bg-zinc-950 p-2.5 rounded border border-zinc-800/80 font-sans leading-relaxed">
                    {inc.error}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pt-1">
                    <div>
                      Account: <span className="text-white">{inc.account}</span> | Detected: <span className="text-zinc-300">{inc.detectedTime}</span> | Attempts: <span className="text-white">{inc.recoveryAttempts}</span>
                    </div>

                    {inc.state !== 'RESOLVED' && (
                      <div className="flex items-center gap-2 font-sans">
                        <button
                          disabled={actionPending}
                          onClick={() => handleRepair(inc.id, inc.provider)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition disabled:opacity-50"
                        >
                          Execute Repair
                        </button>
                        <button
                          disabled={actionPending}
                          onClick={() => handleResolve(inc.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition disabled:opacity-50"
                        >
                          Mark Resolved
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
