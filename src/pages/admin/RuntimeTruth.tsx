import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { RefreshCw, ShieldAlert, Activity } from 'lucide-react';

type VerifiedRuntimeEvent = {
  id: string;
  timestamp: string;
  category: 'SIGNAL' | 'EXECUTION' | 'PROTECTION' | 'PROVIDER' | 'AUDIT';
  provider: string;
  environment: string;
  message: string;
  receiptId?: string;
  status: 'VERIFIED' | 'WARNING' | 'VIOLATION';
};

export default function RuntimeTruth() {
  const [events, setEvents] = useState<VerifiedRuntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [summary, setSummary] = useState({
    signalStatus: 'VERIFIED',
    executionStatus: 'VERIFIED',
    protectionStatus: 'VERIFIED',
    driftCount: 0,
  });

  const loadRuntimeTelemetry = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const [
        auditLogsRes,
        telegramRes,
        heartbeatsRes,
        truthPositionsRes,
        signalsRes,
        orchestratorEventsRes,
      ] = await Promise.all([
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(25),
        supabase.from('telegram_deliveries').select('*').order('created_at', { ascending: false }).limit(25),
        supabase.from('execution_monitor_heartbeats').select('*').order('started_at', { ascending: false }).limit(25),
        supabase.from('active_trade_management_truth').select('*').order('latest_sync_at', { ascending: false }).limit(25),
        supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(25),
        supabase.from('operator_runtime_events').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      const compiled: VerifiedRuntimeEvent[] = [];
      let totalDrifts = 0;

      // 0. Convert Operator Runtime Events (Orchestrator) to EXECUTION / PROVIDER / PROTECTION Events
      (orchestratorEventsRes.data ?? []).forEach((row: { id: string; created_at: string; event_type: string; severity?: string; provider?: string; message: string; correlation_id?: string; duration_ms?: number; result?: string }) => {
        const isError = row.severity === 'error' || row.severity === 'critical' || row.result === 'FAILED';
        const isWarn = row.severity === 'warning' || row.result === 'REJECTED';
        compiled.push({
          id: `orch-${row.id}`,
          timestamp: new Date(row.created_at).toLocaleString(),
          category: row.event_type?.includes('PROTECTION') ? 'PROTECTION' : row.event_type?.includes('SIGNAL') ? 'SIGNAL' : 'EXECUTION',
          provider: (row.provider || 'Orchestrator').toUpperCase(),
          environment: 'Pipeline',
          message: `[${row.event_type}] ${row.message}${row.duration_ms ? ` (${row.duration_ms}ms)` : ''}`,
          receiptId: row.correlation_id ? `CID-${row.correlation_id.slice(0, 8)}` : `EVT-${row.id.slice(0, 8)}`,
          status: isError ? 'VIOLATION' : isWarn ? 'WARNING' : 'VERIFIED',
        });
      });

      // 1. Convert Audit Logs to AUDIT Events
      (auditLogsRes.data ?? []).forEach((row: { id: string; created_at: string; action: string; entity_type?: string; entity_id?: string; actor_user_id?: string }) => {
        compiled.push({
          id: `audit-${row.id}`,
          timestamp: new Date(row.created_at).toLocaleString(),
          category: 'AUDIT',
          provider: 'System Audit',
          environment: 'Global',
          message: `Operator action: ${row.action}${row.entity_type ? ` on ${row.entity_type}` : ''}${row.entity_id ? ` (${row.entity_id})` : ''}`,
          receiptId: `AUD-${row.id.slice(0, 8)}`,
          status: 'VERIFIED',
        });
      });

      // 2. Convert Telegram Deliveries to PROVIDER / SIGNAL Events
      (telegramRes.data ?? []).forEach((row: { id: string; created_at: string; destination_channel?: string; delivery_type?: string; delivery_status: string; error_message?: string }) => {
        const isError = row.delivery_status === 'failed';
        compiled.push({
          id: `tg-${row.id}`,
          timestamp: new Date(row.created_at).toLocaleString(),
          category: 'PROVIDER',
          provider: 'Telegram Router',
          environment: row.destination_channel ?? 'admin',
          message: `Delivery ${row.delivery_type ?? 'event'}: ${row.delivery_status}${row.error_message ? ` - Error: ${row.error_message}` : ''}`,
          receiptId: `TG-${row.id.slice(0, 8)}`,
          status: isError ? 'WARNING' : 'VERIFIED',
        });
      });

      // 3. Convert Execution Monitor Heartbeats to PROTECTION Events
      (heartbeatsRes.data ?? []).forEach((row: { id: string; started_at: string; provider: string; environment: string; monitor_status: string; positions_seen?: number; protections_created?: number; errors?: unknown }) => {
        const isError = row.monitor_status === 'failed' || Boolean(row.errors);
        compiled.push({
          id: `hb-${row.id}`,
          timestamp: new Date(row.started_at).toLocaleString(),
          category: 'PROTECTION',
          provider: row.provider ? row.provider.toUpperCase() : 'MONITOR',
          environment: row.environment ?? 'testnet',
          message: `Watchdog heartbeat cycle: ${row.monitor_status} (${row.positions_seen ?? 0} positions checked, ${row.protections_created ?? 0} protection attachments)`,
          receiptId: `HB-${row.id.slice(0, 8)}`,
          status: isError ? 'WARNING' : 'VERIFIED',
        });
      });

      // 4. Convert Trade Management Truth to EXECUTION / PROTECTION Events
      (truthPositionsRes.data ?? []).forEach((row: { provider: string; symbol: string; side: string; qty: number; protection_status?: string; latest_error?: string; latest_sync_at?: string }) => {
        const isMissingProt = row.protection_status === 'protection_failed' || row.protection_status === 'unprotected';
        if (isMissingProt) totalDrifts += 1;

        compiled.push({
          id: `pos-${row.provider}-${row.symbol}`,
          timestamp: row.latest_sync_at ? new Date(row.latest_sync_at).toLocaleString() : 'Just now',
          category: isMissingProt ? 'PROTECTION' : 'EXECUTION',
          provider: row.provider.toUpperCase(),
          environment: 'Live Ledger',
          message: `Active Position ${row.symbol} ${row.side} qty ${row.qty}: Protection State = ${row.protection_status ?? 'NORMAL'}${row.latest_error ? ` (${row.latest_error})` : ''}`,
          status: isMissingProt ? 'VIOLATION' : 'VERIFIED',
        });
      });

      // 5. Convert Signals to SIGNAL Events
      (signalsRes.data ?? []).forEach((row: { id: string; created_at: string; symbol: string; direction: string; strategy_name?: string; grade?: string; status: string }) => {
        compiled.push({
          id: `sig-${row.id}`,
          timestamp: new Date(row.created_at).toLocaleString(),
          category: 'SIGNAL',
          provider: 'Market Scanner',
          environment: 'Scanner',
          message: `Signal Generated: ${row.symbol} ${row.direction} Grade ${row.grade ?? 'B'} via ${row.strategy_name ?? 'ICT'}. Status: ${row.status}`,
          receiptId: `SIG-${row.id.slice(0, 8)}`,
          status: 'VERIFIED',
        });
      });

      // Sort all compiled events by timestamp descending
      compiled.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(compiled);
      setSummary({
        signalStatus: signalsRes.data?.length ? 'VERIFIED' : 'NO_DATA',
        executionStatus: truthPositionsRes.data?.length ? 'VERIFIED' : 'NO_ACTIVE_TRADES',
        protectionStatus: totalDrifts === 0 ? '100% NATIVE' : `${totalDrifts} DRIFTS`,
        driftCount: totalDrifts,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load telemetry truth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuntimeTelemetry();
  }, [loadRuntimeTelemetry]);

  const filtered = events.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (searchTerm && !e.message.toLowerCase().includes(searchTerm.toLowerCase()) && !e.provider.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Runtime Telemetry & Audit</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Runtime Telemetry & Command Receipts
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Verifiable ground truth for signals, execution orders, native protection, provider heartbeats, and audit receipts from real database logs.
            </p>
          </div>
          <button
            onClick={loadRuntimeTelemetry}
            disabled={loading}
            className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-xs font-sans transition disabled:opacity-50 self-start md:self-auto"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh Telemetry
          </button>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2 font-sans">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Truth Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <span className="text-xs text-zinc-400 uppercase block">Signal Truth</span>
            <div className="text-xl font-bold text-white mt-1 font-mono">{summary.signalStatus}</div>
            <span className="text-[10px] text-emerald-400 font-sans">Verified from signals table</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <span className="text-xs text-zinc-400 uppercase block">Execution Truth</span>
            <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">{summary.executionStatus}</div>
            <span className="text-[10px] text-emerald-500 font-sans">Trade management ledger</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <span className="text-xs text-zinc-400 uppercase block">Protection Truth</span>
            <div className={`text-xl font-bold mt-1 font-mono ${summary.driftCount === 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {summary.protectionStatus}
            </div>
            <span className="text-[10px] text-emerald-500 font-sans">Active watchdog checks</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <span className="text-xs text-zinc-400 uppercase block">Protection Drifts</span>
            <div className={`text-xl font-bold mt-1 font-mono ${summary.driftCount === 0 ? 'text-white' : 'text-red-400'}`}>
              {summary.driftCount}
            </div>
            <span className="text-[10px] text-zinc-500 font-sans">Unprotected position count</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-400 font-sans">Filter Category:</span>
            {(['all', 'SIGNAL', 'EXECUTION', 'PROTECTION', 'PROVIDER', 'AUDIT'] as const).map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-2.5 py-1 rounded text-xs uppercase font-medium transition ${
                  filterCategory === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search truth telemetry..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-60 font-sans"
          />
        </div>

        {/* Stream Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 text-xs text-zinc-300 font-bold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity size={14} className="text-emerald-400" />
              Verified Event Stream ({filtered.length})
            </span>
            <span className="text-zinc-500 font-normal font-sans">Database audit & execution receipts</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-zinc-500 font-sans">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-zinc-400" />
              Loading real runtime telemetry logs...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 font-sans">
              No matching runtime events found in system logs.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60 text-xs">
              {filtered.map(evt => (
                <div key={evt.id} className="p-4 space-y-1.5 hover:bg-zinc-800/40 transition">
                  <div className="flex items-center justify-between text-zinc-400 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        evt.category === 'SIGNAL' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        evt.category === 'EXECUTION' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        evt.category === 'PROTECTION' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        evt.category === 'PROVIDER' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}>
                        {evt.category}
                      </span>
                      <span className="text-white font-semibold">{evt.provider} ({evt.environment})</span>
                      <span className="text-zinc-500">• {evt.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {evt.receiptId && (
                        <span className="text-[11px] text-zinc-500 font-mono">Receipt: {evt.receiptId}</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        evt.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        evt.status === 'WARNING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                        'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {evt.status}
                      </span>
                    </div>
                  </div>

                  <p className="text-zinc-200 text-xs font-sans font-medium pl-1">
                    {evt.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
