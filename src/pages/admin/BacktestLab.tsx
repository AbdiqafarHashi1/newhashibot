import { useEffect, useState, useRef, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
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
  evaluations: number; candidates: number; rejected: number;
}

interface CsvInfo {
  totalRows: number;
  skippedRows: number;
  firstTime: string;
  lastTime: string;
  inferredTf: string;
}

// ─── Default params by strategy and mode ─────────────────────────────────────

type Mode = 'conservative' | 'balanced' | 'aggressive';
type Strategy = 'MicroScalper' | 'CompressionBreakout' | 'SwingContinuation';
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

const DEFAULTS: Record<Strategy, Record<Mode, ParamSet>> = {
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
}

const FAIL = (): EvalOut => ({ ok: false, direction: 'buy', entry: 0, entry_low: 0, entry_high: 0, sl: 0, tp1: 0, tp2: 0, grade: 'reject', score: 0, rr: 0, reason: '' });

function evalMS(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['5m', '15m'].includes(tf)) return FAIL();
  if (window.length < 60) return FAIL();
  const closes = window.map(c => c.close);
  const ema20 = calcEMA(closes, p.ema_fast); const ema50 = calcEMA(closes, p.ema_slow);
  const atr = calcATR(window, p.atr_len); const rsi = calcRSI(closes, p.rsi_len);
  const last = window[window.length - 1]; const prev = window[window.length - 2];
  const price = last.close;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  const bodyRatio = atr > 0 ? Math.abs(last.close - last.open) / atr : 0;

  if (atrPct < p.min_atr_pct || atrPct > p.max_atr_pct || bodyRatio < p.min_body_atr) return FAIL();

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
    if (mom > 0.2) score += 8; else return FAIL();
    if (rsi >= 58) score += 8; else score += 3;
    if (prev.close < ema20 && price > ema20) score += 7;
    score += last.close > last.open ? 5 : -3;
  } else if (ema20 < ema50 && rsi <= p.rsi_sell_max && price < ema20) {
    direction = 'sell'; score += 15;
    if (reg === 'trend_down') score += 10;
    if (mom < -0.2) score += 8; else return FAIL();
    if (rsi <= 42) score += 8; else score += 3;
    if (prev.close > ema20 && price < ema20) score += 7;
    score += last.close < last.open ? 5 : -3;
  } else return FAIL();

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

function evalCB(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['15m', '1h'].includes(tf)) return FAIL();
  const boxLookback = p.box_lookback, minBoxBars = p.min_box_bars;
  if (window.length < boxLookback + 5) return FAIL();
  const closes = window.map(c => c.close);
  const atr = calcATR(window, p.atr_len);
  if (atr <= 0) return FAIL();
  const rsi = calcRSI(closes, p.rsi_len);
  const last = window[window.length - 1]; const price = last.close;
  const boxSlice = window.slice(-(boxLookback + 1), -1);
  if (boxSlice.length < minBoxBars) return FAIL();
  const boxHigh = Math.max(...boxSlice.map(c => c.high));
  const boxLow  = Math.min(...boxSlice.map(c => c.low));
  const boxRange = boxHigh - boxLow;
  if (boxRange > atr * p.max_box_atr_range) return FAIL();
  const barsInside = boxSlice.filter(c => c.high <= boxHigh * 1.0015 && c.low >= boxLow * 0.9985).length;
  if (barsInside < minBoxBars) return FAIL();

  const boxMid = (boxHigh + boxLow) / 2;
  const bfh = boxSlice.slice(0, Math.floor(boxSlice.length / 2));
  const bsh = boxSlice.slice(Math.floor(boxSlice.length / 2));
  const fa = bfh.reduce((s, c) => s + c.close, 0) / (bfh.length || 1);
  const sa = bsh.reduce((s, c) => s + c.close, 0) / (bsh.length || 1);
  const drift = Math.abs(sa - fa) / (boxRange || 1);
  if (drift < 0.10 && Math.abs(fa - boxMid) / (boxRange || 1) < 0.15 && Math.abs(sa - boxMid) / (boxRange || 1) < 0.15) return FAIL();

  const buf = atr * p.breakout_buffer_atr;
  const up = last.close > boxHigh + buf && last.close > last.open;
  const dn = last.close < boxLow  - buf && last.close < last.open;
  if (!up && !dn) return FAIL();

  const hist = window.slice(-(p.atr_expansion_lookback + 1), -1);
  const avgRange = hist.reduce((s, c) => s + (c.high - c.low), 0) / (hist.length || 1);
  const expansion = avgRange > 0 ? (last.high - last.low) / avgRange : 1;
  if (expansion < p.min_atr_expansion) return FAIL();

  const brkDist = up ? last.close - boxHigh : boxLow - last.close;
  if (brkDist < buf * 0.6) return FAIL();

  const mom = momentumScore(closes, p.momentum_lookback);
  if (up && mom < 0) return FAIL();
  if (dn && mom > 0) return FAIL();

  const direction: 'buy' | 'sell' = up ? 'buy' : 'sell';
  let score = 50;
  const cq = barsInside / Math.max(boxLookback, 1);
  if (cq > 0.80) score += 12; else if (cq > 0.60) score += 7; else score += 2;
  if (expansion > 2.0) score += 12; else if (expansion > 1.5) score += 8; else score += 4;
  if ((brkDist / atr) > 0.6) score += 8; else score += 2;
  if (direction === 'buy'  && rsi > 55) score += 6;
  if (direction === 'sell' && rsi < 45) score += 6;
  if (mom !== 0) score += 4;

  const entry_low  = direction === 'buy'  ? boxHigh          : boxLow - atr * 0.35;
  const entry_high = direction === 'buy'  ? boxHigh + atr * 0.35 : boxLow;
  const entry = (entry_low + entry_high) / 2;
  const sl  = direction === 'buy'  ? boxLow  - atr * p.stop_atr_mult : boxHigh + atr * p.stop_atr_mult;
  const tp1 = direction === 'buy'  ? price   + atr * p.tp1_r         : price   - atr * p.tp1_r;
  const tp2 = direction === 'buy'  ? price   + atr * p.tp2_r         : price   - atr * p.tp2_r;
  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? parseFloat((Math.abs(tp2 - entry) / risk).toFixed(2)) : 0;
  if (rr >= 3.0) score += 10; else if (rr >= 2.0) score += 6;
  const final_score = Math.min(Math.max(score, 0), 100);
  const grade = final_score >= 85 ? 'A+' : final_score >= 75 ? 'A' : final_score >= 65 ? 'B' : 'reject';
  return { ok: true, direction, entry, entry_low, entry_high, sl, tp1, tp2, grade, score: final_score, rr, reason: `CB ${direction}: cq=${cq.toFixed(2)}, exp=${expansion.toFixed(2)}x, box=${boxLow.toFixed(4)}-${boxHigh.toFixed(4)}` };
}

function evalSW(window: BtCandle[], p: ParamSet, tf: string): EvalOut {
  if (!['15m', '1h'].includes(tf)) return FAIL();
  if (window.length < 60) return FAIL();
  const closes = window.map(c => c.close);
  const ema20 = calcEMA(closes, p.ema_fast); const ema50 = calcEMA(closes, p.ema_slow);
  const atr = calcATR(window, p.atr_len); const rsi = calcRSI(closes, p.rsi_len);
  const last = window[window.length - 1]; const price = last.close;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  if (atrPct < p.min_atr_pct || atrPct > p.max_atr_pct) return FAIL();

  const emaBull = ema20 > ema50 * 1.003; const emaBear = ema20 < ema50 * 0.997;
  if (!emaBull && !emaBear) return FAIL();

  const olderHi = window.length > 50 ? Math.max(...window.slice(-50, -20).map(c => c.high)) : Math.max(...window.slice(-20).map(c => c.high));
  const olderLo = window.length > 50 ? Math.min(...window.slice(-50, -20).map(c => c.low))  : Math.min(...window.slice(-20).map(c => c.low));
  const recentHi = Math.max(...window.slice(-20).map(c => c.high));
  const recentLo = Math.min(...window.slice(-20).map(c => c.low));
  const rcr = (olderHi - olderLo) > 0 ? (recentHi - recentLo) / (olderHi - olderLo) : 1;
  const reg = regime(ema20, ema50, rsi, rcr, atrPct);
  if (['ranging', 'unclear'].includes(reg)) return FAIL();

  const pbWindow = window.slice(-(p.pullback_bars + 1), -1);
  const pbLow  = Math.min(...pbWindow.map(c => c.low));
  const pbHigh = Math.max(...pbWindow.map(c => c.high));
  const mom = momentumScore(closes, p.momentum_lookback);

  let score = 50, direction: 'buy' | 'sell' | null = null;
  if (emaBull && rsi >= p.rsi_buy_min && price > ema20) {
    if (pbLow > ema20 * 1.008 || price <= ema20) return FAIL();
    if (mom <= 0 || rsi < 48) return FAIL();
    direction = 'buy';
  } else if (emaBear && rsi <= p.rsi_sell_max && price < ema20) {
    if (pbHigh < ema20 * 0.992 || price >= ema20) return FAIL();
    if (mom >= 0 || rsi > 52) return FAIL();
    direction = 'sell';
  } else return FAIL();

  const emaSep = Math.abs(ema20 - ema50) / ema50;
  if (emaSep > 0.01) score += 12; else if (emaSep > 0.005) score += 8; else score += 3;
  if ((direction === 'buy' && reg === 'trend_up') || (direction === 'sell' && reg === 'trend_down')) score += 10;
  const ms = Math.abs(mom);
  if (ms > 0.5) score += 8; else if (ms > 0.2) score += 5;
  if ((direction === 'buy' && rsi >= 58) || (direction === 'sell' && rsi <= 42)) score += 7; else score += 3;
  if ((direction === 'buy' && last.close > last.open) || (direction === 'sell' && last.close < last.open)) score += 5;

  const structLow  = direction === 'buy'  ? Math.min(pbLow,  price - atr * p.stop_atr_mult) : 0;
  const structHigh = direction === 'sell' ? Math.max(pbHigh, price + atr * p.stop_atr_mult) : 0;
  const sl  = direction === 'buy'  ? structLow  - atr * 0.3 : structHigh + atr * 0.3;
  const tp1 = direction === 'buy'  ? price + atr * p.tp1_r  : price - atr * p.tp1_r;
  const tp2 = direction === 'buy'  ? price + atr * p.tp2_r  : price - atr * p.tp2_r;
  const entry_low = price * 0.9997, entry_high = price * 1.0003, entry = price;
  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? parseFloat((Math.abs(tp2 - entry) / risk).toFixed(2)) : 0;
  if (rr >= 3.0) score += 10; else if (rr >= 2.0) score += 5;
  const final_score = Math.min(Math.max(score, 0), 100);
  const grade = final_score >= 85 ? 'A+' : final_score >= 75 ? 'A' : final_score >= 65 ? 'B' : 'reject';
  return { ok: true, direction, entry, entry_low, entry_high, sl, tp1, tp2, grade, score: final_score, rr, reason: `SW ${direction}: ema_sep=${(emaSep * 100).toFixed(2)}%, rsi=${rsi.toFixed(1)}, regime=${reg}` };
}

// ─── Backtest engine ──────────────────────────────────────────────────────────

function runBacktest(
  candles: BtCandle[], strategy: Strategy, tf: string, p: ParamSet,
): { trades: BtTrade[]; evaluations: number; candidates: number; rejected: number } {
  const trades: BtTrade[] = [];
  const MIN_WIN = 65;
  let evaluations = 0, candidates = 0, rejected = 0;
  let inTrade = false;
  let tradeEndIndex = -1;

  const evalFn = strategy === 'MicroScalper' ? evalMS : strategy === 'CompressionBreakout' ? evalCB : evalSW;

  for (let i = MIN_WIN; i < candles.length; i++) {
    if (inTrade && i <= tradeEndIndex) continue;
    inTrade = false;

    const window = candles.slice(0, i + 1);
    evaluations++;
    const ev = evalFn(window, p, tf);
    if (!ev.ok || ev.grade === 'reject') { rejected++; continue; }

    const guard = passesDistanceGuard(ev.entry, ev.sl, ev.tp1, ev.tp2, ev.score, ev.rr, p);
    if (!guard.ok) { rejected++; continue; }
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

  return { trades, evaluations, candidates, rejected };
}

// ─── Metrics calculator ───────────────────────────────────────────────────────

function calcMetrics(trades: BtTrade[], evaluations: number, candidates: number, rejected: number): BtMetrics {
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
    evaluations, candidates, rejected,
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
  const [strategy, setStrategy] = useState<Strategy>('MicroScalper');
  const [mode, setMode] = useState<Mode>('balanced');
  const [params, setParams] = useState<ParamSet>(DEFAULTS.MicroScalper.balanced);
  const [showParams, setShowParams] = useState(false);

  // Results
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trades, setTrades] = useState<BtTrade[] | null>(null);
  const [metrics, setMetrics] = useState<BtMetrics | null>(null);
  const [showTrades, setShowTrades] = useState(true);
  const [tradeSort, setTradeSort] = useState<'time' | 'r'>('time');
  const [tradePage, setTradePage] = useState(0);
  const [resultsStale, setResultsStale] = useState(false);

  // Saved datasets list
  const [datasets, setDatasets] = useState<ReplayDataset[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmPending, setConfirmPending] = useState(false);

  const loadDatasets = useCallback(async () => {
    const { data } = await supabase.from('replay_datasets').select('*').order('created_at', { ascending: false });
    setDatasets((data ?? []) as ReplayDataset[]);
  }, []);
  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // When strategy or mode changes, reload defaults
  useEffect(() => { setParams(DEFAULTS[strategy][mode]); }, [strategy, mode]);

  // Mark results stale when config changes after a run
  useEffect(() => {
    if (metrics) setResultsStale(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, mode, params, rangeStart, rangeEnd, rangePreset, csvTimeframe]);

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
    setRunning(true); setProgress(10); setTrades(null); setMetrics(null);
    setResultsStale(false); setTradePage(0); setConfirmPending(false);

    setTimeout(() => {
      setProgress(30);
      try {
        const { trades: t, evaluations, candidates, rejected } = runBacktest(candles, strategy, csvTimeframe, params);
        setProgress(90);
        const m = calcMetrics(t, evaluations, candidates, rejected);
        setTrades(t); setMetrics(m); setProgress(100); setShowTrades(true);
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
                <div className={`flex items-center justify-between text-xs px-2.5 py-2 rounded-lg border ${
                  sizeBlock   ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                  sizeConfirm ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                  sizeWarning ? 'bg-yellow-500/8 border-yellow-500/20 text-yellow-300' :
                  'bg-zinc-800/50 border-zinc-700/50 text-zinc-400'
                }`}>
                  <span>Selected candles</span>
                  <span className="font-medium">{selectedCount.toLocaleString()}</span>
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

          {/* Strategy + Mode */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
              <Settings size={13} className="text-zinc-500" /> Strategy &amp; Mode
            </div>
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Strategy</label>
                <div className="flex gap-2">
                  {(['MicroScalper', 'CompressionBreakout', 'SwingContinuation'] as Strategy[]).map(s => (
                    <button key={s} onClick={() => setStrategy(s)}
                      className={`flex-1 text-xs py-2 px-2 rounded-lg border transition-colors ${strategy === s ? 'bg-sky-600/20 border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                      {s === 'MicroScalper' ? 'Micro' : s === 'CompressionBreakout' ? 'Breakout' : 'Swing'}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-xs text-zinc-600">
                  {strategy === 'MicroScalper' && 'Short-term momentum · 5m/15m · EMA + RSI'}
                  {strategy === 'CompressionBreakout' && 'Range compression + expansion · 15m/1h'}
                  {strategy === 'SwingContinuation' && 'Trend pullback reclaim · 15m/1h · wider SL/TP'}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Mode (loads default parameters)</label>
                <div className="flex gap-2">
                  {(['conservative', 'balanced', 'aggressive'] as Mode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 text-xs py-2 px-2 rounded-lg border capitalize transition-colors ${mode === m ? 'bg-sky-600/20 border-sky-500/50 text-sky-300' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                      {m}
                    </button>
                  ))}
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
                <div className="text-xs text-zinc-600 mb-3">Editing overrides mode defaults. Mode buttons reset to defaults.</div>

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
                {/* Summary cards */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
                    <BarChart2 size={13} className="text-zinc-500" />
                    Results — {strategy} · {mode} · {csvTimeframe}
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
                        <span>Net R result</span>
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
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-8 text-center">
                    <Minus size={28} className="text-zinc-700 mx-auto mb-3" />
                    <div className="text-sm text-zinc-500">No trades generated</div>
                    <div className="text-xs text-zinc-600 mt-1">Try a lower min_score, loosen distance guards, or use a longer CSV</div>
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
