import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { TelegramDelivery } from '../../lib/types';
import { statusBadge } from '../../components/ui/Badge';

export default function TelegramLogs() {
  const [logs, setLogs] = useState<TelegramDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('telegram_deliveries').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false); });
  }, []);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Telegram Delivery Logs</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{logs.length} delivery records</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No Telegram deliveries yet. Use Signals Manager to send a signal.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Chat ID</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">TG Message ID</th>
                <th className="text-left px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-zinc-400 capitalize">{l.delivery_type}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">{l.chat_id}</td>
                  <td className="px-4 py-3">{statusBadge(l.status)}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">{l.telegram_message_id || '—'}</td>
                  <td className="px-4 py-3 text-red-400">{l.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
