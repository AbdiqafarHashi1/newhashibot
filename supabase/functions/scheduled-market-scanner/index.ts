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
  rejection_reason: string; score_breakdown: Record<string, number>;
}

interface ScannerConfig {
  is_enabled: boolean; demo_mode_enabled: boolean; min_signal_grade: string;
  prevent_duplicate_symbol_signals: boolean; active_timeframes: string[];
  allow_demo_telegram_sending: boolean; auto_send_telegram: boolean;
  min_auto_send_grade: string; scan_crypto_enabled: boolean; scan_forex_enabled: boolean;
  scan_interval_minutes: number; schedule_enabled: boolean;
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

// ─── MicroScalper ─────────────────────────────────────────────────────────────

function evalMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const rsi_buy_min = params.rsi_buy_min ?? 52, rsi_sell_max = params.rsi_sell_max ?? 48;
  const min_atr_pct = params.min_atr_pct ?? 0.05, max_atr_pct = params.max_atr_pct ?? 3.0;
  const min_body_atr = params.min_body_atr ?? 0.25, stop_atr_mult = params.stop_atr_mult ?? 1.2;
  const tp1_r = params.tp1_r ?? 0.9, tp2_r = params.tp2_r ?? 1.5;
  const min_rr = params.min_rr ?? 1.2, min_score = params.min_score ?? 75;
  const REJECTED = (r: string): EvalResult => ({ status: "rejected", direction: "", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0, confidence_score: 0, grade: "reject", reason: "", rejection_reason: r, score_breakdown: {} });
  if (!["5m", "15m"].includes(timeframe)) return REJECTED("wrong_timeframe");
  if (candles.length < 55) return REJECTED("insufficient_candles");
  if (ind.atr_pct < min_atr_pct) return REJECTED("volatility_too_low");
  if (ind.atr_pct > max_atr_pct) return REJECTED("volatility_too_high");
  if (ind.atr14 > 0 && ind.body_size / ind.atr14 < min_body_atr) return REJECTED("candle_body_too_small");
  const last = candles[candles.length - 1], prev = candles[candles.length - 2];
  const price = last.close;
  const score_breakdown: Record<string, number> = { base: 50 };
  let score = 50, direction: "buy" | "sell" | null = null;
  if (ind.ema20 > ind.ema50 && ind.rsi14 >= rsi_buy_min && last.close > ind.ema20) {
    direction = "buy";
    score_breakdown["ema_bull"] = 15; score += 15;
    if (ind.regime === "trend_up") { score_breakdown["regime_bonus"] = 10; score += 10; }
    if (ind.momentum_score > 0.2) { score_breakdown["momentum_ok"] = 8; score += 8; }
    else return REJECTED("momentum_too_weak");
    if (ind.rsi14 >= 58) { score_breakdown["rsi_strong"] = 8; score += 8; }
    else { score_breakdown["rsi_ok"] = 3; score += 3; }
    if (prev.close < ind.ema20 && last.close > ind.ema20) { score_breakdown["ema_reclaim"] = 7; score += 7; }
    if (last.close > last.open) { score_breakdown["bull_candle"] = 5; score += 5; }
    else { score_breakdown["mixed_candle"] = -3; score -= 3; }
  } else if (ind.ema20 < ind.ema50 && ind.rsi14 <= rsi_sell_max && last.close < ind.ema20) {
    direction = "sell";
    score_breakdown["ema_bear"] = 15; score += 15;
    if (ind.regime === "trend_down") { score_breakdown["regime_bonus"] = 10; score += 10; }
    if (ind.momentum_score < -0.2) { score_breakdown["momentum_ok"] = 8; score += 8; }
    else return REJECTED("momentum_too_weak");
    if (ind.rsi14 <= 42) { score_breakdown["rsi_strong"] = 8; score += 8; }
    else { score_breakdown["rsi_ok"] = 3; score += 3; }
    if (prev.close > ind.ema20 && last.close < ind.ema20) { score_breakdown["ema_reject"] = 7; score += 7; }
    if (last.close < last.open) { score_breakdown["bear_candle"] = 5; score += 5; }
    else { score_breakdown["mixed_candle"] = -3; score -= 3; }
  } else {
    if (ind.momentum_score === 0) return REJECTED("momentum_too_weak");
    return REJECTED("rsi_not_confirmed");
  }
  const atr = ind.atr14;
  const entry_low = price * 0.9998, entry_high = price * 1.0002;
  let stop_loss: number, tp1: number, tp2: number;
  if (direction === "buy") { stop_loss = price - atr * stop_atr_mult; tp1 = price + atr * tp1_r; tp2 = price + atr * tp2_r; }
  else { stop_loss = price + atr * stop_atr_mult; tp1 = price - atr * tp1_r; tp2 = price - atr * tp2_r; }
  const risk = Math.abs(price - stop_loss), reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  if (risk_reward < min_rr) return REJECTED("risk_reward_too_low");
  if (risk_reward >= 2.5) { score_breakdown["rr_excellent"] = 10; score += 10; }
  else if (risk_reward >= 1.8) { score_breakdown["rr_good"] = 5; score += 5; }
  const final_score = Math.min(Math.max(score, 0), 100);
  if (final_score < min_score) return REJECTED("score_below_min");
  const grade = final_score >= 85 ? "A+" : final_score >= 75 ? "A" : final_score >= 65 ? "B" : "reject";
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: final_score, grade, reason: `MicroScalper ${direction}: ${Object.keys(score_breakdown).filter(k => (score_breakdown[k] as number) > 0).join(", ")}`, rejection_reason: "", score_breakdown };
}

// ─── CompressionBreakout ──────────────────────────────────────────────────────

function evalCompressionBreakout(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const box_lookback = Math.floor(params.box_lookback ?? 32);
  const min_box_bars = Math.floor(params.min_box_bars ?? 20);
  const max_box_atr_range = params.max_box_atr_range ?? 2.0;
  const atr_expansion_lookback = Math.floor(params.atr_expansion_lookback ?? 48);
  const min_atr_expansion = params.min_atr_expansion ?? 1.05;
  const breakout_buffer_atr = params.breakout_buffer_atr ?? 0.10;
  const stop_atr_mult = params.stop_atr_mult ?? 1.2;
  const tp1_r = params.tp1_r ?? 1.2, tp2_r = params.tp2_r ?? 2.5;
  const min_rr = params.min_rr ?? 1.5, min_score = params.min_score ?? 78;
  const REJECTED = (r: string): EvalResult => ({ status: "rejected", direction: "", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0, confidence_score: 0, grade: "reject", reason: "", rejection_reason: r, score_breakdown: {} });
  if (!["15m", "1h"].includes(timeframe)) return REJECTED("wrong_timeframe");
  if (candles.length < Math.max(box_lookback + 5, 55)) return REJECTED("insufficient_candles");
  const last = candles[candles.length - 1], price = last.close, atr = ind.atr14;
  const boxCandles = candles.slice(-(box_lookback + 1), -1);
  if (boxCandles.length < min_box_bars) return REJECTED("no_compression_box");
  const boxHigh = Math.max(...boxCandles.map((c) => c.high));
  const boxLow = Math.min(...boxCandles.map((c) => c.low));
  const boxRange = boxHigh - boxLow;
  if (atr <= 0 || boxRange > atr * max_box_atr_range) return REJECTED("box_too_wide");
  const barsInside = boxCandles.filter((c) => c.high <= boxHigh * 1.001 && c.low >= boxLow * 0.999).length;
  if (barsInside < min_box_bars * 0.7) return REJECTED("no_compression_box");
  const buffer = atr * breakout_buffer_atr;
  const breakoutUp = last.close > boxHigh + buffer && last.close > last.open;
  const breakoutDn = last.close < boxLow - buffer && last.close < last.open;
  if (!breakoutUp && !breakoutDn) return REJECTED("no_breakout");
  const histCandles = candles.slice(-(atr_expansion_lookback + 1), -1);
  const avgRange = histCandles.length > 0 ? histCandles.reduce((s, c) => s + (c.high - c.low), 0) / histCandles.length : 0;
  const curRange = last.high - last.low;
  const expansion_ratio = avgRange > 0 ? curRange / avgRange : 1;
  if (expansion_ratio < min_atr_expansion) return REJECTED("no_atr_expansion");
  const breakoutDist = breakoutUp ? last.close - boxHigh : boxLow - last.close;
  if (breakoutDist < buffer * 0.5) return REJECTED("fakeout_risk");
  const score_breakdown: Record<string, number> = { base: 50 };
  let score = 50;
  const direction: "buy" | "sell" = breakoutUp ? "buy" : "sell";
  const compQuality = barsInside / box_lookback;
  if (compQuality > 0.8) { score_breakdown["tight_compression"] = 12; score += 12; }
  else if (compQuality > 0.6) { score_breakdown["good_compression"] = 7; score += 7; }
  else { score_breakdown["weak_compression"] = 2; score += 2; }
  if (expansion_ratio > 2.0) { score_breakdown["strong_expansion"] = 12; score += 12; }
  else if (expansion_ratio > 1.5) { score_breakdown["good_expansion"] = 8; score += 8; }
  else { score_breakdown["mild_expansion"] = 4; score += 4; }
  const breakoutUnits = breakoutDist / atr;
  if (breakoutUnits > 0.5) { score_breakdown["strong_breakout"] = 8; score += 8; }
  else { score_breakdown["weak_breakout"] = 2; score += 2; }
  if (direction === "buy" && ind.rsi14 > 55) { score_breakdown["rsi_bull"] = 6; score += 6; }
  else if (direction === "sell" && ind.rsi14 < 45) { score_breakdown["rsi_bear"] = 6; score += 6; }
  if (["compression", "ranging"].includes(ind.regime)) { score_breakdown["regime_ok"] = 5; score += 5; }
  let entry_low: number, entry_high: number, stop_loss: number, tp1: number, tp2: number;
  if (direction === "buy") {
    entry_low = boxHigh; entry_high = boxHigh + atr * 0.3;
    stop_loss = boxLow - atr * stop_atr_mult; tp1 = price + atr * tp1_r; tp2 = price + atr * tp2_r;
  } else {
    entry_low = boxLow - atr * 0.3; entry_high = boxLow;
    stop_loss = boxHigh + atr * stop_atr_mult; tp1 = price - atr * tp1_r; tp2 = price - atr * tp2_r;
  }
  const risk = Math.abs(price - stop_loss), reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  if (risk_reward < min_rr) return REJECTED("risk_reward_too_low");
  if (risk_reward >= 3.0) { score_breakdown["rr_excellent"] = 10; score += 10; }
  else if (risk_reward >= 2.0) { score_breakdown["rr_good"] = 6; score += 6; }
  const final_score = Math.min(Math.max(score, 0), 100);
  if (final_score < min_score) return REJECTED("score_below_min");
  const grade = final_score >= 85 ? "A+" : final_score >= 75 ? "A" : final_score >= 65 ? "B" : "reject";
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: final_score, grade, reason: `CompressionBreakout ${direction}: compression_quality=${compQuality.toFixed(2)}, expansion=${expansion_ratio.toFixed(2)}x`, rejection_reason: "", score_breakdown };
}

function gradeIndex(g: string): number { return g === "A+" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0; }

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

async function createPaperIntent(supabase: ReturnType<typeof createClient>, signalId: string, modeSlug: string, symbol: string, direction: string, entry_price: number, stop_loss: number, tp1: number, tp2: number, rp: RiskProfile, blockReason: string): Promise<string | null> {
  const equity = rp.equity_start > 0 ? rp.equity_start : 1000;
  const risk_pct = rp.risk_per_trade_pct;
  const risk_amount = risk_pct > 0 ? equity * (risk_pct / 100) : null;
  const stop_distance = Math.abs(entry_price - stop_loss);
  const calculated_position_size = risk_amount && stop_distance > 0 ? risk_amount / stop_distance : null;
  const { data } = await supabase.from("paper_execution_intents").insert({ signal_id: signalId, mode_slug: modeSlug, symbol, direction, entry_price, stop_loss, tp1, tp2, risk_pct, calculated_position_size, risk_amount, account_equity_snapshot: equity, execution_mode: "paper", status: blockReason ? "blocked" : "simulated", block_reason: blockReason }).select("id").single();
  return data?.id ?? null;
}

function generateDemoCandles(symbol: string, market_type: string, timeframe: string, count = 110): Candle[] {
  const seedPrices: Record<string, number> = { BTCUSDT: 67000, ETHUSDT: 3500, SOLUSDT: 155, BNBUSDT: 580, XRPUSDT: 0.52, ADAUSDT: 0.44, DOGEUSDT: 0.14, AVAXUSDT: 35, LINKUSDT: 14, POLUSDT: 0.88, EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 149.5, USDCHF: 0.905, AUDUSD: 0.655, NZDUSD: 0.605, USDCAD: 1.365, EURJPY: 162.2, GBPJPY: 189.1, XAUUSD: 2320 };
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

async function fetchBinanceCandles(symbol: string, timeframe: string, limit = 110): Promise<Candle[] | null> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const raw: unknown[][] = await res.json();
    return raw.map((k) => ({ symbol, market_type: "crypto", timeframe, open_time: new Date(k[0] as number).toISOString(), open: parseFloat(k[1] as string), high: parseFloat(k[2] as string), low: parseFloat(k[3] as string), close: parseFloat(k[4] as string), volume: parseFloat(k[5] as string), source: "binance" }));
  } catch { return null; }
}

const TD_SYMBOL_MAP: Record<string, string> = { EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF", AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY", GBPJPY: "GBP/JPY", XAUUSD: "XAU/USD" };
function toTDSymbol(s: string): string { return TD_SYMBOL_MAP[s] ?? `${s.slice(0, 3)}/${s.slice(3)}`; }
function toTDInterval(tf: string): string { return ({ "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h" } as Record<string, string>)[tf] ?? "15min"; }

async function fetchTwelveDataCandles(symbol: string, tf: string, apiKey: string, limit = 110): Promise<{ candles: Candle[] | null; error: string | null }> {
  try {
    const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(toTDSymbol(symbol))}&interval=${toTDInterval(tf)}&outputsize=${limit}&apikey=${apiKey}&format=JSON`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { candles: null, error: `TwelveData HTTP ${res.status}` };
    const data = await res.json() as Record<string, unknown>;
    if (data.status === "error" || data.code) return { candles: null, error: `TwelveData: ${String(data.message ?? data.code)}` };
    const values = data.values as Array<Record<string, string>>;
    if (!Array.isArray(values) || values.length === 0) return { candles: null, error: `TwelveData: no values for ${toTDSymbol(symbol)} ${tf}` };
    return { candles: values.reverse().map((v) => ({ symbol, market_type: "forex", timeframe: tf, open_time: new Date(v.datetime + ":00Z").toISOString(), open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: parseFloat(v.volume ?? "0"), source: "twelvedata" })), error: null };
  } catch (e) { return { candles: null, error: e instanceof Error ? e.message : "TwelveData fetch failed" }; }
}

async function fetchForexCandles(symbol: string, tf: string, limit = 110, supabase: ReturnType<typeof createClient>): Promise<{ candles: Candle[]; source: string; data_source: string; providerError: string | null }> {
  const provider = Deno.env.get("FOREX_DATA_PROVIDER") ?? "demo";
  const apiKey = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  const demoFallback = (Deno.env.get("FOREX_DEMO_FALLBACK") ?? "true") === "true";
  const DEMO = (err: string | null = null) => ({ candles: generateDemoCandles(symbol, "forex", tf, limit), source: "demo", data_source: "DEMO DATA", providerError: err });
  if (provider === "demo") return DEMO();
  if (provider === "twelvedata") {
    if (!apiKey) {
      await supabase.from("provider_status").upsert({ provider_name: "twelvedata", market_type: "forex", status: "error", last_error_at: new Date().toISOString(), error_message: "TWELVEDATA_API_KEY not configured", data_source_label: "DEMO DATA", updated_at: new Date().toISOString() }, { onConflict: "provider_name" });
      if (!demoFallback) return { candles: [], source: "twelvedata", data_source: "PROVIDER_ERROR", providerError: "key missing" };
      return DEMO("TWELVEDATA_API_KEY not configured");
    }
    const { candles, error } = await fetchTwelveDataCandles(symbol, tf, apiKey, limit);
    if (error || !candles || candles.length < 52) {
      const msg = error ?? "TwelveData: insufficient candles";
      await supabase.from("provider_status").upsert({ provider_name: "twelvedata", market_type: "forex", status: "error", last_error_at: new Date().toISOString(), error_message: `${symbol} ${tf}: ${msg}`, data_source_label: "DEMO DATA", updated_at: new Date().toISOString() }, { onConflict: "provider_name" });
      if (!demoFallback) return { candles: [], source: "twelvedata", data_source: "PROVIDER_ERROR", providerError: msg };
      return DEMO(msg);
    }
    return { candles, source: "twelvedata", data_source: "REAL DATA", providerError: null };
  }
  return DEMO(`Unknown FOREX_DATA_PROVIDER: ${provider}`);
}

function formatSignalMessage(signal: Record<string, unknown>, dataSource: string): string {
  const grade = String(signal.grade ?? "");
  const gradeEmoji = grade === "A+" ? "⭐⭐⭐" : grade === "A" ? "⭐⭐" : "⭐";
  const dirEmoji = signal.direction === "buy" ? "🟢 BUY" : "🔴 SELL";
  const entryRange = signal.entry_low && signal.entry_high ? `${Number(signal.entry_low).toFixed(5)} – ${Number(signal.entry_high).toFixed(5)}` : String(signal.entry_high ?? "N/A");
  const dataLabel = dataSource === "REAL DATA" ? "✅ REAL DATA" : "⚠️ DEMO DATA (not real)";
  return [`🤖 *HASHIBOT ${grade} SIGNAL* ${gradeEmoji}`, ``, `*Symbol:* ${signal.symbol}`, `*Market:* ${String(signal.market_type ?? "").toUpperCase()}`, `*Timeframe:* ${signal.timeframe}`, `*Direction:* ${dirEmoji}`, `*Entry:* ${entryRange}`, `*Stop Loss:* ${Number(signal.stop_loss).toFixed(5)}`, `*TP1:* ${Number(signal.tp1).toFixed(5)}`, `*TP2:* ${Number(signal.tp2).toFixed(5)}`, `*Risk/Reward:* ${Number(signal.risk_reward).toFixed(2)}R`, `*Strategy:* ${signal.strategy_name}`, `*Regime:* ${signal.regime}`, `*Confidence:* ${signal.confidence_score}%`, `*Data Source:* ${dataLabel}`, `*Reason:* ${signal.reason}`, ``, `_⚠️ Not financial advice. Past performance does not guarantee future results._`, `_HashiBot Trading Intelligence_`].join("\n");
}

async function tryAutoSendTelegram(supabase: ReturnType<typeof createClient>, signalId: string, signalRecord: Record<string, unknown>, dataSource: string, config: ScannerConfig): Promise<{ sent: boolean; blocked_reason: string }> {
  if (!config.auto_send_telegram) return { sent: false, blocked_reason: "auto_send_disabled" };
  if (gradeIndex(String(signalRecord.grade ?? "")) < gradeIndex(config.min_auto_send_grade)) return { sent: false, blocked_reason: "grade_below_min_auto_send" };
  if (dataSource === "DEMO DATA" && !config.allow_demo_telegram_sending) return { sent: false, blocked_reason: "blocked_demo_telegram" };
  if (dataSource === "PROVIDER_ERROR") return { sent: false, blocked_reason: "provider_error" };
  const { data: existing } = await supabase.from("telegram_deliveries").select("id").eq("signal_id", signalId).eq("status", "sent").maybeSingle();
  if (existing) return { sent: false, blocked_reason: "duplicate_already_sent" };
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID");
  if (!botToken || !chatId) {
    await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: "auto_signal", chat_id: chatId ?? "not_configured", status: "failed", error_message: !botToken ? "TELEGRAM_BOT_TOKEN missing" : "TELEGRAM_DEFAULT_CHANNEL_ID missing" });
    return { sent: false, blocked_reason: "telegram_not_configured" };
  }
  const text = formatSignalMessage(signalRecord, dataSource);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }), signal: AbortSignal.timeout(8000) });
    const tgData = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (tgData.ok) {
      await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: "auto_signal", chat_id: chatId, status: "sent", telegram_message_id: String(tgData.result?.message_id ?? ""), error_message: "" });
      return { sent: true, blocked_reason: "" };
    }
    const errMsg = tgData.description ?? "Telegram API error";
    await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: "auto_signal", chat_id: chatId, status: "failed", error_message: errMsg });
    return { sent: false, blocked_reason: `telegram_api_error: ${errMsg}` };
  } catch (e) { return { sent: false, blocked_reason: `telegram_exception: ${e instanceof Error ? e.message : "unknown"}` }; }
}

async function updateHeartbeat(supabase: ReturnType<typeof createClient>, runType: string, scanIntervalMinutes: number, scheduleEnabled: boolean, lastFinishedAt: string, hasError: boolean) {
  const now = new Date().toISOString();
  let status = "inactive";
  if (!scheduleEnabled) status = "inactive";
  else if (hasError) status = "error";
  else {
    const minsAgo = (Date.now() - new Date(lastFinishedAt).getTime()) / 60000;
    status = minsAgo < scanIntervalMinutes * 2 ? "healthy" : "stale";
  }
  const updateFields: Record<string, unknown> = { heartbeat_status: status, heartbeat_updated_at: now };
  if (runType === "scheduled") updateFields.last_scheduled_scan_at = now;
  if (runType === "manual") updateFields.last_manual_scan_at = now;
  await supabase.from("scanner_config").update(updateFields).eq("id", 1);
}

// ─── Main Deno.serve ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // This function is called by pg_cron with the service role key, OR by admin test button.
    // Accept both: service-role bearer (no user check needed) and admin user bearer.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // If called by cron with service role key, skip user auth
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isCronCall = token === serviceKey || token === "";

    if (!isCronCall) {
      // Validate admin user token
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || profile.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load scanner config
    const { data: configRow } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();

    if (!configRow?.is_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "scanner_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!configRow?.schedule_enabled && isCronCall) {
      return new Response(JSON.stringify({ skipped: true, reason: "schedule_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config: ScannerConfig = {
      is_enabled: configRow.is_enabled ?? true,
      demo_mode_enabled: configRow.demo_mode_enabled ?? true,
      min_signal_grade: configRow.min_signal_grade ?? "A",
      prevent_duplicate_symbol_signals: configRow.prevent_duplicate_symbol_signals ?? true,
      active_timeframes: configRow.active_timeframes ?? ["5m", "15m", "1h", "4h"],
      allow_demo_telegram_sending: configRow.allow_demo_telegram_sending ?? false,
      auto_send_telegram: configRow.auto_send_telegram ?? false,
      min_auto_send_grade: configRow.min_auto_send_grade ?? "A",
      scan_crypto_enabled: configRow.scan_crypto_enabled ?? true,
      scan_forex_enabled: configRow.scan_forex_enabled ?? true,
      scan_interval_minutes: configRow.scan_interval_minutes ?? 5,
      schedule_enabled: configRow.schedule_enabled ?? false,
    };

    // ── Inline scan pipeline (identical logic to market-scanner) ──────────────
    const scanStart = Date.now();
    const runType = isCronCall ? "scheduled" : "manual";

    const { data: strategyConfigs } = await supabase.from("strategy_configs").select("*");
    const getStratCfg = (name: string) => {
      const cfg = (strategyConfigs ?? []).find((s: Record<string, unknown>) => s.strategy_name === name);
      return { enabled: cfg?.enabled ?? true, min_score: (cfg?.min_score as number) ?? 75, min_rr: (cfg?.min_rr as number) ?? 1.2, allowed_timeframes: (cfg?.allowed_timeframes as string[]) ?? [], params: (cfg?.params as Record<string, number>) ?? {} };
    };

    const { data: modeRows } = await supabase.from("mode_configs").select("*");
    const { data: riskRows } = await supabase.from("risk_profiles").select("*");
    const modes = (modeRows ?? []) as ModeConfig[];
    const riskProfiles = (riskRows ?? []) as RiskProfile[];
    const activeModes = modes.filter((m) => m.enabled || m.mode_slug === "signal_mode");

    const getRiskProfile = (slug: string): RiskProfile => riskProfiles.find((r) => r.mode_slug === slug) ?? { mode_slug: slug, equity_start: 1000, risk_per_trade_pct: 0, max_risk_per_trade_pct: 0, max_daily_loss_pct: 0, max_total_drawdown_pct: 0, max_open_positions: 0, max_open_risk_pct: 0, max_trades_per_day: 999, max_consecutive_losses: 999, cooldown_minutes_after_loss: 0, one_active_signal_per_symbol: true, correlation_guard_enabled: true, daily_lock_enabled: false, compounding_enabled: false, compounding_mode: "off", score_threshold_override: 75, min_rr_override: 1.2 };

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: todaySignalCount } = await supabase.from("signals").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
    const { count: openPositions } = await supabase.from("signals").select("id", { count: "exact", head: true }).in("status", ["waiting", "active"]);
    const riskState: RiskState = { open_positions: openPositions ?? 0, trades_today: todaySignalCount ?? 0, consecutive_losses: 0, last_loss_at: null, daily_pnl_pct: 0, total_drawdown_pct: 0 };

    const { data: runData } = await supabase.from("scanner_runs").insert({ status: "running", started_at: new Date().toISOString(), run_type: runType }).select().single();
    const runId: string = runData?.id ?? "unknown";

    let symbolsScanned = 0, candlesFetched = 0, candidatesFound = 0, signalsCreated = 0, rejectedCount = 0, evaluationsCount = 0, indicatorsCalc = 0, paperIntentsCreated = 0, riskBlockedCount = 0, telegramSent = 0, telegramBlocked = 0;
    const errors: string[] = [];
    let binanceOk = false, binanceFailed = false, twelvedataOk = false, twelvedataFailed = false, forexDemoUsed = false;

    const { data: symbols } = await supabase.from("symbols").select("*").eq("is_active", true);
    if (!symbols || symbols.length === 0) {
      await supabase.from("scanner_runs").update({ status: "error", finished_at: new Date().toISOString(), error_message: "No active symbols" }).eq("id", runId);
      return new Response(JSON.stringify({ error: "No active symbols" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let activeSymbolSet = new Set<string>();
    if (config.prevent_duplicate_symbol_signals) {
      const { data: activeSigs } = await supabase.from("signals").select("symbol").in("status", ["waiting", "active"]);
      activeSymbolSet = new Set((activeSigs ?? []).map((s: { symbol: string }) => s.symbol));
    }

    for (const sym of symbols) {
      if (sym.market_type === "crypto" && !config.scan_crypto_enabled) continue;
      if (sym.market_type === "forex" && !config.scan_forex_enabled) continue;
      symbolsScanned++;
      for (const tf of config.active_timeframes) {
        if (tf === "4h" && sym.market_type === "crypto" && !["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD"].includes(sym.symbol)) continue;
        let candles: Candle[] | null = null;
        let dataSource = "DEMO DATA";
        try {
          if (sym.market_type === "crypto") {
            const fetched = await fetchBinanceCandles(sym.symbol, tf, 110);
            if (fetched && fetched.length >= 55) { candles = fetched; dataSource = "REAL DATA"; binanceOk = true; }
            else { binanceFailed = true; if (config.demo_mode_enabled) { candles = generateDemoCandles(sym.symbol, sym.market_type, tf, 110); dataSource = "DEMO DATA"; } else { errors.push(`[SKIP] Binance failed ${sym.symbol} ${tf}`); continue; } }
          } else {
            const result = await fetchForexCandles(sym.symbol, tf, 110, supabase);
            candles = result.candles; dataSource = result.data_source;
            if (result.source === "twelvedata") { result.providerError ? (twelvedataFailed = true) : (twelvedataOk = true); }
            if (result.data_source === "DEMO DATA") forexDemoUsed = true;
            if (dataSource === "PROVIDER_ERROR") { errors.push(`[SKIP] ${sym.symbol} ${tf}: ${result.providerError}`); continue; }
          }
          if (!candles || candles.length < 55) continue;
          candlesFetched += candles.length;
          await supabase.from("candles").upsert(candles.map((c) => ({ symbol: c.symbol, market_type: c.market_type, timeframe: c.timeframe, open_time: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, source: c.source })), { onConflict: "symbol,timeframe,open_time" });
          const ind = calculateIndicators(candles);
          indicatorsCalc++;
          const lastCandle = candles[candles.length - 1];
          await supabase.from("indicator_snapshots").upsert({ symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, candle_time: lastCandle.open_time, ema20: ind.ema20, ema50: ind.ema50, atr14: ind.atr14, rsi14: ind.rsi14, recent_high: ind.recent_high, recent_low: ind.recent_low, volatility_state: ind.volatility_state, regime: ind.regime }, { onConflict: "symbol,timeframe,candle_time" });
          const msConfig = getStratCfg("MicroScalper"), cbConfig = getStratCfg("CompressionBreakout");
          const evaluations: Array<{ name: string; result: EvalResult }> = [];
          if (msConfig.enabled) evaluations.push({ name: "MicroScalper", result: evalMicroScalper(candles, ind, tf, { ...msConfig.params, min_score: msConfig.min_score, min_rr: msConfig.min_rr }) });
          if (cbConfig.enabled) evaluations.push({ name: "CompressionBreakout", result: evalCompressionBreakout(candles, ind, tf, { ...cbConfig.params, min_score: cbConfig.min_score, min_rr: cbConfig.min_rr }) });
          for (const ev of evaluations) {
            evaluationsCount++;
            const r = ev.result;
            const { data: cData } = await supabase.from("strategy_candidates").insert({ scanner_run_id: runId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, strategy_name: ev.name, direction: r.direction || null, entry_low: r.entry_low || null, entry_high: r.entry_high || null, stop_loss: r.stop_loss || null, tp1: r.tp1 || null, tp2: r.tp2 || null, risk_reward: r.risk_reward || null, regime: ind.regime, confidence_score: r.confidence_score, grade: r.grade, reason: r.reason, rejection_reason: r.rejection_reason, status: r.status, data_source: dataSource, score_breakdown: r.score_breakdown }).select("id").single();
            if (!cData) continue;
            if (r.status === "rejected") { rejectedCount++; continue; }
            candidatesFound++;
            if (config.prevent_duplicate_symbol_signals && activeSymbolSet.has(sym.symbol)) { await supabase.from("strategy_candidates").update({ status: "rejected", rejection_reason: "duplicate_active_signal" }).eq("id", cData.id); rejectedCount++; continue; }
            if (gradeIndex(r.grade) < gradeIndex(config.min_signal_grade)) { await supabase.from("strategy_candidates").update({ status: "approved" }).eq("id", cData.id); continue; }
            if (dataSource === "DEMO DATA" && !config.demo_mode_enabled) continue;
            const modesToRun = activeModes.length > 0 ? activeModes.map((m) => m.mode_slug) : ["signal_mode"];
            let signalCreated = false;
            for (const modeSlug of modesToRun) {
              if (signalCreated) break;
              const rp = getRiskProfile(modeSlug);
              const modeConfig = modes.find((m) => m.mode_slug === modeSlug);
              const overrides = (modeConfig?.strategy_overrides as Record<string, unknown>) ?? {};
              const execPolicy = (modeConfig?.execution_policy as Record<string, unknown>) ?? {};
              const modeMinScore = (overrides.min_score as number) ?? rp.score_threshold_override ?? 75;
              const modeMinRR = rp.min_rr_override ?? 1.2;
              if (r.confidence_score < modeMinScore) continue;
              if ((r.risk_reward ?? 0) < modeMinRR) continue;
              const riskCheck = runRiskCheck(rp, riskState, modeSlug);
              const arbitratorDecision: ArbitratorDecision = { selected_mode: modeSlug, risk_check_passed: riskCheck.passed, risk_rejection_reason: riskCheck.reason, final_decision: riskCheck.passed ? "approved" : "blocked_by_risk", decision_reason: riskCheck.passed ? `${ev.name} passed all ${modeSlug} checks` : riskCheck.reason, score_threshold_used: modeMinScore, min_rr_used: modeMinRR, mode_adjustments_used: Object.keys(overrides).filter((k) => k !== "allowed_strategies"), duplicate_blocked: false, daily_lock_state: riskCheck.daily_lock, cooldown_state: riskCheck.cooldown, paper_execution_intent_created: false };
              if (!riskCheck.passed) { riskBlockedCount++; await supabase.from("signals").insert({ candidate_id: cData.id, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, direction: r.direction, entry_type: "zone", entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss, tp1: r.tp1, tp2: r.tp2, risk_reward: r.risk_reward, strategy_name: ev.name, regime: ind.regime, grade: r.grade, confidence_score: r.confidence_score, reason: r.reason, invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`, status: "cancelled", source: "scanner", mode_slug: modeSlug, data_source: dataSource, arbitrator_decision: arbitratorDecision, risk_profile_snapshot: { mode_slug: modeSlug, block_reason: riskCheck.reason } }); continue; }
              const { data: sigData } = await supabase.from("signals").insert({ candidate_id: cData.id, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, direction: r.direction, entry_type: "zone", entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss, tp1: r.tp1, tp2: r.tp2, risk_reward: r.risk_reward, strategy_name: ev.name, regime: ind.regime, grade: r.grade, confidence_score: r.confidence_score, reason: r.reason, invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`, status: "waiting", source: "scanner", mode_slug: modeSlug, data_source: dataSource, arbitrator_decision: arbitratorDecision, risk_profile_snapshot: { mode_slug: modeSlug, equity_start: rp.equity_start } }).select("*").single();
              if (!sigData) continue;
              signalsCreated++; signalCreated = true; activeSymbolSet.add(sym.symbol);
              await supabase.from("strategy_candidates").update({ status: "converted_to_signal" }).eq("id", cData.id);
              if ((execPolicy.paper_execution_enabled === true) && modeSlug !== "signal_mode") {
                const entryMid = ((r.entry_low ?? 0) + (r.entry_high ?? 0)) / 2;
                const intentId = await createPaperIntent(supabase, sigData.id, modeSlug, sym.symbol, r.direction, entryMid, r.stop_loss ?? 0, r.tp1 ?? 0, r.tp2 ?? 0, rp, "");
                if (intentId) { paperIntentsCreated++; await supabase.from("signals").update({ paper_execution_intent_id: intentId }).eq("id", sigData.id); }
              }
              const tgResult = await tryAutoSendTelegram(supabase, sigData.id, sigData as Record<string, unknown>, dataSource, config);
              if (tgResult.sent) { telegramSent++; }
              else {
                telegramBlocked++;
                if (!["auto_send_disabled", "grade_below_min_auto_send", "duplicate_already_sent"].includes(tgResult.blocked_reason)) {
                  await supabase.from("telegram_deliveries").insert({ signal_id: sigData.id, delivery_type: "auto_signal_blocked", chat_id: "auto", status: "failed", error_message: tgResult.blocked_reason });
                }
              }
              break;
            }
          }
        } catch (symErr) { errors.push(`[ERROR] ${sym.symbol} ${tf}: ${symErr instanceof Error ? symErr.message : "unknown"}`); }
      }
    }

    const now = new Date().toISOString();
    await supabase.from("provider_status").upsert({ provider_name: "binance", market_type: "crypto", status: binanceOk ? "active" : binanceFailed ? "error" : "unknown", last_success_at: binanceOk ? now : undefined, last_error_at: binanceFailed && !binanceOk ? now : undefined, error_message: binanceFailed && !binanceOk ? "Binance requests failed" : "", data_source_label: binanceOk ? "REAL DATA" : "DEMO DATA", updated_at: now }, { onConflict: "provider_name" });
    const forexProvider = Deno.env.get("FOREX_DATA_PROVIDER") ?? "demo";
    await supabase.from("provider_status").upsert({ provider_name: forexProvider === "demo" ? "demo" : forexProvider, market_type: "forex", status: twelvedataOk ? "active" : forexProvider === "demo" ? "active" : twelvedataFailed ? "error" : "unknown", last_success_at: (twelvedataOk || forexProvider === "demo") ? now : undefined, last_error_at: twelvedataFailed ? now : undefined, error_message: twelvedataFailed ? "TwelveData errors" : forexProvider === "demo" ? "Forex using demo data" : "", data_source_label: twelvedataOk ? "REAL DATA" : "DEMO DATA", updated_at: now }, { onConflict: "provider_name" });

    const hasError = errors.length > 0 && candlesFetched === 0;
    await supabase.from("scanner_runs").update({ status: hasError ? "error" : "completed", finished_at: now, symbols_scanned: symbolsScanned, candles_fetched: candlesFetched, candidates_found: candidatesFound, signals_created: signalsCreated, indicators_calculated: indicatorsCalc, strategy_evaluations_count: evaluationsCount, rejected_candidates_count: rejectedCount, errors: errors.slice(0, 20), error_message: errors.slice(0, 5).join(" | "), telegram_sent_count: telegramSent, telegram_blocked_count: telegramBlocked }).eq("id", runId);
    await updateHeartbeat(supabase, runType, config.scan_interval_minutes, config.schedule_enabled, now, hasError);

    const durationMs = Date.now() - scanStart;
    return new Response(JSON.stringify({ success: true, run_id: runId, run_type: runType, duration_ms: durationMs, symbols_scanned: symbolsScanned, candles_fetched: candlesFetched, candidates_found: candidatesFound, signals_created: signalsCreated, telegram_sent: telegramSent, telegram_blocked: telegramBlocked, paper_intents_created: paperIntentsCreated, risk_blocked: riskBlockedCount, forex_provider: forexProvider, forex_real_data: twelvedataOk, forex_demo_fallback_used: forexDemoUsed && !twelvedataOk, errors: errors.slice(0, 10) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
