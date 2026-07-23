import React from 'react';
import { Shield, TrendingUp } from 'lucide-react';

export type HeatmapCell = {
  symbol: string;
  side: 'LONG' | 'SHORT' | string;
  exposureUsd: number;
  pnlPct?: number;
  protectionStatus: 'PROTECTED' | 'UNPROTECTED' | 'PENDING' | string;
};

export function HeatmapContainer({
  title,
  cells,
  unavailableMessage,
}: {
  title: string;
  cells?: HeatmapCell[];
  unavailableMessage?: string;
}) {
  if (!cells || cells.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center space-y-2 shadow-lg">
        <Shield size={24} className="text-zinc-600 mx-auto" />
        <h4 className="font-semibold text-xs text-zinc-300">{title}</h4>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          {unavailableMessage || 'No active positions or risk exposure calculated for the current environment.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-blue-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300">{title}</h3>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">{cells.length} Active Positions</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {cells.map((cell, idx) => {
          const isLong = cell.side.toUpperCase() === 'LONG';
          const isProtected = cell.protectionStatus.toUpperCase().includes('PROTECT');
          const pnl = cell.pnlPct ?? 0;
          const pnlTone = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-zinc-400';

          return (
            <div
              key={idx}
              className={`p-3 rounded-xl border flex flex-col justify-between gap-1 font-mono transition-transform hover:scale-[1.02] ${
                isProtected
                  ? 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700'
                  : 'border-red-500/40 bg-red-950/20 hover:border-red-500/60'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-100">{cell.symbol}</span>
                <span className={`text-[10px] font-bold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                  {cell.side}
                </span>
              </div>

              <div className="text-sm font-bold text-zinc-200 mt-1">
                ${cell.exposureUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>

              <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-zinc-800/80">
                <span className={pnlTone}>{pnl > 0 ? `+${pnl.toFixed(1)}%` : `${pnl.toFixed(1)}%`}</span>
                <span className={isProtected ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                  {isProtected ? 'PROT' : 'UNPROT'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
