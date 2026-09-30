import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { vipChatId } from "../_shared/telegram-registry.ts";
import {
  ProfessionalStrategyRegistry,
  RESEARCH_STRATEGY_CONFIG,
  StrategyDiagnostics,
  evaluateCryptoTrendPullback,
  evaluateReversalExhaustion,
  type StrategyDefinition,
  type StrategyEvaluationContext,
} from "../_shared/professional-strategies.ts";
import { FOREX_RESEARCH_STRATEGIES } from "../_shared/forex-research-strategies.ts";
import { publicSignalReference } from "../_shared/professional-telegram.ts";
import { atrRootV1, emaRootV1, rsiRootV1, INDICATOR_VERSIONS } from "../_shared/indicator-engine.ts";
import { ArbitrationDiagnostics, type ArbitrationCandidate } from "../_shared/arbitrator.ts";
import { arbitrateActiveScanner, evaluateActiveStrategies, ACTIVE_SCANNER_ARBITRATOR, ACTIVE_SCANNER_FRAMEWORK } from "../_shared/active-scanner-core.ts";
import { commitScannerDecision, scannerConfigurationVersion, scannerCycleKey, scannerSignalIdentity } from "../_shared/scanner-signal-repository.ts";
import { admitClosedRuntimeCandles, boundedScannerLimit, boundedScannerTimeframes, boundedScannerUniverse, SCANNER_HARD_LIMITS } from "../_shared/scanner-limits.ts";
import type { DeepReadonly, StrategyPlan } from "../_shared/strategy-plan.ts";
import { loadMT5Candles } from "../_shared/mt5-market-data-provider.ts";
import { pinnedClaimFromQualifiedSet, routeProductionEligibility, type EligibilityClaim, type EligibilityProduct, type RuntimeQualifiedSet } from "../_shared/trading-domain/production-eligibility-router.ts";
import { FOREX_RUNTIME_INSTRUMENTS, FOREX_RUNTIME_SYMBOLS, FOREX_STRATEGY_CONTRACTS, MT5_PROVIDER_MARKET_DATA_TIMEFRAMES, forexScannerFetchPlan, forexStrategyEligibility, forexStrategyTimeframes, isForexRuntimeSymbol, roundRuntimePrice, runtimeInstrument, runtimePipDistance } from "../_shared/forex-runtime-contracts.ts";
import { FOREX_PRODUCTION_EVALUATORS } from "../_shared/forex-production-strategies.ts";
import {
  PredictiveIntelligenceOrchestrator,
  calculateGarmanKlassVolatility,
  HMMRegimeClassifier,
  KellySizingOptimizer,
  SmartOrderRouterEngine,
} from "../_shared/predictive-intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token, x-hashibot-internal-secret, x-hashibot-correlation-id, x-hashibot-action-id, Idempotency-Key",
};


const SCANNER_DISABLE_CANDLE_PERSISTENCE = (Deno.env.get("HASHIBOT_DISABLE_CANDLE_PERSISTENCE") ?? "true").toLowerCase() !== "false";
const SCANNER_DISABLE_INDICATOR_SNAPSHOTS = (Deno.env.get("HASHIBOT_DISABLE_INDICATOR_SNAPSHOTS") ?? "true").toLowerCase() !== "false";
const SCANNER_COMPACT_LOGS = (Deno.env.get("HASHIBOT_COMPACT_SCANNER_LOGS") ?? "true").toLowerCase() !== "false";
const COMPACT_PROVIDER_LOGS = (Deno.env.get("HASHIBOT_COMPACT_PROVIDER_LOGS") ?? "true").toLowerCase() !== "false";
const COMPACT_TELEGRAM_LOGS = (Deno.env.get("HASHIBOT_COMPACT_TELEGRAM_LOGS") ?? "true").toLowerCase() !== "false";
const COMPACT_EXECUTION_LOGS = (Deno.env.get("HASHIBOT_COMPACT_EXECUTION_LOGS") ?? "true").toLowerCase() !== "false";
const COMPACT_RUNTIME_FLAGS = { COMPACT_PROVIDER_LOGS, COMPACT_TELEGRAM_LOGS, COMPACT_EXECUTION_LOGS };
const SCANNER_HARD_MAX_CRYPTO_SYMBOLS = SCANNER_HARD_LIMITS.cryptoSymbols;
const SCANNER_HARD_MAX_FOREX_SYMBOLS = SCANNER_HARD_LIMITS.forexSymbols;
const SCANNER_HARD_MAX_SYMBOLS_PER_SCAN = SCANNER_HARD_LIMITS.totalSymbols;

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
  gk_volatility?: number;
}

interface EvalResult {
  status: "candidate" | "rejected";
  direction: string; entry_low: number; entry_high: number;
  stop_loss: number; tp1: number; tp2: number; risk_reward: number;
  confidence_score: number; grade: string; reason: string;
  rejection_reason: string; score_breakdown: Record<string, number | string | boolean>;
}

type StrategyName = "MicroScalper" | "CompressionBreakout" | "SwingContinuation" | "QuickScalp" | "ForexMicroScalper" | "ForexSwingContinuation" | "ForexLondonBreakout" | "ForexNewYorkContinuation" | "ForexTrendPullback" | "GoldVolatilityBreakout";
const PROFESSIONAL_STRATEGY_IDS: Record<StrategyName, string> = {
  MicroScalper: "crypto.micro-scalper",
  QuickScalp: "crypto.quick-scalp",
  CompressionBreakout: "crypto.compression-breakout",
  SwingContinuation: "crypto.swing-continuation",
  ForexMicroScalper: "forex.micro-scalper",
  ForexSwingContinuation: "forex.swing-continuation",
  ForexLondonBreakout: "forex.london-breakout",
  ForexNewYorkContinuation: "forex.new-york-continuation",
  ForexTrendPullback: "forex.trend-pullback",
  GoldVolatilityBreakout: "gold.volatility-breakout",
};

interface StrategyEvaluationStats {
  evaluated: number;
  candidate_created: number;
  candidate_count: number;
  evaluator_pass: number;
  candidate_passed_quality: number;
  score_pass: number;
  rr_pass: number;
  distance_pass: number;
  candidate_entered_arbitration: number;
  arbitration_entered: number;
  candidate_won: number;
  arbitration_won: number;
  signal_published: number;
  signals_created: number;
  execution_started: number;
  execution_completed: number;
  duplicate_pass: number;
  accepted: number;
  rejected: number;
  rejection_count: number;
  rejection_reasons: Record<string, number>;
  arbitration_blocked: number;
  arbitration_losses: number;
  arbitration_win_pct: number;
  duplicate_active_signal: number;
  runtime_errors: number;
  skipped: number;
  skip_reasons: Record<string, number>;
}

interface ScannerConfig {
  is_enabled: boolean; demo_mode_enabled: boolean; min_signal_grade: string;
  prevent_duplicate_symbol_signals: boolean; active_timeframes: string[];
  allow_demo_telegram_sending: boolean; auto_send_telegram: boolean;
  min_auto_send_grade: string; scan_crypto_enabled: boolean; scan_forex_enabled: boolean;
  signal_enable_crypto: boolean; signal_enable_forex: boolean;
  scan_interval_minutes: number; schedule_enabled: boolean;
  max_symbols_per_scan?: number; min_24h_volume?: number; min_liquidity?: number;
  exclude_symbols?: string[]; include_symbols?: string[];
}

interface StrategyConfig {
  strategy_name: string;
  config_source: "db" | "fallback";
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
  selected_strategy?: string; arbitration_score?: number; competing_candidates?: Array<Record<string, unknown>>;
  market_intelligence?: Record<string, unknown>;
}

interface RiskState {
  open_positions: number; trades_today: number; consecutive_losses: number;
  last_loss_at: string | null; daily_pnl_pct: number; total_drawdown_pct: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number {
  return emaRootV1(values, period);
}

function calcATR(candles: Candle[], period = 14): number {
  return atrRootV1(candles, period);
}

function calcRSI(closes: number[], period = 14): number {
  return rsiRootV1(closes, period);
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
  const gk_volatility = calculateGarmanKlassVolatility(candles);
  const volatility_state = atr_pct > 3.0 || gk_volatility > 0.0018 ? "high" : atr_pct < 0.5 && gk_volatility < 0.0002 ? "low" : "normal";
  let regime = "unclear";
  if (ema20 > ema50 * 1.002 && rsi14 > 52) regime = "trend_up";
  else if (ema20 < ema50 * 0.998 && rsi14 < 48) regime = "trend_down";
  else if (range_compression_ratio < 0.55) regime = "compression";
  else if (atr_pct > 2.0 || gk_volatility > 0.0025) regime = "expansion";
  else if (rsi14 > 45 && rsi14 < 55) regime = "ranging";
  return { ema20, ema50, atr14, rsi14, recent_high, recent_low, avg_volume, body_size, atr_pct, range_compression_ratio, momentum_score, volatility_state, regime, gk_volatility };
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

function strategyRuntimeReject(strategyName: string, error: unknown): EvalResult {
  const message = error instanceof Error ? error.message : String(error ?? "unknown runtime error");
  return {
    status: "rejected", direction: "none", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0,
    risk_reward: 0, confidence_score: 0, grade: "reject", reason: `${strategyName} runtime error: ${message}`,
    rejection_reason: "runtime_error",
    score_breakdown: {
      primary_failed_gate: "runtime_error",
      runtime_error: true,
      error_message: message.slice(0, 300),
    },
  };
}


// ─── Forex-specific helpers ──────────────────────────────────────────────────

function forexPairType(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const instrument = runtimeInstrument(normalized);
  return instrument?.instrument_class === "metal_gold" ? "metal_gold" : instrument?.instrument_class === "fx_jpy" ? "fx_jpy" : instrument?.instrument_class === "fx_non_jpy" ? "fx_non_jpy" : "unknown";
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
  const half = Math.min(atr * 0.12, (runtimeInstrument(symbol)?.pip_size ?? 0) * maxPips);
  return {
    entry_low: roundRuntimePrice(symbol, price - half),
    entry_high: roundRuntimePrice(symbol, price + half),
  };
}

// ─── MicroScalper ─────────────────────────────────────────────────────────────

function directionalPressure(candles: Candle[], direction: "buy" | "sell", lookback = 3): { confirmed: boolean; aligned_count: number; pressure_score: number } {
  const slice = candles.slice(-Math.max(2, lookback));
  let aligned = 0;
  let pressure = 0;
  for (const candle of slice) {
    const range = Math.max(candle.high - candle.low, 0);
    const body = Math.abs(candle.close - candle.open);
    const directional = direction === "buy" ? candle.close > candle.open : candle.close < candle.open;
    if (directional) aligned++;
    pressure += range > 0 ? (body / range) * (directional ? 1 : -0.45) : 0;
  }
  return { confirmed: aligned >= Math.min(2, slice.length), aligned_count: aligned, pressure_score: parseFloat((pressure / Math.max(slice.length, 1)).toFixed(3)) };
}

function higherTimeframeTrendConfirmed(candles: Candle[] | undefined, direction: "buy" | "sell"): boolean {
  if (!candles || candles.length < 55 || hasInvalidCandles(candles)) return false;
  const ind = calculateIndicators(candles);
  const last = candles[candles.length - 1];
  return direction === "buy" ? ind.ema20 > ind.ema50 && last.close > ind.ema20 : ind.ema20 < ind.ema50 && last.close < ind.ema20;
}

function evalMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>, higherTimeframeCandles?: Candle[]): EvalResult {
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
  const pressure = directionalPressure(candles, direction, 3);
  const volatilityHealthy = ind.atr_pct >= min_atr_pct && ind.atr_pct <= max_atr_pct;
  const strongChop = ind.regime === "range_chop" && Math.abs(ind.momentum_score) < 0.30 && ind.range_compression_ratio > 0.78;
  const priceExtensionAtr = atr > 0 ? (direction === "buy" ? price - ind.ema20 : ind.ema20 - price) / atr : 0;
  const overextended = priceExtensionAtr > max_chase_extension_atr;
  const chaseRisk = crypto_behavior_tuning && overextended && bodyAtr < min_body_atr * 1.25 && directionalMomentum < 0.7;
  const fifteenMinuteTrendConfirmed = timeframe === "5m" ? higherTimeframeTrendConfirmed(higherTimeframeCandles, direction) : true;
  const smallBodyQualityWaiver = crypto_behavior_tuning
    && bodyAtr < min_body_atr
    && bodyAtr >= min_continuation_body_atr
    && trendConfirmed
    && fifteenMinuteTrendConfirmed
    && volatilityHealthy
    && rsiConfirmed
    && !overextended
    && !strongChop
    && pressure.confirmed
    && pressure.pressure_score >= 0.28;
  const continuationBodyConfirmed = bodyAtr >= min_body_atr || (crypto_behavior_tuning && candleConfirmed && directionalMomentum >= 0.45 && bodyAtr >= min_continuation_body_atr) || smallBodyQualityWaiver;

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
  const bodyScore = smallBodyQualityWaiver ? 65 : clampScore(Math.min(bodyAtr / Math.max(min_body_atr, 0.01), 1.25) * 80);
  let volatilityScore = 85;
  if (ind.atr_pct < min_atr_pct) volatilityScore = clampScore((ind.atr_pct / Math.max(min_atr_pct, 0.01)) * 55);
  else if (ind.atr_pct > max_atr_pct) volatilityScore = clampScore(Math.max(20, 80 - ((ind.atr_pct - max_atr_pct) / Math.max(max_atr_pct, 0.01)) * 80));
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.5) * 66);

  let primaryFailedGate = "";
  if (ind.atr_pct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (ind.atr_pct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (!continuationBodyConfirmed) primaryFailedGate = "candle_body_too_small";
  else if (timeframe === "5m" && !fifteenMinuteTrendConfirmed) primaryFailedGate = "htf_trend_not_confirmed";
  else if (!trendConfirmed || !rsiConfirmed) primaryFailedGate = "rsi_not_confirmed";
  else if (!momentumConfirmed || !pressure.confirmed || chaseRisk || strongChop) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.24) + (momentumScore * 0.22) + (rsiScore * 0.18) + (bodyScore * 0.12) + (volatilityScore * 0.12) + (rrScore * 0.12));
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const rawRejectionReason = primaryFailedGate || "passed";
  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: rawRejectionReason,
    raw_rejection_reason: rawRejectionReason,
    strategy_config_loaded: true,
    timeframe_allowed: true,
    evaluator_called: true,
    raw_evaluator_status: primaryFailedGate ? "failed" : "passed",
    score_gate: finalScore >= min_score ? "passed" : "failed",
    rr_gate: risk_reward >= min_rr ? "passed" : "failed",
    distance_guard: "pending",
    arbitration: "pending",
    duplicate_guard: "pending",
    signal_insert: "pending",
    telegram_eligibility: "pending",
    min_score,
    required_score: min_score,
    min_rr,
    stop_atr_mult,
    tp1_r,
    tp2_r,
    min_body_atr,
    required_min_body_atr: min_body_atr,
    rsi_buy_min,
    rsi_sell_max,
    rsi_threshold: direction === "buy" ? rsi_buy_min : rsi_sell_max,
    max_bars_in_trade: params.max_bars_in_trade ?? (timeframe === "5m" ? 30 : 24),
    momentum_lookback,
    min_atr_pct,
    max_atr_pct,
    crypto_behavior_tuning,
    trend_score: trendScore,
    rsi_score: rsiScore,
    momentum_score: momentumScore,
    candle_body_score: bodyScore,
    candle_body_ratio: parseFloat(bodyAtr.toFixed(3)),
    volatility_score: volatilityScore,
    rr_score: rrScore,
    direction_basis: direction === "buy" ? buyContext : sellContext,
    buy_context: buyContext,
    sell_context: sellContext,
    trend_context: `${direction}:ema20_${direction === "buy" ? (ind.ema20 > ind.ema50 ? "above" : "not_above") : (ind.ema20 < ind.ema50 ? "below" : "not_below")}_ema50:price_${direction === "buy" ? (last.close > ind.ema20 ? "above" : "not_above") : (last.close < ind.ema20 ? "below" : "not_below")}_ema20`,
    rsi: parseFloat(ind.rsi14.toFixed(2)),
    atr_pct: parseFloat(ind.atr_pct.toFixed(4)),
    body_atr: parseFloat(bodyAtr.toFixed(3)),
    continuation_body_confirmed: continuationBodyConfirmed,
    small_body_quality_waiver: smallBodyQualityWaiver,
    directional_pressure_confirmed: pressure.confirmed,
    directional_pressure_aligned_count: pressure.aligned_count,
    directional_pressure_score: pressure.pressure_score,
    fifteen_minute_trend_confirmed: fifteenMinuteTrendConfirmed,
    volatility_healthy: volatilityHealthy,
    strong_chop: strongChop,
    overextended,
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
  const min_atr_pct = params.min_atr_pct ?? (runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 0.025 : 0.018);
  const max_atr_pct = params.max_atr_pct ?? 0.32;
  const min_body_atr = params.min_body_atr ?? 0.18;
  const stop_atr_mult = Math.max(params.stop_atr_mult ?? 1.15, 1.25);
  const tp1_r = params.tp1_r ?? 1.15;
  const tp2_r = params.tp2_r ?? 1.7;
  const min_rr = params.min_rr ?? 1.25;
  const min_score = params.min_score ?? 74;
  const momentum_lookback = Math.max(2, Math.floor(params.momentum_lookback ?? 3));
  const min_stop_pips = Math.max(params.min_stop_pips ?? 0, runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 7 : 6);
  const min_tp1_pips = Math.max(params.min_tp1_pips ?? 0, runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 8 : 7);
  const min_tp2_pips = Math.max(params.min_tp2_pips ?? 0, runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 12 : 10);
  const max_entry_band_pips = params.max_entry_band_pips ?? (timeframe === "5m" ? 1.2 : 1.8);

  if (!["5m", "15m"].includes(timeframe)) return forexZeroReject("unsupported_timeframe", symbol);
  if (candles.length < 55) return forexZeroReject("insufficient_candles", symbol);
  if (hasInvalidCandles(candles)) return forexZeroReject("invalid_candles", symbol);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = last.close;
  const atr = ind.atr14;
  const pip = runtimeInstrument(symbol)?.pip_size ?? 0;
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
  const microBreakoutAligned = direction === "buy" ? price >= recentHigh - atr * 0.08 && last.close > prev.close : price <= recentLow + atr * 0.08 && last.close < prev.close;
  const trendQualityPass = trendConfirmed || (emaSpreadPips >= 0.8 && (direction === "buy" ? buyContext >= 4 : sellContext >= 4) && price > 0);
  const structureQualityPass = structureAligned || (microBreakoutAligned && bodyAtr >= min_body_atr * 0.8);
  const rsiConfirmed = direction === "buy" ? ind.rsi14 >= 48 && ind.rsi14 <= 72 : ind.rsi14 <= 52 && ind.rsi14 >= 28;
  const spikeOnly = bodyAtr > 1.25 && Math.abs(last.close - prev.close) > atr * 1.15 && Math.sign(last.close - last.open) !== Math.sign(prev.close - prev.open);

  const { entry_low, entry_high } = forexEntryBand(symbol, price, atr, max_entry_band_pips);
  const rawRisk = Math.max(atr * stop_atr_mult, pip * min_stop_pips);
  const structureStop = direction === "buy" ? Math.min(recentLow - atr * 0.12, price - rawRisk) : Math.max(recentHigh + atr * 0.12, price + rawRisk);
  const stop_loss = roundRuntimePrice(symbol, structureStop);
  const risk = Math.abs(price - stop_loss);
  const tp1 = roundRuntimePrice(symbol, direction === "buy" ? price + risk * tp1_r : price - risk * tp1_r);
  const tp2 = roundRuntimePrice(symbol, direction === "buy" ? price + risk * tp2_r : price - risk * tp2_r);
  const risk_reward = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  const stopPips = runtimePipDistance(symbol, price, stop_loss);
  const tp1Pips = runtimePipDistance(symbol, price, tp1);
  const tp2Pips = runtimePipDistance(symbol, price, tp2);

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
  else if (emaSpreadPips < 0.8 || stopPips < min_stop_pips || tp1Pips < min_tp1_pips || tp2Pips < min_tp2_pips) primaryFailedGate = "distance_guard_failed";
  else if (!trendQualityPass || !structureQualityPass) primaryFailedGate = "trend_filter_failed";
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
    trend_quality_pass: trendQualityPass,
    structure_quality_pass: structureQualityPass,
    micro_breakout_aligned: microBreakoutAligned,
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


function evalQuickScalp(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  if (!["5m", "15m"].includes(timeframe)) return strategyZeroReject("unsupported_timeframe");
  if (candles.length < 55) return strategyZeroReject("insufficient_candles");
  if (hasInvalidCandles(candles)) return strategyZeroReject("invalid_candles");
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const price = last.close;
  const atr = ind.atr14;
  if (atr <= 0 || price <= 0) return strategyZeroReject("invalid_atr_or_price");
  const minScore = params.min_score ?? 82;
  const minRr = params.min_rr ?? 1.15;
  const maxBars = params.max_bars_in_trade ?? (timeframe === "5m" ? 9 : 4);
  const stopAtr = params.stop_atr_mult ?? 0.95;
  const tp1R = params.tp1_r ?? 0.55;
  const tp2R = params.tp2_r ?? 1.15;
  const direction: "buy" | "sell" = ind.ema20 >= ind.ema50 && last.close >= prev.close ? "buy" : "sell";
  const candleOk = direction === "buy" ? last.close > last.open : last.close < last.open;
  const emaOk = direction === "buy" ? last.close > ind.ema20 && ind.ema20 >= ind.ema50 : last.close < ind.ema20 && ind.ema20 <= ind.ema50;
  const closes = candles.map((c) => c.close);
  const mom1 = calcMomentumScore(closes, 1);
  const mom3 = calcMomentumScore(closes, 3);
  const directionalMomentum = direction === "buy" ? mom3 : -mom3;
  const accelerating = direction === "buy" ? mom1 > mom3 * 0.45 : -mom1 > -mom3 * 0.45;
  const volumeExpansion = ind.avg_volume > 0 ? last.volume / ind.avg_volume : 0;
  const bodyAtr = Math.abs(last.close - last.open) / atr;
  const rangeAtr = (last.high - last.low) / atr;
  const extensionAtr = direction === "buy" ? (price - ind.ema20) / atr : (ind.ema20 - price) / atr;
  const spreadProxy = price > 0 ? ((last.high - last.low) / price) * 100 : 0;
  const entry_low = price * 0.9999, entry_high = price * 1.0001;
  const stop_loss = direction === "buy" ? price - atr * stopAtr : price + atr * stopAtr;
  const tp1 = direction === "buy" ? price + atr * tp1R : price - atr * tp1R;
  const tp2 = direction === "buy" ? price + atr * tp2R : price - atr * tp2R;
  const risk = Math.abs(price - stop_loss), reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  const volumeScore = clampScore(Math.min(volumeExpansion / 1.45, 1.25) * 80);
  const liquidityScore = clampScore(ind.avg_volume > 0 ? 82 : 35);
  const emaScore = emaOk ? 86 : 35;
  const momentumScore = clampScore(Math.max(0, directionalMomentum) * 70 + (accelerating ? 18 : 0) + (candleOk ? 12 : 0));
  const atrScore = clampScore(ind.atr_pct >= 0.12 && ind.atr_pct <= 2.5 ? 84 : ind.atr_pct < 0.12 ? 30 : 58);
  const impulseScore = clampScore(Math.min(bodyAtr / 0.45, 1.2) * 54 + Math.min(rangeAtr / 1.1, 1.2) * 26 + (extensionAtr < 1.05 ? 18 : 0));
  const finalScore = clampScore(volumeScore * 0.18 + liquidityScore * 0.12 + emaScore * 0.18 + momentumScore * 0.24 + atrScore * 0.14 + impulseScore * 0.14);
  let primaryFailedGate = "";
  if (volumeExpansion < 1.15) primaryFailedGate = "volume_expansion_failed";
  else if (!emaOk) primaryFailedGate = "ema_alignment_failed";
  else if (!candleOk || !accelerating || directionalMomentum < 0.25) primaryFailedGate = "momentum_acceleration_failed";
  else if (ind.atr_pct < 0.12) primaryFailedGate = "dead_market_rejected";
  else if (extensionAtr > 1.15) primaryFailedGate = "late_entry_overextended";
  else if (spreadProxy > 1.6) primaryFailedGate = "spread_quality_failed";
  else if (risk_reward < minRr) primaryFailedGate = "rr_too_low";
  else if (finalScore < minScore) primaryFailedGate = "confidence_too_low";
  const raw = primaryFailedGate || "passed";
  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: raw, raw_rejection_reason: raw, evaluator_called: true,
    volume_expansion_score: volumeScore, liquidity_score: liquidityScore, ema_alignment_score: emaScore,
    momentum_acceleration_score: momentumScore, atr_expansion_score: atrScore, impulse_quality_score: impulseScore,
    spread_quality_score: clampScore(100 - spreadProxy * 45), price_extension_atr: parseFloat(extensionAtr.toFixed(3)),
    body_atr: parseFloat(bodyAtr.toFixed(3)), volume_expansion: parseFloat(volumeExpansion.toFixed(3)),
    max_bars_in_trade: maxBars, no_entry_timeout_bars: timeframe === "5m" ? 3 : 2,
    early_cancellation_logic: "cancel_if_momentum_or_volume_fails_before_entry", stale_setup_detection: "extension_gt_1.15_atr_or_no_entry_timeout",
    momentum_failure_exit: "exit_if_directional_momentum_turns_negative", volatility_collapse_exit: "exit_if_atr_pct_below_0.12", trend_failure_exit: "exit_if_ema20_alignment_lost",
  };
  const reason = primaryFailedGate ? `QuickScalp rejected: ${primaryFailedGate}` : `QuickScalp ${direction}: volume expansion, EMA alignment, momentum acceleration, ATR expansion and impulse quality confirmed.`;
  const grade = finalScore >= 90 ? "A+" : finalScore >= 82 ? "A" : finalScore >= 75 ? "B" : "C";
  return { status: primaryFailedGate ? "rejected" : "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: primaryFailedGate ? "reject" : grade, reason, rejection_reason: primaryFailedGate, score_breakdown };
}

function evalCompressionBreakout(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
  const box_lookback = Math.max(10, Math.floor(params.box_lookback ?? 36));
  const min_box_bars = Math.max(5, Math.floor(params.min_box_bars ?? 8));
  const max_box_atr_range = params.max_box_atr_range ?? 8.0;
  const atr_expansion_lookback = Math.max(5, Math.floor(params.atr_expansion_lookback ?? 48));
  const min_atr_expansion = params.min_atr_expansion ?? 0.95;
  const breakout_buffer_atr = params.breakout_buffer_atr ?? 0.05;
  const momentum_lookback = Math.max(1, Math.floor(params.momentum_lookback ?? 3));
  const stop_atr_mult = params.stop_atr_mult ?? 1.1;
  const tp1_r = params.tp1_r ?? 1.2;
  const tp2_r = params.tp2_r ?? 2.2;
  const min_rr = params.min_rr ?? 1.3;
  const min_score = params.min_score ?? 72;
  const crypto_behavior_tuning = params.crypto_behavior_tuning === 1;
  const atr_len = Math.max(2, Math.floor(params.atr_len ?? 14));
  const rsi_len = Math.max(2, Math.floor(params.rsi_len ?? 14));
  const ema_fast = Math.max(2, Math.floor(params.ema_fast ?? 20));
  const ema_slow = Math.max(ema_fast + 1, Math.floor(params.ema_slow ?? 50));
  const max_late_breakout_atr = params.max_late_breakout_atr ?? 1.45;

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
  const recentCompressionSlice = boxSlice.slice(-Math.min(Math.max(min_box_bars, 12), boxSlice.length));
  const recentBoxHigh = Math.max(...recentCompressionSlice.map((c) => c.high));
  const recentBoxLow = Math.min(...recentCompressionSlice.map((c) => c.low));
  const recentBoxRange = recentBoxHigh - recentBoxLow;
  if (boxRange <= 0 || !Number.isFinite(boxRange)) return strategyZeroReject("invalid_atr_or_price");

  const buffer = atr * breakout_buffer_atr;
  const effectiveBoxHigh = crypto_behavior_tuning && recentBoxRange > 0 && recentBoxRange < boxRange ? recentBoxHigh : boxHigh;
  const effectiveBoxLow = crypto_behavior_tuning && recentBoxRange > 0 && recentBoxRange < boxRange ? recentBoxLow : boxLow;
  const breakoutDistUp = last.close - effectiveBoxHigh;
  const breakoutDistDn = effectiveBoxLow - last.close;
  const closeOutsideUp = breakoutDistUp > 0 && last.close > last.open;
  const closeOutsideDn = breakoutDistDn > 0 && last.close < last.open;
  const breakoutUp = breakoutDistUp > buffer && last.close > last.open;
  const breakoutDn = breakoutDistDn > buffer && last.close < last.open;
  const priorBreakoutSlice = candles.slice(-3, -1);
  const priorBreakoutUp = priorBreakoutSlice.some((c) => c.close > effectiveBoxHigh + buffer && c.close > c.open);
  const priorBreakoutDn = priorBreakoutSlice.some((c) => c.close < effectiveBoxLow - buffer && c.close < c.open);
  const retestHoldUp = crypto_behavior_tuning && priorBreakoutUp && last.low <= effectiveBoxHigh + atr * 0.22 && last.close > effectiveBoxHigh && last.close >= last.open;
  const retestHoldDn = crypto_behavior_tuning && priorBreakoutDn && last.high >= effectiveBoxLow - atr * 0.22 && last.close < effectiveBoxLow && last.close <= last.open;
  const earlyBreakoutUp = crypto_behavior_tuning && closeOutsideUp && (last.high - last.low) > atr * min_atr_expansion;
  const earlyBreakoutDn = crypto_behavior_tuning && closeOutsideDn && (last.high - last.low) > atr * min_atr_expansion;
  const direction: "buy" | "sell" = breakoutUp || earlyBreakoutUp || retestHoldUp ? "buy" : breakoutDn || earlyBreakoutDn || retestHoldDn ? "sell" : (last.close >= (boxHigh + boxLow) / 2 ? "buy" : "sell");
  const breakoutConfirmed = breakoutUp || breakoutDn || earlyBreakoutUp || earlyBreakoutDn || retestHoldUp || retestHoldDn;
  const breakoutDist = direction === "buy" ? Math.max(0, breakoutDistUp) : Math.max(0, breakoutDistDn);
  const breakoutDistanceAtr = breakoutDist / atr;

  const boxBarTol = params.box_bar_tolerance ?? 0.0015;
  const barsInside = boxSlice.filter((c) => c.high <= boxHigh * (1 + boxBarTol) && c.low >= boxLow * (1 - boxBarTol)).length;
  const boxRangeAtr = boxRange / atr;
  const recentBoxRangeAtr = recentBoxRange / atr;
  const insideRatio = barsInside / Math.max(boxSlice.length, 1);
  const strictCompressionReady = boxSlice.length >= min_box_bars && barsInside >= min_box_bars && boxRangeAtr <= max_box_atr_range;
  const rangeTightness = max_box_atr_range > 0 ? Math.max(0, Math.min(1, 1 - (boxRangeAtr / Math.max(max_box_atr_range * 1.35, 0.01)))) : 0;
  const recentRangeTightness = max_box_atr_range > 0 ? Math.max(0, Math.min(1, 1 - (recentBoxRangeAtr / Math.max(max_box_atr_range * 1.45, 0.01)))) : 0;
  const compressionScore = clampScore((insideRatio * 35) + (Math.max(rangeTightness, recentRangeTightness) * 65));
  const rangeContracted = recentBoxRange > 0 && boxRange > 0 ? recentBoxRange <= boxRange * 0.72 : false;
  const nearCompressionReady = crypto_behavior_tuning && boxSlice.length >= min_box_bars && barsInside >= min_box_bars * 0.65 && (boxRangeAtr <= max_box_atr_range * 1.35 || recentBoxRangeAtr <= max_box_atr_range * 1.45 || rangeContracted) && compressionScore >= 45;
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
    entry_low = breakoutConfirmed ? Math.min(effectiveBoxHigh, price * 0.9995) : effectiveBoxHigh;
    entry_high = breakoutConfirmed ? Math.max(price, effectiveBoxHigh + atr * 0.25) : effectiveBoxHigh + atr * 0.25;
    stop_loss = crypto_behavior_tuning ? Math.min(effectiveBoxLow - atr * 0.20, price - atr * stop_atr_mult) : effectiveBoxLow - atr * stop_atr_mult;
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price + riskForTargets * tp1_r : price + atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price + riskForTargets * tp2_r : price + atr * tp2_r;
  } else {
    entry_low = breakoutConfirmed ? Math.min(price, effectiveBoxLow - atr * 0.25) : effectiveBoxLow - atr * 0.25;
    entry_high = breakoutConfirmed ? Math.max(effectiveBoxLow, price * 1.0005) : effectiveBoxLow;
    stop_loss = crypto_behavior_tuning ? Math.max(effectiveBoxHigh + atr * 0.20, price + atr * stop_atr_mult) : effectiveBoxHigh + atr * stop_atr_mult;
    const riskForTargets = Math.abs(price - stop_loss);
    tp1 = crypto_behavior_tuning ? price - riskForTargets * tp1_r : price - atr * tp1_r;
    tp2 = crypto_behavior_tuning ? price - riskForTargets * tp2_r : price - atr * tp2_r;
  }
  const risk = Math.abs(price - stop_loss);
  const reward = Math.abs(tp2 - price);
  const risk_reward = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
  const rrScore = clampScore(Math.min(risk_reward / Math.max(min_rr, 0.01), 1.5) * 66);
  const breakoutFreshnessScore = clampScore(100 - Math.max(0, breakoutDistanceAtr - 0.35) * 42 - Math.max(0, 0.10 - breakoutDistanceAtr) * 140);
  const lateBreakoutPenalty = breakoutDistanceAtr > max_late_breakout_atr ? Math.min(14, Math.round((breakoutDistanceAtr - max_late_breakout_atr) * 12)) : 0;
  const lateBreakoutExhausted = breakoutDistanceAtr > max_late_breakout_atr && momentumScore < 62 && atrExpansionRatio < Math.max(min_atr_expansion * 1.15, 1.08);

  let primaryFailedGate = "";
  if (!compressionReady) primaryFailedGate = "compression_not_ready";
  else if (!breakoutConfirmed) primaryFailedGate = "breakout_not_confirmed";
  else if (atrExpansionRatio < min_atr_expansion && !(crypto_behavior_tuning && nearCompressionReady && breakoutDistanceAtr >= breakout_buffer_atr * 2)) primaryFailedGate = "atr_expansion_weak";
  else if (lateBreakoutExhausted) primaryFailedGate = "late_breakout_exhausted";
  else if (ind.atr_pct > 5.0) primaryFailedGate = "volatility_too_high";
  else if (momentumScore < 45) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((compressionScore * 0.24) + (breakoutScore * 0.22) + (atrExpansionScore * 0.16) + (momentumScore * 0.14) + (volatilityScore * 0.08) + (rrScore * 0.10) + (candleBodyScore * 0.04) + (breakoutFreshnessScore * 0.02) - lateBreakoutPenalty);
  if (!primaryFailedGate && finalScore < min_score) primaryFailedGate = "confidence_too_low";

  const score_breakdown: Record<string, number | string | boolean> = {
    primary_failed_gate: primaryFailedGate || "passed",
    compression_score: compressionScore,
    box_range_atr: parseFloat(boxRangeAtr.toFixed(3)),
    recent_box_range_atr: parseFloat(recentBoxRangeAtr.toFixed(3)),
    range_contracted: rangeContracted,
    box_lookback,
    min_box_bars,
    bars_inside_box: barsInside,
    compression_ready: compressionReady,
    strict_compression_ready: strictCompressionReady,
    near_compression_ready: nearCompressionReady,
    breakout_confirmed: breakoutConfirmed,
    early_breakout: earlyBreakoutUp || earlyBreakoutDn,
    retest_hold_confirmed: retestHoldUp || retestHoldDn,
    prior_breakout_confirmed: priorBreakoutUp || priorBreakoutDn,
    breakout_direction: direction,
    breakout_distance_atr: parseFloat(breakoutDistanceAtr.toFixed(3)),
    breakout_score: breakoutScore,
    breakout_freshness_score: breakoutFreshnessScore,
    max_late_breakout_atr,
    late_breakout_penalty: lateBreakoutPenalty,
    late_breakout_exhausted: lateBreakoutExhausted,
    atr_expansion: parseFloat(atrExpansionRatio.toFixed(3)),
    atr_expansion_score: atrExpansionScore,
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
    max_bars_in_trade: params.max_bars_in_trade ?? 48,
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
  const pullback_bars = Math.max(2, Math.floor(params.pullback_bars ?? 8));
  const stop_atr_mult = params.stop_atr_mult ?? 1.2;
  const tp1_r = params.tp1_r ?? 1.2;
  const tp2_r = params.tp2_r ?? 2.2;
  const min_rr = params.min_rr ?? 1.5;
  const min_score = params.min_score ?? params.min_confidence_balanced ?? 78;
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
  const continuationChopScore = clampScore((Math.abs(rsi - 50) < 5 ? 35 : 0) + (Math.abs(directionalSpread) < 0.12 ? 30 : 0) + (bodyAtr < 0.22 ? 20 : 0) + (Math.abs(directionalMomentum) < 0.2 ? 15 : 0));
  const trendQualityPass = trendScore >= 50 || (crypto_behavior_tuning && emaSlopeScore >= 62 && directionalSpread > 0.02 && priceVsEma > 0 && rsiScore >= 45 && continuationChopScore < 65);
  const reclaimByQuality = crypto_behavior_tuning && pullbackScore >= 74 && momentumScore >= 52 && trendScore >= 58 && emaSlopeScore >= 62 && continuationChopScore < 62 && priceVsEma > -0.02;
  reclaimConfirmed = strictReclaimConfirmed || reclaimByQuality;
  const reclaimQualityPass = reclaimConfirmed;
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
  else if (!reclaimQualityPass) primaryFailedGate = "reclaim_not_confirmed";
  else if (momentumScore < 35 || rsiScore < 35) primaryFailedGate = "momentum_failed";
  else if (risk_reward < min_rr) primaryFailedGate = "rr_too_low";

  const finalScore = clampScore((trendScore * 0.24) + (emaSlopeScore * 0.15) + (pullbackScore * 0.18) + (momentumScore * 0.16) + (rsiScore * 0.11) + (volatilityScore * 0.08) + (rrScore * 0.08));
  if (!primaryFailedGate && reclaimByQuality && !strictReclaimConfirmed && finalScore < 85) primaryFailedGate = "strict_reclaim_required_for_A";
  if (!primaryFailedGate && continuationChopScore >= 70 && finalScore < 85) primaryFailedGate = "chop_continuation_risk";
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
    reclaim_quality_pass: reclaimQualityPass,
    strict_reclaim_confirmed: strictReclaimConfirmed,
    reclaim_by_quality: reclaimByQuality,
    continuation_chop_score: continuationChopScore,
    momentum_score: momentumScore,
    rsi_score: rsiScore,
    volatility_score: volatilityScore,
    rr_score: rrScore,
    rr: risk_reward,
    stop_distance_pct: pctDistance(price, stop_loss),
    tp1_distance_pct: pctDistance(price, tp1),
    tp2_distance_pct: pctDistance(price, tp2),
    final_score: finalScore,
    max_bars_in_trade: params.max_bars_in_trade ?? 96,
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
  const stop_atr_mult = Math.max(params.stop_atr_mult ?? 1.35, 1.35);
  const tp1_r = params.tp1_r ?? 1.25;
  const tp2_r = params.tp2_r ?? 1.85;
  const min_rr = params.min_rr ?? 1.45;
  const min_score = params.min_score ?? 78;
  const momentum_lookback = Math.max(2, Math.floor(params.momentum_lookback ?? 4));
  const atr_len = Math.max(2, Math.floor(params.atr_len ?? 14));
  const rsi_len = Math.max(2, Math.floor(params.rsi_len ?? 14));
  const ema_fast = Math.max(2, Math.floor(params.ema_fast ?? 20));
  const ema_slow = Math.max(ema_fast + 1, Math.floor(params.ema_slow ?? 50));
  const min_stop_pips = Math.max(params.min_stop_pips ?? 0, runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 13 : 11);
  const min_tp1_pips = Math.max(params.min_tp1_pips ?? 0, runtimeInstrument(symbol)?.instrument_class === "fx_jpy" ? 15 : 13);

  if (!["1h", "15m"].includes(timeframe)) return forexZeroReject("unsupported_timeframe", symbol);
  const minLen = Math.max(ema_slow + 8, atr_len + 2, rsi_len + 2, pullback_bars + 12, 60);
  if (candles.length < minLen) return forexZeroReject("insufficient_candles", symbol);
  if (hasInvalidCandles(candles)) return forexZeroReject("invalid_candles", symbol);

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last.close;
  const atr = calcATR(candles, atr_len);
  const pip = runtimeInstrument(symbol)?.pip_size ?? 0;
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
  const touchedBuyZone = (pullbackLow <= emaFast + atr * 0.8 && pullbackLow >= emaSlow - atr * 0.6) || (pullbackCloseMin <= emaFast + atr * 0.35 && pullbackCloseMin >= emaSlow - atr * 0.75);
  const touchedSellZone = (pullbackHigh >= emaFast - atr * 0.8 && pullbackHigh <= emaSlow + atr * 0.6) || (pullbackCloseMax >= emaFast - atr * 0.35 && pullbackCloseMax <= emaSlow + atr * 0.75);
  const reclaimedBuy = price > emaFast && price > pullbackCloseMin + atr * 0.18 && (last.close > last.open || Math.abs(last.close - last.open) >= atr * 0.18);
  const reclaimedSell = price < emaFast && price < pullbackCloseMax - atr * 0.18 && (last.close < last.open || Math.abs(last.close - last.open) >= atr * 0.18);
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
  const stop_loss = roundRuntimePrice(symbol, direction === "buy"
    ? Math.min(pullbackLow - stopBuffer, price - Math.max(atr * stop_atr_mult, minRisk))
    : Math.max(pullbackHigh + stopBuffer, price + Math.max(atr * stop_atr_mult, minRisk)));
  const risk = Math.abs(price - stop_loss);
  const tp1 = roundRuntimePrice(symbol, direction === "buy" ? price + risk * tp1_r : price - risk * tp1_r);
  const tp2 = roundRuntimePrice(symbol, direction === "buy" ? price + risk * tp2_r : price - risk * tp2_r);
  const risk_reward = risk > 0 ? parseFloat((Math.abs(tp2 - price) / risk).toFixed(2)) : 0;
  const stopPips = runtimePipDistance(symbol, price, stop_loss);
  const tp1Pips = runtimePipDistance(symbol, price, tp1);
  const tp2Pips = runtimePipDistance(symbol, price, tp2);

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
  const trendQualityPass = emaAligned && (
    (trendScore >= 58 && directionalSlope > -0.015 && directionalSpreadPips >= 1.5) ||
    (trendScore >= 52 && emaSlopeScore >= 50 && directionalSlope > -0.025 && (directionalSpreadPips >= 1.0 || priceVsEma > 0) && structureContinuation)
  );
  const reclaimQualityPass = reclaimConfirmed || (pullbackScore >= 62 && momentumScore >= 42 && structureContinuation && (direction === "buy" ? price > emaFast : price < emaFast));

  let primaryFailedGate = "";
  if (atrPct < min_atr_pct) primaryFailedGate = "volatility_too_low";
  else if (atrPct > max_atr_pct) primaryFailedGate = "volatility_too_high";
  else if (!trendQualityPass) primaryFailedGate = "trend_filter_failed";
  else if (!pullbackReady || pullbackScore < 50) primaryFailedGate = "pullback_not_ready";
  else if (!reclaimQualityPass) primaryFailedGate = "reclaim_not_confirmed";
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
    reclaim_quality_pass: reclaimQualityPass,
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

type ForexEvaluator = (context: StrategyEvaluationContext, params: Record<string, number>) => EvalResult;
const FOREX_EVALUATOR_REGISTRY = new Map<string, ForexEvaluator>([
  ["forex.micro-scalper", (context, params) => evalForexMicroScalper(context.candles as Candle[], context.indicators as Indicators, context.timeframe, params)],
  ["forex.swing-continuation", (context, params) => evalForexSwingContinuation(context.candles as Candle[], context.indicators as Indicators, context.timeframe, params)],
  ...Object.entries(FOREX_PRODUCTION_EVALUATORS).map(([id, evaluator]) => [id, (context: StrategyEvaluationContext) => evaluator(context)] as [string, ForexEvaluator]),
]);
function forexEvaluatorFor(strategyId: string): ForexEvaluator {
  const evaluator = FOREX_EVALUATOR_REGISTRY.get(strategyId);
  if (!evaluator) throw new Error(`FOREX_EVALUATOR_NOT_REGISTERED:${strategyId}`);
  return evaluator;
}
function validateForexEvaluatorRegistry(): void {
  const ids = new Set<string>();
  for (const contract of FOREX_STRATEGY_CONTRACTS) {
    if (ids.has(contract.id)) throw new Error(`DUPLICATE_FOREX_STRATEGY_ID:${contract.id}`);
    ids.add(contract.id);
    if (!FOREX_EVALUATOR_REGISTRY.has(contract.id)) throw new Error(`FOREX_EVALUATOR_NOT_REGISTERED:${contract.id}`);
  }
  if (FOREX_EVALUATOR_REGISTRY.size !== ids.size) throw new Error("FOREX_EVALUATOR_REGISTRY_CONTRACT_MISMATCH");
}
validateForexEvaluatorRegistry();

// ─── Grade index ──────────────────────────────────────────────────────────────

function gradeIndex(g: string): number { return g === "A+" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0; }

const C2_FOREX_PROVIDER = "mt5";
const C2_FOREX_SYMBOLS = new Set<string>(FOREX_RUNTIME_SYMBOLS);

function normalizeSymbol(symbol: string): string {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.includes("EURUSD")) return "EURUSD";
  if (clean.includes("GBPUSD")) return "GBPUSD";
  if (clean.includes("USDJPY")) return "USDJPY";
  if (clean.includes("AUDUSD")) return "AUDUSD";
  if (clean.includes("USDCAD")) return "USDCAD";
  if (clean.includes("XAUUSD") || clean.includes("GOLD")) return "XAUUSD";
  return clean;
}

function normalizeRejectionReason(reason: string, marketType = "crypto"): string {
  if (!reason || reason === "none") return "none";
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
      "provider_failed", "provider_rate_limited", "provider_data_unavailable", "provider_invalid_response", "unsupported_symbol", "unsupported_instrument_class", "gold_strategy_not_certified",
      "unsupported_timeframe", "insufficient_candles", "invalid_atr_or_price", "invalid_candles",
      "spread_or_distance_too_tight", "distance_guard_failed", "volatility_too_low", "volatility_too_high",
      "trend_filter_failed", "pullback_not_ready", "pullback_invalid", "reclaim_not_confirmed", "momentum_failed",
      "rr_too_low", "confidence_too_low", "score_below_min", "forex_budget_limited", "duplicate_active_signal", "arbitration_blocked", "arbitration_no_trade",
      "session_not_eligible", "stale_candles", "compression_not_ready", "exhaustion_unconfirmed", "breakout_not_confirmed", "range_not_compressed",
      "mixed_choppy_market_requires_a_plus", "mixed_market_no_clear_strategy_requires_a_plus", "mixed_market_expected_value_too_low",
      "strategy_instrument_class_not_supported", "timeframe_not_allowed", "context_timeframe_not_evaluated", "runtime_error",
    ]);
    return allowed.has(normalized) ? normalized : (normalized || "trend_filter_failed");
  }
  return normalized;
}

const C2_FOREX_TIMEFRAMES = new Set<string>(MT5_PROVIDER_MARKET_DATA_TIMEFRAMES);

function intEnv(name: string, defaultValue: number, minValue = 0): number {
  const raw = Deno.env.get(name);
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= minValue ? parsed : defaultValue;
}

function forexTimeframes(): string[] {
  return forexScannerFetchPlan();
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
  plan: DeepReadonly<StrategyPlan>;
}

interface MarketContext {
  regime: string;
  trend_strength: number;
  momentum_strength: number;
  volatility_expansion: number;
  volatility_contraction: number;
  compression_state: number;
  range_state: number;
  chop_level: number;
  atr_regime: string;
  distance_from_ema_atr: number;
  overextension: number;
  breakout_state: number;
  pullback_state: number;
  reclaim_state: number;
  preferred_strategy: StrategyName | "none";
  mixed_market: boolean;
  opportunity_score: number;
  expected_move_bucket: string;
  risk_quality: string;
  liquidity_quality: string;
  strategy_match: string;
  recent_move_pct: number;
  invalidation_distance_atr: number;
}

function classifyMarketContext(ind: Indicators, candles: Candle[]): MarketContext {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const atr = Math.max(ind.atr14, 0);
  const price = Math.max(last?.close ?? 0, 0);
  const emaSpreadAtr = atr > 0 ? Math.abs(ind.ema20 - ind.ema50) / atr : 0;
  const distanceFromEmaAtr = atr > 0 ? Math.abs(price - ind.ema20) / atr : 0;
  const bodyAtr = atr > 0 ? Math.abs(last.close - last.open) / atr : 0;
  const barRangeAtr = atr > 0 ? (last.high - last.low) / atr : 0;
  const recentHigh = ind.recent_high;
  const recentLow = ind.recent_low;
  const breakoutUp = atr > 0 && last.close > recentHigh - atr * 0.10 && last.close > last.open;
  const breakoutDn = atr > 0 && last.close < recentLow + atr * 0.10 && last.close < last.open;
  const trendStrength = clampScore(Math.min(1, emaSpreadAtr / 2.2) * 58 + (ind.regime.startsWith("trend") ? 24 : 0) + (Math.abs(ind.rsi14 - 50) / 50) * 18);
  const momentumStrength = clampScore(Math.abs(ind.momentum_score) * 60 + Math.min(bodyAtr, 1.2) * 28 + ((last.close > prev.close) === (ind.momentum_score >= 0) ? 12 : 0));
  const volatilityExpansion = clampScore(Math.min(barRangeAtr / 1.6, 1.4) * 72 + (ind.atr_pct > 2 ? 18 : 0));
  const volatilityContraction = clampScore(Math.max(0, 1 - ind.range_compression_ratio) * 85 + (ind.atr_pct < 0.5 ? 15 : 0));
  const compressionState = clampScore(Math.max(0, 1 - ind.range_compression_ratio / 0.75) * 100);
  const rangeState = clampScore((ind.rsi14 > 45 && ind.rsi14 < 55 ? 45 : 0) + Math.max(0, 1 - emaSpreadAtr / 1.4) * 35 + (ind.range_compression_ratio > 0.70 ? 20 : 0));
  const chopLevel = clampScore(rangeState * 0.65 + (bodyAtr < 0.22 ? 20 : 0) + (Math.abs(ind.momentum_score) < 0.2 ? 15 : 0));
  const overextension = clampScore(Math.min(distanceFromEmaAtr / 2.4, 1.4) * 100);
  const breakoutState = clampScore((breakoutUp || breakoutDn ? 55 : 0) + volatilityExpansion * 0.30 + compressionState * 0.15);
  const pullbackState = clampScore((distanceFromEmaAtr <= 0.9 ? 45 : 0) + trendStrength * 0.35 + (bodyAtr >= 0.20 ? 20 : 0));
  const reclaimState = clampScore(((last.close > ind.ema20 && last.close > last.open) || (last.close < ind.ema20 && last.close < last.open) ? 40 : 0) + pullbackState * 0.45 + momentumStrength * 0.15);
  const atrRegime = ind.atr_pct > 3.5 ? "very_high" : ind.atr_pct > 2.0 ? "high" : ind.atr_pct < 0.15 ? "very_low" : ind.atr_pct < 0.5 ? "low" : "normal";
  const recentMovePct = price > 0 && candles.length > 12 ? Math.abs(((price - candles[candles.length - 12].close) / price) * 100) : 0;
  const invalidationDistanceAtr = atr > 0 ? Math.max(0.1, distanceFromEmaAtr) : 0;

  let preferred_strategy: StrategyName | "none" = "none";
  if (compressionState >= 58 && breakoutState >= 58 && overextension < 75 && chopLevel < 72) preferred_strategy = "CompressionBreakout";
  else if (trendStrength >= 62 && reclaimState >= 58 && chopLevel < 58 && overextension < 82) preferred_strategy = "SwingContinuation";
  else if (momentumStrength >= 72 && overextension < 58 && volatilityExpansion >= 55 && chopLevel < 52) preferred_strategy = "QuickScalp";
  else if (momentumStrength >= 58 && overextension < 72 && volatilityExpansion >= 38 && chopLevel < 68) preferred_strategy = "MicroScalper";

  const positiveStates = [
    momentumStrength >= 55 && overextension < 72,
    compressionState >= 55 && breakoutState >= 55,
    trendStrength >= 60 && reclaimState >= 55,
  ].filter(Boolean).length;
  const mixed_market = preferred_strategy === "none" || positiveStates !== 1 || chopLevel >= 72;

  const opportunityScore = clampScore(
    trendStrength * 0.20 + momentumStrength * 0.18 + volatilityExpansion * 0.14 +
    compressionState * 0.10 + breakoutState * 0.13 + (100 - chopLevel) * 0.13 +
    Math.max(0, 100 - overextension) * 0.07 + Math.min(recentMovePct * 8, 100) * 0.05,
  );
  const expectedMoveBucket = opportunityScore >= 78 && ind.atr_pct >= 0.7 ? "1-2pct_clean_move" : opportunityScore >= 65 ? "0.5-1pct_profit_lock_candidate" : "low_expected_move";
  const riskQuality = overextension > 82 || chopLevel > 76 ? "poor" : overextension < 65 && chopLevel < 62 ? "clean" : "mixed";
  const liquidityQuality = ind.avg_volume > 0 ? "available" : "unknown";

  return {
    regime: ind.regime, trend_strength: trendStrength, momentum_strength: momentumStrength,
    volatility_expansion: volatilityExpansion, volatility_contraction: volatilityContraction,
    compression_state: compressionState, range_state: rangeState, chop_level: chopLevel,
    atr_regime: atrRegime, distance_from_ema_atr: parseFloat(distanceFromEmaAtr.toFixed(3)),
    overextension, breakout_state: breakoutState, pullback_state: pullbackState, reclaim_state: reclaimState,
    preferred_strategy, mixed_market, opportunity_score: opportunityScore, expected_move_bucket: expectedMoveBucket,
    risk_quality: riskQuality, liquidity_quality: liquidityQuality, strategy_match: preferred_strategy,
    recent_move_pct: parseFloat(recentMovePct.toFixed(3)), invalidation_distance_atr: parseFloat(invalidationDistanceAtr.toFixed(3)),
  };
}

function marketRoleFit(e: EvalEntry, ctx: MarketContext): number {
  if (e.name === "QuickScalp") {
    return clampScore(ctx.momentum_strength * 0.34 + ctx.volatility_expansion * 0.24 + (100 - ctx.overextension) * 0.24 + (100 - ctx.chop_level) * 0.18);
  }
  if (e.name === "MicroScalper" || e.name === "ForexMicroScalper") {
    return clampScore(ctx.momentum_strength * 0.38 + (100 - ctx.overextension) * 0.24 + ctx.volatility_expansion * 0.20 + (100 - ctx.chop_level) * 0.18);
  }
  if (e.name === "CompressionBreakout") {
    return clampScore(ctx.compression_state * 0.30 + ctx.breakout_state * 0.34 + ctx.volatility_expansion * 0.18 + (100 - Math.max(ctx.overextension, ctx.chop_level)) * 0.18);
  }
  if (e.name === "SwingContinuation" || e.name === "ForexSwingContinuation") {
    return clampScore(ctx.trend_strength * 0.34 + ctx.reclaim_state * 0.28 + ctx.pullback_state * 0.18 + (100 - ctx.chop_level) * 0.20);
  }
  return 50;
}

function strategyFreshnessScore(e: EvalEntry, ctx: MarketContext): number {
  const b = e.result.score_breakdown;
  if (e.name === "CompressionBreakout") {
    const breakoutFreshness = scoreBreakdownNumber(b, "breakout_freshness_score");
    return breakoutFreshness > 0 ? breakoutFreshness : clampScore(100 - Math.max(0, scoreBreakdownNumber(b, "breakout_distance_atr") - 0.35) * 42);
  }
  if (e.name === "SwingContinuation" || e.name === "ForexSwingContinuation") {
    const strictReclaim = scoreBreakdownBool(b, "strict_reclaim_confirmed");
    const reclaimByQuality = scoreBreakdownBool(b, "reclaim_by_quality");
    return clampScore((strictReclaim ? 78 : reclaimByQuality ? 56 : 35) + ctx.reclaim_state * 0.16 + (100 - ctx.chop_level) * 0.06);
  }
  if (e.name === "QuickScalp") {
    const extension = scoreBreakdownNumber(b, "price_extension_atr");
    return clampScore(94 - Math.max(0, extension - 0.6) * 34 + ctx.momentum_strength * 0.08 + ctx.volatility_expansion * 0.06);
  }
  if (e.name === "MicroScalper" || e.name === "ForexMicroScalper") {
    const extension = scoreBreakdownNumber(b, "price_extension_atr");
    return clampScore(88 - Math.max(0, extension - 0.8) * 22 - (scoreBreakdownBool(b, "chase_risk") ? 28 : 0) + ctx.momentum_strength * 0.10);
  }
  return 55;
}

function arbitrationNoTradeReason(ctx: MarketContext, entries: EvalEntry[]): string {
  if (entries.length === 0) return "";
  const top = entries[0];
  const topScore = arbitrationScore(top, ctx);
  const hasAPlus = entries.some((entry) => entry.result.grade === "A+");
  if (ctx.chop_level >= 76 && !hasAPlus) return "mixed_choppy_market_requires_a_plus";
  if (ctx.mixed_market && ctx.preferred_strategy === "none" && !hasAPlus) return "mixed_market_no_clear_strategy_requires_a_plus";
  if (ctx.mixed_market && top.result.grade !== "A+" && topScore < 0.68) return "mixed_market_expected_value_too_low";
  return "";
}

function scoreBreakdownNumber(breakdown: Record<string, number | string | boolean>, key: string): number {
  const value = breakdown?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scoreBreakdownBool(breakdown: Record<string, number | string | boolean>, key: string): boolean {
  return breakdown?.[key] === true || breakdown?.[key] === "true" || breakdown?.[key] === "passed";
}

function strategyIdentityFit(e: EvalEntry): number {
  const b = e.result.score_breakdown;
  if (e.name === "CompressionBreakout") {
    return clampScore(
      scoreBreakdownNumber(b, "compression_score") * 0.30 +
      scoreBreakdownNumber(b, "breakout_score") * 0.35 +
      scoreBreakdownNumber(b, "atr_expansion_score") * 0.18 +
      scoreBreakdownNumber(b, "momentum_score") * 0.17 +
      (scoreBreakdownBool(b, "near_compression_ready") ? 6 : 0),
    );
  }
  if (e.name === "SwingContinuation" || e.name === "ForexSwingContinuation") {
    return clampScore(
      scoreBreakdownNumber(b, "trend_score") * 0.30 +
      scoreBreakdownNumber(b, "pullback_score") * 0.28 +
      scoreBreakdownNumber(b, "momentum_score") * 0.22 +
      scoreBreakdownNumber(b, "ema_slope_score") * 0.10 +
      scoreBreakdownNumber(b, "rr_score") * 0.10,
    );
  }
  if (e.name === "QuickScalp") {
    return clampScore(
      scoreBreakdownNumber(b, "volume_expansion_score") * 0.18 +
      scoreBreakdownNumber(b, "liquidity_score") * 0.12 +
      scoreBreakdownNumber(b, "ema_alignment_score") * 0.18 +
      scoreBreakdownNumber(b, "momentum_acceleration_score") * 0.24 +
      scoreBreakdownNumber(b, "atr_expansion_score") * 0.14 +
      scoreBreakdownNumber(b, "impulse_quality_score") * 0.14,
    );
  }
  if (e.name === "MicroScalper") {
    // Mirrors evalMicroScalper final score weights: trend 0.24, momentum 0.22,
    // rsi 0.18, body 0.12, volatility 0.12, rr 0.12
    return clampScore(
      scoreBreakdownNumber(b, "trend_score") * 0.24 +
      scoreBreakdownNumber(b, "momentum_score") * 0.22 +
      scoreBreakdownNumber(b, "rsi_score") * 0.18 +
      scoreBreakdownNumber(b, "candle_body_score") * 0.12 +
      scoreBreakdownNumber(b, "volatility_score") * 0.12 +
      scoreBreakdownNumber(b, "rr_score") * 0.12,
    );
  }
  if (e.name === "ForexMicroScalper") {
    return clampScore(
      scoreBreakdownNumber(b, "trend_score") * 0.25 +
      scoreBreakdownNumber(b, "momentum_score") * 0.25 +
      scoreBreakdownNumber(b, "candle_score") * 0.20 +
      scoreBreakdownNumber(b, "spread_or_distance_score") * 0.20 +
      scoreBreakdownNumber(b, "rr_score") * 0.10,
    );
  }
  return clampScore(
    scoreBreakdownNumber(b, "trend_score") * 0.25 +
    scoreBreakdownNumber(b, "momentum_score") * 0.25 +
    scoreBreakdownNumber(b, "rsi_score") * 0.18 +
    scoreBreakdownNumber(b, "candle_body_score") * 0.14 +
    scoreBreakdownNumber(b, "rr_score") * 0.18,
  );
}

function overextensionPenalty(e: EvalEntry): number {
  const b = e.result.score_breakdown;
  let penalty = 0;
  if (scoreBreakdownBool(b, "chase_risk")) penalty += 0.10;
  const extensionAtr = scoreBreakdownNumber(b, "price_extension_atr");
  if (extensionAtr > 2.0) penalty += Math.min((extensionAtr - 2.0) * 0.04, 0.12);
  const bodyAtr = scoreBreakdownNumber(b, "body_atr");
  if ((e.name === "MicroScalper" || e.name === "ForexMicroScalper") && bodyAtr > 1.35) penalty += 0.04;
  return penalty;
}

function arbitrationScore(e: EvalEntry, ctx?: MarketContext): number {
  const r = e.result;
  const g = e.guard;
  const scorePct = r.confidence_score / 100;
  const rrPct = Math.min(r.risk_reward / 3.5, 1);
  const slMargin = g.sl_pct > 0 && e.cfg.min_stop_distance_pct > 0 ? Math.min(Math.max((g.sl_pct - e.cfg.min_stop_distance_pct) / e.cfg.min_stop_distance_pct, 0), 1) : 0.5;
  const tp1Margin = g.tp1_pct > 0 && e.cfg.min_tp1_distance_pct > 0 ? Math.min(Math.max((g.tp1_pct - e.cfg.min_tp1_distance_pct) / e.cfg.min_tp1_distance_pct, 0), 1) : 0.5;
  const tp2Margin = g.tp2_pct > 0 && e.cfg.min_tp2_distance_pct > 0 ? Math.min(Math.max((g.tp2_pct - e.cfg.min_tp2_distance_pct) / e.cfg.min_tp2_distance_pct, 0), 1) : 0.5;
  const distMargin = (slMargin + tp1Margin + tp2Margin) / 3;
  const gradePct = gradeIndex(r.grade) / 3;
  const identityPct = strategyIdentityFit(e) / 100;
  const roleFitPct = ctx ? marketRoleFit(e, ctx) / 100 : identityPct;
  const freshnessPct = ctx ? strategyFreshnessScore(e, ctx) / 100 : 0.55;
  const preferredBonus = ctx?.preferred_strategy === e.name ? 0.05 : 0;
  const gradeQualityBonus = r.grade === "A+" ? 0.04 : r.grade === "A" ? 0.015 : 0;
  const mixedMarketPenalty = ctx?.mixed_market && r.grade !== "A+" ? 0.04 : 0;
  const swingChopPenalty = ctx && (e.name === "SwingContinuation" || e.name === "ForexSwingContinuation") && ctx.chop_level >= 58 && r.grade !== "A+" ? 0.09 : 0;
  const opportunityPct = ctx ? ctx.opportunity_score / 100 : 0.55;
  const riskQualityPenalty = ctx?.risk_quality === "poor" ? 0.08 : ctx?.risk_quality === "mixed" ? 0.025 : 0;
  return parseFloat(Math.max(0, (scorePct * 0.18) + (identityPct * 0.13) + (roleFitPct * 0.20) + (freshnessPct * 0.08) + (opportunityPct * 0.12) + (rrPct * 0.14) + (distMargin * 0.08) + (gradePct * 0.07) + gradeQualityBonus + preferredBonus - mixedMarketPenalty - swingChopPenalty - overextensionPenalty(e) - riskQualityPenalty).toFixed(4));
}

function arbitrationLossReason(entry: EvalEntry, selected: EvalEntry | undefined, ctx: MarketContext): string {
  if (!selected) return "no_selected_candidate";
  const reasons: string[] = [];
  const candidateRoleFit = marketRoleFit(entry, ctx);
  const selectedRoleFit = marketRoleFit(selected, ctx);
  if (ctx.preferred_strategy && ctx.preferred_strategy !== "none" && entry.name !== ctx.preferred_strategy) reasons.push(`market_preferred_${ctx.preferred_strategy}`);
  if (selected.result.grade !== entry.result.grade) reasons.push(`selected_grade_${selected.result.grade}_vs_${entry.result.grade}`);
  if (selectedRoleFit > candidateRoleFit + 4) reasons.push(`selected_role_fit_${selectedRoleFit}_vs_${candidateRoleFit}`);
  const candidateScore = arbitrationScore(entry, ctx);
  const selectedScore = arbitrationScore(selected, ctx);
  if (selectedScore > candidateScore) reasons.push(`selected_arbitration_score_${selectedScore}_vs_${candidateScore}`);
  if (selected.result.risk_reward > entry.result.risk_reward + 0.15) reasons.push("selected_rr_better");
  if (ctx.mixed_market && entry.result.grade !== "A+") reasons.push("mixed_market_requires_stronger_grade");
  return reasons.length > 0 ? reasons.join(";") : `selected_${selected.name}_higher_expected_value`;
}

function arbitrationSnapshot(entries: EvalEntry[], ctx?: MarketContext): Array<Record<string, unknown>> {
  return entries.map((entry) => ({
    strategy_name: entry.name,
    arbitration_score: arbitrationScore(entry, ctx),
    confidence_score: entry.result.confidence_score,
    grade: entry.result.grade,
    risk_reward: entry.result.risk_reward,
    identity_fit_score: strategyIdentityFit(entry),
    market_role_fit_score: ctx ? marketRoleFit(entry, ctx) : null,
    freshness_score: ctx ? strategyFreshnessScore(entry, ctx) : null,
    market_preferred_strategy: ctx?.preferred_strategy ?? null,
    regime_fit: ctx ? (ctx.preferred_strategy === entry.name ? "matched" : ctx.preferred_strategy === "none" ? "mixed" : "mismatched") : "unknown",
    stop_margin_pct: parseFloat(entry.guard.sl_pct.toFixed(4)),
    tp1_margin_pct: parseFloat(entry.guard.tp1_pct.toFixed(4)),
    tp2_margin_pct: parseFloat(entry.guard.tp2_pct.toFixed(4)),
    primary_failed_gate: entry.result.score_breakdown?.primary_failed_gate ?? "passed",
  }));
}



function timeframeMinutes(timeframe: string): number | null {
  const normalized = String(timeframe || "").trim().toLowerCase();
  const map: Record<string, number> = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1h": 60, "4h": 240, "1d": 1440, "1day": 1440 };
  const mapped = map[normalized];
  if (mapped) return mapped;
  const match = normalized.match(/^(\d+)\s*([mhd])$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(value) || value <= 0) return null;
  return unit === "m" ? value : unit === "h" ? value * 60 : value * 1440;
}

interface ExpiryMetadata {
  expires_at: string | null;
  expiry_source: string;
  strategy: string;
  timeframe: string;
  timeframe_minutes: number | null;
  max_bars_in_trade: number;
  computed_expiry_minutes: number;
  global_fallback_used: boolean;
  legacy_global_fallback_minutes: number;
  expiry_window_may_be_too_short: boolean;
}

const LEGACY_GLOBAL_FALLBACK_MINUTES = 360;

function buildSignalExpiryMetadata(strategyName: string, timeframe: string, cfg: StrategyConfig, scoreBreakdown: Record<string, number | string | boolean>, createdAt: Date): ExpiryMetadata {
  const tfMinutes = timeframeMinutes(timeframe);
  const scoreBreakdownBars = scoreBreakdown.max_bars_in_trade;
  const paramsBars = cfg.params?.max_bars_in_trade;
  const rawMaxBars = typeof scoreBreakdownBars === "number" && Number.isFinite(scoreBreakdownBars) && scoreBreakdownBars > 0
    ? scoreBreakdownBars
    : typeof paramsBars === "number" && Number.isFinite(paramsBars) && paramsBars > 0
      ? paramsBars
      : cfg.max_bars_in_trade;
  const maxBars = Math.max(1, Math.floor(rawMaxBars || 0));
  const computedMinutes = tfMinutes && maxBars > 0 ? tfMinutes * maxBars : LEGACY_GLOBAL_FALLBACK_MINUTES;
  const canUseStrategyExpiry = Boolean(tfMinutes && maxBars > 0);
  return {
    expires_at: canUseStrategyExpiry ? new Date(createdAt.getTime() + computedMinutes * 60_000).toISOString() : null,
    expiry_source: canUseStrategyExpiry ? "strategy_effective_max_bars_in_trade" : "legacy_global_fallback",
    strategy: strategyName,
    timeframe,
    timeframe_minutes: tfMinutes,
    max_bars_in_trade: maxBars,
    computed_expiry_minutes: computedMinutes,
    global_fallback_used: !canUseStrategyExpiry,
    legacy_global_fallback_minutes: LEGACY_GLOBAL_FALLBACK_MINUTES,
    expiry_window_may_be_too_short: !canUseStrategyExpiry,
  };
}

function scoreBreakdownWithExpiry(scoreBreakdown: Record<string, number | string | boolean>, expiry: ExpiryMetadata): Record<string, number | string | boolean> {
  return {
    ...scoreBreakdown,
    expires_at: expiry.expires_at ?? "",
    expiry_source: expiry.expiry_source,
    strategy: expiry.strategy,
    timeframe: expiry.timeframe,
    timeframe_minutes: expiry.timeframe_minutes ?? 0,
    max_bars_in_trade: expiry.max_bars_in_trade,
    computed_expiry_minutes: expiry.computed_expiry_minutes,
    global_fallback_used: expiry.global_fallback_used,
    legacy_global_fallback_minutes: expiry.legacy_global_fallback_minutes,
    expiry_window_may_be_too_short: expiry.expiry_window_may_be_too_short,
  };
}

function microScalperRuntimeParams(cfg: StrategyConfig, timeframe: string): { params: Record<string, number>; config_source: "db" | "fallback" | "runtime_override"; base_config_source: "db" | "fallback"; runtime_overrides: string[] } {
  const calibrated15m: Record<string, number> = {
    min_score: 72,
    min_rr: 1.2,
    stop_atr_mult: 1.4,
    tp1_r: 1.2,
    tp2_r: 1.8,
    min_body_atr: 0.30,
    rsi_buy_min: 52,
    rsi_sell_max: 48,
    max_bars_in_trade: 24,
    momentum_lookback: 3,
    min_atr_pct: 0.10,
    max_atr_pct: 3.0,
    crypto_behavior_tuning: 1,
  };
  const calibrated5m: Record<string, number> = {
    ...calibrated15m,
    // Keep scanner 5m aligned with the successful live-like 5m CSV/backtest
    // path unless DB explicitly provides timeframe-specific overrides.
    rsi_buy_min: calibrated15m.rsi_buy_min,
    rsi_sell_max: calibrated15m.rsi_sell_max,
    stop_atr_mult: calibrated15m.stop_atr_mult,
    max_bars_in_trade: calibrated15m.max_bars_in_trade,
  };
  const calibrated = timeframe === "5m" ? calibrated5m : calibrated15m;
  const runtimeOverrides: string[] = [];
  const params: Record<string, number> = { ...calibrated, ...cfg.params };

  // The live scanner has a single DB strategy_config row for MicroScalper. Keep
  // 5m on the same calibrated surface as the successful 5m CSV/backtest path
  // unless the DB has explicit timeframe-specific keys.
  if (timeframe === "5m") {
    const timeframeKeys: Record<string, string> = {
      rsi_buy_min: "rsi_buy_min_5m",
      rsi_sell_max: "rsi_sell_max_5m",
      stop_atr_mult: "stop_atr_mult_5m",
      max_bars_in_trade: "max_bars_in_trade_5m",
    };
    for (const [key, tfKey] of Object.entries(timeframeKeys)) {
      const explicit = cfg.params[tfKey];
      const next = typeof explicit === "number" && Number.isFinite(explicit) ? explicit : (calibrated5m[key] ?? params[key] ?? 0);
      if (params[key] !== next) runtimeOverrides.push(key);
      params[key] = next;
    }
  }

  params.min_score = cfg.min_score > 0 ? cfg.min_score : calibrated.min_score;
  params.min_rr = cfg.min_rr > 0 ? cfg.min_rr : calibrated.min_rr;
  if (cfg.max_bars_in_trade > 0 && timeframe !== "5m") params.max_bars_in_trade = cfg.max_bars_in_trade;
  if (timeframe === "5m" && cfg.params.max_bars_in_trade_5m === undefined) params.max_bars_in_trade = calibrated5m.max_bars_in_trade;
  params.crypto_behavior_tuning = 1;

  return {
    params,
    config_source: runtimeOverrides.length > 0 ? "runtime_override" : cfg.config_source,
    base_config_source: cfg.config_source,
    runtime_overrides: runtimeOverrides,
  };
}

function withMicroScalperDiagnostics(result: EvalResult, cfg: StrategyConfig, runtime: ReturnType<typeof microScalperRuntimeParams>): EvalResult {
  const raw = String(result.rejection_reason || result.score_breakdown?.raw_rejection_reason || result.score_breakdown?.primary_failed_gate || "passed");
  const normalized = normalizeRejectionReason(raw, "crypto");
  return {
    ...result,
    score_breakdown: {
      ...result.score_breakdown,
      raw_rejection_reason: raw,
      normalized_rejection_reason: normalized,
      config_source: runtime.config_source,
      base_config_source: runtime.base_config_source,
      runtime_overrides: runtime.runtime_overrides.join(",") || "none",
      strategy_config_loaded: true,
      strategy_enabled: cfg.enabled,
      timeframe_allowed: true,
      evaluator_called: true,
      max_bars_in_trade: runtime.params.max_bars_in_trade,
      min_score: runtime.params.min_score,
      min_rr: runtime.params.min_rr,
      stop_atr_mult: runtime.params.stop_atr_mult,
      tp1_r: runtime.params.tp1_r,
      tp2_r: runtime.params.tp2_r,
      min_body_atr: runtime.params.min_body_atr,
      rsi_buy_min: runtime.params.rsi_buy_min,
      rsi_sell_max: runtime.params.rsi_sell_max,
      momentum_lookback: runtime.params.momentum_lookback,
      min_atr_pct: runtime.params.min_atr_pct,
      max_atr_pct: runtime.params.max_atr_pct,
      crypto_behavior_tuning: runtime.params.crypto_behavior_tuning === 1,
    },
  };
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
  QuickScalp: {
    riskClass: "fast_selective_scalp",
    signalRisk: { conservative: 0.2, balanced: 0.3, aggressive: 0.4 },
    personalBase: [0.25, 0.4], personalAPlusMax: 0.6,
    propBase: [0.1, 0.2], propAPlusMax: 0.25,
    leverage: {
      signal_mode: { normal: [2, 4], aPlusMax: 5 },
      personal_mode: { normal: [3, 6], aPlusMax: 8 },
      prop_mode: { normal: [1, 2], aPlusMax: 3 },
    },
    warning: "Fast scalp. Requires aggressive TP1, rapid profit lock, and no late entries.",
  },
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
  const { data: existing } = await supabase.from("paper_execution_intents").select("id").eq("signal_id", signalId).eq("mode_slug", modeSlug).limit(1).maybeSingle();
  if (existing?.id) return String(existing.id);
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

// ─── Binance ──────────────────────────────────────────────────────────────────

async function fetchBinanceCandles(symbol: string, timeframe: string, limit = 110): Promise<Candle[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const raw: unknown[][] = await res.json();
      if (raw && raw.length > 0) {
        return raw.map((k) => ({ symbol, market_type: "crypto", timeframe, open_time: new Date(k[0] as number).toISOString(), open: parseFloat(k[1] as string), high: parseFloat(k[2] as string), low: parseFloat(k[3] as string), close: parseFloat(k[4] as string), volume: parseFloat(k[5] as string), source: "binance" }));
      }
    }
  } catch {}
  try {
    const furl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const fres = await fetch(furl, { signal: AbortSignal.timeout(8000) });
    if (!fres.ok) return null;
    const fraw: unknown[][] = await fres.json();
    return fraw.map((k) => ({ symbol, market_type: "crypto", timeframe, open_time: new Date(k[0] as number).toISOString(), open: parseFloat(k[1] as string), high: parseFloat(k[2] as string), low: parseFloat(k[3] as string), close: parseFloat(k[4] as string), volume: parseFloat(k[5] as string), source: "binance" }));
  } catch { return null; }
}

type BinanceUniverseRow = {
  symbol: string;
  market_type: "crypto";
  is_active: boolean;
  universe_rank: number;
  universe_reason: string;
  quote_volume: number;
  price_change_pct: number;
  volatility_proxy: number;
};

const DEFAULT_STABLECOIN_BASES = new Set(["USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDE", "SUSDE", "EUR", "TRY", "BRL"]);

function scannerCsvSet(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.map((x) => normalizeSymbol(String(x))).filter(Boolean));
  return new Set(String(value ?? "").split(",").map((x) => normalizeSymbol(x)).filter(Boolean));
}

async function fetchDynamicBinanceUniverse(config: ScannerConfig): Promise<{ symbols: BinanceUniverseRow[]; warning: string | null }> {
  const fixedList = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "LINKUSDT", "AVAXUSDT", "LTCUSDT"];

  if (!config.dynamic_binance_universe_enabled) {
    const fixedRows = fixedList.map((sym, idx) => ({
      symbol: normalizeSymbol(sym),
      market_type: "crypto" as const,
      is_active: true,
      universe_rank: 100 - idx,
      universe_reason: "fixed_production_crypto_universe",
      quote_volume: 50_000_000,
      price_change_pct: 1.0,
      volatility_proxy: 1.0
    }));
    return { symbols: fixedRows, warning: null };
  }

  const envMaxCryptoRaw = Deno.env.get("SCANNER_MAX_CRYPTO_SYMBOLS") ?? undefined;
  const envMaxTotalRaw = Deno.env.get("SCANNER_MAX_SYMBOLS_PER_SCAN") ?? undefined;
  const configMax = (config.max_symbols_per_scan !== undefined && config.max_symbols_per_scan !== null) ? Number(config.max_symbols_per_scan) : null;

  let cryptoLimit = 10;
  if (envMaxCryptoRaw !== undefined) {
    cryptoLimit = boundedScannerLimit("SCANNER_MAX_CRYPTO_SYMBOLS", envMaxCryptoRaw, 10, SCANNER_HARD_MAX_CRYPTO_SYMBOLS);
  } else if (envMaxTotalRaw !== undefined) {
    cryptoLimit = Math.min(boundedScannerLimit("SCANNER_MAX_SYMBOLS_PER_SCAN", envMaxTotalRaw, 13, SCANNER_HARD_MAX_SYMBOLS_PER_SCAN), 10);
  } else if (configMax !== null && !isNaN(configMax)) {
    cryptoLimit = Math.min(configMax, 10);
  }

  cryptoLimit = boundedScannerLimit("SCANNER_MAX_CRYPTO_SYMBOLS", String(cryptoLimit), 10, SCANNER_HARD_MAX_CRYPTO_SYMBOLS);
  const maxSymbols = cryptoLimit;
  const minVolume = Math.max(0, Number(config.min_24h_volume ?? Deno.env.get("SCANNER_MIN_24H_VOLUME") ?? 10_000_000));
  const include = scannerCsvSet(config.include_symbols);
  const exclude = scannerCsvSet(config.exclude_symbols);
  const stableExclusions = scannerCsvSet(Deno.env.get("SCANNER_STABLECOIN_EXCLUSIONS"));
  for (const s of DEFAULT_STABLECOIN_BASES) stableExclusions.add(s);

  try {
    const [exchangeRes, tickerRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(8000) }),
      fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", { signal: AbortSignal.timeout(8000) }),
    ]);
    if (!exchangeRes.ok || !tickerRes.ok) throw new Error(`Binance universe HTTP ${exchangeRes.status}/${tickerRes.status}`);
    const exchangeInfo = await exchangeRes.json() as { symbols?: Array<{ symbol?: string; status?: string; contractType?: string; quoteAsset?: string; baseAsset?: string }> };
    const tickers = await tickerRes.json() as Array<Record<string, string>>;
    const tradable = new Map((exchangeInfo.symbols ?? [])
      .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && !stableExclusions.has(String(s.baseAsset ?? "").toUpperCase()))
      .map((s) => [String(s.symbol ?? "").toUpperCase(), s]));
    const ranked = tickers
      .map((t) => {
        const symbol = normalizeSymbol(String(t.symbol ?? ""));
        const quoteVolume = Number(t.quoteVolume ?? 0);
        const priceChangePct = Math.abs(Number(t.priceChangePercent ?? 0));
        const high = Number(t.highPrice ?? 0);
        const low = Number(t.lowPrice ?? 0);
        const last = Number(t.lastPrice ?? 0);
        const volatilityProxy = last > 0 ? ((high - low) / last) * 100 : 0;
        const score = Math.log10(Math.max(quoteVolume, 1)) * 18 + priceChangePct * 2.2 + volatilityProxy * 1.4;
        return { symbol, market_type: "crypto" as const, is_active: true, universe_rank: score, universe_reason: "dynamic_binance_usdt_perp_liquidity_volume_volatility", quote_volume: quoteVolume, price_change_pct: priceChangePct, volatility_proxy: volatilityProxy };
      })
      .filter((row) => tradable.has(row.symbol) && (row.quote_volume >= minVolume || include.has(row.symbol)) && !exclude.has(row.symbol))
      .sort((a, b) => b.universe_rank - a.universe_rank);
    const includedRows = Array.from(include).filter((symbol) => tradable.has(symbol) && !ranked.some((row) => row.symbol === symbol)).map((symbol) => ({ symbol, market_type: "crypto" as const, is_active: true, universe_rank: 999, universe_reason: "configured_include_symbol", quote_volume: 0, price_change_pct: 0, volatility_proxy: 0 }));
    const resultSymbols = [...includedRows, ...ranked].slice(0, maxSymbols);
    if (resultSymbols.length > 0) return { symbols: resultSymbols, warning: null };
    throw new Error("No dynamic symbols found");
  } catch (_e) {
    const fallbackRows = fixedList.map((sym, idx) => ({ symbol: sym, market_type: "crypto" as const, is_active: true, universe_rank: 100 - idx, universe_reason: "crypto_core_fixed", quote_volume: 50_000_000, price_change_pct: 1.0, volatility_proxy: 1.0 }));
    return { symbols: fallbackRows.slice(0, maxSymbols), warning: null };
  }
}


type ExecutionUniverse = { binance: Set<string>; bybit: Set<string>; selected: Set<string>; intersection: Set<string>; mode: string; mirrorRequiredForVip: boolean; executeSupportedProviderOnly: boolean; warning: string | null };

async function fetchBinanceTestnetSymbols(): Promise<Set<string>> {
  const res = await fetch("https://demo-fapi.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`binance_testnet_exchangeInfo_http_${res.status}`);
  const data = await res.json() as { symbols?: Array<{ symbol?: string; status?: string; quoteAsset?: string }> };
  return new Set((data.symbols ?? []).filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT").map((s) => normalizeSymbol(String(s.symbol ?? ""))).filter(Boolean));
}

async function fetchBybitTestnetSymbols(): Promise<Set<string>> {
  const res = await fetch("https://api-testnet.bybit.com/v5/market/instruments-info?category=linear&settleCoin=USDT", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`bybit_testnet_instruments_http_${res.status}`);
  const data = await res.json() as { retCode?: number; retMsg?: string; result?: { list?: Array<Record<string, unknown>> } };
  if (data.retCode !== 0) throw new Error(`bybit_testnet_instruments_${data.retCode}_${data.retMsg}`);
  return new Set((data.result?.list ?? []).filter((s) => String(s.status) === "Trading" && (String(s.quoteCoin) === "USDT" || String(s.settleCoin) === "USDT")).map((s) => normalizeSymbol(String(s.symbol ?? ""))).filter(Boolean));
}

async function loadExecutionUniverse(supabase: ReturnType<typeof createClient>): Promise<ExecutionUniverse> {
  let binance = new Set<string>(), bybit = new Set<string>(), warning: string | null = null;
  try { [binance, bybit] = await Promise.all([fetchBinanceTestnetSymbols(), fetchBybitTestnetSymbols()]); }
  catch (e) { warning = `execution_universe_sync_failed: ${e instanceof Error ? e.message : String(e)}`; }
  const { data } = await supabase.from("execution_provider_global_controls").select("primary_provider,parallel_mode_enabled,mirror_required_for_vip,execute_supported_provider_only").eq("id", 1).maybeSingle();
  const global = (data ?? {}) as Record<string, unknown>;
  const parallel = global.parallel_mode_enabled === true;
  const primary = String(global.primary_provider ?? "binance");
  const intersection = new Set([...binance].filter((x) => bybit.has(x)));
  const selected = parallel ? intersection : primary === "bybit" ? bybit : binance;
  return { binance, bybit, selected, intersection, mode: parallel ? "parallel" : primary, mirrorRequiredForVip: global.mirror_required_for_vip === true, executeSupportedProviderOnly: global.execute_supported_provider_only !== false, warning };
}

function executionTradability(symbol: string, universe: ExecutionUniverse): Record<string, unknown> {
  const normalized = normalizeSymbol(symbol);
  return { research_eligible: true, execution_eligible: universe.selected.has(normalized), binance_tradable: universe.binance.has(normalized), bybit_tradable: universe.bybit.has(normalized), execution_universe_mode: universe.mode, mirror_required_for_vip: universe.mirrorRequiredForVip };
}

// ─── Forex runtime diagnostics ───────────────────────────────────────────────
// Runtime Forex data is durable MT5 broker truth. Research providers are not
// imported or invoked by this production scanner.

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

// Research/diagnostic providers are isolated from the production scanner.
// Direct bridge HTTP reads are intentionally forbidden. The scanner consumes
// only account-scoped durable rows through MT5MarketDataProvider.

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
    provider: C2_FOREX_PROVIDER,
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
  const rateLimited = false;
  return {
    minIntervalMinutes: 0,
    lastForexScanAt,
    nextAllowedForexScanAt: new Date().toISOString(),
    rateLimited,
    reason: rateLimited ? "forex_skipped_rate_limit" : "",
  };
}

function buildForexScanBudget(symbols: Array<Record<string, unknown>>, timeframes: string[], _runType: "manual" | "scheduled"): ForexScanBudgetState {
  const canonicalSymbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"];
  const allowedPairs = new Set<string>();
  for (const symbol of canonicalSymbols) {
    for (const tf of timeframes) {
      allowedPairs.add(`${symbol}|${tf}`);
    }
  }
  const plannedProviderCalls = canonicalSymbols.length * timeframes.length;
  return {
    maxProviderCalls: plannedProviderCalls, maxPairs: canonicalSymbols.length, maxTimeframes: timeframes.length,
    plannedProviderCalls, plannedPairs: canonicalSymbols.length, plannedTimeframes: timeframes.length,
    allowedPairs, allowedSymbols: new Set(canonicalSymbols), allowedTimeframes: timeframes,
    budgetLimited: false,
  };
}

async function fetchForexCandles(
  symbol: string, tf: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass }> {
  const now = new Date().toISOString();

  if (!C2_FOREX_TIMEFRAMES.has(tf)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_timeframe: ${tf}`, statusClass: "unsupported_timeframe" };
  }

  const normalized = normalizeSymbol(symbol);
  if (!C2_FOREX_SYMBOLS.has(normalized)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_symbol: ${symbol}`, statusClass: "unsupported_symbol" };
  }

  const result = await loadMT5Candles(supabase, normalized, tf);
  if (!result.error && result.candles && result.candles.length >= 55) {
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "active",
      last_success_at: now, error_message: "", data_source_label: "REAL DATA",
      last_candles_count: result.candles.length, updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: result.candles, source: C2_FOREX_PROVIDER, data_source: "REAL DATA", providerError: null, statusClass: "ok" };
  }

  const candleCount = result.candles?.length ?? 0;
  const msg = result.error ?? `insufficient_candles: ${candleCount}`;
  const statusClass: ForexProviderStatusClass = result.error?.includes("STALE") ? "market_closed_or_stale" : result.error?.includes("CLOSED") ? "market_closed_or_stale" : "provider_error";
  await supabase.from("provider_status").upsert({
    provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "error",
    last_error_at: now,
    error_message: `${normalized} ${tf}: ${statusClass}: ${msg}`,
    data_source_label: "PROVIDER_ERROR", last_candles_count: candleCount, updated_at: now,
  }, { onConflict: "provider_name" });
  return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `${statusClass}: ${msg}`, statusClass };
}

// ─── Telegram formatter ───────────────────────────────────────────────────────



function tradeManagementPlan(signal: Record<string, unknown>): Record<string, unknown> {
  const strategy = String(signal.strategy_name ?? "");
  const marketType = String(signal.market_type ?? "").toLowerCase();
  const isForex = marketType === "forex";
  const riskPct = Number(signal.recommended_risk_pct);
  const riskGuidance = Number.isFinite(riskPct)
    ? `Keep position risk near ${riskPct.toFixed(2)}% of account unless your plan is lower.`
    : "Default guidance: risk no more than 0.50% of account per signal.";
  const levMin = Number(signal.suggested_leverage_min);
  const levMax = Number(signal.suggested_leverage_max);
  const exposureGuidance = isForex
    ? "Use effective exposure / lot size that keeps loss at the planned risk; account for spread and slippage."
    : Number.isFinite(levMin) && Number.isFinite(levMax)
      ? `Effective leverage guidance: ${levMin.toFixed(0)}x–${levMax.toFixed(0)}x maximum only if stop-risk stays within plan.`
      : "Use effective leverage only if stop-risk stays within the planned account risk.";

  if (strategy.includes("MicroScalper")) {
    return {
      tp1PartialPct: 50,
      breakEvenRule: "Move stop to break-even after TP1 is tagged or price reaches roughly +0.75R to +1R.",
      trailingStopRule: "After TP1, trail tightly behind the latest micro swing or fast EMA; do not widen the stop.",
      timeStopRule: "Expire quickly if entry is not triggered or momentum stalls within the expected scalping window.",
      invalidationNote: "Invalid if price closes beyond the stop or momentum immediately reverses through the entry zone.",
      strategyNote: "Scalper profile: take faster TP1, reduce exposure on correlated stacked signals, and avoid chasing late entries.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  if (strategy.includes("CompressionBreakout")) {
    return {
      tp1PartialPct: 40,
      breakEvenRule: "Move stop to break-even after TP1 or after breakout acceptance/retest confirmation.",
      trailingStopRule: "Trail only after volatility expands; allow normal retest room before tightening.",
      timeStopRule: "Expire if breakout follow-through does not arrive within the expected bars/time for this timeframe.",
      invalidationNote: "Watch for fakeouts: invalid if price closes back inside the compression box or beyond the stop.",
      strategyNote: "Breakout profile: allow retest room, avoid early stop tightening, and require momentum expansion for runners.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  if (strategy.includes("SwingContinuation")) {
    return {
      tp1PartialPct: 35,
      breakEvenRule: "Move stop to break-even more slowly: after TP1 confirms or trend structure advances in your favor.",
      trailingStopRule: "Use wider trailing behind higher-timeframe swing structure; keep TP2 as the runner target.",
      timeStopRule: "Use a longer time stop than scalps; expire if continuation does not develop within the swing window.",
      invalidationNote: "Invalid if trend structure fails, key pullback level breaks, or price closes beyond the stop.",
      strategyNote: "Swing continuation profile: wider hold, slower break-even, and TP2 runner logic are preferred.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  return {
    tp1PartialPct: 40,
    breakEvenRule: "Consider break-even only after TP1 or clear confirmation in your favor.",
    trailingStopRule: "Trail only after meaningful follow-through; never widen the original stop.",
    timeStopRule: "Expire if the setup does not trigger or follow through within your plan.",
    invalidationNote: String(signal.invalidation ?? "Invalid if price closes beyond the stop loss."),
    strategyNote: "Manage according to signal-mode rules.",
    riskGuidance, exposureGuidance,
    signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
  };
}

function existingOrDerivedTradeManagement(signal: Record<string, unknown>): Record<string, unknown> {
  const snapshot = signal.risk_profile_snapshot as Record<string, unknown> | null;
  if (snapshot && typeof snapshot === "object" && snapshot.trade_management && typeof snapshot.trade_management === "object") {
    return snapshot.trade_management as Record<string, unknown>;
  }
  return tradeManagementPlan(signal);
}

function formatTradeManagementLines(signal: Record<string, unknown>): string[] {
  const plan = existingOrDerivedTradeManagement(signal);
  return [
    `*Management:*`,
    `• TP1 Partial: ~${plan.tp1PartialPct ?? 40}%`,
    `• BE: ${plan.breakEvenRule}`,
    `• Trail: ${plan.trailingStopRule}`,
    `• Expiry: ${plan.timeStopRule}`,
    `• Signal-only: no broker/MT5/order execution.`,
  ];
}

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
  return Number.isFinite(num) && num > 0 ? num.toFixed(runtimeInstrument(symbol)?.price_precision ?? 0) : "N/A";
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
    `*Reference:* ${publicSignalReference(String(signal.id ?? signal.signal_id ?? symbol))}`,
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
    ...formatTradeManagementLines(signal),
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
    `*Reference:* ${publicSignalReference(String(signal.id ?? signal.signal_id ?? signal.symbol ?? "signal"))}`,
    `*Market:* ${String(signal.market_type ?? "").toUpperCase()}`,
    `*Timeframe:* ${signal.timeframe}`,
    `*Direction:* ${dirEmoji}`,
    `*Entry:* ${entryRange}`,
    `*Stop Loss:* ${Number(signal.stop_loss).toFixed(5)}`,
    `*TP1:* ${Number(signal.tp1).toFixed(5)}`,
    `*TP2:* ${Number(signal.tp2).toFixed(5)}`,
    `*Risk/Reward:* ${Number(signal.risk_reward).toFixed(2)}R`,
    ``,
    ...formatTradeManagementLines(signal),
    ``,
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
    event_id: signalId,
    event_type: deliveryType,
    destination_channel: "vip",
    destination_chat_id: chatId,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    delivery_status: status,
    retry_count: 0,
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
  const chatId = vipChatId();
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
  if (marketType === "forex" && !envBool("SIGNAL_ENABLE_FOREX", true)) return fail("skipped", "forex_env_disabled");
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

  if (!chatId) return fail("failed", "TELEGRAM_CHAT_ID missing", "not_configured");

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
  const [delivery] = await routeTelegramEvent(supabase, {
    event_id: signalId,
    event_type: deliveryType,
    signal_id: signalId,
    text,
    source: "market-scanner",
    channels: ["vip"],
    parse_mode: "Markdown",
    dedupe: true,
  });

  if (delivery?.status === "sent") {
    return { sent: true, status: "sent", blocked_reason: "", delivery_id: delivery.delivery_id };
  }
  const reason = delivery?.error_message ?? "telegram_delivery_failed";
  return {
    sent: false,
    status: delivery?.status === "skipped" ? "skipped" : "failed",
    blocked_reason: reason,
    delivery_id: delivery?.delivery_id,
  };

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
    const isForex = name.startsWith("Forex") || name === "GoldVolatilityBreakout";
    const forexContract = FOREX_STRATEGY_CONTRACTS.find((contract) => contract.legacyName === name);
    const isMicroScalper = name === "MicroScalper";
    const isQuickScalp = name === "QuickScalp";
    return {
      strategy_name: name,
      config_source:         cfg ? "db" : "fallback",
      enabled:               (cfg?.enabled as boolean)                      ?? true,
      signal_style:          (cfg?.signal_style as string)                  ?? (isForex ? "forex_signal" : "scalper"),
      risk_mode:             (cfg?.risk_mode as string)                     ?? (isForex ? "conservative" : "balanced"),
      min_score:             (cfg?.min_score as number)                     ?? (isQuickScalp ? 82 : isMicroScalper ? 72 : isForex ? 78 : 75),
      min_rr:                (cfg?.min_rr as number)                        ?? (isQuickScalp ? 1.15 : isMicroScalper ? 1.2 : isForex ? 1.4 : 1.2),
      min_stop_distance_pct: (cfg?.min_stop_distance_pct as number)         ?? (isForex ? 0.08 : 0.18),
      min_tp1_distance_pct:  (cfg?.min_tp1_distance_pct as number)          ?? (isForex ? 0.10 : 0.25),
      min_tp2_distance_pct:  (cfg?.min_tp2_distance_pct as number)          ?? (isForex ? 0.16 : 0.40),
      max_bars_in_trade:     (cfg?.max_bars_in_trade as number)             ?? (name === "SwingContinuation" ? 96 : name === "CompressionBreakout" ? 48 : isQuickScalp ? 12 : isMicroScalper ? 24 : isForex ? 48 : 32),
      allowed_symbols:       forexContract ? [...forexContract.symbols] : ((cfg?.allowed_symbols as string[]) ?? []),
      allowed_timeframes:    forexContract ? forexStrategyTimeframes(forexContract) : ((cfg?.allowed_timeframes as string[]) ?? (isQuickScalp ? ["5m", "15m"] : isMicroScalper ? ["5m", "15m"] : [])),
      params:                (cfg?.params as Record<string, number>)        ?? {},
    };
  };

  // Load mode configs and risk profiles
  const { data: modeRows } = await supabase.from("mode_configs").select("*");
  const { data: riskRows } = await supabase.from("risk_profiles").select("*");
  const modes = (modeRows ?? []) as ModeConfig[];
  const riskProfiles = (riskRows ?? []) as RiskProfile[];
  const activeModes = modes.filter((m) => m.enabled || m.mode_slug === "signal_mode");
  const { data: qualificationRows } = await supabase.from("backtest_runs").select("result_summary,created_at").eq("mode_slug", "qualification_campaign").eq("status", "completed").order("created_at", { ascending: false }).limit(100);
  const qualifiedSets = new Map<string, RuntimeQualifiedSet>();
  for (const row of qualificationRows ?? []) {
    const set = (row.result_summary as { qualifiedSet?: RuntimeQualifiedSet } | null)?.qualifiedSet;
    if (set?.id && !qualifiedSets.has(set.id)) qualifiedSets.set(set.id, set);
  }
  const scannerSignalPolicy = Object.freeze({ version: "global-scanner-signal-policy/v1", enabled: true, markets: Object.freeze(["FOREX", "CRYPTO"] as const), strategyIds: Object.freeze(Object.values(PROFESSIONAL_STRATEGY_IDS)) });

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
  let forexProviderName = C2_FOREX_PROVIDER;
  let cryptoSymbolsScanned = 0, forexSymbolsScanned = 0, forexSkippedCount = 0;
  let forexSkippedRateLimit = false, forexBudgetLimited = false;
  let forexProviderCallsAttempted = 0, forexProviderCallsPlanned = 0, forexProviderCallLimit = 0;
  let lastForexScanAt: string | null = null, nextAllowedForexScanAt: string | null = null;
  let forexSkipReason = config.signal_enable_forex ? "" : "forex_disabled_for_mvp";
  let forexProviderCacheHits = 0;
  const strategyNames: StrategyName[] = ["MicroScalper", "CompressionBreakout", "SwingContinuation", "QuickScalp", "ForexMicroScalper", "ForexSwingContinuation", "ForexLondonBreakout", "ForexNewYorkContinuation", "ForexTrendPullback", "GoldVolatilityBreakout"];
  const strategyEvaluationSummary = Object.fromEntries(strategyNames.map((name) => [name, {
    evaluated: 0,
    candidate_created: 0,
    candidate_count: 0,
    evaluator_pass: 0,
    candidate_passed_quality: 0,
    score_pass: 0,
    rr_pass: 0,
    distance_pass: 0,
    candidate_entered_arbitration: 0,
    arbitration_entered: 0,
    candidate_won: 0,
    arbitration_won: 0,
    signal_published: 0,
    signals_created: 0,
    execution_started: 0,
    execution_completed: 0,
    duplicate_pass: 0,
    accepted: 0,
    rejected: 0,
    rejection_count: 0,
    rejection_reasons: {},
    arbitration_blocked: 0,
    arbitration_losses: 0,
    arbitration_win_pct: 0,
    duplicate_active_signal: 0,
    runtime_errors: 0,
    skipped: 0,
    skip_reasons: {},
  }])) as Record<StrategyName, StrategyEvaluationStats>;
  const professionalStrategyDiagnostics = new StrategyDiagnostics();
  const arbitrationDiagnostics = new ArbitrationDiagnostics();
  const incrementStrategyStat = (name: string, key: keyof Omit<StrategyEvaluationStats, "skip_reasons" | "rejection_reasons">) => {
    const stats = strategyEvaluationSummary[name as StrategyName];
    if (stats) stats[key]++;
  };
  const recordStrategyRejection = (name: string, reason: string) => {
    const stats = strategyEvaluationSummary[name as StrategyName];
    if (!stats) return;
    stats.rejected++;
    stats.rejection_count++;
    const key = reason || "unknown";
    stats.rejection_reasons[key] = (stats.rejection_reasons[key] ?? 0) + 1;
  };
  const recordStrategySkip = (name: StrategyName, reason: string) => {
    const stats = strategyEvaluationSummary[name];
    stats.skipped++;
    stats.skip_reasons[reason] = (stats.skip_reasons[reason] ?? 0) + 1;
  };
  const recordStrategyError = (name: StrategyName, symbol: string, timeframe: string, error: unknown) => {
    incrementStrategyStat(name, "runtime_errors");
    errors.push(`[ERROR] ${name} ${symbol} ${timeframe}: ${error instanceof Error ? error.message : String(error ?? "unknown")}`);
  };
  const forexFetchCache = new Map<string, { candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass }>();
  const cryptoFetchCache = new Map<string, Candle[] | null>();
  let cryptoProviderRequests = 0;
  const forexProviderRejectionKeys = new Set<string>();
  const marketMode = signalMarketMode(config.signal_enable_crypto, config.signal_enable_forex);

  async function recordForexRejection(symbol: string, timeframe: string, reason: string, dataSource = "PROVIDER_ERROR", detail = "") {
    const normalizedReason = normalizeRejectionReason(reason, "forex");
    const key = `${symbol}|${timeframe}|${normalizedReason}`;
    if (dataSource === "PROVIDER_ERROR" && forexProviderRejectionKeys.has(key)) return;
    if (dataSource === "PROVIDER_ERROR") forexProviderRejectionKeys.add(key);
    rejectedCount++;
    if (SCANNER_COMPACT_LOGS) return;
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
  async function fetchCryptoCandlesForRun(symbol: string, tf: string) {
    const key = `${normalizeSymbol(symbol)}|${tf}`;
    if (cryptoFetchCache.has(key)) return cryptoFetchCache.get(key) ?? null;
    if (cryptoProviderRequests >= SCANNER_HARD_LIMITS.providerRequests) throw new Error("CRYPTO_PROVIDER_REQUEST_BUDGET_EXHAUSTED");
    cryptoProviderRequests++;
    const value = await fetchBinanceCandles(symbol, tf, 110);
    cryptoFetchCache.set(key, value);
    return value;
  }

  // Attempt to load from hashibot_symbol_universes if it exists and has rows
  let hashibotUniverseSymbols: any[] = [];
  try {
    const { data: huData, error: huError } = await supabase
      .from("hashibot_symbol_universes")
      .select("symbol, market_type")
      .eq("enabled", true)
      .eq("scan_enabled", true);
    if (!huError && huData && huData.length > 0) {
      hashibotUniverseSymbols = huData;
    }
  } catch (_err) {
    // Gracefully ignore if table doesn't exist
  }

  const { data: configuredSymbols } = await supabase.from("symbols").select("*").eq("is_active", true);

  // Fixed 10-symbol production crypto universe
  const cryptoCoreList = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "LINKUSDT", "AVAXUSDT", "LTCUSDT"];
  // Fixed 6-symbol production forex & gold universe
  const canonicalForexList = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"];

  const dynamicUniverse = config.signal_enable_crypto ? await fetchDynamicBinanceUniverse(config) : { symbols: [], warning: null };
  if (dynamicUniverse.warning) errors.push(`[WARN] ${dynamicUniverse.warning}`);

  const executionUniverse = await loadExecutionUniverse(supabase);
  if (executionUniverse.warning) errors.push(`[WARN] ${executionUniverse.warning}`);

  let cryptoToScan = config.signal_enable_crypto
    ? (dynamicUniverse.symbols.length > 0
        ? dynamicUniverse.symbols
        : cryptoCoreList.map((sym, idx) => ({ symbol: sym, market_type: "crypto" as const, is_active: true, universe_rank: 100 - idx, universe_reason: "crypto_core_fixed", quote_volume: 50_000_000, price_change_pct: 1.0, volatility_proxy: 1.0 })))
    : [];

  let forexToScan = config.signal_enable_forex
    ? canonicalForexList.map((sym) => ({ symbol: sym, market_type: "forex" as const, is_active: true }))
    : [];

  // Phase K: limits are validated before the provider loop. Invalid or excessive
  // configuration aborts the whole cycle rather than silently scanning a larger
  // universe. Forex cannot exceed the six symbols whose contracts are locked.
  const boundedUniverse = boundedScannerUniverse(cryptoToScan, forexToScan, Deno.env.get("SCANNER_MAX_CRYPTO_SYMBOLS") ?? undefined, Deno.env.get("SCANNER_MAX_FOREX_SYMBOLS") ?? undefined, Deno.env.get("SCANNER_MAX_SYMBOLS_PER_SCAN") ?? undefined);
  forexToScan = boundedUniverse.forex;
  cryptoToScan = boundedUniverse.crypto;

  let symbols = [
    ...cryptoToScan,
    ...forexToScan,
  ];

  if (!symbols || symbols.length === 0) {
    await supabase.from("scanner_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: "No active symbols" }).eq("id", runId);
    throw new Error("No active symbols configured");
  }
  if (dynamicUniverse.symbols.length > 0) {
    errors.push(`[INFO] crypto_universe symbols=${cryptoToScan.length} forex_universe symbols=${forexToScan.length}`);
  }

  const forexScanTimeframes = forexTimeframes();
  let forexThrottle: ForexScanThrottleState | null = null;
  let forexBudget: ForexScanBudgetState | null = null;
  if (config.signal_enable_forex) {
    const forceForexScan = false;
    forexThrottle = await getForexThrottleState(supabase, runId, forceForexScan);
    lastForexScanAt = forexThrottle.lastForexScanAt;
    nextAllowedForexScanAt = forexThrottle.nextAllowedForexScanAt;
    if (forexThrottle.reason && !forexThrottle.rateLimited) errors.push(`[WARN] ${forexThrottle.reason}`);

    forexBudget = buildForexScanBudget(configuredSymbols as Array<Record<string, unknown>>, forexScanTimeframes, runType);
    forexProviderCallsPlanned = forexBudget.plannedProviderCalls;
    forexProviderCallLimit = forexBudget.maxProviderCalls;
    forexBudgetLimited = forexBudget.budgetLimited;
    if (forexBudgetLimited) errors.push(`[WARN] forex_provider_call_budget_limited planned=${forexProviderCallsPlanned} max=${forexProviderCallLimit} max_pairs=${forexBudget.maxPairs} max_timeframes=${forexBudget.maxTimeframes}`);

    if (forexThrottle.rateLimited) {
      forexSkippedRateLimit = true;
      forexSkipReason = "forex_skipped_rate_limit";
      errors.push(`[SKIP] forex_skipped_rate_limit last=${lastForexScanAt ?? "unknown"} next=${nextAllowedForexScanAt ?? "unknown"} min_interval=${forexThrottle.minIntervalMinutes}`);
    }
  }

  const activeSymbolSet = new Set<string>();
  const activeSignalBySymbol = new Map<string, { id: string; status: string; created_at: string | null }>();
  if (config.prevent_duplicate_symbol_signals) {
    const { data: activeSigs } = await supabase.from("signals").select("id,symbol,status,created_at").in("status", ["waiting", "active"]);
    for (const sig of (activeSigs ?? []) as Array<{ id: string; symbol: string; status: string; created_at: string | null }>) {
      activeSymbolSet.add(sig.symbol);
      if (!activeSignalBySymbol.has(sig.symbol)) activeSignalBySymbol.set(sig.symbol, { id: sig.id, status: sig.status, created_at: sig.created_at });
    }
  }

  for (const sym of symbols) {
    // Respect effective market toggles before any provider function is called.
    if (sym.market_type === "crypto" && !config.signal_enable_crypto) continue;
    if (sym.market_type === "forex" && !config.signal_enable_forex) { forexSkippedCount++; continue; }
    if (sym.market_type === "forex" && forexSkippedRateLimit) { forexSkippedCount++; continue; }

    const normalizedSymbol = normalizeSymbol(String(sym.symbol));
    const marketType = String(sym.market_type ?? "").toLowerCase();

    if (marketType === "forex" && !isForexRuntimeSymbol(normalizedSymbol)) {
      forexSkippedCount++;
      for (const tf of forexScanTimeframes) {
        await recordForexRejection(normalizedSymbol, tf, "unsupported_symbol", "PROVIDER_ERROR", `Unsupported Forex/Gold symbol ${normalizedSymbol}; canonical universe: ${FOREX_RUNTIME_SYMBOLS.join(", ")}`);
      }
      continue;
    }
    if (marketType === "forex") {
      const eligibility = FOREX_STRATEGY_CONTRACTS.map((contract) => forexStrategyEligibility(contract, normalizedSymbol));
      if (eligibility.every((result) => !result.eligible)) {
        forexSkippedCount++;
        const reason = eligibility.find((result) => result.reason === "gold_strategy_not_certified")?.reason ?? eligibility[0]?.reason ?? "unsupported_instrument_class";
        for (const tf of forexScanTimeframes) await recordForexRejection(normalizedSymbol, tf, reason, "REAL DATA", `${normalizedSymbol} market data is enabled, but no production strategy is certified for ${runtimeInstrument(normalizedSymbol)?.instrument_class ?? "unknown"}`);
        continue;
      }
    }

    symbolsScanned++;
    if (marketType === "crypto") cryptoSymbolsScanned++;
    if (marketType === "forex") {
      forexSymbolsScanned++;
    }
    const timeframesToScan = marketType === "forex" ? forexScanTimeframes : config.active_timeframes;
    for (const tf of timeframesToScan) {
      if (tf === "4h" && marketType === "crypto" && !["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD"].includes(sym.symbol)) continue;
      if (marketType === "forex" && forexBudget && !forexBudget.allowedPairs.has(`${normalizedSymbol}|${tf}`)) {
        forexSkippedCount++;
        await recordForexRejection(normalizedSymbol, tf, "forex_budget_limited", "PROVIDER_ERROR", `Forex provider budget skipped ${normalizedSymbol} ${tf} before MT5 durable provider read`);
        continue;
      }

      let candles: Candle[] | null = null;
      let dataSource = "PROVIDER_ERROR";

      try {
        if (marketType === "crypto") {
          const fetched = await fetchCryptoCandlesForRun(sym.symbol, tf);
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
        const admitted = admitClosedRuntimeCandles(candles, timeframeMinutes(tf) ?? 5, Date.now());
        if (admitted.rejection || admitted.candles.length < 55) {
          const reason = admitted.rejection ?? "insufficient_closed_candles";
          if (marketType === "forex") await recordForexRejection(normalizedSymbol, tf, reason, dataSource, `Closed-candle admission failed; mutable_dropped=${admitted.mutableDropped}`);
          errors.push(`[SKIP] ${sym.symbol} ${tf} ${reason}`);
          continue;
        }
        candles = admitted.candles;
        candlesFetched += candles.length;

        if (!SCANNER_DISABLE_CANDLE_PERSISTENCE) {
        await supabase.from("candles").upsert(candles.map((c) => ({
          symbol: c.symbol, market_type: c.market_type, timeframe: c.timeframe,
          open_time: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume, source: c.source,
        })), { onConflict: "symbol,timeframe,open_time" });

        }
        const ind = calculateIndicators(candles);
        const marketContext = classifyMarketContext(ind, candles);
        indicatorsCalc++;
        const lastCandle = candles[candles.length - 1];
        const candleCloseTime = new Date(Date.parse(lastCandle.open_time) + (timeframeMinutes(tf) ?? 5) * 60_000).toISOString();
        if (!SCANNER_DISABLE_INDICATOR_SNAPSHOTS) {
        await supabase.from("indicator_snapshots").upsert({
          symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, candle_time: lastCandle.open_time,
          ema20: ind.ema20, ema50: ind.ema50, atr14: ind.atr14, rsi14: ind.rsi14,
          recent_high: ind.recent_high, recent_low: ind.recent_low,
          volatility_state: ind.volatility_state, regime: ind.regime,
        }, { onConflict: "symbol,timeframe,candle_time" });
        }

        const allEvals: Array<{ name: StrategyName; result: EvalResult; cfg: StrategyConfig; plan: DeepReadonly<StrategyPlan> }> = [];
        const activeDefinitions: StrategyDefinition[] = [];
        let fifteenMinuteCandles: Candle[] | undefined;
        if (marketType === "crypto" && tf === "5m") {
          try {
            const fetched15m = await fetchCryptoCandlesForRun(sym.symbol, "15m");
            if (fetched15m && fetched15m.length >= 55) fifteenMinuteCandles = fetched15m;
          } catch (htfErr) {
            errors.push(`[WARN] MicroScalper ${sym.symbol} 5m HTF confirmation unavailable: ${htfErr instanceof Error ? htfErr.message : String(htfErr ?? "unknown")}`);
          }
        }
        const registerLegacy = (name: StrategyName, id: string, version: string, cfg: StrategyConfig, evaluator: () => EvalResult) => {
          if (!cfg.enabled) recordStrategySkip(name, "strategy_disabled");
          else if (cfg.allowed_timeframes.length > 0 && !cfg.allowed_timeframes.includes(tf)) recordStrategySkip(name, `timeframe_not_allowed:${tf}`);
          activeDefinitions.push({ id, version, legacyName: name, market: marketType as "crypto" | "forex", lifecycle: "ENABLED", config: cfg, evaluate: evaluator });
        };
        if (marketType === "forex") {
          for (const contract of FOREX_STRATEGY_CONTRACTS) {
            const strategyConfig = getStratCfg(contract.legacyName);
            if (!strategyConfig.enabled) { recordStrategySkip(contract.legacyName, "strategy_disabled"); continue; }
            if (!contract.primaryTimeframes.includes(tf)) { recordStrategySkip(contract.legacyName, `context_timeframe_not_evaluated:${tf}`); continue; }
            const eligibility = forexStrategyEligibility(contract, normalizedSymbol);
            if (!eligibility.eligible) { recordStrategySkip(contract.legacyName, eligibility.reason ?? "instrument_not_eligible"); continue; }
            const registeredEvaluator = forexEvaluatorFor(contract.id);
            registerLegacy(contract.legacyName, contract.id, contract.version, strategyConfig, () => registeredEvaluator({ symbol: normalizedSymbol, market: "forex", timeframe: tf, candles, indicators: ind, evaluated_at: new Date().toISOString() }, { ...strategyConfig.params, min_score: strategyConfig.min_score, min_rr: strategyConfig.min_rr }));
          }
          for (const research of FOREX_RESEARCH_STRATEGIES) {
            if (research.id in FOREX_PRODUCTION_EVALUATORS) continue;
            activeDefinitions.push({ id: research.id, version: research.version, legacyName: research.id, market: "forex", lifecycle: "RESEARCH", publicationMode: "SHADOW", certification: "RESEARCH", config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: research.id, allowed_symbols: [...research.symbols], allowed_timeframes: [...research.timeframes] }, evaluate: (context) => research.evaluate(context) });
          }
        } else {
          const msConfig = getStratCfg("MicroScalper"), qsConfig = getStratCfg("QuickScalp"), cbConfig = getStratCfg("CompressionBreakout"), swConfig = getStratCfg("SwingContinuation");
          const msRuntime = microScalperRuntimeParams(msConfig, tf);
          registerLegacy("MicroScalper", "crypto.micro-scalper", "1.0.0", msConfig, () => withMicroScalperDiagnostics(evalMicroScalper(candles, ind, tf, msRuntime.params, fifteenMinuteCandles), msConfig, msRuntime));
          registerLegacy("QuickScalp", "crypto.quick-scalp", "1.0.0", qsConfig, () => evalQuickScalp(candles, ind, tf, { ...qsConfig.params, min_score: qsConfig.min_score, min_rr: qsConfig.min_rr, max_bars_in_trade: qsConfig.max_bars_in_trade }));
          registerLegacy("CompressionBreakout", "crypto.compression-breakout", "1.0.0", cbConfig, () => evalCompressionBreakout(candles, ind, tf, { ...cbConfig.params, min_score: cbConfig.min_score, min_rr: cbConfig.min_rr, max_bars_in_trade: cbConfig.max_bars_in_trade, crypto_behavior_tuning: 1 }));
          registerLegacy("SwingContinuation", "crypto.swing-continuation", "1.0.0", swConfig, () => evalSwingContinuation(candles, ind, tf, { ...swConfig.params, min_score: swConfig.min_score, min_rr: swConfig.min_rr, max_bars_in_trade: swConfig.max_bars_in_trade, crypto_behavior_tuning: 1 }));
          activeDefinitions.push(
            { id: "crypto.trend-pullback", version: "0.1.0-research", legacyName: "CryptoTrendPullback", market: "crypto", lifecycle: "RESEARCH", publicationMode: "SHADOW", certification: "RESEARCH", config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: "CryptoTrendPullback" }, evaluate: evaluateCryptoTrendPullback },
            { id: "crypto.reversal-exhaustion", version: "0.1.0-research", legacyName: "ReversalExhaustion", market: "crypto", lifecycle: "RESEARCH", publicationMode: "SHADOW", certification: "RESEARCH", config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: "ReversalExhaustion" }, evaluate: evaluateReversalExhaustion },
          );
        }
        const strategyContext: StrategyEvaluationContext = { symbol: normalizedSymbol, market: marketType as "crypto" | "forex", timeframe: tf, candles, indicators: ind, evaluated_at: new Date().toISOString() };
        const registry = new ProfessionalStrategyRegistry(activeDefinitions, professionalStrategyDiagnostics);
        for (const evaluation of evaluateActiveStrategies(registry, strategyContext)) {
          if (!evaluation.publishable) arbitrationDiagnostics.researchExcluded();
          if (!evaluation.publishable) continue;
          const name = evaluation.definition.legacyName as StrategyName;
          if (evaluation.professional.rejection_reasons.includes("runtime_error")) recordStrategyError(name, sym.symbol, tf, evaluation.professional.legacy.reason);
          allEvals.push({ name, cfg: evaluation.definition.config as StrategyConfig, result: evaluation.professional.legacy as EvalResult, plan: evaluation.plan });
        }

        // ── Pre-arbitration: collect passing candidates, pick the best one ──
        // All evaluations are recorded as candidates. Among those that pass
        // distance guards, only the top-scoring one proceeds to signal creation.
        const passingEntries: EvalEntry[] = [];
        for (const ev of allEvals) {
          evaluationsCount++;
          incrementStrategyStat(ev.name, "evaluated");
          const r = ev.result;
          if (r.status !== "rejected") {
            incrementStrategyStat(ev.name, "candidate_created");
            incrementStrategyStat(ev.name, "candidate_count");
          }

          const normalizedRejectionReason = normalizeRejectionReason(r.rejection_reason, marketType);
          const candidateScoreBreakdown = ev.name === "MicroScalper"
            ? {
              ...(r.score_breakdown ?? {}),
              normalized_rejection_reason: normalizedRejectionReason || "passed",
              raw_rejection_reason: r.rejection_reason || r.score_breakdown?.raw_rejection_reason || "passed",
              primary_failed_gate: r.score_breakdown?.primary_failed_gate ?? (r.rejection_reason || "passed"),
              distance_guard: r.status === "rejected" ? "not_reached" : (r.score_breakdown?.distance_guard ?? "pending"),
              arbitration: r.status === "rejected" ? "not_reached" : (r.score_breakdown?.arbitration ?? "pending"),
              duplicate_guard: r.status === "rejected" ? "not_reached" : (r.score_breakdown?.duplicate_guard ?? "pending"),
              signal_insert: r.status === "rejected" ? "not_reached" : (r.score_breakdown?.signal_insert ?? "pending"),
              telegram_eligibility: r.status === "rejected" ? "not_reached" : (r.score_breakdown?.telegram_eligibility ?? "pending"),
            }
            : r.score_breakdown;
          const candidateRow = {
            scanner_run_id: runId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf,
            strategy_name: ev.name, direction: r.direction || "none",
            entry_low: r.entry_low || null, entry_high: r.entry_high || null,
            stop_loss: r.stop_loss || null, tp1: r.tp1 || null, tp2: r.tp2 || null,
            risk_reward: r.risk_reward || null, regime: ind.regime,
            confidence_score: r.confidence_score, grade: r.grade,
            reason: r.reason, rejection_reason: normalizedRejectionReason,
            status: r.status, data_source: dataSource, score_breakdown: { ...(candidateScoreBreakdown ?? {}), market_context: marketContext },
          };

          const { data: cData } = await supabase.from("strategy_candidates").insert(candidateRow).select("id").single();
          if (!cData) continue;

          if (r.confidence_score >= ev.cfg.min_score) incrementStrategyStat(ev.name, "score_pass");
          if (r.risk_reward >= ev.cfg.min_rr) incrementStrategyStat(ev.name, "rr_pass");

          if (r.status === "rejected") { recordStrategyRejection(ev.name, normalizedRejectionReason); rejectedCount++; continue; }
          incrementStrategyStat(ev.name, "evaluator_pass");
          incrementStrategyStat(ev.name, "candidate_passed_quality");

          // Distance guard
          const guard = checkDistanceGuards(r, ev.cfg);
          if (!guard.passed) {
            const guardedBreakdown = {
              ...(r.score_breakdown ?? {}),
              primary_failed_gate: "distance_guard_failed",
              raw_rejection_reason: guard.rejection_reason,
              normalized_rejection_reason: normalizeRejectionReason(guard.rejection_reason, marketType),
              distance_guard: "failed",
              distance_guard_reason: guard.rejection_reason,
              guard_sl_pct: parseFloat(guard.sl_pct.toFixed(4)),
              guard_tp1_pct: parseFloat(guard.tp1_pct.toFixed(4)),
              guard_tp2_pct: parseFloat(guard.tp2_pct.toFixed(4)),
              guard_rr: parseFloat(guard.rr.toFixed(3)),
              arbitration: "not_reached",
              duplicate_guard: "not_reached",
              signal_insert: "not_reached",
              telegram_eligibility: "not_reached",
            };
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: normalizeRejectionReason(guard.rejection_reason, marketType),
              score_breakdown: guardedBreakdown,
            }).eq("id", cData.id);
            recordStrategyRejection(ev.name, normalizeRejectionReason(guard.rejection_reason, marketType));
            rejectedCount++;
            continue;
          }

          incrementStrategyStat(ev.name, "distance_pass");
          incrementStrategyStat(ev.name, "candidate_entered_arbitration");
          incrementStrategyStat(ev.name, "arbitration_entered");
          passingEntries.push({ name: ev.name, result: r, cfg: ev.cfg, guard, plan: ev.plan });
          // tag candidate id for later use
          (passingEntries[passingEntries.length - 1] as EvalEntry & { _candidateId: string })._candidateId = cData.id;
        }

        // One pure compatibility arbitrator reproduces the legacy score → identity → RR ordering.
        const arbitrationInput: ArbitrationCandidate[] = passingEntries.map((entry, index) => ({
          id: String((entry as EvalEntry & { _candidateId: string })._candidateId),
          strategyId: PROFESSIONAL_STRATEGY_IDS[entry.name], strategyVersion: "1.0.0",
          market: marketType as "crypto" | "forex", symbol: normalizedSymbol, timeframe: tf,
          side: entry.result.direction.toLowerCase() as "buy" | "sell", confidence: entry.result.confidence_score,
          grade: entry.result.grade, score: arbitrationScore(entry, marketContext),
          entry: (entry.result.entry_low + entry.result.entry_high) / 2, stop: entry.result.stop_loss,
          targets: [entry.result.tp1, entry.result.tp2], riskReward: entry.result.risk_reward,
          expiry: new Date(Date.now() + entry.cfg.max_bars_in_trade * (timeframeMinutes(tf) ?? 5) * 60_000).toISOString(), fresh: true,
          lifecycle: "ENABLED", publicationMode: "LIVE", evidence: { legacy_index: index }, rejectionReasons: [],
          priority: strategyIdentityFit(entry), eligible: true,
        }));
        const byCandidateId = new Map(passingEntries.map((entry) => [String((entry as EvalEntry & { _candidateId: string })._candidateId), entry]));
        const decisionStarted = Date.now();
        let noTradeReason = "";
        const arbitrationDecision = arbitrateActiveScanner(arbitrationInput, { now: new Date(), noTradePolicy: (ranked) => {
          const rankedEntries = ranked.map((candidate) => byCandidateId.get(candidate.id)!).filter(Boolean);
          noTradeReason = arbitrationNoTradeReason(marketContext, rankedEntries);
          return noTradeReason || undefined;
        } });
        passingEntries.splice(0, passingEntries.length, ...arbitrationDecision.considered.map((candidate) => byCandidateId.get(candidate.id)!).filter(Boolean));
        arbitrationDiagnostics.record(arbitrationDecision, Date.now() - decisionStarted);
        const arbitrationCandidates = arbitrationSnapshot(passingEntries, marketContext);
        const selectedArbitrationScore = arbitrationDecision.winner?.score ?? (passingEntries.length > 0 ? arbitrationScore(passingEntries[0], marketContext) : 0);
        const selectedStrategyName = arbitrationDecision.winner ? (byCandidateId.get(arbitrationDecision.winner.id)?.name ?? "none") : "none";
        const arbitrationScope = `${marketType}:${normalizedSymbol}:${tf}`;
        const cycleConfigurationVersion = scannerConfigurationVersion(allEvals.map(entry => ({ strategyId: entry.plan.identity.strategy_id, strategyVersion: entry.plan.identity.strategy_version, configSource: entry.cfg.config_source, parameters: entry.cfg.params, minScore: entry.cfg.min_score, minRiskReward: entry.cfg.min_rr })));
        const decisionCycleKey = scannerCycleKey({ market: marketType, symbol: normalizedSymbol, timeframe: tf, candleCloseTime, strategyId: ACTIVE_SCANNER_FRAMEWORK, strategyVersion: "1", configurationVersion: cycleConfigurationVersion });
        if (!arbitrationDecision.winner) {
          await commitScannerDecision(supabase, { cycleKey: decisionCycleKey, runId, scope: arbitrationScope, decision: "NO_TRADE", reasonCodes: arbitrationDecision.rejected.flatMap(row => row.reasons).length ? arbitrationDecision.rejected.flatMap(row => row.reasons) : [noTradeReason || "NO_QUALIFIED_CANDIDATE"], arbitration: { ...arbitrationDecision, framework: ACTIVE_SCANNER_FRAMEWORK, arbitrator: ACTIVE_SCANNER_ARBITRATOR } });
        }
        if (arbitrationDecision.winner) {
          const selected = byCandidateId.get(arbitrationDecision.winner.id);
          if (!selected || !Object.isFrozen(selected.plan)) throw new Error("certified_winner_strategy_plan_missing_or_mutable");
          const { error: strategyPlanError } = await supabase.from("certified_strategy_plans").insert({
            evaluation_id: selected.plan.provenance.evaluation_id,
            candidate_id: arbitrationDecision.winner.id,
            scanner_run_id: runId,
            arbitration_decision_key: arbitrationDecision.decisionKey,
            strategy_id: selected.plan.identity.strategy_id,
            strategy_version: selected.plan.identity.strategy_version,
            canonical_side: selected.plan.decision.action,
            symbol: selected.plan.market_context.symbol,
            market: selected.plan.identity.asset_class,
            strategy_plan: selected.plan,
          });
          if (strategyPlanError) throw new Error(`certified_strategy_plan_persistence_failed:${strategyPlanError.message}`);


        }
        if (noTradeReason) {
          for (const blockedEntry of passingEntries as Array<EvalEntry & { _candidateId: string }>) {
            const r = blockedEntry.result;
            const noTradeBreakdown = {
              ...(r.score_breakdown ?? {}),
              rejection_stage: "arbitration",
              rejection_rule: noTradeReason,
              threshold: { min_score: 0.68, max_chop: 76, required_grade: "A+" },
              measured_value: { chop_level: marketContext.chop_level, mixed_market: marketContext.mixed_market, top_score: selectedArbitrationScore },
              required_value: { grade: "A+", preferred_strategy: marketContext.preferred_strategy },
              strategy_id: PROFESSIONAL_STRATEGY_IDS[blockedEntry.name] || blockedEntry.name,
              symbol: sym.symbol,
              timeframe: tf,
              score: arbitrationScore(blockedEntry, marketContext),
              confidence: r.confidence_score,
              RR: r.risk_reward,
              entry: (r.entry_low + r.entry_high) / 2,
              stop: r.stop_loss,
              current_market_price: marketContext.current_price,
              distance_percent: parseFloat(((Math.abs(marketContext.current_price - r.stop_loss) / marketContext.current_price) * 100).toFixed(4)),
              freshness: true,
              duplicate_state: "not_reached",
              primary_failed_gate: noTradeReason,
              raw_rejection_reason: noTradeReason,
              normalized_rejection_reason: noTradeReason,
              distance_guard: "passed",
              arbitration: "no_trade",
              arbitration_blocked: true,
              arbitration_no_trade_reason: noTradeReason,
              market_regime: marketContext.regime,
              market_context: marketContext,
              market_preferred_strategy: marketContext.preferred_strategy,
              selected_strategy: "none",
              selected_timeframe: tf,
              selected_score: selectedArbitrationScore,
              arbitration_score: arbitrationScore(blockedEntry, marketContext),
              candidate_arbitration_score: arbitrationScore(blockedEntry, marketContext),
              arbitration_candidates: arbitrationCandidates,
              duplicate_guard: "not_reached",
              signal_insert: "not_reached",
              telegram_eligibility: "not_reached",
            };
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: noTradeReason,
              score_breakdown: noTradeBreakdown,
            }).eq("id", blockedEntry._candidateId);
            incrementStrategyStat(blockedEntry.name, "arbitration_blocked");
            incrementStrategyStat(blockedEntry.name, "arbitration_losses");
            recordStrategyRejection(blockedEntry.name, noTradeReason);
            rejectedCount++;
          }
          continue;
        }
        if (!arbitrationDecision.winner) continue;

        for (let idx = 0; idx < passingEntries.length; idx++) {
          const ev = passingEntries[idx] as EvalEntry & { _candidateId: string };
          const r = ev.result;
          const cId = ev._candidateId;
          const isWinner = idx === 0;

          if (!isWinner) {
            // Loser in arbitration — update candidate and skip with explicit diagnostics.
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: "arbitration_blocked",
              score_breakdown: {
                ...(r.score_breakdown ?? {}),
                primary_failed_gate: "arbitration_blocked",
                raw_rejection_reason: "arbitration_blocked",
                normalized_rejection_reason: "arbitration_blocked",
                distance_guard: "passed",
                arbitration: "lost",
                arbitration_blocked: true,
                better_candidate_selected: true,
                lower_quality_than_selected: true,
                arbitration_score: arbitrationScore(ev, marketContext),
                selected_strategy: selectedStrategyName,
                selected_timeframe: tf,
                selected_score: selectedArbitrationScore,
                microscalper_score: ev.name === "MicroScalper" ? arbitrationScore(ev, marketContext) : null,
                arbitration_loss_reason: arbitrationLossReason(ev, passingEntries[0], marketContext),
                strategy_order_affected_result: false,
                selected_arbitration_score: selectedArbitrationScore,
                candidate_arbitration_score: arbitrationScore(ev, marketContext),
                arbitration_candidates: arbitrationCandidates,
                duplicate_guard: "not_reached",
                signal_insert: "not_reached",
                telegram_eligibility: "not_reached",
              },
            }).eq("id", cId);
            incrementStrategyStat(ev.name, "arbitration_blocked");
            incrementStrategyStat(ev.name, "arbitration_losses");
            recordStrategyRejection(ev.name, "arbitration_blocked");
            rejectedCount++;
            continue;
          }

          incrementStrategyStat(ev.name, "arbitration_won");
          await supabase.from("strategy_candidates").update({
            score_breakdown: {
              ...(r.score_breakdown ?? {}),
              primary_failed_gate: r.score_breakdown?.primary_failed_gate ?? "passed",
              normalized_rejection_reason: "passed",
              distance_guard: "passed",
              arbitration: "selected",
              arbitration_selected: true,
              market_regime: marketContext.regime,
              market_context: marketContext,
              winner_matched_regime: marketContext.preferred_strategy === selectedStrategyName,
              market_preferred_strategy: marketContext.preferred_strategy,
              selected_strategy: selectedStrategyName,
              selected_timeframe: tf,
              selected_score: selectedArbitrationScore,
              microscalper_score: ev.name === "MicroScalper" ? selectedArbitrationScore : null,
              strategy_order_affected_result: false,
              arbitration_score: selectedArbitrationScore,
              selected_arbitration_score: selectedArbitrationScore,
              candidate_arbitration_score: selectedArbitrationScore,
              arbitration_candidates: arbitrationCandidates,
            },
          }).eq("id", cId);

          // Winner — proceed through existing gates
          candidatesFound++;

          // Duplicate gate
          if (config.prevent_duplicate_symbol_signals && activeSymbolSet.has(sym.symbol)) {
            const blockingSignal = activeSignalBySymbol.get(sym.symbol);
            const blockingAgeMinutes = blockingSignal?.created_at ? Math.max(0, Math.round((Date.now() - new Date(blockingSignal.created_at).getTime()) / 60000)) : null;
            await supabase.from("strategy_candidates").update({
              status: "rejected",
              rejection_reason: "duplicate_active_signal",
              score_breakdown: {
                ...(r.score_breakdown ?? {}),
                primary_failed_gate: "duplicate_active_signal",
                raw_rejection_reason: "duplicate_active_signal",
                normalized_rejection_reason: "duplicate_active_signal",
                distance_guard: "passed",
                arbitration: "selected",
                duplicate_guard: "blocked",
                duplicate_active_signal: true,
                blocking_signal_id: blockingSignal?.id ?? "unknown",
                blocking_signal_status: blockingSignal?.status ?? "unknown",
                blocking_signal_age_minutes: blockingAgeMinutes ?? "unknown",
                arbitration_selected: true,
                selected_strategy: selectedStrategyName,
                selected_timeframe: tf,
                selected_score: selectedArbitrationScore,
                microscalper_score: ev.name === "MicroScalper" ? selectedArbitrationScore : null,
                strategy_order_affected_result: false,
                arbitration_score: selectedArbitrationScore,
                selected_arbitration_score: selectedArbitrationScore,
                candidate_arbitration_score: selectedArbitrationScore,
                arbitration_candidates: arbitrationCandidates,
                signal_insert: "not_reached",
                telegram_eligibility: "not_reached",
              },
            }).eq("id", cId);
            incrementStrategyStat(ev.name, "duplicate_active_signal");
            recordStrategyRejection(ev.name, "duplicate_active_signal");
            rejectedCount++;
            duplicateSymbolBlocked++;
            continue;
          }

          incrementStrategyStat(ev.name, "duplicate_pass");
          incrementStrategyStat(ev.name, "accepted");

          // Grade gate
          if (gradeIndex(r.grade) < gradeIndex(config.min_signal_grade)) {
            await supabase.from("strategy_candidates").update({
              status: "approved",
              score_breakdown: ev.name === "MicroScalper" ? {
                ...(r.score_breakdown ?? {}),
                primary_failed_gate: "grade_below_min_signal_grade",
                raw_rejection_reason: "grade_below_min_signal_grade",
                normalized_rejection_reason: "grade_below_min_signal_grade",
                distance_guard: "passed",
                arbitration: "selected",
                duplicate_guard: "passed",
                signal_insert: "blocked_by_grade_gate",
                telegram_eligibility: "not_reached",
                min_signal_grade: config.min_signal_grade,
                candidate_grade: r.grade,
                selected_strategy: selectedStrategyName,
                selected_timeframe: tf,
                selected_score: selectedArbitrationScore,
                microscalper_score: selectedArbitrationScore,
                strategy_order_affected_result: false,
                arbitration_candidates: arbitrationCandidates,
              } : r.score_breakdown,
            }).eq("id", cId);
            continue;
          }

          if (dataSource !== "REAL DATA") continue;

          // ── Mode-aware arbitrator ─────────────────────────────────────────
          // Scanner owns market-level signal truth only. Phase D remains the sole
          // account risk/quantity authority downstream of the committed signal.
          const modesToRun = ["signal_mode"];
          let signalCreatedForThisCandidate = false;

          for (const modeSlug of modesToRun) {
            if (signalCreatedForThisCandidate) break;

            const rp = getRiskProfile(modeSlug);
            const modeConfig = modes.find((m) => m.mode_slug === modeSlug);
            const overrides = (modeConfig?.strategy_overrides as Record<string, unknown>) ?? {};
            const eligibilityProduct: EligibilityProduct = modeSlug === "signal_mode" ? "SIGNAL_ONLY" : marketType === "forex" ? (modeSlug === "prop_mode" ? "FOREX_PROP" : "FOREX_PERSONAL") : (modeSlug === "prop_mode" ? "CRYPTO_PROP" : "CRYPTO_PERSONAL");
            const eligibilityMarket = marketType === "forex" ? "FOREX" as const : "CRYPTO" as const;
            const strategyId = ev.plan.identity.strategy_id, strategyVersion = ev.plan.identity.strategy_version;
            const set = eligibilityProduct === "SIGNAL_ONLY" ? null : qualifiedSets.get(`${eligibilityProduct}_QUALIFIED_SET`) ?? null;
            const claim: EligibilityClaim = eligibilityProduct === "SIGNAL_ONLY"
              ? { product: eligibilityProduct, market: eligibilityMarket, strategyId, strategyVersion, configId: "", configVersion: "", qualifiedSetVersion: "", strategyParameters: {}, symbol: normalizedSymbol, timeframe: tf, requiredQualification: "FORWARD_VALIDATION_CANDIDATE" }
              : pinnedClaimFromQualifiedSet({ product: eligibilityProduct, market: eligibilityMarket, set: set ?? { version: "qualified-strategy-set/v1", id: `${eligibilityProduct}_QUALIFIED_SET`, setVersion: "missing", product: eligibilityProduct.endsWith("PROP") ? "PROP" : "PERSONAL", researchPolicyVersion: "missing", entries: [] }, strategyId, strategyVersion, symbol: normalizedSymbol, timeframe: tf, requiredQualification: "FORWARD_VALIDATION_CANDIDATE" });
            const eligibility = routeProductionEligibility({ claim, qualifiedSet: set, signalPolicy: scannerSignalPolicy });
            if (eligibility.decision === "INELIGIBLE") {
              await supabase.from("certified_runtime_events").insert({ event_id: `eligibility:${runId}:${cId}:${eligibilityProduct}`, execution_plan_id: `eligibility:${cId}`, account_id: eligibilityProduct, event_type: "ACCOUNT_REJECTED", normalized_status: "rejected", occurred_at: strategyContext.evaluated_at, payload: eligibility });
              continue;
            }

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

            const riskCheck = { passed: true, reason: "signal_truth_precedes_phase_d_account_policy", daily_lock: false, cooldown: false };
            const managementInput = {
              symbol: sym.symbol, market_type: sym.market_type, timeframe: tf, direction: r.direction,
              entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss, tp1: r.tp1, tp2: r.tp2,
              risk_reward: r.risk_reward, strategy_name: ev.name, regime: ind.regime,
              recommended_risk_pct: riskLeverageRecommendation.recommended_risk_pct,
              suggested_leverage_min: riskLeverageRecommendation.suggested_leverage_min,
              suggested_leverage_max: riskLeverageRecommendation.suggested_leverage_max,
              leverage_cap: riskLeverageRecommendation.leverage_cap,
              invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`,
            };
            const tradeManagement = tradeManagementPlan(managementInput);
            const signalCreatedAt = new Date();
            const expiryMetadata = buildSignalExpiryMetadata(ev.name, tf, ev.cfg, r.score_breakdown ?? {}, signalCreatedAt);
            const expiryScoreBreakdown = scoreBreakdownWithExpiry(r.score_breakdown ?? {}, expiryMetadata);

            const arbitratorDecision: ArbitratorDecision = {
              selected_mode: modeSlug, risk_check_passed: riskCheck.passed,
              risk_rejection_reason: riskCheck.reason,
              final_decision: riskCheck.passed ? "approved" : "blocked_by_risk",
              decision_reason: riskCheck.passed ? `${ev.name} passed all ${modeSlug} checks` : riskCheck.reason,
              score_threshold_used: modeMinScore, min_rr_used: modeMinRR,
              mode_adjustments_used: Object.keys(overrides).filter((k) => k !== "allowed_strategies"),
              duplicate_blocked: false, daily_lock_state: riskCheck.daily_lock,
              cooldown_state: riskCheck.cooldown, paper_execution_intent_created: false,
              selected_strategy: ev.name,
              arbitration_score: selectedArbitrationScore,
              competing_candidates: arbitrationCandidates,
              market_intelligence: {
                opportunity_score: marketContext.opportunity_score,
                expected_move_bucket: marketContext.expected_move_bucket,
                risk_quality: marketContext.risk_quality,
                liquidity_quality: marketContext.liquidity_quality,
                trend_score: marketContext.trend_strength,
                volatility_score: marketContext.volatility_expansion,
                strategy_match: marketContext.strategy_match,
                recent_move_pct: marketContext.recent_move_pct,
                invalidation_distance_atr: marketContext.invalidation_distance_atr,
                provider_availability: executionTradability(sym.symbol, executionUniverse),
              },
            };

            const tradability = executionTradability(sym.symbol, executionUniverse);

            if (!riskCheck.passed) {
              riskBlockedCount++;
              await commitScannerDecision(supabase, { cycleKey: decisionCycleKey, runId, scope: arbitrationScope, decision: "REJECTED", reasonCodes: [riskCheck.reason], arbitration: { ...arbitrationDecision, framework: ACTIVE_SCANNER_FRAMEWORK, arbitrator: ACTIVE_SCANNER_ARBITRATOR } });
              continue;
            }

            if (marketType === "crypto" && tradability.execution_eligible !== true) {
              await supabase.from("strategy_candidates").update({ status: "research_only", rejection_reason: "symbol_not_in_execution_universe", score_breakdown: { ...expiryScoreBreakdown, ...tradability, signal_insert: "blocked_research_only", telegram_eligibility: "research_only" } }).eq("id", cId);
              errors.push(`[RESEARCH_ONLY] ${sym.symbol} not executable for ${executionUniverse.mode}`);
              continue;
            }

            // Create immutable signal and publication work in one transaction.
            const strategyIdForSignal = ev.plan.identity.strategy_id;
            const strategyVersionForSignal = ev.plan.identity.strategy_version;
            const configurationVersion = scannerConfigurationVersion({ strategyId: strategyIdForSignal, strategyVersion: strategyVersionForSignal, configSource: ev.cfg.config_source, parameters: ev.cfg.params, minScore: ev.cfg.min_score, minRiskReward: ev.cfg.min_rr, distanceGuards: [ev.cfg.min_stop_distance_pct, ev.cfg.min_tp1_distance_pct, ev.cfg.min_tp2_distance_pct] });
            const signalIdentity = scannerSignalIdentity({ market: marketType, symbol: normalizedSymbol, timeframe: tf, candleCloseTime, strategyId: strategyIdForSignal, strategyVersion: strategyVersionForSignal, configurationVersion, side: r.direction });
            const signalPayload = {
              candidate_id: cId, symbol: sym.symbol, market_type: sym.market_type, timeframe: tf,
              direction: r.direction, entry_type: "zone",
              entry_low: r.entry_low, entry_high: r.entry_high, stop_loss: r.stop_loss,
              tp1: r.tp1, tp2: r.tp2, risk_reward: r.risk_reward,
              strategy_name: ev.name, regime: ind.regime, grade: r.grade,
              confidence_score: r.confidence_score, reason: r.reason,
              invalidation: `Price closes beyond stop loss (${r.stop_loss?.toFixed(5)})`,
              status: "waiting", source: "scanner", mode_slug: modeSlug, data_source: dataSource,
              created_at: signalCreatedAt.toISOString(), expires_at: expiryMetadata.expires_at,
              arbitrator_decision: { ...arbitratorDecision, eligibility, expiry_metadata: expiryMetadata, execution_tradability: tradability },
              risk_profile_snapshot: { mode_slug: modeSlug, equity_start: rp.equity_start, risk_per_trade_pct: rp.risk_per_trade_pct, score_breakdown: expiryScoreBreakdown, trade_management: tradeManagement, expiry_metadata: expiryMetadata },
              signal_identity: signalIdentity, strategy_id: strategyIdForSignal, strategy_version: strategyVersionForSignal,
              configuration_version: configurationVersion, candle_close_time: candleCloseTime,
              ...riskLeverageRecommendation,
            };
            const committed = await commitScannerDecision(supabase, { cycleKey: decisionCycleKey, runId, scope: arbitrationScope, decision: "SIGNAL", reasonCodes: ["GRADE_A_OR_A_PLUS", "ARBITRATION_WINNER"], arbitration: { ...arbitrationDecision, framework: ACTIVE_SCANNER_FRAMEWORK, arbitrator: ACTIVE_SCANNER_ARBITRATOR }, signal: signalPayload, enqueuePublication: true });
            const sigData = committed.signal_id ? { ...signalPayload, id: committed.signal_id, status: "waiting" } : null;

            if (!sigData) continue;
            signalsCreated++;
            incrementStrategyStat(ev.name, "signal_published");
            incrementStrategyStat(ev.name, "signals_created");
            professionalStrategyDiagnostics.published(PROFESSIONAL_STRATEGY_IDS[ev.name], new Date().toISOString());
            signalCreatedForThisCandidate = true;
            activeSymbolSet.add(sym.symbol);
            activeSignalBySymbol.set(sym.symbol, { id: sigData.id as string, status: String(sigData.status ?? "waiting"), created_at: String(sigData.created_at ?? new Date().toISOString()) });
            await supabase.from("strategy_candidates").update({
              status: "converted_to_signal",
              score_breakdown: {
                ...expiryScoreBreakdown,
                primary_failed_gate: "passed",
                raw_rejection_reason: "passed",
                normalized_rejection_reason: "passed",
                distance_guard: "passed",
                arbitration: "selected",
                duplicate_guard: "passed",
                signal_insert: "inserted",
                inserted_signal_id: sigData.id,
                selected_strategy: selectedStrategyName,
                selected_timeframe: tf,
                selected_score: selectedArbitrationScore,
                candidate_arbitration_score: selectedArbitrationScore,
                arbitration_candidates: arbitrationCandidates,
              },
            }).eq("id", cId);

            // Telegram is a consumer of durable publication work; the scanner
            // never delivers or adopts an account execution plan.
            const tgResult = { sent: false, status: "queued", blocked_reason: "publication_work_pending" };
            telegramSkipped++;
            telegramSkipReasons.publication_work_pending = (telegramSkipReasons.publication_work_pending ?? 0) + 1;
            const executionResult = { called: false, success: false, reason: "phase_d_downstream_only" };

            if (ev.name === "MicroScalper") {
              await supabase.from("strategy_candidates").update({
                score_breakdown: {
                  ...expiryScoreBreakdown,
                  primary_failed_gate: "passed",
                  raw_rejection_reason: "passed",
                  normalized_rejection_reason: "passed",
                  distance_guard: "passed",
                  arbitration: "selected",
                  duplicate_guard: "passed",
                  signal_insert: "inserted",
                  inserted_signal_id: sigData.id,
                  telegram_eligibility: tgResult.sent ? "sent" : tgResult.status,
                  telegram_eligibility_reason: tgResult.sent ? "sent" : tgResult.blocked_reason,
                  testnet_execution_called: executionResult.called,
                  testnet_execution_result: executionResult.success ? "submitted" : executionResult.reason,
                  selected_strategy: selectedStrategyName,
                  selected_timeframe: tf,
                  selected_score: selectedArbitrationScore,
                  microscalper_score: selectedArbitrationScore,
                  strategy_order_affected_result: false,
                  arbitration_candidates: arbitrationCandidates,
                },
              }).eq("id", cId);
            }

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
      error_message: "Forex disabled; set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to enable MT5-backed unified signal mode",
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

  for (const stats of Object.values(strategyEvaluationSummary)) {
    stats.arbitration_win_pct = stats.arbitration_entered > 0 ? Number(((stats.arbitration_won / stats.arbitration_entered) * 100).toFixed(2)) : 0;
  }

  // Compact logs cleanup: Delete rejected or non-converted candidates if HASHIBOT_COMPACT_SCANNER_LOGS is true
  if (SCANNER_COMPACT_LOGS) {
    try {
      await supabase.from("strategy_candidates")
        .delete()
        .eq("scanner_run_id", runId)
        .neq("status", "converted_to_signal");
    } catch (e) {
      errors.push(`[WARN] Compact candidate cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const durationMs = Date.now() - scanStart;
  const realErrors = errors.filter((e) => e.startsWith("[ERROR]"));
  const hasRealError = realErrors.length > 0;
  
  let runStatus: "Completed" | "CompletedNoTrade" | "Partial" | "Failed" = "Completed";
  if (hasRealError && candlesFetched === 0) {
    runStatus = "Failed";
  } else if (hasRealError || (symbolsScanned > 0 && (cryptoSymbolsScanned + forexSymbolsScanned < symbolsScanned))) {
    runStatus = candlesFetched > 0 ? (signalsCreated > 0 ? "Completed" : "Partial") : "Failed";
  } else if (signalsCreated === 0) {
    runStatus = "CompletedNoTrade";
  } else {
    runStatus = "Completed";
  }

  await supabase.from("scanner_runs").update({
    status: runStatus,
    finished_at: new Date().toISOString(),
    symbols_scanned: symbolsScanned, candles_fetched: candlesFetched,
    candidates_found: candidatesFound, signals_created: signalsCreated,
    indicators_calculated: indicatorsCalc, strategy_evaluations_count: evaluationsCount,
    rejected_candidates_count: rejectedCount,
    errors: errors.slice(0, 20), error_message: hasRealError ? realErrors.slice(0, 5).join(" | ") : (errors.filter(e => e.startsWith("[WARN]")).slice(0, 2).join(" | ") || null),
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
    strategy_evaluation_summary: strategyEvaluationSummary,
  }).eq("id", runId);

  // Update heartbeat
  await updateHeartbeat(
    supabase, runType,
    config.scan_interval_minutes, config.schedule_enabled,
    now, runStatus === "Failed",
  );

  const runtimeExplainability = Object.fromEntries(strategyNames.map((name) => {
    const stats = strategyEvaluationSummary[name];
    const diag = professionalStrategyDiagnostics.get(PROFESSIONAL_STRATEGY_IDS[name] || name);
    const sortedRejections = Object.entries(stats?.rejection_reasons ?? {}).sort((a, b) => b[1] - a[1]);
    const topRejectionReason = sortedRejections.length > 0 ? sortedRejections[0][0] : "none";
    const evalCount = stats?.evaluated ?? 0;
    const pubCount = stats?.signal_published ?? stats?.signals_created ?? 0;
    return [name, {
      evaluated: evalCount,
      eligible: evalCount - (stats?.skipped ?? 0),
      candidate: stats?.candidate_created ?? stats?.candidate_count ?? 0,
      quality_pass: stats?.candidate_passed_quality ?? stats?.evaluator_pass ?? 0,
      arbitration: stats?.candidate_entered_arbitration ?? stats?.arbitration_entered ?? 0,
      published: pubCount,
      executed: stats?.execution_started ?? 0,
      protected: stats?.execution_completed ?? 0,
      closed: 0,
      success_pct: evalCount > 0 ? parseFloat(((pubCount / evalCount) * 100).toFixed(2)) : 0,
      runtime_failures: stats?.runtime_errors ?? 0,
      last_candidate: diag?.last_evaluation_time ?? null,
      last_signal: diag?.last_published_time ?? null,
      last_execution: null,
      last_rejection_reason: topRejectionReason,
    }];
  }));

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
    forex_provider: forexProviderName, forex_real_data: forexProviderSuccess, forex_budget: forexBudget ? { max_pairs: forexBudget.maxPairs, max_timeframes: forexBudget.maxTimeframes, allowed_pairs: forexBudget.allowedPairs.size, planned_pairs: forexBudget.plannedPairs, planned_timeframes: forexBudget.plannedTimeframes } : null,
    forex_demo_fallback_used: false,
    strategy_evaluation_summary: strategyEvaluationSummary,
    runtime_explainability: runtimeExplainability,
    professional_strategy_diagnostics: professionalStrategyDiagnostics.snapshot(),
    shared_indicator_diagnostics: { engine: "root-shared", versions: INDICATOR_VERSIONS, calculations: indicatorsCalc, production_parity: "exact_root_v1_helpers", legacy_owned: ["momentum", "regime", "range_compression", "strategy_thresholds"] },
    arbitration_diagnostics: arbitrationDiagnostics.snapshot(),
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
      const signalEnableForexEnv = envBool("SIGNAL_ENABLE_FOREX", true);
      const cryptoProvider = (Deno.env.get("CRYPTO_DATA_PROVIDER") ?? "binance").trim().toLowerCase();
      const configuredProvider = (Deno.env.get("FOREX_DATA_PROVIDER") ?? C2_FOREX_PROVIDER).trim().toLowerCase();
      const effectiveOrder = signalEnableForexEnv ? [C2_FOREX_PROVIDER] : [];
      return new Response(JSON.stringify({
        success: true,
        provider: C2_FOREX_PROVIDER,
        crypto_provider: cryptoProvider,
        market_mode: signalMarketMode(signalEnableCryptoEnv, signalEnableForexEnv),
        signal_enable_crypto: signalEnableCryptoEnv,
        signal_enable_forex: signalEnableForexEnv,
        forex_disabled: !signalEnableForexEnv,
        forex_disabled_for_mvp: !signalEnableForexEnv,
        ...(signalEnableForexEnv ? { configured_provider: configuredProvider, fallbacks: [] as string[], demo_fallback: false, runtime_provider_policy: "mt5_durable_only_no_fallback" } : forexDisabledSummary()),
        effective_provider_order: effectiveOrder,
        canonical_symbols: FOREX_RUNTIME_SYMBOLS,
        canonical_instruments: FOREX_RUNTIME_INSTRUMENTS,
        configuration_drift: configuredProvider !== C2_FOREX_PROVIDER ? { configured_provider: configuredProvider, canonical_provider: C2_FOREX_PROVIDER, ignored: true } : null,
        research_providers: { twelvedata: { purpose: "research_historical", runtime_enabled: false }, finnhub: { purpose: "diagnostic", runtime_enabled: false } },
        telegram_enabled: envBool("TELEGRAM_ENABLED", false),
        enable_signal_mode_output: envBool("ENABLE_SIGNAL_MODE_OUTPUT", false),
        telegram_bot_token_set: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN")),
        telegram_default_channel_id_set: Boolean(Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID")),
        telegram_chat_id_set: Boolean(Deno.env.get("TELEGRAM_CHAT_ID") || Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID")),
        telegram_admin_chat_id_set: Boolean(Deno.env.get("TELEGRAM_ADMIN_CHAT_ID")),
        telegram_free_chat_id_set: Boolean(Deno.env.get("TELEGRAM_FREE_CHAT_ID")),
        supabase_url_set: Boolean(Deno.env.get("SUPABASE_URL")),
        supabase_service_role_key_set: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
        scanner_cron_secret_set: Boolean(Deno.env.get("SCANNER_CRON_SECRET")),
        compact_runtime_flags: COMPACT_RUNTIME_FLAGS,
        provider_market_data_timeframes: MT5_PROVIDER_MARKET_DATA_TIMEFRAMES,
        strategy_primary_timeframes: Object.fromEntries(FOREX_STRATEGY_CONTRACTS.map((contract) => [contract.id, contract.primaryTimeframes])),
        strategy_context_timeframes: Object.fromEntries(FOREX_STRATEGY_CONTRACTS.map((contract) => [contract.id, contract.contextTimeframes])),
        scanner_fetch_plan: forexScannerFetchPlan(),
        forex_scan_min_interval_minutes: intEnv("FOREX_SCAN_MIN_INTERVAL_MINUTES", 60, 1),
        forex_max_pairs_per_scheduled_scan: intEnv("FOREX_MAX_PAIRS_PER_SCHEDULED_SCAN", 3, 1),
        forex_max_timeframes_per_scheduled_scan: intEnv("FOREX_MAX_TIMEFRAMES_PER_SCHEDULED_SCAN", 2, 1),
        forex_max_provider_calls_per_scheduled_scan: intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCHEDULED_SCAN", intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCAN", 6, 1), 1),
        forex_max_pairs_per_manual_scan: intEnv("FOREX_MAX_PAIRS_PER_MANUAL_SCAN", 6, 1),
        forex_max_timeframes_per_manual_scan: intEnv("FOREX_MAX_TIMEFRAMES_PER_MANUAL_SCAN", 2, 1),
        forex_max_provider_calls_per_manual_scan: intEnv("FOREX_MAX_PROVIDER_CALLS_PER_MANUAL_SCAN", intEnv("FOREX_MAX_PROVIDER_CALLS_PER_SCAN", 12, 1), 1),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.debug_forex_provider_test === true || body.debug_forex_fetch === true) {
      if (!envBool("SIGNAL_ENABLE_FOREX", true)) {
        return new Response(JSON.stringify({ success: false, skipped: true, reason: "runtime_disabled", provider_called: false, symbols: [...C2_FOREX_SYMBOLS] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const requestedProvider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : C2_FOREX_PROVIDER;
      if (requestedProvider !== C2_FOREX_PROVIDER) {
        return new Response(JSON.stringify({ success: false, provider: requestedProvider, error: "RUNTIME_PROVIDER_DISABLED", canonical_provider: C2_FOREX_PROVIDER, fallback_attempted: false }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const testTf = typeof body.timeframe === "string" ? body.timeframe : "15m";
      const symbolsToTest = body.debug_forex_provider_test === true ? [...C2_FOREX_SYMBOLS] : [normalizeSymbol(typeof body.symbol === "string" ? body.symbol : "EURUSD")];
      const results = await Promise.all(symbolsToTest.map(async (testSymbol) => {
        const result = await loadMT5Candles(supabase, testSymbol, testTf, 110);
        const firstCandle = result.candles[0] ?? null;
        const latestCandle = result.candles.at(-1) ?? null;
        return {
          provider: C2_FOREX_PROVIDER,
          input_symbol: testSymbol,
          mapped_symbol: testSymbol,
          symbol_format_used: "canonical_mt5",
          timeframe: testTf,
          classified_status: result.error ? "provider_error" : "ok",
          candle_count: result.candles.length,
          first_candle_time: firstCandle?.open_time ?? null,
          last_candle_time: latestCandle?.open_time ?? null,
          quote_latest_price: latestCandle?.close ?? null,
          lineage: result.lineage ?? null,
          fallback_attempted: false,
          error: result.error,
        };
      }));
      return new Response(JSON.stringify({ success: results.every(r => r.classified_status === "ok" && r.candle_count >= 55), provider: C2_FOREX_PROVIDER, creates_candidates: false, symbols_tested: symbolsToTest, fallback_attempted: false, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceInvocation = token === serviceRole;

    if (!isServiceInvocation) {
      const auth = await authorizeInternalOrAdmin(req, supabase);
      if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load scanner config
    const { data: configRow } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();
    if (!configRow?.is_enabled) {
      return new Response(JSON.stringify({ error: "Scanner disabled", reason: "is_enabled=false" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const requestedMode = typeof body.market_mode === "string" ? body.market_mode.trim().toLowerCase() :
                          typeof body.market === "string" ? body.market.trim().toLowerCase() :
                          typeof body.market_type === "string" ? body.market_type.trim().toLowerCase() : null;

    const dbCryptoEnabled = configRow.scan_crypto_enabled !== false;
    const dbForexEnabled = configRow.scan_forex_enabled !== false;

    let signalEnableCrypto = envBool("SIGNAL_ENABLE_CRYPTO", true) && dbCryptoEnabled;
    let signalEnableForex = envBool("SIGNAL_ENABLE_FOREX", true) && dbForexEnabled;

    if (requestedMode === "crypto" || requestedMode === "crypto_only") {
      signalEnableCrypto = true;
      signalEnableForex = false;
    } else if (requestedMode === "forex" || requestedMode === "forex_only") {
      signalEnableCrypto = false;
      signalEnableForex = true;
    } else if (requestedMode === "gold") {
      signalEnableCrypto = false;
      signalEnableForex = true;
    } else if (requestedMode === "combined" || requestedMode === "crypto_and_forex" || requestedMode === "all") {
      signalEnableCrypto = true;
      signalEnableForex = true;
    }

    // Phase K consolidation preserves the Phase 4 Twelve Data authority. The
    // current MT5 candle implementation is not authorized to replace it.
    if (signalEnableForex && !signalEnableCrypto) {
      return new Response(JSON.stringify({ success: false, blocked: true, reason: "FOREX_PROVIDER_AUTHORITY_UNRESOLVED_TWELVE_DATA_LOCK_MT5_IMPLEMENTATION", forex_provider_calls_attempted: 0 }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    signalEnableForex = false;

    const config: ScannerConfig = {
      is_enabled: configRow.is_enabled ?? true,
      demo_mode_enabled: configRow.demo_mode_enabled ?? true,
      min_signal_grade: configRow.min_signal_grade ?? "A",
      prevent_duplicate_symbol_signals: configRow.prevent_duplicate_symbol_signals ?? true,
      active_timeframes: boundedScannerTimeframes(configRow.active_timeframes ?? ["5m", "15m", "1h", "4h"]),
      allow_demo_telegram_sending: configRow.allow_demo_telegram_sending ?? false,
      auto_send_telegram: configRow.auto_send_telegram ?? false,
      min_auto_send_grade: configRow.min_auto_send_grade ?? "A",
      scan_crypto_enabled: signalEnableCrypto,
      scan_forex_enabled: signalEnableForex,
      signal_enable_crypto: signalEnableCrypto,
      signal_enable_forex: signalEnableForex,
      scan_interval_minutes: configRow.scan_interval_minutes ?? 5,
      schedule_enabled: configRow.schedule_enabled ?? false,
      max_symbols_per_scan: configRow.max_symbols_per_scan ?? 80,
      min_24h_volume: configRow.min_24h_volume ?? 10_000_000,
      min_liquidity: configRow.min_liquidity ?? 10_000_000,
      exclude_symbols: configRow.exclude_symbols ?? [],
      include_symbols: configRow.include_symbols ?? [],
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
