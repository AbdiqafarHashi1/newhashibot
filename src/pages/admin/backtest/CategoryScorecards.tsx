import React, { useState } from 'react';
import { Award, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { AssetCategory, CategoryPerformanceSummary, SymbolPerformanceSummary } from './types';

interface CategoryScorecardsProps {
  summaries: Record<AssetCategory, CategoryPerformanceSummary>;
  symbolSummaries?: Record<string, SymbolPerformanceSummary>;
}

export const CategoryScorecards: React.FC<CategoryScorecardsProps> = ({ summaries, symbolSummaries }) => {
  const [showSymbolDetails, setShowSymbolDetails] = useState<boolean>(true);
  const symbolList = symbolSummaries ? Object.values(symbolSummaries) : [];

  return (
    <div id="category-scorecards" className="mb-6 space-y-4">
      {/* Category Level Pool Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-blue-400" />
            Segregated Asset Category Performance & Capital Contribution
          </h4>
          <span className="text-[11px] text-slate-500">Realized against independent capital pools</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(summaries) as AssetCategory[]).map((cat) => {
            const s = summaries[cat];
            const isProfitable = s.netUsd >= 0;
            const returnColor = isProfitable ? 'text-emerald-400' : 'text-rose-400';
            const badgeBg =
              cat === 'crypto'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : cat === 'metals'
                ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                : 'bg-blue-500/10 text-blue-300 border-blue-500/30';

            return (
              <div
                key={cat}
                id={`scorecard-${cat}`}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all shadow-sm"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h5 className="font-semibold text-slate-200 text-sm">{s.displayName}</h5>
                    <span className="text-[11px] text-slate-400 font-mono">{s.symbol} Baseline</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-mono font-medium rounded-full border ${badgeBg}`}>
                    {cat.toUpperCase()}
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Net Return:</span>
                    <div className="text-right">
                      <span className={`text-sm font-bold font-mono ${returnColor}`}>
                        {s.netUsd >= 0 ? `+$${s.netUsd.toLocaleString()}` : `-$${Math.abs(s.netUsd).toLocaleString()}`}
                      </span>
                      <span className={`ml-1.5 text-xs font-mono font-semibold ${returnColor}`}>
                        ({s.returnPct >= 0 ? `+${s.returnPct}%` : `${s.returnPct}%`})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Starting / Ending Capital:</span>
                    <span className="font-mono text-slate-300">
                      ${s.initialCapitalUsd.toLocaleString()} → <strong className="text-white">${s.endingCapitalUsd.toLocaleString()}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                    <div className="bg-slate-800/50 p-1.5 rounded">
                      <span className="block text-[10px] text-slate-400">Win Rate</span>
                      <span className="text-xs font-bold font-mono text-slate-200">{s.winRate}%</span>
                    </div>
                    <div className="bg-slate-800/50 p-1.5 rounded">
                      <span className="block text-[10px] text-slate-400">Profit Factor</span>
                      <span className="text-xs font-bold font-mono text-slate-200">{s.profitFactor}</span>
                    </div>
                    <div className="bg-slate-800/50 p-1.5 rounded">
                      <span className="block text-[10px] text-slate-400">Total R</span>
                      <span className={`text-xs font-bold font-mono ${s.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.totalR >= 0 ? `+${s.totalR}R` : `${s.totalR}R`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>Trades: <strong className="text-slate-200">{s.totalTrades}</strong> ({s.wins}W / {s.losses}L)</span>
                    <span>Alpha Share: <strong className="text-blue-400 font-mono">{s.alphaSharePct}%</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Multi-Asset Granular Instrument Breakdown Table */}
      {symbolList.length > 0 && (
        <div id="multi-asset-symbol-breakdown" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div
            className="flex items-center justify-between p-3.5 bg-slate-800/40 border-b border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors"
            onClick={() => setShowSymbolDetails(!showSymbolDetails)}
          >
            <div className="flex items-center gap-2">
              <span className="p-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md">
                <Layers className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-white">
                Multi-Asset Instrument Universe Breakdown ({symbolList.length} Symbols)
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700">
                Cross-Asset Realized PnL
              </span>
            </div>

            <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
              <span>{showSymbolDetails ? 'Collapse' : 'Expand'}</span>
              {showSymbolDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showSymbolDetails && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Symbol / Pair</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Trades</th>
                    <th className="py-2.5 px-3 text-right">Win / Loss</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Profit Factor</th>
                    <th className="py-2.5 px-3 text-right">Realized R</th>
                    <th className="py-2.5 px-3 text-right">Net PnL (USD)</th>
                    <th className="py-2.5 px-3 text-right">Alpha Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {symbolList.map((sym) => {
                    const isPos = sym.netUsd >= 0;
                    const catBadge =
                      sym.category === 'crypto'
                        ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                        : sym.category === 'metals'
                        ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'
                        : 'text-blue-300 bg-blue-500/10 border-blue-500/20';

                    return (
                      <tr key={sym.symbol} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 font-semibold text-white font-mono flex items-center gap-1.5">
                          <span>{sym.symbol}</span>
                          <span className="text-[10px] font-normal text-slate-400">({sym.displayName})</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 text-[10px] uppercase font-mono rounded border ${catBadge}`}>
                            {sym.category}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-200">{sym.totalTrades}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-400 text-[11px]">
                          <span className="text-emerald-400">{sym.wins}W</span> / <span className="text-rose-400">{sym.losses}L</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          <span className={sym.winRate >= 50 ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                            {sym.winRate}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300">{sym.profitFactor}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          <span className={sym.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {sym.totalR >= 0 ? `+${sym.totalR}R` : `${sym.totalR}R`}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
                            {isPos ? `+$${sym.netUsd.toLocaleString()}` : `-$${Math.abs(sym.netUsd).toLocaleString()}`}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-blue-400">
                          {sym.alphaSharePct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
