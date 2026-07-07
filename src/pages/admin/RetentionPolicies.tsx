import { useState, useEffect, useCallback } from 'react';
import { Trash2, AlertTriangle, CheckCircle, Database, Loader2 } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getRetentionReport, runRetentionDryRun, runRetentionCleanup, type RetentionReportRow } from '../../lib/hashibotBackend';

export default function RetentionPolicies() {
  const [report, setReport] = useState<RetentionReportRow[]>([]);
  const [dryRun, setDryRun] = useState<Record<string, unknown>[]>([]);
  const [cleanupResult, setCleanupResult] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRetentionReport();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retention report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDryRun() {
    setActionLoading(true);
    try {
      const data = await runRetentionDryRun();
      setDryRun(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dry run failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCleanup() {
    if (!confirm('Run retention cleanup? This will permanently delete expired rows. Protected tables are safe.')) return;
    setActionLoading(true);
    try {
      const data = await runRetentionCleanup();
      setCleanupResult(data);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setActionLoading(false);
    }
  }

  const totalRows = report.reduce((sum, r) => sum + (r.total_rows ?? 0), 0);
  const expiredRows = report.reduce((sum, r) => sum + (r.expired_rows ?? 0), 0);
  const protectedCount = report.filter((r) => r.is_protected).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Trash2 size={24} className="text-blue-400" />
            Retention Policies
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Manage data retention and cleanup. Protected tables are never deleted.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Rows</div>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{totalRows.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Expired Rows</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{expiredRows.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Protected Tables</div>
            <div className="text-2xl font-bold text-green-400 mt-1">{protectedCount}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDryRun}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            Dry Run
          </button>
          <button
            onClick={handleCleanup}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Run Cleanup
          </button>
        </div>

        {dryRun.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-100 mb-3">Dry Run Results</h3>
            <div className="space-y-2">
              {dryRun.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{String(row.table_name)}</span>
                  <span className="text-orange-400">{Number(row.estimated_rows).toLocaleString()} rows would be {String(row.cleanup_action)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cleanupResult.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-green-400 mb-3">Cleanup Results</h3>
            <div className="space-y-2">
              {cleanupResult.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{String(row.table_name)}</span>
                  <span className="text-green-400">{Number(row.rows_affected).toLocaleString()} rows {String(row.action_taken)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : report.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <AlertTriangle size={32} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No retention policies configured.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Table</th>
                  <th className="text-left px-4 py-3">Retention</th>
                  <th className="text-right px-4 py-3">Total Rows</th>
                  <th className="text-right px-4 py-3">Expired</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr key={row.table_name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-100 font-medium">{row.display_name}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {row.is_protected ? 'Protected' : `${row.retention_days} days`}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{row.total_rows.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {row.expired_rows > 0 ? (
                        <span className="text-orange-400">{row.expired_rows.toLocaleString()}</span>
                      ) : (
                        <span className="text-zinc-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.is_protected ? (
                        <CheckCircle size={16} className="text-green-400 mx-auto" />
                      ) : row.is_enabled ? (
                        <CheckCircle size={16} className="text-blue-400 mx-auto" />
                      ) : (
                        <AlertTriangle size={16} className="text-zinc-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {row.last_run_at ? new Date(row.last_run_at).toLocaleString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
