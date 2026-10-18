import { buildForexMarketContext, roundInstrumentPrice, timeframeMilliseconds, type ForexInstrumentId, type ForexMarketContext, type ForexSessionName } from "./forex-domain.ts";
import type { LegacyStrategyResult, StrategyEvaluationContext } from "./professional-strategies.ts";

export type ForexResearchStrategyId = "forex.london-breakout" | "forex.new-york-continuation" | "forex.trend-pullback" | "gold.volatility-breakout";
export interface ForexResearchStrategy { id: ForexResearchStrategyId; version: "0.1.0-research"; symbols: readonly ForexInstrumentId[]; timeframes: readonly string[]; sessions: readonly ForexSessionName[]; evaluate(context: StrategyEvaluationContext): LegacyStrategyResult; }

function reject(reason: string, evidence: Record<string, number | string | boolean> = {}): LegacyStrategyResult {
  return { status: "rejected", direction: "none", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0, confidence_score: 0, grade: "reject", reason, rejection_reason: reason, score_breakdown: { primary_failed_gate: reason, research_only: true, ...evidence } };
}
function contextFor(input: StrategyEvaluationContext): ForexMarketContext | null { return buildForexMarketContext({ symbol: input.symbol, timeframe: input.timeframe, candles: input.candles, indicators: input.indicators, evaluatedAt: input.evaluated_at }); }
function preflight(strategy: ForexResearchStrategy, input: StrategyEvaluationContext, market: ForexMarketContext | null): LegacyStrategyResult | null {
  if (!market) return reject("unsupported_symbol");
  if (!strategy.symbols.includes(market.symbol)) return reject("unsupported_symbol", { symbol: market.symbol });
  if (!strategy.timeframes.includes(input.timeframe)) return reject("unsupported_timeframe", { timeframe: input.timeframe });
  if (market.malformed) return reject("malformed_candles");
  if (market.stale) return reject("stale_candles");
  if (market.normalizedCandles.length < 55) return reject("insufficient_candles", { candle_count: market.normalizedCandles.length });
  if (!strategy.sessions.includes(market.session)) return reject("session_not_eligible", { session: market.session });
  if (!market.spread.eligible) return reject("spread_too_wide");
  if (!market.providerCost.budgetEligible) return reject("provider_budget_exhausted");
  if (!Number.isFinite(market.indicators.atr14) || market.indicators.atr14 <= 0 || !market.currentClosedCandle) return reject("invalid_atr_or_price");
  return null;
}
function candidate(strategy: ForexResearchStrategy, market: ForexMarketContext, direction: "buy" | "sell", stopDistance: number, tp1R: number, tp2R: number, confidence: number, evidence: Record<string, number | string | boolean>): LegacyStrategyResult {
  const price = market.currentClosedCandle!.close, sign = direction === "buy" ? 1 : -1;
  if (!Number.isFinite(stopDistance) || stopDistance < market.instrument.pointSize * 5) return reject("invalid_stop", { stop_distance: stopDistance });
  if (tp2R < 1.5) return reject("rr_too_low", { rr: tp2R });
  const stop = roundInstrumentPrice(market.symbol, price - sign * stopDistance), tp1 = roundInstrumentPrice(market.symbol, price + sign * stopDistance * tp1R), tp2 = roundInstrumentPrice(market.symbol, price + sign * stopDistance * tp2R);
  const risk = Math.abs(price - stop), reward = Math.abs(tp2 - price), rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
  if (!risk || rr < 1.45) return reject("rr_too_low", { rr, risk });
  return { status: "candidate", direction, entry_low: roundInstrumentPrice(market.symbol, price - market.instrument.pointSize * 2), entry_high: roundInstrumentPrice(market.symbol, price + market.instrument.pointSize * 2), stop_loss: stop, tp1, tp2, risk_reward: rr, confidence_score: confidence, grade: confidence >= 85 ? "A+" : confidence >= 75 ? "A" : "B", reason: `${strategy.id} ${direction} research setup`, rejection_reason: "", score_breakdown: { research_only: true, strategy_id: strategy.id, strategy_version: strategy.version, session: market.session, asset_class: market.instrument.assetClass, ...evidence, ...market.evidence } as Record<string, number | string | boolean> };
}

const liquidSessions: readonly ForexSessionName[] = ["LONDON", "NEW_YORK", "LONDON_NEW_YORK_OVERLAP"];
const forexSymbols: readonly ForexInstrumentId[] = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];

export const ForexLondonBreakout: ForexResearchStrategy = {
  id: "forex.london-breakout", version: "0.1.0-research", symbols: forexSymbols, timeframes: ["15m"], sessions: ["LONDON", "LONDON_NEW_YORK_OVERLAP"],
  evaluate(input) {
    const market = contextFor(input), blocked = preflight(this, input, market); if (blocked || !market) return blocked!;
    const interval = timeframeMilliseconds(input.timeframe)!;
    const londonOpen=Date.parse(market.sessionMetadata.londonOpenAt??""),dayStart=Date.parse(input.evaluated_at.slice(0,10)+"T00:00:00Z");
    const prior = market.normalizedCandles.slice(0, -1).filter((row) => {
      const opened=Date.parse(row.open_time),closed=opened+interval;return opened>=dayStart&&closed<=londonOpen;
    }).slice(-32);
    if (prior.length < 8) return reject("range_incomplete", { asian_candles: prior.length });
    const high = Math.max(...prior.map((c) => c.high)), low = Math.min(...prior.map((c) => c.low)), last = market.currentClosedCandle!, atr = market.indicators.atr14;
    const direction = last.close > high ? "buy" : last.close < low ? "sell" : null;
    if (!direction) return reject("breakout_unconfirmed", { range_high: high, range_low: low });
    const extension = direction === "buy" ? last.close - high : low - last.close;
    const body = Math.abs(last.close - last.open);
    const bodyAtr = input.strategy_parameters?.bodyAtr ?? .45, extensionAtr = input.strategy_parameters?.extensionAtr ?? .9;
    if (body < atr * bodyAtr) return reject("breakout_unconfirmed", { breakout_body_atr: body / atr });
    if (extension > atr * extensionAtr) return reject("breakout_overextended", { extension_atr: extension / atr });
    const rangeSize = high - low; if (rangeSize <= 0 || rangeSize > atr * 8) return reject("range_invalid", { range_atr: rangeSize / atr });
    return candidate(this, market, direction, Math.max(atr * 1.35, rangeSize * .25), 1.2, 1.9, 82, { asian_range_high: high, asian_range_low: low, asian_range_candles: prior.length, breakout_extension_atr: extension / atr, closed_candle_confirmation: true });
  },
};

export const ForexNewYorkContinuation: ForexResearchStrategy = {
  id: "forex.new-york-continuation", version: "0.1.0-research", symbols: forexSymbols, timeframes: ["15m", "1h"], sessions: ["NEW_YORK", "LONDON_NEW_YORK_OVERLAP"],
  evaluate(input) {
    const market = contextFor(input), blocked = preflight(this, input, market); if (blocked || !market) return blocked!;
    const last = market.currentClosedCandle!, atr = market.indicators.atr14, recent = market.previousClosedCandles.slice(-12);
    if (market.trendState === "FLAT") return reject("no_directional_structure");
    const direction = market.trendState === "UP" ? "buy" : "sell";
    const sessionMove = recent.length ? (last.close - recent[0].open) / atr : 0;
    const minimumMoveAtr = input.strategy_parameters?.minimumMoveAtr ?? .25, maximumMoveAtr = input.strategy_parameters?.maximumMoveAtr ?? 3.2;
    if ((direction === "buy" && sessionMove <= minimumMoveAtr) || (direction === "sell" && sessionMove >= -minimumMoveAtr)) return reject("session_direction_conflict", { session_move_atr: sessionMove });
    if (Math.abs(sessionMove) > maximumMoveAtr) return reject("move_exhausted", { session_move_atr: sessionMove });
    const confirms = direction === "buy" ? last.close > last.open && last.close > market.indicators.ema20 : last.close < last.open && last.close < market.indicators.ema20;
    if (!confirms) return reject("continuation_unconfirmed");
    return candidate(this, market, direction, atr * 1.3, 1.15, 1.85, 80, { prior_direction: market.trendState, session_move_atr: sessionMove, continuation_confirmed: true });
  },
};

export const ForexTrendPullback: ForexResearchStrategy = {
  id: "forex.trend-pullback", version: "0.1.0-research", symbols: forexSymbols, timeframes: ["15m", "1h"], sessions: liquidSessions,
  evaluate(input) {
    const market = contextFor(input), blocked = preflight(this, input, market); if (blocked || !market) return blocked!;
    if (market.trendState === "FLAT") return reject("trend_not_established");
    if (market.pullbackState === "EXTENDED") return reject("chase_extension");
    const direction = market.trendState === "UP" ? "buy" : "sell", last = market.currentClosedCandle!, atr = market.indicators.atr14;
    const depth = Math.abs(last.close - market.indicators.ema20) / atr;
    const maximumPullbackAtr = input.strategy_parameters?.maximumPullbackAtr ?? .8, stopAtr = input.strategy_parameters?.stopAtr ?? 1.4;
    if (depth > maximumPullbackAtr) return reject("pullback_invalid", { pullback_depth_atr: depth });
    const momentum = direction === "buy" ? last.close > last.open && market.indicators.rsi14 >= 45 : last.close < last.open && market.indicators.rsi14 <= 55;
    if (!momentum) return reject("momentum_unconfirmed", { rsi: market.indicators.rsi14 });
    const swing = direction === "buy" ? Math.min(...market.normalizedCandles.slice(-12).map((c) => c.low)) : Math.max(...market.normalizedCandles.slice(-12).map((c) => c.high));
    const stop = Math.max(atr * stopAtr, Math.abs(last.close - swing) + atr * .15);
    if (stop > atr * 4) return reject("stop_too_wide", { stop_atr: stop / atr });
    return candidate(this, market, direction, stop, 1.2, 2.1, 84, { trend_state: market.trendState, pullback_depth_atr: depth, momentum_confirmed: true, swing_stop: swing });
  },
};

export const GoldVolatilityBreakout: ForexResearchStrategy = {
  id: "gold.volatility-breakout", version: "0.1.0-research", symbols: ["XAUUSD"], timeframes: ["15m"], sessions: liquidSessions,
  evaluate(input) {
    const market = contextFor(input), blocked = preflight(this, input, market); if (blocked || !market) return blocked!;
    if (market.instrument.assetClass !== "gold") return reject("gold_symbol_required");
    if (["LOW", "ABNORMAL"].includes(market.volatilityState)) return reject(market.volatilityState === "LOW" ? "compression_not_ready" : "volatility_unstable", { volatility_state: market.volatilityState });
    const prior = market.normalizedCandles.slice(-31, -1), last = market.currentClosedCandle!, atr = market.indicators.atr14;
    const high = Math.max(...prior.map((c) => c.high)), low = Math.min(...prior.map((c) => c.low)), direction = last.close > high ? "buy" : last.close < low ? "sell" : null;
    if (!direction) return reject("breakout_unconfirmed", { range_high: high, range_low: low });
    const body = Math.abs(last.close - last.open), expansion = direction === "buy" ? last.close - high : low - last.close;
    if (body < atr * .7) return reject("expansion_unconfirmed", { body_atr: body / atr });
    if (expansion > atr * 1.8) return reject("breakout_overextended", { expansion_atr: expansion / atr });
    const priorRanges = prior.map((c) => c.high - c.low), averageRange = priorRanges.reduce((sum, value) => sum + value, 0) / Math.max(priorRanges.length, 1);
    if (averageRange > atr * 1.4) return reject("compression_missing", { average_range_atr: averageRange / atr });
    return candidate(this, market, direction, Math.max(atr * 1.8, 2.5), 1.2, 2.2, 86, { gold_specific: true, price_precision: market.instrument.pricePrecision, pip_size: market.instrument.pipSize, compression_range: averageRange, expansion_atr: expansion / atr });
  },
};

export const FOREX_RESEARCH_STRATEGIES = [ForexLondonBreakout, ForexNewYorkContinuation, ForexTrendPullback, GoldVolatilityBreakout] as const;
