import { generateSyntheticSessionData } from './syntheticData';
import { calcEMA, calcATR, calcRSI } from './evaluators';

const candles = generateSyntheticSessionData('BTCUSDT', 'crypto', 65000, 2880, 15);

// Test Break of Structure & Retest (CHoCH / Role Reversal)
let trades = 0;
let wins = 0;
let losses = 0;
let netR = 0;

for (let i = 50; i < candles.length - 24; i++) {
  const window = candles.slice(0, i + 1);
  const last = window[window.length - 1];
  const prev = window[window.length - 2];
  const closes = window.map(c => c.close);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const atr = calcATR(window, 14);
  const rsi = calcRSI(closes, 14);

  // Look for exhaustion of the prior trend:
  // Bullish Reversal: Price was below EMA50, but broke decisively above EMA20 & EMA50, then pulled back to EMA20 and printed a bullish candle
  const isBullReversal = prev.low <= ema20 && last.close > ema20 && last.close > last.open && ema20 >= ema50 && rsi >= 50 && rsi <= 65;
  
  // Bearish Reversal: Price was above EMA50, but broke decisively below EMA20 & EMA50, then pulled back to EMA20 and printed a bearish candle
  const isBearReversal = prev.high >= ema20 && last.close < ema20 && last.close < last.open && ema20 <= ema50 && rsi <= 50 && rsi >= 35;

  let sig: { dir: 'buy' | 'sell'; sl: number; tp: number } | null = null;
  if (isBullReversal) {
    const sl = last.close - atr * 1.3;
    const tp = last.close + atr * 1.6;
    sig = { dir: 'buy', sl, tp };
  } else if (isBearReversal) {
    const sl = last.close + atr * 1.3;
    const tp = last.close - atr * 1.6;
    sig = { dir: 'sell', sl, tp };
  }

  if (!sig) continue;
  trades++;
  const isBuy = sig.dir === 'buy';
  const entry = last.close;
  const sl = sig.sl;
  const tp = sig.tp;
  const risk = Math.abs(entry - sl);

  let exitR = 0;
  for (let f = i + 1; f < Math.min(candles.length, i + 24); f++) {
    const bar = candles[f];
    const slHit = isBuy ? bar.low <= sl : bar.high >= sl;
    const tpHit = isBuy ? bar.high >= tp : bar.low <= tp;
    if (slHit) {
      exitR = -1.0;
      losses++;
      break;
    }
    if (tpHit) {
      exitR = (Math.abs(tp - entry) / risk);
      wins++;
      break;
    }
  }
  netR += exitR;
}

console.log(`[Trend Shift / Reversal Retest] Trades: ${trades}, Wins: ${wins}, Losses: ${losses}, WR: ${(wins / Math.max(1, trades) * 100).toFixed(1)}%, Net R: ${netR.toFixed(2)}`);
