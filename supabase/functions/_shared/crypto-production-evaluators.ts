import {atrRootV1,emaRootV1,rsiRootV1} from "./indicator-engine.ts";
import type {LegacyStrategyResult,StrategyCandle,StrategyIndicatorSnapshot} from "./professional-strategies.ts";
type Candle=StrategyCandle;type Indicators=StrategyIndicatorSnapshot;type EvalResult=LegacyStrategyResult;
const calcEMA=(v:number[],p:number)=>emaRootV1(v,p);const calcATR=(c:Candle[],p=14)=>atrRootV1(c,p);const calcRSI=(v:number[],p=14)=>rsiRootV1(v,p);
function calcMomentumScore(v:number[],lookback=3){const r=v.slice(-lookback-1);let up=0,dn=0;for(let i=1;i<r.length;i++)r[i]>r[i-1]?up++:r[i]<r[i-1]?dn++:0;return(up-dn)/lookback}
const clampScore=(v:number)=>Math.min(Math.max(Math.round(v),0),100);const scoreGrade=(v:number)=>v>=85?"A+":v>=75?"A":v>=65?"B":"reject";
const hasInvalidCandles=(c:Candle[])=>c.some(x=>![x.open,x.high,x.low,x.close].every(Number.isFinite)||x.high<x.low||x.close<=0);
const pctDistance=(a:number,b:number)=>a>0&&Number.isFinite(a)&&Number.isFinite(b)?parseFloat(Math.abs((b-a)/a*100).toFixed(4)):0;
function strategyZeroReject(reason:string):EvalResult{return{status:"rejected",direction:"none",entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:"reject",reason,rejection_reason:reason,score_breakdown:{primary_failed_gate:reason}}}
function higherTimeframeTrendConfirmed(candles:Candle[]|undefined,direction:"buy"|"sell"){if(!candles||candles.length<55||hasInvalidCandles(candles))return false;const closes=candles.map(c=>c.close),ema20=calcEMA(closes,20),ema50=calcEMA(closes,50),last=candles.at(-1)!;return direction==="buy"?ema20>ema50&&last.close>ema20:ema20<ema50&&last.close<ema20}

export function directionalPressure(candles: Candle[], direction: "buy" | "sell", lookback = 3): { confirmed: boolean; aligned_count: number; pressure_score: number }

export function evalMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>, higherTimeframeCandles?: Candle[]): EvalResult {
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

export function evalQuickScalp(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
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

export function evalCompressionBreakout(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
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

export function evalSwingContinuation(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
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
