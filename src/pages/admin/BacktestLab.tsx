import { useEffect, useState, useRef, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { DEFAULT_CAPITAL_ASSUMPTIONS, estimateCapitalFromR, formatMoney, formatPct, validCapitalAssumptions, CapitalAssumptions } from '../../lib/capitalAnalytics';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, Play, Trash2, AlertTriangle, Clock,
  BarChart2, RefreshCw, ChevronDown, ChevronUp, Info, Settings,
  TrendingUp, TrendingDown, Minus, FileText, Calendar, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplayDataset {
  id: string; name: string; symbol: string; market_type: string;
  timeframe: string; file_name: string; row_count: number; created_at: string;
}

interface BtCandle {
  time: string; open: number; high: number; low: number; close: number; volume: number;
}

interface BtTrade {
  entryIndex: number; entryTime: string; strategy: string; direction: 'buy' | 'sell';
  entry: number; entry_low: number; entry_high: number;
  stop_loss: number; tp1: number; tp2: number;
  result: 'tp2_hit' | 'tp1_hit' | 'sl_hit' | 'expired';
  exitIndex: number | null; exitTime: string | null; exitPrice: number | null;
  pnl_r: number; durationBars: number;
  grade: string; score: number; reason: string;
}

interface BtMetrics {
  totalTrades: number; wins: number; tp1Hits: number; tp2Hits: number;
  losses: number; expired: number;
  winRate: number; profitFactor: number;
  totalR: number; avgR: number; avgWin: number; avgLoss: number;
  bestTrade: number; worstTrade: number;
  maxConsecWins: number; maxConsecLosses: number; maxDrawdown: number;
  evaluations: number; candidates: number; rejected: number; rejectionReasons: Record<string, number>;
  rejectionDiagnostics?: Record<string, Record<string, string | number | boolean>>;
}

interface CsvInfo {
  totalRows: number;
  skippedRows: number;
  firstTime: string;
  lastTime: string;
  inferredTf: string;
}

// ─── Strategy parameters and live-parity backtest defaults ─────────────────────────────────────

type ResearchPreset = 'live' | 'conservative' | 'balanced' | 'aggressive';
type Strategy = 'MicroScalper' | 'CompressionBreakout' | 'SwingContinuation';
type StrategyChoice = Strategy | 'ALL';
type RangePreset = 'full' | '7d' | '30d' | '60d' | '90d' | 'custom';

interface ParamSet {
  min_score: number; min_rr: number;
  min_stop_distance_pct: number; min_tp1_distance_pct: number; min_tp2_distance_pct: number;
  max_bars_in_trade: number;
  ema_fast: number; ema_slow: number; rsi_len: number; atr_len: number;
  rsi_buy_min: number; rsi_sell_max: number;
  stop_atr_mult: number; tp1_r: number; tp2_r: number;
  min_atr_pct: number; max_atr_pct: number; min_body_atr: number; momentum_lookback: number;
  box_lookback: number; min_box_bars: number; max_box_atr_range: number;
  atr_expansion_lookback: number; min_atr_expansion: number;
  breakout_buffer_atr: number; pullback_bars: number;
}

const DEFAULTS: Record<Strategy, Record<'conservative' | 'balanced' | 'aggressive', ParamSet>> = {
  MicroScalper: {
    conservative: { min_score: 78, min_rr: 1.4, min_stop_distance_pct: 0.20, min_tp1_distance_pct: 0.28, min_tp2_distance_pct: 0.45, max_bars_in_trade: 20, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 55, rsi_sell_max: 45, stop_atr_mult: 1.5, tp1_r: 1.3, tp2_r: 2.0, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 },
    balanced:     { min_score: 72, min_rr: 1.2, min_stop_distance_pct: 0.18, min_tp1_distance_pct: 0.25, min_tp2_distance_pct: 0.40, max_bars_in_trade: 24, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.4, tp1_r: 1.2, tp2_r: 1.8, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 },
    aggressive:   { min_score: 68, min_rr: 1.0, min_stop_distance_pct: 0.15, min_tp1_distance_pct: 0.20, min_tp2_distance_pct: 0.32, max_bars_in_trade: 30, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.2, tp1_r: 1.0, tp2_r: 1.5, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 },
  },
  CompressionBreakout: {
    conservative: { min_score: 80, min_rr: 1.6, min_stop_distance_pct: 0.30, min_tp1_distance_pct: 0.40, min_tp2_distance_pct: 0.70, max_bars_in_trade: 40, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.5, tp1_r: 1.4, tp2_r: 2.8, box_lookback: 60, min_box_bars: 16, max_box_atr_range: 1.6, atr_expansion_lookback: 48, min_atr_expansion: 1.2, breakout_buffer_atr: 0.14, pullback_bars: 5 },
    balanced:     { min_score: 75, min_rr: 1.3, min_stop_distance_pct: 0.25, min_tp1_distance_pct: 0.35, min_tp2_distance_pct: 0.60, max_bars_in_trade: 48, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.4, tp1_r: 1.3, tp2_r: 2.5, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 },
    aggressive:   { min_score: 68, min_rr: 1.1, min_stop_distance_pct: 0.20, min_tp1_distance_pct: 0.28, min_tp2_distance_pct: 0.50, max_bars_in_trade: 60, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.10, max_atr_pct: 3.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.3, tp1_r: 1.2, tp2_r: 2.2, box_lookback: 40, min_box_bars: 12, max_box_atr_range: 2.0, atr_expansion_lookback: 48, min_atr_expansion: 1.05, breakout_buffer_atr: 0.10, pullback_bars: 5 },
  },
  SwingContinuation: {
    conservative: { min_score: 80, min_rr: 1.8, min_stop_distance_pct: 0.50, min_tp1_distance_pct: 0.80, min_tp2_distance_pct: 1.30, max_bars_in_trade: 80, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.15, max_atr_pct: 4.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.8, tp1_r: 1.7, tp2_r: 2.8, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 4 },
    balanced:     { min_score: 76, min_rr: 1.5, min_stop_distance_pct: 0.45, min_tp1_distance_pct: 0.70, min_tp2_distance_pct: 1.20, max_bars_in_trade: 96, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.15, max_atr_pct: 4.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.6, tp1_r: 1.5, tp2_r: 2.5, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 },
    aggressive:   { min_score: 72, min_rr: 1.2, min_stop_distance_pct: 0.35, min_tp1_distance_pct: 0.55, min_tp2_distance_pct: 0.95, max_bars_in_trade: 120, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, min_atr_pct: 0.15, max_atr_pct: 4.0, min_body_atr: 0.30, momentum_lookback: 3, rsi_buy_min: 48, rsi_sell_max: 52, stop_atr_mult: 1.4, tp1_r: 1.3, tp2_r: 2.2, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 6 },
  },
};

const LIVE_PARAMS: Record<Strategy, ParamSet> = {
  MicroScalper: DEFAULTS.MicroScalper.balanced,
  CompressionBreakout: DEFAULTS.CompressionBreakout.balanced,
  SwingContinuation: DEFAULTS.SwingContinuation.balanced,
};

const STRATEGY_TIMEFRAMES: Record<Strategy, string[]> = {
  MicroScalper: ['5m', '15m'],
  CompressionBreakout: ['15m', '1h'],
  SwingContinuation: ['15m', '1h'],
};

const TF_MINUTES: Record<string, number> = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };


const RESEARCH_PRESET_LABEL: Record<ResearchPreset, string> = {
  live: 'Live-like default',
  conservative: 'Conservative research',
  balanced: 'Balanced research',
  aggressive: 'Aggressive research',
};

const RESEARCH_PRESET_DESCRIPTIONS: Record<ResearchPreset, string> = {
  live: 'Closest browser-side approximation of current strategy-family behavior. Default path.',
  conservative: 'Backtest-only stricter score, confirmation, RR/distance safety. Fewer weak setups expected.',
  balanced: 'Backtest-only middle-ground research preset, aligned to current live-like defaults.',
  aggressive: 'Backtest-only more active research preset. Keeps RR, distance, candle, and structure guards.',
};

function paramsForPreset(strategy: Strategy, preset: ResearchPreset): ParamSet {
  if (preset === 'live' || preset === 'balanced') return { ...LIVE_PARAMS[strategy] };
  return { ...DEFAULTS[strategy][preset] };
}

function presetShortLabel(preset: ResearchPreset): string {
  return RESEARCH_PRESET_LABEL[preset].replace(' research', '');
}

interface BacktestRunResult {
  id: string;
  strategy: Strategy;
  datasetTimeframe: string;
  testedTimeframe: string;
  resampled: boolean;
  candlesLoaded: number;
  candlesTested: number;
  metrics: BtMetrics;
  trades: BtTrade[];
  params: ParamSet;
  classification: string;
  classificationReason: string;
  truthLabel: 'Live strategy parity logic' | 'Backtest approximation logic';
  parityNote: string;
  preset: ResearchPreset;
  unsupportedReason?: string;
}

// ─── Indicator helpers ────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function calcATR(candles: BtCandle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high: h, low: l } = candles[i], pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 2) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (gains + losses === 0) return 50;
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function momentumScore(closes: number[], lookback = 3): number {
  if (closes.length < lookback + 1) return 0;
  const sl = closes.slice(-lookback - 1);
  let up = 0, dn = 0;
  for (let i = 1; i < sl.length; i++) { if (sl[i] > sl[i - 1]) up++; else if (sl[i] < sl[i - 1]) dn++; }
  return (up - dn) / lookback;
}

function regime(ema20: number, ema50: number, rsi: number, rcr: number, atrPct: number): string {
  if (ema20 > ema50 * 1.002 && rsi > 52) return 'trend_up';
  if (ema20 < ema50 * 0.998 && rsi < 48) return 'trend_down';
  if (rcr < 0.55) return 'compression';
  if (atrPct > 2.0) return 'expansion';
  if (rsi > 45 && rsi < 55) return 'ranging';
  return 'unclear';
}

// ─── Distance guard ───────────────────────────────────────────────────────────

function passesDistanceGuard(
  entry: number, sl: number, tp1: number, tp2: number, score: number, rr: number, p: ParamSet,
): { ok: boolean; reason: string } {
  if (entry <= 0 || sl <= 0 || tp1 <= 0 || tp2 <= 0) return { ok: false, reason: 'distance_too_tight' };
  const slPct  = (Math.abs(entry - sl)  / entry) * 100;
  const tp1Pct = (Math.abs(tp1 - entry) / entry) * 100;
  const tp2Pct = (Math.abs(tp2 - entry) / entry) * 100;
  if (slPct  < p.min_stop_distance_pct)  return { ok: false, reason: 'sl_too_close' };
  if (tp1Pct < p.min_tp1_distance_pct)   return { ok: false, reason: 'tp1_too_close' };
  if (tp2Pct < p.min_tp2_distance_pct)   return { ok: false, reason: 'tp2_too_close' };
  if (rr     < p.min_rr)                 return { ok: false, reason: 'rr_too_low' };
  if (score  < p.min_score)              return { ok: false, reason: 'confidence_too_low' };
  return { ok: true, reason: '' };
}

// ─── Strategy evaluators ──────────────────────────────────────────────────────

interface EvalOut {
  ok: boolean; direction: 'buy' | 'sell';
  entry: number; entry_low: number; entry_high: number;
  sl: number; tp1: number; tp2: number;
  grade: string; score: number; rr: number; reason: string;
  diagnostics?: Record<string, string | number | boolean>;
}

const FAIL = (reason = 'no_valid_setup', diagnostics?: Record<string, string | number | boolean>): EvalOut => ({ ok: false, direction: 'buy', entry: 0, entry_low: 0, entry_high: 0, sl: 0, tp1: 0, tp2: 0, grade: 'reject', score: 0, rr: 0, reason, diagnostics });

function evalMS(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['5m', '15m'].includes(tf)) return FAIL('unsupported_timeframe');
  if (window.length < 60) return FAIL('insufficient_candles');
  const closes = window.map(c => c.close);
  const ema20 = calcEMA(closes, p.ema_fast); const ema50 = calcEMA(closes, p.ema_slow);
  const atr = calcATR(window, p.atr_len); const rsi = calcRSI(closes, p.rsi_len);
  const last = window[window.length - 1]; const prev = window[window.length - 2];
  const price = last.close;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  const bodyRatio = atr > 0 ? Math.abs(last.close - last.open) / atr : 0;

  if (atrPct < p.min_atr_pct) return FAIL('volatility_too_low');
  if (atrPct > p.max_atr_pct) return FAIL('volatility_too_high');
  if (bodyRatio < p.min_body_atr) return FAIL('candle_body_too_small');

  const olderHi = window.length > 50 ? Math.max(...window.slice(-50, -20).map(c => c.high)) : Math.max(...window.slice(-20).map(c => c.high));
  const olderLo = window.length > 50 ? Math.min(...window.slice(-50, -20).map(c => c.low))  : Math.min(...window.slice(-20).map(c => c.low));
  const recentHi = Math.max(...window.slice(-20).map(c => c.high));
  const recentLo = Math.min(...window.slice(-20).map(c => c.low));
  const rcr = (olderHi - olderLo) > 0 ? (recentHi - recentLo) / (olderHi - olderLo) : 1;
  const reg = regime(ema20, ema50, rsi, rcr, atrPct);
  const mom = momentumScore(closes, p.momentum_lookback);

  let score = 50, direction: 'buy' | 'sell' | null = null;
  if (ema20 > ema50 && rsi >= p.rsi_buy_min && price > ema20) {
    direction = 'buy'; score += 15;
    if (reg === 'trend_up') score += 10;
    if (mom > 0.2) score += 8; else return FAIL('momentum_failed');
    if (rsi >= 58) score += 8; else score += 3;
    if (prev.close < ema20 && price > ema20) score += 7;
    score += last.close > last.open ? 5 : -3;
  } else if (ema20 < ema50 && rsi <= p.rsi_sell_max && price < ema20) {
    direction = 'sell'; score += 15;
    if (reg === 'trend_down') score += 10;
    if (mom < -0.2) score += 8; else return FAIL('momentum_failed');
    if (rsi <= 42) score += 8; else score += 3;
    if (prev.close > ema20 && price < ema20) score += 7;
    score += last.close < last.open ? 5 : -3;
  } else return FAIL('trend_rsi_context_failed');

  const sl  = direction === 'buy' ? price - atr * p.stop_atr_mult : price + atr * p.stop_atr_mult;
  const tp1 = direction === 'buy' ? price + atr * p.tp1_r         : price - atr * p.tp1_r;
  const tp2 = direction === 'buy' ? price + atr * p.tp2_r         : price - atr * p.tp2_r;
  const risk = Math.abs(price - sl);
  const rr = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  if (rr >= 2.5) score += 10; else if (rr >= 1.8) score += 5;
  const final_score = Math.min(Math.max(score, 0), 100);
  const grade = final_score >= 85 ? 'A+' : final_score >= 75 ? 'A' : final_score >= 65 ? 'B' : 'reject';
  const entry_low = price * 0.9998, entry_high = price * 1.0002;
  return { ok: true, direction, entry: price, entry_low, entry_high, sl, tp1, tp2, grade, score: final_score, rr, reason: `MS ${direction}: score=${final_score}, rsi=${rsi.toFixed(1)}, regime=${reg}` };
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function roundDiag(value: number, digits = 3): number {
  return Number.isFinite(value) ? parseFloat(value.toFixed(digits)) : 0;
}

function pctDistance(a: number, b: number): number {
  return a > 0 ? roundDiag((Math.abs(a - b) / a) * 100, 4) : 0;
}

function evalCB(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['15m', '1h'].includes(tf)) return FAIL('unsupported_timeframe');
  const boxLookback = Math.max(10, Math.floor(p.box_lookback));
  const minBoxBars = Math.max(5, Math.floor(p.min_box_bars));
  const atrExpansionLookback = Math.max(5, Math.floor(p.atr_expansion_lookback));
  const minLen = Math.max(boxLookback + 5, atrExpansionLookback + 2, p.ema_slow + 5, p.atr_len + 2, p.rsi_len + 2, 60);
  if (window.length < minLen) return FAIL('insufficient_candles');

  const closes = window.map(c => c.close);
  const atr = calcATR(window, p.atr_len);
  const rsi = calcRSI(closes, p.rsi_len);
  const emaFast = calcEMA(closes, p.ema_fast);
  const emaSlow = calcEMA(closes, p.ema_slow);
  const last = window[window.length - 1];
  const price = last.close;
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return FAIL('invalid_atr');

  const fullBoxSlice = window.slice(-(boxLookback + 1), -1);
  if (fullBoxSlice.length < minBoxBars) return FAIL('insufficient_box_bars');
  const recentLen = Math.min(Math.max(minBoxBars, 12), fullBoxSlice.length);
  const recentBoxSlice = fullBoxSlice.slice(-recentLen);
  const boxHigh = Math.max(...fullBoxSlice.map(c => c.high));
  const boxLow = Math.min(...fullBoxSlice.map(c => c.low));
  const boxRange = boxHigh - boxLow;
  const recentBoxHigh = Math.max(...recentBoxSlice.map(c => c.high));
  const recentBoxLow = Math.min(...recentBoxSlice.map(c => c.low));
  const recentBoxRange = recentBoxHigh - recentBoxLow;
  if (boxRange <= 0 || !Number.isFinite(boxRange)) return FAIL('invalid_box_range');

  const buffer = atr * p.breakout_buffer_atr;
  const useRecentBox = recentBoxRange > 0 && recentBoxRange < boxRange;
  const effectiveBoxHigh = useRecentBox ? recentBoxHigh : boxHigh;
  const effectiveBoxLow = useRecentBox ? recentBoxLow : boxLow;
  const effectiveBoxRange = effectiveBoxHigh - effectiveBoxLow;
  const breakoutDistUp = last.close - effectiveBoxHigh;
  const breakoutDistDn = effectiveBoxLow - last.close;
  const closeOutsideUp = breakoutDistUp > 0 && last.close > last.open;
  const closeOutsideDn = breakoutDistDn > 0 && last.close < last.open;
  const breakoutUp = breakoutDistUp > buffer && last.close > last.open;
  const breakoutDn = breakoutDistDn > buffer && last.close < last.open;
  const earlyBreakoutUp = closeOutsideUp && (last.high - last.low) > atr * p.min_atr_expansion;
  const earlyBreakoutDn = closeOutsideDn && (last.high - last.low) > atr * p.min_atr_expansion;
  const direction: 'buy' | 'sell' = breakoutUp || earlyBreakoutUp ? 'buy' : breakoutDn || earlyBreakoutDn ? 'sell' : (last.close >= (effectiveBoxHigh + effectiveBoxLow) / 2 ? 'buy' : 'sell');
  const breakoutConfirmed = breakoutUp || breakoutDn || earlyBreakoutUp || earlyBreakoutDn;
  const breakoutDist = direction === 'buy' ? Math.max(0, breakoutDistUp) : Math.max(0, breakoutDistDn);
  const breakoutDistanceAtr = breakoutDist / atr;

  const barsInside = fullBoxSlice.filter(c => c.high <= boxHigh * 1.0015 && c.low >= boxLow * 0.9985).length;
  const recentBarsInside = recentBoxSlice.filter(c => c.high <= recentBoxHigh * 1.0015 && c.low >= recentBoxLow * 0.9985).length;
  const boxRangeAtr = boxRange / atr;
  const recentBoxRangeAtr = recentBoxRange / atr;
  const effectiveBoxRangeAtr = effectiveBoxRange / atr;
  const boxRangePct = price > 0 ? (boxRange / price) * 100 : 0;
  const insideRatio = barsInside / Math.max(fullBoxSlice.length, 1);
  const recentInsideRatio = recentBarsInside / Math.max(recentBoxSlice.length, 1);

  const histSlice = window.slice(-(atrExpansionLookback + 1), -1);
  const avgRange = histSlice.length > 0 ? histSlice.reduce((sum, c) => sum + (c.high - c.low), 0) / histSlice.length : 0;
  const curBarRange = last.high - last.low;
  const atrExpansionRatio = avgRange > 0 ? curBarRange / avgRange : 1;
  const olderRange = fullBoxSlice.length > recentLen
    ? (Math.max(...fullBoxSlice.slice(0, -recentLen).map(c => c.high)) - Math.min(...fullBoxSlice.slice(0, -recentLen).map(c => c.low)))
    : boxRange;
  const compressionRatio = olderRange > 0 ? recentBoxRange / olderRange : 1;
  const rangeContracted = recentBoxRange > 0 && boxRange > 0 ? recentBoxRange <= boxRange * 0.72 : false;

  const strictCompressionReady = fullBoxSlice.length >= minBoxBars && barsInside >= minBoxBars && boxRangeAtr <= p.max_box_atr_range;
  const recentCompressionReady = recentBoxSlice.length >= minBoxBars && recentBarsInside >= minBoxBars * 0.8 && recentBoxRangeAtr <= p.max_box_atr_range * 1.1;
  const rangeTightness = p.max_box_atr_range > 0 ? Math.max(0, Math.min(1, 1 - (boxRangeAtr / Math.max(p.max_box_atr_range * 1.35, 0.01)))) : 0;
  const recentRangeTightness = p.max_box_atr_range > 0 ? Math.max(0, Math.min(1, 1 - (recentBoxRangeAtr / Math.max(p.max_box_atr_range * 1.45, 0.01)))) : 0;
  const contractionScore = Math.max(0, Math.min(1, 1 - compressionRatio)) * 30;
  const compressionScore = clampScore((Math.max(insideRatio, recentInsideRatio) * 35) + (Math.max(rangeTightness, recentRangeTightness) * 55) + contractionScore);
  const nearCompressionReady = fullBoxSlice.length >= minBoxBars
    && Math.max(insideRatio, recentInsideRatio) >= 0.65
    && (boxRangeAtr <= p.max_box_atr_range * 1.35 || recentBoxRangeAtr <= p.max_box_atr_range * 1.45 || rangeContracted)
    && compressionScore >= 45;
  const compressionReady = strictCompressionReady || recentCompressionReady || (nearCompressionReady && breakoutConfirmed);

  const atrExpansionScore = clampScore(Math.min(1.4, atrExpansionRatio / Math.max(p.min_atr_expansion, 0.01)) * 70);
  const breakoutScore = clampScore((breakoutConfirmed ? 45 : 0) + Math.min(1, breakoutDistanceAtr / Math.max(p.breakout_buffer_atr * 4, 0.25)) * 55);
  const mom = momentumScore(closes, p.momentum_lookback);
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const directionMomentum = direction === 'buy' ? mom : -mom;
  const rsiDirectional = direction === 'buy' ? Math.max(0, (rsi - 45) / 20) : Math.max(0, (55 - rsi) / 20);
  const emaDirectional = direction === 'buy' ? (emaFast >= emaSlow ? 1 : 0.45) : (emaFast <= emaSlow ? 1 : 0.45);
  const candleBodyScore = clampScore(Math.min(bodyAtr, 1.25) * 80);
  const momentumScoreValue = clampScore((Math.max(0, directionMomentum) * 45) + (Math.min(bodyAtr, 1) * 30) + (Math.min(rsiDirectional, 1) * 15) + (emaDirectional * 10));
  const atrPct = (atr / price) * 100;
  let volatilityScore = 80;
  if (atrPct < 0.08) volatilityScore = 25;
  else if (atrPct < 0.15) volatilityScore = 55;
  else if (atrPct > 5.0) volatilityScore = 30;
  else if (atrPct > 3.5) volatilityScore = 55;

  let entry_low: number, entry_high: number, sl: number, tp1: number, tp2: number;
  if (direction === 'buy') {
    entry_low = breakoutConfirmed ? Math.min(effectiveBoxHigh, price * 0.9995) : effectiveBoxHigh;
    entry_high = breakoutConfirmed ? Math.max(price, effectiveBoxHigh + atr * 0.25) : effectiveBoxHigh + atr * 0.25;
    sl = Math.min(effectiveBoxLow - atr * 0.20, price - atr * p.stop_atr_mult);
    const riskForTargets = Math.abs(price - sl);
    tp1 = price + riskForTargets * p.tp1_r;
    tp2 = price + riskForTargets * p.tp2_r;
  } else {
    entry_low = breakoutConfirmed ? Math.min(price, effectiveBoxLow - atr * 0.25) : effectiveBoxLow - atr * 0.25;
    entry_high = breakoutConfirmed ? Math.max(effectiveBoxLow, price * 1.0005) : effectiveBoxLow;
    sl = Math.max(effectiveBoxHigh + atr * 0.20, price + atr * p.stop_atr_mult);
    const riskForTargets = Math.abs(price - sl);
    tp1 = price - riskForTargets * p.tp1_r;
    tp2 = price - riskForTargets * p.tp2_r;
  }
  const entry = price;
  const risk = Math.abs(price - sl);
  const rr = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  const rrScore = clampScore(Math.min(rr / Math.max(p.min_rr, 0.01), 1.5) * 66);
  const score = clampScore((compressionScore * 0.24) + (breakoutScore * 0.24) + (atrExpansionScore * 0.16) + (momentumScoreValue * 0.14) + (volatilityScore * 0.08) + (rrScore * 0.10) + (candleBodyScore * 0.04));
  const grade = score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 65 ? 'B' : 'reject';

  const diagnostics: Record<string, string | number | boolean> = {
    primary_failed_gate: 'passed',
    box_high: roundDiag(boxHigh, 4), box_low: roundDiag(boxLow, 4), box_range: roundDiag(boxRange, 4), box_range_pct: roundDiag(boxRangePct, 4),
    atr: roundDiag(atr, 4), box_range_atr: roundDiag(boxRangeAtr), configured_max_box_range_atr: p.max_box_atr_range,
    recent_box_high: roundDiag(recentBoxHigh, 4), recent_box_low: roundDiag(recentBoxLow, 4), recent_box_range_atr: roundDiag(recentBoxRangeAtr),
    effective_box_range_atr: roundDiag(effectiveBoxRangeAtr), used_recent_box: useRecentBox,
    average_range: roundDiag(avgRange, 4), compression_ratio: roundDiag(compressionRatio), range_contracted: rangeContracted,
    near_compression_ready: nearCompressionReady, strict_compression_ready: strictCompressionReady, recent_compression_ready: recentCompressionReady,
    breakout_level: roundDiag(direction === 'buy' ? effectiveBoxHigh : effectiveBoxLow, 4), breakout_distance_atr: roundDiag(breakoutDistanceAtr),
    atr_expansion_ratio: roundDiag(atrExpansionRatio), candles_used_in_box: useRecentBox ? recentBoxSlice.length : fullBoxSlice.length,
    full_box_candles: fullBoxSlice.length, recent_box_candles: recentBoxSlice.length, tested_timeframe: tf, resampled: tf !== '5m',
    breakout_confirmed: breakoutConfirmed, rr, stop_distance_pct: pctDistance(price, sl), tp1_distance_pct: pctDistance(price, tp1), tp2_distance_pct: pctDistance(price, tp2),
    compression_score: compressionScore, final_score: score,
  };

  let failedGate = '';
  if (!compressionReady) failedGate = 'compression_not_ready';
  else if (!breakoutConfirmed) failedGate = 'breakout_not_confirmed';
  else if (atrExpansionRatio < p.min_atr_expansion && !(nearCompressionReady && breakoutDistanceAtr >= p.breakout_buffer_atr * 2)) failedGate = 'atr_expansion_weak';
  else if (atrPct > 5.0) failedGate = 'volatility_too_high';
  else if (momentumScoreValue < 45) failedGate = 'momentum_failed';
  else if (rr < p.min_rr) failedGate = 'rr_too_low';
  else if (score < p.min_score) failedGate = 'confidence_too_low';

  if (failedGate) {
    diagnostics.primary_failed_gate = failedGate;
    return FAIL(failedGate, diagnostics);
  }
  return { ok: true, direction, entry, entry_low, entry_high, sl, tp1, tp2, grade, score, rr, reason: `CB ${direction}: box=${effectiveBoxRangeAtr.toFixed(2)} ATR, recent=${recentBoxRangeAtr.toFixed(2)} ATR, exp=${atrExpansionRatio.toFixed(2)}x, rr=${rr.toFixed(2)}R`, diagnostics };
}

function evalSW(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['15m', '1h'].includes(tf)) return FAIL('unsupported_timeframe');
  const pullbackBars = Math.max(2, Math.floor(p.pullback_bars));
  const minLen = Math.max(p.ema_slow + 5, p.atr_len + 2, p.rsi_len + 2, pullbackBars + 10, 60);
  if (window.length < minLen) return FAIL('insufficient_candles');

  const closes = window.map(c => c.close);
  const last = window[window.length - 1];
  const price = last.close;
  const atr = calcATR(window, p.atr_len);
  const rsi = calcRSI(closes, p.rsi_len);
  const emaFast = calcEMA(closes, p.ema_fast);
  const emaSlow = calcEMA(closes, p.ema_slow);
  const priorEmaFast = calcEMA(closes.slice(0, -pullbackBars), p.ema_fast);
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return FAIL('invalid_atr_or_price');

  const atrPct = (atr / price) * 100;
  const emaSpreadPct = emaSlow > 0 ? ((emaFast - emaSlow) / emaSlow) * 100 : 0;
  const emaSlopePct = priorEmaFast > 0 ? ((emaFast - priorEmaFast) / priorEmaFast) * 100 : 0;
  const bullBias = (emaSpreadPct * 1.4) + emaSlopePct + (price > emaFast ? 0.25 : -0.25) + ((rsi - 50) / 100);
  const bearBias = (-emaSpreadPct * 1.4) - emaSlopePct + (price < emaFast ? 0.25 : -0.25) + ((50 - rsi) / 100);
  const direction: 'buy' | 'sell' = bullBias >= bearBias ? 'buy' : 'sell';
  const directionalSpread = direction === 'buy' ? emaSpreadPct : -emaSpreadPct;
  const directionalSlope = direction === 'buy' ? emaSlopePct : -emaSlopePct;
  const emaAligned = directionalSpread > 0;
  const priceVsEma = direction === 'buy' ? ((price - emaFast) / price) * 100 : ((emaFast - price) / price) * 100;
  const trendScore = clampScore((emaAligned ? 42 : 12) + Math.min(Math.max(directionalSpread, 0) / 1.2, 1) * 38 + (directionalSlope > 0 ? 20 : 0));
  const emaSlopeScore = clampScore(35 + (Math.min(Math.max(directionalSlope, -0.15) + 0.15, 0.65) / 0.65) * 65);

  const pullbackWindow = window.slice(-(pullbackBars + 1), -1);
  const pullbackLow = Math.min(...pullbackWindow.map(c => c.low));
  const pullbackHigh = Math.max(...pullbackWindow.map(c => c.high));
  const touchedBuyZone = pullbackLow <= emaFast + atr * 0.75;
  const touchedSellZone = pullbackHigh >= emaFast - atr * 0.75;
  const reclaimedBuy = price > emaFast && last.close > last.open;
  const reclaimedSell = price < emaFast && last.close < last.open;
  const pullbackReady = direction === 'buy' ? touchedBuyZone : touchedSellZone;
  const strictReclaimConfirmed = direction === 'buy' ? reclaimedBuy : reclaimedSell;
  const pullbackScore = direction === 'buy'
    ? clampScore((touchedBuyZone ? 48 : 18) + (reclaimedBuy ? 38 : price > emaFast ? 22 : 0) + (pullbackLow > emaSlow ? 14 : 5))
    : clampScore((touchedSellZone ? 48 : 18) + (reclaimedSell ? 38 : price < emaFast ? 22 : 0) + (pullbackHigh < emaSlow ? 14 : 5));

  const rawMomentum = momentumScore(closes, p.momentum_lookback);
  const directionalMomentum = direction === 'buy' ? rawMomentum : -rawMomentum;
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const momentumScoreValue = clampScore((Math.max(0, directionalMomentum) * 60) + (Math.min(bodyAtr, 1) * 25) + (strictReclaimConfirmed ? 15 : 0));
  const rsiScore = direction === 'buy'
    ? clampScore(Math.min(Math.max((rsi - 45) / Math.max(p.rsi_buy_min - 45, 1), 0), 1.25) * 80)
    : clampScore(Math.min(Math.max((55 - rsi) / Math.max(55 - p.rsi_sell_max, 1), 0), 1.25) * 80);
  const trendQualityPass = trendScore >= 45 || (emaSlopeScore >= 55 && directionalSpread > -0.08 && priceVsEma > 0 && rsiScore >= 40);
  const reclaimByQuality = pullbackScore >= 68 && momentumScoreValue >= 45 && priceVsEma > -0.05;
  const reclaimConfirmed = strictReclaimConfirmed || reclaimByQuality;

  let volatilityScore = 85;
  if (atrPct < p.min_atr_pct) volatilityScore = clampScore((atrPct / Math.max(p.min_atr_pct, 0.01)) * 55);
  else if (atrPct > p.max_atr_pct) volatilityScore = clampScore(Math.max(20, 80 - ((atrPct - p.max_atr_pct) / Math.max(p.max_atr_pct, 0.01)) * 80));

  let entry_low: number, entry_high: number, sl: number, tp1: number, tp2: number;
  if (direction === 'buy') {
    entry_low = price * 0.9997;
    entry_high = price * 1.0003;
    sl = Math.min(pullbackLow - atr * 0.15, price - atr * p.stop_atr_mult);
    const riskForTargets = Math.abs(price - sl);
    tp1 = price + riskForTargets * p.tp1_r;
    tp2 = price + riskForTargets * p.tp2_r;
  } else {
    entry_low = price * 0.9997;
    entry_high = price * 1.0003;
    sl = Math.max(pullbackHigh + atr * 0.15, price + atr * p.stop_atr_mult);
    const riskForTargets = Math.abs(price - sl);
    tp1 = price - riskForTargets * p.tp1_r;
    tp2 = price - riskForTargets * p.tp2_r;
  }

  const entry = price;
  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? parseFloat((Math.abs(tp2 - entry) / risk).toFixed(2)) : 0;
  const rrScore = clampScore(Math.min(rr / Math.max(p.min_rr, 0.01), 1.5) * 66);
  const final_score = clampScore((trendScore * 0.22) + (emaSlopeScore * 0.14) + (pullbackScore * 0.20) + (momentumScoreValue * 0.16) + (rsiScore * 0.12) + (volatilityScore * 0.08) + (rrScore * 0.08));
  const grade = final_score >= 85 ? 'A+' : final_score >= 75 ? 'A' : final_score >= 65 ? 'B' : 'reject';
  const diagnostics: Record<string, string | number | boolean> = {
    primary_failed_gate: 'passed', trend_direction: direction, trend_score: trendScore, trend_quality_pass: trendQualityPass,
    ema_spread_pct: roundDiag(directionalSpread), ema_slope_pct: roundDiag(directionalSlope), ema_slope_score: emaSlopeScore, price_vs_ema: roundDiag(priceVsEma),
    pullback_score: pullbackScore, pullback_ready: pullbackReady, reclaim_confirmed: reclaimConfirmed, strict_reclaim_confirmed: strictReclaimConfirmed, reclaim_by_quality: reclaimByQuality,
    momentum_score: momentumScoreValue, rsi_score: rsiScore, volatility_score: volatilityScore, rr_score: rrScore, rr,
    stop_distance_pct: pctDistance(price, sl), tp1_distance_pct: pctDistance(price, tp1), tp2_distance_pct: pctDistance(price, tp2), final_score,
  };

  let failedGate = '';
  if (atrPct < p.min_atr_pct) failedGate = 'volatility_too_low';
  else if (atrPct > p.max_atr_pct) failedGate = 'volatility_too_high';
  else if (!trendQualityPass) failedGate = 'trend_filter_failed';
  else if (!pullbackReady || pullbackScore < 45) failedGate = 'pullback_not_ready';
  else if (!reclaimConfirmed) failedGate = 'reclaim_not_confirmed';
  else if (momentumScoreValue < 35 || rsiScore < 35) failedGate = 'momentum_failed';
  else if (rr < p.min_rr) failedGate = 'rr_too_low';
  else if (final_score < p.min_score) failedGate = 'confidence_too_low';
  if (failedGate) {
    diagnostics.primary_failed_gate = failedGate;
    return FAIL(failedGate, diagnostics);
  }

  return { ok: true, direction, entry, entry_low, entry_high, sl, tp1, tp2, grade, score: final_score, rr, reason: `SW ${direction}: ema_spread=${directionalSpread.toFixed(3)}%, slope=${directionalSlope.toFixed(3)}%, pullback=${pullbackScore}, reclaim=${reclaimConfirmed}, rr=${rr.toFixed(2)}R, score=${final_score}`, diagnostics };
}

// ─── Backtest engine ──────────────────────────────────────────────────────────

function runBacktest(
  candles: BtCandle[], strategy: Strategy, tf: string, p: ParamSet,
): { trades: BtTrade[]; evaluations: number; candidates: number; rejected: number; rejectionReasons: Record<string, number>; rejectionDiagnostics: Record<string, Record<string, string | number | boolean>> } {
  const trades: BtTrade[] = [];
  const MIN_WIN = 65;
  let evaluations = 0, candidates = 0, rejected = 0;
  const rejectionReasons: Record<string, number> = {};
  const rejectionDiagnostics: Record<string, Record<string, string | number | boolean>> = {};
  const reject = (reason: string, diagnostics?: Record<string, string | number | boolean>) => {
    const key = reason || 'no_valid_setup';
    rejected++;
    rejectionReasons[key] = (rejectionReasons[key] ?? 0) + 1;
    if (diagnostics && !rejectionDiagnostics[key]) rejectionDiagnostics[key] = diagnostics;
  };
  let inTrade = false;
  let tradeEndIndex = -1;

  const evalFn = strategy === 'MicroScalper' ? evalMS : strategy === 'CompressionBreakout' ? evalCB : evalSW;

  for (let i = MIN_WIN; i < candles.length; i++) {
    if (inTrade && i <= tradeEndIndex) continue;
    inTrade = false;

    const window = candles.slice(0, i + 1);
    evaluations++;
    const ev = evalFn(window, p, tf);
    if (!ev.ok || ev.grade === 'reject') { reject(ev.reason || 'no_valid_setup', ev.diagnostics); continue; }

    const guard = passesDistanceGuard(ev.entry, ev.sl, ev.tp1, ev.tp2, ev.score, ev.rr, p);
    if (!guard.ok) { reject(guard.reason || 'distance_guard_failed'); continue; }
    candidates++;

    // Simulate outcome from i+1 forward, max max_bars_in_trade bars
    const last = candles[i];
    let result: BtTrade['result'] = 'expired';
    let exitIndex: number | null = null;
    let exitPrice: number | null = null;
    const maxEnd = Math.min(i + p.max_bars_in_trade, candles.length - 1);

    for (let j = i + 1; j <= maxEnd; j++) {
      const c = candles[j];
      if (ev.direction === 'buy') {
        if (c.low <= ev.sl)  { result = 'sl_hit';  exitIndex = j; exitPrice = ev.sl;  break; }
        if (c.high >= ev.tp2){ result = 'tp2_hit'; exitIndex = j; exitPrice = ev.tp2; break; }
        if (c.high >= ev.tp1){ result = 'tp1_hit'; exitIndex = j; exitPrice = ev.tp1; break; }
      } else {
        if (c.high >= ev.sl) { result = 'sl_hit';  exitIndex = j; exitPrice = ev.sl;  break; }
        if (c.low <= ev.tp2) { result = 'tp2_hit'; exitIndex = j; exitPrice = ev.tp2; break; }
        if (c.low <= ev.tp1) { result = 'tp1_hit'; exitIndex = j; exitPrice = ev.tp1; break; }
      }
    }

    const risk = Math.abs(ev.entry - ev.sl);
    let pnl_r = 0;
    if (result === 'sl_hit')  pnl_r = -1;
    else if (result === 'tp2_hit') pnl_r = risk > 0 ? parseFloat((Math.abs(ev.tp2 - ev.entry) / risk).toFixed(2)) : 0;
    else if (result === 'tp1_hit') pnl_r = risk > 0 ? parseFloat((Math.abs(ev.tp1 - ev.entry) / risk).toFixed(2)) : 0;
    else pnl_r = 0; // expired

    const durationBars = exitIndex !== null ? exitIndex - i : p.max_bars_in_trade;
    trades.push({
      entryIndex: i, entryTime: last.time, strategy, direction: ev.direction,
      entry: ev.entry, entry_low: ev.entry_low, entry_high: ev.entry_high,
      stop_loss: ev.sl, tp1: ev.tp1, tp2: ev.tp2,
      result, exitIndex, exitTime: exitIndex !== null ? (candles[exitIndex]?.time ?? null) : null,
      exitPrice, pnl_r, durationBars, grade: ev.grade, score: ev.score, reason: ev.reason,
    });

    tradeEndIndex = exitIndex ?? maxEnd;
    inTrade = true;
  }

  return { trades, evaluations, candidates, rejected, rejectionReasons, rejectionDiagnostics };
}

// ─── Metrics calculator ───────────────────────────────────────────────────────

function calcMetrics(trades: BtTrade[], evaluations: number, candidates: number, rejected: number, rejectionReasons: Record<string, number> = {}, rejectionDiagnostics?: Record<string, Record<string, string | number | boolean>>): BtMetrics {
  const wins   = trades.filter(t => t.result === 'tp1_hit' || t.result === 'tp2_hit');
  const losses = trades.filter(t => t.result === 'sl_hit');
  const exps   = trades.filter(t => t.result === 'expired');
  const totalR = trades.reduce((s, t) => s + t.pnl_r, 0);
  const avgR   = trades.length > 0 ? totalR / trades.length : 0;
  const avgWin  = wins.length  > 0 ? wins.reduce((s, t)   => s + t.pnl_r, 0) / wins.length  : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl_r, 0) / losses.length : 0;
  const bestTrade  = trades.length > 0 ? Math.max(...trades.map(t => t.pnl_r)) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl_r)) : 0;
  const grossWin  = wins.reduce((s, t)   => s + t.pnl_r, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_r, 0));
  const profitFactor = grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? 999 : 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

  let maxCW = 0, maxCL = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if (t.result === 'tp1_hit' || t.result === 'tp2_hit') { cw++; cl = 0; maxCW = Math.max(maxCW, cw); }
    else if (t.result === 'sl_hit') { cl++; cw = 0; maxCL = Math.max(maxCL, cl); }
    else { cw = 0; cl = 0; }
  }

  // Max drawdown: running equity curve from R
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnl_r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length, wins: wins.length,
    tp1Hits: trades.filter(t => t.result === 'tp1_hit').length,
    tp2Hits: trades.filter(t => t.result === 'tp2_hit').length,
    losses: losses.length, expired: exps.length,
    winRate: parseFloat(winRate.toFixed(1)), profitFactor,
    totalR: parseFloat(totalR.toFixed(2)), avgR: parseFloat(avgR.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)), avgLoss: parseFloat(avgLoss.toFixed(2)),
    bestTrade: parseFloat(bestTrade.toFixed(2)), worstTrade: parseFloat(worstTrade.toFixed(2)),
    maxConsecWins: maxCW, maxConsecLosses: maxCL, maxDrawdown: parseFloat(maxDD.toFixed(2)),
    evaluations, candidates, rejected, rejectionReasons, rejectionDiagnostics,
  };
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function inferTimeframe(candles: BtCandle[]): string {
  if (candles.length < 2) return 'unknown';
  const diffs: number[] = [];
  const sample = Math.min(candles.length - 1, 20);
  for (let i = candles.length - sample; i < candles.length; i++) {
    const ms = new Date(candles[i].time).getTime() - new Date(candles[i - 1].time).getTime();
    if (ms > 0) diffs.push(ms);
  }
  if (diffs.length === 0) return 'unknown';
  diffs.sort((a, b) => a - b);
  const medianMs = diffs[Math.floor(diffs.length / 2)];
  const mins = Math.round(medianMs / 60000);
  if (mins <= 1)   return '1m';
  if (mins <= 3)   return '3m';
  if (mins <= 5)   return '5m';
  if (mins <= 15)  return '15m';
  if (mins <= 30)  return '30m';
  if (mins <= 60)  return '1h';
  if (mins <= 240) return '4h';
  if (mins <= 1440) return '1d';
  return `${mins}m`;
}

function parseCSV(text: string): { candles: BtCandle[]; skippedRows: number; error: string | null } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { candles: [], skippedRows: 0, error: 'CSV must have a header row and at least one data row' };
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));

  const timeColName = ['time', 'open_time', 'datetime', 'date', 'timestamp'].find(c => header.includes(c));
  const oi = header.indexOf('open'), hi = header.indexOf('high'), li = header.indexOf('low'), ci = header.indexOf('close');
  const vi = header.indexOf('volume');
  if (!timeColName) return { candles: [], skippedRows: 0, error: 'Missing time column (expected: time, open_time, datetime, date, or timestamp)' };
  if ([oi, hi, li, ci].some(x => x < 0)) return { candles: [], skippedRows: 0, error: 'Missing required columns: open, high, low, close' };

  const ti = header.indexOf(timeColName);
  const candles: BtCandle[] = [];
  const errs: string[] = [];
  let skippedRows = 0;

  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 4 || cols.every(c => !c)) { skippedRows++; continue; }
    const d = new Date(cols[ti] ?? '');
    if (isNaN(d.getTime())) {
      skippedRows++;
      if (errs.length < 3) errs.push(`Row ${r + 1}: invalid time "${cols[ti]}"`);
      continue;
    }
    const [open, high, low, close] = [oi, hi, li, ci].map(idx => parseFloat(cols[idx] ?? ''));
    if ([open, high, low, close].some(isNaN)) {
      skippedRows++;
      if (errs.length < 3) errs.push(`Row ${r + 1}: non-numeric OHLC`);
      continue;
    }
    candles.push({ time: d.toISOString(), open, high, low, close, volume: vi >= 0 ? (parseFloat(cols[vi] ?? '0') || 0) : 0 });
  }

  if (errs.length > 0 && candles.length === 0) return { candles: [], skippedRows, error: errs.join('; ') };
  if (candles.length < 60) return { candles: [], skippedRows, error: `Need at least 60 candles. Parsed: ${candles.length}` };
  candles.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return { candles, skippedRows, error: null };
}


function resampleCandles(candles: BtCandle[], sourceTf: string, targetTf: string): BtCandle[] {
  const sourceMinutes = TF_MINUTES[sourceTf];
  const targetMinutes = TF_MINUTES[targetTf];
  if (!sourceMinutes || !targetMinutes || sourceMinutes >= targetMinutes || targetMinutes % sourceMinutes !== 0) return [];
  const bucketMs = targetMinutes * 60000;
  const expected = targetMinutes / sourceMinutes;
  const buckets = new Map<number, BtCandle[]>();
  for (const candle of candles) {
    const ts = new Date(candle.time).getTime();
    if (!Number.isFinite(ts)) continue;
    const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
    const group = buckets.get(bucketTs) ?? [];
    group.push(candle);
    buckets.set(bucketTs, group);
  }
  const output: BtCandle[] = [];
  for (const [bucketTs, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    if (sorted.length !== expected) continue;
    output.push({
      time: new Date(bucketTs).toISOString(),
      open: sorted[0].open,
      high: Math.max(...sorted.map(c => c.high)),
      low: Math.min(...sorted.map(c => c.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((sum, c) => sum + (Number.isFinite(c.volume) ? c.volume : 0), 0),
    });
  }
  return output;
}

function buildCandlesForTimeframe(candles: BtCandle[], datasetTf: string, targetTf: string): { candles: BtCandle[]; resampled: boolean; unsupportedReason?: string } {
  if (datasetTf === targetTf) return { candles, resampled: false };
  const sourceMinutes = TF_MINUTES[datasetTf];
  const targetMinutes = TF_MINUTES[targetTf];
  if (!sourceMinutes || !targetMinutes) return { candles: [], resampled: false, unsupportedReason: `unsupported_timeframe_dataset_${datasetTf}_target_${targetTf}` };
  if (sourceMinutes > targetMinutes) return { candles: [], resampled: false, unsupportedReason: `cannot_downsample_${datasetTf}_to_${targetTf}` };
  if (sourceMinutes < targetMinutes) {
    const resampled = resampleCandles(candles, datasetTf, targetTf);
    return resampled.length >= 60 ? { candles: resampled, resampled: true } : { candles: resampled, resampled: true, unsupportedReason: `insufficient_resampled_candles_${resampled.length}` };
  }
  return { candles: [], resampled: false, unsupportedReason: 'timeframe_mapping_missing' };
}


function topMetricReason(metrics: BtMetrics): [string, number] | null {
  return Object.entries(metrics.rejectionReasons).sort((a, b) => b[1] - a[1])[0] ?? null;
}

function topMetricReasonShare(metrics: BtMetrics): number {
  const total = Object.values(metrics.rejectionReasons).reduce((sum, count) => sum + count, 0);
  const top = topMetricReason(metrics);
  return top && total > 0 ? top[1] / total : 0;
}

function isStrictRejectionReason(reason: string): boolean {
  return reason === 'confidence_too_low'
    || reason === 'momentum_failed'
    || reason === 'continuation_momentum_failed'
    || reason === 'candle_body_too_small'
    || reason === 'compression_not_ready'
    || reason === 'compression_failed_box_too_wide'
    || reason === 'compression_failed_not_enough_inside_bars'
    || reason === 'compression_drift_too_flat'
    || reason === 'breakout_not_confirmed'
    || reason === 'reclaim_not_confirmed'
    || reason === 'trend_filter_failed'
    || reason === 'trend_alignment_failed'
    || reason === 'trend_rsi_context_failed'
    || reason === 'regime_not_trending'
    || reason === 'pullback_not_ready'
    || reason === 'rr_too_low';
}

function classifyBacktestResult(metrics: BtMetrics, strategy: Strategy, unsupportedReason?: string): { classification: string; reason: string } {
  if (unsupportedReason) return { classification: 'wrong dataset/timeframe', reason: unsupportedReason };
  if (metrics.evaluations === 0) return { classification: 'broken/misconfigured', reason: 'No evaluations were possible.' };

  const top = topMetricReason(metrics);
  const topShare = topMetricReasonShare(metrics);
  const highEvaluations = metrics.evaluations >= 500;
  const dominantStrictBlocker = Boolean(top && isStrictRejectionReason(top[0]) && topShare >= 0.5);

  if (metrics.totalTrades === 0) {
    if (highEvaluations && dominantStrictBlocker) {
      return {
        classification: 'too strict / dead participation',
        reason: `Zero trades from ${metrics.evaluations.toLocaleString()} evaluations with dominant blocker ${top?.[0]} (${Math.round(topShare * 100)}% of rejects).`,
      };
    }
    if (highEvaluations && strategy === 'SwingContinuation') {
      const reasons = Object.entries(metrics.rejectionReasons).filter(([reason]) => isStrictRejectionReason(reason)).length;
      return {
        classification: 'possible parity mismatch',
        reason: `Zero trades from ${metrics.evaluations.toLocaleString()} evaluations across ${reasons} strict SwingContinuation gates; audit whether backtest logic matches live scanner behavior before assuming no market fit.`,
      };
    }
    if (highEvaluations && top && isStrictRejectionReason(top[0])) {
      return {
        classification: 'too strict / dead participation',
        reason: `Zero trades from ${metrics.evaluations.toLocaleString()} evaluations; top strict blocker is ${top[0]} (${top[1].toLocaleString()} rejects).`,
      };
    }
    return { classification: 'needs more data', reason: `No trades yet, but only ${metrics.evaluations.toLocaleString()} evaluations; extend sample before tuning conclusions.` };
  }

  if (metrics.totalTrades < 10) return { classification: 'needs more data', reason: 'Too few trades for decision confidence.' };

  if (metrics.totalR > 0 && metrics.profitFactor > 1 && metrics.winRate >= 40) {
    const weakExpectancy = metrics.avgR < 0.07;
    const elevatedDrawdown = metrics.maxDrawdown > Math.max(10, Math.abs(metrics.totalR) * 0.4);
    const marginalPf = metrics.profitFactor < 1.15;
    if (weakExpectancy || elevatedDrawdown || marginalPf) {
      return {
        classification: 'viable but noisy',
        reason: `Profitable sample (PF ${metrics.profitFactor}, total ${metrics.totalR}R), but quality is noisy due to ${[weakExpectancy ? `weak avg R ${metrics.avgR}` : '', elevatedDrawdown ? `drawdown ${metrics.maxDrawdown}R` : '', marginalPf ? `marginal PF ${metrics.profitFactor}` : ''].filter(Boolean).join(', ')}.`,
      };
    }
    return { classification: 'viable / preserve', reason: 'Positive R with acceptable profit factor, hit rate, expectancy, and drawdown evidence.' };
  }

  if (metrics.totalR <= 0) return { classification: 'needs tuning', reason: 'Trades were generated, but R/result quality is poor.' };
  return { classification: 'viable but noisy', reason: 'Profitable trade sample exists, but quality metrics are not strong enough to preserve without tuning.' };
}

function topRejectionReasons(reasons: Record<string, number>, limit = 6): [string, number][] {
  return Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function makeRunResult(strategy: Strategy, datasetTimeframe: string, testedTimeframe: string, sourceCandles: BtCandle[], params: ParamSet, preset: ResearchPreset): BacktestRunResult {
  const built = buildCandlesForTimeframe(sourceCandles, datasetTimeframe, testedTimeframe);
  const runnable = !built.unsupportedReason && built.candles.length >= 60;
  const bt = runnable
    ? runBacktest(built.candles, strategy, testedTimeframe, params)
    : { trades: [] as BtTrade[], evaluations: 0, candidates: 0, rejected: built.candles.length, rejectionReasons: { [built.unsupportedReason ?? 'insufficient_candles']: built.candles.length } };
  const metrics = calcMetrics(bt.trades, bt.evaluations, bt.candidates, bt.rejected, bt.rejectionReasons, 'rejectionDiagnostics' in bt ? bt.rejectionDiagnostics : undefined);
  const cls = classifyBacktestResult(metrics, strategy, built.unsupportedReason);
  return {
    id: `${strategy}-${testedTimeframe}-${preset}`,
    strategy,
    datasetTimeframe,
    testedTimeframe,
    resampled: built.resampled,
    candlesLoaded: sourceCandles.length,
    candlesTested: built.candles.length,
    metrics,
    trades: bt.trades,
    params,
    preset,
    classification: cls.classification,
    classificationReason: cls.reason,
    truthLabel: strategy === 'CompressionBreakout' ? 'Live strategy parity logic' : 'Backtest approximation logic',
    parityNote: strategy === 'CompressionBreakout'
      ? 'CompressionBreakout mirrors the live scanner box/ATR/recent-compression/breakout scoring path with browser-side fills; provider context, slippage, DB config, and live duplicate protections are still not executed in-browser.'
      : 'Uses browser-compatible evaluator kept on the current HashiBot strategy family and selected backtest preset parameters; live Edge Function imports are not executed in-browser, so fills/slippage/provider context may differ.',
    unsupportedReason: built.unsupportedReason,
  };
}

function buildRunPlan(choice: StrategyChoice, datasetTimeframe: string): Array<{ strategy: Strategy; timeframe: string }> {
  const strategies: Strategy[] = choice === 'ALL' ? ['MicroScalper', 'CompressionBreakout', 'SwingContinuation'] : [choice];
  const sourceMinutes = TF_MINUTES[datasetTimeframe] ?? Infinity;
  return strategies.flatMap(s => {
    const validTargets = STRATEGY_TIMEFRAMES[s].filter(tf => (TF_MINUTES[tf] ?? 0) >= sourceMinutes);
    const targets = validTargets.length > 0 ? validTargets : [STRATEGY_TIMEFRAMES[s][0]];
    return targets.map(timeframe => ({ strategy: s, timeframe }));
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  // Converts ISO to "YYYY-MM-DDTHH:mm" for datetime-local input
  return iso.slice(0, 16);
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

const RESULT_COLOR: Record<string, string> = {
  tp2_hit: 'text-emerald-400', tp1_hit: 'text-green-400',
  sl_hit: 'text-red-400', expired: 'text-zinc-500',
};
const GRADE_COLOR: Record<string, string> = { 'A+': 'text-emerald-400', A: 'text-sky-400', B: 'text-yellow-400' };

function PnlSpan({ r }: { r: number }) {
  const cls = r > 0 ? 'text-emerald-400' : r < 0 ? 'text-red-400' : 'text-zinc-500';
  return <span className={cls}>{r > 0 ? '+' : ''}{r.toFixed(2)}R</span>;
}

function MetricCell({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="bg-zinc-900 px-4 py-3">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${highlight ?? 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

function ParamRow({ label, field, value, onChange, step = 0.01, min }: {
  label: string; field: keyof ParamSet; value: number;
  onChange: (k: keyof ParamSet, v: number) => void; step?: number; min?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-zinc-400 w-44 shrink-0">{label}</label>
      <input
        type="number" step={step} min={min ?? 0} value={value}
        onChange={e => onChange(field, parseFloat(e.target.value) || 0)}
        className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
      />
    </div>
  );
}


const CLASSIFICATION_RANK: Record<string, number> = {
  'viable / preserve': 1,
  viable: 1,
  'viable but noisy': 2,
  'needs tuning': 3,
  'possible parity mismatch': 4,
  'needs more data': 5,
  'not enough trades': 5,
  'too strict / dead participation': 6,
  'broken/misconfigured': 7,
  'wrong dataset/timeframe': 8,
  'wrong timeframe/dataset': 8,
};

function capitalForResult(result: BacktestRunResult, assumptions: CapitalAssumptions) {
  return estimateCapitalFromR(result.trades.map(t => t.pnl_r), assumptions);
}

function compareRunResults(a: BacktestRunResult, b: BacktestRunResult): number {
  const rank = (CLASSIFICATION_RANK[a.classification] ?? 99) - (CLASSIFICATION_RANK[b.classification] ?? 99);
  if (rank !== 0) return rank;
  const aDecision = ['viable / preserve', 'viable', 'viable but noisy', 'needs tuning'].includes(a.classification);
  const bDecision = ['viable / preserve', 'viable', 'viable but noisy', 'needs tuning'].includes(b.classification);
  if (aDecision && bDecision) {
    if (b.metrics.profitFactor !== a.metrics.profitFactor) return b.metrics.profitFactor - a.metrics.profitFactor;
    if (b.metrics.totalR !== a.metrics.totalR) return b.metrics.totalR - a.metrics.totalR;
    if (b.metrics.avgR !== a.metrics.avgR) return b.metrics.avgR - a.metrics.avgR;
    return a.metrics.maxDrawdown - b.metrics.maxDrawdown;
  }
  return b.metrics.totalTrades - a.metrics.totalTrades;
}

function recommendationForResult(result: BacktestRunResult): { action: string; text: string } {
  const label = `${result.strategy} ${result.testedTimeframe}`;
  if (result.unsupportedReason || ['wrong dataset/timeframe', 'wrong timeframe/dataset'].includes(result.classification)) return { action: 'Wrong dataset', text: `${label}: Wrong dataset/timeframe — ${result.unsupportedReason ?? 'uploaded timeframe cannot support this test'}.` };
  if (result.strategy === 'MicroScalper' && result.testedTimeframe === '15m' && ['viable / preserve', 'viable'].includes(result.classification)) return { action: 'Keep', text: `${label}: Keep / preserve core behavior. Only optimize carefully, and check longer datasets plus chop periods before loosening or tightening.` };
  if (result.strategy === 'MicroScalper' && result.testedTimeframe === '5m' && result.classification === 'viable but noisy') return { action: 'Tune later', text: `${label}: Viable but noisy — do not discard; tune later for drawdown, loss streak, and lower average R. 15m appears cleaner in this sample.` };
  if (result.strategy === 'CompressionBreakout' && result.testedTimeframe === '15m' && result.classification === 'too strict / dead participation') return { action: 'Tune first', text: `${label}: Tune first — likely compression-box/range threshold too strict or incorrectly scaled. Dominant blocker: ${topReason(result)?.[0] ?? 'none'}. Do not simply lower score/RR; investigate box width, ATR normalization, near-compression, and resampled timeframe behavior.` };
  if (result.strategy === 'CompressionBreakout' && result.testedTimeframe === '1h' && result.classification === 'too strict / dead participation') return { action: 'Audit', text: `${label}: Same compression blocker appears (${topReason(result)?.[0] ?? 'none'}), but confidence is lower due to fewer 1h samples; gather more data before major tuning.` };
  if (result.strategy === 'SwingContinuation' && result.testedTimeframe === '15m' && result.metrics.totalTrades === 0) return { action: 'Audit after CompressionBreakout', text: `${label}: Audit/tune after CompressionBreakout — likely too strict or possible backtest/live parity mismatch. Dominant blockers: ${topRejectionReasons(result.metrics.rejectionReasons, 3).map(([reason]) => reason).join(', ') || 'none'}. Check whether the backtest evaluator matches live scanner SwingContinuation behavior.` };
  if (result.strategy === 'SwingContinuation' && result.testedTimeframe === '1h' && result.metrics.totalTrades === 0) return { action: 'Low-confidence audit', text: `${label}: Lower confidence zero-trade finding; main blockers are ${topRejectionReasons(result.metrics.rejectionReasons, 2).map(([reason]) => reason).join(' and ') || 'none'}. Test more 1h data before major tuning.` };
  if (['viable / preserve', 'viable'].includes(result.classification)) return { action: 'Keep', text: `${label}: Keep — viable in this sample with positive R and acceptable PF/drawdown evidence.` };
  if (result.classification === 'viable but noisy') return { action: 'Tune later', text: `${label}: Viable but noisy — profitable evidence exists, but tune for drawdown/noise before considering expansion.` };
  if (result.classification === 'too strict / dead participation') return { action: 'Tune', text: `${label}: Too strict / dead participation — no trades from ${result.metrics.evaluations.toLocaleString()} evaluations; investigate top blocker ${topReason(result)?.[0] ?? 'none'}.` };
  if (result.classification === 'possible parity mismatch') return { action: 'Audit parity', text: `${label}: Possible parity mismatch — zero trades despite enough evaluations; audit backtest gates against live scanner behavior before tuning parameters.` };
  if (result.classification === 'needs tuning') return { action: 'Tune', text: `${label}: Needs tuning — trades exist but PF ${result.metrics.profitFactor} and total R ${result.metrics.totalR} are not strong enough.` };
  if (['needs more data', 'not enough trades'].includes(result.classification)) return { action: 'Needs more data', text: `${label}: Needs more data — ${result.metrics.totalTrades} trades from ${result.metrics.evaluations.toLocaleString()} evaluations; check longer data before tuning conclusions.` };
  if (result.classification === 'broken/misconfigured') return { action: 'Disable', text: `${label}: Disable/investigate — no evaluations were possible.` };
  return { action: 'Tune', text: `${label}: Tune — evidence is not decision-ready under the current sample.` };
}


type TuningSituation =
  | 'Too strict / dead participation'
  | 'Possible parity mismatch'
  | 'Too strict'
  | 'Too loose / low quality'
  | 'Bad trade management / poor exits'
  | 'Symbol/timeframe mismatch'
  | 'Needs more data'
  | 'Viable but noisy'
  | 'Viable but needs optimization'
  | 'Viable / preserve';

type TuningConfidence = 'High' | 'Medium' | 'Low';

interface TuningDiagnosis {
  situation: TuningSituation;
  mainWeakness: string;
  suggestedDirection: string;
  confidence: TuningConfidence;
  confidenceReason: string;
}

interface TuningInsight {
  label: string;
  result: BacktestRunResult | null;
  note: string;
}

const STRICT_REJECTION_REASONS = new Set([
  'confidence_too_low', 'momentum_failed', 'continuation_momentum_failed', 'candle_body_too_small',
  'compression_not_ready', 'compression_failed_box_too_wide', 'compression_failed_not_enough_inside_bars',
  'compression_drift_too_flat', 'breakout_not_confirmed', 'reclaim_not_confirmed', 'trend_filter_failed',
  'trend_alignment_failed', 'trend_rsi_context_failed', 'regime_not_trending', 'pullback_not_ready', 'rr_too_low',
]);

function rejectionTotal(result: BacktestRunResult): number {
  return Object.values(result.metrics.rejectionReasons).reduce((sum, count) => sum + count, 0);
}

function topReason(result: BacktestRunResult): [string, number] | null {
  return topRejectionReasons(result.metrics.rejectionReasons, 1)[0] ?? null;
}

function reasonShare(result: BacktestRunResult): number {
  const top = topReason(result);
  const total = rejectionTotal(result);
  return top && total > 0 ? top[1] / total : 0;
}

function hasAnyTopReason(result: BacktestRunResult, reasons: string[]): boolean {
  const entries = topRejectionReasons(result.metrics.rejectionReasons, 5);
  return entries.some(([reason]) => reasons.includes(reason));
}

function resultLabel(result: BacktestRunResult): string {
  return `${result.strategy} ${result.testedTimeframe} · ${RESEARCH_PRESET_LABEL[result.preset]}`;
}

function confidenceForResult(result: BacktestRunResult, situation: TuningSituation): { confidence: TuningConfidence; reason: string } {
  const m = result.metrics;
  const clearZeroTrade = m.totalTrades === 0 && m.evaluations >= 1000 && reasonShare(result) >= 0.5;
  if (m.evaluations < 100 || result.candlesTested < 300) return { confidence: 'Low', reason: 'Dataset/evaluation count is small; needs a longer sample before tuning.' };
  if (m.totalTrades >= 50) return { confidence: 'High', reason: 'Large enough trade sample for a strong diagnostic signal.' };
  if ((situation === 'Too loose / low quality' || situation === 'Bad trade management / poor exits') && m.totalTrades >= 25 && (m.profitFactor < 0.8 || m.maxConsecLosses >= 5)) return { confidence: 'High', reason: 'Loss quality is severe across a meaningful trade sample.' };
  if (clearZeroTrade) return { confidence: 'High', reason: 'Many evaluations produced no trades and a dominant rejection reason is clear.' };
  if (m.totalTrades >= 10 || m.evaluations >= 1000) return { confidence: 'Medium', reason: 'Enough evidence for a directional tuning hypothesis, but confirm on more data.' };
  return { confidence: 'Low', reason: 'Few trades/evaluations; treat as a hypothesis only.' };
}

function strategySpecificDirection(result: BacktestRunResult, situation: TuningSituation): string {
  const top = topReason(result)?.[0] ?? 'none';
  if (result.strategy === 'MicroScalper') {
    if (['candle_body_too_small', 'momentum_failed', 'continuation_momentum_failed'].includes(top)) return 'Consider testing momentum/body confirmation in research presets; do not loosen until checked on a longer dataset and chop periods.';
    if (situation === 'Too loose / low quality') return 'Consider stricter momentum, stronger trend filter, or reducing chop entries in a research preset.';
    if (situation === 'Bad trade management / poor exits') return 'Investigate TP1/TP2 balance, break-even timing, or trailing behavior in research only.';
    if (situation === 'Viable / preserve') return 'Preserve the core scalp behavior for now; only test small risk/trade-management optimizations.';
  }
  if (result.strategy === 'CompressionBreakout') {
    if (top.includes('compression')) return 'Investigate whether compression range thresholds or near-compression logic are too strict in research presets.';
    if (top === 'breakout_not_confirmed' || top === 'breakout_distance_too_small') return 'Consider testing breakout buffer/confirmation sensitivity; keep structure evidence required.';
    if (top === 'rr_too_low' || top.includes('too_close')) return 'Investigate structural SL/TP math and distance guards in research; do not remove safety checks.';
    if (situation === 'Too loose / low quality' || situation === 'Bad trade management / poor exits') return 'Consider fakeout protection, retest confirmation, or time-stop adjustments in research presets.';
    if (situation === 'Viable / preserve') return 'Preserve breakout structure; only test fakeout/exit refinements.';
  }
  if (result.strategy === 'SwingContinuation') {
    if (['trend_alignment_failed', 'trend_filter_failed', 'regime_not_trending', 'trend_rsi_context_failed'].includes(top)) return 'Investigate whether trend filter requirements are too strict for this symbol/timeframe.';
    if (top === 'pullback_not_ready' || top === 'reclaim_not_confirmed') return 'Consider testing broader pullback/reclaim quality rules while still rejecting chop.';
    if (top.includes('momentum')) return 'Investigate continuation momentum thresholds and follow-through quality in research presets.';
    if (result.metrics.expired / Math.max(result.metrics.totalTrades, 1) > 0.3) return 'Review time-stop or continuation follow-through logic in research; avoid forcing exits to look profitable.';
    if (situation === 'Too loose / low quality') return 'Consider stricter reclaim quality, cleaner trend filter, or better invalidation logic.';
    if (situation === 'Viable / preserve') return 'Preserve trend/reclaim logic and optimize trade management carefully.';
  }
  if (situation === 'Too strict / dead participation') return 'Tune blocker first; investigate dominant rejection scaling before any live config change.';
  if (situation === 'Possible parity mismatch') return 'Audit backtest/live parity and strict gates before assuming the strategy cannot participate.';
  if (situation === 'Too strict') return 'Consider testing a slightly less restrictive research preset; keep RR and distance guards intact.';
  if (situation === 'Too loose / low quality') return 'Consider stricter filters in research; do not promote this behavior without improved PF/R.';
  if (situation === 'Bad trade management / poor exits') return 'Investigate exits, expiry, TP balance, and invalidation in research only.';
  if (situation === 'Symbol/timeframe mismatch') return 'Test a more suitable timeframe or longer native dataset before tuning parameters.';
  if (situation === 'Needs more data') return 'Extend the sample before drawing tuning conclusions.';
  if (situation === 'Viable but noisy') return 'Do not discard; tune drawdown, loss streaks, and expectancy only after preserving the cleaner timeframe.';
  return 'Preserve core logic and test only small, isolated optimizations.';
}

function diagnoseTuning(result: BacktestRunResult, allResults: BacktestRunResult[]): TuningDiagnosis {
  const m = result.metrics;
  const top = topReason(result);
  const rejectionRatio = m.evaluations > 0 ? m.rejected / m.evaluations : 1;
  const candidateRatio = m.evaluations > 0 ? m.candidates / m.evaluations : 0;
  const slRate = m.totalTrades > 0 ? m.losses / m.totalTrades : 0;
  const tp2Rate = m.totalTrades > 0 ? m.tp2Hits / m.totalTrades : 0;
  const expiryRate = m.totalTrades > 0 ? m.expired / m.totalTrades : 0;
  const sameStrategyBetterTf = allResults.some(other => other.strategy === result.strategy && other.id !== result.id && ['viable / preserve', 'viable', 'viable but noisy', 'needs tuning'].includes(other.classification) && !['viable / preserve', 'viable', 'viable but noisy', 'needs tuning'].includes(result.classification));
  let situation: TuningSituation;
  let weakness: string;

  if (result.unsupportedReason) {
    situation = 'Symbol/timeframe mismatch';
    weakness = `Unsupported or insufficient timeframe path: ${result.unsupportedReason}.`;
  } else if (result.classification === 'too strict / dead participation') {
    situation = 'Too strict / dead participation';
    weakness = top ? `No trades from ${m.evaluations.toLocaleString()} evaluations; dominant blocker is ${top[0]} (${top[1].toLocaleString()} rejects, ${Math.round(reasonShare(result) * 100)}% share).` : 'No trades despite enough evaluations; blocker is unclear.';
  } else if (result.classification === 'possible parity mismatch') {
    situation = 'Possible parity mismatch';
    weakness = top ? `No trades from ${m.evaluations.toLocaleString()} evaluations; leading blockers include ${topRejectionReasons(m.rejectionReasons, 3).map(([reason, count]) => `${reason}=${count}`).join(', ')}. This may be too strict or a backtest/live parity mismatch.` : 'No trades despite enough evaluations; audit live/backtest parity.';
  } else if (sameStrategyBetterTf && m.totalTrades === 0) {
    situation = 'Symbol/timeframe mismatch';
    weakness = 'Another timeframe for the same strategy produced better evidence than this zero-trade result.';
  } else if (rejectionRatio > 0.85 && candidateRatio < 0.03 && top && (STRICT_REJECTION_REASONS.has(top[0]) || hasAnyTopReason(result, [...STRICT_REJECTION_REASONS]))) {
    situation = 'Too strict';
    weakness = `High rejection ratio (${Math.round(rejectionRatio * 100)}%) with low candidate flow; top reason is ${top[0]}.`;
  } else if (m.totalTrades >= 10 && m.totalR < 0 && (m.profitFactor < 0.9 || m.winRate < 40 || m.maxConsecLosses >= 4)) {
    situation = 'Too loose / low quality';
    weakness = `Trades are active but quality is poor: PF ${m.profitFactor}, win ${m.winRate}%, total ${m.totalR}R, max loss streak ${m.maxConsecLosses}.`;
  } else if (m.totalTrades >= 5 && (m.avgR <= 0 || slRate >= 0.45 || tp2Rate < 0.1 || expiryRate > 0.35)) {
    situation = 'Bad trade management / poor exits';
    weakness = `Exit profile is weak: avg ${m.avgR}R, SL rate ${Math.round(slRate * 100)}%, TP2 rate ${Math.round(tp2Rate * 100)}%, expiry ${Math.round(expiryRate * 100)}%.`;
  } else if (['viable / preserve', 'viable'].includes(result.classification)) {
    situation = 'Viable / preserve';
    weakness = `Positive sample: PF ${m.profitFactor}, total ${m.totalR}R, avg ${m.avgR}R, max drawdown ${m.maxDrawdown}R.`;
  } else if (result.classification === 'viable but noisy') {
    situation = 'Viable but noisy';
    weakness = `Profitable but noisy: PF ${m.profitFactor}, total ${m.totalR}R, avg ${m.avgR}R, max drawdown ${m.maxDrawdown}R.`;
  } else if (['needs more data', 'not enough trades'].includes(result.classification)) {
    situation = 'Needs more data';
    weakness = `Only ${m.totalTrades} trades from ${m.evaluations.toLocaleString()} evaluations; avoid strong conclusions.`;
  } else {
    situation = 'Viable but needs optimization';
    weakness = m.totalTrades > 0 ? `Some evidence exists but quality is not decisive: PF ${m.profitFactor}, total ${m.totalR}R, avg ${m.avgR}R.` : 'No decisive trade evidence yet.';
  }

  const confidence = confidenceForResult(result, situation);
  return {
    situation,
    mainWeakness: weakness,
    suggestedDirection: strategySpecificDirection(result, situation),
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
  };
}

function deadParticipationScore(result: BacktestRunResult): number {
  if (result.metrics.totalTrades > 0) return 0;
  const top = topReason(result);
  const blockerClarity = top && STRICT_REJECTION_REASONS.has(top[0]) ? Math.max(reasonShare(result), 0.25) : 0;
  const evaluationWeight = Math.min(result.metrics.evaluations / 1000, 3);
  const compressionPriority = result.strategy === 'CompressionBreakout' && result.testedTimeframe === '15m' ? 2 : 0;
  const swingPriority = result.strategy === 'SwingContinuation' && result.testedTimeframe === '15m' ? 1 : 0;
  const lowerTimeframePenalty = result.testedTimeframe === '1h' ? -0.75 : 0;
  return evaluationWeight + blockerClarity + compressionPriority + swingPriority + lowerTimeframePenalty;
}

function worstScore(result: BacktestRunResult): number {
  const m = result.metrics;
  if (m.totalTrades === 0) return 100 + deadParticipationScore(result);
  if (m.totalTrades < 10) return 10;
  const negativeQuality = Math.max(0, -m.totalR) * 2 + Math.max(0, 1 - m.profitFactor) * 20 + Math.max(0, m.maxDrawdown - Math.max(10, Math.abs(m.totalR) * 0.5));
  return negativeQuality;
}

function tuneOrderScore(result: BacktestRunResult): number {
  const diagnosis = diagnoseTuning(result, []);
  if (result.testedTimeframe === '1h') return 5 + Math.min(result.metrics.evaluations / 1000, 1);
  if (result.strategy === 'CompressionBreakout' && result.testedTimeframe === '15m' && result.metrics.totalTrades === 0) return 100 + deadParticipationScore(result);
  if (result.strategy === 'SwingContinuation' && result.testedTimeframe === '15m' && result.metrics.totalTrades === 0) return 80 + deadParticipationScore(result);
  if (result.classification === 'too strict / dead participation') return 70 + deadParticipationScore(result);
  if (result.classification === 'possible parity mismatch') return 60 + deadParticipationScore(result);
  if (result.classification === 'needs tuning') return 45;
  if (result.classification === 'viable but noisy') return result.strategy === 'MicroScalper' && result.testedTimeframe === '5m' ? 35 : 30;
  if (diagnosis.situation === 'Viable / preserve') return 10;
  return 0;
}

function recommendedTuningOrder(results: BacktestRunResult[]): BacktestRunResult[] {
  return [...results]
    .sort((a, b) => {
      const score = tuneOrderScore(b) - tuneOrderScore(a);
      if (score !== 0) return score;
      if (b.metrics.evaluations !== a.metrics.evaluations) return b.metrics.evaluations - a.metrics.evaluations;
      return compareRunResults(a, b);
    });
}


function buildTuningInsights(results: BacktestRunResult[], assumptions: CapitalAssumptions): TuningInsight[] {
  if (results.length === 0) return [];
  const sorted = [...results].sort(compareRunResults);
  const tuningOrder = recommendedTuningOrder(results);
  const overactive = [...results].filter(r => r.metrics.totalTrades > 0).sort((a, b) => b.metrics.totalTrades - a.metrics.totalTrades)[0] ?? null;
  const dead = [...results].filter(r => r.metrics.totalTrades === 0).sort((a, b) => deadParticipationScore(b) - deadParticipationScore(a))[0] ?? null;
  const highestDd = [...results].filter(r => r.metrics.totalTrades > 0).sort((a, b) => b.metrics.maxDrawdown - a.metrics.maxDrawdown)[0] ?? null;
  const riskAdjusted = [...results].filter(r => r.metrics.totalTrades > 0).sort((a, b) => (b.metrics.totalR / Math.max(b.metrics.maxDrawdown, 0.5)) - (a.metrics.totalR / Math.max(a.metrics.maxDrawdown, 0.5)))[0] ?? null;
  const preserve = sorted.find(r => diagnoseTuning(r, results).situation === 'Viable / preserve') ?? null;
  const tuneFirst = tuningOrder.find(r => tuneOrderScore(r) >= 30) ?? null;
  const worst = [...results].sort((a, b) => worstScore(b) - worstScore(a))[0] ?? null;
  return [
    { label: 'Best strategy/timeframe/preset', result: sorted[0] ?? null, note: 'Top-ranked by viability, PF, total R, average R, drawdown, and sample size.' },
    { label: 'Worst strategy/timeframe/preset', result: worst, note: worst ? 'Prioritizes true dead participation, high-confidence blockers, negative R/PF, and severe drawdown over profitable-but-noisy results.' : 'No result.' },
    { label: 'Most overactive strategy', result: overactive, note: overactive ? `${overactive.metrics.totalTrades} trades generated.` : 'No traded result.' },
    { label: 'Most dead strategy', result: dead, note: dead ? `${dead.metrics.evaluations.toLocaleString()} evaluations, ${dead.metrics.rejected.toLocaleString()} rejections, and no trades; top blocker ${topReason(dead)?.[0] ?? 'none'}.` : 'No zero-trade result.' },
    { label: 'Highest drawdown strategy', result: highestDd, note: highestDd ? `${highestDd.metrics.maxDrawdown}R max drawdown; ${formatMoney(capitalForResult(highestDd, assumptions).maxDrawdownAmount)} estimated.` : 'No traded result.' },
    { label: 'Best risk-adjusted candidate', result: riskAdjusted, note: riskAdjusted ? `${(riskAdjusted.metrics.totalR / Math.max(riskAdjusted.metrics.maxDrawdown, 0.5)).toFixed(2)} TotalR/MaxDD score.` : 'No traded result.' },
    { label: 'Strategy to preserve', result: preserve, note: preserve ? 'Positive evidence; preserve core behavior and only optimize carefully.' : 'No preserve candidate yet.' },
    { label: 'Strategy to tune first', result: tuneFirst, note: tuneFirst ? diagnoseTuning(tuneFirst, results).mainWeakness : 'No obvious first tuning candidate yet.' },
  ];
}

function buildCopyableTuningReport(symbol: string, datasetTf: string, csvInfo: CsvInfo | null, preset: ResearchPreset, results: BacktestRunResult[], assumptions: CapitalAssumptions): string {
  const sorted = [...results].sort(compareRunResults);
  const range = csvInfo ? `${new Date(csvInfo.firstTime).toISOString()} → ${new Date(csvInfo.lastTime).toISOString()}` : 'unknown';
  const insights = buildTuningInsights(sorted, assumptions);
  const lines = [
    'HashiBot Strategy Tuning Report',
    'Diagnostic recommendations only — no live config changes requested.',
    `Symbol: ${symbol.trim().toUpperCase() || 'unspecified'}`,
    `Dataset timeframe: ${datasetTf}`,
    `Dataset range: ${range}`,
    `Starting capital: ${formatMoney(assumptions.startingCapital)} | Risk/trade: ${formatPct(assumptions.riskPct)}`,
    `Preset used: ${RESEARCH_PRESET_LABEL[preset]} (backtest-only)`,
    'Limitations: browser-side backtest approximation; no live Edge Function execution, slippage, provider context, or DB strategy_config update.',
    '',
    'Results and tuning diagnoses:',
    ...sorted.flatMap(result => {
      const diagnosis = diagnoseTuning(result, sorted);
      const topReasons = topRejectionReasons(result.metrics.rejectionReasons, 5).map(([reason, count]) => `${reason}=${count}`).join(', ') || 'none';
      const cap = capitalForResult(result, assumptions);
      return [
        `- ${resultLabel(result)}: classification=${result.classification}, situation=${diagnosis.situation}, trades=${result.metrics.totalTrades}, win=${result.metrics.totalTrades > 0 ? `${result.metrics.winRate}%` : 'N/A'}, PF=${result.metrics.totalTrades > 0 ? result.metrics.profitFactor : 'N/A'}, totalR=${result.metrics.totalTrades > 0 ? result.metrics.totalR : 'N/A'}, avgR=${result.metrics.totalTrades > 0 ? result.metrics.avgR : 'N/A'}, maxDD=${result.metrics.totalTrades > 0 ? `${result.metrics.maxDrawdown}R` : 'N/A'}, estPL=${result.metrics.totalTrades > 0 ? formatMoney(cap.estimatedPnl) : 'N/A'}, topReject=${topReasons}`,
        `  Main weakness: ${diagnosis.mainWeakness}`,
        `  Suggested direction: ${diagnosis.suggestedDirection}`,
        `  Confidence: ${diagnosis.confidence} — ${diagnosis.confidenceReason}`,
      ];
    }),
    '',
    'Best/worst insights:',
    ...insights.map(insight => `- ${insight.label}: ${insight.result ? resultLabel(insight.result) : 'N/A'} — ${insight.note}`),
    '',
    'Recommended next tuning order:',
    ...recommendedTuningOrder(sorted).map((result, index) => `- ${index + 1}. ${resultLabel(result)}: ${diagnoseTuning(result, sorted).situation} (${diagnoseTuning(result, sorted).confidence}) — ${recommendationForResult(result).text}`),
    '',
    'Warning: use this as research evidence only. Do not auto-apply live strategy_config changes without separate validation.',
  ];
  return lines.join('\n');
}

function buildCopySummary(symbol: string, datasetTf: string, csvInfo: CsvInfo | null, preset: ResearchPreset, results: BacktestRunResult[]): string {
  const range = csvInfo ? `${new Date(csvInfo.firstTime).toISOString()} → ${new Date(csvInfo.lastTime).toISOString()}` : 'unknown';
  const sorted = [...results].sort(compareRunResults);
  const best = sorted[0];
  const worst = [...results].sort((a, b) => worstScore(b) - worstScore(a))[0];
  const tuningOrder = recommendedTuningOrder(results);
  const lines = [
    'HashiBot Backtest Lab Summary',
    `Symbol: ${symbol.trim().toUpperCase() || 'unspecified'}`,
    `Dataset timeframe: ${datasetTf}`,
    `Dataset range: ${range}`,
    `Preset used: ${RESEARCH_PRESET_LABEL[preset]} (backtest-only; does not affect live scanner/config/Telegram)`,
    '',
    'Strategy results:',
    ...results.map(r => {
      const top = topRejectionReasons(r.metrics.rejectionReasons, 1)[0];
      return `- ${r.strategy} ${r.testedTimeframe}: preset=${RESEARCH_PRESET_LABEL[r.preset]}, dataset=${r.datasetTimeframe}, resampled=${r.resampled ? 'yes' : 'no'}, trades=${r.metrics.totalTrades}, win=${r.metrics.totalTrades > 0 ? `${r.metrics.winRate}%` : 'N/A'}, PF=${r.metrics.totalTrades > 0 ? r.metrics.profitFactor : 'N/A'}, totalR=${r.metrics.totalTrades > 0 ? r.metrics.totalR : 'N/A'}, avgR=${r.metrics.totalTrades > 0 ? r.metrics.avgR : 'N/A'}, maxDD=${r.metrics.totalTrades > 0 ? `${r.metrics.maxDrawdown}R` : 'N/A'}, classification=${r.classification}, topReject=${top ? `${top[0]} (${top[1]})` : 'none'}`;
    }),
    '',
    `Best strategy/timeframe: ${best ? `${best.strategy} ${best.testedTimeframe} (${best.classification}, ${best.metrics.totalR}R)` : 'N/A'}`,
    `Worst strategy/timeframe: ${worst ? `${worst.strategy} ${worst.testedTimeframe} (${worst.classification}, ${worst.metrics.totalR}R)` : 'N/A'}`,
    '',
    'Recommendations:',
    ...results.map(r => `- ${recommendationForResult(r).text}`),
    '',
    'Recommended tuning order:',
    ...tuningOrder.map((r, index) => `- ${index + 1}. ${r.strategy} ${r.testedTimeframe}: ${diagnoseTuning(r, results).situation} — ${recommendationForResult(r).action}`),
  ];
  return lines.join('\n');
}

function formatDiagnosticValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : String(value);
  return value;
}

const TRADES_PER_PAGE = 50;

// ─── Main component ───────────────────────────────────────────────────────────

export default function BacktestLab() {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // Raw parsed candles (full dataset)
  const [allCandles, setAllCandles] = useState<BtCandle[] | null>(null);
  const [csvInfo, setCsvInfo] = useState<CsvInfo | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvSymbol, setCsvSymbol] = useState('');
  const [csvTimeframe, setCsvTimeframe] = useState('15m');
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Date range
  const [rangePreset, setRangePreset] = useState<RangePreset>('full');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Config
  const [strategy, setStrategy] = useState<StrategyChoice>('MicroScalper');
  const [researchPreset, setResearchPreset] = useState<ResearchPreset>('live');
  const [params, setParams] = useState<ParamSet>(LIVE_PARAMS.MicroScalper);
  const [showParams, setShowParams] = useState(false);

  // Results
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trades, setTrades] = useState<BtTrade[] | null>(null);
  const [metrics, setMetrics] = useState<BtMetrics | null>(null);
  const [runResults, setRunResults] = useState<BacktestRunResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [tuningReportCopied, setTuningReportCopied] = useState(false);
  const [showTrades, setShowTrades] = useState(true);
  const [tradeSort, setTradeSort] = useState<'time' | 'r'>('time');
  const [tradePage, setTradePage] = useState(0);
  const [resultsStale, setResultsStale] = useState(false);

  // Saved datasets list
  const [datasets, setDatasets] = useState<ReplayDataset[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmPending, setConfirmPending] = useState(false);
  const [capitalAssumptions, setCapitalAssumptions] = useState<CapitalAssumptions>(DEFAULT_CAPITAL_ASSUMPTIONS);

  const loadDatasets = useCallback(async () => {
    const { data } = await supabase.from('replay_datasets').select('*').order('created_at', { ascending: false });
    setDatasets((data ?? []) as ReplayDataset[]);
  }, []);
  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // Live Strategy Parity is the default. Parameter editing is a visible research override only.
  useEffect(() => {
    if (strategy !== 'ALL') setParams(paramsForPreset(strategy, researchPreset));
  }, [strategy, researchPreset]);

  // Mark results stale when config changes after a run
  useEffect(() => {
    if (metrics) setResultsStale(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, researchPreset, params, rangeStart, rangeEnd, rangePreset, csvTimeframe]);

  function setParam(k: keyof ParamSet, v: number) {
    setParams(prev => ({ ...prev, [k]: v }));
  }

  // Apply preset to range inputs
  function applyPreset(preset: RangePreset, candles: BtCandle[]) {
    setRangePreset(preset);
    if (preset === 'full') {
      setRangeStart('');
      setRangeEnd('');
    } else if (preset === 'custom') {
      // leave inputs as-is
    } else {
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 };
      const days = daysMap[preset] ?? 30;
      const last = new Date(candles[candles.length - 1].time);
      const start = new Date(last.getTime() - days * 86400000);
      setRangeStart(toDatetimeLocal(start.toISOString()));
      setRangeEnd(toDatetimeLocal(last.toISOString()));
    }
  }

  // Derive selected candles from allCandles + date range
  const selectedCandles: BtCandle[] = (() => {
    if (!allCandles) return [];
    if (rangePreset === 'full' || (!rangeStart && !rangeEnd)) return allCandles;
    const startMs = rangeStart ? new Date(rangeStart).getTime() : 0;
    const endMs = rangeEnd ? new Date(rangeEnd).getTime() : Infinity;
    return allCandles.filter(c => {
      const t = new Date(c.time).getTime();
      return t >= startMs && t <= endMs;
    });
  })();

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setUploadMsg(null);
    setAllCandles(null);
    setCsvInfo(null);
    setRangePreset('full');
    setRangeStart('');
    setRangeEnd('');

    const reader = new FileReader();
    reader.onload = ev => {
      const { candles: parsed, skippedRows, error } = parseCSV(ev.target?.result as string);
      if (error) {
        setUploadMsg({ ok: false, text: error });
        setAllCandles(null);
        setCsvInfo(null);
      } else {
        const inf = inferTimeframe(parsed);
        setAllCandles(parsed);
        setCsvInfo({
          totalRows: parsed.length,
          skippedRows,
          firstTime: parsed[0].time,
          lastTime: parsed[parsed.length - 1].time,
          inferredTf: inf,
        });
        // Auto-set timeframe if detected and recognized
        if (['5m', '15m', '1h', '4h'].includes(inf)) setCsvTimeframe(inf);
        setUploadMsg({ ok: true, text: `${parsed.length.toLocaleString()} candles parsed${skippedRows > 0 ? ` · ${skippedRows} rows skipped` : ''}` });
      }
    };
    reader.readAsText(file);
  }

  async function saveDataset() {
    if (!allCandles || !csvSymbol.trim()) { setUploadMsg({ ok: false, text: 'Enter a symbol name before saving' }); return; }
    const { error } = await supabase.from('replay_datasets').insert({
      name: `${csvSymbol.toUpperCase()} ${csvTimeframe} — ${csvFileName}`,
      symbol: csvSymbol.toUpperCase(), market_type: 'crypto',
      timeframe: csvTimeframe, source: 'csv_upload',
      file_name: csvFileName, row_count: allCandles.length, uploaded_by: profile?.id,
    });
    if (error) setUploadMsg({ ok: false, text: `Save failed: ${error.message}` });
    else { setUploadMsg({ ok: true, text: 'Dataset saved to history' }); await loadDatasets(); }
  }

  async function deleteDataset(id: string) {
    setDeleting(id);
    await supabase.from('replay_datasets').delete().eq('id', id);
    await loadDatasets();
    setDeleting(null);
  }

  function executeRun(candles: BtCandle[]) {
    setRunning(true); setProgress(10); setTrades(null); setMetrics(null); setRunResults([]); setSelectedRunId(null);
    setResultsStale(false); setTradePage(0); setConfirmPending(false);

    setTimeout(() => {
      setProgress(30);
      try {
        const plan = buildRunPlan(strategy, csvTimeframe);
        const results = plan.map(({ strategy: plannedStrategy, timeframe }) => makeRunResult(
          plannedStrategy,
          csvTimeframe,
          timeframe,
          candles,
          strategy === 'ALL' ? paramsForPreset(plannedStrategy, researchPreset) : params,
          researchPreset,
        ));
        setProgress(90);
        const first = results[0];
        setRunResults(results);
        setSelectedRunId(first?.id ?? null);
        setTrades(first?.trades ?? []); setMetrics(first?.metrics ?? calcMetrics([], 0, 0, 0)); setProgress(100); setShowTrades(true);
      } catch (err) {
        setUploadMsg({ ok: false, text: `Backtest error: ${err instanceof Error ? err.message : 'unknown'}` });
      } finally {
        setRunning(false);
      }
    }, 40);
  }

  function runBacktestLocal() {
    if (!allCandles) return;
    const candles = selectedCandles.length >= 60 ? selectedCandles : allCandles;
    const count = candles.length;

    if (count > 50000) {
      setUploadMsg({ ok: false, text: `${count.toLocaleString()} candles selected exceeds the 50,000 browser limit. Narrow the date range and try again.` });
      return;
    }
    if (count > 20000 && !confirmPending) {
      setConfirmPending(true);
      return;
    }
    executeRun(candles);
  }

  const sortedTrades = trades
    ? (tradeSort === 'r' ? [...trades].sort((a, b) => b.pnl_r - a.pnl_r) : trades)
    : [];

  const totalPages = Math.ceil(sortedTrades.length / TRADES_PER_PAGE);
  const visibleTrades = sortedTrades.slice(tradePage * TRADES_PER_PAGE, (tradePage + 1) * TRADES_PER_PAGE);

  const primaryResult = runResults.find(r => r.id === selectedRunId) ?? runResults[0];
  const sortedComparison = [...runResults].sort(compareRunResults);
  const bestResult = sortedComparison[0];
  const worstResult = [...runResults].sort((a, b) => worstScore(b) - worstScore(a))[0];
  const tuningOrder = recommendedTuningOrder(runResults);
  const copySummary = buildCopySummary(csvSymbol, csvTimeframe, csvInfo, researchPreset, sortedComparison);
  const tuningReportText = buildCopyableTuningReport(csvSymbol, csvTimeframe, csvInfo, researchPreset, sortedComparison, capitalAssumptions);
  const tuningInsights = buildTuningInsights(sortedComparison, capitalAssumptions);
  const backtestCapital = estimateCapitalFromR(trades?.map(t => t.pnl_r) ?? [], capitalAssumptions);

  const tfLabel = (tf: string) => ({ '5m': '5 min', '15m': '15 min', '1h': '1 Hour', '4h': '4 Hour' }[tf] ?? tf);

  const selectedCount = selectedCandles.length;
  const sizeWarning = selectedCount > 10000 && selectedCount <= 20000;
  const sizeConfirm = selectedCount > 20000 && selectedCount <= 50000;
  const sizeBlock   = selectedCount > 50000;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Backtest Lab</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Upload OHLCV CSV · choose strategy · tune parameters · run simulation</p>
      </div>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5 flex gap-2.5 mb-6">
        <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-amber-300">Backtest results are historical simulation only and do not guarantee future performance.</strong>{' '}
          All trades are virtual. No live signals, Telegram messages, or account activity are generated.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 mb-6">

        {/* LEFT: Upload + Config */}
        <div className="lg:col-span-2 space-y-4">

          {/* CSV Upload */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
              <Upload size={13} className="text-zinc-500" /> Upload CSV
            </div>
            <div className="px-5 py-4 space-y-3.5">
              <p className="text-xs text-zinc-500">
                Required columns: <code className="bg-zinc-800 px-1 rounded text-zinc-300">time</code>{' '}
                <code className="bg-zinc-800 px-1 rounded text-zinc-300">open</code>{' '}
                <code className="bg-zinc-800 px-1 rounded text-zinc-300">high</code>{' '}
                <code className="bg-zinc-800 px-1 rounded text-zinc-300">low</code>{' '}
                <code className="bg-zinc-800 px-1 rounded text-zinc-300">close</code>. Optional: volume. Min 60 rows.
              </p>

              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors w-full justify-center">
                <Upload size={13} />{csvFileName || 'Choose CSV File'}
              </button>

              {allCandles && csvInfo && (
                <div className="space-y-2.5">
                  {/* CSV Info Panel */}
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-xs space-y-1">
                    <div className="text-zinc-400 font-medium mb-1.5">CSV Info</div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Total candles</span>
                      <span className="text-zinc-200 font-medium">{csvInfo.totalRows.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">First bar</span>
                      <span className="text-zinc-200">{new Date(csvInfo.firstTime).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Last bar</span>
                      <span className="text-zinc-200">{new Date(csvInfo.lastTime).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Inferred TF</span>
                      <span className="text-sky-300 font-medium">{csvInfo.inferredTf}</span>
                    </div>
                    {csvInfo.skippedRows > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Skipped rows</span>
                        <span className="text-amber-400">{csvInfo.skippedRows}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Symbol</label>
                      <input type="text" placeholder="e.g. BTCUSDT" value={csvSymbol}
                        onChange={e => setCsvSymbol(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Timeframe</label>
                      <select value={csvTimeframe} onChange={e => setCsvTimeframe(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500">
                        {['5m', '15m', '1h', '4h'].map(tf => <option key={tf} value={tf}>{tfLabel(tf)}</option>)}
                      </select>
                    </div>
                  </div>

                  <button onClick={saveDataset}
                    className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    <FileText size={12} /> Save to History
                  </button>
                </div>
              )}

              {uploadMsg && (
                <div className={`px-3 py-2 rounded-lg text-xs border ${uploadMsg.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                  {uploadMsg.text}
                </div>
              )}
            </div>
          </div>

          {/* Date Range */}
          {allCandles && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                <Calendar size={13} className="text-zinc-500" /> Date Range
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5">
                  {(['full', '7d', '30d', '60d', '90d'] as RangePreset[]).map(p => (
                    <button key={p} onClick={() => applyPreset(p, allCandles)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${rangePreset === p ? 'bg-sky-600/20 border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'}`}>
                      {p === 'full' ? 'Full Dataset' : p === '7d' ? 'Last 7d' : p === '30d' ? 'Last 30d' : p === '60d' ? 'Last 60d' : 'Last 90d'}
                    </button>
                  ))}
                  <button onClick={() => setRangePreset('custom')}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${rangePreset === 'custom' ? 'bg-sky-600/20 border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'}`}>
                    Custom
                  </button>
                </div>

                {/* Custom date inputs */}
                {(rangePreset === 'custom' || rangePreset !== 'full') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Start</label>
                      <input type="datetime-local" value={rangeStart}
                        onChange={e => { setRangeStart(e.target.value); setRangePreset('custom'); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">End</label>
                      <input type="datetime-local" value={rangeEnd}
                        onChange={e => { setRangeEnd(e.target.value); setRangePreset('custom'); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500" />
                    </div>
                  </div>
                )}

                {/* Selected candle count */}
                <div className={`space-y-1 text-xs px-2.5 py-2 rounded-lg border ${
                  sizeBlock   ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                  sizeConfirm ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                  sizeWarning ? 'bg-yellow-500/8 border-yellow-500/20 text-yellow-300' :
                  'bg-zinc-800/50 border-zinc-700/50 text-zinc-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <span>Selected test-window candles</span>
                    <span className="font-medium">{selectedCount.toLocaleString()}</span>
                  </div>
                  {csvInfo && (
                    <>
                      <div className="flex items-center justify-between text-zinc-500">
                        <span>Full CSV range</span>
                        <span>{new Date(csvInfo.firstTime).toISOString().slice(0, 16)} → {new Date(csvInfo.lastTime).toISOString().slice(0, 16)}</span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-500">
                        <span>Selected window</span>
                        <span>{selectedCandles[0] ? new Date(selectedCandles[0].time).toISOString().slice(0, 16) : 'n/a'} → {selectedCandles[selectedCandles.length - 1] ? new Date(selectedCandles[selectedCandles.length - 1].time).toISOString().slice(0, 16) : 'n/a'}</span>
                      </div>
                    </>
                  )}
                </div>

                {sizeBlock && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
                    Too many candles for browser simulation (max 50,000). Narrow the date range.
                  </div>
                )}
                {sizeWarning && !sizeConfirm && !sizeBlock && (
                  <div className="text-xs text-yellow-300 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-3 py-2">
                    Large dataset — simulation may take a few seconds.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Strategy */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
              <Settings size={13} className="text-zinc-500" /> Strategy
            </div>
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Current real strategy family</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['MicroScalper', 'MicroScalper'],
                    ['CompressionBreakout', 'CompressionBreakout'],
                    ['SwingContinuation', 'SwingContinuation'],
                    ['ALL', 'Run All Strategies'],
                  ] as Array<[StrategyChoice, string]>).map(([value, label]) => (
                    <button key={value} onClick={() => setStrategy(value)}
                      className={`text-xs py-2 px-2 rounded-lg border transition-colors ${strategy === value ? 'bg-sky-600/20 border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  <strong className="text-zinc-300">Mode:</strong> Live Strategy Parity / Current Strategy Logic. Conservative/Balanced/Aggressive are not primary modes here because they are research presets, not separate live scanner behaviors.
                </div>
                <div className="mt-1.5 text-xs text-zinc-600">
                  {strategy === 'MicroScalper' && 'Short-term momentum · tests 5m/15m only.'}
                  {strategy === 'CompressionBreakout' && 'Range compression + expansion · tests 15m/1h only.'}
                  {strategy === 'SwingContinuation' && 'Trend pullback reclaim · tests 15m/1h only.'}
                  {strategy === 'ALL' && 'Runs each valid strategy/timeframe combination available from the uploaded dataset without downsampling.'}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <label className="block text-xs text-zinc-400 mb-1.5">Backtest-only research preset</label>
                <select value={researchPreset} onChange={e => setResearchPreset(e.target.value as ResearchPreset)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500">
                  {(['live', 'conservative', 'balanced', 'aggressive'] as ResearchPreset[]).map(p => (
                    <option key={p} value={p}>{RESEARCH_PRESET_LABEL[p]}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
                  {RESEARCH_PRESET_DESCRIPTIONS[researchPreset]} This only changes browser-side backtest parameters; it does not update live signals, scanner behavior, Telegram, or database strategy_config.
                </div>
              </div>
            </div>
          </div>

          {/* Editable parameters */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowParams(v => !v)}
              className="w-full border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-2"><Settings size={13} className="text-zinc-500" /> Parameters</div>
              {showParams ? <ChevronUp size={13} className="text-zinc-500" /> : <ChevronDown size={13} className="text-zinc-500" />}
            </button>
            {showParams && (
              <div className="px-5 py-4 space-y-2.5">
                <div className="text-xs text-zinc-600 mb-3">Editing is a Backtest research override and is not applied to live scanner config.</div>

                <div className="text-xs font-medium text-zinc-400 mb-1">Quality Gates</div>
                <ParamRow label="Min Score" field="min_score" value={params.min_score} onChange={setParam} step={1} min={0} />
                <ParamRow label="Min R:R" field="min_rr" value={params.min_rr} onChange={setParam} />
                <ParamRow label="Min SL Distance %" field="min_stop_distance_pct" value={params.min_stop_distance_pct} onChange={setParam} />
                <ParamRow label="Min TP1 Distance %" field="min_tp1_distance_pct" value={params.min_tp1_distance_pct} onChange={setParam} />
                <ParamRow label="Min TP2 Distance %" field="min_tp2_distance_pct" value={params.min_tp2_distance_pct} onChange={setParam} />
                <ParamRow label="Max Bars in Trade" field="max_bars_in_trade" value={params.max_bars_in_trade} onChange={setParam} step={1} min={1} />

                <div className="border-t border-zinc-800 my-2" />
                <div className="text-xs font-medium text-zinc-400 mb-1">Indicators</div>
                <ParamRow label="EMA Fast" field="ema_fast" value={params.ema_fast} onChange={setParam} step={1} min={2} />
                <ParamRow label="EMA Slow" field="ema_slow" value={params.ema_slow} onChange={setParam} step={1} min={2} />
                <ParamRow label="RSI Length" field="rsi_len" value={params.rsi_len} onChange={setParam} step={1} min={2} />
                <ParamRow label="ATR Length" field="atr_len" value={params.atr_len} onChange={setParam} step={1} min={1} />

                <div className="border-t border-zinc-800 my-2" />
                <div className="text-xs font-medium text-zinc-400 mb-1">Entry / Exit</div>
                <ParamRow label="RSI Buy Min" field="rsi_buy_min" value={params.rsi_buy_min} onChange={setParam} step={1} />
                <ParamRow label="RSI Sell Max" field="rsi_sell_max" value={params.rsi_sell_max} onChange={setParam} step={1} />
                <ParamRow label="Stop ATR Mult" field="stop_atr_mult" value={params.stop_atr_mult} onChange={setParam} />
                <ParamRow label="TP1 R Mult" field="tp1_r" value={params.tp1_r} onChange={setParam} />
                <ParamRow label="TP2 R Mult" field="tp2_r" value={params.tp2_r} onChange={setParam} />

                {strategy === 'CompressionBreakout' && (<>
                  <div className="border-t border-zinc-800 my-2" />
                  <div className="text-xs font-medium text-zinc-400 mb-1">CompressionBreakout</div>
                  <ParamRow label="Box Lookback" field="box_lookback" value={params.box_lookback} onChange={setParam} step={1} min={10} />
                  <ParamRow label="Min Box Bars" field="min_box_bars" value={params.min_box_bars} onChange={setParam} step={1} min={4} />
                  <ParamRow label="Max Box ATR Range" field="max_box_atr_range" value={params.max_box_atr_range} onChange={setParam} />
                  <ParamRow label="Breakout Buffer ATR" field="breakout_buffer_atr" value={params.breakout_buffer_atr} onChange={setParam} />
                </>)}

                {strategy === 'SwingContinuation' && (<>
                  <div className="border-t border-zinc-800 my-2" />
                  <div className="text-xs font-medium text-zinc-400 mb-1">SwingContinuation</div>
                  <ParamRow label="Pullback Bars" field="pullback_bars" value={params.pullback_bars} onChange={setParam} step={1} min={1} />
                </>)}
              </div>
            )}
          </div>

          {/* Confirmation dialog for 20k–50k candles */}
          {confirmPending && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4 space-y-3">
              <div className="flex gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-300">Large dataset — {selectedCount.toLocaleString()} candles</div>
                  <div className="text-xs text-zinc-400 mt-1">This may take 10–30 seconds and could slow your browser. Continue?</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => executeRun(selectedCandles.length >= 60 ? selectedCandles : allCandles!)}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs py-2 rounded-lg font-medium transition-colors">
                  Run anyway
                </button>
                <button onClick={() => setConfirmPending(false)}
                  className="flex-1 border border-zinc-700 text-zinc-400 hover:text-white text-xs py-2 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Run button */}
          {!confirmPending && (
            <button
              onClick={runBacktestLocal}
              disabled={!allCandles || running || sizeBlock}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-sky-900/30">
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {running
                ? 'Running backtest...'
                : !allCandles
                  ? 'Upload CSV to run'
                  : sizeBlock
                    ? 'Too many candles — narrow range'
                    : `Run Backtest (${selectedCount > 0 ? selectedCount.toLocaleString() : (allCandles?.length ?? 0).toLocaleString()} candles)`}
            </button>
          )}

          {running && (
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden -mt-2">
              <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* RIGHT: Metrics */}
        <div className="lg:col-span-3 space-y-4">
          {!metrics && !running && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center py-20 text-center">
              <BarChart2 size={36} className="text-zinc-700 mb-3" />
              <div className="text-sm text-zinc-500 font-medium">No results yet</div>
              <div className="text-xs text-zinc-600 mt-1">Upload a CSV and run the backtest to see metrics</div>
            </div>
          )}

          {running && !metrics && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center py-20">
              <RefreshCw size={28} className="text-sky-500 animate-spin mb-3" />
              <div className="text-sm text-zinc-400">Simulating trades...</div>
            </div>
          )}

          {metrics && (
            <div className="relative">
              {/* Stale overlay */}
              {resultsStale && (
                <div className="absolute inset-0 z-10 bg-zinc-950/70 rounded-xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                  <AlertTriangle size={22} className="text-amber-400" />
                  <div className="text-sm font-medium text-amber-300">Results are stale</div>
                  <div className="text-xs text-zinc-400">Config or date range changed — re-run to refresh</div>
                  <button onClick={() => { setResultsStale(false); runBacktestLocal(); }}
                    disabled={sizeBlock || running}
                    className="mt-2 flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-lg font-medium transition-colors">
                    <RefreshCw size={11} /> Re-run now
                  </button>
                </div>
              )}

              <div className="space-y-4">

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200">Capital assumptions</div>
                      <p className="text-xs text-zinc-500 mt-1">Display-only simulation math. Strategy rules and fills are unchanged.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="text-xs text-zinc-500">Starting capital
                        <input type="number" min="1" step="50" value={capitalAssumptions.startingCapital}
                          onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, startingCapital: Number(e.target.value) }))}
                          className="mt-1 block w-32 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500" />
                      </label>
                      <label className="text-xs text-zinc-500">Risk / trade %
                        <input type="number" min="0.01" step="0.05" value={capitalAssumptions.riskPct}
                          onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, riskPct: Number(e.target.value) }))}
                          className="mt-1 block w-28 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Strategy/timeframe decision grid */}
                {runResults.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-3">
                    {runResults.map(result => {
                      const capital = estimateCapitalFromR(result.trades.map(t => t.pnl_r), capitalAssumptions);
                      const topReasons = topRejectionReasons(result.metrics.rejectionReasons, 5);
                      const isPrimary = primaryResult?.id === result.id;
                      return (
                        <button key={result.id} onClick={() => { setSelectedRunId(result.id); setTrades(result.trades); setMetrics(result.metrics); setTradePage(0); }}
                          className={`text-left bg-zinc-900 border rounded-xl p-4 transition-colors ${isPrimary ? 'border-sky-500/60' : 'border-zinc-800 hover:border-zinc-700'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">{result.strategy} · {result.testedTimeframe}</div>
                              <div className="text-xs text-zinc-500 mt-1">Dataset {result.datasetTimeframe} · tested {result.testedTimeframe} · resampled {result.resampled ? 'yes' : 'no'} · preset {RESEARCH_PRESET_LABEL[result.preset]} · resampled candles tested {result.candlesTested.toLocaleString()} / selected candles {result.candlesLoaded.toLocaleString()}</div>
                            </div>
                            <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded border ${['viable / preserve', 'viable'].includes(result.classification) ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : result.classification === 'viable but noisy' ? 'text-sky-300 border-sky-500/30 bg-sky-500/10' : result.classification === 'needs tuning' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' : ['too strict / dead participation', 'possible parity mismatch'].includes(result.classification) ? 'text-orange-300 border-orange-500/30 bg-orange-500/10' : ['wrong dataset/timeframe', 'wrong timeframe/dataset'].includes(result.classification) ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-zinc-300 border-zinc-600 bg-zinc-800/60'}`}>
                              {result.classification}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                            <div><div className="text-zinc-600">Eval</div><div className="text-zinc-300">{result.metrics.evaluations.toLocaleString()}</div></div>
                            <div><div className="text-zinc-600">Cand</div><div className="text-zinc-300">{result.metrics.candidates}</div></div>
                            <div><div className="text-zinc-600">Reject</div><div className="text-zinc-300">{result.metrics.rejected}</div></div>
                            <div><div className="text-zinc-600">Trades</div><div className="text-zinc-300">{result.metrics.totalTrades}</div></div>
                            <div><div className="text-zinc-600">Total R</div><div className={result.metrics.totalR > 0 ? 'text-emerald-400' : result.metrics.totalR < 0 ? 'text-red-400' : 'text-zinc-300'}>{result.metrics.totalTrades > 0 ? `${result.metrics.totalR > 0 ? '+' : ''}${result.metrics.totalR}R` : 'N/A'}</div></div>
                            <div><div className="text-zinc-600">Win</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? `${result.metrics.winRate}%` : 'N/A'}</div></div>
                            <div><div className="text-zinc-600">PF</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? result.metrics.profitFactor : 'N/A'}</div></div>
                            <div><div className="text-zinc-600">Est P/L</div><div className={(capital.estimatedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{result.metrics.totalTrades > 0 ? formatMoney(capital.estimatedPnl) : 'N/A'}</div></div>
                            <div><div className="text-zinc-600">Final</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? formatMoney(capital.estimatedFinalCapital) : 'N/A'}</div></div>
                            <div><div className="text-zinc-600">Max DD</div><div className="text-red-400">{result.metrics.totalTrades > 0 ? `${result.metrics.maxDrawdown}R` : 'N/A'}</div></div>
                          </div>
                          <div className="mt-3 text-xs text-zinc-500">{result.classificationReason}</div>
                          <div className="mt-2 text-[11px] text-zinc-600">Truth: {result.truthLabel}. {result.parityNote}</div>
                          {topReasons.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {topReasons.map(([reason, count]) => <span key={reason} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">{reason}: {count}</span>)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Comparison table */}
                {runResults.length > 1 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                      <BarChart2 size={13} className="text-zinc-500" /> Strategy Comparison · {RESEARCH_PRESET_LABEL[researchPreset]}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            {['Strategy', 'TF', 'Preset', 'Trades', 'Win', 'PF', 'Total R', 'Avg R', 'Est. P/L', 'Max DD', 'Loss streak', 'Decision', 'Top rejection'].map(h => (
                              <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedComparison.map(result => {
                            const cap = capitalForResult(result, capitalAssumptions);
                            const top = topRejectionReasons(result.metrics.rejectionReasons, 1)[0];
                            return (
                              <tr key={`cmp-${result.id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">{result.strategy}</td>
                                <td className="px-3 py-2 text-zinc-400">{result.testedTimeframe}</td>
                                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{presetShortLabel(result.preset)}</td>
                                <td className="px-3 py-2 text-zinc-300 tabular-nums">{result.metrics.totalTrades}</td>
                                <td className="px-3 py-2 text-zinc-300 tabular-nums">{result.metrics.totalTrades > 0 ? `${result.metrics.winRate}%` : 'N/A'}</td>
                                <td className="px-3 py-2 text-zinc-300 tabular-nums">{result.metrics.totalTrades > 0 ? result.metrics.profitFactor : 'N/A'}</td>
                                <td className={`px-3 py-2 tabular-nums ${result.metrics.totalR > 0 ? 'text-emerald-400' : result.metrics.totalR < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{result.metrics.totalTrades > 0 ? `${result.metrics.totalR > 0 ? '+' : ''}${result.metrics.totalR}R` : 'N/A'}</td>
                                <td className="px-3 py-2 text-zinc-300 tabular-nums">{result.metrics.totalTrades > 0 ? `${result.metrics.avgR > 0 ? '+' : ''}${result.metrics.avgR}R` : 'N/A'}</td>
                                <td className={`px-3 py-2 tabular-nums ${(cap.estimatedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{result.metrics.totalTrades > 0 ? formatMoney(cap.estimatedPnl) : 'N/A'}</td>
                                <td className="px-3 py-2 text-red-400 tabular-nums">{result.metrics.totalTrades > 0 ? `${result.metrics.maxDrawdown}R` : 'N/A'}</td>
                                <td className="px-3 py-2 text-zinc-300 tabular-nums">{result.metrics.maxConsecLosses}</td>
                                <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{result.classification}</td>
                                <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{top ? `${top[0]} (${top[1]})` : 'none'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Recommendation panel */}
                {runResults.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                      <Info size={13} className="text-zinc-500" /> Recommendations
                    </div>
                    <div className="px-5 py-4 space-y-2">
                      {sortedComparison.map(result => {
                        const rec = recommendationForResult(result);
                        return (
                          <div key={`rec-${result.id}`} className="flex gap-2 text-xs bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2">
                            <span className="shrink-0 font-medium text-sky-300">{rec.action}</span>
                            <span className="text-zinc-400">{rec.text}</span>
                          </div>
                        );
                      })}
                      <div className="text-[11px] text-zinc-600 pt-1">Recommendations are based only on this uploaded historical sample and do not imply future profitability.</div>
                    </div>
                  </div>
                )}

                {/* Strategy Tuning Report */}
                {runResults.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                      <Settings size={13} className="text-zinc-500" /> Strategy Tuning Report
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      <div className="grid md:grid-cols-2 gap-3">
                        {tuningInsights.map(insight => (
                          <div key={insight.label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{insight.label}</div>
                            <div className="text-sm text-zinc-200 mt-0.5">{insight.result ? resultLabel(insight.result) : 'N/A'}</div>
                            <div className="text-xs text-zinc-500 mt-1">{insight.note}</div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                        <div className="text-xs font-semibold text-zinc-300 mb-3">Recommended tuning order</div>
                        <div className="space-y-2">
                          {tuningOrder.map((result, index) => {
                            const diagnosis = diagnoseTuning(result, sortedComparison);
                            return (
                              <div key={`order-${result.id}`} className="flex gap-3 text-xs">
                                <span className="text-zinc-500 tabular-nums">{index + 1}.</span>
                                <div>
                                  <span className="text-zinc-200">{result.strategy} {result.testedTimeframe}</span>
                                  <span className="text-zinc-500"> — {diagnosis.situation}; {recommendationForResult(result).action}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {sortedComparison.map(result => {
                          const diagnosis = diagnoseTuning(result, sortedComparison);
                          const topReasons = topRejectionReasons(result.metrics.rejectionReasons, 5);
                          return (
                            <div key={`tuning-${result.id}`} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-zinc-100">{result.strategy} · {result.testedTimeframe}</div>
                                  <div className="text-xs text-zinc-500 mt-1">Preset {RESEARCH_PRESET_LABEL[result.preset]} · {result.classification} · {result.truthLabel}</div>
                                </div>
                                <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded border ${diagnosis.confidence === 'High' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : diagnosis.confidence === 'Medium' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' : 'text-zinc-300 border-zinc-600 bg-zinc-800/60'}`}>
                                  {diagnosis.confidence} confidence
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3 text-xs">
                                <div><div className="text-zinc-600">Trades</div><div className="text-zinc-300">{result.metrics.totalTrades}</div></div>
                                <div><div className="text-zinc-600">Win</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? `${result.metrics.winRate}%` : 'N/A'}</div></div>
                                <div><div className="text-zinc-600">PF</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? result.metrics.profitFactor : 'N/A'}</div></div>
                                <div><div className="text-zinc-600">Total R</div><div className={result.metrics.totalR > 0 ? 'text-emerald-400' : result.metrics.totalR < 0 ? 'text-red-400' : 'text-zinc-300'}>{result.metrics.totalTrades > 0 ? `${result.metrics.totalR > 0 ? '+' : ''}${result.metrics.totalR}R` : 'N/A'}</div></div>
                                <div><div className="text-zinc-600">Avg R</div><div className="text-zinc-300">{result.metrics.totalTrades > 0 ? `${result.metrics.avgR > 0 ? '+' : ''}${result.metrics.avgR}R` : 'N/A'}</div></div>
                                <div><div className="text-zinc-600">Max DD / Loss streak</div><div className="text-red-400">{result.metrics.totalTrades > 0 ? `${result.metrics.maxDrawdown}R / ${result.metrics.maxConsecLosses}` : 'N/A'}</div></div>
                              </div>
                              <div className="mt-3 grid md:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <div className="text-zinc-500 font-medium mb-1">Tuning situation</div>
                                  <div className="text-zinc-300">{diagnosis.situation}</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 font-medium mb-1">Main weakness</div>
                                  <div className="text-zinc-300">{diagnosis.mainWeakness}</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 font-medium mb-1">Suggested tuning direction</div>
                                  <div className="text-zinc-300">{diagnosis.suggestedDirection}</div>
                                </div>
                              </div>
                              <div className="mt-3 text-xs text-zinc-500">Confidence basis: {diagnosis.confidenceReason}</div>
                              {topReasons.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {topReasons.map(([reason, count]) => <span key={reason} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">{reason}: {count}</span>)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        Diagnostic recommendations only. No auto-tuning, live strategy_config update, scanner change, or Telegram/live signal change is performed by this report.
                      </div>
                    </div>
                  </div>
                )}

                {/* Copyable tuning report */}
                {runResults.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><FileText size={13} className="text-zinc-500" /> Copyable Strategy Tuning Report</div>
                      <button onClick={async () => { await navigator.clipboard?.writeText(tuningReportText); setTuningReportCopied(true); setTimeout(() => setTuningReportCopied(false), 1500); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
                        {tuningReportCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea readOnly value={tuningReportText}
                      className="w-full min-h-72 bg-zinc-950 text-zinc-400 text-xs font-mono leading-relaxed px-4 py-3 outline-none resize-y" />
                  </div>
                )}

                {/* Copyable summary */}
                {runResults.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><FileText size={13} className="text-zinc-500" /> Copyable Backtest Summary</div>
                      <button onClick={async () => { await navigator.clipboard?.writeText(copySummary); setSummaryCopied(true); setTimeout(() => setSummaryCopied(false), 1500); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
                        {summaryCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea readOnly value={copySummary}
                      className="w-full min-h-56 bg-zinc-950 text-zinc-400 text-xs font-mono leading-relaxed px-4 py-3 outline-none resize-y" />
                    {bestResult && worstResult && (
                      <div className="border-t border-zinc-800 px-5 py-2 text-xs text-zinc-500">
                        Best: {bestResult.strategy} {bestResult.testedTimeframe} · Worst: {worstResult.strategy} {worstResult.testedTimeframe}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary cards */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                    <BarChart2 size={13} className="text-zinc-500" />
                    Results — {primaryResult ? `${primaryResult.strategy} · tested ${primaryResult.testedTimeframe}` : strategy} · {RESEARCH_PRESET_LABEL[researchPreset]} · dataset {csvTimeframe}
                    <span className="ml-auto text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded">SIMULATION</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-px bg-zinc-800">
                    <MetricCell label="Total Trades" value={String(metrics.totalTrades)} />
                    <MetricCell label="Wins (TP1+TP2)" value={String(metrics.wins)} highlight={metrics.wins > metrics.losses ? 'text-emerald-400' : 'text-zinc-100'} />
                    <MetricCell label="TP1 Hits" value={String(metrics.tp1Hits)} />
                    <MetricCell label="TP2 Hits" value={String(metrics.tp2Hits)} highlight="text-emerald-400" />
                    <MetricCell label="SL Hits" value={String(metrics.losses)} highlight={metrics.losses > 0 ? 'text-red-400' : 'text-zinc-100'} />
                    <MetricCell label="Expired" value={String(metrics.expired)} highlight="text-zinc-500" />
                    <MetricCell label="Win Rate"
                      value={metrics.totalTrades > 0 ? `${metrics.winRate}%` : 'N/A'}
                      highlight={metrics.winRate >= 50 ? 'text-emerald-400' : metrics.winRate > 0 ? 'text-yellow-400' : 'text-zinc-100'} />
                    <MetricCell label="Profit Factor"
                      value={metrics.totalTrades > 0 ? String(metrics.profitFactor) : 'N/A'}
                      highlight={metrics.profitFactor >= 1.5 ? 'text-emerald-400' : metrics.profitFactor >= 1.0 ? 'text-yellow-400' : 'text-red-400'} />
                    <MetricCell label="Total R"
                      value={metrics.totalTrades > 0 ? `${metrics.totalR > 0 ? '+' : ''}${metrics.totalR}R` : 'N/A'}
                      highlight={metrics.totalR > 0 ? 'text-emerald-400' : metrics.totalR < 0 ? 'text-red-400' : 'text-zinc-100'} />
                    <MetricCell label="Avg R/Trade"
                      value={metrics.totalTrades > 0 ? `${metrics.avgR > 0 ? '+' : ''}${metrics.avgR}R` : 'N/A'}
                      highlight={metrics.avgR > 0 ? 'text-emerald-400' : metrics.avgR < 0 ? 'text-red-400' : 'text-zinc-100'} />
                    <MetricCell label="Avg Win" value={metrics.wins > 0 ? `+${metrics.avgWin}R` : 'N/A'} highlight="text-emerald-400" />
                    <MetricCell label="Avg Loss" value={metrics.losses > 0 ? `${metrics.avgLoss}R` : 'N/A'} highlight="text-red-400" />
                    <MetricCell label="Best Trade" value={metrics.totalTrades > 0 ? `+${metrics.bestTrade}R` : 'N/A'} highlight="text-emerald-400" />
                    <MetricCell label="Worst Trade" value={metrics.totalTrades > 0 ? `${metrics.worstTrade}R` : 'N/A'} highlight="text-red-400" />
                    <MetricCell label="Max Consec Wins" value={String(metrics.maxConsecWins)} />
                    <MetricCell label="Max Consec Losses" value={String(metrics.maxConsecLosses)} />
                    <MetricCell label="Max Drawdown R" value={metrics.totalTrades > 0 ? `${metrics.maxDrawdown}R` : 'N/A'} highlight="text-red-400" />
                    <MetricCell label="Est. P/L" value={metrics.totalTrades > 0 ? `${formatPct(backtestCapital.totalReturnPct, true)} / ${formatMoney(backtestCapital.estimatedPnl)}` : 'N/A'} highlight={(backtestCapital.estimatedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                    <MetricCell label="Final Capital" value={metrics.totalTrades > 0 ? formatMoney(backtestCapital.estimatedFinalCapital) : 'N/A'} />
                    <MetricCell label="Max DD Est." value={metrics.totalTrades > 0 ? `${formatPct(backtestCapital.maxDrawdownPct)} / ${formatMoney(backtestCapital.maxDrawdownAmount)}` : 'N/A'} highlight="text-red-400" />
                    <MetricCell label="Evaluations" value={metrics.evaluations.toLocaleString()} />
                    <MetricCell label="Candidates" value={String(metrics.candidates)} />
                    <MetricCell label="Rejected" value={String(metrics.rejected)} />
                  </div>
                </div>

                {/* Equity bar */}
                {metrics.totalTrades > 0 && (() => {
                  const maxAbs = Math.max(Math.abs(metrics.totalR), 0.1);
                  const pct = Math.min(Math.abs(metrics.totalR) / maxAbs, 1) * 100;
                  return (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                      <div className="flex justify-between text-xs text-zinc-500 mb-2">
                        <span>Net R result · {formatPct(backtestCapital.totalReturnPct, true)} / {formatMoney(backtestCapital.estimatedPnl)} on {formatMoney(capitalAssumptions.startingCapital)}</span>
                        <span className={metrics.totalR >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {metrics.totalR > 0 ? '+' : ''}{metrics.totalR}R
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${metrics.totalR >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Trade table */}
                {trades && trades.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Clock size={13} className="text-zinc-500" /> Trades ({trades.length})
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={tradeSort} onChange={e => { setTradeSort(e.target.value as 'time' | 'r'); setTradePage(0); }}
                          className="bg-zinc-800 border border-zinc-700 rounded text-xs px-2 py-1 text-zinc-400 focus:outline-none focus:border-sky-500">
                          <option value="time">Sort: Time</option>
                          <option value="r">Sort: R (best)</option>
                        </select>
                        <button onClick={() => setShowTrades(s => !s)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
                          {showTrades ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {showTrades ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                    {showTrades && (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-500">
                                {['Entry Time', 'Dir', 'Grade', 'Entry', 'SL', 'TP1', 'TP2', 'Result', 'PnL R', 'Bars'].map(h => (
                                  <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleTrades.map((t, i) => (
                                <tr key={tradePage * TRADES_PER_PAGE + i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{new Date(t.entryTime).toLocaleString()}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex items-center gap-0.5 ${t.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {t.direction === 'buy' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                      {t.direction.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className={`px-3 py-2 font-medium ${GRADE_COLOR[t.grade] ?? 'text-zinc-400'}`}>{t.grade}</td>
                                  <td className="px-3 py-2 text-zinc-300 tabular-nums">{t.entry.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-red-400/80 tabular-nums">{t.stop_loss.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-zinc-400 tabular-nums">{t.tp1.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-zinc-400 tabular-nums">{t.tp2.toFixed(4)}</td>
                                  <td className={`px-3 py-2 font-medium whitespace-nowrap ${RESULT_COLOR[t.result] ?? 'text-zinc-400'}`}>
                                    {t.result === 'tp2_hit' ? '✓ TP2' : t.result === 'tp1_hit' ? '✓ TP1' : t.result === 'sl_hit' ? '✗ SL' : '— exp'}
                                  </td>
                                  <td className="px-3 py-2 tabular-nums"><PnlSpan r={t.pnl_r} /></td>
                                  <td className="px-3 py-2 text-zinc-500 tabular-nums">{t.durationBars}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="border-t border-zinc-800 px-4 py-2.5 flex items-center justify-between text-xs text-zinc-500">
                            <span>Page {tradePage + 1} of {totalPages} · {trades.length} trades</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setTradePage(p => Math.max(0, p - 1))} disabled={tradePage === 0}
                                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors">
                                <ChevronLeft size={13} />
                              </button>
                              {Array.from({ length: Math.min(totalPages, 7) }, (_, idx) => {
                                const pg = totalPages <= 7 ? idx : tradePage < 4 ? idx : tradePage > totalPages - 5 ? totalPages - 7 + idx : tradePage - 3 + idx;
                                return (
                                  <button key={pg} onClick={() => setTradePage(pg)}
                                    className={`w-6 h-6 rounded text-center transition-colors ${pg === tradePage ? 'bg-sky-600 text-white' : 'hover:bg-zinc-800 text-zinc-500'}`}>
                                    {pg + 1}
                                  </button>
                                );
                              })}
                              <button onClick={() => setTradePage(p => Math.min(totalPages - 1, p + 1))} disabled={tradePage === totalPages - 1}
                                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors">
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {metrics.totalTrades === 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Minus size={18} className="text-zinc-600" />
                      <div>
                        <div className="text-sm text-zinc-300 font-medium">No trades generated — diagnostics</div>
                        <div className="text-xs text-zinc-600">Bad or quiet results are shown as-is. No artificial passes are created.</div>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 text-xs">
                      <MetricCell label="Candles loaded" value={String(primaryResult?.candlesLoaded ?? selectedCount)} />
                      <MetricCell label="Candles tested" value={String(primaryResult?.candlesTested ?? selectedCount)} />
                      <MetricCell label="Dataset timeframe" value={primaryResult?.datasetTimeframe ?? csvTimeframe} />
                      <MetricCell label="Tested timeframe" value={primaryResult?.testedTimeframe ?? csvTimeframe} />
                      <MetricCell label="Resampled" value={primaryResult?.resampled ? 'yes' : 'no'} />
                      <MetricCell label="Min score / RR" value={`${primaryResult?.params.min_score ?? params.min_score} / ${primaryResult?.params.min_rr ?? params.min_rr}`} />
                    </div>
                    {primaryResult?.unsupportedReason && (
                      <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{primaryResult.unsupportedReason}</div>
                    )}
                    {topRejectionReasons(metrics.rejectionReasons, 10).length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-medium text-zinc-400 mb-2">Top rejection reasons</div>
                        <div className="space-y-1.5">
                          {topRejectionReasons(metrics.rejectionReasons, 10).map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between bg-zinc-800/60 border border-zinc-700/60 rounded px-3 py-1.5 text-xs">
                              <span className="text-zinc-300">{reason}</span>
                              <span className="text-zinc-500">{count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {primaryResult?.strategy === 'CompressionBreakout' && metrics.rejectionDiagnostics && Object.keys(metrics.rejectionDiagnostics).length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-medium text-zinc-400 mb-2">Compression diagnostics from rejected setup samples</div>
                        <div className="space-y-2">
                          {topRejectionReasons(metrics.rejectionReasons, 4).map(([reason]) => {
                            const diag = metrics.rejectionDiagnostics?.[reason];
                            if (!diag) return null;
                            return (
                              <div key={reason} className="bg-zinc-800/60 border border-zinc-700/60 rounded-lg p-3">
                                <div className="text-xs text-zinc-300 font-medium mb-2">{reason}</div>
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                                  {Object.entries(diag).map(([key, value]) => (
                                    <div key={key} className="flex justify-between gap-2 border-b border-zinc-700/40 py-0.5">
                                      <span className="text-zinc-500">{key}</span>
                                      <span className="text-zinc-300 text-right">{formatDiagnosticValue(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved datasets */}
      {datasets.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <FileText size={13} className="text-zinc-500" /> Saved Datasets
          </div>
          <div className="divide-y divide-zinc-800">
            {datasets.map(d => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-200">{d.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{d.symbol} · {d.market_type} · {d.timeframe} · {d.row_count.toLocaleString()} rows · {new Date(d.created_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => deleteDataset(d.id)} disabled={deleting === d.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-600 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50">
                  {deleting === d.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info size={13} className="text-zinc-600 mt-0.5 shrink-0" />
          <div className="text-xs text-zinc-600 space-y-1">
            <div>All backtests run entirely in your browser. No data leaves the page except optional dataset metadata saved to Supabase. No Telegram messages, live signals, or account activity are ever generated.</div>
            <div>Backtest uses bar-close simulation (entry/exit at exact levels, no slippage). One trade at a time; next entry is only evaluated after current trade closes or expires.</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
