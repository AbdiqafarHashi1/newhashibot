import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { listScannerRunsCompact } from '../../lib/hashibotBackend';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLiveState } from '../../hooks/useAdminLiveState';
import { SchedulerProofDebug } from '../../components/admin/SchedulerProofDebug';
import { ScannerRun } from '../../lib/types';
import { statusBadge } from '../../components/ui/Badge';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';

type ScannerRunWithOutcome = ScannerRun & {
  outcome_checked?: boolean | null;
  outcomes_updated?: number | null;
  outcome_telegram_sent?: number | null;
  outcome_telegram_skipped?: number | null;
  outcome_telegram_failed?: number | null;
};

function isHistoricalForexWarning(message?: string | null) {
  if (!message) return false;
  return /forex|finnhub|twelvedata|oanda|mt5|demo/i.test(message);
}

export default function ScannerStatus() {
  const { session } = useAuth();
  const { state, refresh } = useAdminLiveState(session);
  const [runs, setRuns] = useState<ScannerRunWithOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [runFilter, setRunFilter] = useState<'all' | 'manual' | 'scheduled'>('all');
  const loadSeq = useRef(0);

  const loadRuns = useCallback(async () => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setLoading(true);
    const data = await listScannerRunsCompact(50);
    if (seq !== loadSeq.current) return;
    setRuns(data as ScannerRunWithOutcome[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRuns();
    const id = window.setInterval(() => { void loadRuns(); }, 45_000);
    return () => {
      loadSeq.current += 1;
      window.clearInterval(id);
    };
  }, [loadRuns]);

  const latestManualRun = state.latestManualRun as ScannerRunWithOutcome | null;
  const latestScheduledRun = state.latestScheduledRun as ScannerRunWithOutcome | null;
  const scheduledRows = state.recentScheduledRuns as ScannerRunWithOutcome[];
  const filteredRuns = runFilter === 'scheduled'
    ? scheduledRows
    : runs.filter(r => runFilter === 'all' || (r.run_type ?? 'manual').toLowerCase() === runFilter);
  const scheduledAgeMinutes = state.lastScheduledRunAgeMinutes;
  const scheduledFresh = state.cronProven;
  const scheduledLabel = state.schedulerProof.label;
  const recentScheduled30m = scheduledRows.filter(r => (Date.now() - new Date(r.started_at).getTime()) <= 30 * 60000).length;
  const latestRun = state.latestRun ?? runs[0] ?? null;
  const loadingAny = loading || state.loading;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Scanner Status</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Crypto-only scanner run history, Telegram proof, and historical warning context</p>
        </div>
        <button onClick={async () => { await Promise.all([refresh(), loadRuns()]); }} disabled={loadingAny}
          className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={loadingAny ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <SchedulerProofDebug state={state} />

      {!loadingAny && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Latest manual run</div>
            <div className="text-sm text-zinc-200">{latestManualRun ? new Date(latestManualRun.started_at).toLocaleString() : '—'}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Latest scheduled run</div>
            <div className="text-sm text-zinc-200">{latestScheduledRun ? new Date(latestScheduledRun.started_at).toLocaleString() : '—'}</div>
            {scheduledAgeMinutes !== null && <div className="text-xs text-zinc-600 mt-1">Age: {scheduledAgeMinutes}m</div>}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Scheduled proof</div>
            <div className={`text-sm font-semibold ${scheduledFresh ? 'text-emerald-400' : latestScheduledRun ? 'text-yellow-400' : 'text-zinc-500'}`}>{scheduledLabel}</div>
            <div className="text-xs text-zinc-600 mt-1">{state.cronReason}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Scheduled last 30m</div>
            <div className="text-sm font-semibold text-emerald-400">{recentScheduled30m}</div>
            <div className="text-xs text-zinc-600 mt-1">0-signal scheduled runs count as proof.</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Latest Telegram S/K/F</div>
            <div className="text-sm font-semibold text-zinc-200">{latestRun ? `${latestRun.telegram_sent_count ?? 0}/${latestRun.telegram_blocked_count ?? 0}/${latestRun.telegram_failed_count ?? 0}` : '—'}</div>
          </div>
          <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Latest outcome</div>
            <div className="text-sm font-semibold text-blue-400">{latestRun ? `${typeof latestRun.outcome_checked === 'boolean' ? (latestRun.outcome_checked ? 'checked' : 'not checked') : 'unknown'} / ${latestRun.outcomes_updated ?? 0} updated` : '—'}</div>
            <div className="text-xs text-zinc-600 mt-1">Forex warnings are historical in crypto-only MVP.</div>
          </div>
        </div>
      )}

      {loadingAny ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : runs.length === 0 && scheduledRows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No scanner runs yet. Use the Control Room to run the scanner.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-2">
            {(['all', 'manual', 'scheduled'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setRunFilter(filter)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${runFilter === filter ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-500">Showing {filteredRuns.length} {runFilter === 'scheduled' ? 'direct scheduled' : `of ${runs.length}`} runs</span>
          </div>
          {filteredRuns.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">No {runFilter} scanner runs found.</div>
          ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-5 py-3">Started</th>
                <th className="text-left px-5 py-3">Finished</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Type</th>
                <th className="text-left px-5 py-3">Symbols</th>
                <th className="text-left px-5 py-3">Signals</th>
                <th className="text-left px-5 py-3">TG Sent / Skipped / Failed</th>
                <th className="text-left px-5 py-3">Outcome Checked</th>
                <th className="text-left px-5 py-3">Outcomes Updated</th>
                <th className="text-left px-5 py-3">Outcome TG S / K / F</th>
                <th className="text-left px-5 py-3">Warnings / Errors</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map(r => {
                const forexWarning = isHistoricalForexWarning(r.error_message);
                return (
                  <tr key={r.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${r.run_type === 'scheduled' ? 'bg-emerald-500/[0.03]' : ''}` }>
                    <td className="px-5 py-3 text-zinc-400">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-zinc-500">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                    <td className="px-5 py-3">{statusBadge(r.status)}</td>
                    <td className="px-5 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${r.run_type === 'scheduled' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}><Clock size={10} /> {r.run_type ?? 'manual'}</span></td>
                    <td className="px-5 py-3 text-zinc-300">{r.symbols_scanned}</td>
                    <td className="px-5 py-3 text-zinc-300">{r.signals_created}</td>
                    <td className="px-5 py-3 text-zinc-300">{r.telegram_sent_count ?? 0} / {r.telegram_blocked_count ?? 0} / {r.telegram_failed_count ?? 0}</td>
                    <td className="px-5 py-3 text-zinc-400">{typeof r.outcome_checked === 'boolean' ? (r.outcome_checked ? 'yes' : 'no') : 'wrapper response only'}</td>
                    <td className="px-5 py-3 text-zinc-400">{r.outcomes_updated ?? '—'}</td>
                    <td className="px-5 py-3 text-zinc-400">{r.outcome_telegram_sent ?? '—'} / {r.outcome_telegram_skipped ?? '—'} / {r.outcome_telegram_failed ?? '—'}</td>
                    <td className="px-5 py-3">
                      {r.error_message ? (
                        <div className={`flex items-start gap-1 text-xs ${forexWarning ? 'text-zinc-500' : 'text-red-400'}`}>
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          <span className="max-w-[260px] break-words">{forexWarning ? <span className="inline-flex rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 mr-1">historical forex warning ignored</span> : null}{forexWarning ? '' : r.error_message}</span>
                        </div>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
