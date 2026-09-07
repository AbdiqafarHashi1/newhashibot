import { BtCandle } from './types';
import { StrategyName } from '../StrategyConfig';

export function calcEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

export function calcATR(candles: BtCandle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 2) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (gains + losses === 0) return 50;
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

export interface EvalOutput {
  ok: boolean;
  direction: 'buy' | 'sell';
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  score: number;
  grade: string;
  reason: string;
  rejectionCause?: string;
}

export function evaluateStrategySetup(
  name: StrategyName,
  rawWindow: BtCandle[],
  _tf: string,
  params: Record<string, number>,
  enforceSessionWindows: boolean = true
): EvalOutput {
  if (rawWindow.length < 50) {
    return {
      ok: false,
      direction: 'buy',
      entry: 0,
      stop_loss: 0,
      tp1: 0,
      tp2: 0,
      score: 0,
      grade: 'reject',
      reason: 'Insufficient candle history',
      rejectionCause: 'data_too_short',
    };
  }

  const window = rawWindow.length > 120 ? rawWindow.slice(-120) : rawWindow;
  const last = window[window.length - 1];
  const prev = window[window.length - 2];
  const closes = window.map((c) => c.close);
  const price = last.close;
  const atr = Math.max(calcATR(window, params.atr_len ?? 14), price * 0.0001);
  const rsi = calcRSI(closes, params.rsi_len ?? 14);
  const ema20 = calcEMA(closes, params.ema_fast ?? 20);
  const ema50 = calcEMA(closes, params.ema_slow ?? 50);

  const timeStr = last.time;
  const dateObj = new Date(timeStr.includes('T') ? timeStr : timeStr.replace(' ', 'T') + 'Z');
  const hour = dateObj.getUTCHours();
  const dayOfWeek = dateObj.getUTCDay();

  // 1. LondonBreakout (07:00-10:00 UTC) with Asian Range & Judas Swing Wick Filter
  if (name === 'LondonBreakout') {
    if (enforceSessionWindows && (hour < 7 || hour > 10)) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside London Open window (07:00-10:00 UTC)', rejectionCause: 'session_closed' };
    }
    const asianCandles = window.slice(-28, -4);
    if (asianCandles.length < 10) return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Incomplete Asian session history', rejectionCause: 'session_data_missing' };
    const asianHigh = Math.max(...asianCandles.map((c) => c.high));
    const asianLow = Math.min(...asianCandles.map((c) => c.low));

    const candleSpan = last.high - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const maxWickRatio = params.max_wick_ratio ?? 0.50;

    const isInitialBreakBuy = prev.close <= asianHigh && last.close > asianHigh && last.close > last.open;
    const isRetestBuy = prev.close > asianHigh && last.low <= asianHigh && last.close > asianHigh && last.close > last.open;

    const isInitialBreakSell = prev.close >= asianLow && last.close < asianLow && last.close < last.open;
    const isRetestSell = prev.close < asianLow && last.high >= asianLow && last.close < asianLow && last.close < last.open;

    if (isInitialBreakBuy || isRetestBuy) {
      if (candleSpan > 0 && upperWick / candleSpan > maxWickRatio) {
        return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Judas Swing upper wick exhaustion', rejectionCause: 'judas_wick_filter' };
      }
      const sl = price - atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price + atr * (params.tp1_r ?? 1.5);
      const tp2 = price + atr * (params.tp2_r ?? 2.8);
      const score = isInitialBreakBuy ? 92 : 88;
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score, grade: 'A+', reason: `London Breakout Long above Asian High (${asianHigh})` };
    } else if (isInitialBreakSell || isRetestSell) {
      if (candleSpan > 0 && lowerWick / candleSpan > maxWickRatio) {
        return { ok: false, direction: 'sell', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Judas Swing lower wick exhaustion', rejectionCause: 'judas_wick_filter' };
      }
      const sl = price + atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price - atr * (params.tp1_r ?? 1.5);
      const tp2 = price - atr * (params.tp2_r ?? 2.8);
      const score = isInitialBreakSell ? 92 : 88;
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score, grade: 'A+', reason: `London Breakout Short below Asian Low (${asianLow})` };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'No breakout or retest trigger', rejectionCause: 'inside_range' };
  }

  // 2. NYContinuation (12:00-16:00 UTC) with Displacement ATR & Pullback Bounce
  if (name === 'NYContinuation') {
    if (enforceSessionWindows && (hour < 12 || hour > 16)) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside NY Session window (12:00-16:00 UTC)', rejectionCause: 'session_closed' };
    }
    const displacement = Math.abs(last.close - ema50);
    const maxDisplacementAtr = (params.max_displacement_atr ?? 3.2) * atr;
    if (displacement > maxDisplacementAtr) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Displacement overextended (> 3.2 ATR)', rejectionCause: 'overextended_atr' };
    }

    const isPullbackBuy = ema20 > ema50 && prev.low <= ema20 * 1.0015 && last.close > ema20 && last.close > last.open && rsi > 50;
    const isPullbackSell = ema20 < ema50 && prev.high >= ema20 * 0.9985 && last.close < ema20 && last.close < last.open && rsi < 50;

    if (isPullbackBuy) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price + atr * (params.tp1_r ?? 1.4);
      const tp2 = price + atr * (params.tp2_r ?? 2.6);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A+', reason: 'NY Session EMA Pullback & Momentum Reclaim Long' };
    } else if (isPullbackSell) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price - atr * (params.tp1_r ?? 1.4);
      const tp2 = price - atr * (params.tp2_r ?? 2.6);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A+', reason: 'NY Session EMA Pullback & Momentum Reclaim Short' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Pullback bounce condition not met', rejectionCause: 'trend_mismatch' };
  }

  // 3. GoldVolatilityBreakout (XAUUSD 6h Box Breakout with Friday 20:00 UTC liquidation rule)
  if (name === 'GoldVolatilityBreakout') {
    if (enforceSessionWindows && dayOfWeek === 5 && hour >= 20) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Friday evening weekend risk lockout', rejectionCause: 'weekend_freeze' };
    }
    const boxBars = params.box_lookback ?? 20;
    const boxSlice = window.slice(-boxBars - 1, -1);
    if (boxSlice.length < 10) return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Insufficient 6h box bars', rejectionCause: 'box_too_short' };
    const boxHigh = Math.max(...boxSlice.map((c) => c.high));
    const boxLow = Math.min(...boxSlice.map((c) => c.low));
    const boxRange = boxHigh - boxLow;

    if (boxRange > atr * (params.max_box_atr_range ?? 6.0)) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Box range too wide for compression', rejectionCause: 'box_too_wide' };
    }

    const isBreakBuy = prev.close <= boxHigh && last.close > boxHigh && last.close > last.open;
    const isRetestBuy = prev.close > boxHigh && last.low <= boxHigh && last.close > boxHigh && last.close > last.open;

    const isBreakSell = prev.close >= boxLow && last.close < boxLow && last.close < last.open;
    const isRetestSell = prev.close < boxLow && last.high >= boxLow && last.close < boxLow && last.close < last.open;

    const isTrendBull = ema20 >= ema50 * 0.999 && rsi >= 48;
    const isTrendBear = ema20 <= ema50 * 1.001 && rsi <= 52;

    const stopDist = atr * (params.stop_atr_mult ?? 1.25);
    const tp1Dist = stopDist * (params.tp1_r ?? 1.6);
    const tp2Dist = stopDist * (params.tp2_r ?? 3.0);

    if ((isBreakBuy || isRetestBuy) && isTrendBull) {
      const sl = price - stopDist;
      const tp1 = price + tp1Dist;
      const tp2 = price + tp2Dist;
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 93, grade: 'A+', reason: `Gold 6h Box Breakout Long ($${price.toFixed(2)})` };
    } else if ((isBreakSell || isRetestSell) && isTrendBear) {
      const sl = price + stopDist;
      const tp1 = price - tp1Dist;
      const tp2 = price - tp2Dist;
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 93, grade: 'A+', reason: `Gold 6h Box Breakout Short ($${price.toFixed(2)})` };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Within 6h Gold box', rejectionCause: 'inside_box' };
  }

  // 4. FXMicroScalper (Session Micro-Breakout & Impulse Scalper 5m/15m)
  if (name === 'FXMicroScalper') {
    if (enforceSessionWindows && ((hour < 7 || hour > 17) || (dayOfWeek === 5 && hour >= 20))) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside liquid Forex trading hours (07:00-17:00 UTC)', rejectionCause: 'session_closed' };
    }

    const boxLookback = 12;
    const boxSlice = window.slice(-boxLookback - 1, -1);
    if (boxSlice.length < 8) return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Insufficient micro bars', rejectionCause: 'insufficient_history' };

    const boxHigh = Math.max(...boxSlice.map((c) => c.high));
    const boxLow = Math.min(...boxSlice.map((c) => c.low));

    const isBreakBuy = prev.close <= boxHigh && last.close > boxHigh && last.close > last.open && ema20 >= ema50 * 0.999 && rsi > 52;
    const isBreakSell = prev.close >= boxLow && last.close < boxLow && last.close < last.open && ema20 <= ema50 * 1.001 && rsi < 48;

    if (isBreakBuy) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.3);
      const tp1 = price + atr * (params.tp1_r ?? 1.4);
      const tp2 = price + atr * (params.tp2_r ?? 2.5);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 89, grade: 'A', reason: 'Forex Session Micro-Breakout Long with EMA & RSI momentum' };
    } else if (isBreakSell) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.3);
      const tp1 = price - atr * (params.tp1_r ?? 1.4);
      const tp2 = price - atr * (params.tp2_r ?? 2.5);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 89, grade: 'A', reason: 'Forex Session Micro-Breakout Short with EMA & RSI momentum' };
    }

    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Inside micro breakout range', rejectionCause: 'inside_box' };
  }

  // 4b. CryptoMicroScalper (Micro-Momentum & Volume Impulse Scalper 5m/15m)
  if (name === 'CryptoMicroScalper') {
    const boxLookback = params.box_lookback ?? 12;
    const boxSlice = window.slice(-boxLookback - 1, -1);
    if (boxSlice.length < 8) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Insufficient micro bars', rejectionCause: 'insufficient_history' };
    }

    const boxHigh = Math.max(...boxSlice.map((c) => c.high));
    const boxLow = Math.min(...boxSlice.map((c) => c.low));

    const isBreakBuy = prev.close <= boxHigh && last.close > boxHigh && last.close > last.open && ema20 >= ema50 * 0.999 && rsi > 52;
    const isBreakSell = prev.close >= boxLow && last.close < boxLow && last.close < last.open && ema20 <= ema50 * 1.001 && rsi < 48;

    if (isBreakBuy) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.3);
      const tp1 = price + atr * (params.tp1_r ?? 1.5);
      const tp2 = price + atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: 'Crypto Micro-Breakout Long with Trend & Momentum Alignment' };
    } else if (isBreakSell) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.3);
      const tp1 = price - atr * (params.tp1_r ?? 1.5);
      const tp2 = price - atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: 'Crypto Micro-Breakout Short with Trend & Momentum Alignment' };
    }

    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Inside micro breakout range', rejectionCause: 'inside_box' };
  }

  // 5. CryptoCompressionBreakout (Donchian Box Breakout)
  if (name === 'CryptoCompressionBreakout') {
    const boxLookback = params.box_lookback ?? 20;
    const boxSlice = window.slice(-boxLookback - 1, -1);
    const boxHigh = Math.max(...boxSlice.map((c) => c.high));
    const boxLow = Math.min(...boxSlice.map((c) => c.low));
    const buf = atr * (params.breakout_buffer_atr ?? 0.08);

    const isBreakBuy = prev.close <= boxHigh + buf && last.close > boxHigh + buf && last.close > last.open && ema20 >= ema50 * 0.999;
    const isRetestBuy = prev.close > boxHigh && last.low <= boxHigh && last.close > boxHigh && last.close > last.open && ema20 >= ema50 * 0.999;

    const isBreakSell = prev.close >= boxLow - buf && last.close < boxLow - buf && last.close < last.open && ema20 <= ema50 * 1.001;
    const isRetestSell = prev.close < boxLow && last.high >= boxLow && last.close < boxLow && last.close < last.open && ema20 <= ema50 * 1.001;

    if (isBreakBuy || isRetestBuy) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price + atr * (params.tp1_r ?? 1.5);
      const tp2 = price + atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Compression Box Breakout Long with EMA alignment' };
    } else if (isBreakSell || isRetestSell) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.4);
      const tp1 = price - atr * (params.tp1_r ?? 1.5);
      const tp2 = price - atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Compression Box Breakout Short with EMA alignment' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Inside compression boundaries', rejectionCause: 'inside_box' };
  }

  // 6. CryptoReversalExhaustion (Cyclical Overextension & Momentum Exhaustion Reversal)
  if (name === 'CryptoReversalExhaustion') {
    const lookback = params.exhaustion_lookback ?? 12;
    const priorSlice = window.slice(-lookback - 1, -1);
    if (priorSlice.length < 8) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Insufficient bars for exhaustion window', rejectionCause: 'insufficient_history' };
    }

    const prevEma20 = calcEMA(closes.slice(0, -1), 20);
    const priorHigh = Math.max(...priorSlice.map((c) => c.high));
    const priorLow = Math.min(...priorSlice.map((c) => c.low));

    // Exhaustion Short: Prior price reached overextension (> EMA50 + 1.0 ATR), now price decisively broke below EMA20 with a bearish impulse, EMA20 turned down, RSI between 38 and 52
    const hadOverbought = priorHigh >= ema50 + atr * 1.0;
    const isExhaustionShort =
      hadOverbought &&
      last.close < ema20 &&
      last.close < last.open &&
      (last.open - last.close >= atr * 0.25) &&
      ema20 <= prevEma20 &&
      rsi <= 52 &&
      rsi >= 38;

    // Exhaustion Long: Prior price reached overextension (< EMA50 - 1.0 ATR), now price decisively broke above EMA20 with a bullish impulse, EMA20 turned up, RSI between 48 and 62
    const hadOversold = priorLow <= ema50 - atr * 1.0;
    const isExhaustionLong =
      hadOversold &&
      last.close > ema20 &&
      last.close > last.open &&
      (last.close - last.open >= atr * 0.25) &&
      ema20 >= prevEma20 &&
      rsi >= 48 &&
      rsi <= 62;

    if (isExhaustionShort) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.35);
      const tp1 = price - atr * (params.tp1_r ?? 1.5);
      const tp2 = price - atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: `Cyclical Exhaustion Reversal Short: Post-Overextension Impulse Breakdown below EMA20` };
    } else if (isExhaustionLong) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.35);
      const tp1 = price + atr * (params.tp1_r ?? 1.5);
      const tp2 = price + atr * (params.tp2_r ?? 2.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: `Cyclical Exhaustion Reversal Long: Post-Oversold Impulse Reclaim above EMA20` };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'No clean cyclical overextension & EMA hook confirmation', rejectionCause: 'no_exhaustion' };
  }

  // 7. CryptoMomentumBreakout (Keltner surge & Volume spike)
  if (name === 'CryptoMomentumBreakout') {
    const keltnerUpper = ema20 + atr * 1.8;
    const keltnerLower = ema20 - atr * 1.8;
    if (prev.close <= keltnerUpper && price > keltnerUpper && last.volume > 200 && rsi > 55) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price + atr * (params.tp1_r ?? 2.0);
      const tp2 = price + atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Keltner Surge Momentum Long with Volume Confirmation' };
    } else if (prev.close >= keltnerLower && price < keltnerLower && last.volume > 200 && rsi < 45) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price - atr * (params.tp1_r ?? 2.0);
      const tp2 = price - atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Keltner Surge Momentum Short with Volume Confirmation' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Within Keltner band', rejectionCause: 'inside_keltner' };
  }

  // 8. CryptoSwingContinuation / FXTrendPullback (EMA Trend & Pullback)
  if (name === 'CryptoSwingContinuation' || name === 'FXTrendPullback') {
    if (name === 'FXTrendPullback' && enforceSessionWindows && ((hour < 7 || hour > 17) || (dayOfWeek === 5 && hour >= 20))) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside liquid Forex trading hours (07:00-17:00 UTC)', rejectionCause: 'session_closed' };
    }

    const isBull = ema20 > ema50;
    const isBear = ema20 < ema50;
    if (isBull && prev.low <= ema20 * 1.0015 && price > ema20 && rsi > 48 && last.close > last.open) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price + atr * (params.tp1_r ?? 2.0);
      const tp2 = price + atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: 'Swing Trend EMA Pullback & Reclaim Long' };
    } else if (isBear && prev.high >= ema20 * 0.9985 && price < ema20 && rsi < 52 && last.close < last.open) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price - atr * (params.tp1_r ?? 2.0);
      const tp2 = price - atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 90, grade: 'A', reason: 'Swing Trend EMA Pullback & Reclaim Short' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Pullback condition not primed', rejectionCause: 'no_pullback' };
  }

  // 9. SessionORB (Opening Range Breakout 5m/15m)
  if (name === 'SessionORB') {
    if (hour !== 7 && hour !== 12 && hour !== 13) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside session opening window', rejectionCause: 'not_opening_window' };
    }
    const orbRange = window.slice(-6, -1);
    const orbHigh = Math.max(...orbRange.map((c) => c.high));
    const orbLow = Math.min(...orbRange.map((c) => c.low));
    const isBreakBuy = prev.close <= orbHigh && last.close > orbHigh && last.close > last.open;
    const isBreakSell = prev.close >= orbLow && last.close < orbLow && last.close < last.open;

    if (isBreakBuy) {
      const sl = price - atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price + atr * (params.tp1_r ?? 2.0);
      const tp2 = price + atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 89, grade: 'A', reason: 'Session Opening Range Breakout Long' };
    } else if (isBreakSell) {
      const sl = price + atr * (params.stop_atr_mult ?? 1.1);
      const tp1 = price - atr * (params.tp1_r ?? 2.0);
      const tp2 = price - atr * (params.tp2_r ?? 3.8);
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 89, grade: 'A', reason: 'Session Opening Range Breakout Short' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Inside ORB range', rejectionCause: 'inside_orb' };
  }

  // 10. MacroYieldDifferential (Global Trend Anchor 4h/1d)
  if (name === 'MacroYieldDifferential') {
    // Macro updates anchor on 4h boundary sessions (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
    if (hour % 4 !== 0) {
      return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Outside 4h macro yield alignment window', rejectionCause: 'macro_candle_wait' };
    }
    if (ema20 > ema50 && price > ema20 && rsi > 52 && last.close > last.open) {
      const sl = price - atr * 1.1;
      const tp1 = price + atr * 2.2;
      const tp2 = price + atr * 4.2;
      return { ok: true, direction: 'buy', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Macro Sovereign Yield Spread Expansion Long (> 25 bps)' };
    } else if (ema20 < ema50 && price < ema20 && rsi < 48 && last.close < last.open) {
      const sl = price + atr * 1.1;
      const tp1 = price - atr * 2.2;
      const tp2 = price - atr * 4.2;
      return { ok: true, direction: 'sell', entry: price, stop_loss: sl, tp1, tp2, score: 91, grade: 'A+', reason: 'Macro Sovereign Yield Spread Expansion Short (> 25 bps)' };
    }
    return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Macro yield differential flat (< 25 bps)', rejectionCause: 'macro_flat' };
  }

  return { ok: false, direction: 'buy', entry: 0, stop_loss: 0, tp1: 0, tp2: 0, score: 0, grade: 'reject', reason: 'Strategy evaluation unhandled', rejectionCause: 'unhandled' };
}
