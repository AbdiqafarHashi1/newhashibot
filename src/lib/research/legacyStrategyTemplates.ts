/** Historical research templates only. These constants are not calibration or live approval evidence. */
export type StrategyName =
  | 'CryptoMicroScalper'
  | 'CryptoCompressionBreakout'
  | 'CryptoSwingContinuation'
  | 'CryptoReversalExhaustion'
  | 'CryptoMomentumBreakout'
  | 'FXMicroScalper'
  | 'LondonBreakout'
  | 'NYContinuation'
  | 'FXTrendPullback'
  | 'SessionORB'
  | 'GoldVolatilityBreakout'
  | 'MacroYieldDifferential';

type FieldGroup = 'Quality Gates' | 'Timeframes' | 'Indicators' | 'Entry Filters' | 'Stop/TP/Risk' | 'Strategy-Specific';

type ParamField = {
  key: string;
  label: string;
  helper: string;
  group: FieldGroup;
  min?: number;
  max?: number;
  step?: number;
};

export type AIRecommendationState = {
  status: 'PRIME' | 'MONITORING' | 'RECALIBRATING' | 'RETIRED';
  action: string;
  regime_affinity: string;
  weight_multiplier: number;
  alpha_half_life_days: number;
  alpha_decay_score: number;
  last_recalibrated: string;
};

type StrategyDefinition = {
  name: StrategyName;
  displayName: string;
  description: string;
  marketType: 'crypto' | 'forex';
  signalStyle: 'scalper' | 'swing' | 'forex_signal';
  defaultMeta: Pick<
    EditState,
    | 'enabled'
    | 'market_type'
    | 'signal_style'
    | 'risk_mode'
    | 'allowed_timeframes'
    | 'min_score'
    | 'min_rr'
    | 'min_stop_distance_pct'
    | 'min_tp1_distance_pct'
    | 'min_tp2_distance_pct'
    | 'max_bars_in_trade'
  >;
  defaultParams: Record<string, number>;
  defaultAI: AIRecommendationState;
  params: ParamField[];
  allowedTimeframes: string[];
  codeNotes: string;
};

type EditState = {
  enabled: boolean;
  market_type: string;
  signal_style: string;
  risk_mode: string;
  allowed_timeframes: string[];
  min_score: number;
  min_rr: number;
  min_stop_distance_pct: number;
  min_tp1_distance_pct: number;
  min_tp2_distance_pct: number;
  max_bars_in_trade: number;
  params: Record<string, number>;
  ai: AIRecommendationState;
};

const indicatorFields: ParamField[] = [
  { key: 'ema_fast', label: 'EMA Fast', helper: 'Fast EMA baseline period (default 20).', group: 'Indicators', min: 2, step: 1 },
  { key: 'ema_slow', label: 'EMA Slow', helper: 'Slow EMA baseline period (default 50).', group: 'Indicators', min: 2, step: 1 },
  { key: 'rsi_len', label: 'RSI Length', helper: 'RSI period used by evaluator (default 14).', group: 'Indicators', min: 2, step: 1 },
  { key: 'atr_len', label: 'ATR Length', helper: 'ATR period used for volatility normalization (default 14).', group: 'Indicators', min: 1, step: 1 },
];

const rsiFilterFields: ParamField[] = [
  { key: 'rsi_buy_min', label: 'RSI Buy Min', helper: 'Minimum RSI required for long-side confirmation.', group: 'Entry Filters', min: 0, max: 100, step: 1 },
  { key: 'rsi_sell_max', label: 'RSI Sell Max', helper: 'Maximum RSI required for short-side confirmation.', group: 'Entry Filters', min: 0, max: 100, step: 1 },
];

const volatilityFields: ParamField[] = [
  { key: 'min_atr_pct', label: 'Min ATR %', helper: 'Rejects periods with volatility below this percentage.', group: 'Entry Filters', min: 0, step: 0.01 },
  { key: 'max_atr_pct', label: 'Max ATR %', helper: 'Rejects excessive volatility above this percentage.', group: 'Entry Filters', min: 0, step: 0.01 },
];

const stopFields: ParamField[] = [
  { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', helper: 'ATR multiple used to place stop distance.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
  { key: 'tp1_r', label: 'TP1 R Multiple', helper: 'First target distance in R units.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
  { key: 'tp2_r', label: 'TP2 R Multiple', helper: 'Second target distance in R units.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
];

const microSpecificFields: ParamField[] = [
  { key: 'momentum_lookback', label: 'Momentum Lookback', helper: 'Bars used for momentum confirmation.', group: 'Strategy-Specific', min: 1, step: 1 },
  { key: 'min_body_atr', label: 'Min Body / ATR', helper: 'Minimum candle body size relative to ATR.', group: 'Strategy-Specific', min: 0, step: 0.01 },
];

const compressionSpecificFields: ParamField[] = [
  { key: 'box_lookback', label: 'Box Lookback', helper: 'Prior candles used to build compression box.', group: 'Strategy-Specific', min: 10, step: 1 },
  { key: 'min_box_bars', label: 'Min Box Bars', helper: 'Minimum bars that must remain inside compression box.', group: 'Strategy-Specific', min: 4, step: 1 },
  { key: 'max_box_atr_range', label: 'Max Box ATR Range', helper: 'Maximum compression-box height measured in ATR units.', group: 'Strategy-Specific', min: 0.1, step: 0.1 },
  { key: 'atr_expansion_lookback', label: 'ATR Expansion Lookback', helper: 'Lookback window used for breakout expansion comparison.', group: 'Strategy-Specific', min: 5, step: 1 },
  { key: 'min_atr_expansion', label: 'Min ATR Expansion', helper: 'Breakout bar range must exceed baseline by this ratio.', group: 'Strategy-Specific', min: 0.1, step: 0.05 },
  { key: 'breakout_buffer_atr', label: 'Breakout Buffer ATR', helper: 'ATR buffer beyond the box required to confirm breakout.', group: 'Strategy-Specific', min: 0, step: 0.01 },
];

export const STRATEGY_DEFINITIONS: Record<StrategyName, StrategyDefinition> = {
  CryptoMicroScalper: {
    name: 'CryptoMicroScalper',
    displayName: 'Crypto Micro Scalper (1m/5m/15m)',
    description: 'Bollinger & RSI mean-reverting scalp with zero-lag Garman-Klass volatility cutoffs.',
    marketType: 'crypto',
    signalStyle: 'scalper',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['1m', '5m', '15m'], min_score: 80, min_rr: 1.2, min_stop_distance_pct: 0.18, min_tp1_distance_pct: 0.25, min_tp2_distance_pct: 0.40, max_bars_in_trade: 24 },
    defaultParams: { ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, rsi_buy_min: 30, rsi_sell_max: 70, min_atr_pct: 0.10, max_atr_pct: 3.0, stop_atr_mult: 1.4, tp1_r: 1.2, tp2_r: 2.0, momentum_lookback: 3, min_body_atr: 0.30 },
    defaultAI: {
      status: 'PRIME',
      action: 'Fires at structural exhaustion sweeps with CVD divergence confirmation in Range/Grid regimes.',
      regime_affinity: 'Accumulation / Range Grid',
      weight_multiplier: 1.15,
      alpha_half_life_days: 120,
      alpha_decay_score: 94,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields, ...rsiFilterFields, ...volatilityFields, ...stopFields, ...microSpecificFields],
    allowedTimeframes: ['1m', '5m', '15m'],
    codeNotes: 'Requires GRID regime token; aborts instantly if Garman-Klass Volatility > 24h average.',
  },
  CryptoCompressionBreakout: {
    name: 'CryptoCompressionBreakout',
    displayName: 'Crypto Compression Breakout (15m/1h)',
    description: 'Donchian Channel compression box breakout with Asian session tick rate gating.',
    marketType: 'crypto',
    signalStyle: 'scalper',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['15m', '1h'], min_score: 85, min_rr: 1.3, min_stop_distance_pct: 0.25, min_tp1_distance_pct: 0.35, min_tp2_distance_pct: 0.60, max_bars_in_trade: 48 },
    defaultParams: { rsi_len: 14, atr_len: 14, box_lookback: 20, min_box_bars: 8, max_box_atr_range: 1.05, atr_expansion_lookback: 24, min_atr_expansion: 1.15, breakout_buffer_atr: 0.12, stop_atr_mult: 1.4, tp1_r: 1.3, tp2_r: 2.5, min_ticks_per_hour: 500 },
    defaultAI: {
      status: 'PRIME',
      action: 'Capitalizes on volatility expansion following multi-hour base formation.',
      regime_affinity: 'Volatility Expansion / Breakout',
      weight_multiplier: 1.25,
      alpha_half_life_days: 140,
      alpha_decay_score: 96,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields.filter((f) => ['rsi_len', 'atr_len'].includes(f.key)), ...stopFields, ...compressionSpecificFields, { key: 'min_ticks_per_hour', label: 'Min Asian Ticks / Hr', helper: 'Rejects Asian session breakouts if tick count is below this threshold.', group: 'Entry Filters', min: 100, step: 50 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Rejects late entries extending > 1.4 ATR beyond box boundaries.',
  },
  CryptoSwingContinuation: {
    name: 'CryptoSwingContinuation',
    displayName: 'Crypto Swing Continuation (1h/4h)',
    description: 'Multi-timeframe EMA50 trend alignment system with EMA slope-flattening chop filter.',
    marketType: 'crypto',
    signalStyle: 'swing',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'swing', risk_mode: 'balanced', allowed_timeframes: ['1h', '4h'], min_score: 88, min_rr: 1.75, min_stop_distance_pct: 0.45, min_tp1_distance_pct: 0.70, min_tp2_distance_pct: 1.20, max_bars_in_trade: 96 },
    defaultParams: { ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_slope_pct: 0.15, stop_atr_mult: 1.5, tp1_r: 1.5, tp2_r: 3.0 },
    defaultAI: {
      status: 'PRIME',
      action: 'Rides sustained multi-day momentum; enforces HTF 4h Price > EMA200 guard.',
      regime_affinity: 'Distribution / Macro Trend',
      weight_multiplier: 1.10,
      alpha_half_life_days: 180,
      alpha_decay_score: 91,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields, ...stopFields, { key: 'min_slope_pct', label: 'Min EMA Slope %', helper: 'Shuts down if EMA50 slope falls below this percentage.', group: 'Entry Filters', min: 0.05, step: 0.05 }],
    allowedTimeframes: ['1h', '4h'],
    codeNotes: 'Requires HTF 4h Price > EMA200 for longs; avoids distribution range fee bleed.',
  },
  CryptoReversalExhaustion: {
    name: 'CryptoReversalExhaustion',
    displayName: 'Crypto Reversal Exhaustion (15m/1h)',
    description: 'Overextended RSI extreme sweep fade with parabolic trend inhibitor.',
    marketType: 'crypto',
    signalStyle: 'scalper',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['15m', '1h'], min_score: 78, min_rr: 1.4, min_stop_distance_pct: 0.30, min_tp1_distance_pct: 0.40, min_tp2_distance_pct: 0.70, max_bars_in_trade: 36 },
    defaultParams: { rsi_len: 14, atr_len: 14, exhaustion_threshold: 80, stop_atr_mult: 1.4, tp1_r: 1.0, tp2_r: 2.0 },
    defaultAI: {
      status: 'MONITORING',
      action: 'Fades unsustainable liquidity cascades once RSI > 80 / < 20 with CVD inflection.',
      regime_affinity: 'Mean Reversion / Exhaustion',
      weight_multiplier: 0.90,
      alpha_half_life_days: 75,
      alpha_decay_score: 84,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields.filter((f) => ['rsi_len', 'atr_len'].includes(f.key)), ...stopFields, { key: 'exhaustion_threshold', label: 'Exhaustion RSI Threshold', helper: 'RSI must exceed this extreme (or 100 - threshold for longs).', group: 'Entry Filters', min: 70, max: 95, step: 1 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Locked out whenever Schmitt Trigger arbitrator is in confirmed TREND mode.',
  },
  CryptoMomentumBreakout: {
    name: 'CryptoMomentumBreakout',
    displayName: 'Crypto Momentum Breakout (15m/1h)',
    description: 'Keltner momentum surge verified against Level-3 Order Book Imbalance (OBI > +0.65).',
    marketType: 'crypto',
    signalStyle: 'scalper',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['15m', '1h'], min_score: 90, min_rr: 1.5, min_stop_distance_pct: 0.25, min_tp1_distance_pct: 0.40, min_tp2_distance_pct: 0.75, max_bars_in_trade: 48 },
    defaultParams: { ema_fast: 20, atr_len: 14, atr_multiplier: 2.0, min_obi: 0.65, stop_atr_mult: 1.5, tp1_r: 1.5, tp2_r: 3.0 },
    defaultAI: {
      status: 'PRIME',
      action: 'Triggers on explosive order book depth velocity imbalance during trending sessions.',
      regime_affinity: 'High Momentum / Trend Surge',
      weight_multiplier: 1.20,
      alpha_half_life_days: 160,
      alpha_decay_score: 95,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields.filter((f) => ['ema_fast', 'atr_len'].includes(f.key)), ...stopFields, { key: 'min_obi', label: 'Min Level-3 OBI', helper: 'Minimum order book depth imbalance required to confirm true volume velocity.', group: 'Entry Filters', min: 0.50, max: 0.95, step: 0.05 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Strictly authorized ONLY when market regime token == TREND.',
  },
  FXMicroScalper: {
    name: 'FXMicroScalper',
    displayName: 'Forex FX Micro Scalper (5m/15m)',
    description: 'Forex majors scalper with 2.0-pip buffer for Asian session rollover and latency offset.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['5m', '15m'], min_score: 82, min_rr: 1.4, min_stop_distance_pct: 0.06, min_tp1_distance_pct: 0.08, min_tp2_distance_pct: 0.12, max_bars_in_trade: 32 },
    defaultParams: { ema_fast: 20, ema_slow: 50, spread_buffer_pips: 2.0, max_spread_pips: 1.8, stop_atr_mult: 1.5, tp1_r: 1.2, tp2_r: 2.0 },
    defaultAI: {
      status: 'PRIME',
      action: 'Micro-scalps EURUSD / GBPUSD during high liquidity overlaps with spread guards.',
      regime_affinity: 'London/NY Overlap Liquid',
      weight_multiplier: 1.05,
      alpha_half_life_days: 130,
      alpha_decay_score: 92,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields.filter((f) => ['ema_fast', 'ema_slow'].includes(f.key)), ...stopFields, { key: 'spread_buffer_pips', label: 'Spread Buffer (Pips)', helper: 'Offset added to entry parameters to account for broker spread widening.', group: 'Strategy-Specific', min: 0.5, step: 0.5 }],
    allowedTimeframes: ['5m', '15m'],
    codeNotes: 'MT5 ZeroMQ Bridge: Auto-buffers execution parameters on EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD.',
  },
  LondonBreakout: {
    name: 'LondonBreakout',
    displayName: 'Forex London Breakout (15m)',
    description: 'Forex 15m London Open (07:00–10:00 UTC) breakout with Judas Swing wick-ratio check.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['15m'], min_score: 85, min_rr: 1.5, min_stop_distance_pct: 0.08, min_tp1_distance_pct: 0.12, min_tp2_distance_pct: 0.20, max_bars_in_trade: 24 },
    defaultParams: { max_wick_ratio: 0.50, max_asian_range_atr: 8.0, stop_atr_mult: 1.8, tp1_r: 1.8, tp2_r: 2.8 },
    defaultAI: {
      status: 'PRIME',
      action: 'Executes clean breakouts outside Asian range (00:00-07:00 UTC) with wick rejection.',
      regime_affinity: 'London Session Opening',
      weight_multiplier: 1.30,
      alpha_half_life_days: 200,
      alpha_decay_score: 97,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...stopFields, { key: 'max_wick_ratio', label: 'Max Wick Ratio', helper: 'Rejects setups where upper/lower wick is >= 50% of candle span (Judas Swing).', group: 'Entry Filters', min: 0.30, max: 0.70, step: 0.05 }],
    allowedTimeframes: ['15m'],
    codeNotes: 'Active only between 07:00 and 10:00 UTC; evaluates 00:00-07:00 UTC Asian consolidation range.',
  },
  NYContinuation: {
    name: 'NYContinuation',
    displayName: 'Forex NY Continuation (15m/1h)',
    description: 'Forex 15m/1h US Session (12:00–16:00 UTC) trend continuation with 30-min pre-news lockout.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['15m', '1h'], min_score: 84, min_rr: 1.4, min_stop_distance_pct: 0.08, min_tp1_distance_pct: 0.12, min_tp2_distance_pct: 0.20, max_bars_in_trade: 36 },
    defaultParams: { max_displacement_atr: 3.2, pre_news_lockout_mins: 30, stop_atr_mult: 1.8, tp1_r: 1.6, tp2_r: 2.8 },
    defaultAI: {
      status: 'PRIME',
      action: 'Picks up high-conviction US morning trends; protects against CPI/NFP headline spikes.',
      regime_affinity: 'New York Session Trend',
      weight_multiplier: 1.15,
      alpha_half_life_days: 150,
      alpha_decay_score: 93,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...stopFields, { key: 'pre_news_lockout_mins', label: 'Pre-News Freeze (Mins)', helper: 'Minutes prior to CPI/NFP/FOMC during which execution is frozen.', group: 'Quality Gates', min: 15, max: 60, step: 5 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Rejects overextended setups (> 3.2 ATR displacement) to prevent buying local tops.',
  },
  FXTrendPullback: {
    name: 'FXTrendPullback',
    displayName: 'Forex Trend Pullback (15m/1h)',
    description: 'London/NY pullback engine checking sovereign bond yield differentials.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['15m', '1h'], min_score: 86, min_rr: 1.5, min_stop_distance_pct: 0.08, min_tp1_distance_pct: 0.12, min_tp2_distance_pct: 0.22, max_bars_in_trade: 48 },
    defaultParams: { ema_fast: 30, max_pullback_depth_atr: 0.80, stop_atr_mult: 1.6, tp1_r: 1.5, tp2_r: 2.5 },
    defaultAI: {
      status: 'PRIME',
      action: 'Validates technical retests with macro 10-year sovereign interest rate differentials.',
      regime_affinity: 'Macro Yield Alignment',
      weight_multiplier: 1.10,
      alpha_half_life_days: 175,
      alpha_decay_score: 92,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...indicatorFields.filter((f) => f.key === 'ema_fast'), ...stopFields],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Shuts down if sovereign 10Y yield differential runs counter to technical trend.',
  },
  SessionORB: {
    name: 'SessionORB',
    displayName: 'Forex Session ORB (5m)',
    description: 'Forex 5m Opening Range Breakout engine with Hysteresis Schmitt Trigger cooldown deadband.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['5m'], min_score: 83, min_rr: 1.3, min_stop_distance_pct: 0.06, min_tp1_distance_pct: 0.10, min_tp2_distance_pct: 0.16, max_bars_in_trade: 18 },
    defaultParams: { cooldown_deadband_seconds: 300, max_pre_session_gk_vol: 0.00050, stop_atr_mult: 1.2, tp1_r: 1.2, tp2_r: 2.0 },
    defaultAI: {
      status: 'PRIME',
      action: 'Captures first-15-minute directional momentum without flickering chop losses.',
      regime_affinity: 'Session Open Volatility',
      weight_multiplier: 1.05,
      alpha_half_life_days: 110,
      alpha_decay_score: 89,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...stopFields, { key: 'cooldown_deadband_seconds', label: 'Cooldown Deadband (Sec)', helper: 'Minimum seconds between boundary bracket adjustments to stop flickering.', group: 'Quality Gates', min: 60, max: 600, step: 60 }],
    allowedTimeframes: ['5m'],
    codeNotes: 'Eliminates structural boundary oscillation on initial 15m session bars.',
  },
  GoldVolatilityBreakout: {
    name: 'GoldVolatilityBreakout',
    displayName: 'Metals Spot Gold Volatility Breakout (15m)',
    description: 'Certified 15m Spot Gold (XAUUSD) 6-hour box breakout with emergency spread-widening filter.',
    marketType: 'forex',
    signalStyle: 'forex_signal',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['15m'], min_score: 88, min_rr: 1.5, min_stop_distance_pct: 0.12, min_tp1_distance_pct: 0.18, min_tp2_distance_pct: 0.35, max_bars_in_trade: 36 },
    defaultParams: { box_lookback: 16, max_spread_points: 45.0, min_box_atr_range: 0.8, max_box_atr_range: 5.5, stop_atr_mult: 1.8, tp1_r: 1.6, tp2_r: 3.5 },
    defaultAI: {
      status: 'PRIME',
      action: 'Exploits heavy XAUUSD commodity momentum surges with strict Friday 20:00 UTC cut.',
      regime_affinity: 'Commodity Volatility Surge',
      weight_multiplier: 1.35,
      alpha_half_life_days: 220,
      alpha_decay_score: 98,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [...stopFields, { key: 'max_spread_points', label: 'Max Broker Spread (Pts)', helper: 'Emergency skip threshold in points ($0.01) during geopolitical headline shocks.', group: 'Quality Gates', min: 20, max: 100, step: 5 }],
    allowedTimeframes: ['15m'],
    codeNotes: 'Two-bar closed confirmation; Friday 20:00 UTC hard weekend exposure liquidation.',
  },
  MacroYieldDifferential: {
    name: 'MacroYieldDifferential',
    displayName: 'Macro Sovereign Yield Differential (4h/1d)',
    description: 'Global 4h/Daily sovereign bond yield spread divergence (> 25 bps) directional anchor.',
    marketType: 'forex',
    signalStyle: 'swing',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'swing', risk_mode: 'conservative', allowed_timeframes: ['4h', '1d'], min_score: 90, min_rr: 2.0, min_stop_distance_pct: 0.50, min_tp1_distance_pct: 1.00, min_tp2_distance_pct: 2.00, max_bars_in_trade: 120 },
    defaultParams: { min_yield_spread_bps: 25.0, stop_atr_mult: 2.2, tp1_r: 1.4, tp2_r: 4.0, stop_pct: 1.5, tp_pct: 4.5 },
    defaultAI: {
      status: 'PRIME',
      action: 'Anchors high-timeframe currency bias based on central bank rate trajectory spreads.',
      regime_affinity: 'Macro Interest Rate Divergence',
      weight_multiplier: 1.25,
      alpha_half_life_days: 300,
      alpha_decay_score: 96,
      last_recalibrated: '2026-08-30 08:00 UTC',
    },
    params: [{ key: 'min_yield_spread_bps', label: 'Min Yield Spread (bps)', helper: 'Minimum 10Y sovereign yield divergence in basis points.', group: 'Entry Filters', min: 10, step: 5 }],
    allowedTimeframes: ['4h', '1d'],
    codeNotes: 'Nets and absorbs opposing micro-timeframe signals internally with zero broker fees.',
  },
};

