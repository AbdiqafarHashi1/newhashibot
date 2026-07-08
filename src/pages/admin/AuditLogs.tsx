import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getAuditLogs } from '../../lib/hashibotBackend';
import { AuditLog } from '../../lib/types';

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLogs(50)
      .then((data) => { setLogs(data as AuditLog[]); setLoading(false); })
      .catch((err) => { console.error(err); setLoading(false); });
  }, []);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-zinc-500 mt-0.5">All admin actions and system events</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No audit logs yet.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Entity</th>
                <th className="text-left px-4 py-3">Entity ID</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-zinc-200">{l.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-zinc-500">{l.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600 text-xs">{l.entity_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">
                    <code className="text-xs">{JSON.stringify(l.metadata).slice(0, 80)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
