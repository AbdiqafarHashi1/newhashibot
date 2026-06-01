import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  symbol: string; market_type: string; timeframe: string; open_time: string;
  open: number; high: number; low: number; close: number; volume: number; source: string;
}

interface Indicators {
  ema20: number; ema50: number; atr14: number; rsi14: number;
  recent_high: number; recent_low: number; avg_volume: number;
  body_size: number; atr_pct: number; range_compression_ratio: number;
  momentum_score: number; volatility_state: string; regime: string;
}

interface EvalResult {
  status: "candidate" | "rejected";
  direction: string; entry_low: number; entry_high: number;
  stop_loss: number; tp1: number; tp2: number; risk_reward: number;
  confidence_score: number; grade: string; reason: string;
  rejection_reason: string; score_breakdown: Record<string, number | string | boolean>;
}

interface ScannerConfig {
  is_enabled: boolean; demo_mode_enabled: boolean; min_signal_grade: string;
  prevent_duplicate_symbol_signals: boolean; active_timeframes: string[];
  allow_demo_telegram_sending: boolean; auto_send_telegram: boolean;
  min_auto_send_grade: string; scan_crypto_enabled: boolean; scan_forex_enabled: boolean;
  signal_enable_crypto: boolean; signal_enable_forex: boolean;
  scan_interval_minutes: number; schedule_enabled: boolean;
}

interface StrategyConfig {
  strategy_name: string;
  enabled: boolean;
  signal_style: string;
  risk_mode: string;
  min_score: number;
  min_rr: number;
  min_stop_distance_pct: number;
  min_tp1_distance_pct: number;
  min_tp2_distance_pct: number;
  max_bars_in_trade: number;
  allowed_symbols: string[];
  allowed_timeframes: string[];
  params: Record<string, number>;
}

interface RiskProfile {
  mode_slug: string; equity_start: number;
  risk_per_trade_pct: number; max_risk_per_trade_pct: number;
  max_daily_loss_pct: number; max_total_drawdown_pct: number;
  max_open_positions: number; max_open_risk_pct: number;
  max_trades_per_day: number; max_consecutive_losses: number;
  cooldown_minutes_after_loss: number; one_active_signal_per_symbol: boolean;
  correlation_guard_enabled: boolean; daily_lock_enabled: boolean;
  compounding_enabled: boolean; compounding_mode: string;
  score_threshold_override: number; min_rr_override: number;
}

interface ModeConfig {
  mode_slug: string; enabled: boolean; display_name: string;
  strategy_overrides: Record<string, unknown>;
  execution_policy: Record<string, unknown>;
}

interface ArbitratorDecision {
  selected_mode: string; risk_check_passed: boolean; risk_rejection_reason: string;
  final_decision: string; decision_reason: string;
  score_threshold_used: number; min_rr_used: number;
  mode_adjustments_used: string[]; duplicate_blocked: boolean;
  daily_lock_state: boolean; cooldown_state: boolean;
  paper_execution_intent_created: boolean;
}

interface RiskState {
  open_positions: number; trades_today: number; consecutive_losses: number;
  last_loss_at: string | null; daily_pnl_pct: number; total_drawdown_pct: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) { ema = values[i] * k + ema * (1 - k); }
  return ema;
}

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes: number[], period = 14): number {
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

function calcMomentumScore(closes: number[], lookback = 3): number {
  if (closes.length < lookback + 1) return 0;
  const recent = closes.slice(-lookback - 1);
  let up = 0, dn = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] > recent[i - 1]) up++; else if (recent[i] < recent[i - 1]) dn++;
  }
  return (up - dn) / lookback;
}

function clampScore(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function scoreGrade(score: number): string {
  return score >= 85 ? "A+" : score >= 75 ? "A" : score >= 65 ? "B" : "reject";
}

function hasInvalidCandles(candles: Candle[]): boolean {
  return candles.some((c) => !Number.isFinite(c.open) || !Number.isFinite(c.high) || !Number.isFinite(c.low) || !Number.isFinite(c.close) || c.high < c.low || c.close <= 0);
}

// ─── Indicators ──────────────────────────────────────────────────────────────

function calculateIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const vols = candles.map((c) => c.volume);
  const ema20 = calcEMA(closes, 20), ema50 = calcEMA(closes, 50);
  const atr14 = calcATR(candles, 14), rsi14 = calcRSI(closes, 14);
  const recent_high = Math.max(...highs.slice(-20));
  const recent_low = Math.min(...lows.slice(-20));
  const avg_volume = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const last = candles[candles.length - 1];
  const body_size = Math.abs(last.close - last.open);
  const price = last.close;
  const atr_pct = price > 0 ? (atr14 / price) * 100 : 0;
  const recentRange = recent_high - recent_low;
  const olderCandles = candles.slice(-50, -20);
  const olderHigh = olderCandles.length > 0 ? Math.max(...olderCandles.map((c) => c.high)) : recent_high;
  const olderLow = olderCandles.length > 0 ? Math.min(...olderCandles.map((c) => c.low)) : recent_low;
  const olderRange = olderHigh - olderLow;
  const range_compression_ratio = olderRange > 0 ? recentRange / olderRange : 1;
  const momentum_score = calcMomentumScore(closes, 3);
  const volatility_state = atr_pct > 3.0 ? "high" : atr_pct < 0.5 ? "low" : "normal";
  let regime = "unclear";
  if (ema20 > ema50 * 1.002 && rsi14 > 52) regime = "trend_up";
  else if (ema20 < ema50 * 0.998 && rsi14 < 48) regime = "trend_down";
  else if (range_compression_ratio < 0.55) regime = "compression";
  else if (atr_pct > 2.0) regime = "expansion";
  else if (rsi14 > 45 && rsi14 < 55) regime = "ranging";
  return { ema20, ema50, atr14, rsi14, recent_high, recent_low, avg_volume, body_size, atr_pct, range_compression_ratio, momentum_score, volatility_state, regime };
}

// ─── Strategy evaluator helpers ────────────────────────────────────────────────

function pctDistance(from: number, to: number): number {
  return from > 0 && Number.isFinite(from) && Number.isFinite(to) ? parseFloat(((Math.abs(to - from) / from) * 100).toFixed(4)) : 0;
}

function strategyZeroReject(reason: string): EvalResult {
  return {
    status: "rejected", direction: "", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0,
    risk_reward: 0, confidence_score: 0, grade: "reject", reason, rejection_reason: reason,
    score_breakdown: { primary_failed_gate: reason },
  };
}


// ─── Forex-specific helpers ──────────────────────────────────────────────────

function isJpyPair(symbol: string): boolean {
  return normalizeSymbol(symbol).endsWith("JPY");
}

function forexPipSize(symbol: string): number {
  return isJpyPair(symbol) ? 0.01 : 0.0001;
}

function forexPrecision(symbol: string): number {
  return isJpyPair(symbol) ? 3 : 5;
}

function roundForexPrice(symbol: string, price: number): number {
  if (!Number.isFinite(price)) return 0;
  return Number(price.toFixed(forexPrecision(symbol)));
}

function pipDistance(symbol: string, from: number, to: number): number {
  const pip = forexPipSize(symbol);
  return pip > 0 && Number.isFinite(from) && Number.isFinite(to) ? parseFloat((Math.abs(to - from) / pip).toFixed(1)) : 0;
}

function forexPairType(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const majors = new Set(["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"]);
  return majors.has(normalized) ? "major" : normalized.length === 6 ? "minor" : "unknown";
}

function forexSessionContext(date = new Date()): string {
  const hour = date.getUTCHours();
  if (hour >= 12 && hour < 16) return "London-NY overlap";
  if (hour >= 7 && hour < 12) return "London";
  if (hour >= 16 && hour < 21) return "New York";
  if (hour >= 0 && hour < 7) return "Asian";
  return "Unknown";
}

function forexAtrPct(symbol: string, atr: number, price: number): number {
  if (price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return 0;
  return (atr / price) * 100;
}

function forexZeroReject(reason: string, symbol: string): EvalResult {
  return {
    ...strategyZeroReject(reason),
    score_breakdown: {
      primary_failed_gate: reason,
      forex_pair_type: forexPairType(symbol),
      session_context: forexSessionContext(),
    },
  };
}

function forexEntryBand(symbol: string, price: number, atr: number, maxPips: number): { entry_low: number; entry_high: number } {
  const half = Math.min(atr * 0.12, forexPipSize(symbol) * maxPips);
  return {
    entry_low: roundForexPrice(symbol, price - half),
    entry_high: roundForexPrice(symbol, price + half),
  };
}

// ─── MicroScalper ─────────────────────────────────────────────────────────────

function evalMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const rsi_buy_min = params.rsi_buy_min ?? 52, rsi_sell_max = params.rsi_sell_max ?? 48;
  const min_atr_pct = params.min_atr_pct ?? 0.05, max_atr_pct = params.max_atr_pct ?? 3.0;
  const min_body_atr = params.min_body_atr ?? 0.25, stop_atr_mult = params.stop_atr_mult ?? 1.2;
  const tp1_r = params.tp1_r ?? 0.9, tp2_r = params.tp2_r ?? 1.5;
  const min_rr = params.min_rr ?? 1.2, min_score = params.min_score ?? 75;
  const crypto_behavior_tuning = params.crypto_behavior_tuning === 1;
  const min_continuation_body_atr = params.min_continuation_body_atr ?? 0.15;
  const max_chase_extension_atr = params.max_chase_extension_atr ?? 1.8;
  const momentum_lookback = Math.max(1, Math.floor(params.momentum_lookback ?? 3));

  if (!["5m", "15m"].includes(timeframe)) return strategyZeroReject("unsupported_timeframe");
  if (candles.length < 55) return strategyZeroReject("insufficient_candles");
  if (hasInvalidCandles(candles)) return strategyZeroReject("invalid_candles");

  const last = candles[candles.length - 1];
  const price = last.close;
  const atr = ind.atr14;
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return strategyZeroReject("invalid_atr_or_price");

  const closes = candles.map((c) => c.close);
  const momentumRaw = calcMomentumScore(closes, momentum_lookback);
  const bodyAtr = atr > 0 ? ind.body_size / atr : 0;
  const buyContext = (ind.ema20 > ind.ema50 ? 2 : 0) + (last.close > ind.ema20 ? 1 : 0) + (ind.rsi14 >= rsi_buy_min ? 1 : 0) + (momentumRaw > 0 ? 1 : 0);
  const sellContext = (ind.ema20 < ind.ema50 ? 2 : 0) + (last.close < ind.ema20 ? 1 : 0) + (ind.rsi14 <= rsi_sell_max ? 1 : 0) + (momentumRaw < 0 ? 1 : 0);
  const direction: "buy" | "sell" = buyContext >= sellContext ? "buy" : "sell";
  const directionalMomentum = direction === "buy" ? momentumRaw : -momentumRaw;
  const rsiConfirmed = direction === "buy" ? ind.rsi14 >= rsi_buy_min : ind.rsi14 <= rsi_sell_max;
  const trendConfirmed = direction === "buy" ? ind.ema20 > ind.ema50 && last.close > ind.ema20 : ind.ema20 < ind.ema50 && last.close < ind.ema20;
  const candleConfirmed = direction === "buy" ? last.close > last.open : last.close < last.open;
  const momentumConfirmed = directionalMomentum > 0.2;
  const continuationBodyConfirmed = bodyAtr >= min_body_atr || (crypto_behavior_tuning && candleConfirmed && directionalMomentum >= 0.45 && bodyAtr >= min_continuation_body_atr);
  const priceExtensionAtr = atr > 0 ? (direction === "buy" ? price - ind.ema20 : ind.ema20 - price) / atr : 0;
  const chaseRisk = crypto_behavior_tuning && priceExtensionAtr > max_chase_extension_atr && bodyAtr < min_body_atr * 1.25 && directionalMomentum < 0.7;

  const entry_low = price * 0.9998, entry_high = price * 1.0002;
  const stop_loss = direction === "buy" ? price - atr * stop_atr_mult : price + atr * stop_atr_mult;
  const tp1 = direction === "buy" ? price + atr * tp1_r : price - atr * tp1_r;
  const tp2 = direction === "buy" ? price + atr * tp2_r : price - atr * tp2_r;
  const risk = Math.abs(price - stop_loss), reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

  const trendScore = trendConfirmed ? 75 : clampScore(35 + Math.max(buyContext, sellContext) * 8);
  const momentumScore = clampScore((Math.max(0, directionalMomentum) * 65) + (Math.min(bodyAtr, 1) * 20) + (candleConfirmed ? 15 : 0));
  const rsiScore = direction === "buy"
    ? clampScore(Math.min(Math.max((ind.rsi14 - 45) / Math.max(rsi_buy_min - 45, 1), 0), 1.25) * 80)
    : clampScore(Math.min(Math.max((55 - ind.rsi14) / Math.max(55 - rsi_sell_max, 1), 0), 1.25) * 80);
  const bodyScore = clampScore(Math.min(bodyAtr / Math.max(min_body_atr, 0.01), 1.25) * 80);
  let volatilityScore = 85;
  if (ind.atr_pct < min_atr_pct) volatilityScore = clampScore((ind.atr_pct / Math.max(min_atr_pct, 0.01)) * 55);
  else if (ind.atr_pct > max_atr_pct) volatilityScore = clampScore(Math.max(20, 80 - ((ind.atr_pct - max_atr_pct) / Math.max(max_atr_pct, 0.01)) * 80));
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.5) * 66);

  let primaryFailedGate = "";
  if (ind.atr_pct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (ind.atr_pct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (!continuationBodyConfirmed) primaryFailedGate = "candle_body_too_small";
  else if (!trendConfirmed || !rsiConfirmed) primaryFailedGate = "rsi_not_confirmed";
  else if (!momentumConfirmed || chaseRisk) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.24) + (momentumScore * 0.22) + (rsiScore * 0.18) + (bodyScore * 0.12) + (volatilityScore * 0.12) + (rrScore * 0.12));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    trend_score: trendScore,
    rsi_score: rsiScore,
    momentum_score: momentumScore,
    candle_body_score: bodyScore,
    volatility_score: volatilityScore,
    rr_score: rrScore,
    direction_basis: direction === "buy" ? buyContext : sellContext,
    rsi: parseFloat(ind.rsi14.toFixed(2)),
    atr_pct: parseFloat(ind.atr_pct.toFixed(4)),
    body_atr: parseFloat(bodyAtr.toFixed(3)),
    continuation_body_confirmed: continuationBodyConfirmed,
    price_extension_atr: parseFloat(priceExtensionAtr.toFixed(3)),
    chase_risk: chaseRisk,
    rr: risk_reward,
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `MicroScalper ${direction}: rsi=${ind.rsi14.toFixed(1)}, momentum=${directionalMomentum.toFixed(2)}, body=${bodyAtr.toFixed(2)} ATR, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) {
    return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  }
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── ForexMicroScalper ───────────────────────────────────────────────────────

function evalForexMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const symbol = normalizeSymbol(candles[candles.length - 1]?.symbol ?? "");
  const min_atr_pct = params.min_atr_pct ?? (isJpyPair(symbol) ? 0.025 : 0.018);
  const max_atr_pct = params.max_atr_pct ?? 0.32;
  const min_body_atr = params.min_body_atr ?? 0.18;
  const stop_atr_mult = params.stop_atr_mult ?? 1.15;
  const tp1_r = params.tp1_r ?? 1.15;
  const tp2_r = params.tp2_r ?? 1.7;
  const min_rr = params.min_rr ?? 1.25;
  const min_score = params.min_score ?? 74;
  const momentum_lookback = Math.max(2, Math.floor(params.momentum_lookback ?? 3));
  const min_stop_pips = params.min_stop_pips ?? (isJpyPair(symbol) ? 5.5 : 4.5);
  const min_tp1_pips = params.min_tp1_pips ?? (isJpyPair(symbol) ? 6 : 5);
  const min_tp2_pips = params.min_tp2_pips ?? (isJpyPair(symbol) ? 8 : 7);
  const max_entry_band_pips = params.max_entry_band_pips ?? (timeframe === "5m" ? 1.2 : 1.8);

  if (!["5m", "15m"].includes(timeframe)) return forexZeroReject("unsupported_timeframe", symbol);
  if (candles.length < 55) return forexZeroReject("insufficient_candles", symbol);
  if (hasInvalidCandles(candles)) return forexZeroReject("invalid_candles", symbol);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = last.close;
  const atr = ind.atr14;
  const pip = forexPipSize(symbol);
  const atrPips = atr / pip;
  const atrPct = forexAtrPct(symbol, atr, price);
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return forexZeroReject("invalid_atr_or_price", symbol);

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const momentumRaw = calcMomentumScore(closes, momentum_lookback);
  const emaSpreadPips = Math.abs(ind.ema20 - ind.ema50) / pip;
  const emaSpreadAtr = Math.abs(ind.ema20 - ind.ema50) / atr;
  const recentHigh = Math.max(...highs.slice(-8, -1));
  const recentLow = Math.min(...lows.slice(-8, -1));
  const body = Math.abs(last.close - last.open);
  const bodyAtr = body / atr;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const totalRange = Math.max(last.high - last.low, pip / 10);
  const bodyShare = body / totalRange;

  const buyContext = (ind.ema20 > ind.ema50 ? 2 : 0) + (price > ind.ema20 ? 1 : 0) + (momentumRaw > 0 ? 1 : 0) + (ind.rsi14 >= 50 ? 1 : 0) + (last.close >= recentHigh ? 1 : 0);
  const sellContext = (ind.ema20 < ind.ema50 ? 2 : 0) + (price < ind.ema20 ? 1 : 0) + (momentumRaw < 0 ? 1 : 0) + (ind.rsi14 <= 50 ? 1 : 0) + (last.close <= recentLow ? 1 : 0);
  const direction: "buy" | "sell" = buyContext >= sellContext ? "buy" : "sell";
  const directionalMomentum = direction === "buy" ? momentumRaw : -momentumRaw;
  const candleInDirection = direction === "buy" ? last.close > last.open : last.close < last.open;
  const wickOk = direction === "buy" ? upperWick <= body * 1.8 : lowerWick <= body * 1.8;
  const trendConfirmed = direction === "buy" ? ind.ema20 > ind.ema50 && price > ind.ema20 : ind.ema20 < ind.ema50 && price < ind.ema20;
  const structureAligned = direction === "buy" ? last.close > prev.close && last.low >= recentLow - atr * 0.25 : last.close < prev.close && last.high <= recentHigh + atr * 0.25;
  const rsiConfirmed = direction === "buy" ? ind.rsi14 >= 48 && ind.rsi14 <= 72 : ind.rsi14 <= 52 && ind.rsi14 >= 28;
  const spikeOnly = bodyAtr > 1.25 && Math.abs(last.close - prev.close) > atr * 1.15 && Math.sign(last.close - last.open) !== Math.sign(prev.close - prev.open);

  const { entry_low, entry_high } = forexEntryBand(symbol, price, atr, max_entry_band_pips);
  const rawRisk = Math.max(atr * stop_atr_mult, pip * min_stop_pips);
  const structureStop = direction === "buy" ? Math.min(recentLow - atr * 0.12, price - rawRisk) : Math.max(recentHigh + atr * 0.12, price + rawRisk);
  const stop_loss = roundForexPrice(symbol, structureStop);
  const risk = Math.abs(price - stop_loss);
  const tp1 = roundForexPrice(symbol, direction === "buy" ? price + risk * tp1_r : price - risk * tp1_r);
  const tp2 = roundForexPrice(symbol, direction === "buy" ? price + risk * tp2_r : price - risk * tp2_r);
  const risk_reward = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  const stopPips = pipDistance(symbol, price, stop_loss);
  const tp1Pips = pipDistance(symbol, price, tp1);
  const tp2Pips = pipDistance(symbol, price, tp2);

  const trendScore = clampScore((trendConfirmed ? 45 : 15) + Math.min(emaSpreadAtr, 0.8) * 35 + (structureAligned ? 20 : 0));
  const momentumScore = clampScore((Math.max(0, directionalMomentum) * 55) + (candleInDirection ? 20 : 0) + (structureAligned ? 15 : 0) + Math.min(bodyAtr, 0.8) * 12);
  const candleScore = clampScore((candleInDirection ? 35 : 8) + Math.min(bodyAtr / Math.max(min_body_atr, 0.01), 1.2) * 35 + (bodyShare >= 0.35 ? 20 : 5) + (wickOk ? 10 : 0));
  const rsiScore = direction === "buy" ? clampScore(100 - Math.abs(ind.rsi14 - 58) * 4) : clampScore(100 - Math.abs(ind.rsi14 - 42) * 4);
  let volatilityScore = 85;
  if (atrPct < min_atr_pct) volatilityScore = clampScore((atrPct / Math.max(min_atr_pct, 0.001)) * 55);
  else if (atrPct > max_atr_pct) volatilityScore = clampScore(Math.max(20, 85 - ((atrPct - max_atr_pct) / Math.max(max_atr_pct, 0.001)) * 120));
  const spreadOrDistanceScore = clampScore(Math.min(stopPips / Math.max(min_stop_pips, 0.1), 1.4) * 45 + Math.min(tp1Pips / Math.max(min_tp1_pips, 0.1), 1.4) * 25 + Math.min(tp2Pips / Math.max(min_tp2_pips, 0.1), 1.4) * 20 + Math.min(atrPips / Math.max(min_stop_pips, 0.1), 1.2) * 10);
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.45) * 70);

  let primaryFailedGate = "";
  if (atrPct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (atrPct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (emaSpreadPips < 1.2 || stopPips < min_stop_pips || tp1Pips < min_tp1_pips || tp2Pips < min_tp2_pips) primaryFailedGate = "distance_guard_failed";
  else if (!trendConfirmed || !structureAligned) primaryFailedGate = "trend_filter_failed";
  else if (directionalMomentum < 0.15) primaryFailedGate = "momentum_failed";
  else if (!candleInDirection || bodyAtr < min_body_atr || bodyShare < 0.32 || !wickOk || spikeOnly) primaryFailedGate = "candle_body_too_small";
  else if (!rsiConfirmed) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.22) + (momentumScore * 0.19) + (candleScore * 0.17) + (rsiScore * 0.12) + (volatilityScore * 0.12) + (spreadOrDistanceScore * 0.10) + (rrScore * 0.08));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    trend_score: trendScore,
    momentum_score: momentumScore,
    volatility_score: volatilityScore,
    candle_score: candleScore,
    rsi_score: rsiScore,
    spread_or_distance_score: spreadOrDistanceScore,
    rr_score: rrScore,
    rr: risk_reward,
    direction,
    ema_alignment: direction === "buy" ? "ema20_above_ema50" : "ema20_below_ema50",
    ema_spread_pips: parseFloat(emaSpreadPips.toFixed(1)),
    atr_pips: parseFloat(atrPips.toFixed(1)),
    atr_pct: parseFloat(atrPct.toFixed(4)),
    body_atr: parseFloat(bodyAtr.toFixed(3)),
    body_share: parseFloat(bodyShare.toFixed(3)),
    structure_aligned: structureAligned,
    spike_only: spikeOnly,
    rsi: parseFloat(ind.rsi14.toFixed(2)),
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    stop_distance_pips: stopPips,
    tp1_distance_pips: tp1Pips,
    tp2_distance_pips: tp2Pips,
    forex_pair_type: forexPairType(symbol),
    session_context: forexSessionContext(),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `ForexMicroScalper ${direction}: EMA context=${trendScore}, momentum=${momentumScore}, candle=${candleScore}, ATR=${atrPips.toFixed(1)} pips, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── CompressionBreakout ──────────────────────────────────────────────────────

function evalCompressionBreakout(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const box_lookback = Math.max(10, Math.floor(params.box_lookback ?? 50));
  const min_box_bars = Math.max(5, Math.floor(params.min_box_bars ?? 14));
  const max_box_atr_range = params.max_box_atr_range ?? 1.8;
  const atr_expansion_lookback = Math.max(5, Math.floor(params.atr_expansion_lookback ?? 48));
  const min_atr_expansion = params.min_atr_expansion ?? 1.1;
  const breakout_buffer_atr = params.breakout_buffer_atr ?? 0.12;
  const momentum_lookback = Math.max(1, Math.floor(params.momentum_lookback ?? 3));
  const stop_atr_mult = params.stop_atr_mult ?? 1.4;
  const tp1_r = params.tp1_r ?? 1.3;
  const tp2_r = params.tp2_r ?? 2.5;
  const min_rr = params.min_rr ?? 1.3;
  const min_score = params.min_score ?? 75;
  const crypto_behavior_tuning = params.crypto_behavior_tuning === 1;
  const atr_len = Math.max(2, Math.floor(params.atr_len ?? 14));
  const rsi_len = Math.max(2, Math.floor(params.rsi_len ?? 14));
  const ema_fast = Math.max(2, Math.floor(params.ema_fast ?? 20));
  const ema_slow = Math.max(ema_fast + 1, Math.floor(params.ema_slow ?? 50));

  if (!["15m", "1h"].includes(timeframe)) return strategyZeroReject("unsupported_timeframe");
  const minLen = Math.max(box_lookback + 5, atr_expansion_lookback + 2, ema_slow + 5, atr_len + 2, rsi_len + 2, 60);
  if (candles.length < minLen) return strategyZeroReject("insufficient_candles");
  if (hasInvalidCandles(candles)) return strategyZeroReject("invalid_candles");

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last.close;
  const atr = calcATR(candles, atr_len);
  const rsi = calcRSI(closes, rsi_len);
  const emaFast = calcEMA(closes, ema_fast);
  const emaSlow = calcEMA(closes, ema_slow);
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return strategyZeroReject("invalid_atr_or_price");

  const boxSlice = candles.slice(-(box_lookback + 1), -1);
  if (boxSlice.length < min_box_bars) return strategyZeroReject("insufficient_candles");
  const boxHigh = Math.max(...boxSlice.map((c) => c.high));
  const boxLow = Math.min(...boxSlice.map((c) => c.low));
  const boxRange = boxHigh - boxLow;
  if (boxRange <= 0 || !Number.isFinite(boxRange)) return strategyZeroReject("invalid_atr_or_price");

  const buffer = atr * breakout_buffer_atr;
  const breakoutDistUp = last.close - boxHigh;
  const breakoutDistDn = boxLow - last.close;
  const closeOutsideUp = breakoutDistUp > 0 && last.close > last.open;
  const closeOutsideDn = breakoutDistDn > 0 && last.close < last.open;
  const breakoutUp = breakoutDistUp > buffer && last.close > last.open;
  const breakoutDn = breakoutDistDn > buffer && last.close < last.open;
  const earlyBreakoutUp = crypto_behavior_tuning && closeOutsideUp && (last.high - last.low) > atr * min_atr_expansion;
  const earlyBreakoutDn = crypto_behavior_tuning && closeOutsideDn && (last.high - last.low) > atr * min_atr_expansion;
  const direction: "buy" | "sell" = breakoutUp || earlyBreakoutUp ? "buy" : breakoutDn || earlyBreakoutDn ? "sell" : (last.close >= (boxHigh + boxLow) / 2 ? "buy" : "sell");
  const breakoutConfirmed = breakoutUp || breakoutDn || earlyBreakoutUp || earlyBreakoutDn;
  const breakoutDist = direction === "buy" ? Math.max(0, breakoutDistUp) : Math.max(0, breakoutDistDn);
  const breakoutDistanceAtr = breakoutDist / atr;

  const barsInside = boxSlice.filter((c) => c.high <= boxHigh * 1.0015 && c.low >= boxLow * 0.9985).length;
  const boxRangeAtr = boxRange / atr;
  const insideRatio = barsInside / Math.max(boxSlice.length, 1);
  const strictCompressionReady = boxSlice.length >= min_box_bars && barsInside >= min_box_bars && boxRangeAtr <= max_box_atr_range;
  const rangeTightness = max_box_atr_range > 0 ? Math.max(0, Math.min(1, 1 - (boxRangeAtr / Math.max(max_box_atr_range * 1.35, 0.01)))) : 0;
  const compressionScore = clampScore((insideRatio * 45) + (rangeTightness * 55));
  const nearCompressionReady = crypto_behavior_tuning && boxSlice.length >= min_box_bars && barsInside >= min_box_bars * 0.75 && boxRangeAtr <= max_box_atr_range * 1.2 && compressionScore >= 50;
  const compressionReady = strictCompressionReady || (nearCompressionReady && breakoutConfirmed);

  const histSlice = candles.slice(-(atr_expansion_lookback + 1), -1);
  const avgBarRange = histSlice.length > 0 ? histSlice.reduce((sum, c) => sum + (c.high - c.low), 0) / histSlice.length : 0;
  const curBarRange = last.high - last.low;
  const atrExpansionRatio = avgBarRange > 0 ? curBarRange / avgBarRange : 1;
  const atrExpansionScore = clampScore(Math.min(1.4, atrExpansionRatio / Math.max(min_atr_expansion, 0.01)) * 70);
  const breakoutScore = clampScore((breakoutConfirmed ? 45 : 0) + Math.min(1, breakoutDistanceAtr / Math.max(breakout_buffer_atr * 4, 0.25)) * 55);

  const momentum = calcMomentumScore(closes, momentum_lookback);
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const directionMomentum = direction === "buy" ? momentum : -momentum;
  const rsiDirectional = direction === "buy" ? Math.max(0, (rsi - 45) / 20) : Math.max(0, (55 - rsi) / 20);
  const emaDirectional = direction === "buy" ? (emaFast >= emaSlow ? 1 : 0.45) : (emaFast <= emaSlow ? 1 : 0.45);
  const candleBodyScore = clampScore(Math.min(bodyAtr, 1.25) * 80);
  const momentumScore = clampScore((Math.max(0, directionMomentum) * 45) + (Math.min(bodyAtr, 1) * 30) + (Math.min(rsiDirectional, 1) * 15) + (emaDirectional * 10));

  let volatilityScore = 80;
  if (ind.atr_pct < 0.08) volatilityScore = 25;
  else if (ind.atr_pct < 0.15) volatilityScore = 55;
  else if (ind.atr_pct > 5.0) volatilityScore = 30;
  else if (ind.atr_pct > 3.5) volatilityScore = 55;

  let entry_low: number, entry_high: number, stop_loss: number, tp1: number, tp2: number;
  if (direction === "buy") {
    entry_low = breakoutConfirmed ? Math.min(boxHigh, price * 0.9995) : boxHigh;
    entry_high = breakoutConfirmed ? Math.max(price, boxHigh + atr * 0.25) : boxHigh + atr * 0.25;
    stop_loss = crypto_behavior_tuning ? Math.max(boxLow - atr * 0.25, boxHigh - atr * stop_atr_mult) : boxLow - atr * stop_atr_mult;
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price + riskForTargets * tp1_r : price + atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price + riskForTargets * tp2_r : price + atr * tp2_r;
  } else {
    entry_low = breakoutConfirmed ? Math.min(price, boxLow - atr * 0.25) : boxLow - atr * 0.25;
    entry_high = breakoutConfirmed ? Math.max(boxLow, price * 1.0005) : boxLow;
    stop_loss = crypto_behavior_tuning ? Math.min(boxHigh + atr * 0.25, boxLow + atr * stop_atr_mult) : boxHigh + atr * stop_atr_mult;
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price - riskForTargets * tp1_r : price - atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price - riskForTargets * tp2_r : price - atr * tp2_r;
  }
  const risk = Math.abs(price - stop_loss);
  const reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.5) * 66);

  let primaryFailedGate = "";
  if (!compressionReady) primaryFailedGate = "compression_not_ready";
  else if (!breakoutConfirmed) primaryFailedGate = "breakout_not_confirmed";
  else if (atrExpansionRatio < min_atr_expansion && !(crypto_behavior_tuning && nearCompressionReady && breakoutDistanceAtr >= breakout_buffer_atr * 2)) primaryFailedGate = "atr_expansion_weak";
  else if (ind.atr_pct > 5.0) primaryFailedGate = "volatility_too_high";
  else if (momentumScore < 45) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((compressionScore * 0.24) + (breakoutScore * 0.24) + (atrExpansionScore * 0.16) + (momentumScore * 0.14) + (volatilityScore * 0.08) + (rrScore * 0.10) + (candleBodyScore * 0.04));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    compression_score: compressionScore,
    box_range_atr: parseFloat(boxRangeAtr.toFixed(3)),
    box_lookback,
    min_box_bars,
    bars_inside_box: barsInside,
    compression_ready: compressionReady,
    strict_compression_ready: strictCompressionReady,
    near_compression_ready: nearCompressionReady,
    breakout_confirmed: breakoutConfirmed,
    early_breakout: earlyBreakoutUp || earlyBreakoutDn,
    breakout_direction: direction,
    breakout_distance_atr: parseFloat(breakoutDistanceAtr.toFixed(3)),
    atr_expansion: parseFloat(atrExpansionRatio.toFixed(3)),
    min_atr_expansion,
    momentum_score: momentumScore,
    candle_body_score: candleBodyScore,
    volatility_score: volatilityScore,
    rr_score: rrScore,
    rr: risk_reward,
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `CompressionBreakout ${direction}: box=${boxRangeAtr.toFixed(2)} ATR, breakout=${breakoutDistanceAtr.toFixed(2)} ATR, expansion=${atrExpansionRatio.toFixed(2)}x, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) {
    return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  }

  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── SwingContinuation ────────────────────────────────────────────────────────

function evalSwingContinuation(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const rsi_buy_min = params.rsi_buy_min ?? 50;
  const rsi_sell_max = params.rsi_sell_max ?? 50;
  const min_atr_pct = params.min_atr_pct ?? 0.15;
  const max_atr_pct = params.max_atr_pct ?? 4.0;
  const pullback_bars = Math.max(2, Math.floor(params.pullback_bars ?? 5));
  const stop_atr_mult = params.stop_atr_mult ?? 1.6;
  const tp1_r = params.tp1_r ?? 1.5;
  const tp2_r = params.tp2_r ?? 2.5;
  const min_rr = params.min_rr ?? 1.5;
  const min_score = params.min_score ?? params.min_confidence_balanced ?? 76;
  const crypto_behavior_tuning = params.crypto_behavior_tuning === 1;
  const momentum_lookback = Math.max(1, Math.floor(params.momentum_lookback ?? 3));
  const atr_len = Math.max(2, Math.floor(params.atr_len ?? 14));
  const rsi_len = Math.max(2, Math.floor(params.rsi_len ?? 14));
  const ema_fast = Math.max(2, Math.floor(params.ema_fast ?? 20));
  const ema_slow = Math.max(ema_fast + 1, Math.floor(params.ema_slow ?? 50));

  if (!["15m", "1h"].includes(timeframe)) return strategyZeroReject("unsupported_timeframe");
  const minLen = Math.max(ema_slow + 5, atr_len + 2, rsi_len + 2, pullback_bars + 10, 60);
  if (candles.length < minLen) return strategyZeroReject("insufficient_candles");
  if (hasInvalidCandles(candles)) return strategyZeroReject("invalid_candles");

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prevCloses = closes.slice(0, -pullback_bars);
  const price = last.close;
  const atr = calcATR(candles, atr_len);
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  const rsi = calcRSI(closes, rsi_len);
  const emaFast = calcEMA(closes, ema_fast);
  const emaSlow = calcEMA(closes, ema_slow);
  const priorEmaFast = calcEMA(prevCloses, ema_fast);
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return strategyZeroReject("invalid_atr_or_price");

  const emaSpreadPct = emaSlow > 0 ? ((emaFast - emaSlow) / emaSlow) * 100 : 0;
  const emaSlopePct = priorEmaFast > 0 ? ((emaFast - priorEmaFast) / priorEmaFast) * 100 : 0;
  const bullBias = (emaSpreadPct * 1.4) + emaSlopePct + (price > emaFast ? 0.25 : -0.25) + ((rsi - 50) / 100);
  const bearBias = (-emaSpreadPct * 1.4) - emaSlopePct + (price < emaFast ? 0.25 : -0.25) + ((50 - rsi) / 100);
  const direction: "buy" | "sell" = bullBias >= bearBias ? "buy" : "sell";
  const directionalSpread = direction === "buy" ? emaSpreadPct : -emaSpreadPct;
  const directionalSlope = direction === "buy" ? emaSlopePct : -emaSlopePct;
  const emaAligned = directionalSpread > 0;
  const emaAlignment = direction === "buy" ? (emaFast > emaSlow ? "bullish" : "not_bullish") : (emaFast < emaSlow ? "bearish" : "not_bearish");
  const priceVsEma = direction === "buy" ? ((price - emaFast) / price) * 100 : ((emaFast - price) / price) * 100;
  const trendScore = clampScore((emaAligned ? 42 : 12) + Math.min(Math.max(directionalSpread, 0) / 1.2, 1) * 38 + (directionalSlope > 0 ? 20 : 0));
  const emaSlopeScore = clampScore(35 + Math.min(Math.max(directionalSlope, -0.15) + 0.15, 0.65) / 0.65 * 65);

  const pullbackWindow = candles.slice(-(pullback_bars + 1), -1);
  const pullbackLow = Math.min(...pullbackWindow.map((c) => c.low));
  const pullbackHigh = Math.max(...pullbackWindow.map((c) => c.high));
  const touchedBuyZone = pullbackLow <= emaFast + atr * 0.75;
  const reclaimedBuy = price > emaFast && last.close > last.open;
  const touchedSellZone = pullbackHigh >= emaFast - atr * 0.75;
  const reclaimedSell = price < emaFast && last.close < last.open;
  const pullbackReady = direction === "buy" ? touchedBuyZone : touchedSellZone;
  const strictReclaimConfirmed = direction === "buy" ? reclaimedBuy : reclaimedSell;
  let reclaimConfirmed = strictReclaimConfirmed;
  const pullbackScore = direction === "buy"
    ? clampScore((touchedBuyZone ? 48 : 18) + (reclaimedBuy ? 38 : price > emaFast ? 22 : 0) + (pullbackLow > emaSlow ? 14 : 5))
    : clampScore((touchedSellZone ? 48 : 18) + (reclaimedSell ? 38 : price < emaFast ? 22 : 0) + (pullbackHigh < emaSlow ? 14 : 5));

  const momentum = calcMomentumScore(closes, momentum_lookback);
  const directionalMomentum = direction === "buy" ? momentum : -momentum;
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const momentumScore = clampScore((Math.max(0, directionalMomentum) * 60) + (Math.min(bodyAtr, 1) * 25) + ((direction === "buy" && last.close > last.open) || (direction === "sell" && last.close < last.open) ? 15 : 0));
  const rsiScore = direction === "buy"
    ? clampScore(Math.min(Math.max((rsi - 45) / Math.max(rsi_buy_min - 45, 1), 0), 1.25) * 80)
    : clampScore(Math.min(Math.max((55 - rsi) / Math.max(55 - rsi_sell_max, 1), 0), 1.25) * 80);
  const trendQualityPass = trendScore >= 45 || (crypto_behavior_tuning && emaSlopeScore >= 55 && directionalSpread > -0.08 && priceVsEma > 0 && rsiScore >= 40);
  const reclaimByQuality = crypto_behavior_tuning && pullbackScore >= 68 && momentumScore >= 45 && priceVsEma > -0.05;
  reclaimConfirmed = strictReclaimConfirmed || reclaimByQuality;
  let volatilityScore = 85;
  if (atrPct < min_atr_pct) volatilityScore = clampScore((atrPct / Math.max(min_atr_pct, 0.01)) * 55);
  else if (atrPct > max_atr_pct) volatilityScore = clampScore(Math.max(20, 80 - ((atrPct - max_atr_pct) / Math.max(max_atr_pct, 0.01)) * 80));

  let entry_low: number, entry_high: number, stop_loss: number, tp1: number, tp2: number;
  if (direction === "buy") {
    entry_low = price * 0.9997;
    entry_high = price * 1.0003;
    stop_loss = Math.min(pullbackLow - atr * 0.15, price - atr * stop_atr_mult);
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price + riskForTargets * tp1_r : price + atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price + riskForTargets * tp2_r : price + atr * tp2_r;
  } else {
    entry_low = price * 0.9997;
    entry_high = price * 1.0003;
    stop_loss = Math.max(pullbackHigh + atr * 0.15, price + atr * stop_atr_mult);
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price - riskForTargets * tp1_r : price - atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price - riskForTargets * tp2_r : price - atr * tp2_r;
  }
  const risk = Math.abs(price - stop_loss);
  const reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.5) * 66);

  let primaryFailedGate = "";
  if (atrPct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (atrPct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (!trendQualityPass) primaryFailedGate = "trend_filter_failed";
  else if (!pullbackReady || pullbackScore < 45) primaryFailedGate = "pullback_not_ready";
  else if (!reclaimConfirmed) primaryFailedGate = "reclaim_not_confirmed";
  else if (momentumScore < 35 || rsiScore < 35) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.22) + (emaSlopeScore * 0.14) + (pullbackScore * 0.20) + (momentumScore * 0.16) + (rsiScore * 0.12) + (volatilityScore * 0.08) + (rrScore * 0.08));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    trend_direction: direction,
    trend_score: trendScore,
    trend_quality_pass: trendQualityPass,
    ema_fast: parseFloat(emaFast.toFixed(8)),
    ema_slow: parseFloat(emaSlow.toFixed(8)),
    ema_alignment: emaAlignment,
    ema_slope: parseFloat(directionalSlope.toFixed(3)),
    ema_slope_score: emaSlopeScore,
    price_vs_ema: parseFloat(priceVsEma.toFixed(3)),
    pullback_score: pullbackScore,
    pullback_ready: pullbackReady,
    reclaim_confirmed: reclaimConfirmed,
    strict_reclaim_confirmed: strictReclaimConfirmed,
    reclaim_by_quality: reclaimByQuality,
    momentum_score: momentumScore,
    rsi_score: rsiScore,
    volatility_score: volatilityScore,
    rr_score: rrScore,
    rr: risk_reward,
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `SwingContinuation ${direction}: ema_spread=${directionalSpread.toFixed(3)}%, slope=${directionalSlope.toFixed(3)}%, pullback=${pullbackScore}, reclaim=${reclaimConfirmed}, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) {
    return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  }

  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── ForexSwingContinuation ──────────────────────────────────────────────────

function evalForexSwingContinuation(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const symbol = normalizeSymbol(candles[candles.length - 1]?.symbol ?? "");
  const min_atr_pct = params.min_atr_pct ?? 0.018;
  const max_atr_pct = params.max_atr_pct ?? 0.42;
  const pullback_bars = Math.max(3, Math.floor(params.pullback_bars ?? 6));
  const stop_atr_mult = params.stop_atr_mult ?? 1.35;
  const tp1_r = params.tp1_r ?? 1.25;
  const tp2_r = params.tp2_r ?? 1.85;
  const min_rr = params.min_rr ?? 1.45;
  const min_score = params.min_score ?? 76;
  const momentum_lookback = Math.max(2, Math.floor(params.momentum_lookback ?? 4));
  const atr_len = Math.max(2, Math.floor(params.atr_len ?? 14));
  const rsi_len = Math.max(2, Math.floor(params.rsi_len ?? 14));
  const ema_fast = Math.max(2, Math.floor(params.ema_fast ?? 20));
  const ema_slow = Math.max(ema_fast + 1, Math.floor(params.ema_slow ?? 50));
  const min_stop_pips = params.min_stop_pips ?? (isJpyPair(symbol) ? 9 : 8);
  const min_tp1_pips = params.min_tp1_pips ?? (isJpyPair(symbol) ? 11 : 10);

  if (!["1h", "15m"].includes(timeframe)) return forexZeroReject("unsupported_timeframe", symbol);
  const minLen = Math.max(ema_slow + 8, atr_len + 2, rsi_len + 2, pullback_bars + 12, 60);
  if (candles.length < minLen) return forexZeroReject("insufficient_candles", symbol);
  if (hasInvalidCandles(candles)) return forexZeroReject("invalid_candles", symbol);

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last.close;
  const atr = calcATR(candles, atr_len);
  const pip = forexPipSize(symbol);
  const atrPct = forexAtrPct(symbol, atr, price);
  const atrPips = atr / pip;
  const rsi = calcRSI(closes, rsi_len);
  const emaFast = calcEMA(closes, ema_fast);
  const emaSlow = calcEMA(closes, ema_slow);
  const priorEmaFast = calcEMA(closes.slice(0, -pullback_bars), ema_fast);
  if (atr <= 0 || price <= 0 || !Number.isFinite(atr) || !Number.isFinite(price)) return forexZeroReject("invalid_atr_or_price", symbol);

  const emaSpreadPct = emaSlow > 0 ? ((emaFast - emaSlow) / emaSlow) * 100 : 0;
  const emaSpreadPips = (emaFast - emaSlow) / pip;
  const emaSlope = priorEmaFast > 0 ? ((emaFast - priorEmaFast) / priorEmaFast) * 100 : 0;
  const bullBias = (emaSpreadPct * 2.0) + (emaSlope * 1.5) + (price > emaFast ? 0.15 : -0.15) + ((rsi - 50) / 120);
  const bearBias = (-emaSpreadPct * 2.0) + (-emaSlope * 1.5) + (price < emaFast ? 0.15 : -0.15) + ((50 - rsi) / 120);
  const direction: "buy" | "sell" = bullBias >= bearBias ? "buy" : "sell";
  const directionalSpreadPct = direction === "buy" ? emaSpreadPct : -emaSpreadPct;
  const directionalSlope = direction === "buy" ? emaSlope : -emaSlope;
  const directionalSpreadPips = direction === "buy" ? emaSpreadPips : -emaSpreadPips;
  const emaAligned = direction === "buy" ? emaFast > emaSlow : emaFast < emaSlow;
  const emaAlignment = direction === "buy" ? (emaAligned ? "bullish" : "not_bullish") : (emaAligned ? "bearish" : "not_bearish");
  const priceVsEma = direction === "buy" ? ((price - emaFast) / price) * 100 : ((emaFast - price) / price) * 100;

  const pullbackWindow = candles.slice(-(pullback_bars + 1), -1);
  const pullbackLow = Math.min(...pullbackWindow.map((c) => c.low));
  const pullbackHigh = Math.max(...pullbackWindow.map((c) => c.high));
  const pullbackCloseMin = Math.min(...pullbackWindow.map((c) => c.close));
  const pullbackCloseMax = Math.max(...pullbackWindow.map((c) => c.close));
  const touchedBuyZone = pullbackLow <= emaFast + atr * 0.7 && pullbackLow >= emaSlow - atr * 0.45;
  const touchedSellZone = pullbackHigh >= emaFast - atr * 0.7 && pullbackHigh <= emaSlow + atr * 0.45;
  const reclaimedBuy = price > emaFast && last.close > last.open && price > pullbackCloseMin + atr * 0.25;
  const reclaimedSell = price < emaFast && last.close < last.open && price < pullbackCloseMax - atr * 0.25;
  const pullbackReady = direction === "buy" ? touchedBuyZone : touchedSellZone;
  const reclaimConfirmed = direction === "buy" ? reclaimedBuy : reclaimedSell;

  const momentum = calcMomentumScore(closes, momentum_lookback);
  const directionalMomentum = direction === "buy" ? momentum : -momentum;
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const rsiOk = direction === "buy" ? rsi >= 48 && rsi <= 70 : rsi <= 52 && rsi >= 30;
  const recentHigh = Math.max(...candles.slice(-14, -1).map((c) => c.high));
  const recentLow = Math.min(...candles.slice(-14, -1).map((c) => c.low));
  const structureContinuation = direction === "buy" ? price > emaFast && recentLow > emaSlow - atr * 0.6 : price < emaFast && recentHigh < emaSlow + atr * 0.6;

  const { entry_low, entry_high } = forexEntryBand(symbol, price, atr, timeframe === "1h" ? 2.5 : 1.8);
  const minRisk = pip * min_stop_pips;
  const stopBuffer = Math.max(atr * 0.2, pip * 2);
  const stop_loss = roundForexPrice(symbol, direction === "buy"
    ? Math.min(pullbackLow - stopBuffer, price - Math.max(atr * stop_atr_mult, minRisk))
    : Math.max(pullbackHigh + stopBuffer, price + Math.max(atr * stop_atr_mult, minRisk)));
  const risk = Math.abs(price - stop_loss);
  const tp1 = roundForexPrice(symbol, direction === "buy" ? price + risk * tp1_r : price - risk * tp1_r);
  const tp2 = roundForexPrice(symbol, direction === "buy" ? price + risk * tp2_r : price - risk * tp2_r);
  const risk_reward = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  const stopPips = pipDistance(symbol, price, stop_loss);
  const tp1Pips = pipDistance(symbol, price, tp1);
  const tp2Pips = pipDistance(symbol, price, tp2);

  const trendScore = clampScore((emaAligned ? 42 : 8) + Math.min(Math.max(directionalSpreadPct, 0) / 0.18, 1) * 28 + Math.min(Math.max(directionalSlope, 0) / 0.08, 1) * 22 + (directionalSpreadPips >= 2 ? 8 : 0));
  const emaSlopeScore = clampScore(35 + Math.min(Math.max(directionalSlope, -0.04) + 0.04, 0.16) / 0.16 * 65);
  const pullbackScore = direction === "buy"
    ? clampScore((touchedBuyZone ? 42 : 12) + (reclaimedBuy ? 38 : price > emaFast ? 18 : 0) + (pullbackLow > emaSlow - atr * 0.45 ? 20 : 5))
    : clampScore((touchedSellZone ? 42 : 12) + (reclaimedSell ? 38 : price < emaFast ? 18 : 0) + (pullbackHigh < emaSlow + atr * 0.45 ? 20 : 5));
  const momentumScore = clampScore((Math.max(0, directionalMomentum) * 52) + ((direction === "buy" ? last.close > last.open : last.close < last.open) ? 18 : 0) + Math.min(bodyAtr, 0.9) * 20 + (rsiOk ? 10 : 0));
  let volatilityScore = 86;
  if (atrPct < min_atr_pct) volatilityScore = clampScore((atrPct / Math.max(min_atr_pct, 0.001)) * 55);
  else if (atrPct > max_atr_pct) volatilityScore = clampScore(Math.max(20, 86 - ((atrPct - max_atr_pct) / Math.max(max_atr_pct, 0.001)) * 120));
  const distanceScore = clampScore(Math.min(stopPips / Math.max(min_stop_pips, 0.1), 1.35) * 45 + Math.min(tp1Pips / Math.max(min_tp1_pips, 0.1), 1.35) * 25 + Math.min(tp2Pips / Math.max(min_tp1_pips * 1.4, 0.1), 1.35) * 20 + Math.min(atrPips / Math.max(min_stop_pips * 0.7, 0.1), 1.2) * 10);
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.35) * 74);
  const trendQualityPass = trendScore >= 58 && emaAligned && directionalSlope > -0.015 && directionalSpreadPips >= 1.5;

  let primaryFailedGate = "";
  if (atrPct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (atrPct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (!trendQualityPass) primaryFailedGate = "trend_filter_failed";
  else if (!pullbackReady || pullbackScore < 50) primaryFailedGate = "pullback_not_ready";
  else if (!reclaimConfirmed) primaryFailedGate = "reclaim_not_confirmed";
  else if (!structureContinuation) primaryFailedGate = "trend_filter_failed";
  else if (directionalMomentum < 0.05 || momentumScore < 42 || !rsiOk) primaryFailedGate = "momentum_failed";
  else if (stopPips < min_stop_pips || tp1Pips < min_tp1_pips) primaryFailedGate = "distance_guard_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.23) + (emaSlopeScore * 0.11) + (pullbackScore * 0.21) + (momentumScore * 0.15) + (volatilityScore * 0.10) + (distanceScore * 0.10) + (rrScore * 0.10));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    trend_direction: direction,
    trend_score: trendScore,
    ema_alignment: emaAlignment,
    ema_slope: parseFloat(directionalSlope.toFixed(4)),
    ema_slope_score: emaSlopeScore,
    ema_spread_pips: parseFloat(directionalSpreadPips.toFixed(1)),
    price_vs_ema: parseFloat(priceVsEma.toFixed(4)),
    trend_quality_pass: trendQualityPass,
    pullback_score: pullbackScore,
    pullback_ready: pullbackReady,
    reclaim_confirmed: reclaimConfirmed,
    momentum_score: momentumScore,
    volatility_score: volatilityScore,
    spread_or_distance_score: distanceScore,
    rr_score: rrScore,
    rr: risk_reward,
    atr_pips: parseFloat(atrPips.toFixed(1)),
    atr_pct: parseFloat(atrPct.toFixed(4)),
    body_atr: parseFloat(bodyAtr.toFixed(3)),
    rsi: parseFloat(rsi.toFixed(2)),
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    stop_distance_pips: stopPips,
    tp1_distance_pips: tp1Pips,
    tp2_distance_pips: tp2Pips,
    session_context: forexSessionContext(),
    forex_pair_type: forexPairType(symbol),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `ForexSwingContinuation ${direction}: EMA ${emaAlignment}, pullback=${pullbackScore}, reclaim=${reclaimConfirmed}, momentum=${momentumScore}, ATR=${atrPips.toFixed(1)} pips, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── Grade index ──────────────────────────────────────────────────────────────

function gradeIndex(g: string): number { return g === "A+" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0; }

const C2_FOREX_PROVIDER = "twelvedata";
const C2_FOREX_SYMBOLS = new Set(["EURUSD", "GBPUSD", "USDJPY"]);

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeRejectionReason(reason: string, marketType = "crypto"): string {
  const map: Record<string, string> = {
    risk_reward_too_low: "rr_too_low",
    distance_too_tight: "spread_or_distance_too_tight",
    sl_too_close: "spread_or_distance_too_tight",
    tp1_too_close: "spread_or_distance_too_tight",
    tp2_too_close: "spread_or_distance_too_tight",
    candle_body_too_small: "momentum_failed",
    momentum_too_weak: "momentum_failed",
    rsi_not_confirmed: "momentum_failed",
    unclear_trend: "trend_filter_failed",
    range_not_compressed: "compression_not_ready",
    chop_detected: "compression_not_ready",
  };
  const normalized = map[reason] ?? reason;
  if (marketType === "forex") {
    const allowed = new Set([
      "provider_failed", "provider_rate_limited", "provider_data_unavailable", "provider_invalid_response", "unsupported_symbol",
      "unsupported_timeframe", "insufficient_candles", "invalid_atr_or_price", "invalid_candles",
      "spread_or_distance_too_tight", "distance_guard_failed", "volatility_too_low", "volatility_too_high",
      "trend_filter_failed", "pullback_not_ready", "reclaim_not_confirmed", "momentum_failed",
      "rr_too_low", "confidence_too_low", "score_below_min", "forex_budget_limited", "duplicate_active_signal", "arbitration_blocked",
    ]);
    return allowed.has(normalized) ? normalized : "trend_filter_failed";
  }
  return normalized;
}

const C2_FOREX_TIMEFRAMES = new Set(["15m", "1h"]);

function intEnv(name: string, defaultValue: number, minValue = 0): number {
  const raw = Deno.env.get(name);
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= minValue ? parsed : defaultValue;
}

interface ForexTimeframePlan {
  supported: string[];
  unsupported: string[];
}

function forexTimeframePlan(): ForexTimeframePlan {
  const raw = Deno.env.get("FOREX_ACTIVE_TIMEFRAMES") ?? "15m,1h";
  const requested = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
  const supported = requested.filter((v) => C2_FOREX_TIMEFRAMES.has(v));
  const unsupported = requested.filter((v) => !C2_FOREX_TIMEFRAMES.has(v));
  return { supported: supported.length ? supported : ["15m", "1h"], unsupported };
}

function forexTimeframes(): string[] {
  return forexTimeframePlan().supported;
}

// ─── Distance guard ───────────────────────────────────────────────────────────

interface DistanceGuardResult {
  passed: boolean;
  rejection_reason: string;
  sl_pct: number;
  tp1_pct: number;
  tp2_pct: number;
  rr: number;
}

function checkDistanceGuards(
  r: EvalResult,
  cfg: StrategyConfig,
): DistanceGuardResult {
  const entry = r.entry_high > 0 && r.entry_low > 0
    ? (r.entry_low + r.entry_high) / 2
    : r.entry_high || r.entry_low;

  if (entry <= 0 || r.stop_loss <= 0 || r.tp1 <= 0 || r.tp2 <= 0) {
    return { passed: false, rejection_reason: "distance_too_tight", sl_pct: 0, tp1_pct: 0, tp2_pct: 0, rr: 0 };
  }

  const sl_pct  = (Math.abs(entry - r.stop_loss) / entry) * 100;
  const tp1_pct = (Math.abs(r.tp1 - entry) / entry) * 100;
  const tp2_pct = (Math.abs(r.tp2 - entry) / entry) * 100;
  const risk    = Math.abs(entry - r.stop_loss);
  const rr      = risk > 0 ? Math.abs(r.tp2 - entry) / risk : 0;

  if (sl_pct  < cfg.min_stop_distance_pct)  return { passed: false, rejection_reason: "sl_too_close",   sl_pct, tp1_pct, tp2_pct, rr };
  if (tp1_pct < cfg.min_tp1_distance_pct)   return { passed: false, rejection_reason: "tp1_too_close",  sl_pct, tp1_pct, tp2_pct, rr };
  if (tp2_pct < cfg.min_tp2_distance_pct)   return { passed: false, rejection_reason: "tp2_too_close",  sl_pct, tp1_pct, tp2_pct, rr };
  if (rr      < cfg.min_rr)                 return { passed: false, rejection_reason: "rr_too_low",     sl_pct, tp1_pct, tp2_pct, rr };
  if (r.confidence_score < cfg.min_score)   return { passed: false, rejection_reason: "confidence_too_low", sl_pct, tp1_pct, tp2_pct, rr };

  return { passed: true, rejection_reason: "", sl_pct, tp1_pct, tp2_pct, rr };
}

// ─── Strategy arbitration ─────────────────────────────────────────────────────
// When multiple strategies pass distance guards for the same symbol/timeframe,
// score each and return the best one. Losers are marked arbitration_blocked.

interface EvalEntry {
  name: string;
  result: EvalResult;
  cfg: StrategyConfig;
  guard: DistanceGuardResult;
}

function arbitrationScore(e: EvalEntry): number {
  const r = e.result;
  const g = e.guard;
  // Weighted composite: confidence 40%, RR 30%, margin above min distances 20%, regime 10%
  const scorePct   = r.confidence_score / 100;
  const rrPct      = Math.min(r.risk_reward / 4, 1);
  const slMargin   = g.sl_pct  > 0 ? Math.min((g.sl_pct  - e.cfg.min_stop_distance_pct)  / e.cfg.min_stop_distance_pct,  1) : 0;
  const tp1Margin  = g.tp1_pct > 0 ? Math.min((g.tp1_pct - e.cfg.min_tp1_distance_pct)   / e.cfg.min_tp1_distance_pct,   1) : 0;
  const tp2Margin  = g.tp2_pct > 0 ? Math.min((g.tp2_pct - e.cfg.min_tp2_distance_pct)   / e.cfg.min_tp2_distance_pct,   1) : 0;
  const distMargin = (slMargin + tp1Margin + tp2Margin) / 3;
  return scorePct * 0.40 + rrPct * 0.30 + distMargin * 0.20 + (gradeIndex(r.grade) / 3) * 0.10;
}

// ─── Risk Engine ──────────────────────────────────────────────────────────────

function runRiskCheck(rp: RiskProfile, state: RiskState, modeSlug: string): { passed: boolean; reason: string; daily_lock: boolean; cooldown: boolean } {
  if (modeSlug === "signal_mode") return { passed: true, reason: "", daily_lock: false, cooldown: false };
  const daily_lock = rp.daily_lock_enabled && state.daily_pnl_pct <= -rp.max_daily_loss_pct;
  if (daily_lock) return { passed: false, reason: "daily_loss_limit_reached", daily_lock: true, cooldown: false };
  if (state.total_drawdown_pct >= rp.max_total_drawdown_pct && rp.max_total_drawdown_pct > 0) return { passed: false, reason: "max_drawdown_reached", daily_lock: false, cooldown: false };
  if (rp.max_open_positions > 0 && state.open_positions >= rp.max_open_positions) return { passed: false, reason: "max_open_positions_reached", daily_lock: false, cooldown: false };
  if (rp.max_trades_per_day > 0 && state.trades_today >= rp.max_trades_per_day) return { passed: false, reason: "max_trades_per_day_reached", daily_lock: false, cooldown: false };
  if (rp.max_consecutive_losses > 0 && state.consecutive_losses >= rp.max_consecutive_losses) return { passed: false, reason: "max_consecutive_losses_reached", daily_lock: false, cooldown: false };
  if (rp.cooldown_minutes_after_loss > 0 && state.last_loss_at) {
    const minsAgo = (Date.now() - new Date(state.last_loss_at).getTime()) / 60000;
    if (minsAgo < rp.cooldown_minutes_after_loss) return { passed: false, reason: `cooldown_active_${Math.ceil(rp.cooldown_minutes_after_loss - minsAgo)}min_remaining`, daily_lock: false, cooldown: true };
  }
  return { passed: true, reason: "", daily_lock: false, cooldown: false };
}


interface RiskLeverageRecommendation {
  capital_mode: string;
  risk_profile: string;
  strategy_risk_class: string;
  recommended_risk_pct: number;
  suggested_leverage_min: number;
  suggested_leverage_max: number;
  leverage_cap: number;
  position_sizing_note: string;
  strategy_specific_warning: string;
  risk_warning: string;
  recommendation_source: string;
}

interface RiskLeverageSignalContext {
  market_type: string;
  strategy_name: string;
  grade: string;
  confidence_score: number;
  risk_reward: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
}

type CapitalModeSlug = "signal_mode" | "personal_mode" | "prop_mode";
type RiskProfileSlug = "conservative" | "balanced" | "aggressive";

interface StrategyRiskRule {
  riskClass: string;
  signalRisk: Record<RiskProfileSlug, number>;
  personalBase: [number, number];
  personalAPlusMax: number;
  propBase: [number, number];
  propAPlusMax: number;
  leverage: Record<CapitalModeSlug, { normal: [number, number]; aPlusMax: number }>;
  warning: string;
}

const STRATEGY_RISK_RULES: Record<string, StrategyRiskRule> = {
  MicroScalper: {
    riskClass: "frequent_scalper",
    signalRisk: { conservative: 0.25, balanced: 0.4, aggressive: 0.5 },
    personalBase: [0.35, 0.5], personalAPlusMax: 0.75,
    propBase: [0.15, 0.25], propAPlusMax: 0.3,
    leverage: {
      signal_mode: { normal: [2, 4], aPlusMax: 4 },
      personal_mode: { normal: [3, 5], aPlusMax: 6 },
      prop_mode: { normal: [1, 2], aPlusMax: 3 },
    },
    warning: "Frequent strategy. Avoid stacking multiple correlated signals.",
  },
  CompressionBreakout: {
    riskClass: "expansion_breakout",
    signalRisk: { conservative: 0.35, balanced: 0.5, aggressive: 0.75 },
    personalBase: [0.5, 0.5], personalAPlusMax: 1.0,
    propBase: [0.25, 0.25], propAPlusMax: 0.4,
    leverage: {
      signal_mode: { normal: [2, 5], aPlusMax: 5 },
      personal_mode: { normal: [3, 5], aPlusMax: 8 },
      prop_mode: { normal: [1, 2], aPlusMax: 4 },
    },
    warning: "Breakout/fakeout risk. Wait for clean invalidation and avoid chasing after entry zone.",
  },
  SwingContinuation: {
    riskClass: "swing_continuation",
    signalRisk: { conservative: 0.25, balanced: 0.4, aggressive: 0.6 },
    personalBase: [0.35, 0.5], personalAPlusMax: 0.75,
    propBase: [0.2, 0.3], propAPlusMax: 0.4,
    leverage: {
      signal_mode: { normal: [1, 3], aPlusMax: 3 },
      personal_mode: { normal: [2, 4], aPlusMax: 5 },
      prop_mode: { normal: [1, 2], aPlusMax: 3 },
    },
    warning: "Longer hold and wider stop. Avoid over-leverage.",
  },
  ForexMicroScalper: {
    riskClass: "forex_conservative_scalper",
    signalRisk: { conservative: 0.15, balanced: 0.25, aggressive: 0.35 },
    personalBase: [0.25, 0.4], personalAPlusMax: 0.5,
    propBase: [0.1, 0.2], propAPlusMax: 0.25,
    leverage: {
      signal_mode: { normal: [1, 3], aPlusMax: 3 },
      personal_mode: { normal: [2, 4], aPlusMax: 5 },
      prop_mode: { normal: [1, 2], aPlusMax: 3 },
    },
    warning: "Forex spread/session risk. Use lower risk until live results are proven.",
  },
  ForexSwingContinuation: {
    riskClass: "forex_conservative_swing",
    signalRisk: { conservative: 0.15, balanced: 0.25, aggressive: 0.35 },
    personalBase: [0.25, 0.5], personalAPlusMax: 0.6,
    propBase: [0.1, 0.25], propAPlusMax: 0.3,
    leverage: {
      signal_mode: { normal: [1, 3], aPlusMax: 3 },
      personal_mode: { normal: [2, 4], aPlusMax: 5 },
      prop_mode: { normal: [1, 2], aPlusMax: 3 },
    },
    warning: "Longer hold, session/news exposure, and spread risk. Keep leverage conservative.",
  },
};

function normalizeCapitalMode(modeSlug: string | undefined): CapitalModeSlug {
  return modeSlug === "personal_mode" || modeSlug === "prop_mode" ? modeSlug : "signal_mode";
}

function normalizeRiskProfile(raw: unknown): RiskProfileSlug {
  const value = String(raw ?? "balanced").toLowerCase();
  if (value === "conservative" || value === "aggressive") return value;
  return "balanced";
}

function roundRecommendation(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function entryMidpoint(ctx: RiskLeverageSignalContext): number {
  if (ctx.entry_low > 0 && ctx.entry_high > 0) return (ctx.entry_low + ctx.entry_high) / 2;
  return ctx.entry_high > 0 ? ctx.entry_high : ctx.entry_low;
}

function buildRiskLeverageRecommendation(
  signalContext: RiskLeverageSignalContext,
  strategyConfig: StrategyConfig,
  modeConfig?: ModeConfig,
): RiskLeverageRecommendation {
  const capitalMode = normalizeCapitalMode(modeConfig?.mode_slug ?? "signal_mode");
  const marketType = String(signalContext.market_type ?? "crypto").toLowerCase();
  const rule = STRATEGY_RISK_RULES[signalContext.strategy_name] ?? (marketType === "forex" ? STRATEGY_RISK_RULES.ForexSwingContinuation : STRATEGY_RISK_RULES.SwingContinuation);

  let riskProfile = normalizeRiskProfile(strategyConfig.risk_mode);
  if (capitalMode === "prop_mode") riskProfile = "conservative";
  if (marketType === "forex" && riskProfile === "aggressive") riskProfile = "balanced";
  if (signalContext.confidence_score < 80 && riskProfile === "aggressive") riskProfile = "balanced";
  if (signalContext.risk_reward < 1.3) riskProfile = "conservative";

  const hardRiskCap = capitalMode === "prop_mode" ? 0.4 : capitalMode === "personal_mode" ? 1.0 : 1.0;
  const hardLeverageCap = capitalMode === "prop_mode" ? 4 : capitalMode === "personal_mode" ? 10 : (marketType === "forex" ? 3 : 6);
  const canAPlusAdjust = signalContext.grade === "A+" && signalContext.confidence_score >= 85 && signalContext.risk_reward >= 1.3;

  let riskPct = rule.signalRisk[riskProfile];
  if (capitalMode === "personal_mode") {
    riskPct = riskProfile === "conservative" ? rule.personalBase[0] : riskProfile === "balanced" ? rule.personalBase[1] : rule.personalAPlusMax;
    if (canAPlusAdjust) riskPct = Math.min(rule.personalAPlusMax, riskPct + 0.1);
  } else if (capitalMode === "prop_mode") {
    riskPct = riskProfile === "conservative" ? rule.propBase[0] : riskProfile === "balanced" ? rule.propBase[1] : rule.propAPlusMax;
    if (canAPlusAdjust) riskPct = Math.min(rule.propAPlusMax, riskPct + 0.05);
  } else if (canAPlusAdjust && riskProfile !== "conservative") {
    riskPct = Math.min(hardRiskCap, riskPct + 0.05);
  }

  const levRule = rule.leverage[capitalMode];
  let leverageMin = levRule.normal[0];
  let leverageMax = canAPlusAdjust ? Math.max(levRule.normal[1], levRule.aPlusMax) : levRule.normal[1];

  const entry = entryMidpoint(signalContext);
  const stopPct = entry > 0 ? Math.abs(entry - signalContext.stop_loss) / entry * 100 : 0;
  const wideStopThreshold = marketType === "forex" ? 0.45 : signalContext.strategy_name.includes("Swing") ? 1.25 : 0.8;
  const veryWideStopThreshold = marketType === "forex" ? 0.75 : signalContext.strategy_name.includes("Swing") ? 2.0 : 1.5;
  const riskWarnings: string[] = ["Signal only. Manage risk. Not financial advice."];

  if (marketType === "forex") {
    leverageMax = Math.min(leverageMax, 3);
    if (riskProfile === "aggressive") riskProfile = "balanced";
    riskWarnings.push("Forex leverage guidance is intentionally conservative until more live results are available.");
  }

  if (stopPct >= veryWideStopThreshold) {
    leverageMax = Math.min(leverageMax, Math.max(leverageMin, 2));
    riskPct *= 0.75;
    riskWarnings.push(`Wide stop distance (${stopPct.toFixed(2)}%) reduced leverage guidance.`);
  } else if (stopPct >= wideStopThreshold) {
    leverageMax = Math.max(leverageMin, leverageMax - 1);
    riskWarnings.push(`Wider stop distance (${stopPct.toFixed(2)}%) keeps leverage guidance lower.`);
  }

  if (signalContext.confidence_score < 80) {
    riskPct = Math.min(riskPct, rule.signalRisk[riskProfile === "conservative" ? "conservative" : "balanced"]);
    leverageMax = Math.min(leverageMax, levRule.normal[1]);
    riskWarnings.push("Confidence below 80 prevents aggressive guidance.");
  }

  if (signalContext.risk_reward < 1.3) {
    riskPct = Math.min(riskPct, rule.signalRisk.conservative);
    leverageMax = leverageMin;
    riskWarnings.push("R/R below 1.3 forces conservative guidance.");
  }

  riskPct = roundRecommendation(clamp(riskPct, 0.05, hardRiskCap));
  leverageMin = roundRecommendation(clamp(leverageMin, 1, hardLeverageCap));
  leverageMax = roundRecommendation(clamp(Math.max(leverageMax, leverageMin), leverageMin, hardLeverageCap));

  if (capitalMode === "signal_mode" && riskPct > 1) riskWarnings.push("Guidance would exceed 1%, so it was capped.");
  if (capitalMode === "personal_mode" && riskPct >= 1) riskWarnings.push("Personal guidance is capped at the 1% hard-risk limit.");
  if (capitalMode === "prop_mode" && riskPct >= 0.4) riskWarnings.push("Prop guidance is capped at the 0.4% hard-risk limit.");

  const modeLabel = capitalMode.replace(/_/g, " ");
  return {
    capital_mode: capitalMode,
    risk_profile: riskProfile,
    strategy_risk_class: rule.riskClass,
    recommended_risk_pct: riskPct,
    suggested_leverage_min: leverageMin,
    suggested_leverage_max: leverageMax,
    leverage_cap: hardLeverageCap,
    position_sizing_note: `${modeLabel}: suggested ${riskPct}% account risk. Size position from entry-to-stop distance; guidance only, no execution.`,
    strategy_specific_warning: rule.warning,
    risk_warning: riskWarnings.join(" "),
    recommendation_source: "strategy_risk_engine_v1",
  };
}

// ─── Paper execution intent creator ──────────────────────────────────────────

async function createPaperIntent(
  supabase: ReturnType<typeof createClient>,
  signalId: string, modeSlug: string, symbol: string, direction: string,
  entry_price: number, stop_loss: number, tp1: number, tp2: number,
  rp: RiskProfile, blockReason: string
): Promise<string | null> {
  const equity = rp.equity_start > 0 ? rp.equity_start : 1000;
  const risk_pct = rp.risk_per_trade_pct;
  const risk_amount = risk_pct > 0 ? equity * (risk_pct / 100) : null;
  const stop_distance = Math.abs(entry_price - stop_loss);
  const calculated_position_size = risk_amount && stop_distance > 0 ? risk_amount / stop_distance : null;
  const status = blockReason ? "blocked" : "simulated";
  const { data } = await supabase.from("paper_execution_intents").insert({
    signal_id: signalId, mode_slug: modeSlug, symbol, direction,
    entry_price, stop_loss, tp1, tp2,
    risk_pct, calculated_position_size, risk_amount,
    account_equity_snapshot: equity, execution_mode: "paper",
    status, block_reason: blockReason,
  }).select("id").single();
  return data?.id ?? null;
}

// ─── Demo candle generator ────────────────────────────────────────────────────

// C2 keeps this historical helper unused: forex demo fallback is forbidden.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateDemoCandles(symbol: string, market_type: string, timeframe: string, count = 110): Candle[] {
  const seedPrices: Record<string, number> = {
    BTCUSDT: 67000, ETHUSDT: 3500, SOLUSDT: 155, BNBUSDT: 580,
    XRPUSDT: 0.52, ADAUSDT: 0.44, DOGEUSDT: 0.14, AVAXUSDT: 35, LINKUSDT: 14, POLUSDT: 0.88,
    EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 149.5, USDCHF: 0.905,
    AUDUSD: 0.655, NZDUSD: 0.605, USDCAD: 1.365, EURJPY: 162.2, GBPJPY: 189.1, XAUUSD: 2320,
  };
  const tfMs: Record<string, number> = { "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000 };
  const intervalMs = tfMs[timeframe] ?? 900000;
  const basePrice = seedPrices[symbol] ?? 100;
  const volatility = market_type === "crypto" ? 0.012 : 0.0035;
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();
  const trend = (Math.sin(Date.now() / 1000000) > 0) ? 0.0004 : -0.0004;
  for (let i = count; i >= 0; i--) {
    const open = price;
    const change = (Math.random() - 0.47 + trend) * volatility * price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.4 * price;
    const low = Math.min(open, close) - Math.random() * volatility * 0.4 * price;
    candles.push({ symbol, market_type, timeframe, open_time: new Date(now - i * intervalMs).toISOString(), open: parseFloat(open.toFixed(8)), high: parseFloat(high.toFixed(8)), low: parseFloat(Math.max(low, 0.00001).toFixed(8)), close: parseFloat(close.toFixed(8)), volume: market_type === "crypto" ? parseFloat((Math.random() * 1000 + 100).toFixed(4)) : 0, source: "demo" });
    price = close;
  }
  return candles;
}

// ─── Binance ──────────────────────────────────────────────────────────────────

async function fetchBinanceCandles(symbol: string, timeframe: string, limit = 110): Promise<Candle[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const raw: unknown[][] = await res.json();
    return raw.map((k) => ({ symbol, market_type: "crypto", timeframe, open_time: new Date(k[0] as number).toISOString(), open: parseFloat(k[1] as string), high: parseFloat(k[2] as string), low: parseFloat(k[3] as string), close: parseFloat(k[4] as string), volume: parseFloat(k[5] as string), source: "binance" }));
  } catch { return null; }
}

// ─── TwelveData ───────────────────────────────────────────────────────────────
// C2 forex signal mode uses TwelveData as the single real-data provider.
// Finnhub remains available only for explicit diagnostics because the deployed
// Finnhub key/plan has returned HTTP 403 for forex candles.

const TD_SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
  GBPJPY: "GBP/JPY", XAUUSD: "XAU/USD",
};

function toTDSymbol(s: string): string { return TD_SYMBOL_MAP[s] ?? `${s.slice(0, 3)}/${s.slice(3)}`; }
function toTDInterval(tf: string): string { return ({ "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h" } as Record<string, string>)[tf] ?? "15min"; }

function parseTwelveDataDateTime(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  return new Date(withZone).toISOString();
}

type ForexProviderStatusClass =
  | "ok"
  | "unauthorized_401"
  | "forbidden_403"
  | "rate_limited_429"
  | "unsupported_symbol"
  | "unsupported_timeframe"
  | "invalid_symbol_format"
  | "insufficient_candles"
  | "market_closed_or_stale"
  | "provider_invalid_response"
  | "provider_error";

interface ForexProviderFetchResult {
  candles: Candle[] | null;
  error: string | null;
  provider: string;
  mapped_symbol: string;
  symbol_format: string;
  http_status: number | null;
  response_body: string;
  status_class: ForexProviderStatusClass;
  candle_count: number;
  url_without_token: string;
}

interface ForexLatestPriceResult {
  price: number | null;
  error: string | null;
  provider: string;
  mapped_symbol: string;
  symbol_format: string;
  http_status: number | null;
  response_body: string;
  status_class: ForexProviderStatusClass;
  url_without_token: string;
}

function classifyProviderHttpStatus(status: number): ForexProviderStatusClass {
  if (status === 401) return "unauthorized_401";
  if (status === 403) return "forbidden_403";
  if (status === 429) return "rate_limited_429";
  return "provider_error";
}

function classifyProviderPayload(message: string): ForexProviderStatusClass {
  const m = message.toLowerCase();
  if (m.includes("symbol") && (m.includes("invalid") || m.includes("not found") || m.includes("not available"))) return "invalid_symbol_format";
  if (m.includes("rate") || m.includes("limit")) return "rate_limited_429";
  if (m.includes("api key") || m.includes("apikey") || m.includes("unauthorized")) return "unauthorized_401";
  if (m.includes("forbidden") || m.includes("permission") || m.includes("plan")) return "forbidden_403";
  if (m.includes("no values") || m.includes("no_data")) return "market_closed_or_stale";
  if (m.includes("json") || m.includes("unexpected") || m.includes("invalid response") || m.includes("invalid latest price")) return "provider_invalid_response";
  return "provider_error";
}

function safeProviderBody(text: string): string {
  if (!text) return "";
  return text.replace(/apikey=[^&\s"]+/gi, "apikey=REDACTED").replace(/token=[^&\s"]+/gi, "token=REDACTED").slice(0, 500);
}

async function fetchTwelveDataCandles(symbol: string, tf: string, apiKey: string, limit = 110): Promise<ForexProviderFetchResult> {
  const tdSymbol = toTDSymbol(symbol);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${toTDInterval(tf)}&outputsize=${limit}&apikey=REDACTED&format=JSON`;
  const realUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${toTDInterval(tf)}&outputsize=${limit}&apikey=${apiKey}&format=JSON`;
  try {
    const res = await fetch(realUrl, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const safeBody = safeProviderBody(text);
    if (!res.ok) {
      return { candles: null, error: `TwelveData HTTP ${res.status}: ${safeBody}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: classifyProviderHttpStatus(res.status), candle_count: 0, url_without_token: url };
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { candles: null, error: `TwelveData invalid JSON response: ${safeBody}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "provider_invalid_response", candle_count: 0, url_without_token: url };
    }
    if (data.status === "error" || data.code) {
      const msg = String(data.message ?? data.code ?? safeBody);
      return { candles: null, error: `TwelveData: ${msg}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: classifyProviderPayload(msg), candle_count: 0, url_without_token: url };
    }
    const values = data.values as Array<Record<string, string>>;
    if (!Array.isArray(values) || values.length === 0) {
      const msg = `TwelveData: no values for ${tdSymbol} ${tf}`;
      return { candles: null, error: msg, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "market_closed_or_stale", candle_count: 0, url_without_token: url };
    }
    const candles = values.reverse().map((v) => ({
      symbol, market_type: "forex", timeframe: tf,
      open_time: parseTwelveDataDateTime(v.datetime),
      open: parseFloat(v.open), high: parseFloat(v.high),
      low: parseFloat(v.low), close: parseFloat(v.close),
      volume: parseFloat(v.volume ?? "0"), source: "twelvedata",
    }));
    return { candles, error: null, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "ok", candle_count: candles.length, url_without_token: url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "TwelveData fetch failed";
    return { candles: null, error: msg, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: null, response_body: "", status_class: classifyProviderPayload(msg), candle_count: 0, url_without_token: url };
  }
}

async function fetchTwelveDataLatestPrice(symbol: string, apiKey: string): Promise<ForexLatestPriceResult> {
  const tdSymbol = toTDSymbol(symbol);
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbol)}&apikey=REDACTED&format=JSON`;
  const realUrl = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}&format=JSON`;
  try {
    const res = await fetch(realUrl, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const safeBody = safeProviderBody(text);
    if (!res.ok) return { price: null, error: `TwelveData HTTP ${res.status}: ${safeBody}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: classifyProviderHttpStatus(res.status), url_without_token: url };
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { price: null, error: `TwelveData invalid JSON response: ${safeBody}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "provider_invalid_response", url_without_token: url };
    }
    if (data.status === "error" || data.code) {
      const msg = String(data.message ?? data.code ?? safeBody);
      return { price: null, error: `TwelveData: ${msg}`, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: classifyProviderPayload(msg), url_without_token: url };
    }
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) return { price: null, error: "TwelveData: invalid latest price", provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "provider_invalid_response", url_without_token: url };
    return { price, error: null, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: res.status, response_body: safeBody, status_class: "ok", url_without_token: url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "TwelveData latest price fetch failed";
    return { price: null, error: msg, provider: "twelvedata", mapped_symbol: tdSymbol, symbol_format: "BASE/QUOTE", http_status: null, response_body: "", status_class: classifyProviderPayload(msg), url_without_token: url };
  }
}

// ─── Finnhub ──────────────────────────────────────────────────────────────────

// Finnhub requires exchange-prefixed symbols: OANDA:EUR_USD not EURUSD.
// XAUUSD is not available on OANDA forex endpoint — skip cleanly.
const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  EURUSD: "OANDA:EUR_USD",
  GBPUSD: "OANDA:GBP_USD",
  USDJPY: "OANDA:USD_JPY",
  USDCHF: "OANDA:USD_CHF",
  USDCAD: "OANDA:USD_CAD",
  AUDUSD: "OANDA:AUD_USD",
  NZDUSD: "OANDA:NZD_USD",
  EURJPY: "OANDA:EUR_JPY",
  GBPJPY: "OANDA:GBP_JPY",
  EURGBP: "OANDA:EUR_GBP",
};

// Finnhub supported resolutions: 1, 5, 15, 30, 60, D, W, M
// 4h is not natively supported — use 60 (1h) with 4x count and resample into 4h bars.
function toFinnhubResolution(tf: string): { resolution: string; fetchCount: number; resampleTo4h: boolean } {
  switch (tf) {
    case "5m":  return { resolution: "5",  fetchCount: 120, resampleTo4h: false };
    case "15m": return { resolution: "15", fetchCount: 120, resampleTo4h: false };
    case "1h":  return { resolution: "60", fetchCount: 120, resampleTo4h: false };
    case "4h":  return { resolution: "60", fetchCount: 480, resampleTo4h: true  };
    case "1d":  return { resolution: "D",  fetchCount: 120, resampleTo4h: false };
    default:    return { resolution: "15", fetchCount: 120, resampleTo4h: false };
  }
}

function resampleTo4hCandles(candles: Candle[], symbol: string): Candle[] {
  // Group 1h candles into 4h buckets (align to 4-hour UTC boundaries)
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const ts = new Date(c.open_time).getTime();
    const bucketTs = Math.floor(ts / (4 * 3600 * 1000)) * (4 * 3600 * 1000);
    if (!buckets.has(bucketTs)) buckets.set(bucketTs, []);
    buckets.get(bucketTs)!.push(c);
  }
  const result: Candle[] = [];
  for (const [bucketTs, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (group.length === 0) continue;
    result.push({
      symbol,
      market_type: "forex",
      timeframe: "4h",
      open_time: new Date(bucketTs).toISOString(),
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
      source: "finnhub",
    });
  }
  return result;
}

interface FinnhubFetchResult {
  candles: Candle[] | null;
  error: string | null;
  mapped_symbol: string;
  finnhub_s: string | null;
  candle_count: number;
  url_without_token: string;
  http_status: number | null;
  response_body: string;
  status_class: ForexProviderStatusClass;
}

async function fetchFinnhubForexCandles(
  symbol: string, tf: string, apiKey: string,
): Promise<FinnhubFetchResult> {
  const mappedSymbol = FINNHUB_SYMBOL_MAP[symbol];
  if (!mappedSymbol) {
    return { candles: null, error: `unsupported_symbol: ${symbol} has no OANDA mapping`, mapped_symbol: symbol, finnhub_s: null, candle_count: 0, url_without_token: "", http_status: null, response_body: "", status_class: "unsupported_symbol" };
  }

  const { resolution, fetchCount, resampleTo4h } = toFinnhubResolution(tf);
  const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(mappedSymbol)}&resolution=${resolution}&count=${fetchCount}&token=REDACTED`;
  const realUrl = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(mappedSymbol)}&resolution=${resolution}&count=${fetchCount}&token=${apiKey}`;

  try {
    const res = await fetch(realUrl, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const safeBody = safeProviderBody(text);
    if (!res.ok) {
      return { candles: null, error: `Finnhub HTTP ${res.status}: ${safeBody}`, mapped_symbol: mappedSymbol, finnhub_s: null, candle_count: 0, url_without_token: url, http_status: res.status, response_body: safeBody, status_class: classifyProviderHttpStatus(res.status) };
    }

    const j = JSON.parse(text) as Record<string, unknown>;
    const s = j?.s as string | undefined;

    if (s === "no_data") {
      return { candles: null, error: `Finnhub no_data for ${mappedSymbol} ${tf} — market may be closed or symbol unavailable`, mapped_symbol: mappedSymbol, finnhub_s: "no_data", candle_count: 0, url_without_token: url, http_status: res.status, response_body: safeBody, status_class: "market_closed_or_stale" };
    }

    if (s !== "ok" || !Array.isArray(j?.c) || (j.c as number[]).length === 0) {
      const reason = s ? `Finnhub s=${s}` : "Finnhub unexpected response structure";
      return { candles: null, error: reason, mapped_symbol: mappedSymbol, finnhub_s: s ?? null, candle_count: 0, url_without_token: url, http_status: res.status, response_body: safeBody, status_class: classifyProviderPayload(reason) };
    }

    const c = j.c as number[], o = j.o as number[], h = j.h as number[], l = j.l as number[], t = j.t as number[], v = (j.v ?? []) as number[];

    let candles: Candle[] = c.map((close, idx) => ({
      symbol, market_type: "forex", timeframe: resampleTo4h ? "1h" : tf,
      open_time: new Date(t[idx] * 1000).toISOString(),
      open: Number(o[idx]), high: Number(h[idx]), low: Number(l[idx]),
      close: Number(close), volume: Number(v[idx] ?? 0), source: "finnhub",
    }));

    if (resampleTo4h) {
      candles = resampleTo4hCandles(candles, symbol);
    }

    return { candles, error: null, mapped_symbol: mappedSymbol, finnhub_s: "ok", candle_count: candles.length, url_without_token: url, http_status: res.status, response_body: safeBody, status_class: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Finnhub fetch failed";
    return { candles: null, error: msg, mapped_symbol: mappedSymbol, finnhub_s: null, candle_count: 0, url_without_token: url, http_status: null, response_body: "", status_class: classifyProviderPayload(msg) };
  }
}

// ─── MT5 Bridge ───────────────────────────────────────────────────────────────

// C2 is signal-only; MT5 bridge execution/data path is intentionally inactive.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchMT5BridgeCandles(symbol: string, tf: string, bridgeUrl: string, secret: string, limit = 110): Promise<{ candles: Candle[] | null; error: string | null }> {
  try {
    const res = await fetch(`${bridgeUrl}/candles?symbol=${symbol}&timeframe=${tf}&limit=${limit}`, { headers: { "x-bridge-secret": secret }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { candles: null, error: `MT5Bridge HTTP ${res.status}` };
    const data = await res.json() as Record<string, unknown>;
    const raw = data.candles as Array<Record<string, unknown>>;
    if (!Array.isArray(raw) || raw.length === 0) return { candles: null, error: "MT5Bridge: no candles" };
    return { candles: raw.map((c) => ({ symbol, market_type: "forex", timeframe: tf, open_time: c.open_time as string, open: c.open as number, high: c.high as number, low: c.low as number, close: c.close as number, volume: (c.volume as number) ?? 0, source: "mt5_bridge" })), error: null };
  } catch (e) { return { candles: null, error: e instanceof Error ? e.message : "MT5Bridge unreachable" }; }
}

// ─── Forex provider router ────────────────────────────────────────────────────

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

function envBool(name: string, defaultValue: boolean): boolean {
  return parseBooleanEnv(Deno.env.get(name) ?? undefined, defaultValue);
}

function signalMarketMode(cryptoEnabled: boolean, forexEnabled: boolean): string {
  if (cryptoEnabled && !forexEnabled) return "crypto_only";
  if (!cryptoEnabled && forexEnabled) return "forex_only";
  if (cryptoEnabled && forexEnabled) return "crypto_and_forex";
  return "disabled";
}

function forexDisabledSummary() {
  return {
    provider: "forex",
    fallbacks: [] as string[],
    demo_fallback: false,
    effective_provider_order: [] as string[],
    forex_provider_ignored: Deno.env.get("FOREX_DATA_PROVIDER") ?? C2_FOREX_PROVIDER,
    forex_fallbacks_ignored: Deno.env.get("FOREX_PROVIDER_FALLBACKS") ?? "",
    forex_demo_fallback_ignored: Deno.env.get("FOREX_DEMO_FALLBACK") ?? "",
  };
}

// C2 uses a single provider path with no fallback chain.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseProviderFallbacks(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "none" || normalized === "false") return [];
  return normalized.split(",").map((v) => v.trim()).filter(Boolean);
}

interface ForexScanThrottleState {
  minIntervalMinutes: number;
  lastForexScanAt: string | null;
  nextAllowedForexScanAt: string | null;
  rateLimited: boolean;
  reason: string;
}

interface ForexScanBudgetState {
  maxProviderCalls: number;
  maxPairs: number;
  maxTimeframes: number;
  plannedProviderCalls: number;
  plannedPairs: number;
  plannedTimeframes: number;
  allowedPairs: Set<string>;
  allowedSymbols: Set<string>;
  allowedTimeframes: string[];
  budgetLimited: boolean;
}

async function getForexThrottleState(
  supabase: ReturnType<typeof createClient>,
  currentRunId: string,
  forceForexScan: boolean,
): Promise<ForexScanThrottleState> {
  const minIntervalMinutes = intEnv("FOREX_SCAN_MIN_INTERVAL_MINUTES", 60, 1);
  const { data, error } = await supabase
    .from("scanner_runs")
    .select("id,started_at,finished_at,forex_symbols_scanned")
    .gt("forex_symbols_scanned", 0)
    .neq("id", currentRunId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { minIntervalMinutes, lastForexScanAt: null, nextAllowedForexScanAt: null, rateLimited: false, reason: `forex_throttle_lookup_failed: ${error.message}` };
  }

  const lastForexScanAt = typeof data?.finished_at === "string" ? data.finished_at : typeof data?.started_at === "string" ? data.started_at : null;
  if (!lastForexScanAt) return { minIntervalMinutes, lastForexScanAt: null, nextAllowedForexScanAt: null, rateLimited: false, reason: "" };

  const nextAllowedMs = new Date(lastForexScanAt).getTime() + minIntervalMinutes * 60_000;
  const nextAllowedForexScanAt = new Date(nextAllowedMs).toISOString();
  const rateLimited = !forceForexScan && Date.now() < nextAllowedMs;
  return {
    minIntervalMinutes,
    lastForexScanAt,
    nextAllowedForexScanAt,
    rateLimited,
    reason: rateLimited ? "forex_skipped_rate_limit" : "",
  };
}

function buildForexScanBudget(symbols: Array<Record<string, unknown>>, timeframes: string[], runType: "manual" | "scheduled"): ForexScanBudgetState {
  const scheduled = runType === "scheduled";
  const defaultMaxPairs = scheduled ? 3 : 6;
  const defaultMaxTimeframes = scheduled ? 2 : 2;
  const maxPairs = intEnv(scheduled ? "FOREX_MAX_PAIRS_PER_SCHEDULED_SCAN" : "FOREX_MAX_PAIRS_PER_MANUAL_SCAN", defaultMaxPairs, 1);
  const maxTimeframes = intEnv(scheduled ? "FOREX_MAX_TIMEFRAMES_PER_SCHEDULED_SCAN" : "FOREX_MAX_TIMEFRAMES_PER_MANUAL_SCAN", defaultMaxTimeframes, 1);
  const defaultMaxCalls = scheduled ? 6 : Math.max(6, maxPairs * Math.min(maxTimeframes, timeframes.length));
  const maxProviderCalls = intEnv(scheduled ? "FOREX_MAX_PROVIDER_CALLS_PER_SCHEDULED_SCAN" : "FOREX_MAX_PROVIDER_CALLS_PER_MANUAL_SCAN", intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCAN", defaultMaxCalls, 1), 1);
  const forexSymbols = symbols
    .filter((sym) => String(sym.market_type ?? "").toLowerCase() === "forex")
    .map((sym) => normalizeSymbol(String(sym.symbol ?? "")))
    .filter((symbol) => C2_FOREX_SYMBOLS.has(symbol));
  const uniqueSymbols = [...new Set(forexSymbols)];
  const limitedSymbols = uniqueSymbols.slice(0, maxPairs);
  const limitedTimeframes = timeframes.slice(0, maxTimeframes);
  const plannedProviderCalls = uniqueSymbols.length * timeframes.length;
  const allowedPairs = new Set<string>();
  for (const symbol of limitedSymbols) {
    for (const tf of limitedTimeframes) {
      if (allowedPairs.size >= maxProviderCalls) break;
      allowedPairs.add(`${symbol}|${tf}`);
    }
  }
  return {
    maxProviderCalls, maxPairs, maxTimeframes, plannedProviderCalls,
    plannedPairs: uniqueSymbols.length, plannedTimeframes: timeframes.length,
    allowedPairs, allowedSymbols: new Set(limitedSymbols), allowedTimeframes: limitedTimeframes,
    budgetLimited: plannedProviderCalls > allowedPairs.size,
  };
}

async function fetchForexCandles(
  symbol: string, tf: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass }> {
  const configuredProvider = (Deno.env.get("FOREX_DATA_PROVIDER") ?? C2_FOREX_PROVIDER).trim().toLowerCase();
  const now = new Date().toISOString();

  if (configuredProvider === "off") {
    const msg = "FOREX_DATA_PROVIDER=off";
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "off",
      last_error_at: now, error_message: msg, data_source_label: "OFF", updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: msg, statusClass: "provider_error" };
  }

  // C2 intentionally uses one real provider path only: TwelveData forex candles.
  // Demo, MT5 bridge, broker feeds, and fallback chains are ignored here so forex
  // cannot silently produce fake or Telegram-eligible provider-fallback signals.
  if (configuredProvider !== C2_FOREX_PROVIDER) {
    const msg = `C2 forex signal mode uses ${C2_FOREX_PROVIDER} only; configured provider '${configuredProvider}' ignored`;
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "error",
      last_error_at: now, error_message: msg, data_source_label: "PROVIDER_ERROR", updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: msg, statusClass: "provider_error" };
  }

  if (!C2_FOREX_TIMEFRAMES.has(tf)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_timeframe: ${tf}`, statusClass: "unsupported_timeframe" };
  }

  const normalized = normalizeSymbol(symbol);
  if (!C2_FOREX_SYMBOLS.has(normalized)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_symbol: ${symbol}`, statusClass: "unsupported_symbol" };
  }

  const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  if (!key) {
    const msg = "TWELVEDATA_API_KEY or FOREX_DATA_API_KEY not set";
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "error",
      last_error_at: now, error_message: msg, data_source_label: "PROVIDER_ERROR", updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: msg, statusClass: "provider_error" };
  }

  const result = await fetchTwelveDataCandles(normalized, tf, key);
  if (!result.error && result.candles && result.candles.length >= 55) {
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "active",
      last_success_at: now, error_message: "", data_source_label: "REAL DATA",
      last_candles_count: result.candles.length, updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: result.candles, source: C2_FOREX_PROVIDER, data_source: "REAL DATA", providerError: null, statusClass: "ok" };
  }

  const msg = result.error ?? `insufficient_candles: ${result.candle_count}`;
  const statusClass = result.error ? result.status_class : "insufficient_candles";
  await supabase.from("provider_status").upsert({
    provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "error",
    last_error_at: now,
    error_message: `${normalized} ${tf}: ${statusClass}: ${msg} (mapped: ${result.mapped_symbol}, http: ${result.http_status ?? "n/a"})`,
    data_source_label: "PROVIDER_ERROR", last_candles_count: result.candle_count, updated_at: now,
  }, { onConflict: "provider_name" });
  return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `${statusClass}: ${msg}`, statusClass };
}

async function fetchForexLatestPrice(symbol: string): Promise<ForexLatestPriceResult> {
  const normalized = normalizeSymbol(symbol);
  const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  if (!C2_FOREX_SYMBOLS.has(normalized)) {
    return { price: null, error: `unsupported_symbol: ${symbol}`, provider: C2_FOREX_PROVIDER, mapped_symbol: normalized, symbol_format: "EURUSD", http_status: null, response_body: "", status_class: "unsupported_symbol", url_without_token: "" };
  }
  if (!key) {
    return { price: null, error: "TWELVEDATA_API_KEY or FOREX_DATA_API_KEY not set", provider: C2_FOREX_PROVIDER, mapped_symbol: toTDSymbol(normalized), symbol_format: "BASE/QUOTE", http_status: null, response_body: "", status_class: "unauthorized_401", url_without_token: "" };
  }
  return fetchTwelveDataLatestPrice(normalized, key);
}

// ─── Telegram formatter ───────────────────────────────────────────────────────


function titleCaseMode(value: unknown): string {
  return String(value ?? "signal_mode")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatRiskGuidanceLines(signal: Record<string, unknown>): string[] {
  const riskPct = Number(signal.recommended_risk_pct);
  const levMin = Number(signal.suggested_leverage_min);
  const levMax = Number(signal.suggested_leverage_max);
  const cap = Number(signal.leverage_cap);
  if (!Number.isFinite(riskPct) || !Number.isFinite(levMin) || !Number.isFinite(levMax)) return [];
  const marketType = String(signal.market_type ?? "").toLowerCase();
  const leverageLabel = marketType === "forex" ? "Suggested Effective Exposure" : "Suggested Leverage";
  const warning = marketType === "forex"
    ? "Signal only. Manage lot size, spread, slippage, and risk. Not financial advice."
    : String(signal.risk_warning || "Signal only. Manage risk. Not financial advice.");
  return [
    `*Risk Guidance:*`,
    `• Capital Mode: ${titleCaseMode(signal.capital_mode ?? signal.mode_slug ?? "signal_mode")}`,
    `• Risk Profile: ${titleCaseMode(signal.risk_profile ?? "balanced")}`,
    `• Suggested Risk: ${riskPct.toFixed(2)}% of account`,
    `• ${leverageLabel}: ${levMin.toFixed(0)}x–${levMax.toFixed(0)}x`,
    Number.isFinite(cap) ? `• Max ${marketType === "forex" ? "Exposure" : "Leverage"} Cap: ${cap.toFixed(0)}x` : null,
    signal.strategy_specific_warning ? `• Note: ${signal.strategy_specific_warning}` : null,
    `• Warning: ${warning}`,
  ].filter(Boolean) as string[];
}

function asScoreBreakdown(signal: Record<string, unknown>): Record<string, unknown> {
  const raw = signal.score_breakdown ?? signal.risk_profile_snapshot;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (record.score_breakdown && typeof record.score_breakdown === "object") return record.score_breakdown as Record<string, unknown>;
    return record;
  }
  return {};
}

function forexPriceForMessage(symbol: string, value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num.toFixed(forexPrecision(symbol)) : "N/A";
}

function formatMaybePips(value: unknown): string | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? `${num.toFixed(1)} pips` : null;
}

function formatForexSignalMessage(signal: Record<string, unknown>, dataSource: string): string {
  const symbol = normalizeSymbol(String(signal.symbol ?? ""));
  const grade = String(signal.grade ?? "");
  const gradeEmoji = grade === "A+" ? "⭐⭐⭐" : grade === "A" ? "⭐⭐" : "⭐";
  const dir = String(signal.direction ?? "").toLowerCase() === "buy" ? "BUY" : "SELL";
  const dirEmoji = dir === "BUY" ? "🟢 BUY" : "🔴 SELL";
  const entryRange = signal.entry_low && signal.entry_high
    ? `${forexPriceForMessage(symbol, signal.entry_low)} – ${forexPriceForMessage(symbol, signal.entry_high)}`
    : forexPriceForMessage(symbol, signal.entry_high ?? signal.entry_low);
  const breakdown = asScoreBreakdown(signal);
  const session = String(breakdown.session_context ?? "Unknown");
  const slPips = formatMaybePips(breakdown.stop_distance_pips);
  const tp1Pips = formatMaybePips(breakdown.tp1_distance_pips);
  const tp2Pips = formatMaybePips(breakdown.tp2_distance_pips);
  const strategy = String(signal.strategy_name ?? "");
  const dataLabel = dataSource === "REAL DATA" ? "✅ REAL DATA" : "⚠️ PROVIDER UNVERIFIED — DO NOT SEND";
  const reasoning = strategy === "ForexSwingContinuation"
    ? "Trend continuation: EMA alignment + pullback reclaim + momentum confirmation."
    : "Forex scalper: short-term momentum + candle body confirmation + ATR volatility sanity.";
  const reclaim = typeof breakdown.reclaim_confirmed === "boolean" ? `, reclaim=${breakdown.reclaim_confirmed ? "yes" : "no"}` : "";
  return [
    `🌐 *HASHIBOT FOREX ${grade === "A+" ? "A+ " : ""}SIGNAL* ${gradeEmoji}`,
    ``,
    `*Pair:* ${symbol}`,
    `*Market:* FOREX`,
    `*Timeframe:* ${signal.timeframe}`,
    `*Direction:* ${dirEmoji}`,
    `*Strategy:* ${strategy}`,
    `*Session:* ${session}`,
    `*Confidence:* ${signal.confidence_score}%`,
    `*Data:* ${dataLabel}`,
    ``,
    `*Trade Plan:*`,
    `• Entry Zone: ${entryRange}`,
    `• Stop Loss: ${forexPriceForMessage(symbol, signal.stop_loss)}${slPips ? ` (${slPips})` : ""}`,
    `• TP1: ${forexPriceForMessage(symbol, signal.tp1)}${tp1Pips ? ` (${tp1Pips})` : ""}`,
    `• TP2: ${forexPriceForMessage(symbol, signal.tp2)}${tp2Pips ? ` (${tp2Pips})` : ""}`,
    `• Risk/Reward: ${Number(signal.risk_reward).toFixed(2)}R`,
    ``,
    `*Forex Reasoning:*`,
    `• ${reasoning}`,
    `• Scores: trend=${breakdown.trend_score ?? "n/a"}, momentum=${breakdown.momentum_score ?? "n/a"}, volatility=${breakdown.volatility_score ?? "n/a"}${breakdown.pullback_score !== undefined ? `, pullback=${breakdown.pullback_score}${reclaim}` : ""}, RR=${Number(signal.risk_reward).toFixed(2)}R.`,
    `• ${signal.reason}`,
    ``,
    ...formatRiskGuidanceLines(signal),
    ``,
    `*Timestamp:* ${new Date().toISOString()}`,
    ``,
    `_Signal only. Manage lot size, spread, slippage, and risk. Not financial advice._`,
    `_HashiBot Trading Intelligence_`,
  ].join("\n");
}

function formatSignalMessage(signal: Record<string, unknown>, dataSource: string): string {
  if (String(signal.market_type ?? "").toLowerCase() === "forex") return formatForexSignalMessage(signal, dataSource);
  const grade = String(signal.grade ?? "");
  const gradeEmoji = grade === "A+" ? "⭐⭐⭐" : grade === "A" ? "⭐⭐" : "⭐";
  const dirEmoji = signal.direction === "buy" ? "🟢 BUY" : "🔴 SELL";
  const entryRange = signal.entry_low && signal.entry_high
    ? `${Number(signal.entry_low).toFixed(5)} – ${Number(signal.entry_high).toFixed(5)}`
    : String(signal.entry_high ?? "N/A");
  const dataLabel = dataSource === "REAL DATA" ? "✅ REAL DATA" : "⚠️ PROVIDER UNVERIFIED — DO NOT SEND";
  return [
    `🤖 *HASHIBOT ${grade} SIGNAL* ${gradeEmoji}`,
    ``,
    `*Symbol:* ${signal.symbol}`,
    `*Market:* ${String(signal.market_type ?? "").toUpperCase()}`,
    `*Timeframe:* ${signal.timeframe}`,
    `*Direction:* ${dirEmoji}`,
    `*Entry:* ${entryRange}`,
    `*Stop Loss:* ${Number(signal.stop_loss).toFixed(5)}`,
    `*TP1:* ${Number(signal.tp1).toFixed(5)}`,
    `*TP2:* ${Number(signal.tp2).toFixed(5)}`,
    `*Risk/Reward:* ${Number(signal.risk_reward).toFixed(2)}R`,
    `*Strategy:* ${signal.strategy_name}`,
    `*Regime:* ${signal.regime}`,
    `*Confidence:* ${signal.confidence_score}%`,
    `*Data:* ${dataLabel}`,
    `*Reason:* ${signal.reason}`,
    ``,
    ...formatRiskGuidanceLines(signal),
    ``,
    `*Timestamp:* ${new Date().toISOString()}`,
    ``,
    `_Signal Mode only. Not financial advice._`,
    `_HashiBot Trading Intelligence_`,
  ].join("\n");
}

// ─── Auto Telegram send ───────────────────────────────────────────────────────

interface AutoTelegramResult {
  sent: boolean;
  status: "sent" | "skipped" | "failed";
  blocked_reason: string;
  delivery_id?: string;
}

function hasFiniteNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

async function insertTelegramDelivery(
  supabase: ReturnType<typeof createClient>,
  signalId: string,
  deliveryType: string,
  chatId: string,
  status: "sent" | "skipped" | "failed",
  errorMessage: string,
  telegramMessageId = "",
): Promise<string | undefined> {
  const { data } = await supabase.from("telegram_deliveries").insert({
    signal_id: signalId,
    delivery_type: deliveryType,
    chat_id: chatId,
    status,
    telegram_message_id: telegramMessageId,
    error_message: errorMessage,
  }).select("id").maybeSingle();
  return data?.id as string | undefined;
}

async function tryAutoSendTelegram(
  supabase: ReturnType<typeof createClient>,
  signalId: string,
  signalRecord: Record<string, unknown>,
  dataSource: string,
  config: ScannerConfig,
): Promise<AutoTelegramResult> {
  const deliveryType = "auto_signal";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";
  const fail = async (status: "skipped" | "failed", reason: string, chat = chatId || "auto") => {
    const deliveryId = await insertTelegramDelivery(supabase, signalId, deliveryType, chat, status, reason);
    return { sent: false, status, blocked_reason: reason, delivery_id: deliveryId };
  };

  if (!envBool("TELEGRAM_ENABLED", false)) return fail("skipped", "telegram_disabled_env");
  if (!envBool("ENABLE_SIGNAL_MODE_OUTPUT", false)) return fail("skipped", "signal_mode_output_disabled");
  if (!config.auto_send_telegram) return fail("skipped", "auto_send_disabled");
  const marketType = String(signalRecord.market_type ?? "").toLowerCase();
  if (marketType === "crypto" && !config.signal_enable_crypto) return fail("skipped", "crypto_disabled");
  if (marketType === "forex" && !config.signal_enable_forex) return fail("skipped", "forex_disabled_for_mvp");
  if (!["crypto", "forex"].includes(marketType)) return fail("skipped", "unsupported_market_type");
  if (marketType === "forex" && !envBool("SIGNAL_ENABLE_FOREX", false)) return fail("skipped", "forex_env_disabled");
  if (dataSource !== "REAL DATA" || signalRecord.data_source !== "REAL DATA") return fail("skipped", "not_real_data");

  const arb = signalRecord.arbitrator_decision as Record<string, unknown> | null;
  if (arb && arb.final_decision !== "approved") return fail("skipped", `not_final_approved:${String(arb.final_decision ?? "unknown")}`);

  const status = String(signalRecord.status ?? "");
  if (!["waiting", "active", "new", "approved"].includes(status)) return fail("skipped", `status_not_sendable:${status}`);

  const minGrade = config.min_auto_send_grade || config.min_signal_grade || "A";
  if (gradeIndex(String(signalRecord.grade ?? "")) < gradeIndex(minGrade)) return fail("skipped", "grade_below_min_auto_send");

  const hasEntry = hasFiniteNumber(signalRecord.entry_low) || hasFiniteNumber(signalRecord.entry_high);
  if (!signalRecord.symbol || !signalRecord.direction || !hasEntry || !hasFiniteNumber(signalRecord.stop_loss) || !hasFiniteNumber(signalRecord.tp1)) {
    return fail("skipped", "invalid_trade_fields");
  }

  if (!botToken || !chatId) return fail("failed", !botToken ? "TELEGRAM_BOT_TOKEN missing" : "TELEGRAM_DEFAULT_CHANNEL_ID missing", chatId || "not_configured");

  const { data: existing } = await supabase
    .from("telegram_deliveries")
    .select("id")
    .eq("signal_id", signalId)
    .in("delivery_type", ["auto_signal", "signal", "initial_signal"])
    .eq("chat_id", chatId)
    .eq("status", "sent")
    .maybeSingle();
  if (existing) return { sent: false, status: "skipped", blocked_reason: "already_sent", delivery_id: existing.id as string };

  const text = formatSignalMessage(signalRecord, dataSource);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    const tgData = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (tgData.ok) {
      const deliveryId = await insertTelegramDelivery(supabase, signalId, deliveryType, chatId, "sent", "", String(tgData.result?.message_id ?? ""));
      return { sent: true, status: "sent", blocked_reason: "", delivery_id: deliveryId };
    }
    const errMsg = tgData.description ?? "Telegram API error";
    const deliveryId = await insertTelegramDelivery(supabase, signalId, deliveryType, chatId, "failed", errMsg);
    return { sent: false, status: "failed", blocked_reason: `telegram_api_error: ${errMsg}`, delivery_id: deliveryId };
  } catch (e) {
    const reason = `telegram_send_exception: ${e instanceof Error ? e.message : "unknown"}`;
    const deliveryId = await insertTelegramDelivery(supabase, signalId, deliveryType, chatId, "failed", reason);
    return { sent: false, status: "failed", blocked_reason: reason, delivery_id: deliveryId };
  }
}
// ─── Heartbeat updater ────────────────────────────────────────────────────────

async function updateHeartbeat(
  supabase: ReturnType<typeof createClient>,
  runType: string,
  scanIntervalMinutes: number,
  scheduleEnabled: boolean,
  lastFinishedAt: string,
  hasError: boolean,
) {
  const now = new Date().toISOString();
  let status = "inactive";
  if (!scheduleEnabled) {
    status = "inactive";
  } else if (hasError) {
    status = "error";
  } else {
    const minsAgo = (Date.now() - new Date(lastFinishedAt).getTime()) / 60000;
    const staleThreshold = scanIntervalMinutes * 2;
    status = minsAgo < staleThreshold ? "healthy" : "stale";
  }

  const updateFields: Record<string, unknown> = {
    heartbeat_status: status,
    heartbeat_updated_at: now,
  };
  if (runType === "scheduled") updateFields.last_scheduled_scan_at = now;
  if (runType === "manual") updateFields.last_manual_scan_at = now;

  await supabase.from("scanner_config").update(updateFields).eq("id", 1);
}

// ─── Main scanner handler (shared logic) ─────────────────────────────────────

async function runScanPipeline(
  supabase: ReturnType<typeof createClient>,
  config: ScannerConfig,
  runType: "manual" | "scheduled",
  existingRunId?: string | null,
  runSource?: string,
): Promise<Record<string, unknown>> {
  const scanStart = Date.now();

  // Load strategy configs (includes 018 distance-guard columns)
  const { data: strategyConfigs } = await supabase.from("strategy_configs").select("strategy_name,enabled,signal_style,risk_mode,min_score,min_rr,min_stop_distance_pct,min_tp1_distance_pct,min_tp2_distance_pct,max_bars_in_trade,allowed_symbols,allowed_timeframes,params");
  const getStratCfg = (name: string): StrategyConfig => {
    const cfg = (strategyConfigs ?? []).find((s: Record<string, unknown>) => s.strategy_name === name);
    const isForex = name.startsWith("Forex");
    return {
      strategy_name: name,
      enabled:               (cfg?.enabled as boolean)                      ?? true,
      signal_style:          (cfg?.signal_style as string)                  ?? (isForex ? "forex_signal" : "scalper"),
      risk_mode:             (cfg?.risk_mode as string)                     ?? (isForex ? "conservative" : "balanced"),
      min_score:             (cfg?.min_score as number)                     ?? (isForex ? 78 : 75),
      min_rr:                (cfg?.min_rr as number)                        ?? (isForex ? 1.4 : 1.2),
      min_stop_distance_pct: (cfg?.min_stop_distance_pct as number)         ?? (isForex ? 0.08 : 0.18),
      min_tp1_distance_pct:  (cfg?.min_tp1_distance_pct as number)          ?? (isForex ? 0.10 : 0.25),
      min_tp2_distance_pct:  (cfg?.min_tp2_distance_pct as number)          ?? (isForex ? 0.16 : 0.40),
      max_bars_in_trade:     (cfg?.max_bars_in_trade as number)             ?? (isForex ? 48 : 32),
      allowed_symbols:       (cfg?.allowed_symbols as string[])             ?? (isForex ? [...C2_FOREX_SYMBOLS] : []),
      allowed_timeframes:    (cfg?.allowed_timeframes as string[])          ?? (isForex ? forexTimeframes() : []),
      params:                (cfg?.params as Record<string, number>)        ?? {},
    };
  };

  // Load mode configs and risk profiles
  const { data: modeRows } = await supabase.from("mode_configs").select("*");
  const { data: riskRows } = await supabase.from("risk_profiles").select("*");
  const modes = (modeRows ?? []) as ModeConfig[];
  const riskProfiles = (riskRows ?? []) as RiskProfile[];
  const activeModes = modes.filter((m) => m.enabled || m.mode_slug === "signal_mode");

  const getRiskProfile = (slug: string): RiskProfile => {
    return riskProfiles.find((r) => r.mode_slug === slug) ?? {
      mode_slug: slug, equity_start: 1000, risk_per_trade_pct: 0, max_risk_per_trade_pct: 0,
      max_daily_loss_pct: 0, max_total_drawdown_pct: 0, max_open_positions: 0, max_open_risk_pct: 0,
      max_trades_per_day: 999, max_consecutive_losses: 999, cooldown_minutes_after_loss: 0,
      one_active_signal_per_symbol: true, correlation_guard_enabled: true,
      daily_lock_enabled: false, compounding_enabled: false, compounding_mode: "off",
      score_threshold_override: 75, min_rr_override: 1.2,
    };
  };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count: todaySignalCount } = await supabase.from("signals").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
  const { count: openPositions } = await supabase.from("signals").select("id", { count: "exact", head: true }).in("status", ["waiting", "active"]);
  const riskState: RiskState = {
    open_positions: openPositions ?? 0, trades_today: todaySignalCount ?? 0,
    consecutive_losses: 0, last_loss_at: null, daily_pnl_pct: 0, total_drawdown_pct: 0,
  };

  // Create or claim scanner run record. scheduled-market-scanner creates the
  // scheduled proof row before proxying here so every valid cron invocation is
  // visible even when this function later fails or times out.
  let runId = typeof existingRunId === "string" && existingRunId ? existingRunId : "";
  if (runId) {
    const isAutomaticClaim = runType === "scheduled";
    const claimSource = runSource ?? (isAutomaticClaim ? "pg_cron" : "admin_manual");
    const { error: claimError } = await supabase.from("scanner_runs").update({
      status: "running",
      run_type: runType,
      source: claimSource,
      triggered_by: isAutomaticClaim ? "pg_cron" : "admin",
      is_automatic: isAutomaticClaim,
      error_message: "market-scanner started from scheduled wrapper",
    }).eq("id", runId);
    if (claimError) throw new Error(`Unable to claim scanner_runs row ${runId}: ${claimError.message}`);
  } else {
    const isAutomatic = runType === "scheduled";
    const source = runSource ?? (isAutomatic ? "pg_cron" : "admin_manual");
    const triggeredBy = isAutomatic ? "pg_cron" : "admin";
    const { data: runData, error: runError } = await supabase.from("scanner_runs").insert({
      status: "running", started_at: new Date().toISOString(), run_type: runType,
      source, triggered_by: triggeredBy, is_automatic: isAutomatic,
    }).select().single();
    if (runError) throw new Error(`Unable to create scanner_runs row: ${runError.message}`);
    runId = runData?.id ?? "unknown";
  }

  let symbolsScanned = 0, candlesFetched = 0, candidatesFound = 0;
  let signalsCreated = 0, rejectedCount = 0, evaluationsCount = 0;
  let indicatorsCalc = 0, paperIntentsCreated = 0, riskBlockedCount = 0;
  let telegramSent = 0, telegramSkipped = 0, telegramFailed = 0;
  let duplicateSymbolBlocked = 0;
  const telegramSkipReasons: Record<string, number> = {};
  const telegramDeliveryIds: string[] = [];
  const errors: string[] = [];
  let binanceOk = false, binanceFailed = false;
  let forexProviderSuccess = false, forexProviderFailed = false;
  let forexProviderName = config.signal_enable_forex ? C2_FOREX_PROVIDER : "forex";
  let cryptoSymbolsScanned = 0, forexSymbolsScanned = 0, forexSkippedCount = 0;
  let forexSkippedRateLimit = false, forexBudgetLimited = false;
  let forexProviderCallsAttempted = 0, forexProviderCallsPlanned = 0, forexProviderCallLimit = 0;
  let lastForexScanAt: string | null = null, nextAllowedForexScanAt: string | null = null;
  let forexSkipReason = config.signal_enable_forex ? "" : "forex_disabled_for_mvp";
  let forexProviderCacheHits = 0;
  const forexFetchCache = new Map<string, { candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass }>();
  const forexProviderRejectionKeys = new Set<string>();
  const marketMode = signalMarketMode(config.signal_enable_crypto, config.signal_enable_forex);

  async function recordForexRejection(symbol: string, timeframe: string, reason: string, dataSource = "PROVIDER_ERROR", detail = "") {
    const normalizedReason = normalizeRejectionReason(reason, "forex");
    const key = `${symbol}|${timeframe}|${normalizedReason}`;
    if (dataSource === "PROVIDER_ERROR" && forexProviderRejectionKeys.has(key)) return;
    if (dataSource === "PROVIDER_ERROR") forexProviderRejectionKeys.add(key);
    rejectedCount++;
    await supabase.from("strategy_candidates").insert({
      scanner_run_id: runId, symbol, market_type: "forex", timeframe,
      strategy_name: "ForexProviderGate", direction: "none",
      confidence_score: 0, grade: "reject", reason: detail,
      rejection_reason: normalizedReason,
      status: "rejected", data_source: dataSource,
      score_breakdown: {
        primary_failed_gate: normalizedReason,
        provider: C2_FOREX_PROVIDER,
        provider_status_class: reason,
        provider_failure_detail: detail,
        forex_pair_type: forexPairType(symbol),
        session_context: forexSessionContext(),
      },
    });
  }

  async function fetchForexCandlesForRun(symbol: string, tf: string) {
    const normalized = normalizeSymbol(symbol);
    const cacheKey = `${normalized}|${tf}`;
    const cached = forexFetchCache.get(cacheKey);
    if (cached) {
      forexProviderCacheHits++;
      return cached;
    }
    forexProviderCallsAttempted++;
    const result = await fetchForexCandles(symbol, tf, supabase);
    forexFetchCache.set(cacheKey, result);
    return result;
  }

  const { data: symbols } = await supabase.from("symbols").select("*").eq("is_active", true);
  if (!symbols || symbols.length === 0) {
    await supabase.from("scanner_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: "No active symbols" }).eq("id", runId);
    throw new Error("No active symbols configured");
  }

  const forexTfPlan = forexTimeframePlan();
  const forexScanTimeframes = forexTfPlan.supported;
  const unsupportedForexTimeframes = forexTfPlan.unsupported;
  let forexThrottle: ForexScanThrottleState | null = null;
  let forexBudget: ForexScanBudgetState | null = null;
  if (config.signal_enable_forex) {
    const forceForexScan = false;
    forexThrottle = await getForexThrottleState(supabase, runId, forceForexScan);
    lastForexScanAt = forexThrottle.lastForexScanAt;
    nextAllowedForexScanAt = forexThrottle.nextAllowedForexScanAt;
    if (forexThrottle.reason && !forexThrottle.rateLimited) errors.push(`[WARN] ${forexThrottle.reason}`);

    forexBudget = buildForexScanBudget(symbols as Array<Record<string, unknown>>, forexScanTimeframes, runType);
    forexProviderCallsPlanned = forexBudget.plannedProviderCalls;
    forexProviderCallLimit = forexBudget.maxProviderCalls;
    forexBudgetLimited = forexBudget.budgetLimited;
    if (forexBudgetLimited) errors.push(`[WARN] forex_provider_call_budget_limited planned=${forexProviderCallsPlanned} max=${forexProviderCallLimit} max_pairs=${forexBudget.maxPairs} max_timeframes=${forexBudget.maxTimeframes}`);
    if (unsupportedForexTimeframes.length > 0) errors.push(`[WARN] unsupported_forex_timeframes skipped=${unsupportedForexTimeframes.join(",")}`);

    if (forexThrottle.rateLimited) {
      forexSkippedRateLimit = true;
      forexSkipReason = "forex_skipped_rate_limit";
      errors.push(`[SKIP] forex_skipped_rate_limit last=${lastForexScanAt ?? "unknown"} next=${nextAllowedForexScanAt ?? "unknown"} min_interval=${forexThrottle.minIntervalMinutes}`);
    }
  }

  let activeSymbolSet = new Set<string>();
  if (config.prevent_duplicate_symbol_signals) {
    const { data: activeSigs } = await supabase.from("signals").select("symbol").in("status", ["waiting", "active"]);
    activeSymbolSet = new Set((activeSigs ?? []).map((s: { symbol: string }) => s.symbol));
  }

  for (const sym of symbols) {
    // Respect effective market toggles before any provider function is called.
    if (sym.market_type === "crypto" && !config.signal_enable_crypto) continue;
    if (sym.market_type === "forex" && !config.signal_enable_forex) { forexSkippedCount++; continue; }
    if (sym.market_type === "forex" && forexSkippedRateLimit) { forexSkippedCount++; continue; }

    const normalizedSymbol = normalizeSymbol(String(sym.symbol));
    const marketType = String(sym.market_type ?? "").toLowerCase();

    if (marketType === "forex" && !C2_FOREX_SYMBOLS.has(normalizedSymbol)) {
      forexSkippedCount++;
      for (const tf of forexScanTimeframes) {
        await recordForexRejection(normalizedSymbol, tf, "unsupported_symbol", "PROVIDER_ERROR", "C2 initial forex set supports EURUSD, GBPUSD, and USDJPY only; XAUUSD is skipped until provider support is verified.");
      }
      continue;
    }

    symbolsScanned++;
    if (marketType === "crypto") cryptoSymbolsScanned++;
    if (marketType === "forex") {
      forexSymbolsScanned++;
      if (unsupportedForexTimeframes.length > 0 && (!forexBudget || forexBudget.allowedSymbols.has(normalizedSymbol))) {
        for (const unsupportedTf of unsupportedForexTimeframes) {
          await recordForexRejection(normalizedSymbol, unsupportedTf, "unsupported_timeframe", "PROVIDER_ERROR", `Unsupported TwelveData forex timeframe skipped before provider call: ${unsupportedTf}`);
        }
      }
    }
    const timeframesToScan = marketType === "forex" ? forexScanTimeframes : config.active_timeframes;
    for (const tf of timeframesToScan) {
      if (tf === "4h" && marketType === "crypto" && !["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD"].includes(sym.symbol)) continue;
      if (marketType === "forex" && forexBudget && !forexBudget.allowedPairs.has(`${normalizedSymbol}|${tf}`)) {
        forexSkippedCount++;
        await recordForexRejection(normalizedSymbol, tf, "forex_budget_limited", "PROVIDER_ERROR", `Forex provider budget skipped ${normalizedSymbol} ${tf} before TwelveData call`);
        continue;
      }

      let candles: Candle[] | null = null;
      let dataSource = "PROVIDER_ERROR";

      try {
        if (marketType === "crypto") {
          const fetched = await fetchBinanceCandles(sym.symbol, tf, 110);
          if (fetched && fetched.length >= 55) { candles = fetched; dataSource = "REAL DATA"; binanceOk = true; }
          else {
            binanceFailed = true;
            errors.push(`[SKIP] Binance failed ${sym.symbol} ${tf}`); continue;
          }
        } else {
          const result = await fetchForexCandlesForRun(sym.symbol, tf);
          candles = result.candles;
          dataSource = result.data_source;
          forexProviderName = result.source || forexProviderName;
          if (result.providerError) {
            forexProviderFailed = true;
            errors.push(`[WARN] Forex ${result.source} ${sym.symbol} ${tf}: ${result.providerError}`);
          } else {
            forexProviderSuccess = dataSource === "REAL DATA";
          }
          // If no fallback allowed and provider errored, skip this symbol/timeframe
          if (dataSource === "PROVIDER_ERROR") {
            const providerErrorText = String(result.providerError ?? "provider_failed");
            const reason = providerErrorText.startsWith("unsupported_symbol")
              ? "unsupported_symbol"
              : providerErrorText.includes("rate_limited_429")
                ? "provider_rate_limited"
                : providerErrorText.includes("provider_invalid_response")
                  ? "provider_invalid_response"
                  : providerErrorText.includes("unsupported_timeframe")
                    ? "unsupported_timeframe"
                    : providerErrorText.includes("insufficient_candles")
                      ? "insufficient_candles"
                      : "provider_data_unavailable";
            await recordForexRejection(normalizedSymbol, tf, reason, dataSource, providerErrorText);
            errors.push(`[SKIP] Forex provider error ${sym.symbol} ${tf}: ${result.providerError}`);
            continue;
          }
        }

        if (!candles || candles.length < 55) {
          if (marketType === "forex") await recordForexRejection(normalizedSymbol, tf, "insufficient_candles", dataSource, `Only ${candles?.length ?? 0} candles returned`);
          continue;
        }
        candlesFetched += candles.length;

        await supabase.from("candles").upsert(candles.map((c) => ({
          symbol: c.symbol, market_type: c.market_type, timeframe: c.timeframe,
          open_time: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume, source: c.source,
        })), { onConflict: "symbol,timeframe,open_time" });

        const ind = calculateIndicators(candles);
        indicatorsCalc++;
        const lastCandle = candles[candles.length - 1];
        await supabase.from("indicator_snapshots").upsert({
          symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, candle_time: lastCandle.open_time,
          ema20: ind.ema20, ema50: ind.ema50, atr14: ind.atr14, rsi14: ind.rsi14,
          recent_high: ind.recent_high, recent_low: ind.recent_low,
          volatility_state: ind.volatility_state, regime: ind.regime,
        }, { onConflict: "symbol,timeframe,candle_time" });

        const allEvals: Array<{ name: string; result: EvalResult; cfg: StrategyConfig }> = [];
        if (marketType === "forex") {
          const fxMsConfig = getStratCfg("ForexMicroScalper");
          const fxSwConfig = getStratCfg("ForexSwingContinuation");
          if (fxMsConfig.enabled && (fxMsConfig.allowed_timeframes.length === 0 || fxMsConfig.allowed_timeframes.includes(tf))) {
            allEvals.push({ name: "ForexMicroScalper", cfg: fxMsConfig, result: evalForexMicroScalper(candles, ind, tf, { ...fxMsConfig.params, min_score: fxMsConfig.min_score, min_rr: fxMsConfig.min_rr }) });
          }
          if (fxSwConfig.enabled && (fxSwConfig.allowed_timeframes.length === 0 || fxSwConfig.allowed_timeframes.includes(tf))) {
            allEvals.push({ name: "ForexSwingContinuation", cfg: fxSwConfig, result: evalForexSwingContinuation(candles, ind, tf, { ...fxSwConfig.params, min_score: fxSwConfig.min_score, min_rr: fxSwConfig.min_rr }) });
          }
        } else {
          const msConfig  = getStratCfg("MicroScalper");
          const cbConfig  = getStratCfg("CompressionBreakout");
          const swConfig  = getStratCfg("SwingContinuation");
          const timeframeAllowed = (cfg: StrategyConfig) => cfg.allowed_timeframes.length === 0 || cfg.allowed_timeframes.includes(tf);
          if (msConfig.enabled && timeframeAllowed(msConfig)) allEvals.push({ name: "MicroScalper",       cfg: msConfig, result: evalMicroScalper(candles, ind, tf, { ...msConfig.params, min_score: msConfig.min_score, min_rr: msConfig.min_rr, crypto_behavior_tuning: 1 }) });
          if (cbConfig.enabled && timeframeAllowed(cbConfig)) allEvals.push({ name: "CompressionBreakout", cfg: cbConfig, result: evalCompressionBreakout(candles, ind, tf, { ...cbConfig.params, min_score: cbConfig.min_score, min_rr: cbConfig.min_rr, crypto_behavior_tuning: 1 }) });
          if (swConfig.enabled && timeframeAllowed(swConfig)) allEvals.push({ name: "SwingContinuation",   cfg: swConfig, result: evalSwingContinuation(candles, ind, tf, { ...swConfig.params, min_score: swConfig.min_score, min_rr: swConfig.min_rr, crypto_behavior_tuning: 1 }) });
        }

        // ── Pre-arbitration: collect passing candidates, pick the best one ──
        // All evaluations are recorded as candidates. Among those that pass
        // distance guards, only the top-scoring one proceeds to signal creation.
        const passingEntries: EvalEntry[] = [];
        for (const ev of allEvals) {
          evaluationsCount++;
          const r = ev.result;

          const candidateRow = {
            scanner_run_id: runId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf,
            strategy_name: ev.name, direction: r.direction || "none",
            entry_low: r.entry_low || null, entry_high: r.entry_high || null,
            stop_loss: r.stop_loss || null, tp1: r.tp1 || null, tp2: r.tp2 || null,
            risk_reward: r.risk_reward || null, regime: ind.regime,
            confidence_score: r.confidence_score, grade: r.grade,
            reason: r.reason, rejection_reason: normalizeRejectionReason(r.rejection_reason, marketType),
            status: r.status, data_source: dataSource, score_breakdown: r.score_breakdown,
          };

          const { data: cData } = await supabase.from("strategy_candidates").insert(candidateRow).select("id").single();
          if (!cData) continue;

          if (r.status === "rejected") { rejectedCount++; continue; }

          // Distance guard
          const guard = checkDistanceGuards(r, ev.cfg);
          if (!guard.passed) {
            const guardedBreakdown = {
              ...(r.score_breakdown ?? {}),
              primary_failed_gate: "distance_guard_failed",
              distance_guard_reason: guard.rejection_reason,
              guard_sl_pct: parseFloat(guard.sl_pct.toFixed(4)),
              guard_tp1_pct: parseFloat(guard.tp1_pct.toFixed(4)),
              guard_tp2_pct: parseFloat(guard.tp2_pct.toFixed(4)),
              guard_rr: parseFloat(guard.rr.toFixed(3)),
            };
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: normalizeRejectionReason(guard.rejection_reason, marketType),
              score_breakdown: guardedBreakdown,
            }).eq("id", cData.id);
            rejectedCount++;
            continue;
          }

          passingEntries.push({ name: ev.name, result: r, cfg: ev.cfg, guard });
          // tag candidate id for later use
          (passingEntries[passingEntries.length - 1] as EvalEntry & { _candidateId: string })._candidateId = cData.id;
        }

        // Arbitrate: sort by score descending, winner proceeds, rest are blocked
        passingEntries.sort((a, b) => arbitrationScore(b) - arbitrationScore(a));

        for (let idx = 0; idx < passingEntries.length; idx++) {
          const ev = passingEntries[idx] as EvalEntry & { _candidateId: string };
          const r = ev.result;
          const cId = ev._candidateId;
          const isWinner = idx === 0;

          if (!isWinner) {
            // Loser in arbitration — update candidate and skip
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: "arbitration_blocked",
            }).eq("id", cId);
            rejectedCount++;
            continue;
          }

          // Winner — proceed through existing gates
          candidatesFound++;

          // Duplicate gate
          if (config.prevent_duplicate_symbol_signals && activeSymbolSet.has(sym.symbol)) {
            await supabase.from("strategy_candidates").update({ status: "rejected", rejection_reason: "duplicate_active_signal" }).eq("id", cId);
            rejectedCount++;
            duplicateSymbolBlocked++;
            continue;
          }

          // Grade gate
          if (gradeIndex(r.grade) < gradeIndex(config.min_signal_grade)) {
            await supabase.from("strategy_candidates").update({ status: "approved" }).eq("id", cId);
            continue;
          }

          if (dataSource !== "REAL DATA") continue;

          // ── Mode-aware arbitrator ─────────────────────────────────────────
          const modesToRun = marketType === "forex" ? ["signal_mode"] : (activeModes.length > 0 ? activeModes.map((m) => m.mode_slug) : ["signal_mode"]);
          let signalCreatedForThisCandidate = false;

          for (const modeSlug of modesToRun) {
            if (signalCreatedForThisCandidate) break;

            const rp = getRiskProfile(modeSlug);
            const modeConfig = modes.find((m) => m.mode_slug === modeSlug);
            const overrides = (modeConfig?.strategy_overrides as Record<string, unknown>) ?? {};
            const execPolicy = (modeConfig?.execution_policy as Record<string, unknown>) ?? {};

            const modeMinScore = (overrides.min_score as number) ?? rp.score_threshold_override ?? 75;
            const modeMinRR = rp.min_rr_override ?? 1.2;
            const riskLeverageRecommendation = buildRiskLeverageRecommendation({
              market_type: sym.market_type,
              strategy_name: ev.name,
              grade: r.grade,
              confidence_score: r.confidence_score,
              risk_reward: r.risk_reward,
              entry_low: r.entry_low,
              entry_high: r.entry_high,
              stop_loss: r.stop_loss,
            }, ev.cfg, modeConfig);

            if (r.confidence_score < modeMinScore) continue;
            if ((r.risk_reward ?? 0) < modeMinRR) continue;

            const riskCheck = runRiskCheck(rp, riskState, modeSlug);

            const arbitratorDecision: ArbitratorDecision = {
              selected_mode: modeSlug, risk_check_passed: riskCheck.passed,
              risk_rejection_reason: riskCheck.reason,
              final_decision: riskCheck.passed ? "approved" : "blocked_by_risk",
              decision_reason: riskCheck.passed ? `${ev.name} passed all ${modeSlug} checks` : riskCheck.reason,
              score_threshold_used: modeMinScore, min_rr_used: modeMinRR,
              mode_adjustments_used: Object.keys(overrides).filter((k) => k !== "allowed_strategies"),
              duplicate_blocked: false, daily_lock_state: riskCheck.daily_lock,
              cooldown_state: riskCheck.cooldown, paper_execution_intent_created: false,
            };

            if (!riskCheck.passed) {
              riskBlockedCount++;
              await supabase.from("signals").insert({
                candidate_id: cId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf,
                direction: r.direction, entry_type: "zone",
                entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss,
                tp1: r.tp1, tp2: r.tp2, risk_reward: r.risk_reward,
                strategy_name: ev.name, regime: ind.regime, grade: r.grade,
                confidence_score: r.confidence_score, reason: r.reason,
                invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`,
                status: "cancelled", source: "scanner", mode_slug: modeSlug, data_source: dataSource,
                arbitrator_decision: arbitratorDecision,
                risk_profile_snapshot: { mode_slug: modeSlug, risk_per_trade_pct: rp.risk_per_trade_pct, block_reason: riskCheck.reason, score_breakdown: r.score_breakdown },
                ...riskLeverageRecommendation,
              });
              continue;
            }

            // Create signal
            const { data: sigData } = await supabase.from("signals").insert({
              candidate_id: cId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf,
              direction: r.direction, entry_type: "zone",
              entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss,
              tp1: r.tp1, tp2: r.tp2, risk_reward: r.risk_reward,
              strategy_name: ev.name, regime: ind.regime, grade: r.grade,
              confidence_score: r.confidence_score, reason: r.reason,
              invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`,
              status: "waiting", source: "scanner", mode_slug: modeSlug, data_source: dataSource,
              arbitrator_decision: arbitratorDecision,
              risk_profile_snapshot: { mode_slug: modeSlug, equity_start: rp.equity_start, risk_per_trade_pct: rp.risk_per_trade_pct, score_breakdown: r.score_breakdown },
              ...riskLeverageRecommendation,
            }).select("*").single();

            if (!sigData) continue;
            signalsCreated++;
            signalCreatedForThisCandidate = true;
            activeSymbolSet.add(sym.symbol);
            await supabase.from("strategy_candidates").update({ status: "converted_to_signal" }).eq("id", cId);

            // Paper execution intent (Personal/Prop modes)
            const paperEnabled = execPolicy.paper_execution_enabled === true;
            if (paperEnabled && modeSlug !== "signal_mode") {
              const entryMid = ((r.entry_low ?? 0) + (r.entry_high ?? 0)) / 2;
              const intentId = await createPaperIntent(supabase, sigData.id, modeSlug, sym.symbol, r.direction, entryMid, r.stop_loss ?? 0, r.tp1 ?? 0, r.tp2 ?? 0, rp, "");
              if (intentId) {
                paperIntentsCreated++;
                await supabase.from("signals").update({ paper_execution_intent_id: intentId }).eq("id", sigData.id);
              }
            }

            // ── Auto Telegram send ──────────────────────────────────────────
            const tgResult = await tryAutoSendTelegram(
              supabase,
              sigData.id,
              sigData as Record<string, unknown>,
              dataSource,
              config,
            );
            if (tgResult.delivery_id) telegramDeliveryIds.push(tgResult.delivery_id);
            if (tgResult.sent) telegramSent++;
            else if (tgResult.status === "failed") telegramFailed++;
            else telegramSkipped++;
            if (tgResult.blocked_reason) telegramSkipReasons[tgResult.blocked_reason] = (telegramSkipReasons[tgResult.blocked_reason] ?? 0) + 1;

            break;
          }
        }
      } catch (symErr) {
        errors.push(`[ERROR] ${sym.symbol} ${tf}: ${symErr instanceof Error ? symErr.message : "unknown"}`);
      }
    }
  }

  // Provider heartbeats
  const now = new Date().toISOString();
  await supabase.from("provider_status").upsert({
    provider_name: "binance", market_type: "crypto",
    status: binanceOk ? "active" : binanceFailed ? "error" : "unknown",
    last_success_at: binanceOk ? now : undefined,
    last_error_at: binanceFailed && !binanceOk ? now : undefined,
    error_message: binanceFailed && !binanceOk ? "Binance requests failed" : "",
    data_source_label: binanceOk ? "REAL DATA" : "PROVIDER_ERROR",
    updated_at: now,
  }, { onConflict: "provider_name" });

  if (!config.signal_enable_forex) {
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex",
      status: "disabled",
      last_error_at: undefined,
      error_message: "Forex disabled; set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to enable C2 TwelveData signal mode",
      data_source_label: "DISABLED",
      updated_at: now,
    }, { onConflict: "provider_name" });
  } else {
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex",
      status: forexProviderSuccess ? "active" : forexProviderFailed ? "error" : "unknown",
      last_success_at: forexProviderSuccess ? now : undefined,
      last_error_at: forexProviderFailed ? now : undefined,
      error_message: forexProviderFailed ? errors.filter(e => e.includes("[WARN] Forex") || e.includes("[SKIP] Forex")).slice(0, 3).join(" | ") || "Forex provider errors" : "",
      data_source_label: forexProviderSuccess ? "REAL DATA" : "PROVIDER_ERROR",
      updated_at: now,
    }, { onConflict: "provider_name" });
  }

  const durationMs = Date.now() - scanStart;
  const hasError = errors.length > 0;
  const runStatus = hasError && signalsCreated === 0 && candlesFetched === 0 ? "failed" : "completed";

  await supabase.from("scanner_runs").update({
    status: runStatus,
    finished_at: new Date().toISOString(),
    symbols_scanned: symbolsScanned, candles_fetched: candlesFetched,
    candidates_found: candidatesFound, signals_created: signalsCreated,
    indicators_calculated: indicatorsCalc, strategy_evaluations_count: evaluationsCount,
    rejected_candidates_count: rejectedCount,
    errors: errors.slice(0, 20), error_message: errors.slice(0, 5).join(" | "),
    telegram_sent_count: telegramSent,
    telegram_skipped_count: telegramSkipped,
    telegram_blocked_count: telegramSkipped + telegramFailed,
    duplicate_symbol_blocked: duplicateSymbolBlocked,
  }).eq("id", runId);

  // Optional proof columns exist in some deployments. Keep the base scanner_runs
  // update above as source-of-truth and do not fail scans when these columns are absent.
  await supabase.from("scanner_runs").update({
    duration_ms: durationMs,
    telegram_failed_count: telegramFailed,
    market_mode: marketMode,
    forex_skipped_count: forexSkippedCount,
    crypto_symbols_scanned: cryptoSymbolsScanned,
    forex_symbols_scanned: forexSymbolsScanned,
    forex_skipped_rate_limit: forexSkippedRateLimit,
    forex_budget_limited: forexBudgetLimited,
    forex_provider_calls_attempted: forexProviderCallsAttempted,
    forex_provider_calls_planned: forexProviderCallsPlanned,
    forex_provider_call_limit: forexProviderCallLimit,
    last_forex_scan_at: forexSymbolsScanned > 0 ? now : lastForexScanAt,
    forex_next_allowed_scan_at: forexSymbolsScanned > 0
      ? new Date(Date.now() + (forexThrottle?.minIntervalMinutes ?? intEnv("FOREX_SCAN_MIN_INTERVAL_MINUTES", 60, 1)) * 60_000).toISOString()
      : nextAllowedForexScanAt,
  }).eq("id", runId);

  // Update heartbeat
  await updateHeartbeat(
    supabase, runType,
    config.scan_interval_minutes, config.schedule_enabled,
    now, hasError && candlesFetched === 0,
  );

  return {
    success: true, run_id: runId, run_type: runType, duration_ms: durationMs,
    market_mode: marketMode, signal_enable_crypto: config.signal_enable_crypto, signal_enable_forex: config.signal_enable_forex,
    crypto_symbols_scanned: cryptoSymbolsScanned, forex_symbols_scanned: forexSymbolsScanned, scanned_crypto_count: cryptoSymbolsScanned, scanned_forex_count: forexSymbolsScanned, forex_skipped_count: forexSkippedCount, forex_skip_reason: forexSkipReason, forex_skipped_rate_limit: forexSkippedRateLimit, forex_budget_limited: forexBudgetLimited, forex_provider_calls_attempted: forexProviderCallsAttempted, forex_provider_cache_hits: forexProviderCacheHits, forex_provider_calls_planned: forexProviderCallsPlanned, forex_provider_call_limit: forexProviderCallLimit, last_forex_scan_at: forexSymbolsScanned > 0 ? now : lastForexScanAt, forex_next_allowed_scan_at: forexSymbolsScanned > 0 ? new Date(Date.now() + (forexThrottle?.minIntervalMinutes ?? intEnv("FOREX_SCAN_MIN_INTERVAL_MINUTES", 60, 1)) * 60_000).toISOString() : nextAllowedForexScanAt, forex_provider_called: config.signal_enable_forex && forexProviderCallsAttempted > 0,
    symbols_scanned: symbolsScanned, candles_fetched: candlesFetched,
    indicators_calculated: indicatorsCalc, strategy_evaluations_count: evaluationsCount,
    candidates_found: candidatesFound, rejected_candidates_count: rejectedCount,
    signals_created: signalsCreated, paper_intents_created: paperIntentsCreated,
    risk_blocked: riskBlockedCount, telegram_sent: telegramSent, telegram_blocked: telegramSkipped + telegramFailed, telegram_skipped: telegramSkipped, telegram_failed: telegramFailed,
    telegram_skip_reasons: telegramSkipReasons, telegram_delivery_ids: telegramDeliveryIds,
    duplicate_symbol_blocked: duplicateSymbolBlocked,
    active_modes: activeModes.map((m) => m.mode_slug),
    forex_provider: forexProviderName, forex_real_data: forexProviderSuccess, forex_provider_cache_hits: forexProviderCacheHits, forex_budget: forexBudget ? { max_pairs: forexBudget.maxPairs, max_timeframes: forexBudget.maxTimeframes, allowed_pairs: forexBudget.allowedPairs.size, planned_pairs: forexBudget.plannedPairs, planned_timeframes: forexBudget.plannedTimeframes } : null,
    forex_demo_fallback_used: false,
    errors: errors.slice(0, 10),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const requestedRunType = body.run_type ?? body.run_type_override;
    const runType = requestedRunType === "scheduled" ? "scheduled" : "manual";
    if (body.debug_provider_config === true) {
      const signalEnableCryptoEnv = envBool("SIGNAL_ENABLE_CRYPTO", true);
      const signalEnableForexEnv = envBool("SIGNAL_ENABLE_FOREX", false);
      const cryptoProvider = (Deno.env.get("CRYPTO_DATA_PROVIDER") ?? "binance").trim().toLowerCase();
      const configuredProvider = (Deno.env.get("FOREX_DATA_PROVIDER") ?? C2_FOREX_PROVIDER).trim().toLowerCase();
      const effectiveOrder = signalEnableForexEnv ? [C2_FOREX_PROVIDER] : [];
      return new Response(JSON.stringify({
        success: true,
        provider: signalEnableForexEnv ? C2_FOREX_PROVIDER : "forex",
        crypto_provider: cryptoProvider,
        market_mode: signalMarketMode(signalEnableCryptoEnv, signalEnableForexEnv),
        signal_enable_crypto: signalEnableCryptoEnv,
        signal_enable_forex: signalEnableForexEnv,
        forex_disabled: !signalEnableForexEnv,
        forex_disabled_for_mvp: !signalEnableForexEnv,
        ...(signalEnableForexEnv ? { configured_provider: configuredProvider, fallbacks: [] as string[], demo_fallback: false, c2_provider_policy: "twelvedata_only_no_demo_fallback" } : forexDisabledSummary()),
        effective_provider_order: effectiveOrder,
        finnhub_api_key_set: Boolean(Deno.env.get("FINNHUB_API_KEY")),
        twelvedata_api_key_set: Boolean(Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY")),
        telegram_enabled: envBool("TELEGRAM_ENABLED", false),
        enable_signal_mode_output: envBool("ENABLE_SIGNAL_MODE_OUTPUT", false),
        telegram_bot_token_set: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN")),
        telegram_default_channel_id_set: Boolean(Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID")),
        telegram_chat_id_set: Boolean(Deno.env.get("TELEGRAM_CHAT_ID")),
        supabase_url_set: Boolean(Deno.env.get("SUPABASE_URL")),
        supabase_service_role_key_set: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
        scanner_cron_secret_set: Boolean(Deno.env.get("SCANNER_CRON_SECRET")),
        forex_symbol_map_sample: signalEnableForexEnv ? { EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY" } : null,
        forex_supported_timeframes: ["15m", "1h"],
        forex_requested_timeframes: forexTimeframePlan(),
        forex_scan_min_interval_minutes: intEnv("FOREX_SCAN_MIN_INTERVAL_MINUTES", 60, 1),
        forex_max_pairs_per_scheduled_scan: intEnv("FOREX_MAX_PAIRS_PER_SCHEDULED_SCAN", 3, 1),
        forex_max_timeframes_per_scheduled_scan: intEnv("FOREX_MAX_TIMEFRAMES_PER_SCHEDULED_SCAN", 2, 1),
        forex_max_provider_calls_per_scheduled_scan: intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCHEDULED_SCAN", intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCAN", 6, 1), 1),
        forex_max_pairs_per_manual_scan: intEnv("FOREX_MAX_PAIRS_PER_MANUAL_SCAN", 6, 1),
        forex_max_timeframes_per_manual_scan: intEnv("FOREX_MAX_TIMEFRAMES_PER_MANUAL_SCAN", 2, 1),
        forex_max_provider_calls_per_manual_scan: intEnv("FOREX_MAX_PROVIDER_CALLS_PER_MANUAL_SCAN", intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCAN", 12, 1), 1),
        finnhub_symbol_map_sample: signalEnableForexEnv ? { EURUSD: "OANDA:EUR_USD", GBPUSD: "OANDA:GBP_USD", USDJPY: "OANDA:USD_JPY" } : null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.debug_forex_provider_test === true || body.debug_forex_fetch === true) {
      if (!envBool("SIGNAL_ENABLE_FOREX", false)) {
        return new Response(JSON.stringify({ success: false, skipped: true, reason: "runtime_disabled", provider_called: false, symbols: [...C2_FOREX_SYMBOLS] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const requestedProvider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : C2_FOREX_PROVIDER;
      const testTf = typeof body.timeframe === "string" ? body.timeframe : "15m";
      const symbolsToTest = body.debug_forex_provider_test === true ? [...C2_FOREX_SYMBOLS] : [normalizeSymbol(typeof body.symbol === "string" ? body.symbol : "EURUSD")];
      const includeQuotePrice = body.include_quote_price === true;

      if (requestedProvider === "finnhub") {
        const key = Deno.env.get("FINNHUB_API_KEY") ?? "";
        if (!key) {
          return new Response(JSON.stringify({ success: false, provider: "finnhub", error: "FINNHUB_API_KEY not set", classified_status: "unauthorized_401" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const results = await Promise.all(symbolsToTest.map(async (testSymbol) => {
          const result = await fetchFinnhubForexCandles(testSymbol, testTf, key);
          const firstCandle = result.candles ? result.candles[0] : null;
          const latestCandle = result.candles ? result.candles[result.candles.length - 1] : null;
          return {
            provider: "finnhub",
            input_symbol: testSymbol,
            mapped_symbol: result.mapped_symbol,
            symbol_format_used: "OANDA:BASE_QUOTE",
            timeframe: testTf,
            url_without_token: result.url_without_token,
            http_status: result.http_status,
            response_body: result.response_body,
            finnhub_s: result.finnhub_s,
            classified_status: result.status_class,
            candle_count: result.candle_count,
            first_candle_time: firstCandle?.open_time ?? null,
            last_candle_time: latestCandle?.open_time ?? null,
            quote_latest_price: latestCandle?.close ?? null,
            error: result.error,
          };
        }));
        return new Response(JSON.stringify({ success: results.every(r => r.classified_status === "ok"), provider: "finnhub", creates_candidates: false, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
      if (!key) {
        return new Response(JSON.stringify({ success: false, provider: C2_FOREX_PROVIDER, error: "TWELVEDATA_API_KEY or FOREX_DATA_API_KEY not set", classified_status: "unauthorized_401" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const results = await Promise.all(symbolsToTest.map(async (testSymbol) => {
        const candles = await fetchTwelveDataCandles(testSymbol, testTf, key);
        const firstCandle = candles.candles ? candles.candles[0] : null;
        const latestCandle = candles.candles ? candles.candles[candles.candles.length - 1] : null;
        const quote = includeQuotePrice ? await fetchForexLatestPrice(testSymbol) : null;
        return {
          provider: C2_FOREX_PROVIDER,
          input_symbol: testSymbol,
          mapped_symbol: candles.mapped_symbol,
          symbol_format_used: candles.symbol_format,
          timeframe: testTf,
          url_without_token: candles.url_without_token,
          http_status: candles.http_status,
          response_body: candles.response_body,
          classified_status: candles.status_class,
          candle_count: candles.candle_count,
          first_candle_time: firstCandle?.open_time ?? null,
          last_candle_time: latestCandle?.open_time ?? null,
          quote_latest_price: quote?.price ?? latestCandle?.close ?? null,
          quote_http_status: quote?.http_status ?? null,
          quote_classified_status: quote?.status_class ?? (latestCandle ? "derived_from_latest_candle" : null),
          quote_error: quote?.error ?? null,
          quote_provider_called: includeQuotePrice,
          error: candles.error,
        };
      }));
      return new Response(JSON.stringify({ success: results.every(r => r.classified_status === "ok" && r.candle_count >= 55), provider: C2_FOREX_PROVIDER, creates_candidates: false, symbols_tested: symbolsToTest, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceInvocation = token === serviceRole;

    if (!isServiceInvocation) {
      if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || profile.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load scanner config
    const { data: configRow } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();
    if (!configRow?.is_enabled) {
      return new Response(JSON.stringify({ error: "Scanner disabled", reason: "is_enabled=false" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dbCryptoEnabled = configRow.scan_crypto_enabled !== false;
    const dbForexEnabled = configRow.scan_forex_enabled === true;
    const signalEnableCrypto = envBool("SIGNAL_ENABLE_CRYPTO", true) && dbCryptoEnabled;
    const signalEnableForex = envBool("SIGNAL_ENABLE_FOREX", false) && dbForexEnabled;

    const config: ScannerConfig = {
      is_enabled: configRow.is_enabled ?? true,
      demo_mode_enabled: configRow.demo_mode_enabled ?? true,
      min_signal_grade: configRow.min_signal_grade ?? "A",
      prevent_duplicate_symbol_signals: configRow.prevent_duplicate_symbol_signals ?? true,
      active_timeframes: configRow.active_timeframes ?? ["5m", "15m", "1h", "4h"],
      allow_demo_telegram_sending: configRow.allow_demo_telegram_sending ?? false,
      auto_send_telegram: configRow.auto_send_telegram ?? false,
      min_auto_send_grade: configRow.min_auto_send_grade ?? "A",
      scan_crypto_enabled: dbCryptoEnabled,
      scan_forex_enabled: dbForexEnabled,
      signal_enable_crypto: signalEnableCrypto,
      signal_enable_forex: signalEnableForex,
      scan_interval_minutes: configRow.scan_interval_minutes ?? 5,
      schedule_enabled: configRow.schedule_enabled ?? false,
    };

    if (runType === "scheduled" && !config.schedule_enabled) {
      await supabase.from("scanner_config").update({ heartbeat_status: "inactive", heartbeat_updated_at: new Date().toISOString() }).eq("id", 1);
      return new Response(JSON.stringify({ skipped: true, reason: "schedule_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const existingRunId = typeof body.scanner_run_id === "string" ? body.scanner_run_id : null;
    const runSource = typeof body.source === "string" && body.source ? body.source : undefined;
    try {
      const result = await runScanPipeline(supabase, config, runType, existingRunId, runSource);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Unknown scan pipeline error";
      if (existingRunId) {
        await supabase.from("scanner_runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: `market-scanner exception: ${message}`.slice(0, 4000),
        }).eq("id", existingRunId);
      }
      return new Response(JSON.stringify({ success: false, run_id: existingRunId, run_type: runType, error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
