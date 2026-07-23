import { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, CheckCircle2, Wrench, RefreshCw, AlertTriangle, Inbox
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

type ProtectionRecord = {
  id: string;
  provider?: string | null;
  environment?: string | null;
  scope?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  symbol: string;
  side?: string | null;
  direction?: string | null;
  protection_status?: string | null;
  sl_order_id?: string | null;
  tp1_order_id?: string | null;
  tp2_order_id?: string | null;
  latest_error?: string | null;
  latest_sync_at?: string | null;
};

export default function Protection() {
  const [records, setRecords] = useState<ProtectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const fetchTruth = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from('trade_management_truth')
        .select('*')
        .order('latest_sync_at', { ascending: false });

      if (error) {
        setFetchError(error.message);
      } else {
        setRecords((data ?? []) as ProtectionRecord[]);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to query protection truth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTruth();
    const interval = setInterval(() => void fetchTruth(), 15000);
    return () => clearInterval(interval);
  }, [fetchTruth]);

  const handleRepairAll = async () => {
    setActionPending(true);
    setActionNotice('Dispatched auto-repair command to native exchange protection monitors...');
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'repair_protection_now', provider: 'all' }
      });
      if (error) {
        setActionNotice(`Auto-repair failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Repair error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice('Native Stop-Loss & Take-Profit auto-repair sequence completed.');
        await fetchTruth();
      }
    } catch (err) {
      setActionNotice(`Repair exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleRepairRecord = async (provider?: string | null) => {
    setActionPending(true);
    setActionNotice(`Repairing native protection for ${provider || 'provider'}...`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'repair_protection_now', provider: provider || 'all' }
      });
      if (error) {
        setActionNotice(`Repair failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Repair error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice('Protection order attachment executed.');
        await fetchTruth();
      }
    } catch (err) {
      setActionNotice(`Repair exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Protection Center</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Native Exchange & Broker Protection Engine
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Verification center ensuring 100% native Stop-Loss and Take-Profit attachment verified from <code className="text-zinc-300 font-mono">trade_management_truth</code>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={actionPending}
              onClick={handleRepairAll}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              <Wrench size={14} /> Auto-Repair Unprotected
            </button>
            <button
              disabled={actionPending}
              onClick={() => void fetchTruth()}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {actionNotice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-center gap-2 font-sans">
            <CheckCircle2 size={16} />
            <span>{actionNotice}</span>
          </div>
        )}

        {fetchError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 flex items-center gap-2 font-sans">
            <AlertTriangle size={16} />
            <span>{fetchError}</span>
          </div>
        )}

        {/* Protection Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-300">Native Protection Ledger ({records.length})</span>
            <span className="text-zinc-500 font-sans">Database Truth Ledger</span>
          </div>

          {loading && records.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-sans">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-400" />
              <span>Fetching protection ledger truth...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center font-sans space-y-2">
              <Inbox size={32} className="mx-auto text-zinc-600" />
              <div className="text-sm font-semibold text-zinc-300">NO_DATA / UNCONFIGURED</div>
              <p className="text-xs text-zinc-500">
                No active position protection records found in database ledger.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="p-3">Position</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Native Stop-Loss</th>
                    <th className="p-3">Native Take-Profit</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Last Verified</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {records.map(rec => {
                    const status = rec.protection_status || 'unprotected';
                    const isProtected = status === 'protected_native' || status === 'protected';
                    const side = (rec.side || rec.direction || 'BUY').toUpperCase();
                    const lastSync = rec.latest_sync_at ? `${Math.round((Date.now() - new Date(rec.latest_sync_at).getTime()) / 1000)}s ago` : 'Unknown';

                    return (
                      <tr key={rec.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-3 font-bold text-white">
                          {rec.symbol} ({side})
                          <div className="text-[10px] text-zinc-500">{rec.provider || 'UNKNOWN'} • {rec.environment || rec.scope || 'Live'}</div>
                        </td>
                        <td className="p-3 text-zinc-300">{rec.account_name || rec.account_id || 'Primary Account'}</td>
                        <td className="p-3 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            rec.sl_order_id ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                          }`}>
                            {rec.sl_order_id ? 'ATTACHED_NATIVE' : 'MISSING'}
                          </span>
                          {rec.sl_order_id && (
                            <div className="text-[10px] text-zinc-500 font-mono">ID: {rec.sl_order_id}</div>
                          )}
                        </td>
                        <td className="p-3 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            rec.tp1_order_id ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-800'
                          }`}>
                            {rec.tp1_order_id ? 'ATTACHED_NATIVE' : 'UNSET'}
                          </span>
                          {rec.tp1_order_id && (
                            <div className="text-[10px] text-zinc-500 font-mono">ID: {rec.tp1_order_id}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                            isProtected
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            <ShieldCheck size={11} className="inline mr-1" />
                            {status}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-400">{lastSync}</td>
                        <td className="p-3">
                          {!isProtected && (
                            <button
                              disabled={actionPending}
                              onClick={() => handleRepairRecord(rec.provider)}
                              className="px-2.5 py-1 rounded bg-amber-600 text-white font-semibold text-[10px] hover:bg-amber-500 transition disabled:opacity-50"
                            >
                              Attach SL
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
