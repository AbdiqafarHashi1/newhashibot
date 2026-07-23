import React from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { DataTable, HeatmapContainer, IncidentBanner } from '../../../../components/operations';
import { OperatorActionResult } from '../../../../components/admin/ActionResult';

type Row = Record<string, unknown>;

export function PositionsProtectionTab({
  tradeTruth = [],
  onRunAction,
  runningAction,
}: {
  tradeTruth?: Row[];
  onRunAction: (action: string) => Promise<OperatorActionResult | null>;
  runningAction: string | null;
}) {
  const unprotected = tradeTruth.filter(
    (t) => String(t.protection_status ?? '').toUpperCase().includes('UNPROTECT')
  );

  const columns = [
    {
      header: 'Exchange Provider',
      accessor: (r: Row) => (
        <span className="font-bold text-zinc-100 uppercase text-xs">
          {String(r.provider ?? 'binance')} ({String(r.environment ?? 'TESTNET')})
        </span>
      ),
    },
    {
      header: 'Symbol',
      accessor: (r: Row) => <span className="font-bold text-blue-300">{String(r.symbol ?? '—')}</span>,
    },
    {
      header: 'Side / Size',
      accessor: (r: Row) => {
        const side = String(r.side ?? '').toUpperCase();
        return (
          <span className="font-mono text-xs">
            <span className={side === 'LONG' || side === 'BUY' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {side}
            </span>{' '}
            • {String(r.position_size ?? r.size ?? 0)}
          </span>
        );
      },
    },
    {
      header: 'Entry Price',
      accessor: (r: Row) => <span className="text-zinc-200 font-mono">${String(r.entry_price ?? 0)}</span>,
    },
    {
      header: 'Protection Status',
      accessor: (r: Row) => {
        const st = String(r.protection_status ?? 'UNPROTECTED').toUpperCase();
        const isProt = st.includes('PROTECT');
        return (
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              isProt
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300 animate-pulse'
            }`}
          >
            {st}
          </span>
        );
      },
    },
    {
      header: 'SL Order ID / TP Order ID',
      accessor: (r: Row) => (
        <span className="text-zinc-400 font-mono text-[10px]">
          SL: {String(r.sl_order_id ?? 'NONE')} | TP: {String(r.tp_order_id ?? 'NONE')}
        </span>
      ),
    },
  ];

  const heatmapCells = tradeTruth.map((t) => ({
    symbol: String(t.symbol ?? 'UNKNOWN'),
    side: String(t.side ?? 'LONG').toUpperCase(),
    exposureUsd: Number(t.position_size ?? 1000),
    pnlPct: Number(t.unrealized_pnl ?? 0),
    protectionStatus: String(t.protection_status ?? 'PROTECTED'),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="text-blue-400" size={18} /> Positions & Trade Protection Truth
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time exchange position tracking, native stop-loss attachment, and automated protection recovery.
          </p>
        </div>

        <button
          onClick={() => onRunAction('repair_protection_now')}
          disabled={Boolean(runningAction)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-950/50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={runningAction === 'repair_protection_now' ? 'animate-spin' : ''} />
          Repair All Protection
        </button>
      </div>

      {unprotected.length > 0 && (
        <IncidentBanner
          title={`${unprotected.length} Unprotected Position(s)`}
          description="Exchange position missing verified stop-loss order on exchange order book."
          severity="CRITICAL"
          actionLabel="Repair Now"
          onAction={() => onRunAction('repair_protection_now')}
        />
      )}

      <HeatmapContainer title="Active Position Protection Heatmap" cells={heatmapCells} />

      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">Trade Management Truth Ledger</h3>
        <DataTable
          columns={columns}
          data={tradeTruth}
          emptyMessage="No active open positions on connected exchanges."
        />
      </div>
    </div>
  );
}
