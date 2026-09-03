import React from 'react';
import { Wallet } from 'lucide-react';
import { AssetCategory, AssetCapitalPool } from './types';

interface CapitalPoolManagerProps {
  pools: Record<AssetCategory, AssetCapitalPool>;
  onUpdatePool: (category: AssetCategory, updates: Partial<AssetCapitalPool>) => void;
}

export const CapitalPoolManager: React.FC<CapitalPoolManagerProps> = ({ pools, onUpdatePool }) => {
  const totalCombinedCapital = Object.values(pools).reduce((acc, p) => acc + p.capitalUsd, 0);

  return (
    <div id="capital-pool-manager" className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 mb-6 text-slate-200 min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
              <Wallet className="w-4 h-4" />
            </span>
            <h3 className="font-semibold text-white text-base">Segregated Capital Pools & Risk Parameters</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Allocate distinct capital pools and risk percentages for each asset class. Trades calculate real USD returns against their segregated capital balance.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg">
          <span className="text-xs text-emerald-400 font-medium">Total Portfolio Capital:</span>
          <span className="text-sm font-bold text-white font-mono">${totalCombinedCapital.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        {(Object.keys(pools) as AssetCategory[]).map((cat) => {
          const pool = pools[cat];
          const riskDollar = (pool.capitalUsd * pool.riskPct) / 100;

          return (
            <div
              key={cat}
              id={`capital-pool-${cat}`}
              className="p-3.5 bg-slate-800/40 border border-slate-700/80 rounded-xl hover:border-slate-600 transition-all"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
                <span className="text-xs font-semibold text-slate-200 capitalize">{pool.name}</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-slate-700 text-slate-300">
                  {pool.symbol}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Allocated Capital ($)</span>
                    <span className="text-slate-500 text-[10px]">Pool Balance</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="500"
                      min="100"
                      value={pool.capitalUsd}
                      onChange={(e) => onUpdatePool(cat, { capitalUsd: Math.max(100, parseFloat(e.target.value) || 100) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-6 pr-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Risk / Trade (%)</span>
                    <span className="text-emerald-400 text-[10px] font-mono font-semibold">${riskDollar.toFixed(0)} / 1R</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.25"
                      min="0.1"
                      max="10"
                      value={pool.riskPct}
                      onChange={(e) => onUpdatePool(cat, { riskPct: Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1)) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-2.5 pr-6 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Friday Liquidation:</span>
                  <span className={pool.fridayClose ? 'text-amber-400 font-medium' : 'text-slate-500'}>
                    {pool.fridayClose ? '20:00 UTC' : '24/7 Continuous'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
