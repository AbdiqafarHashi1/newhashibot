import type {StrategyCandle as Candle,StrategyIndicatorSnapshot as Indicators,LegacyStrategyResult as EvalResult} from "./professional-strategies.ts";
import {emaRootV1,atrRootV1,rsiRootV1} from "./indicator-engine.ts";
import {runtimeInstrument,roundRuntimePrice,runtimePipDistance} from "./forex-runtime-contracts.ts";
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
const calcEMA=emaRootV1,calcATR=atrRootV1,calcRSI=rsiRootV1;
const clampScore=(v:number)=>Math.min(Math.max(Math.round(v),0),100);
const scoreGrade=(v:number)=>v>=85?"A+":v>=75?"A":v>=65?"B":"reject";
const hasInvalidCandles=(c:Candle[])=>c.some(x=>![x.open,x.high,x.low,x.close].every(Number.isFinite)||x.high<x.low||x.close<=0);
const pctDistance=(a:number,b:number)=>a>0&&Number.isFinite(a)&&Number.isFinite(b)?parseFloat((Math.abs(b-a)/a*100).toFixed(4)):0;
function calcMomentumScore(v:number[],lookback=3){const r=v.slice(-lookback-1);let up=0,dn=0;for(let i=1;i<r.length;i++)r[i]>r[i-1]?up++:r[i]<r[i-1]?dn++:0;return(up-dn)/lookback;}
function strategyZeroReject(reason:string):EvalResult{return {status:"rejected",direction:"",entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:"reject",reason,rejection_reason:reason,score_breakdown:{primary_failed_gate:reason}};}
function forexPairType(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const instrument = runtimeInstrument(normalized);
  return instrument?.instrument_class === "metal_gold" ? "metal_gold" : instrument?.instrument_class === "fx_jpy" ? "fx_jpy" : instrument?.instrument_class === "fx_non_jpy" ? "fx_non_jpy" : "unknown";
}

function forexSessionContext(date?: Date): string {
  if(!date)return "Unknown";
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

export function evalForexMicroScalper(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
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
    session_context: forexSessionContext(new Date(candles.at(-1)!.open_time)),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `ForexMicroScalper ${direction}: EMA context=${trendScore}, momentum=${momentumScore}, candle=${candleScore}, ATR=${atrPips.toFixed(1)} pips, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

// ─── CompressionBreakout ──────────────────────────────────────────────────────






// ─── SwingContinuation ────────────────────────────────────────────────────────



// ─── ForexSwingContinuation ──────────────────────────────────────────────────

export function evalForexSwingContinuation(candles: Candle[], ind: Indicators, timeframe: string, params: Record<string, number>): EvalResult {
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
    session_context: forexSessionContext(new Date(candles.at(-1)!.open_time)),
    forex_pair_type: forexPairType(symbol),
    final_score: finalScore,
  };

  const grade = scoreGrade(finalScore);
  const reason = `ForexSwingContinuation ${direction}: EMA ${emaAlignment}, pullback=${pullbackScore}, reclaim=${reclaimConfirmed}, momentum=${momentumScore}, ATR=${atrPips.toFixed(1)} pips, rr=${risk_reward.toFixed(2)}R, score=${finalScore}`;
  if (primaryFailedGate) return { status: "rejected", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade: "reject", reason, rejection_reason: primaryFailedGate, score_breakdown };
  return { status: "candidate", direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, confidence_score: finalScore, grade, reason, rejection_reason: "", score_breakdown };
}

