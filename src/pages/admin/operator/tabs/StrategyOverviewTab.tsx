import { useState, useMemo } from 'react';
import {
  Cpu,
  ShieldCheck,
  Zap,
  Filter,
  Activity,
  Gauge,
  Sliders,
} from 'lucide-react';

interface StrategyCardData {
  id: string;
  name: string;
  category: 'Crypto' | 'Forex' | 'Metals & Macro';
  timeframe: string;
  regime: 'GRID' | 'TREND' | 'SHOCK' | 'ALL';
  minConfidence: number;
  minRR: string;
  symbols: string;
  description: string;
  mathematicalFormula: string;
  microstructureFilter: string;
  riskGuard: string;
  status: 'ACTIVE' | 'HOT_STANDBY';
  executionEngine: 'Python HFT Core' | 'V2 Engine & Edge' | 'MT5 ZeroMQ Bridge';
}

const STRATEGIES_12: StrategyCardData[] = [
  {
    id: 'crypto.micro-scalper',
    name: 'Crypto MicroScalper',
    category: 'Crypto',
    timeframe: '1m / 5m / 15m',
    regime: 'GRID',
    minConfidence: 80,
    minRR: '1:2.0',
    symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT',
    description: 'Bollinger Band & RSI mean-reversion engine with instantaneous abort upon Garman-Klass volatility surge above 24h baseline.',
    mathematicalFormula: 'P <= BB_lower(20, 2.2) ∧ RSI(14) <= 30 | Directional Pressure = Σ(|C-O|/(H-L))',
    microstructureFilter: 'GK Vol < μ_24h (0.00025) | Suspended in TREND / SHOCK mode',
    riskGuard: 'Regime Lock: Restricted strictly to GRID mode to avoid fading violent trend cascades',
    status: 'ACTIVE',
    executionEngine: 'Python HFT Core',
  },
  {
    id: 'crypto.compression-breakout',
    name: 'Crypto Compression Breakout',
    category: 'Crypto',
    timeframe: '15m / 1h',
    regime: 'TREND',
    minConfidence: 85,
    minRR: '1:2.5',
    symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT',
    description: 'Donchian Channel box range breakout with expansion filter. Blocks Asian session entries if tick frequency drops below 500/hr.',
    mathematicalFormula: 'Donchian Breakout High/Low(20) ∧ ATR_expansion >= 1.15x',
    microstructureFilter: 'Asian Session Volume Guard: >= 500 ticks/hr required | ATR Extension <= 1.4x',
    riskGuard: 'Late breakout penalty applied when entry extends > 1.4 ATR from box boundary',
    status: 'ACTIVE',
    executionEngine: 'V2 Engine & Edge',
  },
  {
    id: 'crypto.swing-continuation',
    name: 'Crypto Swing Continuation',
    category: 'Crypto',
    timeframe: '1h / 4h',
    regime: 'TREND',
    minConfidence: 88,
    minRR: '1:3.0',
    symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, AVAXUSDT',
    description: 'Multi-timeframe 50-EMA trend alignment system. Automatically shuts down when EMA slope flattens, avoiding range chop fees.',
    mathematicalFormula: 'EMA_slope_8 >= 0.15% ∧ Pullback to EMA50 ± 0.5 ATR ∧ HTF 4h Trend > EMA200',
    microstructureFilter: 'Slope Flattening Guard: |slope| < 0.15% triggers immediate chop suspension',
    riskGuard: 'Minimum 1:1.75 R/R enforced with 1.5 ATR trailing structural swing stops',
    status: 'ACTIVE',
    executionEngine: 'V2 Engine & Edge',
  },
  {
    id: 'crypto.reversal-exhaustion',
    name: 'Crypto Reversal Exhaustion',
    category: 'Crypto',
    timeframe: '15m / 1h',
    regime: 'GRID',
    minConfidence: 78,
    minRR: '1:2.0',
    symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, DOGEUSDT',
    description: 'Overextended RSI extreme fade. Inhibits fade entries whenever the market enters confirmed parabolic momentum regimes.',
    mathematicalFormula: 'RSI(14) <= 20 (Oversold Bounce) ∨ RSI(14) >= 80 (Overbought Fade)',
    microstructureFilter: 'Parabolic Trend Inhibitor: Locked out when Schmitt Trigger == TREND',
    riskGuard: 'Fixed 1.4 ATR stop loss with strict dual-take-profit bracket (1.0R / 2.0R)',
    status: 'ACTIVE',
    executionEngine: 'Python HFT Core',
  },
  {
    id: 'crypto.momentum-breakout',
    name: 'Crypto Momentum Breakout',
    category: 'Crypto',
    timeframe: '15m / 1h',
    regime: 'TREND',
    minConfidence: 90,
    minRR: '1:3.0',
    symbols: 'BTCUSDT, ETHUSDT, SOLUSDT, NEARUSDT',
    description: 'Keltner Channel momentum surge verified against Level-3 Order Book Imbalance (OBI > +0.65) to protect against fake spoof walls.',
    mathematicalFormula: 'Close > KC_upper(EMA20, 2.0 ATR) ∧ L3 OBI >= +0.65',
    microstructureFilter: 'Hardware-Accelerated L3 OBI: Bid/Ask velocity delta confirmation required',
    riskGuard: 'Regime Lock: Authorized strictly in TREND mode; aborts if OBI flips negative',
    status: 'ACTIVE',
    executionEngine: 'Python HFT Core',
  },
  {
    id: 'forex.micro-scalper',
    name: 'Forex MicroScalper',
    category: 'Forex',
    timeframe: '5m / 15m',
    regime: 'GRID',
    minConfidence: 82,
    minRR: '1:2.0',
    symbols: 'EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD',
    description: 'FX majors momentum scalper with automatic 2.0-pip buffer to offset Asian session rollover spreads and MT5 bridge latency.',
    mathematicalFormula: 'Close > EMA20 + 2.0 pips ∧ EMA20 > EMA50 ∧ Spread <= 1.8 pips',
    microstructureFilter: 'Pip-Normalized Distance: >= 7 pips (USDJPY) / >= 6 pips (Majors)',
    riskGuard: 'Dynamic Entry Band buffer + Asian rollover spread expansion lockout',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'forex.london-breakout',
    name: 'London Breakout',
    category: 'Forex',
    timeframe: '15m (07:00–10:00 UTC)',
    regime: 'TREND',
    minConfidence: 85,
    minRR: '1:2.5',
    symbols: 'GBPUSD, EURUSD, EURGBP, GBPJPY',
    description: 'London Open Asian range expansion (07:00–10:00 UTC) with initial wick analysis to eliminate liquidity-grabbing Judas Swings.',
    mathematicalFormula: 'Breakout(Asian_Range 00:00-07:00 UTC) ∧ Candle Wick Ratio < 50%',
    microstructureFilter: 'Judas Swing Wick Guard: Candle body must exceed upper/lower wick by >= 50%',
    riskGuard: 'Asian range width ceiling: Aborts if overnight Asian span > 8 ATR (overnight shock)',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'forex.new-york-continuation',
    name: 'NY Continuation',
    category: 'Forex',
    timeframe: '15m / 1h (12:00–16:00 UTC)',
    regime: 'TREND',
    minConfidence: 84,
    minRR: '1:2.5',
    symbols: 'EURUSD, GBPUSD, USDCAD, USDCHF',
    description: 'US Session trend continuation engine with automated 30-minute pre-release macro news lockouts (NFP, CPI, FOMC).',
    mathematicalFormula: 'Session Displacement = (P - NY_Open) / ATR ∈ [0.25, 3.2] ∧ sign(London) == sign(NY)',
    microstructureFilter: 'Macro News Gate: Automated 30-min pre/post high-impact economic calendar freeze',
    riskGuard: 'Exhaustion filter: Rejects trade setups if pre-NY move is already extended > 3.2 ATR',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'forex.trend-pullback',
    name: 'Forex Trend Pullback',
    category: 'Forex',
    timeframe: '15m / 1h',
    regime: 'TREND',
    minConfidence: 86,
    minRR: '1:2.5',
    symbols: 'EURUSD, GBPUSD, AUDUSD, NZDUSD',
    description: 'Pullback engine requiring central bank yield differential confirmation in alignment with technical EMA trend direction.',
    mathematicalFormula: 'Pullback Depth = |Close - EMA30| / ATR <= 0.80 ∧ sign(Yield_Diff_bps) == sign(Trend)',
    microstructureFilter: 'Sovereign Yield Spread: Differential must be positive for longs, negative for shorts',
    riskGuard: 'Friday 20:00 UTC weekend exposure lockout + 4.0 ATR maximum stop ceiling',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'forex.session-orb',
    name: 'Forex Session ORB',
    category: 'Forex',
    timeframe: '5m',
    regime: 'TREND',
    minConfidence: 83,
    minRR: '1:2.0',
    symbols: 'EURUSD, GBPUSD, USDJPY, XAUUSD',
    description: '5m Opening Range Breakout engine with Hysteresis Schmitt Trigger cooldown deadband to eliminate boundary flickering.',
    mathematicalFormula: 'Close > max(High_1..3) ∨ Close < min(Low_1..3) with 5m Cooldown Deadband',
    microstructureFilter: 'Hysteresis Cooldown: 300s deadband prevents oscillation on structural boundaries',
    riskGuard: 'Pre-session Garman-Klass Volatility Shock barrier (aborts if σ_GK^2 > 0.00050)',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'gold.volatility-breakout',
    name: 'Gold Volatility Breakout',
    category: 'Metals & Macro',
    timeframe: '15m',
    regime: 'TREND',
    minConfidence: 88,
    minRR: '1:2.5',
    symbols: 'XAUUSD (Spot Gold)',
    description: 'Certified 6-hour compression box breakout on Spot Gold with emergency spread-widening shock skip filter.',
    mathematicalFormula: 'Box Lookback 24 bars (6h UTC) ∧ Width ATR ∈ [0.8, 5.5] ∧ Two-Bar Closed Confirmation',
    microstructureFilter: 'Emergency Spread Filter: Rejects execution if live broker spread > 45 points ($0.45)',
    riskGuard: 'Adverse wick ratio <= 0.48 + Max EMA20 extension <= 2.4 ATR + Friday 20:00 UTC hard stop',
    status: 'ACTIVE',
    executionEngine: 'MT5 ZeroMQ Bridge',
  },
  {
    id: 'macro.yield-differential',
    name: 'Macro Yield Differential',
    category: 'Metals & Macro',
    timeframe: '4h / Daily',
    regime: 'ALL',
    minConfidence: 90,
    minRR: '1:3.0',
    symbols: 'US10Y, DE10Y, GB10Y, JP10Y (Cross-Asset)',
    description: 'Sovereign 10Y bond yield spread divergence (> 25 bps) serving as global directional anchor for multi-timeframe order netting.',
    mathematicalFormula: 'ΔY = Y_base - Y_quote > +25 bps (Long) | ΔY < -25 bps (Short) ∧ P > EMA50_4h',
    microstructureFilter: 'Real-time sovereign yield spread delta injected via Redis bus',
    riskGuard: 'Global directional anchor: Nets and absorbs opposing micro timeframes with 0 broker fees',
    status: 'ACTIVE',
    executionEngine: 'Python HFT Core',
  },
];

export function StrategyOverviewTab() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedRegime, setSelectedRegime] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedStrategyId, setExpandedStrategyId] = useState<string | null>(null);

  const filteredStrategies = useMemo(() => {
    return STRATEGIES_12.filter((st) => {
      const matchCategory = selectedCategory === 'ALL' || st.category === selectedCategory;
      const matchRegime = selectedRegime === 'ALL' || st.regime === selectedRegime || st.regime === 'ALL';
      const matchSearch =
        searchQuery === '' ||
        st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.symbols.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchRegime && matchSearch;
    });
  }, [selectedCategory, selectedRegime, searchQuery]);

  const stats = useMemo(() => {
    const cryptoCount = STRATEGIES_12.filter((s) => s.category === 'Crypto').length;
    const forexCount = STRATEGIES_12.filter((s) => s.category === 'Forex').length;
    const metalsCount = STRATEGIES_12.filter((s) => s.category === 'Metals & Macro').length;
    return { cryptoCount, forexCount, metalsCount, total: STRATEGIES_12.length };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Cpu className="text-blue-400" size={18} /> Quantitative Strategy Suite (12 Production Models)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Microstructure-aware, decoupled algorithmic execution models across Crypto, Forex, Metals, and Sovereign Yields.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono font-bold flex items-center gap-1.5">
            <Activity size={13} /> {stats.total} Strategies Active
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono font-bold flex items-center gap-1.5">
            <ShieldCheck size={13} /> Pre-Trade Risk Bound
          </span>
        </div>
      </div>

      {/* Account Execution Modes Top Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Zap size={16} />
              MODE 1: AGGRESSIVE_PERSONAL
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono font-bold border border-amber-500/30">
              2.5x VaR MULTIPLIER
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            High capital velocity with <code className="text-amber-300 font-mono">ISOLATED</code> margin enforcement on crypto exchanges, 2.5x expanded portfolio Value at Risk (VaR) budget, and sub-timeframe multi-directional hedging allowed.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-3 pt-1">
            <span>• Margin: <strong className="text-zinc-200">ISOLATED</strong></span>
            <span>• VaR Cap: <strong className="text-amber-300">$62,500 USD</strong></span>
            <span>• Hedging: <strong className="text-emerald-400">ENABLED</strong></span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <ShieldCheck size={16} />
              MODE 2: STRICT_PROP_GUARDRAIL
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono font-bold border border-emerald-500/30">
              4.5% ZERO-MQ BREAKER
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Zero-tolerance prop guardrail with 50ms active watchdog transmitting <code className="text-emerald-300 font-mono">EMERGENCY_CLOSE_ALL</code> at 4.5% daily drawdown, 50% GK volatility haircut, zero-fee internal order netting, and Friday 20:00 UTC liquidation.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-3 pt-1">
            <span>• DD Breaker: <strong className="text-emerald-300">4.5% Hard Stop</strong></span>
            <span>• Vol Haircut: <strong className="text-emerald-300">-50% Size</strong></span>
            <span>• Weekend: <strong className="text-zinc-200">Fri 20:00 UTC Out</strong></span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800">
            <Filter size={13} className="text-zinc-400 ml-1" />
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                selectedCategory === 'ALL' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setSelectedCategory('Crypto')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                selectedCategory === 'Crypto' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Crypto ({stats.cryptoCount})
            </button>
            <button
              onClick={() => setSelectedCategory('Forex')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                selectedCategory === 'Forex' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Forex ({stats.forexCount})
            </button>
            <button
              onClick={() => setSelectedCategory('Metals & Macro')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                selectedCategory === 'Metals & Macro' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Metals & Macro ({stats.metalsCount})
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800">
            <span className="text-[10px] text-zinc-500 font-bold px-1 uppercase">Regime:</span>
            {['ALL', 'GRID', 'TREND'].map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRegime(r)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition ${
                  selectedRegime === r ? 'bg-zinc-800 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full md:w-64">
          <input
            type="text"
            placeholder="Search strategy, symbol, or filter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>
      </div>

      {/* Strategies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredStrategies.map((st) => {
          const isExpanded = expandedStrategyId === st.id;
          return (
            <div
              key={st.id}
              className={`rounded-2xl border transition-all duration-200 bg-zinc-900/80 p-5 space-y-3.5 shadow-lg flex flex-col justify-between ${
                isExpanded ? 'border-blue-500/50 bg-zinc-900' : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Card Header */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-zinc-100">{st.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {st.id}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{st.symbols}</div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        st.regime === 'GRID'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : st.regime === 'TREND'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                      }`}
                    >
                      {st.regime}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      {st.timeframe}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">{st.description}</p>
              </div>

              {/* Formula & Microstructure Snippets */}
              <div className="space-y-2 pt-1">
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-2.5 font-mono text-[11px] space-y-1">
                  <div className="text-zinc-500 text-[10px] uppercase font-bold flex items-center justify-between">
                    <span>Mathematical Gate</span>
                    <span className="text-blue-400">{st.executionEngine}</span>
                  </div>
                  <div className="text-zinc-200 overflow-x-auto whitespace-nowrap scrollbar-thin">
                    {st.mathematicalFormula}
                  </div>
                </div>

                <div className="bg-zinc-950/40 border border-zinc-800/50 rounded-xl p-2.5 text-[11px] space-y-1">
                  <div className="text-amber-400/90 font-mono text-[10px] uppercase font-bold flex items-center gap-1">
                    <Gauge size={12} /> Microstructure Filter
                  </div>
                  <div className="text-zinc-300 font-mono text-[10.5px]">{st.microstructureFilter}</div>
                </div>

                {isExpanded && (
                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-2.5 text-[11px] space-y-1 mt-2">
                    <div className="text-emerald-400 font-mono text-[10px] uppercase font-bold flex items-center gap-1">
                      <ShieldCheck size={12} /> Pre-Trade Risk Guardrail
                    </div>
                    <div className="text-zinc-300 text-[11px]">{st.riskGuard}</div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-zinc-400">
                    Min Conf: <strong className="text-zinc-200">{st.minConfidence}%</strong>
                  </span>
                  <span className="text-zinc-400">
                    Min R:R: <strong className="text-zinc-200">{st.minRR}</strong>
                  </span>
                </div>

                <button
                  onClick={() => setExpandedStrategyId(isExpanded ? null : st.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition"
                >
                  <Sliders size={13} /> {isExpanded ? 'Less Details' : 'Full Parameters'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
