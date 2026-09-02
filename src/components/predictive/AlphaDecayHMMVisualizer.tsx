import React, { useState } from 'react';
import {
  AlertTriangle,
  Compass,
  BarChart3,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { MarketRegimeToken } from './HMMRegimeVisualizer';

interface StrategyDecayState {
  strategy_id: string;
  name: string;
  market: 'crypto' | 'forex' | 'gold' | 'metals';
  archetype: 'Mean Reversion' | 'Momentum / Trend' | 'Volatility Expansion' | 'Macro Structure';
  lifetime_signals: number;
  rolling_win_rate_30d: number;
  peak_win_rate: number;
  half_life_days: number;
  alpha_decay_pct: number; // e.g. 12% decay
  current_status: 'PRIME' | 'DECAYING' | 'EXHAUSTED' | 'RE-OPTIMIZED';
  regime_affinity: Record<MarketRegimeToken, number>; // weight 0.0 - 1.2
  current_weight: number; // HMM & Decay blended allocation multiplier
  last_alpha_burst: string;
  recommended_action: string;
}

const STRATEGY_DECAY_DATABASE: StrategyDecayState[] = [
  {
    strategy_id: 'crypto.compression-breakout',
    name: 'Compression Breakout',
    market: 'crypto',
    archetype: 'Volatility Expansion',
    lifetime_signals: 412,
    rolling_win_rate_30d: 74.2,
    peak_win_rate: 78.5,
    half_life_days: 90,
    alpha_decay_pct: 5.4,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.25,
      REGIME_DISTRIBUTION_TREND: 1.15,
      REGIME_LIQUIDITY_SHOCK: 0.60,
    },
    current_weight: 1.12,
    last_alpha_burst: '2 hours ago',
    recommended_action: 'Allocate maximum size (1.1x) when Garman-Klass volatility breaks 45-period band.',
  },
  {
    strategy_id: 'crypto.swing-continuation',
    name: 'Swing Continuation',
    market: 'crypto',
    archetype: 'Momentum / Trend',
    lifetime_signals: 285,
    rolling_win_rate_30d: 68.8,
    peak_win_rate: 72.0,
    half_life_days: 120,
    alpha_decay_pct: 4.4,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.20,
      REGIME_DISTRIBUTION_TREND: 1.08,
      REGIME_LIQUIDITY_SHOCK: 0.40,
    },
    current_weight: 0.95,
    last_alpha_burst: '4 hours ago',
    recommended_action: 'Optimal on 4h institutional order block retests.',
  },
  {
    strategy_id: 'crypto.micro-scalper',
    name: 'Micro Scalper (Order Flow)',
    market: 'crypto',
    archetype: 'Mean Reversion',
    lifetime_signals: 890,
    rolling_win_rate_30d: 59.4,
    peak_win_rate: 67.5,
    half_life_days: 45,
    alpha_decay_pct: 12.0,
    current_status: 'DECAYING',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.85,
      REGIME_DISTRIBUTION_TREND: 0.15,
      REGIME_LIQUIDITY_SHOCK: 0.05,
    },
    current_weight: 0.35,
    last_alpha_burst: '18 hours ago',
    recommended_action: 'Throttled by HMM due to directional volatility. Restrict to low-volatility Asian sessions.',
  },
  {
    strategy_id: 'crypto.momentum-breakout',
    name: 'Momentum Volume Surge',
    market: 'crypto',
    archetype: 'Momentum / Trend',
    lifetime_signals: 310,
    rolling_win_rate_30d: 71.5,
    peak_win_rate: 75.0,
    half_life_days: 80,
    alpha_decay_pct: 4.6,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.28,
      REGIME_DISTRIBUTION_TREND: 1.18,
      REGIME_LIQUIDITY_SHOCK: 0.65,
    },
    current_weight: 1.08,
    last_alpha_burst: '1 hour ago',
    recommended_action: 'Scale into volume breakouts with VWAS verification.',
  },
  {
    strategy_id: 'forex.london-breakout',
    name: 'London Open Breakout',
    market: 'forex',
    archetype: 'Volatility Expansion',
    lifetime_signals: 540,
    rolling_win_rate_30d: 76.5,
    peak_win_rate: 79.0,
    half_life_days: 180,
    alpha_decay_pct: 3.1,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.30,
      REGIME_DISTRIBUTION_TREND: 1.12,
      REGIME_LIQUIDITY_SHOCK: 0.50,
    },
    current_weight: 1.05,
    last_alpha_burst: '6 hours ago',
    recommended_action: 'Active during 07:00–10:00 GMT Asian box invalidations on EUR/USD & GBP/USD.',
  },
  {
    strategy_id: 'forex.new-york-continuation',
    name: 'NY Session Continuation',
    market: 'forex',
    archetype: 'Momentum / Trend',
    lifetime_signals: 420,
    rolling_win_rate_30d: 73.0,
    peak_win_rate: 76.2,
    half_life_days: 150,
    alpha_decay_pct: 4.2,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.25,
      REGIME_DISTRIBUTION_TREND: 1.05,
      REGIME_LIQUIDITY_SHOCK: 0.45,
    },
    current_weight: 0.98,
    last_alpha_burst: 'Yesterday',
    recommended_action: 'Pairs with US macro data releases and equity open sweeps.',
  },
  {
    strategy_id: 'gold.volatility-breakout',
    name: 'XAU/USD Gold Institutional Surge',
    market: 'gold',
    archetype: 'Volatility Expansion',
    lifetime_signals: 388,
    rolling_win_rate_30d: 78.4,
    peak_win_rate: 81.2,
    half_life_days: 120,
    alpha_decay_pct: 3.4,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.15,
      REGIME_DISTRIBUTION_TREND: 1.10,
      REGIME_LIQUIDITY_SHOCK: 0.95,
    },
    current_weight: 1.15,
    last_alpha_burst: '30 mins ago',
    recommended_action: 'Institutional leader. Dynamic ATR expansion generates high-probability 1:2.5+ R:R setups.',
  },
  {
    strategy_id: 'macro.yield-differential',
    name: 'Bond Yield Differential',
    market: 'forex',
    archetype: 'Macro Structure',
    lifetime_signals: 195,
    rolling_win_rate_30d: 65.0,
    peak_win_rate: 70.0,
    half_life_days: 240,
    alpha_decay_pct: 7.1,
    current_status: 'RE-OPTIMIZED',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.40,
      REGIME_DISTRIBUTION_TREND: 0.85,
      REGIME_LIQUIDITY_SHOCK: 0.30,
    },
    current_weight: 0.75,
    last_alpha_burst: '2 days ago',
    recommended_action: 'Calibrated for 2Y US/EU rate spread changes.',
  },
  {
    strategy_id: 'crypto.reversal-exhaustion',
    name: 'Reversal Exhaustion (TD Sequential)',
    market: 'crypto',
    archetype: 'Mean Reversion',
    lifetime_signals: 340,
    rolling_win_rate_30d: 70.4,
    peak_win_rate: 74.8,
    half_life_days: 110,
    alpha_decay_pct: 4.8,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.90,
      REGIME_DISTRIBUTION_TREND: 0.35,
      REGIME_LIQUIDITY_SHOCK: 0.75,
    },
    current_weight: 1.02,
    last_alpha_burst: '1 hour ago',
    recommended_action: 'Fires at structural exhaustion sweeps with CVD divergence confirmation.',
  },
  {
    strategy_id: 'forex.micro-scalper',
    name: 'FX Micro Scalper (Order Flow)',
    market: 'forex',
    archetype: 'Mean Reversion',
    lifetime_signals: 620,
    rolling_win_rate_30d: 68.2,
    peak_win_rate: 73.0,
    half_life_days: 90,
    alpha_decay_pct: 5.8,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.80,
      REGIME_DISTRIBUTION_TREND: 0.30,
      REGIME_LIQUIDITY_SHOCK: 0.20,
    },
    current_weight: 0.88,
    last_alpha_burst: '45 mins ago',
    recommended_action: 'Optimal on tight spreads during London/NY overlap for rapid 1:1.3 R target realization.',
  },
  {
    strategy_id: 'forex.trend-pullback',
    name: 'FX Trend Pullback',
    market: 'forex',
    archetype: 'Momentum / Trend',
    lifetime_signals: 480,
    rolling_win_rate_30d: 72.8,
    peak_win_rate: 77.1,
    half_life_days: 160,
    alpha_decay_pct: 3.6,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.20,
      REGIME_DISTRIBUTION_TREND: 1.15,
      REGIME_LIQUIDITY_SHOCK: 0.35,
    },
    current_weight: 1.06,
    last_alpha_burst: '3 hours ago',
    recommended_action: 'Follows institutional 20/50 EMA dynamic support & resistance on major FX crosses.',
  },
  {
    strategy_id: 'forex.session-orb',
    name: 'Session Opening Range Breakout (ORB)',
    market: 'forex',
    archetype: 'Volatility Expansion',
    lifetime_signals: 510,
    rolling_win_rate_30d: 75.0,
    peak_win_rate: 78.5,
    half_life_days: 140,
    alpha_decay_pct: 3.9,
    current_status: 'PRIME',
    regime_affinity: {
      REGIME_ACCUMULATION_GRID: 0.15,
      REGIME_DISTRIBUTION_TREND: 1.10,
      REGIME_LIQUIDITY_SHOCK: 0.80,
    },
    current_weight: 1.10,
    last_alpha_burst: '5 hours ago',
    recommended_action: 'Capitalizes on the first 15m session range expansion across Frankfurt, London, and NY.',
  },
];

export function AlphaDecayHMMVisualizer() {
  const [selectedMarket, setSelectedMarket] = useState<'all' | 'crypto' | 'forex' | 'gold'>('all');
  const [activeRegime, setActiveRegime] = useState<MarketRegimeToken>('REGIME_DISTRIBUTION_TREND');
  const [autoRebalance, setAutoRebalance] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const filteredStrategies = STRATEGY_DECAY_DATABASE.filter(
    (s) => selectedMarket === 'all' || s.market === selectedMarket || (selectedMarket === 'forex' && s.market === 'gold')
  );

  const totalActiveStrategies = filteredStrategies.length;
  const primeStrategies = filteredStrategies.filter((s) => s.current_status === 'PRIME').length;
  const decayingStrategies = filteredStrategies.filter((s) => s.current_status === 'DECAYING').length;
  const avgDecayPct = (filteredStrategies.reduce((sum, s) => sum + s.alpha_decay_pct, 0) / (filteredStrategies.length || 1)).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Top Banner with AI Brain & HMM State */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-zinc-900 border border-indigo-900/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Compass size={24} className="animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-zinc-100">AI Quantitative Brain: Dynamic HMM Transition & Strategy Alpha Decay</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Continuous Microstructure Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-3xl leading-relaxed">
                HashiBot continuously monitors statistical edge degradation (Alpha Decay) across market regimes using continuous Hidden Markov Models (HMM). 
                Strategies with high structural decay are dynamically de-weighted to prevent drawdown, while regime-aligned alpha engines receive expanded capital multiplier allocations.
              </p>
            </div>
          </div>

          {/* Quick Regime Toggle Simulator */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2 min-w-[260px]">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Active HMM Regime</span>
              <span className="text-indigo-400 font-mono text-[10px]">Real-time State</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setActiveRegime('REGIME_ACCUMULATION_GRID')}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeRegime === 'REGIME_ACCUMULATION_GRID'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                Accumulation
              </button>
              <button
                onClick={() => setActiveRegime('REGIME_DISTRIBUTION_TREND')}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeRegime === 'REGIME_DISTRIBUTION_TREND'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                Trend Flow
              </button>
              <button
                onClick={() => setActiveRegime('REGIME_LIQUIDITY_SHOCK')}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeRegime === 'REGIME_LIQUIDITY_SHOCK'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                Liq Shock
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 mb-1">Tracked Alpha Engines</div>
          <div className="text-xl font-bold text-zinc-100">{totalActiveStrategies} Strategies</div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">{primeStrategies} Prime</span> · {decayingStrategies} Throttled
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 mb-1">Average Alpha Decay Rate</div>
          <div className="text-xl font-bold text-emerald-400">{avgDecayPct}%</div>
          <div className="text-[11px] text-zinc-400 mt-1">Controlled degradation rate</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 mb-1">Current Regime Multiplier</div>
          <div className="text-xl font-bold text-indigo-400">
            {activeRegime === 'REGIME_DISTRIBUTION_TREND' ? '1.15x (Max Alpha)' : activeRegime === 'REGIME_ACCUMULATION_GRID' ? '0.75x (Range Scalp)' : '0.35x (Risk Shock)'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">Automatic Kelly Sizing</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>Auto-Rebalance Governor</span>
            <button
              onClick={() => setAutoRebalance(!autoRebalance)}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                autoRebalance ? 'bg-purple-500/20 text-purple-300' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {autoRebalance ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="text-xl font-bold text-purple-400 flex items-center gap-1.5">
            <Zap size={16} className={autoRebalance ? 'text-purple-400 fill-purple-400 animate-pulse' : 'text-zinc-600'} />
            {autoRebalance ? '5m Rebalance' : 'Manual'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
            <span>Synced: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <button
              onClick={() => setLastRefreshed(new Date())}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Refresh calibration"
            >
              <RefreshCw size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* Strategy Decay & Weighting Matrix Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/60">
          <div>
            <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 size={16} className="text-indigo-400" />
              Dynamic Strategy Alpha Decay & Regime Multiplier Matrix
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Real-time breakdown of win rate half-life, decay %, and HMM allocation multiplier.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedMarket('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedMarket === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Assets
            </button>
            <button
              onClick={() => setSelectedMarket('crypto')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedMarket === 'crypto' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Crypto
            </button>
            <button
              onClick={() => setSelectedMarket('forex')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedMarket === 'forex' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Forex & Metals
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold">Strategy & Archetype</th>
                <th className="text-left px-3 py-3 font-semibold">Market</th>
                <th className="text-right px-3 py-3 font-semibold">30d Win Rate</th>
                <th className="text-right px-3 py-3 font-semibold">Alpha Decay</th>
                <th className="text-right px-3 py-3 font-semibold">Half-Life</th>
                <th className="text-center px-3 py-3 font-semibold">Status</th>
                <th className="text-right px-3 py-3 font-semibold">Regime Affinity</th>
                <th className="text-right px-3 py-3 font-semibold">HMM Allocation</th>
                <th className="text-left px-4 py-3 font-semibold">AI Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredStrategies.map((strat) => {
                const affinity = strat.regime_affinity[activeRegime];
                const dynamicWeight = (strat.current_weight * affinity).toFixed(2);
                const isThrottled = Number(dynamicWeight) < 0.5;

                return (
                  <tr key={strat.strategy_id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-zinc-100">{strat.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{strat.archetype}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        strat.market === 'crypto' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        strat.market === 'gold' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {strat.market}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">
                      <span className="text-emerald-400 font-bold">{strat.rolling_win_rate_30d}%</span>
                      <span className="text-[10px] text-zinc-500 block">Peak: {strat.peak_win_rate}%</span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">
                      <span className={`font-bold ${strat.alpha_decay_pct > 8 ? 'text-amber-400' : 'text-zinc-300'}`}>
                        -{strat.alpha_decay_pct}%
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-zinc-400">
                      {strat.half_life_days} days
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        strat.current_status === 'PRIME' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        strat.current_status === 'DECAYING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                      }`}>
                        {strat.current_status}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">
                      <span className={`font-bold ${affinity >= 1.0 ? 'text-emerald-400' : affinity >= 0.6 ? 'text-blue-400' : 'text-zinc-500'}`}>
                        {(affinity * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        Number(dynamicWeight) >= 1.0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        Number(dynamicWeight) >= 0.6 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {dynamicWeight}x
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300 max-w-[280px]">
                      <div className="leading-snug">{strat.recommended_action}</div>
                      {isThrottled && (
                        <div className="text-[10px] text-amber-400 font-semibold mt-0.5 flex items-center gap-1">
                          <AlertTriangle size={10} /> Auto-throttled to preserve drawdown
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
