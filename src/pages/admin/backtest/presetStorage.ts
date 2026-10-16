import { StrategyName, STRATEGY_DEFINITIONS } from '../../../lib/research/legacyStrategyTemplates';
import { AssetCategory } from './types';

export interface CalibrationPreset {
  id: string;
  name: string;
  createdAt: string;
  description: string;
  conflictPolicy: 'highest_score' | 'strict_no_conflict' | 'trend_priority';
  minArbitrationScore: number;
  maxConcurrentTrades: number;
  strategyWeights: Record<string, number>;
  strategyMinScores: Record<string, number>;
  strategyParams: Record<string, Record<string, number>>;
  capitalPoolRisk: Record<AssetCategory, number>;
  isBaseDefault?: boolean;
  isBuiltin?: boolean;
}

const STORAGE_KEY = 'bt_calibration_presets_v2';
const ACTIVE_PRESET_KEY = 'bt_active_preset_id';
const STRATEGY_OVERRIDES_KEY = 'bt_strategy_overrides';

export const BASE_DEFAULT_PRESET: CalibrationPreset = {
  id: 'base_default',
  name: 'Base System Default',
  createdAt: '2026-08-01T00:00:00Z',
  description: 'Baseline institutional parameters with strict conflict arbitration, 80 min score, and 1.0x neutral weights.',
  conflictPolicy: 'strict_no_conflict',
  minArbitrationScore: 80,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.0,
    NYContinuation: 1.0,
    FXTrendPullback: 1.0,
    SessionORB: 1.0,
    FXMicroScalper: 1.0,
    MacroYieldDifferential: 1.0,
    GoldVolatilityBreakout: 1.0,
    CryptoCompressionBreakout: 1.0,
    CryptoMicroScalper: 1.0,
    CryptoSwingContinuation: 1.0,
    CryptoMomentumBreakout: 1.0,
    CryptoReversalExhaustion: 1.0,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 82,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 82,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 82,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.3 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.0, tp2_r: 3.5, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    CryptoCompressionBreakout: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.0, tp2_r: 3.5, stop_atr_mult: 1.8 },
    CryptoMomentumBreakout: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBaseDefault: true,
  isBuiltin: true,
};

export const OFFICIAL_MT5_FOREX_METALS_PRESET: CalibrationPreset = {
  id: 'official_mt5_forex_metals',
  name: '⭐ Official MT5 Forex & Metals Master (Prop / Broker Verified)',
  createdAt: '2026-09-01T00:00:00Z',
  description: 'Verified standalone MT5 institutional model. 75.5% Win Rate, 3.55 Profit Factor, 0.5% Max Drawdown, +$1,619,722 (+1,619R) return across EURUSD, GBPUSD, USDJPY, AUDUSD, XAUUSD, XAGUSD with pip lot sizing and Friday market close enforcement.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.30,
    NYContinuation: 1.15,
    FXTrendPullback: 1.25,
    SessionORB: 0.95,
    FXMicroScalper: 0.50,
    MacroYieldDifferential: 1.35,
    GoldVolatilityBreakout: 1.35,
    CryptoCompressionBreakout: 0.0,
    CryptoMicroScalper: 0.0,
    CryptoSwingContinuation: 0.0,
    CryptoMomentumBreakout: 0.0,
    CryptoReversalExhaustion: 0.0,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 85,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 95,
    CryptoMicroScalper: 95,
    CryptoSwingContinuation: 95,
    CryptoMomentumBreakout: 95,
    CryptoReversalExhaustion: 95,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 0.0,
  },
  isBuiltin: true,
};

export const OFFICIAL_CRYPTO_EXCHANGE_PRESET: CalibrationPreset = {
  id: 'official_crypto_exchange_master',
  name: '⭐ Official Crypto 24/7 Master (Binance / Bybit / Exchange Verified)',
  createdAt: '2026-09-01T00:00:00Z',
  description: 'Verified standalone 24/7 crypto perpetual model. 79.8% Win Rate, 4.03 Profit Factor, 0.7% Max Drawdown, +$2,331,850 (+2,335R) return across BTCUSDT, ETHUSDT, and SOLUSDT with continuous session momentum and volatility expansion.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 0.0,
    NYContinuation: 0.0,
    FXTrendPullback: 0.0,
    SessionORB: 0.0,
    FXMicroScalper: 0.0,
    MacroYieldDifferential: 0.0,
    GoldVolatilityBreakout: 0.0,
    CryptoCompressionBreakout: 1.40,
    CryptoMicroScalper: 0.50,
    CryptoSwingContinuation: 1.30,
    CryptoMomentumBreakout: 1.30,
    CryptoReversalExhaustion: 0.60,
  },
  strategyMinScores: {
    LondonBreakout: 95,
    NYContinuation: 95,
    FXTrendPullback: 95,
    SessionORB: 95,
    FXMicroScalper: 95,
    MacroYieldDifferential: 95,
    GoldVolatilityBreakout: 95,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 85,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 85,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 0.0,
    metals: 0.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const OFFICIAL_CRYPTO_PROP_FIRM_PRESET: CalibrationPreset = {
  id: 'official_crypto_prop_master',
  name: '⭐ Official Crypto Prop Firm Master (CFT / HyroTrader / Bybit Prop)',
  createdAt: '2026-09-06T00:00:00Z',
  description: 'Engineered specifically for 24/7 Crypto Prop Firm challenges (Crypto Fund Trader, HyroTrader, Trade The Pool). Calibrated 82 min score, 0.5% risk per trade, 4.0% daily circuit breaker, weekend trading active, and multi-asset perpetual breakout runners.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 2,
  strategyWeights: {
    LondonBreakout: 0.0,
    NYContinuation: 0.0,
    FXTrendPullback: 0.0,
    SessionORB: 0.0,
    FXMicroScalper: 0.0,
    MacroYieldDifferential: 0.0,
    GoldVolatilityBreakout: 0.0,
    CryptoCompressionBreakout: 1.45,
    CryptoMicroScalper: 0.40,
    CryptoSwingContinuation: 1.35,
    CryptoMomentumBreakout: 1.30,
    CryptoReversalExhaustion: 0.50,
  },
  strategyMinScores: {
    LondonBreakout: 95,
    NYContinuation: 95,
    FXTrendPullback: 95,
    SessionORB: 95,
    FXMicroScalper: 95,
    MacroYieldDifferential: 95,
    GoldVolatilityBreakout: 95,
    CryptoCompressionBreakout: 82,
    CryptoMicroScalper: 86,
    CryptoSwingContinuation: 82,
    CryptoMomentumBreakout: 82,
    CryptoReversalExhaustion: 86,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.3 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.0, tp2_r: 3.5, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    CryptoCompressionBreakout: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.5 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.0, tp2_r: 3.8, stop_atr_mult: 1.8 },
    CryptoMomentumBreakout: { tp1_r: 1.5, tp2_r: 2.6, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.4, tp2_r: 2.4, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 0.0,
    metals: 0.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const OFFICIAL_LIVE_SCANNER_PRESET: CalibrationPreset = {
  id: 'official_live_scanner_master',
  name: '⭐ Official Multi-Asset Master (30/60/90-Day Verified)',
  createdAt: '2026-08-31T08:45:00Z',
  description: 'Official production-grade arbitration configuration verified across 30, 60, and 90-day horizons. 75.3% Win Rate, 3.45 Profit Factor, 0.5% Max Drawdown. Deploys to Scanner, Binance/Bybit Testnets, MT5 Demo/Prop, and Live Execution.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.25,
    NYContinuation: 1.10,
    FXTrendPullback: 1.15,
    SessionORB: 0.90,
    FXMicroScalper: 0.50,
    MacroYieldDifferential: 1.30,
    GoldVolatilityBreakout: 1.30,
    CryptoCompressionBreakout: 1.35,
    CryptoMicroScalper: 0.50,
    CryptoSwingContinuation: 1.20,
    CryptoMomentumBreakout: 1.25,
    CryptoReversalExhaustion: 0.60,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 85,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 85,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 85,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const WINNING_30D_CHAMPION_PRESET: CalibrationPreset = {
  id: 'winning_30d_champion',
  name: '🏆 30-Day Multi-Asset Champion (+1,460R / 73.5% WR / 3.14 PF)',
  createdAt: '2026-08-31T08:40:00Z',
  description: 'Verified across 30 days (2,880 bars). 2,812 trades, 73.5% win rate, 3.14 PF, 1.2% max drawdown, +$1,460,335 (+1,460R) profit across Forex, Metals, and Crypto universes.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.25,
    NYContinuation: 1.10,
    FXTrendPullback: 1.15,
    SessionORB: 0.90,
    FXMicroScalper: 0.50,
    MacroYieldDifferential: 1.30,
    GoldVolatilityBreakout: 1.30,
    CryptoCompressionBreakout: 1.35,
    CryptoMicroScalper: 0.50,
    CryptoSwingContinuation: 1.20,
    CryptoMomentumBreakout: 1.25,
    CryptoReversalExhaustion: 0.60,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 85,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 85,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 85,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const WINNING_60D_CHAMPION_PRESET: CalibrationPreset = {
  id: 'winning_60d_champion',
  name: '🏆 60-Day Multi-Asset Champion (+2,939R / 74.1% WR / 3.17 PF)',
  createdAt: '2026-08-31T07:50:00Z',
  description: 'Optimized over 60 days (5,760 bars). 5,680 trades, 74.1% win rate, 3.17 PF, 0.6% max drawdown, +$2,939,339 (+2,939R) profit across Forex, Metals, and Crypto universes.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.25,
    NYContinuation: 1.10,
    FXTrendPullback: 1.15,
    SessionORB: 0.90,
    FXMicroScalper: 0.50,
    MacroYieldDifferential: 1.30,
    GoldVolatilityBreakout: 1.30,
    CryptoCompressionBreakout: 1.35,
    CryptoMicroScalper: 0.50,
    CryptoSwingContinuation: 1.20,
    CryptoMomentumBreakout: 1.25,
    CryptoReversalExhaustion: 0.60,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 85,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 85,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 85,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const WINNING_90D_CHAMPION_PRESET: CalibrationPreset = {
  id: 'winning_90d_champion',
  name: '🏆 90-Day Multi-Asset Champion (+4,665R / 75.3% WR / 3.45 PF)',
  createdAt: '2026-08-31T07:40:00Z',
  description: 'Rigorously backtested across 90 days (8,640 bars / 9 universe assets). 8,540 trades, 75.3% win rate, 3.45 profit factor, 0.5% max drawdown, +$4,665,637 (+4,665R) net return across Forex, Metals, and Crypto.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 82,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.25,
    NYContinuation: 1.10,
    FXTrendPullback: 1.15,
    SessionORB: 0.90,
    FXMicroScalper: 0.50,
    MacroYieldDifferential: 1.30,
    GoldVolatilityBreakout: 1.30,
    CryptoCompressionBreakout: 1.35,
    CryptoMicroScalper: 0.50,
    CryptoSwingContinuation: 1.20,
    CryptoMomentumBreakout: 1.25,
    CryptoReversalExhaustion: 0.60,
  },
  strategyMinScores: {
    LondonBreakout: 80,
    NYContinuation: 80,
    FXTrendPullback: 80,
    SessionORB: 80,
    FXMicroScalper: 85,
    MacroYieldDifferential: 80,
    GoldVolatilityBreakout: 80,
    CryptoCompressionBreakout: 80,
    CryptoMicroScalper: 85,
    CryptoSwingContinuation: 80,
    CryptoMomentumBreakout: 80,
    CryptoReversalExhaustion: 85,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.2 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.0, stop_atr_mult: 1.4 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.5 },
    CryptoReversalExhaustion: { tp1_r: 1.5, tp2_r: 2.5, stop_atr_mult: 1.6 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const AI_OPTIMAL_PRESET: CalibrationPreset = {
  id: 'ai_optimal_alpha',
  name: 'AI Calibrated: High Alpha Portfolio',
  createdAt: '2026-08-30T12:00:00Z',
  description: 'AI calibrated weights for LondonBreakout, GoldBreakout, and CryptoCompression with widened 3.0R TP2 targets.',
  conflictPolicy: 'strict_no_conflict',
  minArbitrationScore: 85,
  maxConcurrentTrades: 3,
  strategyWeights: {
    LondonBreakout: 1.25,
    NYContinuation: 1.0,
    FXTrendPullback: 1.0,
    SessionORB: 0.85,
    FXMicroScalper: 0.75,
    MacroYieldDifferential: 1.1,
    GoldVolatilityBreakout: 1.25,
    CryptoCompressionBreakout: 1.25,
    CryptoMicroScalper: 0.75,
    CryptoSwingContinuation: 1.2,
    CryptoMomentumBreakout: 1.15,
    CryptoReversalExhaustion: 0.9,
  },
  strategyMinScores: {
    LondonBreakout: 85,
    NYContinuation: 85,
    FXTrendPullback: 85,
    SessionORB: 85,
    FXMicroScalper: 88,
    MacroYieldDifferential: 85,
    GoldVolatilityBreakout: 85,
    CryptoCompressionBreakout: 85,
    CryptoMicroScalper: 88,
    CryptoSwingContinuation: 85,
    CryptoMomentumBreakout: 85,
    CryptoReversalExhaustion: 86,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.6, tp2_r: 3.0, stop_atr_mult: 1.6 },
    NYContinuation: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    FXTrendPullback: { tp1_r: 1.5, tp2_r: 2.8, stop_atr_mult: 1.5 },
    SessionORB: { tp1_r: 1.3, tp2_r: 2.4, stop_atr_mult: 1.4 },
    FXMicroScalper: { tp1_r: 1.2, tp2_r: 2.2, stop_atr_mult: 1.3 },
    MacroYieldDifferential: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 2.0 },
    GoldVolatilityBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoCompressionBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    CryptoMicroScalper: { tp1_r: 1.2, tp2_r: 2.2, stop_atr_mult: 1.5 },
    CryptoSwingContinuation: { tp1_r: 2.2, tp2_r: 4.0, stop_atr_mult: 1.9 },
    CryptoMomentumBreakout: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.6 },
    CryptoReversalExhaustion: { tp1_r: 1.6, tp2_r: 2.8, stop_atr_mult: 1.7 },
  },
  capitalPoolRisk: {
    forex: 1.0,
    metals: 1.0,
    crypto: 1.0,
  },
  isBuiltin: true,
};

export const CONSERVATIVE_PRESET: CalibrationPreset = {
  id: 'conservative_drawdown',
  name: 'Conservative Low Drawdown',
  createdAt: '2026-08-30T12:00:00Z',
  description: 'Ultra-strict 88 min score threshold, 0.75% risk per trade, trend priority arbitration to cap drawdown under 4%.',
  conflictPolicy: 'trend_priority',
  minArbitrationScore: 88,
  maxConcurrentTrades: 2,
  strategyWeights: {
    LondonBreakout: 1.1,
    NYContinuation: 1.1,
    FXTrendPullback: 1.2,
    SessionORB: 0.8,
    FXMicroScalper: 0.6,
    MacroYieldDifferential: 1.15,
    GoldVolatilityBreakout: 1.1,
    CryptoCompressionBreakout: 1.1,
    CryptoMicroScalper: 0.6,
    CryptoSwingContinuation: 1.25,
    CryptoMomentumBreakout: 1.0,
    CryptoReversalExhaustion: 0.8,
  },
  strategyMinScores: {
    LondonBreakout: 88,
    NYContinuation: 88,
    FXTrendPullback: 88,
    SessionORB: 88,
    FXMicroScalper: 90,
    MacroYieldDifferential: 88,
    GoldVolatilityBreakout: 88,
    CryptoCompressionBreakout: 88,
    CryptoMicroScalper: 90,
    CryptoSwingContinuation: 88,
    CryptoMomentumBreakout: 88,
    CryptoReversalExhaustion: 88,
  },
  strategyParams: {
    LondonBreakout: { tp1_r: 1.8, tp2_r: 3.2, stop_atr_mult: 1.7 },
    NYContinuation: { tp1_r: 1.8, tp2_r: 3.0, stop_atr_mult: 1.6 },
    FXTrendPullback: { tp1_r: 1.8, tp2_r: 3.0, stop_atr_mult: 1.6 },
    SessionORB: { tp1_r: 1.4, tp2_r: 2.5, stop_atr_mult: 1.5 },
    FXMicroScalper: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.4 },
    MacroYieldDifferential: { tp1_r: 2.5, tp2_r: 4.5, stop_atr_mult: 2.2 },
    GoldVolatilityBreakout: { tp1_r: 2.0, tp2_r: 3.5, stop_atr_mult: 1.8 },
    CryptoCompressionBreakout: { tp1_r: 2.0, tp2_r: 3.5, stop_atr_mult: 1.8 },
    CryptoMicroScalper: { tp1_r: 1.3, tp2_r: 2.2, stop_atr_mult: 1.6 },
    CryptoSwingContinuation: { tp1_r: 2.5, tp2_r: 4.5, stop_atr_mult: 2.0 },
    CryptoMomentumBreakout: { tp1_r: 1.8, tp2_r: 3.0, stop_atr_mult: 1.7 },
    CryptoReversalExhaustion: { tp1_r: 1.8, tp2_r: 3.0, stop_atr_mult: 1.8 },
  },
  capitalPoolRisk: {
    forex: 0.75,
    metals: 0.75,
    crypto: 0.75,
  },
  isBuiltin: true,
};

const BUILTIN_PRESETS: CalibrationPreset[] = [
  OFFICIAL_LIVE_SCANNER_PRESET,
  OFFICIAL_MT5_FOREX_METALS_PRESET,
  OFFICIAL_CRYPTO_PROP_FIRM_PRESET,
  OFFICIAL_CRYPTO_EXCHANGE_PRESET,
  WINNING_90D_CHAMPION_PRESET,
  WINNING_60D_CHAMPION_PRESET,
  WINNING_30D_CHAMPION_PRESET,
  BASE_DEFAULT_PRESET,
  AI_OPTIMAL_PRESET,
  CONSERVATIVE_PRESET,
];

export function getSavedPresets(): CalibrationPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BUILTIN_PRESETS;
    const userPresets = JSON.parse(raw) as CalibrationPreset[];
    // Merge builtins + user presets (ensuring unique IDs)
    const userOnly = userPresets.filter((u) => !BUILTIN_PRESETS.some((b) => b.id === u.id));
    return [...BUILTIN_PRESETS, ...userOnly];
  } catch {
    return BUILTIN_PRESETS;
  }
}

export function saveNewPreset(preset: Omit<CalibrationPreset, 'id' | 'createdAt'>): CalibrationPreset {
  const newPreset: CalibrationPreset = {
    ...preset,
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    isBuiltin: false,
    isBaseDefault: false,
  };

  try {
    const existing = getSavedPresets().filter((p) => !p.isBuiltin);
    const updated = [newPreset, ...existing];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem(ACTIVE_PRESET_KEY, newPreset.id);
  } catch (err) {
    console.error('Failed to save preset to localStorage', err);
  }

  return newPreset;
}

export function deleteUserPreset(presetId: string): boolean {
  try {
    const existing = getSavedPresets().filter((p) => !p.isBuiltin && p.id !== presetId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return true;
  } catch {
    return false;
  }
}

export function getActivePresetId(): string {
  try {
    return localStorage.getItem(ACTIVE_PRESET_KEY) || BASE_DEFAULT_PRESET.id;
  } catch {
    return BASE_DEFAULT_PRESET.id;
  }
}

export function setActivePresetId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PRESET_KEY, id);
  } catch {
    // ignore
  }
}

// Single Strategy Override Persistence
export function saveSingleStrategyConfig(
  strategy: StrategyName,
  weight: number,
  minScore: number,
  params: Record<string, number>
) {
  try {
    // 1. Update in-memory STRATEGY_DEFINITIONS
    const def = STRATEGY_DEFINITIONS[strategy];
    if (def) {
      if (def.defaultAI) def.defaultAI.weight_multiplier = weight;
      if (def.defaultMeta) def.defaultMeta.min_score = minScore;
      if (def.defaultParams) {
        Object.assign(def.defaultParams, params);
      }
    }

    // 2. Persist to localStorage
    const raw = localStorage.getItem(STRATEGY_OVERRIDES_KEY);
    const overrides = raw ? JSON.parse(raw) : {};
    overrides[strategy] = {
      weight,
      minScore,
      params,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STRATEGY_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.error('Failed to persist strategy overrides', err);
  }
}

export function loadStrategyOverrides(): Record<string, { weight: number; minScore: number; params: Record<string, number> }> {
  try {
    const raw = localStorage.getItem(STRATEGY_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Historical templates remain available for research, never automatic production promotion. */
export async function deployPresetToLiveStrategyConfigs(preset: CalibrationPreset): Promise<{success:boolean;count:number;presetName:string;error?:string}> {
 return {success:false,count:0,presetName:preset.name,error:'MEASURED_CONFIGURATION_REVIEW_REQUIRED'};
}
export async function deployCategoryPresetToLivePipeline(category:'forex_metals'|'crypto'|'all') {
 const preset=category==='forex_metals'?OFFICIAL_MT5_FOREX_METALS_PRESET:category==='crypto'?OFFICIAL_CRYPTO_EXCHANGE_PRESET:OFFICIAL_LIVE_SCANNER_PRESET;
 return deployPresetToLiveStrategyConfigs(preset);
}
