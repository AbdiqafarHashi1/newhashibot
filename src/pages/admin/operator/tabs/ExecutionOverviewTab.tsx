import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, RefreshCw } from 'lucide-react';
import { DataTable, SearchInput, FilterBar } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';
import { SmartOrderRouterVisualizer } from '../../../../components/predictive/SmartOrderRouterVisualizer';

type Row = Record<string, unknown>;

export function ExecutionOverviewTab({
  executionOrders = [],
  onRunAction,
  runningAction,
}: {
  executionOrders?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredOrders = executionOrders.filter((order) => {
    const symbol = String(order.symbol ?? '').toUpperCase();
    const provider = String(order.execution_provider ?? '').toUpperCase();
    const status = String(order.status ?? '').toUpperCase();

    if (searchTerm && !symbol.includes(searchTerm.toUpperCase()) && !provider.includes(searchTerm.toUpperCase())) {
      return false;
    }

    if (statusFilter !== 'ALL' && status !== statusFilter) {
      return false;
    }

    return true;
  });

  const columns = [
    {
      header: 'Provider',
      accessor: (r: Row) => (
        <span className="font-bold text-zinc-100 uppercase text-xs">
          {String(r.execution_provider ?? 'binance')}
        </span>
      ),
    },
    {
      header: 'Symbol',
      accessor: (r: Row) => <span className="font-bold text-blue-300">{String(r.symbol ?? '—')}</span>,
    },
    {
      header: 'Side',
      accessor: (r: Row) => {
        const dir = String(r.direction ?? r.side ?? '').toUpperCase();
        return (
          <span className={`font-bold ${dir === 'BUY' || dir === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
            {dir}
          </span>
        );
      },
    },
    {
      header: 'Order Status',
      accessor: (r: Row) => {
        const st = String(r.status ?? 'pending').toUpperCase();
        const isOk = st.includes('PROTECT') || st.includes('FILLED') || st.includes('OPEN');
        return (
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              isOk
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
            }`}
          >
            {st}
          </span>
        );
      },
    },
    {
      header: 'Entry / Stop Loss / TP',
      accessor: (r: Row) => (
        <span className="text-zinc-400 font-mono text-xs">
          ${String(r.entry_price ?? 'MKT')} | SL: ${String(r.stop_loss ?? '—')} | TP1: ${String(r.tp1 ?? '—')}
        </span>
      ),
    },
    {
      header: 'Submitted At',
      accessor: (r: Row) => (
        <span className="text-zinc-500 font-mono text-[10px]">
          {r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Cpu className="text-blue-400" size={18} /> Exchange Execution Orders Ledger
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Immutable order submission history across Binance, Bybit, and MT5 bridge router.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/execution"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            Open Full Execution Management →
          </Link>
          <button
            onClick={() => onRunAction('refresh_exchange')}
            disabled={Boolean(runningAction)}
            className="px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={runningAction === 'refresh_exchange' ? 'animate-spin' : ''} />
            Sync Exchange Positions
          </button>
        </div>
      </div>

      {/* Multi-Venue Smart Order Router & Arbitrage Visualizer */}
      <SmartOrderRouterVisualizer />

      <FilterBar>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Filter by provider, symbol..." />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="PROTECTED">Protected</option>
          <option value="FILLED">Filled</option>
          <option value="CLOSED">Closed</option>
          <option value="FAILED">Failed</option>
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filteredOrders}
        emptyMessage="No execution orders logged in the ledger."
      />
    </div>
  );
}
