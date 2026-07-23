import { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, CheckCircle2, Search, Filter, RefreshCw, AlertTriangle, Inbox
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';

type PositionRow = {
  id: string;
  provider?: string | null;
  environment?: string | null;
  scope?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  symbol: string;
  side?: string | null;
  direction?: string | null;
  position_size?: number | null;
  quantity?: number | null;
  entry_price?: number | null;
  mark_price?: number | null;
  current_price?: number | null;
  unrealized_pnl?: number | null;
  pnl_pct?: number | null;
  stop_loss?: number | null;
  take_profit_1?: number | null;
  protection_status?: string | null;
  sl_order_id?: string | null;
  tp1_order_id?: string | null;
  latest_error?: string | null;
  latest_sync_at?: string | null;
  created_at?: string | null;
};

export default function Positions() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const fetchPositions = useCallback(async () => {
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
        setPositions((data ?? []) as PositionRow[]);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to query positions truth');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPositions();
    const interval = setInterval(() => void fetchPositions(), 15000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const handleSyncPositions = async () => {
    setActionPending(true);
    setActionNotice('Triggering exchange sync across active adapters...');
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'refresh_exchange' }
      });
      if (error) {
        setActionNotice(`Exchange sync failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Sync error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice('Exchange position sync completed successfully.');
        await fetchPositions();
      }
    } catch (err) {
      setActionNotice(`Sync exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleRepairProtection = async (provider?: string | null) => {
    setActionPending(true);
    setActionNotice(`Executing protection repair for ${provider || 'all providers'}...`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operator-action', {
        body: { action: 'repair_protection_now', provider: provider || 'all' }
      });
      if (error) {
        setActionNotice(`Protection repair failed: ${error.message}`);
      } else if (data && data.success === false) {
        setActionNotice(`Repair error: ${data.exact_error || data.result_summary || 'Failed'}`);
      } else {
        setActionNotice('Native Stop-Loss & Take-Profit repair command dispatched.');
        await fetchPositions();
      }
    } catch (err) {
      setActionNotice(`Repair exception: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionPending(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const handleCloseMarket = () => {
    setActionNotice('Close market backend action not implemented — server-authorized emergency exit endpoint required.');
    setTimeout(() => setActionNotice(null), 5000);
  };

  const filteredPositions = positions.filter(p => {
    if (filterProvider !== 'all' && (p.provider || '').toLowerCase() !== filterProvider.toLowerCase()) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchSymbol = (p.symbol || '').toLowerCase().includes(term);
      const matchAccount = (p.account_name || p.account_id || '').toLowerCase().includes(term);
      if (!matchSymbol && !matchAccount) return false;
    }
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-400">
              <span>HashiBot Operations</span>
              <span>/</span>
              <span>Positions Management</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
              Active Exchange & Broker Positions
            </h1>
            <p className="text-sm text-zinc-400 font-sans mt-1">
              Live tracking of open positions verified from <code className="text-zinc-300 font-mono">trade_management_truth</code> database ledger.
            </p>
          </div>

          <button
            disabled={actionPending}
            onClick={handleSyncPositions}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync Exchange Positions
          </button>
        </div>

        {actionNotice && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3 text-xs text-blue-300 flex items-center gap-2 font-sans">
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

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-xs">
            <Filter size={14} className="text-zinc-500" />
            <span className="text-zinc-400">Provider Scope:</span>
            {(['all', 'binance', 'bybit', 'mt5'] as const).map(p => (
              <button
                key={p}
                onClick={() => setFilterProvider(p)}
                className={`px-3 py-1.5 rounded-lg font-medium uppercase transition ${
                  filterProvider === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search symbol or account..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none w-64 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Positions Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-300">Open Positions ({filteredPositions.length})</span>
            <span className="text-zinc-500">Source: trade_management_truth</span>
          </div>

          {loading && positions.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-sans">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
              <span>Fetching live trade management truth...</span>
            </div>
          ) : filteredPositions.length === 0 ? (
            <div className="p-8 text-center font-sans space-y-2">
              <Inbox size={32} className="mx-auto text-zinc-600" />
              <div className="text-sm font-semibold text-zinc-300">NO_DATA</div>
              <p className="text-xs text-zinc-500">
                No active open positions detected in <code className="text-zinc-400 font-mono">trade_management_truth</code> ledger.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="p-3">Symbol / Provider</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Side</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Entry / Mark Price</th>
                    <th className="p-3">Unrealized PnL</th>
                    <th className="p-3">Stop Loss</th>
                    <th className="p-3">Protection</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredPositions.map(pos => {
                    const side = (pos.side || pos.direction || 'BUY').toUpperCase();
                    const qty = Number(pos.position_size ?? pos.quantity ?? 0);
                    const entry = Number(pos.entry_price ?? 0);
                    const mark = Number(pos.mark_price ?? pos.current_price ?? 0);
                    const pnl = Number(pos.unrealized_pnl ?? 0);
                    const sl = Number(pos.stop_loss ?? 0);
                    const status = pos.protection_status || 'UNPROTECTED';
                    const isProtected = status === 'protected_native' || status === 'protected';

                    return (
                      <tr key={pos.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-3">
                          <div className="font-bold text-white text-sm">{pos.symbol}</div>
                          <div className="text-[10px] text-zinc-500 uppercase">{pos.provider || 'UNKNOWN'} • {pos.environment || pos.scope || 'Live'}</div>
                        </td>
                        <td className="p-3 text-zinc-300">{pos.account_name || pos.account_id || 'Primary Account'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            side === 'LONG' || side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {side}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{qty}</td>
                        <td className="p-3 font-mono">
                          <div>${entry.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500">Mark: ${mark.toLocaleString()}</div>
                        </td>
                        <td className="p-3 font-mono">
                          <div className={`font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-zinc-300">{sl > 0 ? `$${sl.toLocaleString()}` : 'None'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 w-fit border ${
                            isProtected
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            <ShieldCheck size={11} />
                            {status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {!isProtected && (
                              <button
                                disabled={actionPending}
                                onClick={() => handleRepairProtection(pos.provider)}
                                className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-semibold transition disabled:opacity-50"
                              >
                                Attach SL
                              </button>
                            )}
                            <button
                              disabled={actionPending}
                              onClick={handleCloseMarket}
                              className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-[10px] font-semibold transition disabled:opacity-50"
                            >
                              Close Market
                            </button>
                          </div>
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
