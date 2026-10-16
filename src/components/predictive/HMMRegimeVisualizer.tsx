import { useState } from 'react';
import {
  Activity,
  Layers,
  TrendingUp,
  AlertTriangle,
  Zap,
  Cpu,
  BarChart3,
  Compass,
} from 'lucide-react';

export type MarketRegimeToken = 'REGIME_ACCUMULATION_GRID' | 'REGIME_DISTRIBUTION_TREND' | 'REGIME_LIQUIDITY_SHOCK';

export interface HMMRegimeData {
  symbol: string;
  p_accumulation_grid: number;
  p_distribution_trend: number;
  p_liquidity_shock: number;
  dominant_regime: MarketRegimeToken;
  entropy: number;
  strategy_multipliers: Record<string, number>;
  garman_klass_volatility: number;
  order_book_imbalance: number;
  vwas_bps: number;
  yield_funding_spread_bps: number;
  timestamp_iso: string;
}

const DEFAULT_HMM_DATA: Record<string, HMMRegimeData> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    p_accumulation_grid: 0.12,
    p_distribution_trend: 0.84,
    p_liquidity_shock: 0.04,
    dominant_regime: 'REGIME_DISTRIBUTION_TREND',
    entropy: 0.72,
    garman_klass_volatility: 0.00048,
    order_book_imbalance: 0.42,
    vwas_bps: 2.1,
    yield_funding_spread_bps: 1.2,
    timestamp_iso: new Date().toISOString(),
    strategy_multipliers: {
      'crypto.micro-scalper': 0.11,
      'crypto.quick-scalp': 0.11,
      'crypto.compression-breakout': 1.09,
      'crypto.swing-continuation': 0.84,
      'crypto.reversal-exhaustion': 0.13,
      'crypto.momentum-breakout': 1.18,
      'forex.micro-scalper': 0.11,
      'forex.london-breakout': 0.84,
      'forex.new-york-continuation': 0.84,
      'forex.trend-pullback': 0.84,
      'gold.volatility-breakout': 0.70,
      'macro.yield-differential': 0.84,
    },
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    p_accumulation_grid: 0.28,
    p_distribution_trend: 0.68,
    p_liquidity_shock: 0.04,
    dominant_regime: 'REGIME_DISTRIBUTION_TREND',
    entropy: 0.98,
    garman_klass_volatility: 0.00062,
    order_book_imbalance: 0.25,
    vwas_bps: 3.4,
    yield_funding_spread_bps: 1.8,
    timestamp_iso: new Date().toISOString(),
    strategy_multipliers: {
      'crypto.micro-scalper': 0.25,
      'crypto.quick-scalp': 0.25,
      'crypto.compression-breakout': 0.88,
      'crypto.swing-continuation': 0.68,
      'crypto.reversal-exhaustion': 0.31,
      'crypto.momentum-breakout': 0.95,
      'forex.micro-scalper': 0.25,
      'forex.london-breakout': 0.68,
      'forex.new-york-continuation': 0.68,
      'forex.trend-pullback': 0.68,
      'gold.volatility-breakout': 0.58,
      'macro.yield-differential': 0.68,
    },
  },
  EURUSD: {
    symbol: 'EURUSD',
    p_accumulation_grid: 0.78,
    p_distribution_trend: 0.20,
    p_liquidity_shock: 0.02,
    dominant_regime: 'REGIME_ACCUMULATION_GRID',
    entropy: 0.81,
    garman_klass_volatility: 0.00019,
    order_book_imbalance: -0.10,
    vwas_bps: 0.6,
    yield_funding_spread_bps: 0.4,
    timestamp_iso: new Date().toISOString(),
    strategy_multipliers: {
      'crypto.micro-scalper': 0.74,
      'crypto.quick-scalp': 0.74,
      'crypto.compression-breakout': 0.26,
      'crypto.swing-continuation': 0.20,
      'crypto.reversal-exhaustion': 0.89,
      'crypto.momentum-breakout': 0.28,
      'forex.micro-scalper': 0.74,
      'forex.london-breakout': 0.20,
      'forex.new-york-continuation': 0.20,
      'forex.trend-pullback': 0.20,
      'gold.volatility-breakout': 0.18,
      'macro.yield-differential': 0.20,
    },
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    p_accumulation_grid: 0.10,
    p_distribution_trend: 0.75,
    p_liquidity_shock: 0.15,
    dominant_regime: 'REGIME_DISTRIBUTION_TREND',
    entropy: 1.05,
    garman_klass_volatility: 0.00095,
    order_book_imbalance: 0.55,
    vwas_bps: 4.8,
    yield_funding_spread_bps: 2.5,
    timestamp_iso: new Date().toISOString(),
    strategy_multipliers: {
      'crypto.micro-scalper': 0.06,
      'crypto.quick-scalp': 0.06,
      'crypto.compression-breakout': 0.61,
      'crypto.swing-continuation': 0.47,
      'crypto.reversal-exhaustion': 0.08,
      'crypto.momentum-breakout': 0.66,
      'forex.micro-scalper': 0.06,
      'forex.london-breakout': 0.47,
      'forex.new-york-continuation': 0.47,
      'forex.trend-pullback': 0.47,
      'gold.volatility-breakout': 0.92,
      'macro.yield-differential': 0.47,
    },
  },
};

export function HMMRegimeVisualizer({
  initialSymbol = 'BTCUSDT',
  dataOverride,
}: {
  initialSymbol?: string;
  dataOverride?: HMMRegimeData;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const data = dataOverride || DEFAULT_HMM_DATA[selectedSymbol] || DEFAULT_HMM_DATA.BTCUSDT;

  const getRegimeColor = (regime: MarketRegimeToken) => {
    switch (regime) {
      case 'REGIME_ACCUMULATION_GRID':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'REGIME_DISTRIBUTION_TREND':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'REGIME_LIQUIDITY_SHOCK':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
    }
  };

  const getRegimeBadge = (regime: MarketRegimeToken) => {
    switch (regime) {
      case 'REGIME_ACCUMULATION_GRID':
        return { label: 'ACCUMULATION / MEAN-REVERTING', icon: Layers, color: 'text-blue-400' };
      case 'REGIME_DISTRIBUTION_TREND':
        return { label: 'DISTRIBUTION / STRONG MOMENTUM', icon: TrendingUp, color: 'text-emerald-400' };
      case 'REGIME_LIQUIDITY_SHOCK':
        return { label: 'LIQUIDITY SHOCK / VOLATILITY SPIKE', icon: AlertTriangle, color: 'text-red-400' };
    }
  };

  const currentBadge = getRegimeBadge(data.dominant_regime);
  const DominantIcon = currentBadge.icon;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-6 shadow-xl">
      {/* Header with Symbol Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Compass size={18} />
            </span>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Continuous HMM Microstructure Engine
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                LIVE FILTER
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Multivariate Gaussian forward-filtering across Garman-Klass Volatility, L3 Order Book Imbalance, and Spread dynamics.
          </p>
        </div>

        {/* Symbol Selector Pills */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          {Object.keys(DEFAULT_HMM_DATA).map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition ${
                selectedSymbol === sym
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Dominant Regime & Microstructural Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Dominant State Banner */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between ${getRegimeColor(data.dominant_regime)}`}>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider opacity-75">Dominant Market State</div>
            <div className="text-lg font-black tracking-tight flex items-center gap-2 mt-1">
              <DominantIcon size={20} className={currentBadge.color} />
              {currentBadge.label}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400">State Confidence</span>
            <span className="font-bold">
              {Math.round(
                Math.max(data.p_accumulation_grid, data.p_distribution_trend, data.p_liquidity_shock) * 100
              )}
              %
            </span>
          </div>
        </div>

        {/* Microstructural Live Readings */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Activity size={12} className="text-blue-400" /> Continuous Microstructure Inputs
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
              <div className="text-zinc-500 text-[10px]">Garman-Klass Vol</div>
              <div className="font-bold text-zinc-200">{(data.garman_klass_volatility * 100).toFixed(4)}%</div>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
              <div className="text-zinc-500 text-[10px]">Order Book Imbalance</div>
              <div className={`font-bold ${data.order_book_imbalance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.order_book_imbalance > 0 ? `+${(data.order_book_imbalance * 100).toFixed(1)}%` : `${(data.order_book_imbalance * 100).toFixed(1)}%`}
              </div>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
              <div className="text-zinc-500 text-[10px]">VWAS Spread</div>
              <div className="font-bold text-zinc-200">{data.vwas_bps.toFixed(1)} bps</div>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
              <div className="text-zinc-500 text-[10px]">Funding / Yield Spread</div>
              <div className="font-bold text-zinc-200">{data.yield_funding_spread_bps.toFixed(1)} bps</div>
            </div>
          </div>
        </div>

        {/* Transition Entropy & Stability Meter */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Cpu size={12} className="text-indigo-400" /> State Transition Entropy
            </div>
            <div className="text-2xl font-black font-mono text-zinc-100 mt-1">
              {data.entropy.toFixed(3)} <span className="text-xs font-normal text-zinc-500">bits</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {data.entropy < 0.8
                ? 'High state stability. Clear directional or range regime.'
                : data.entropy < 1.1
                ? 'Moderate transition tension. Mixed microstructural cues.'
                : 'High structural ambiguity. Dynamic position sizing throttled.'}
            </p>
          </div>
          <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full transition-all duration-500 ${
                data.entropy < 0.8 ? 'bg-emerald-500' : data.entropy < 1.1 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, (data.entropy / 1.5) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Continuous Posterior Probability Breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 size={14} className="text-indigo-400" /> Continuous Posterior State Probabilities (P(S_t | O_1:t))
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Accumulation Grid */}
          <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-blue-400 font-bold flex items-center gap-1">
                <Layers size={13} /> Accumulation Grid
              </span>
              <span className="font-mono font-bold text-zinc-200">
                {(data.p_accumulation_grid * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${data.p_accumulation_grid * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500">Favors range mean-reversion, grid scalping, and micro-scalp strategies.</p>
          </div>

          {/* Distribution Trend */}
          <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <TrendingUp size={13} /> Distribution Trend
              </span>
              <span className="font-mono font-bold text-zinc-200">
                {(data.p_distribution_trend * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${data.p_distribution_trend * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500">Favors compression breakout, swing trend continuations, and momentum bursts.</p>
          </div>

          {/* Liquidity Shock */}
          <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-red-400 font-bold flex items-center gap-1">
                <AlertTriangle size={13} /> Liquidity Shock
              </span>
              <span className="font-mono font-bold text-zinc-200">
                {(data.p_liquidity_shock * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${data.p_liquidity_shock * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500">Triggers adaptive size haircuts and dampens exposure to prevent slippage shocks.</p>
          </div>
        </div>
      </div>

      {/* Dynamic Predictive Strategy Multiplier Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            <Zap size={14} className="text-amber-400" /> Active Strategy Scaling Weights (HMM Multiplier Matrix)
          </h4>
          <span className="text-[10px] font-mono text-zinc-500">Auto-calculated per tick</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {Object.entries(data.strategy_multipliers).map(([strat, mult]) => {
            const isBoosted = mult > 1.0;
            const isThrottled = mult < 0.3;
            return (
              <div
                key={strat}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  isBoosted
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                    : isThrottled
                    ? 'bg-zinc-950/40 border-zinc-800/60 text-zinc-500 opacity-60'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                }`}
              >
                <div className="truncate pr-2">
                  <div className="font-mono font-medium truncate text-[11px]">{strat}</div>
                  <div className="text-[9px] text-zinc-500">
                    {isBoosted ? 'BOOSTED' : isThrottled ? 'THROTTLED' : 'ACTIVE'}
                  </div>
                </div>
                <div className="font-mono font-bold text-xs whitespace-nowrap">
                  {mult.toFixed(2)}x
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

