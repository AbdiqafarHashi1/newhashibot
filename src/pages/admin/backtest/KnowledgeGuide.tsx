import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Globe, Shield, Activity, HelpCircle } from 'lucide-react';

export const KnowledgeGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div id="arbitration-knowledge-guide" className="bg-slate-900/90 border border-slate-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-900 hover:bg-slate-850 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
            <HelpCircle className="w-4 h-4" />
          </span>
          <div>
            <h4 className="font-semibold text-slate-200 text-sm">
              Pipeline Arbitration & Multi-Asset Backtesting Engine: How It Works
            </h4>
            <p className="text-xs text-slate-400">
              Understanding cross-asset execution, crypto participation dynamics, segregated capital pools, and conflict resolution.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-indigo-400 font-medium">{isOpen ? 'Hide Architecture Guide' : 'Read Guide'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 border-t border-slate-800 space-y-4 text-xs text-slate-300 leading-relaxed bg-slate-950/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: Why Crypto Participation Varies */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
              <h5 className="font-semibold text-amber-300 text-sm mb-2 flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                1. Why Crypto Setup Frequency Varies vs. Forex
              </h5>
              <p className="text-slate-400 mb-2">
                Forex models (<code className="text-slate-300">LondonBreakout</code>, <code className="text-slate-300">NYContinuation</code>) operate on strict institutional session clocks (07:00 & 12:00 UTC). When market opens, volatility spikes systematically trigger qualifying setups almost daily.
              </p>
              <p className="text-slate-400">
                In contrast, Crypto models (<code className="text-slate-300">CryptoCompressionBreakout</code>, <code className="text-slate-300">CryptoMomentumBreakout</code>) are <strong>regime-gated</strong>. They require multi-bar volatility compression followed by genuine expansion with Keltner surge or 24-bar Donchian breakout. During choppy consolidation weeks, crypto models safely preserve capital by remaining flat until high-confidence expansion occurs.
              </p>
            </div>

            {/* Box 2: Segregated Capital & Zero Price Bleed */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
              <h5 className="font-semibold text-emerald-300 text-sm mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                2. Segregated Capital & Native Asset Pricing
              </h5>
              <p className="text-slate-400 mb-2">
                Every trade is executed on its <strong>native asset price and symbol</strong>:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li><strong className="text-slate-300">Forex:</strong> EURUSD (~1.0850) with 1.4 pips spread, $10,000 capital pool.</li>
                <li><strong className="text-slate-300">Metals:</strong> XAUUSD (~$2,485.50) with 35 pts spread, $5,000 capital pool.</li>
                <li><strong className="text-slate-300">Crypto:</strong> BTCUSDT (~$88,450) with 2.0 pts spread, $10,000 capital pool.</li>
                <li><strong className="text-slate-300">Indices:</strong> US30 (~39,150) with 2.5 pts spread, $5,000 capital pool.</li>
              </ul>
            </div>

            {/* Box 3: Arbitration Showdown Mechanics */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
              <h5 className="font-semibold text-indigo-300 text-sm mb-2 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                3. The Timeline Arbitration Showdown
              </h5>
              <p className="text-slate-400 mb-2">
                At each timeline bar, all enabled quantitative strategies evaluate their respective asset feeds in parallel:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Candidates calculate raw setup score (0–100) based on liquidity sweeps & indicator alignment.</li>
                <li>Score is multiplied by the strategy’s AI Weight Multiplier to get <code className="text-indigo-300">Weighted Score</code>.</li>
                <li>Candidates are ranked. If maximum concurrent portfolio exposure is reached, lower-ranked candidates are safely discarded.</li>
                <li>Directional conflicts (e.g. Long EURUSD while holding Short EURUSD) are vetoed by the strict arbitration filter.</li>
              </ol>
            </div>

            {/* Box 4: Multi-Asset Historical Data Sources */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
              <h5 className="font-semibold text-blue-300 text-sm mb-2 flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                4. Cross-Asset Historical Data Ingestion
              </h5>
              <p className="text-slate-400 mb-2">
                The backtester integrates real historical candle data from multiple live endpoints:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li><strong className="text-slate-300">Crypto:</strong> 1,000 bars from Binance Public Kline API.</li>
                <li><strong className="text-slate-300">Forex, Metals & Indices:</strong> Live Yahoo Finance history feeds with high-fidelity session synthesis fallback.</li>
                <li><strong className="text-slate-300">Date Range Ingestion:</strong> Select 7d, 14d, 30d (1 month), 60d, or 90d to sync all 4 asset classes in one click.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
