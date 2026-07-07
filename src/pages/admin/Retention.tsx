import { useCallback, useEffect, useState } from 'react';
import { Archive, Database, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { executeRetentionCleanup, getRetentionReport, getRuntimeHealthSummary, previewRetentionCleanup, type RetentionCleanupResult, type RuntimeHealthSummary } from '../../lib/hashibotBackend';

function fmt(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /T|Z/.test(value)) return new Date(value).toLocaleString();
  return String(value);
}

export default function Retention() {
  const [report, setReport] = useState<RetentionCleanupResult | null>(null);
  const [preview, setPreview] = useState<RetentionCleanupResult | null>(null);
  const [health, setHealth] = useState<RuntimeHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [retention, runtime] = await Promise.all([getRetentionReport(), getRuntimeHealthSummary()]);
      setReport(retention);
      setPreview(null);
      setHealth(runtime);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retention dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runPreview() {
    setWorking(true);
    setError('');
    try { setPreview(await previewRetentionCleanup()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setWorking(false); }
  }

  async function runCleanup() {
    if (!window.confirm('Archive and delete expired non-critical rows now? Business-critical records are excluded by policy.')) return;
    setWorking(true);
    setError('');
    try {
      const result = await executeRetentionCleanup({ archive: true });
      setPreview(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setWorking(false);
    }
  }

  const active = preview ?? report;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Platform Retention</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Bounded storage, cleanup preview, archive-safe deletion, and compact runtime health for V1 production.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading || working} className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-2 rounded-lg text-xs disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button onClick={runPreview} disabled={loading || working} className="inline-flex items-center gap-2 border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/15 text-blue-200 px-3 py-2 rounded-lg text-xs disabled:opacity-50"><Archive size={13} /> Dry run</button>
          <button onClick={runCleanup} disabled={loading || working || !active?.totals.matched} className="inline-flex items-center gap-2 border border-red-500/40 bg-red-500/10 hover:bg-red-500/15 text-red-200 px-3 py-2 rounded-lg text-xs disabled:opacity-50"><Trash2 size={13} /> Execute cleanup</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="text-xs text-zinc-500 uppercase tracking-wider">Expired rows</div><div className="text-2xl font-bold text-zinc-100 mt-1">{active?.totals.matched ?? '—'}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="text-xs text-zinc-500 uppercase tracking-wider">Archived last run</div><div className="text-2xl font-bold text-emerald-300 mt-1">{active?.totals.archived ?? '—'}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="text-xs text-zinc-500 uppercase tracking-wider">Deleted last run</div><div className="text-2xl font-bold text-red-300 mt-1">{active?.totals.deleted ?? '—'}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="text-xs text-zinc-500 uppercase tracking-wider">Queue health</div><div className="text-2xl font-bold text-blue-300 mt-1">{fmt(health?.queues?.active_commands)}</div></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="flex items-center gap-2 text-sm font-semibold mb-3"><ShieldCheck size={15} className="text-emerald-400" /> Scanner health</div><pre className="text-xs text-zinc-400 overflow-auto whitespace-pre-wrap">{JSON.stringify(health?.scanner ?? {}, null, 2)}</pre></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="flex items-center gap-2 text-sm font-semibold mb-3"><ShieldCheck size={15} className="text-blue-400" /> Execution health</div><pre className="text-xs text-zinc-400 overflow-auto whitespace-pre-wrap">{JSON.stringify(health?.execution ?? {}, null, 2)}</pre></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="flex items-center gap-2 text-sm font-semibold mb-3"><Database size={15} className="text-purple-400" /> Provider health</div><pre className="text-xs text-zinc-400 overflow-auto whitespace-pre-wrap">{JSON.stringify(health?.providers ?? [], null, 2)}</pre></div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800"><h2 className="font-semibold">Retention policies</h2><p className="text-xs text-zinc-500 mt-1">Users, subscriptions, packages, active trades/signals, credentials, Telegram links, strategy configs, and audit records are intentionally absent.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/60 text-xs uppercase tracking-wider text-zinc-500"><tr><th className="text-left p-3">Table</th><th className="text-left p-3">Column</th><th className="text-left p-3">Days</th><th className="text-left p-3">Cutoff</th><th className="text-right p-3">Expired</th><th className="text-right p-3">Archived</th><th className="text-right p-3">Deleted</th></tr></thead>
            <tbody>
              {(active?.targets ?? []).map(row => <tr key={row.table_name} className="border-t border-zinc-800/70"><td className="p-3 font-mono text-zinc-200">{row.table_name}</td><td className="p-3 text-zinc-400">{row.timestamp_column}</td><td className="p-3 text-zinc-400">{row.retention_days}</td><td className="p-3 text-zinc-500">{fmt(row.cutoff_at)}</td><td className="p-3 text-right text-zinc-200">{row.rows_matched}</td><td className="p-3 text-right text-emerald-300">{row.rows_archived}</td><td className="p-3 text-right text-red-300">{row.rows_deleted}</td></tr>)}
              {!loading && (active?.targets.length ?? 0) === 0 && <tr><td className="p-6 text-center text-zinc-500" colSpan={7}>No retention targets returned.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
