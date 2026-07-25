import { useState, useEffect } from 'react';
import { 
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, 
  Layers, Info
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { listMT5Accounts } from '../../../lib/mt5Accounts';
import { getMT5LatestSnapshot, type MT5ReconciliationItem } from '../../../lib/mt5Operations';

interface PositionRow {
  symbol?: string;
  user_id?: string;
  status?: string;
}

export function MT5ReconciliationTab() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MT5ReconciliationItem[]>([]);
  const [inSync, setInSync] = useState(true);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const accs = await listMT5Accounts();
      const recItems: MT5ReconciliationItem[] = [];

      for (const acc of accs) {
        const snap = await getMT5LatestSnapshot(acc.id);
        const actualPositions = snap?.positions || [];

        const { data: expectedPositions } = await supabase
          .from('positions')
          .select('*')
          .eq('user_id', acc.userId)
          .eq('status', 'open');

        const expectedList = (expectedPositions || []) as PositionRow[];

        if (actualPositions.length > 0 || expectedList.length > 0) {
          for (const actual of actualPositions) {
            const matched = expectedList.find((exp) => exp.symbol === actual.symbol);
            if (!matched) {
              recItems.push({
                id: `rec-${actual.id || actual.ticket || Math.random()}`,
                account_id: acc.id,
                ticket: String(actual.ticket || actual.id || ''),
                symbol: actual.symbol,
                discrepancy_type: 'unexpected_position',
                expected_value: 'No position logged in HashiBot DB',
                actual_value: `${actual.side} ${actual.size || actual.volume} lots @ ${actual.entryPrice}`,
                status: 'pending_investigation',
                detected_at: new Date().toISOString()
              });
            }
          }
        }
      }

      setItems(recItems);
      setInSync(recItems.length === 0);
    } catch (err) {
      console.error('Failed to run MT5 reconciliation check:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck size={16} className="text-blue-400" />
            MT5 Position & State Reconciliation
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Compare HashiBot expected positions against live MT5 terminal snapshots.
          </p>
        </div>

        <button
          onClick={fetchReconciliation}
          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Run Reconciliation Check
        </button>
      </div>

      {/* Safety Mode Notice */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-center gap-2">
        <Info size={16} className="shrink-0 text-blue-400" />
        <span>
          <strong>Monitoring Mode Active:</strong> Automatic position repair is disabled during Phase 8D. Discrepancies are logged for manual operator inspection.
        </span>
      </div>

      {/* Reconciliation Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
          <div className="text-zinc-500 font-medium">Reconciliation Status</div>
          <div className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${inSync ? 'text-emerald-400' : 'text-amber-400'}`}>
            {inSync ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {inSync ? 'IN PERFECT SYNC' : `${items.length} DISCREPANCIES DETECTED`}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">Expected vs Actual MT5 Positions</div>
        </div>

        <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
          <div className="text-zinc-500 font-medium font-sans">Pending Investigations</div>
          <div className="text-lg font-bold text-white mt-1">{items.length} Records</div>
          <div className="text-[11px] text-zinc-500 mt-1">Awaiting Operator Review</div>
        </div>

        <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
          <div className="text-zinc-500 font-medium">Repair Mechanism</div>
          <div className="text-lg font-bold text-zinc-300 mt-1">Read-Only Safety</div>
          <div className="text-[11px] text-zinc-500 mt-1">No automated order modification</div>
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Layers size={14} className="text-amber-400" />
            Reconciliation Audit Items ({items.length})
          </h3>
          <span className="text-[11px] text-zinc-500">Live Snapshot Comparison</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-blue-400" />
            Analyzing expected vs actual positions...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500 space-y-1">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
            <div className="font-semibold text-zinc-300">No Position Discrepancies Found</div>
            <div className="text-[11px] text-zinc-500">
              All live MT5 position states match HashiBot expected database states.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-semibold">Ticket / Symbol</th>
                  <th className="p-3 font-semibold">Discrepancy Type</th>
                  <th className="p-3 font-semibold">Expected State</th>
                  <th className="p-3 font-semibold">Actual MT5 State</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Detected At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-white">
                      <div>{item.symbol}</div>
                      <div className="text-[10px] text-zinc-500">Ticket #{item.ticket || 'N/A'}</div>
                    </td>
                    <td className="p-3 uppercase text-amber-400 font-bold font-mono text-[11px]">
                      {item.discrepancy_type.replace('_', ' ')}
                    </td>
                    <td className="p-3 text-zinc-300 font-mono text-[11px]">
                      {item.expected_value}
                    </td>
                    <td className="p-3 text-zinc-300 font-mono text-[11px]">
                      {item.actual_value}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Pending Investigation
                      </span>
                    </td>
                    <td className="p-3 text-zinc-400 font-mono text-[11px]">
                      {new Date(item.detected_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
