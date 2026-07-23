import React from 'react';
import { Cpu } from 'lucide-react';

export function StrategyOverviewTab() {
  const defaultStrategies = [
    {
      name: 'MicroScalper',
      market: 'Crypto',
      timeframe: '5m',
      minConfidence: 80,
      minRR: '1:2.0',
      description: 'High-frequency momentum scalp targeting explosive volume breakouts.',
      status: 'ACTIVE',
    },
    {
      name: 'QuickScalp',
      market: 'Crypto',
      timeframe: '15m',
      minConfidence: 75,
      minRR: '1:1.8',
      description: 'Short-term trend continuation following EMA cross and RSI confirmation.',
      status: 'ACTIVE',
    },
    {
      name: 'CompressionBreakout',
      market: 'Crypto',
      timeframe: '1h',
      minConfidence: 85,
      minRR: '1:2.5',
      description: 'Volatilty squeeze detection with Bollinger Band contraction.',
      status: 'ACTIVE',
    },
    {
      name: 'SwingContinuation',
      market: 'Crypto',
      timeframe: '4h',
      minConfidence: 85,
      minRR: '1:3.0',
      description: 'Multi-timeframe market structure shift and order block retests.',
      status: 'ACTIVE',
    },
    {
      name: 'ForexMicroScalper',
      market: 'Forex',
      timeframe: '15m',
      minConfidence: 82,
      minRR: '1:2.0',
      description: 'Session breakout scalper for EURUSD & GBPUSD during London/NY overlap.',
      status: 'ACTIVE',
    },
    {
      name: 'ForexSwingContinuation',
      market: 'Forex',
      timeframe: '1h',
      minConfidence: 88,
      minRR: '1:2.8',
      description: 'Higher timeframe key level bounce for major FX pairs and Gold.',
      status: 'ACTIVE',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Cpu className="text-blue-400" size={18} /> Strategy Matrix & Parameters
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Quant strategy definitions, confidence thresholds, risk/reward requirements, and market timeframe matrix.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {defaultStrategies.map((st, i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-bold text-sm text-zinc-100">{st.name}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                  {st.market}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-3">{st.description}</p>

              <div className="space-y-1.5 text-xs font-mono text-zinc-300 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Primary Timeframe:</span>
                  <span className="text-zinc-100 font-bold">{st.timeframe}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Min Confidence:</span>
                  <span className="text-emerald-400 font-bold">{st.minConfidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Min Risk/Reward:</span>
                  <span className="text-blue-300 font-bold">{st.minRR}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
              <span>Status: <span className="text-emerald-400 font-bold">{st.status}</span></span>
              <span>Adapter: {st.market}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
