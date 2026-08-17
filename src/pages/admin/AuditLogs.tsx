import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { getAuditLogs } from '../../lib/hashibotBackend';
import { AuditLog } from '../../lib/types';
import { 
  ClipboardList, Activity, RefreshCw, Search, ShieldCheck, 
  AlertTriangle, Layers, Cpu, CreditCard, Shield, CheckCircle2
} from 'lucide-react';


type AuditTab = 'pipeline' | 'operator_actions' | 'runtime_events';

interface OperationalPipelineRow {
  id: string;
  signal_id?: string | null;
  symbol: string;
  direction: string;
  status: string;
  provider?: string | null;
  account_id?: string | null;
  entry_price?: number | null;
  unrealized_pnl?: number | null;
  protection_status?: string | null;
  latest_error?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface RuntimeEventRow {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  correlation_id?: string | null;
  context_data?: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditLogs() {
  const [tab, setTab] = useState<AuditTab>('pipeline');
  const [operatorLogs, setOperatorLogs] = useState<AuditLog[]>([]);
  const [pipelineRows, setPipelineRows] = useState<OperationalPipelineRow[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    try {
      const [logs, tmRes, evRes] = await Promise.all([
        getAuditLogs(100).catch(() => []),
        supabase.from('trade_management_truth').select('*').order('latest_sync_at', { ascending: false }).limit(100),
        supabase.from('operator_runtime_events').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      setOperatorLogs(logs as AuditLog[]);
      setPipelineRows((tmRes.data ?? []) as OperationalPipelineRow[]);
      setRuntimeEvents((evRes.data ?? []) as RuntimeEventRow[]);
    } catch (err) {
      console.error('Failed to load audit data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuditData();
  }, [fetchAuditData]);

  const filteredOperatorLogs = operatorLogs.filter(l => 
    (l.action ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.entity_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.entity_id ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredPipelineRows = pipelineRows.filter(p =>
    (p.symbol ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.provider ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.status ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredRuntimeEvents = runtimeEvents.filter(e => {
    const matchesSearch = (e.event_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.message ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.correlation_id ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || e.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400">Governance & Traceability / Operations Audit</div>
            <h1 className="mt-1 text-2xl font-bold text-white">System Audit & Operational Pipeline Traceability</h1>
            <p className="mt-1 max-w-3xl font-sans text-sm text-zinc-400">
              End-to-end operational lineage tracking from Signal generation through Arbitrator, Risk, Capital, Execution, Trade Management, Trade Truth, and Recovery.
            </p>
          </div>
          <button 
            onClick={() => void fetchAuditData()} 
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh Audit Data
          </button>
        </header>

        {/* Pipeline Architecture Banner */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold">Canonical Pipeline Lineage Architecture</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 text-center text-xs font-sans">
            {[
              { name: '1. Signal', desc: 'Scanner / Strategy', icon: Activity, color: 'border-blue-500/30 text-blue-400' },
              { name: '2. Arbitrator', desc: 'Filter & Score', icon: Cpu, color: 'border-indigo-500/30 text-indigo-400' },
              { name: '3. Risk', desc: 'Rule Validation', icon: Shield, color: 'border-purple-500/30 text-purple-400' },
              { name: '4. Capital', desc: 'Sizing & Margin', icon: CreditCard, color: 'border-cyan-500/30 text-cyan-400' },
              { name: '5. Execution', desc: 'Exchange Dispatch', icon: Layers, color: 'border-emerald-500/30 text-emerald-400' },
              { name: '6. Trade Mgr', desc: 'Lifecycle & SL/TP', icon: ShieldCheck, color: 'border-amber-500/30 text-amber-400' },
              { name: '7. Trade Truth', desc: 'Unified State', icon: CheckCircle2, color: 'border-emerald-400/30 text-emerald-300' },
              { name: '8. Recovery', desc: 'Self-Healing', icon: AlertTriangle, color: 'border-rose-500/30 text-rose-400' },
              { name: '9. Closure', desc: 'Settlement Archive', icon: ClipboardList, color: 'border-zinc-500/30 text-zinc-400' },
            ].map((step, idx) => (
              <div key={idx} className={`p-2 rounded-lg border bg-zinc-950/60 ${step.color} flex flex-col items-center justify-center gap-1`}>
                <step.icon size={14} />
                <div className="font-semibold text-[11px] truncate w-full">{step.name}</div>
                <div className="text-[10px] text-zinc-500 truncate w-full">{step.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Tab Controls & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'pipeline', label: 'Operational Pipeline Trail', count: pipelineRows.length },
              { id: 'operator_actions', label: 'Operator Actions Audit', count: operatorLogs.length },
              { id: 'runtime_events', label: 'Runtime Events & Receipts', count: runtimeEvents.length },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as AuditTab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
                  tab === t.id ? 'bg-blue-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search audit records..."
                className="rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
              />
            </div>
            {tab === 'runtime_events' && (
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300"
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            )}
          </div>
        </div>

        {/* Tab 1: Operational Pipeline Trail */}
        {tab === 'pipeline' && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-zinc-500">Loading operational pipeline audit trail...</div>
            ) : filteredPipelineRows.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">No operational pipeline records match search.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 bg-zinc-950/50">
                      <th className="px-4 py-3">Symbol / Side</th>
                      <th className="px-4 py-3">Provider / Account</th>
                      <th className="px-4 py-3">Status / Stage</th>
                      <th className="px-4 py-3">Protection</th>
                      <th className="px-4 py-3">Entry / PnL</th>
                      <th className="px-4 py-3">Latest Error / Diagnostics</th>
                      <th className="px-4 py-3">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 font-sans">
                    {filteredPipelineRows.map(row => (
                      <tr key={row.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 font-mono">
                          <div className="font-bold text-white">{row.symbol}</div>
                          <div className={`text-[10px] font-semibold uppercase ${row.direction?.toLowerCase() === 'buy' || row.direction?.toLowerCase() === 'long' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {row.direction || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-zinc-200 capitalize font-mono">{row.provider || 'system'}</div>
                          <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">{row.account_id || 'default'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className="inline-block rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300 capitalize">
                            {(row.status ?? 'unknown').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                            row.protection_status === 'PROTECTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' :
                            row.protection_status === 'PROTECTION_FAILED' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' :
                            'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                          }`}>
                            {row.protection_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <div className="text-zinc-300">{row.entry_price ? `$${row.entry_price.toLocaleString()}` : '—'}</div>
                          <div className={`text-[10px] ${(row.unrealized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {row.unrealized_pnl != null ? `$${row.unrealized_pnl.toFixed(2)}` : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                          {row.latest_error ? (
                            <span className="text-rose-400 flex items-center gap-1">
                              <AlertTriangle size={12} className="shrink-0" />
                              <span className="truncate">{row.latest_error}</span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-[11px] font-mono">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Operator Actions Audit */}
        {tab === 'operator_actions' && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-zinc-500">Loading operator action audit logs...</div>
            ) : filteredOperatorLogs.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">No operator audit logs match search.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 bg-zinc-950/50">
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Entity Type</th>
                      <th className="px-4 py-3">Entity ID</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {filteredOperatorLogs.map(l => (
                      <tr key={l.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-400 font-mono">{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 font-medium text-zinc-200 capitalize font-mono">{(l.action ?? 'unknown').replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-zinc-400 font-mono">{l.entity_type || '—'}</td>
                        <td className="px-4 py-3 font-mono text-zinc-500 text-xs">{l.entity_id ? `${l.entity_id.slice(0, 12)}…` : '—'}</td>
                        <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell font-mono max-w-md truncate">
                          <code>{JSON.stringify(l.metadata)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Runtime Events & Receipts */}
        {tab === 'runtime_events' && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-zinc-500">Loading runtime events & receipts...</div>
            ) : filteredRuntimeEvents.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">No runtime events match criteria.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 bg-zinc-950/50">
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Event Type</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Correlation ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 font-sans">
                    {filteredRuntimeEvents.map(e => (
                      <tr key={e.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-400 font-mono whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            e.severity === 'error' || e.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            e.severity === 'warning' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {e.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-200 font-semibold">{e.event_type}</td>
                        <td className="px-4 py-3 text-zinc-300 max-w-md truncate">{e.message}</td>
                        <td className="px-4 py-3 font-mono text-zinc-500 text-[11px] truncate max-w-[140px]">
                          {e.correlation_id || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

