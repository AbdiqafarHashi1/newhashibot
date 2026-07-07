import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { getTelegramDeliveriesCompact } from '../../lib/hashibotBackend';
import { statusBadge, Badge } from '../../components/ui/Badge';

function deliveryFamily(type: string) {
  if (type.startsWith('outcome_')) return 'Outcome update';
  if (['auto_signal', 'signal', 'initial_signal'].includes(type)) return 'Initial signal';
  if (type.includes('brief') || type.includes('digest') || type.includes('watchlist') || type.includes('wrap') || type.includes('pattern')) return 'Intelligence';
  if (type.startsWith('admin_') || type.includes('failure') || type.includes('critical')) return 'Admin alert';
  if (type.startsWith('execution_') || type.startsWith('binance_testnet_')) return 'Execution';
  return 'Other';
}

export default function TelegramLogs() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getTelegramDeliveriesCompact(150, 0);
        setLogs(data);
      } catch (e) {
        setWarning(e instanceof Error ? e.message : 'Telegram logs failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const initialCount = logs.filter(l => deliveryFamily(String(l.delivery_type ?? '')) === 'Initial signal').length;
  const outcomeCount = logs.filter(l => deliveryFamily(String(l.delivery_type ?? '')) === 'Outcome update').length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Telegram Delivery Logs</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{logs.length} records · {initialCount} initial · {outcomeCount} outcome</p>
      </div>

      {warning && <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-yellow-300">{warning}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No Telegram deliveries yet. Initial signal and outcome delivery proof will appear here.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Family</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Channel</th>
                <th className="text-left px-4 py-3">Signal/Event</th>
                <th className="text-left px-4 py-3">Chat ID</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Reason / Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const family = deliveryFamily(String(l.delivery_type ?? ''));
                const status = String(l.delivery_status ?? l.status ?? '');
                return (
                  <tr key={String(l.id)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-400">{new Date(String(l.created_at)).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge variant={family === 'Outcome update' ? 'green' : family === 'Initial signal' ? 'blue' : 'gray'}>{family}</Badge></td>
                    <td className="px-4 py-3 text-zinc-400">{String(l.delivery_type ?? '')}</td>
                    <td className="px-4 py-3 text-zinc-400 uppercase">{String(l.destination_channel ?? 'vip')}</td>
                    <td className="px-4 py-3 font-mono text-zinc-500">{String(l.signal_id ?? '').slice(0, 8) || '—'}</td>
                    <td className="px-4 py-3 font-mono text-zinc-500">{String(l.chat_id ?? '')}</td>
                    <td className="px-4 py-3">{statusBadge(status)}</td>
                    <td className={status === 'failed' ? 'px-4 py-3 text-red-400' : status === 'skipped' ? 'px-4 py-3 text-yellow-400' : 'px-4 py-3 text-zinc-500'}>{String(l.error_message ?? '') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
