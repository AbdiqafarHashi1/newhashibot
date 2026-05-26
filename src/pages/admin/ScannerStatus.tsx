import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { ScannerRun } from '../../lib/types';
import { statusBadge } from '../../components/ui/Badge';
import { AlertTriangle } from 'lucide-react';

export default function ScannerStatus() {
  const [runs, setRuns] = useState<ScannerRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('scanner_runs').select('*').order('started_at', { ascending: false }).limit(50)
      .then(({ data }) => { setRuns(data ?? []); setLoading(false); });
  }, []);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scanner Status</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Full history of scanner execution runs</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No scanner runs yet. Use the Control Room to run the scanner.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-5 py-3">Started</th>
                <th className="text-left px-5 py-3">Finished</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Symbols</th>
                <th className="text-left px-5 py-3">Candles</th>
                <th className="text-left px-5 py-3">Candidates</th>
                <th className="text-left px-5 py-3">Signals</th>
                <th className="text-left px-5 py-3">Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-5 py-3 text-zinc-400">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-zinc-500">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                  <td className="px-5 py-3">{statusBadge(r.status)}</td>
                  <td className="px-5 py-3 text-zinc-300">{r.symbols_scanned}</td>
                  <td className="px-5 py-3 text-zinc-300">{r.candles_fetched}</td>
                  <td className="px-5 py-3 text-zinc-300">{r.candidates_found}</td>
                  <td className="px-5 py-3 text-zinc-300">{r.signals_created}</td>
                  <td className="px-5 py-3">
                    {r.error_message ? (
                      <div className="flex items-center gap-1 text-red-400 text-xs">
                        <AlertTriangle size={11} />
                        <span className="truncate max-w-[200px]">{r.error_message}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
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
