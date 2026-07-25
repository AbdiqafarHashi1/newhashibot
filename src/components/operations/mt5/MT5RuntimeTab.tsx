import { useState, useEffect, useCallback } from 'react';
import { 
  Activity, RefreshCw, AlertTriangle, Layers, ArrowUpRight, ArrowDownRight, 
  Wallet, PieChart
} from 'lucide-react';
import { listMT5Accounts, type MT5Account } from '../../../lib/mt5Accounts';
import { getMT5LatestSnapshot } from '../../../lib/mt5Operations';
import type { MT5AccountSnapshot, MT5Position, MT5Order } from '../../../lib/exchange/mt5';

interface Props {
  selectedAccountId?: string;
}

export function MT5RuntimeTab({ selectedAccountId }: Props) {
  const [accounts, setAccounts] = useState<MT5Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>(selectedAccountId);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<MT5AccountSnapshot | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMT5Accounts();
      setAccounts(data);
      if (data.length > 0 && !activeAccountId) {
        setActiveAccountId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to list MT5 accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  const fetchSnapshot = useCallback(async (accountId: string) => {
    setSnapshotLoading(true);
    try {
      const snap = await getMT5LatestSnapshot(accountId);
      setSnapshot(snap);
    } catch (err) {
      console.error('Failed to fetch account snapshot:', err);
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (activeAccountId) {
      fetchSnapshot(activeAccountId);
    }
  }, [activeAccountId, fetchSnapshot]);

  const selectedAcc = accounts.find(a => a.id === activeAccountId);

  const formatCurrency = (val: number, curr = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Account Selector Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-blue-400 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-white">MT5 Live Runtime Inspector</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select an account to view real-time balance, open positions, and pending orders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={activeAccountId || ''}
            onChange={(e) => setActiveAccountId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-white px-3 py-2 rounded-lg font-medium focus:outline-none focus:border-blue-500 flex-1 sm:flex-initial"
          >
            {accounts.length === 0 && <option value="">No MT5 Accounts Configured</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.nickname || acc.accountNumberMasked} ({acc.server}) - {acc.executionMode}
              </option>
            ))}
          </select>

          <button
            disabled={!activeAccountId}
            onClick={() => activeAccountId && fetchSnapshot(activeAccountId)}
            className="text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={snapshotLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-zinc-500">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
          Loading account list...
        </div>
      ) : !selectedAcc ? (
        <div className="p-12 bg-zinc-900/80 border border-zinc-800 rounded-xl text-center text-xs text-zinc-400">
          No MT5 account selected. Configure an account in the Accounts tab first.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metrics Header */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                <Wallet size={13} className="text-blue-400" />
                Balance
              </div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(snapshot?.balance ?? 0, snapshot?.currency)}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Acct: {selectedAcc.accountNumberMasked}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                <PieChart size={13} className="text-purple-400" />
                Equity
              </div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(snapshot?.equity ?? 0, snapshot?.currency)}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Server: {selectedAcc.server}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="text-xs text-zinc-500 font-medium">Floating P/L</div>
              <div className={`text-xl font-bold ${(snapshot?.floatingPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(snapshot?.floatingPnl ?? 0) >= 0 ? '+' : ''}
                {formatCurrency(snapshot?.floatingPnl ?? 0, snapshot?.currency)}
              </div>
              <div className="text-[10px] text-zinc-500">Unrealized profit/loss</div>
            </div>

            <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="text-xs text-zinc-500 font-medium">Used Margin</div>
              <div className="text-xl font-bold text-zinc-300">
                {formatCurrency(snapshot?.margin ?? 0, snapshot?.currency)}
              </div>
              <div className="text-[10px] text-zinc-500">
                Free: {formatCurrency(snapshot?.freeMargin ?? 0, snapshot?.currency)}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1 col-span-2 md:col-span-1">
              <div className="text-xs text-zinc-500 font-medium">Last State Sync</div>
              <div className="text-sm font-bold text-emerald-400 font-mono mt-1">
                {snapshot?.capturedAt ? new Date(snapshot.capturedAt).toLocaleTimeString() : 'Awaiting Bridge'}
              </div>
              <div className="text-[10px] text-zinc-500">5-second sync cycle</div>
            </div>
          </div>

          {/* Open Positions Table */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Layers size={14} className="text-blue-400" />
                Open MT5 Positions ({snapshot?.positions?.length ?? 0})
              </h3>
              <span className="text-[11px] text-zinc-500">Live Snapshot</span>
            </div>

            {!snapshot?.positions || snapshot.positions.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No open positions on this MT5 terminal.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800 font-mono">
                    <tr>
                      <th className="p-3 font-semibold">Ticket</th>
                      <th className="p-3 font-semibold">Symbol</th>
                      <th className="p-3 font-semibold">Side</th>
                      <th className="p-3 font-semibold">Volume</th>
                      <th className="p-3 font-semibold">Open Price</th>
                      <th className="p-3 font-semibold">Current Price</th>
                      <th className="p-3 font-semibold">S/L</th>
                      <th className="p-3 font-semibold">T/P</th>
                      <th className="p-3 font-semibold text-right">Profit ({snapshot.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {snapshot.positions.map((pos: MT5Position) => (
                      <tr key={pos.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 text-zinc-400">{pos.ticket || pos.id}</td>
                        <td className="p-3 font-bold text-white font-sans">{pos.symbol}</td>
                        <td className="p-3 font-bold font-sans">
                          {pos.side === 'buy' ? (
                            <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 w-fit">
                              <ArrowUpRight size={12} /> BUY
                            </span>
                          ) : (
                            <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 flex items-center gap-1 w-fit">
                              <ArrowDownRight size={12} /> SELL
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-zinc-200">{pos.size || pos.volume} lots</td>
                        <td className="p-3 text-zinc-300">{pos.entryPrice}</td>
                        <td className="p-3 text-zinc-300">{pos.currentPrice}</td>
                        <td className="p-3 text-amber-400">{pos.stopLoss || '—'}</td>
                        <td className="p-3 text-cyan-400">{pos.takeProfit || '—'}</td>
                        <td className={`p-3 text-right font-bold ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Orders Table */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-400" />
                Pending MT5 Orders ({snapshot?.orders?.length ?? 0})
              </h3>
              <span className="text-[11px] text-zinc-500">Live Snapshot</span>
            </div>

            {!snapshot?.orders || snapshot.orders.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No pending orders on this MT5 terminal.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800 font-mono">
                    <tr>
                      <th className="p-3 font-semibold">Ticket</th>
                      <th className="p-3 font-semibold">Symbol</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Volume</th>
                      <th className="p-3 font-semibold">Price</th>
                      <th className="p-3 font-semibold">S/L</th>
                      <th className="p-3 font-semibold">T/P</th>
                      <th className="p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {snapshot.orders.map((ord: MT5Order) => (
                      <tr key={ord.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 text-zinc-400">{ord.ticket || ord.id}</td>
                        <td className="p-3 font-bold text-white font-sans">{ord.symbol}</td>
                        <td className="p-3 font-bold font-sans uppercase text-yellow-400">{ord.type}</td>
                        <td className="p-3 text-zinc-200">{ord.size || ord.volume} lots</td>
                        <td className="p-3 text-zinc-300">{ord.price}</td>
                        <td className="p-3 text-amber-400">{ord.stopLoss || '—'}</td>
                        <td className="p-3 text-cyan-400">{ord.takeProfit || '—'}</td>
                        <td className="p-3 text-zinc-400 uppercase font-sans text-[10px]">{ord.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
