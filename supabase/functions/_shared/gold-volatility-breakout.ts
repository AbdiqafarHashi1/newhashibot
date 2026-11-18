import {nativeCandleEvidence} from './native-candle-evidence.ts';
import { buildForexMarketContext, forexSessionContext, roundInstrumentPrice } from "./forex-domain.ts";
import type { LegacyStrategyResult, StrategyEvaluationContext } from "./professional-strategies.ts";

export const GOLD_STRATEGY_ID = "gold.volatility-breakout" as const;
export const GOLD_STRATEGY_VERSION = "1.0.0" as const;
export const GOLD_EVALUATOR_ID = "evaluateGoldVolatilityBreakout" as const;
export const GOLD_CERTIFICATION_PROVENANCE = "FOREX_AND_GOLD_STRATEGY_AUTHENTICITY_20260730" as const;

type Evidence = Record<string, number | string | boolean>;
type GoldContext = StrategyEvaluationContext & { spread_price?: number; event_risk?: { available: boolean; high_impact_usd: boolean; protection_required?: boolean } };

function fingerprint(evidence: Evidence): string {
  const input = JSON.stringify(Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b)));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function provenance(input: StrategyEvaluationContext, evidence: Evidence): Evidence {
  const base: Evidence = { strategy_id: GOLD_STRATEGY_ID, strategy_version: GOLD_STRATEGY_VERSION, evaluator_identity: GOLD_EVALUATOR_ID, certification: "MEASURED_RELEASE_REQUIRED", certification_provenance: GOLD_CERTIFICATION_PROVENANCE, symbol: input.symbol, instrument_class: "metal_gold", provider: input.candles[0]?.source==="EXNESS_BROKER_BID_ASK"?"EXNESS_REFERENCE":"mt5", primary_timeframe: "15m", context_timeframe: "1h", ...evidence };
  return { ...base, deterministic_fingerprint: fingerprint(base) };
}
function reject(input: StrategyEvaluationContext, reason: string, evidence: Evidence = {}): LegacyStrategyResult {
  return { status: "rejected", direction: "none", entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0, confidence_score: 0, grade: "reject", reason, rejection_reason: reason, score_breakdown: provenance(input, { primary_failed_gate: reason, ...evidence }) };
}

/** Gold-only, closed-candle volatility expansion. The evaluator is pure: it does
 * not fetch data, size positions, mutate candles, or consult wall-clock time. */
export function evaluateGoldVolatilityBreakout(input: StrategyEvaluationContext): LegacyStrategyResult {
  const context = input as GoldContext;
  if (input.symbol !== "XAUUSD") return reject(input, "gold_symbol_not_supported", { received_symbol: input.symbol });
  if (input.market !== "forex") return reject(input, "strategy_instrument_class_not_supported", { received_market: input.market });
  if (input.timeframe !== "15m") return reject(input, "unsupported_timeframe", { received_timeframe: input.timeframe });
  if (input.candles.some(c => {if(c.symbol!=="XAUUSD")return true;if(c.source.toLowerCase().startsWith("mt5"))return false;if(c.source!=="EXNESS_BROKER_BID_ASK"||c.ask_open===undefined)return true;try{nativeCandleEvidence(c as unknown as Record<string,unknown>);return false;}catch{return true;}})) return reject(input, "gold_provider_or_symbol_metadata_invalid");
  const market = buildForexMarketContext({ symbol: input.symbol, timeframe: input.timeframe, candles: input.candles, indicators: input.indicators, evaluatedAt: input.evaluated_at, spreadPrice: context.spread_price, provider: "mt5" });
  if (!market || market.instrument.assetClass !== "gold") return reject(input, "strategy_instrument_class_not_supported");
  if (market.malformed) return reject(input, "gold_malformed_candles");
  if (market.stale) return reject(input, "stale_candles");
  if (market.normalizedCandles.length < 64) return reject(input, "insufficient_candles", { candle_count: market.normalizedCandles.length });
  const session = forexSessionContext(input.evaluated_at);
  if (!session.marketOpen) return reject(input, session.weekend ? "gold_weekend_closed" : "gold_session_not_eligible");
  const evaluated = new Date(input.evaluated_at);
  if (evaluated.getUTCDay() === 5 && evaluated.getUTCHours() >= 20) return reject(input, "gold_friday_close_risk");
  if (!(["LONDON", "NEW_YORK", "LONDON_NEW_YORK_OVERLAP"] as string[]).includes(market.session)) return reject(input, "gold_session_not_eligible", { session: market.session });
  if (!market.spread.eligible) return reject(input, "gold_spread_too_wide", { spread_pips: market.spread.spreadPips ?? -1 });
  const eventRisk = context.event_risk;
  if (eventRisk?.protection_required && !eventRisk.available) return reject(input, "gold_event_risk_unavailable");
  if (eventRisk?.available && eventRisk.high_impact_usd) return reject(input, "gold_event_risk_blocked");

  const rows = market.normalizedCandles, last = rows[rows.length - 1]!, follow = rows[rows.length - 2]!;
  const atr = input.indicators.atr14;
  if (!Number.isFinite(atr) || atr <= market.instrument.pointSize * 10) return reject(input, "gold_volatility_invalid");
  const box = rows.slice(-26, -2); // six UTC hours, excluding acceptance candles
  const high = Math.max(...box.map(c => c.high)), low = Math.min(...box.map(c => c.low));
  const width = high - low, widthAtr = width / atr;
  if (widthAtr < 0.8 || widthAtr > 5.5) return reject(input, "gold_range_quality_failed", { range_width_atr: widthAtr });
  const avgRange = box.reduce((sum, c) => sum + c.high - c.low, 0) / box.length;
  const compression = avgRange / atr;
  if (compression > 1.05) return reject(input, "gold_compression_missing", { compression_ratio: compression });
  const buy = follow.close > high && last.close > high;
  const sell = follow.close < low && last.close < low;
  if (!buy && !sell) return reject(input, "gold_setup_not_present", { range_high: high, range_low: low });
  const direction: "buy" | "sell" = buy ? "buy" : "sell";
  const boundary = buy ? high : low;
  const breakoutBody = Math.abs(follow.close - follow.open), breakoutRange = follow.high - follow.low;
  const displacement = Math.abs(follow.close - boundary) / atr;
  const acceptance = Math.abs(last.close - boundary) / atr;
  const adverseWick = buy ? follow.high - follow.close : follow.close - follow.low;
  if (breakoutRange <= 0 || adverseWick / breakoutRange > 0.48) return reject(input, "gold_false_breakout", { wick_ratio: breakoutRange > 0 ? adverseWick / breakoutRange : 1 });
  const minimumBodyAtr = input.strategy_parameters?.minimumBodyAtr ?? .55;
  const minimumAcceptanceAtr = input.strategy_parameters?.minimumAcceptanceAtr ?? .08;
  if (breakoutBody / atr < minimumBodyAtr || displacement < 0.12 || acceptance < minimumAcceptanceAtr) return reject(input, "gold_failed_follow_through", { breakout_body_atr: breakoutBody / atr, displacement_atr: displacement, acceptance_atr: acceptance });
  const extension = Math.abs(last.close - input.indicators.ema20) / atr;
  const climactic = Math.max(breakoutRange, last.high - last.low) / atr;
  if (extension > 2.4 || displacement > 1.35 || climactic > 2.8) return reject(input, "gold_exhaustion_detected", { extension_atr: extension, displacement_atr: displacement, climactic_range_atr: climactic });
  if (buy ? input.indicators.ema20 < input.indicators.ema50 : input.indicators.ema20 > input.indicators.ema50) return reject(input, "gold_higher_timeframe_conflict");

  const price = last.close;
  const entryBuffer = Math.min(atr * .08, width * .04);
  const entry_low = roundInstrumentPrice("XAUUSD", price - entryBuffer), entry_high = roundInstrumentPrice("XAUUSD", price + entryBuffer);
  const structural = buy ? Math.min(boundary - atr * .18, follow.low - atr * .08) : Math.max(boundary + atr * .18, follow.high + atr * .08);
  const stopDistance = Math.max(Math.abs(price - structural), atr * 1.15, market.instrument.pointSize * 50);
  if (stopDistance > atr * 2.6) return reject(input, "gold_stop_too_wide", { stop_atr: stopDistance / atr });
  const stop_loss = roundInstrumentPrice("XAUUSD", buy ? price - stopDistance : price + stopDistance);
  const tp1R = Math.max(1.25, Math.min(1.6, width / stopDistance));
  const tp2R = Math.max(2.05, Math.min(2.8, (width * 1.25) / stopDistance));
  const tp1 = roundInstrumentPrice("XAUUSD", buy ? price + stopDistance * tp1R : price - stopDistance * tp1R);
  const tp2 = roundInstrumentPrice("XAUUSD", buy ? price + stopDistance * tp2R : price - stopDistance * tp2R);
  const sessionScore = market.session === "LONDON_NEW_YORK_OVERLAP" ? 100 : 82;
  const rangeScore = Math.max(0, 100 - Math.abs(widthAtr - 2.5) * 22), compressionScore = Math.max(0, 100 - compression * 70);
  const expansionScore = Math.min(100, (breakoutBody / atr) * 80), acceptanceScore = Math.min(100, acceptance * 130);
  const trendScore = 88, spreadScore = market.spread.spreadPips === null ? 65 : Math.max(0, 100 - market.spread.spreadPips * 8);
  const rrScore = Math.min(100, tp2R / 2.05 * 85), exhaustionPenalty = Math.max(0, extension - 1.5) * 18;
  const score = Math.round(Math.max(0, Math.min(100, rangeScore*.12 + compressionScore*.12 + expansionScore*.17 + acceptanceScore*.14 + trendScore*.12 + sessionScore*.09 + spreadScore*.07 + rrScore*.12 + 5 - exhaustionPenalty)));
  if (score < 74) return reject(input, "confidence_too_low", { final_score: score });
  const evidence = provenance(input, { primary_failed_gate: "passed", direction, range_high: high, range_low: low, range_width_atr: widthAtr, compression_score: compressionScore, range_quality_score: rangeScore, volatility_expansion_score: expansionScore, breakout_acceptance_score: acceptanceScore, higher_timeframe_alignment_score: trendScore, session_quality_score: sessionScore, spread_quality_score: spreadScore, structure_clearance_score: acceptanceScore, reward_risk_score: rrScore, exhaustion_penalty: exhaustionPenalty, false_breakout_penalty: 0, event_risk_status: eventRisk?.available ? "clear" : "capability_unavailable_not_required", final_score: score, risk_distance: stopDistance, holding_profile: "intraday_4_to_16_bars" });
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward: Number(tp2R.toFixed(2)), confidence_score: score, grade: score >= 88 ? "A+" : score >= 80 ? "A" : "B", reason: `Gold volatility breakout ${direction}: accepted ${acceptance.toFixed(2)} ATR beyond a ${widthAtr.toFixed(2)} ATR compression range`, rejection_reason: "", score_breakdown: evidence };
}
