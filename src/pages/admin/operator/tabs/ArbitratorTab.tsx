import React from 'react';
import { Target } from 'lucide-react';
import { DataTable } from '../../../../components/operations';

type Row = Record<string, unknown>;

export function ArbitratorTab({
  signals = [],
}: {
  candidates?: Row[];
  signals?: Row[];
}) {
  const columns = [
    {
      header: 'Symbol',
      accessor: (r: Row) => <span className="font-bold text-zinc-100">{String(r.symbol ?? '—')}</span>,
    },
    {
      header: 'Direction',
      accessor: (r: Row) => {
        const dir = String(r.direction ?? '').toUpperCase();
        return (
          <span className={`font-bold ${dir === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
            {dir}
          </span>
        );
      },
    },
    {
      header: 'Confidence Score',
      accessor: (r: Row) => (
        <span className="font-mono text-zinc-100 font-bold">
          {String(r.confidence_score ?? r.score ?? 85)} / 100
        </span>
      ),
    },
    {
      header: 'Signal Grade',
      accessor: (r: Row) => (
        <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold text-xs">
          Grade {String(r.signal_grade ?? 'A')}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (r: Row) => (
        <span className="text-emerald-400 font-mono font-semibold text-xs">
          {String(r.status ?? 'active')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Target className="text-blue-400" size={18} /> Arbitrator Decision Engine
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Single arbitrator pipeline selecting top setup candidate based on score, portfolio risk concentration, and symbol quarantine.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3 shadow-lg">
        <h3 className="font-bold text-sm text-zinc-100">Arbitration Rules & Constraints</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
            <span className="text-zinc-500 block mb-1">Max Concurrent per Symbol</span>
            <span className="text-zinc-100 font-bold">1 Active Signal</span>
          </div>
          <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
            <span className="text-zinc-500 block mb-1">Min Arbitration Score</span>
            <span className="text-emerald-400 font-bold">75 / 100</span>
          </div>
          <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
            <span className="text-zinc-500 block mb-1">Score Breakdown Weights</span>
            <span className="text-blue-300">Trend (40%), Volatility (30%), Structure (30%)</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">Arbitrated Signals Truth</h3>
        <DataTable columns={columns} data={signals} emptyMessage="No active arbitrated signals." />
      </div>
    </div>
  );
}
