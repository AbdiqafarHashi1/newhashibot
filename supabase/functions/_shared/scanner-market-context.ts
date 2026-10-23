import {observeAdaptiveMarket,type AdaptiveMarketEvidence} from "./adaptive-market-policy.ts";
import type {LegacyStrategyResult,StrategyRuntimeConfig,StrategyCandle,StrategyIndicatorSnapshot} from "./professional-strategies.ts";
export interface MarketArbitrationEntry {name:string;result:LegacyStrategyResult;cfg:StrategyRuntimeConfig;guard:{sl_pct:number;tp1_pct:number;tp2_pct:number}}
const clampScore=(value:number)=>Math.min(Math.max(Math.round(value),0),100);
const gradeIndex=(g:string)=>g==="A+"?3:g==="A"?2:g==="B"?1:0;
/** Shared market scoring and abstention authority for scanner and chronological replay. */
export interface MarketContext {
  adaptive: AdaptiveMarketEvidence;
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
  preferred_strategy: string;
  mixed_market: boolean;
  opportunity_score: number;
  expected_move_bucket: string;
  risk_quality: string;
  liquidity_quality: string;
  strategy_match: string;
  recent_move_pct: number;
  invalidation_distance_atr: number;
}

export function classifyMarketContext(ind: StrategyIndicatorSnapshot, candles: readonly StrategyCandle[]): MarketContext {
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

  let preferred_strategy: string = "none";
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
    adaptive: observeAdaptiveMarket(candles,ind), regime: ind.regime, trend_strength: trendStrength, momentum_strength: momentumStrength,
    volatility_expansion: volatilityExpansion, volatility_contraction: volatilityContraction,
    compression_state: compressionState, range_state: rangeState, chop_level: chopLevel,
    atr_regime: atrRegime, distance_from_ema_atr: parseFloat(distanceFromEmaAtr.toFixed(3)),
    overextension, breakout_state: breakoutState, pullback_state: pullbackState, reclaim_state: reclaimState,
    preferred_strategy, mixed_market, opportunity_score: opportunityScore, expected_move_bucket: expectedMoveBucket,
    risk_quality: riskQuality, liquidity_quality: liquidityQuality, strategy_match: preferred_strategy,
    recent_move_pct: parseFloat(recentMovePct.toFixed(3)), invalidation_distance_atr: parseFloat(invalidationDistanceAtr.toFixed(3)),
  };
}

const forexRole=(name:string)=>({ForexLondonBreakout:"CompressionBreakout",GoldVolatilityBreakout:"CompressionBreakout",ForexNewYorkContinuation:"MicroScalper",ForexTrendPullback:"SwingContinuation"}[name]??name);
export function marketRoleFit(e: MarketArbitrationEntry, ctx: MarketContext): number {
  if(e.cfg.params.market_adaptation_enabled===1)e={...e,name:forexRole(e.name)};
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

export function strategyFreshnessScore(e: MarketArbitrationEntry, ctx: MarketContext): number {
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

export function arbitrationNoTradeReason(ctx: MarketContext, entries: MarketArbitrationEntry[]): string {
  if (entries.length === 0) return "";
  if(entries.every(e=>['RegimeContinuation','RegimeRangeRejection','RegimeChannelBreakout'].includes(e.name))){
    // Explicit specialist policy: sideways balance is eligible only for range rejection.
    // Legacy choppiness thresholds must not label a valid range setup a trend failure.
    return entries.every(e=>e.result.score_breakdown.regime_policy_version==='regime-opportunity/v1'&&
      (e.name!=='RegimeRangeRejection'?['TREND_UP','TREND_DOWN','EXPANSION_UP','EXPANSION_DOWN'].includes(String(e.result.score_breakdown.regime)):e.result.score_breakdown.regime==='RANGE'))?'':'REGIME_POLICY_MISMATCH';
  }
  const top = entries[0];
  const topScore = arbitrationScore(top, ctx);
  const hasAPlus = entries.some((entry) => entry.result.grade === "A+");
  if(entries.every(e=>/^(Forex|Gold)/.test(e.name)&&e.cfg.params.market_adaptation_enabled===1)){
    if(ctx.chop_level>=76&&!hasAPlus)return "forex_chop_requires_a_plus";
    if(marketRoleFit(top,ctx)<55&&!hasAPlus)return "forex_strategy_role_mismatch";
    if(ctx.overextension>=90&&top.result.grade!=="A+")return "forex_overextended_entry";
    return "";
  }
  if (ctx.chop_level >= 76 && !hasAPlus) return "mixed_choppy_market_requires_a_plus";
  if (ctx.mixed_market && ctx.preferred_strategy === "none" && !hasAPlus) return "mixed_market_no_clear_strategy_requires_a_plus";
  if (ctx.mixed_market && top.result.grade !== "A+" && topScore < 0.68) return "mixed_market_expected_value_too_low";
  return "";
}

export function scoreBreakdownNumber(breakdown: Record<string, number | string | boolean>, key: string): number {
  const value = breakdown?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function scoreBreakdownBool(breakdown: Record<string, number | string | boolean>, key: string): boolean {
  return breakdown?.[key] === true || breakdown?.[key] === "true" || breakdown?.[key] === "passed";
}

export function strategyIdentityFit(e: MarketArbitrationEntry): number {
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

export function overextensionPenalty(e: MarketArbitrationEntry): number {
  const b = e.result.score_breakdown;
  let penalty = 0;
  if (scoreBreakdownBool(b, "chase_risk")) penalty += 0.10;
  const extensionAtr = scoreBreakdownNumber(b, "price_extension_atr");
  if (extensionAtr > 2.0) penalty += Math.min((extensionAtr - 2.0) * 0.04, 0.12);
  const bodyAtr = scoreBreakdownNumber(b, "body_atr");
  if ((e.name === "MicroScalper" || e.name === "ForexMicroScalper") && bodyAtr > 1.35) penalty += 0.04;
  return penalty;
}

export function arbitrationScore(e: MarketArbitrationEntry, ctx?: MarketContext): number {
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

