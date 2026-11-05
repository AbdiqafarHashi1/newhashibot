import {strategyAlgorithmParameters} from './strategy-runtime-parameters.ts';
import { createStrategyPlan, type DeepReadonly, type StrategyPlan } from "./strategy-plan.ts";

export type StrategyMarket = "crypto" | "forex";
export type StrategyDecision = "BUY" | "SELL" | "NO_TRADE";
export type StrategyLifecycle = "ENABLED" | "DISABLED" | "SHADOW" | "RESEARCH";

export interface StrategyCandle {
  symbol: string; market_type: string; timeframe: string; open_time: string;
  open: number; high: number; low: number; close: number; volume: number; source: string;
  instrument_type?: 'SPOT' | 'USDT_PERPETUAL';
  quote_volume?: number; trade_count?: number; taker_buy_volume?: number; taker_buy_quote_volume?: number;
  ask_open?: number; ask_high?: number; ask_low?: number; ask_close?: number;
}

export interface StrategyIndicatorSnapshot {
  ema20: number; ema50: number; atr14: number; rsi14: number;
  recent_high: number; recent_low: number; avg_volume: number;
  body_size: number; atr_pct: number; range_compression_ratio: number;
  momentum_score: number; volatility_state: string; regime: string; gk_volatility?: number;
}

export interface LegacyStrategyResult {
  status: "candidate" | "rejected";
  direction: string; entry_low: number; entry_high: number;
  stop_loss: number; tp1: number; tp2: number; risk_reward: number;
  confidence_score: number; grade: string; reason: string;
  rejection_reason: string;
  score_breakdown: Record<string, number | string | boolean>;
}

export interface ProfessionalStrategyResult {
  strategy_id: string;
  strategy_version: string;
  market: StrategyMarket;
  symbol: string;
  timeframe: string;
  decision: StrategyDecision;
  rejection_reasons: string[];
  confidence: number;
  grade: string;
  entry: { low: number; high: number } | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  risk_reward: number;
  expires_at: string | null;
  evidence: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  legacy: LegacyStrategyResult;
}

export interface StrategyRuntimeConfig {
  config_source?: string;
  strategy_name: string;
  enabled: boolean;
  min_score: number;
  min_rr: number;
  min_stop_distance_pct?: number; min_tp1_distance_pct?: number; min_tp2_distance_pct?: number;
  max_bars_in_trade: number;
  allowed_symbols: string[];
  allowed_timeframes: string[];
  params: Record<string, number>;
}

export interface StrategyEvaluationContext {
  symbol: string;
  market: StrategyMarket;
  timeframe: string;
  candles: readonly StrategyCandle[];
  indicators: StrategyIndicatorSnapshot;
  evaluated_at: string;
  /** Frozen, versioned research overrides. Production callers omit this field. */
  strategy_parameters?: Readonly<Record<string, number>>;
  reference_candles?: readonly StrategyCandle[];
  higher_timeframe_candles?: readonly StrategyCandle[];
}

export interface StrategyDefinition {
  id: string;
  version: string;
  legacyName: string;
  market: StrategyMarket;
  lifecycle: StrategyLifecycle;
  publicationMode?: "LIVE" | "SHADOW";
  certification?: "PRODUCTION" | "RESEARCH";
  config: StrategyRuntimeConfig;
  evaluate(context: StrategyEvaluationContext): LegacyStrategyResult;
}

export interface StrategyDiagnostic {
  strategy_id: string;
  strategy_version: string;
  lifecycle: StrategyLifecycle;
  evaluations: number;
  eligible_evaluations: number;
  candidates: number;
  buy_count: number;
  sell_count: number;
  no_trade_count: number;
  published_signals: number;
  rejections: number;
  rejection_reasons: Record<string, number>;
  runtime_failures: number;
  last_evaluation: string | null;
  last_candidate: string | null;
  last_publication: string | null;
  session_exclusions: number;
  stale_exclusions: number;
  malformed_exclusions: number;
  symbol_coverage: Record<string, number>;
  timeframe_coverage: Record<string, number>;
}

function finite(value: number): number | null { return Number.isFinite(value) && value !== 0 ? value : null; }
function normalizeSymbol(value: string): string { return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }
function staleCandles(context: StrategyEvaluationContext): boolean {
  const last = context.candles[context.candles.length - 1];
  const match = /^(\d+)(m|h|d)$/.exec(context.timeframe);
  if (!last || !match) return true;
  const unit = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
  return Date.parse(context.evaluated_at) - Date.parse(last.open_time) > Number(match[1]) * unit * 3;
}
function reject(reason: string, diagnostics: Record<string, number | string | boolean> = {}): LegacyStrategyResult {
  return { status: "rejected", direction: "none", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0, confidence_score: 0, grade: "reject", reason, rejection_reason: reason, score_breakdown: { primary_failed_gate: reason, ...diagnostics } };
}

export function expiryFromBars(evaluatedAt: string, timeframe: string, bars: number): string | null {
  const match = /^(\d+)(m|h|d)$/.exec(timeframe);
  if (!match || bars <= 0) return null;
  const unit = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
  const value = Date.parse(evaluatedAt);
  return Number.isFinite(value) ? new Date(value + Number(match[1]) * unit * bars).toISOString() : null;
}

export function toProfessionalResult(definition: StrategyDefinition, context: StrategyEvaluationContext, legacy: LegacyStrategyResult): ProfessionalStrategyResult {
  const direction = legacy.direction.toLowerCase();
  const decision: StrategyDecision = legacy.status === "candidate" && direction === "buy" ? "BUY" : legacy.status === "candidate" && direction === "sell" ? "SELL" : "NO_TRADE";
  const rejection = legacy.rejection_reason || (legacy.status === "rejected" ? legacy.reason : "");
  return {
    strategy_id: definition.id, strategy_version: definition.version, market: definition.market,
    symbol: normalizeSymbol(context.symbol), timeframe: context.timeframe, decision,
    rejection_reasons: rejection ? [rejection] : [], confidence: legacy.confidence_score,
    grade: legacy.grade,
    entry: legacy.status === "candidate" ? { low: legacy.entry_low, high: legacy.entry_high } : null,
    stop: finite(legacy.stop_loss), tp1: finite(legacy.tp1), tp2: finite(legacy.tp2), risk_reward: legacy.risk_reward,
    expires_at: expiryFromBars(context.evaluated_at, context.timeframe, definition.config.max_bars_in_trade),
    evidence: { ...legacy.score_breakdown },
    diagnostics: { lifecycle: definition.lifecycle, publication_mode: definition.publicationMode ?? "LIVE", certification: definition.certification ?? "PRODUCTION", legacy_name: definition.legacyName, legacy_status: legacy.status },
    legacy,
  };
}

export class StrategyDiagnostics {
  private readonly values = new Map<string, StrategyDiagnostic>();
  private row(definition: StrategyDefinition): StrategyDiagnostic {
    let row = this.values.get(definition.id);
    if (!row) {
      row = { strategy_id: definition.id, strategy_version: definition.version, lifecycle: definition.lifecycle, evaluations: 0, eligible_evaluations: 0, candidates: 0, buy_count: 0, sell_count: 0, no_trade_count: 0, published_signals: 0, rejections: 0, rejection_reasons: {}, runtime_failures: 0, last_evaluation: null, last_candidate: null, last_publication: null, session_exclusions: 0, stale_exclusions: 0, malformed_exclusions: 0, symbol_coverage: {}, timeframe_coverage: {} };
      this.values.set(definition.id, row);
    }
    return row;
  }
  evaluated(definition: StrategyDefinition, at: string, eligible: boolean, symbol: string, timeframe: string): void { const row = this.row(definition); row.evaluations++; if (eligible) row.eligible_evaluations++; row.last_evaluation = at; row.symbol_coverage[symbol] = (row.symbol_coverage[symbol] ?? 0) + 1; row.timeframe_coverage[timeframe] = (row.timeframe_coverage[timeframe] ?? 0) + 1; }
  result(definition: StrategyDefinition, result: ProfessionalStrategyResult, at: string): void { const row = this.row(definition); if (result.decision === "NO_TRADE") { row.no_trade_count++; row.rejections++; for (const reason of result.rejection_reasons) { row.rejection_reasons[reason] = (row.rejection_reasons[reason] ?? 0) + 1; if (reason === "session_not_eligible") row.session_exclusions++; if (reason === "stale_candles") row.stale_exclusions++; if (reason === "malformed_candles" || reason === "invalid_candles") row.malformed_exclusions++; } } else { row.candidates++; if (result.decision === "BUY") row.buy_count++; else row.sell_count++; row.last_candidate = at; } }
  failure(definition: StrategyDefinition, at: string): void { const row = this.row(definition); row.runtime_failures++; row.last_evaluation = at; }
  published(strategyId: string, at: string): void { const row = this.values.get(strategyId); if (row) { row.published_signals++; row.last_publication = at; } }
  snapshot(): Record<string, StrategyDiagnostic> { return Object.fromEntries([...this.values].map(([key, value]) => [key, { ...value, rejection_reasons: { ...value.rejection_reasons }, symbol_coverage: { ...value.symbol_coverage }, timeframe_coverage: { ...value.timeframe_coverage } }])); }
}

export interface RegistryEvaluation { definition: StrategyDefinition; professional: ProfessionalStrategyResult; plan: DeepReadonly<StrategyPlan>; publishable: boolean; }

export class ProfessionalStrategyRegistry {
  constructor(private readonly definitions: readonly StrategyDefinition[], readonly diagnostics = new StrategyDiagnostics()) {
    const ids = new Set<string>();
    for (const definition of definitions) { if (ids.has(definition.id)) throw new Error(`duplicate_strategy_id:${definition.id}`); ids.add(definition.id); }
  }
  list(): readonly StrategyDefinition[] { return this.definitions; }
  eligible(definition: StrategyDefinition, context: StrategyEvaluationContext): boolean {
    if (definition.market !== context.market) return false;
    if (definition.config.allowed_symbols.length && !definition.config.allowed_symbols.map(normalizeSymbol).includes(normalizeSymbol(context.symbol))) return false;
    if (definition.config.allowed_timeframes.length && !definition.config.allowed_timeframes.includes(context.timeframe)) return false;
    return true;
  }
  evaluate(context: StrategyEvaluationContext): RegistryEvaluation[] {
    const output: RegistryEvaluation[] = [];
    for (const definition of this.definitions) {
      if (definition.market !== context.market) continue;
      const eligible = this.eligible(definition, context);
      this.diagnostics.evaluated(definition, context.evaluated_at, eligible, context.symbol, context.timeframe);
      if (!eligible) continue;
      const lifecycleEnabled = definition.lifecycle === "ENABLED" && definition.config.enabled;
      if (!lifecycleEnabled && !["SHADOW", "RESEARCH"].includes(definition.lifecycle)) continue;
      try {
        const legacy = definition.evaluate({...context,strategy_parameters:strategyAlgorithmParameters(definition.config.params)});
        const professional = toProfessionalResult(definition, context, legacy);
        this.diagnostics.result(definition, professional, context.evaluated_at);
        output.push({ definition, professional, plan: createStrategyPlan(definition, context, legacy), publishable: lifecycleEnabled });
      } catch (error) {
        this.diagnostics.failure(definition, context.evaluated_at);
        const message = error instanceof Error ? error.message : String(error ?? "unknown runtime error");
        const legacy = reject("runtime_error", { runtime_error: true, error_message: message.slice(0, 300) });
        legacy.reason = `${definition.legacyName} runtime error: ${message}`;
        output.push({ definition, professional: toProfessionalResult(definition, context, legacy), plan: createStrategyPlan(definition, context, legacy), publishable: lifecycleEnabled });
      }
    }
    return output;
  }
}

function researchCandidate(context: StrategyEvaluationContext, direction: "buy" | "sell", confidence: number, stopMultiple: number, tp1R: number, tp2R: number, evidence: Record<string, number | string | boolean>): LegacyStrategyResult {
  const last = context.candles[context.candles.length - 1];
  const atr = context.indicators.atr14;
  const stop = direction === "buy" ? last.close - atr * stopMultiple : last.close + atr * stopMultiple;
  const risk = Math.abs(last.close - stop);
  return { status: "candidate", direction, entry_low: last.close * 0.9998, entry_high: last.close * 1.0002, stop_loss: stop, tp1: direction === "buy" ? last.close + risk * tp1R : last.close - risk * tp1R, tp2: direction === "buy" ? last.close + risk * tp2R : last.close - risk * tp2R, risk_reward: tp2R, confidence_score: confidence, grade: confidence >= 85 ? "A+" : confidence >= 75 ? "A" : "B", reason: `${evidence.strategy} research candidate`, rejection_reason: "", score_breakdown: { ...evidence, research_only: true } };
}

export function evaluateCryptoTrendPullback(context: StrategyEvaluationContext): LegacyStrategyResult {
  if (!["15m", "1h"].includes(context.timeframe)) return reject("unsupported_timeframe");
  if (context.candles.length < 55) return reject("insufficient_candles");
  if (staleCandles(context)) return reject("stale_candles");
  if (context.candles.some((c) => !Number.isFinite(c.close) || c.close <= 0 || c.high < c.low)) return reject("invalid_candles");
  const last = context.candles[context.candles.length - 1], i = context.indicators;
  if (!Number.isFinite(i.atr14) || i.atr14 <= 0) return reject("invalid_atr_or_price");
  const pullbackAtr = context.strategy_parameters?.pullbackAtr ?? .55;
  const stopAtr = context.strategy_parameters?.stopAtr ?? 1.65;
  const buy = i.ema20 > i.ema50 && last.close >= i.ema20 - i.atr14 * .35 && last.close <= i.ema20 + i.atr14 * pullbackAtr && i.rsi14 >= 45 && i.rsi14 <= 65;
  const sell = i.ema20 < i.ema50 && last.close <= i.ema20 + i.atr14 * .35 && last.close >= i.ema20 - i.atr14 * pullbackAtr && i.rsi14 <= 55 && i.rsi14 >= 35;
  if (!buy && !sell) return reject("pullback_invalid", { strategy: "CryptoTrendPullback", ema20: i.ema20, ema50: i.ema50, rsi: i.rsi14 });
  return researchCandidate(context, buy ? "buy" : "sell", 80, stopAtr, 1.0, 1.75, { strategy: "CryptoTrendPullback", trend_aligned: true, pullback_confirmed: true, rsi: i.rsi14 });
}

export function evaluateReversalExhaustion(context: StrategyEvaluationContext): LegacyStrategyResult {
  if (!["15m", "1h"].includes(context.timeframe)) return reject("unsupported_timeframe");
  if (context.candles.length < 55) return reject("insufficient_candles");
  if (staleCandles(context)) return reject("stale_candles");
  if (context.candles.some((c) => !Number.isFinite(c.close) || c.close <= 0 || c.high < c.low)) return reject("invalid_candles");
  const last = context.candles[context.candles.length - 1], i = context.indicators;
  if (!Number.isFinite(i.atr14) || i.atr14 <= 0) return reject("invalid_atr_or_price");
  const rsiExtreme = context.strategy_parameters?.rsiExtreme ?? 32;
  const stopAtr = context.strategy_parameters?.stopAtr ?? 1.4;
  const buy = i.rsi14 <= rsiExtreme && last.close <= i.recent_low + i.atr14 * .4;
  const sell = i.rsi14 >= 100 - rsiExtreme && last.close >= i.recent_high - i.atr14 * .4;
  if (!buy && !sell) return reject("exhaustion_unconfirmed", { strategy: "ReversalExhaustion", rsi: i.rsi14 });
  return researchCandidate(context, buy ? "buy" : "sell", 79, stopAtr, 1.0, 1.8, { strategy: "ReversalExhaustion", exhaustion_confirmed: true, rsi: i.rsi14 });
}

export const RESEARCH_STRATEGY_CONFIG: StrategyRuntimeConfig = { strategy_name: "research", enabled: false, min_score: 0, min_rr: 0, max_bars_in_trade: 8, allowed_symbols: [], allowed_timeframes: ["15m", "1h"], params: {} };
