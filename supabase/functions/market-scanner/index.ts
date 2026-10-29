import {watchedStrategyCatalog} from '../_shared/watched-strategy-catalog.ts';
import {discoverWatchedStrategies} from '../_shared/watched-strategy-discovery.ts';
import {watchedMarketContext} from '../_shared/watched-market-context.ts';
import type {WatchTimeframe} from '../_shared/conditional-contract.ts';
import {conditionalWatchFeed} from '../_shared/conditional-watch-feed.ts';
import {ConditionalSignalStore,observeConditionalSymbol,admitConditionalBatch} from '../_shared/conditional-signal-runtime.ts';
import type {ConditionalSetup} from '../_shared/conditional-signal-service.ts';
import {CORE_CRYPTO_SYMBOLS} from '../_shared/opportunity-universe.ts';
import {CRYPTO_TEAM_MANAGEMENT} from '../_shared/coordinated-crypto-management.ts';
import {fetchCoordinatedCryptoHistory} from '../_shared/coordinated-crypto-feed.ts';
import {coordinatedCryptoDefinitions} from '../_shared/coordinated-crypto.ts';
import {CRYPTO_TEAM_ROLES} from '../_shared/coordinated-crypto-contract.ts';
import {altResearchDefinitions} from '../_shared/crypto-relative-strength.ts';
import {evalForexMicroScalper,evalForexSwingContinuation} from "../_shared/forex-legacy-evaluators.ts";
import {regimeResearchDefinitions} from '../_shared/regime-opportunities.ts';
import {intradayResearchDefinitions} from '../_shared/intraday-opportunities.ts';
import {decodeNativeKline} from '../_shared/native-kline.ts';
import {costAwareResearchDefinitions} from '../_shared/cost-aware-opportunities.ts';
import {chooseObservedUniverse,unverifiedCoreRows,type ObservedUniverseRow,type NativeExchangeSymbol} from '../_shared/opportunity-universe.ts';
import {microScalperRuntimeParams} from "../_shared/micro-scalper-runtime.ts";
import {classifyMarketContext,arbitrationScore,arbitrationNoTradeReason,strategyIdentityFit,marketRoleFit,strategyFreshnessScore,scoreBreakdownNumber,scoreBreakdownBool,overextensionPenalty,type MarketContext} from "../_shared/scanner-market-context.ts";
import {measuredRuntimeConfiguration} from "../_shared/measured-strategy-runtime.ts";
import {drainProductionAccountAuthorizations} from '../_shared/production-account-authorization.ts';
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
import { applyScannerSelectionPolicy } from "../_shared/scanner-selection-policy.ts";
import { calculateActiveIndicators } from "../_shared/active-validation-runtime.ts";
import { evalMicroScalper, evalQuickScalp, evalCompressionBreakout, evalSwingContinuation } from "../_shared/crypto-production-evaluators.ts";
import { commitScannerDecision, scannerConfigurationVersion, scannerCycleKey, scannerSignalIdentity } from "../_shared/scanner-signal-repository.ts";
import { admitClosedRuntimeCandles, boundedScannerLimit, boundedScannerTimeframes, boundedScannerUniverse, SCANNER_HARD_LIMITS } from "../_shared/scanner-limits.ts";
import type { DeepReadonly, StrategyPlan } from "../_shared/strategy-plan.ts";
import { loadMT5Candles } from "../_shared/mt5-market-data-provider.ts";
import { pinnedClaimFromQualifiedSet, routeProductionEligibility, type EligibilityClaim, type EligibilityProduct, type RuntimeQualifiedSet } from "../_shared/trading-domain/production-eligibility-router.ts";
import { FOREX_RUNTIME_INSTRUMENTS, FOREX_RUNTIME_SYMBOLS, FOREX_STRATEGY_CONTRACTS, MT5_PROVIDER_MARKET_DATA_TIMEFRAMES, forexScannerFetchPlan, forexStrategyEligibility, forexStrategyTimeframes, isForexRuntimeSymbol, roundRuntimePrice, runtimeInstrument, runtimePipDistance } from "../_shared/forex-runtime-contracts.ts";
import { FOREX_PRODUCTION_EVALUATORS } from "../_shared/forex-production-strategies.ts";
import {
  PredictiveIntelligenceOrchestrator,
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

type StrategyName = typeof CRYPTO_TEAM_ROLES[number]["name"] | "MicroScalper" | "CompressionBreakout" | "SwingContinuation" | "QuickScalp" | "ForexMicroScalper" | "ForexSwingContinuation" | "ForexLondonBreakout" | "ForexNewYorkContinuation" | "ForexTrendPullback" | "GoldVolatilityBreakout";
const PROFESSIONAL_STRATEGY_IDS: Record<StrategyName, string> = {
  CryptoTrendContinuation:'crypto.team-trend',CryptoRangeReversal:'crypto.team-range',CryptoExpansionBreakout:'crypto.team-breakout',CryptoAltRelativeStrength:'crypto.team-alt',
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
  dynamic_binance_universe_enabled?: boolean;
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
  return calculateActiveIndicators(candles) as Indicators;
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

function candleDirectionConfirmation(candles: Candle[], direction: "buy" | "sell", lookback = 3) {
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



// ─── ForexMicroScalper ───────────────────────────────────────────────────────


type ForexEvaluator = (context: StrategyEvaluationContext, params: Record<string, number>) => EvalResult;
const FOREX_EVALUATOR_REGISTRY = new Map<string, ForexEvaluator>([
  ["forex.micro-scalper", (context, params) => evalForexMicroScalper(context.candles as Candle[], context.indicators as Indicators, context.timeframe, params)],
  ["forex.swing-continuation", (context, params) => evalForexSwingContinuation(context.candles as Candle[], context.indicators as Indicators, context.timeframe, params)],
  ...Object.entries(FOREX_PRODUCTION_EVALUATORS).filter(([id])=>!["forex.micro-scalper","forex.swing-continuation"].includes(id)).map(([id, evaluator]) => [id, (context: StrategyEvaluationContext, params:Record<string,number>) => evaluator(context,params)] as [string, ForexEvaluator]),
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
        return raw.map((k) => decodeNativeKline(symbol, timeframe, k, 'SPOT'));
      }
    }
  } catch {}
  try {
    const furl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const fres = await fetch(furl, { signal: AbortSignal.timeout(8000) });
    if (!fres.ok) return null;
    const fraw: unknown[][] = await fres.json();
    return fraw.map((k) => decodeNativeKline(symbol, timeframe, k, 'USDT_PERPETUAL'));
  } catch { return null; }
}

type BinanceUniverseRow = ObservedUniverseRow;

const DEFAULT_STABLECOIN_BASES = new Set(["USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "USDE", "SUSDE", "EUR", "TRY", "BRL"]);

function scannerCsvSet(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.map((x) => normalizeSymbol(String(x))).filter(Boolean));
  return new Set(String(value ?? "").split(",").map((x) => normalizeSymbol(x)).filter(Boolean));
}

async function fetchDynamicBinanceUniverse(config: ScannerConfig): Promise<{ symbols: BinanceUniverseRow[]; warning: string | null; coverage:Record<string,unknown>|null }> {
  if (!config.dynamic_binance_universe_enabled) {
    return { symbols: unverifiedCoreRows().filter(r=>!scannerCsvSet(config.exclude_symbols).has(r.symbol)), warning: 'Static core selection; liquidity has not been observed by universe discovery.',coverage:null };
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
  const poolSize=boundedScannerLimit('SCANNER_WATCHLIST_POOL_SIZE',Deno.env.get('SCANNER_WATCHLIST_POOL_SIZE')??undefined,100,200);
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
    const exchangeInfo = await exchangeRes.json() as { symbols?: NativeExchangeSymbol[] };
    const tickers = await tickerRes.json() as Array<Record<string, unknown>>;
    const result=chooseObservedUniverse({exchange:exchangeInfo.symbols??[],tickers,asOf:Date.now(),limit:maxSymbols,poolSize,
      minQuoteVolume:minVolume,include:[...include],exclude:[...exclude],stableExclusions:[...stableExclusions]});
    if (result.symbols.length > 0) return { symbols: result.symbols, warning: null,coverage:result.coverage };
    throw new Error("No dynamic symbols found");
  } catch (_e) {
    return { symbols: unverifiedCoreRows().filter(r=>!exclude.has(r.symbol)).slice(0,maxSymbols), warning: 'Universe discovery unavailable; static core fallback has unverified liquidity and no wider-coverage claim.',coverage:null };
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
): Promise<{ candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass;spreadPrice?:number|null;spreadObservedAt?:string }> {
  const now = new Date().toISOString();

  if (!C2_FOREX_TIMEFRAMES.has(tf)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_timeframe: ${tf}`, statusClass: "unsupported_timeframe" };
  }

  const normalized = normalizeSymbol(symbol);
  if (!C2_FOREX_SYMBOLS.has(normalized)) {
    return { candles: [], source: C2_FOREX_PROVIDER, data_source: "PROVIDER_ERROR", providerError: `unsupported_symbol: ${symbol}`, statusClass: "unsupported_symbol" };
  }

  const result = await loadMT5Candles(supabase, normalized, tf, 240, { feedIdentity: Deno.env.get("MT5_MARKET_DATA_FEED_ID") ?? undefined });
  if (!result.error && result.candles && result.candles.length >= 55) {
    await supabase.from("provider_status").upsert({
      provider_name: C2_FOREX_PROVIDER, market_type: "forex", status: "active",
      last_success_at: now, error_message: "", data_source_label: "REAL DATA",
      last_candles_count: result.candles.length, updated_at: now,
    }, { onConflict: "provider_name" });
    return { candles: result.candles, source: C2_FOREX_PROVIDER, data_source: "REAL DATA", providerError: null, statusClass: "ok",spreadPrice:Number(result.lineage?.bid)>0&&Number(result.lineage?.ask)>=Number(result.lineage?.bid)?Number(result.lineage.ask)-Number(result.lineage.bid):null,spreadObservedAt:result.lineage?.last_update_at };
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

  if(CRYPTO_TEAM_ROLES.some(role=>role.name===strategy))return {...CRYPTO_TEAM_MANAGEMENT,riskGuidance,exposureGuidance};
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
  const { data: strategyConfigs,error:strategyConfigError } = await supabase.from("strategy_configs").select("strategy_name,enabled,signal_style,risk_mode,min_score,min_rr,min_stop_distance_pct,min_tp1_distance_pct,min_tp2_distance_pct,max_bars_in_trade,allowed_symbols,allowed_timeframes,params");
  if(strategyConfigError||!Array.isArray(strategyConfigs))throw new Error("STRATEGY_CONFIGURATION_UNAVAILABLE");
  const {data:measuredReleases,error:releaseError}=await supabase.from("strategy_release_candidates").select("id,strategy_id,state,immutable_configuration").eq("state","PROMOTED");
  if(releaseError||!Array.isArray(measuredReleases))throw new Error("MEASURED_STRATEGY_RELEASES_UNAVAILABLE");
  const getStratCfg = (name: string): StrategyConfig => {
    const cfg = (strategyConfigs ?? []).find((s: Record<string, unknown>) => s.strategy_name === name);
    const isForex = name.startsWith("Forex") || name === "GoldVolatilityBreakout";
    const forexContract = FOREX_STRATEGY_CONTRACTS.find((contract) => contract.legacyName === name);
    const isMicroScalper = name === "MicroScalper";
    const isQuickScalp = name === "QuickScalp";
    return measuredRuntimeConfiguration(name,{
      strategy_name: name,
      config_source:         cfg ? "db" : "fallback",
      enabled:               (cfg?.enabled as boolean)                      ?? false,
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
    },measuredReleases,config.min_signal_grade);
  };

  const conditionalEnabled=Deno.env.get("CONDITIONAL_SIGNALS_ENABLED")!=="FALSE";
  const watchedDefinitions=conditionalEnabled?watchedStrategyCatalog(strategyConfigs,measuredReleases):[];
  const sourceRead=conditionalEnabled?await supabase.from('intelligence_events').select('event_id,market,created_at,metadata,data_sources').gte('created_at',new Date(Date.now()-1800000).toISOString()).order('created_at',{ascending:false}).limit(100):{data:[],error:null};
  const watchedSources=(sourceRead.error?[]:sourceRead.data??[]).map((r:any)=>({...r,id:r.event_id}));
  const conditionalStore=new ConditionalSignalStore(supabase);
  const conditionalBatch:ConditionalSetup[]=[];
  const cryptoTeamEnabled=CRYPTO_TEAM_ROLES.some(role=>getStratCfg(role.name).enabled);
  if(!conditionalEnabled&&cryptoTeamEnabled&&['MicroScalper','QuickScalp','CompressionBreakout','SwingContinuation'].some(name=>getStratCfg(name).enabled))throw new Error('MIXED_CRYPTO_INSTRUMENT_PROFILE_REQUIRES_VALIDATION');

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
  try{await drainProductionAccountAuthorizations(supabase)}catch(error){console.error('Account authorization inbox unavailable',error instanceof Error?error.message:'FAILED')}
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
  const forexFetchCache = new Map<string, { candles: Candle[]; source: string; data_source: string; providerError: string | null; statusClass?: ForexProviderStatusClass;spreadPrice?:number|null;spreadObservedAt?:string }>();
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
    const native=!conditionalEnabled&&cryptoTeamEnabled&&tf==='15m';
    const value = conditionalEnabled&&['5m','15m','1h','4h','1d'].includes(tf)?[...(await conditionalWatchFeed(supabase,symbol,tf as WatchTimeframe,Date.now())).candles]:native?await fetchCoordinatedCryptoHistory(symbol,Date.now()):await fetchBinanceCandles(symbol,tf,111);
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

  // Fixed 6-symbol production forex & gold universe
  const canonicalForexList = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"];

  const dynamicUniverse = config.signal_enable_crypto ? await fetchDynamicBinanceUniverse(config) : { symbols: [], warning: null,coverage:null };
  if (dynamicUniverse.warning) errors.push(`[WARN] ${dynamicUniverse.warning}`);
  if(dynamicUniverse.coverage)errors.push(`[INFO] observed_universe_coverage=${JSON.stringify(dynamicUniverse.coverage)}`);

  const executionUniverse = await loadExecutionUniverse(supabase);
  if (executionUniverse.warning) errors.push(`[WARN] ${executionUniverse.warning}`);

  let cryptoToScan = config.signal_enable_crypto
    ? dynamicUniverse.symbols
    : [];

  let forexToScan = config.signal_enable_forex
    ? canonicalForexList.map((sym) => ({ symbol: sym, market_type: "forex" as const, is_active: true }))
    : [];

  // Phase K: limits are validated before the provider loop. Invalid or excessive
  // configuration aborts the whole cycle rather than silently scanning a larger
  // universe. Forex cannot exceed the six symbols whose contracts are locked.
  if(conditionalEnabled&&config.signal_enable_crypto)cryptoToScan=CORE_CRYPTO_SYMBOLS.map(symbol=>({symbol,market_type:"crypto" as const,is_active:true}));
  const boundedUniverse = boundedScannerUniverse(cryptoToScan, forexToScan, Deno.env.get("SCANNER_MAX_CRYPTO_SYMBOLS") ?? undefined, Deno.env.get("SCANNER_MAX_FOREX_SYMBOLS") ?? (conditionalEnabled?"6":undefined), Deno.env.get("SCANNER_MAX_SYMBOLS_PER_SCAN") ?? (conditionalEnabled?"16":undefined));
  forexToScan = boundedUniverse.forex;
  cryptoToScan = boundedUniverse.crypto;
  if(conditionalEnabled&&config.signal_enable_forex&&forexToScan.length!==6)throw new Error("CONDITIONAL_SIX_FOREX_SYMBOL_BUDGET_REQUIRED");
  if(conditionalEnabled&&config.signal_enable_crypto&&cryptoToScan.length!==10)throw new Error("CONDITIONAL_TEN_SYMBOL_BUDGET_REQUIRED");

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
  if (config.prevent_duplicate_symbol_signals||cryptoTeamEnabled) {
    const { data: activeSigs,error:activeSignalError } = await supabase.from("signals").select("id,symbol,status,created_at").in("status", ["waiting", "active"]);
    if(activeSignalError)throw new Error("ACTIVE_SIGNAL_STATE_UNAVAILABLE");
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
    const timeframesToScan = marketType === "forex" ? forexScanTimeframes : conditionalEnabled?["5m","15m","1h"]:config.active_timeframes;
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
        const teamCandles=marketType==="crypto"&&cryptoTeamEnabled&&tf==="15m"?admitted.candles.slice(-960):undefined;
        candles = marketType === "crypto" ? admitted.candles.slice(-110) : admitted.candles;
        candlesFetched += candles.length;

        if (!SCANNER_DISABLE_CANDLE_PERSISTENCE) {
        await supabase.from("candles").upsert(candles.map((c) => ({
          symbol: c.symbol, market_type: c.market_type, timeframe: c.timeframe,
          open_time: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume, source: c.source,
        })), { onConflict: "symbol,timeframe,open_time" });

        }
        if(conditionalEnabled&&(marketType==="crypto"||marketType==="forex")&&['5m','15m','1h'].includes(tf)){
          const at=Date.now(),higherTf=tf==='5m'?'15m':tf==='15m'?'1h':'4h';
          const higher=marketType==='crypto'?await fetchCryptoCandlesForRun(normalizedSymbol,higherTf):(await fetchForexCandlesForRun(normalizedSymbol,higherTf)).candles;
          const anchor=marketType==='crypto'&&normalizedSymbol!=='BTCUSDT'?await fetchCryptoCandlesForRun('BTCUSDT',tf):undefined;
          const quote=marketType==='forex'?await fetchForexCandlesForRun(normalizedSymbol,tf):undefined;
          const contextOptions={higher:higher??[],anchor:anchor??undefined,sources:watchedSources,spreadPrice:quote?.spreadPrice,spreadObservedAt:quote?.spreadObservedAt};
          await observeConditionalSymbol(conditionalStore,normalizedSymbol,tf as WatchTimeframe,admitted.candles,at,{intelligence:(rows,time)=>watchedMarketContext(rows,time,contextOptions)});
          const assessment=discoverWatchedStrategies({definitions:watchedDefinitions,symbol:normalizedSymbol,tf:tf as WatchTimeframe,rows:admitted.candles,now:at,...contextOptions});
          conditionalBatch.push(...assessment.setups);
          const recorded=await supabase.rpc('record_watched_strategy_observations',{p_rows:assessment.observations});if(recorded.error)throw Error('STRATEGY_OBSERVATIONS_WRITE_FAILED');
          continue; // Same strategy contract and paper ledger; no customer execution adoption.
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
            if (fetched15m) {
              const closed15m=admitClosedRuntimeCandles(fetched15m,15,Date.parse(candleCloseTime));
              if(!closed15m.rejection&&closed15m.candles.length>=55)fifteenMinuteCandles=closed15m.candles.slice(-110);
            }
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
            ...regimeResearchDefinitions(),
            ...intradayResearchDefinitions(),
          ...altResearchDefinitions(),
            { id: "crypto.trend-pullback", version: "0.1.0-research", legacyName: "CryptoTrendPullback", market: "crypto", lifecycle: "RESEARCH", publicationMode: "SHADOW", certification: "RESEARCH", config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: "CryptoTrendPullback" }, evaluate: evaluateCryptoTrendPullback },
            { id: "crypto.reversal-exhaustion", version: "0.1.0-research", legacyName: "ReversalExhaustion", market: "crypto", lifecycle: "RESEARCH", publicationMode: "SHADOW", certification: "RESEARCH", config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: "ReversalExhaustion" }, evaluate: evaluateReversalExhaustion },
          );
        }
        if(marketType==='crypto'){
          const team=coordinatedCryptoDefinitions(getStratCfg);
          let reference:Candle[]|undefined;
          if(cryptoTeamEnabled&&tf==='15m'&&teamCandles?.length===960){
            const fetched=normalizedSymbol==='BTCUSDT'?teamCandles:await fetchCryptoCandlesForRun('BTCUSDT','15m');
            const closed=fetched?admitClosedRuntimeCandles(fetched,15,Date.now()):null;
            if(closed&&!closed.rejection)reference=closed.candles.slice(-960);
          }
          activeDefinitions.push(...team.map(definition=>({...definition,evaluate:(context:StrategyEvaluationContext)=>definition.evaluate({...context,candles:teamCandles??context.candles,reference_candles:reference,evaluated_at:teamCandles?.length?new Date(Date.parse(teamCandles.at(-1)!.open_time)+900000).toISOString():context.evaluated_at})})));
        }
        activeDefinitions.push(...costAwareResearchDefinitions().filter(definition=>definition.market===marketType));
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
          targets: [...new Set([entry.result.tp1, entry.result.tp2])], riskReward: entry.result.risk_reward,
          expiry: new Date(Date.now() + entry.cfg.max_bars_in_trade * (timeframeMinutes(tf) ?? 5) * 60_000).toISOString(), fresh: true,
          lifecycle: "ENABLED", publicationMode: "LIVE", evidence: { ...entry.result.score_breakdown,legacy_index: index, adaptive_policy_approved: entry.cfg.params.market_adaptation_enabled === 1, ...(entry.cfg.params.estimated_round_trip_cost_bps!==undefined?{estimated_round_trip_cost_bps:entry.cfg.params.estimated_round_trip_cost_bps,minimum_net_target_r:entry.cfg.params.minimum_net_target_r??0}:{}) }, rejectionReasons: [],
          priority: strategyIdentityFit(entry), eligible: true,
        }));
        const byCandidateId = new Map(passingEntries.map((entry) => [String((entry as EvalEntry & { _candidateId: string })._candidateId), entry]));
        const decisionStarted = Date.now();
        let noTradeReason = "";
        const arbitrationDecision = arbitrateActiveScanner(arbitrationInput, { now: new Date(), marketContext, noTradePolicy: (ranked) => {
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
          if (!applyScannerSelectionPolicy(new Date().toISOString(), { activeSignalId: activeSignalBySymbol.get(sym.symbol)?.id,activeCount:[...activeSignalBySymbol.keys()].filter(symbol=>symbol.endsWith('USDT')).length }, { preventDuplicateSymbolSignals: config.prevent_duplicate_symbol_signals||CRYPTO_TEAM_ROLES.some(role=>role.name===ev.name), cooldownMs: 0,...(CRYPTO_TEAM_ROLES.some(role=>role.name===ev.name)?{maxActiveSignals:3}:{}) }).allowed) {
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
              : pinnedClaimFromQualifiedSet({ product: eligibilityProduct, market: eligibilityMarket, set: set ?? { version: "qualified-strategy-set/v1", id: `${eligibilityProduct}_QUALIFIED_SET`, setVersion: "missing", product: eligibilityProduct.endsWith("PROP") ? "PROP" : "PERSONAL", researchPolicyVersion: "missing", entries: [] }, strategyId, strategyVersion, symbol: normalizedSymbol, timeframe: tf, requiredQualification: "FORWARD_VALIDATION_CANDIDATE", evaluatedParameters:ev.cfg.params });
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
            const expiryMetadata = buildSignalExpiryMetadata(ev.name, tf, ev.cfg, r.score_breakdown ?? {}, CRYPTO_TEAM_ROLES.some(role=>role.name===ev.name)?new Date(candleCloseTime):signalCreatedAt);
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
            try{await drainProductionAccountAuthorizations(supabase)}catch(error){errors.push(`ACCOUNT_AUTHORIZATION:${error instanceof Error?error.message:'FAILED'}`)}
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

  if(conditionalEnabled)errors.push(`[INFO] conditional_signals=${JSON.stringify(await admitConditionalBatch(conditionalStore,conditionalBatch,Date.now()))}`);
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
        const result = await loadMT5Candles(supabase, testSymbol, testTf, 110, { feedIdentity: Deno.env.get("MT5_MARKET_DATA_FEED_ID") ?? undefined });
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

    // The dedicated owner-controlled HashiBridge feed is the primary Forex/Gold authority.
    // loadMT5Candles validates dedicated identity, health, freshness and closed-candle evidence;
    // failed evidence remains a per-symbol no-trade exclusion and never falls back silently.
    if (signalEnableForex && !Deno.env.get("MT5_MARKET_DATA_FEED_ID")) {
      return new Response(JSON.stringify({ success: false, blocked: true, reason: "MT5_DEDICATED_FEED_CONFIGURATION_REQUIRED", forex_provider_calls_attempted: 0 }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
