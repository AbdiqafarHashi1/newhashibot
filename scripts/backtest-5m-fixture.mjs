import fs from 'node:fs';

const CSV = 'data/backtests/5m.csv';
const DAY_MS = 86_400_000;
const TF_MINUTES = { '5m': 5, '15m': 15, '1h': 60 };
const STRATEGY_TIMEFRAMES = { MicroScalper: ['5m', '15m'], CompressionBreakout: ['15m', '1h'], SwingContinuation: ['15m', '1h'] };
const PRESET_ORDER = ['live', 'conservative', 'balanced', 'aggressive'];
const PRESET_LABELS = {
  live: 'Live-like default',
  conservative: 'Conservative research',
  balanced: 'Balanced research',
  aggressive: 'Aggressive research',
};
const BASE = { min_score: 72, min_rr: 1.2, min_stop_distance_pct: 0.18, min_tp1_distance_pct: 0.25, min_tp2_distance_pct: 0.40, max_bars_in_trade: 24, ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.4, tp1_r: 1.2, tp2_r: 1.8, min_atr_pct: 0.10, max_atr_pct: 3, min_body_atr: 0.30, momentum_lookback: 3, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, pullback_bars: 5 };
const DEFAULTS = {
  MicroScalper: {
    conservative: { ...BASE, min_score: 78, min_rr: 1.4, min_stop_distance_pct: 0.20, min_tp1_distance_pct: 0.28, min_tp2_distance_pct: 0.45, max_bars_in_trade: 20, rsi_buy_min: 55, rsi_sell_max: 45, stop_atr_mult: 1.5, tp1_r: 1.3, tp2_r: 2.0 },
    balanced: { ...BASE },
    aggressive: { ...BASE, min_score: 68, min_rr: 1.0, min_stop_distance_pct: 0.15, min_tp1_distance_pct: 0.20, min_tp2_distance_pct: 0.32, max_bars_in_trade: 30, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.2, tp1_r: 1.0, tp2_r: 1.5 },
  },
  CompressionBreakout: {
    conservative: { ...BASE, min_score: 80, min_rr: 1.6, min_stop_distance_pct: 0.30, min_tp1_distance_pct: 0.40, min_tp2_distance_pct: 0.70, max_bars_in_trade: 40, stop_atr_mult: 1.5, tp1_r: 1.4, tp2_r: 2.8, box_lookback: 60, min_box_bars: 16, max_box_atr_range: 1.6, min_atr_expansion: 1.2, breakout_buffer_atr: 0.14 },
    balanced: { ...BASE, min_score: 75, min_rr: 1.3, min_stop_distance_pct: 0.25, min_tp1_distance_pct: 0.35, min_tp2_distance_pct: 0.60, max_bars_in_trade: 48, tp1_r: 1.3, tp2_r: 2.5, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, min_atr_expansion: 1.1 },
    aggressive: { ...BASE, min_score: 68, min_rr: 1.1, min_stop_distance_pct: 0.20, min_tp1_distance_pct: 0.28, min_tp2_distance_pct: 0.50, max_bars_in_trade: 60, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.3, tp1_r: 1.2, tp2_r: 2.2, box_lookback: 40, min_box_bars: 12, max_box_atr_range: 2.0, min_atr_expansion: 1.05, breakout_buffer_atr: 0.10 },
  },
  SwingContinuation: {
    conservative: { ...BASE, min_score: 80, min_rr: 1.8, min_stop_distance_pct: 0.50, min_tp1_distance_pct: 0.80, min_tp2_distance_pct: 1.30, max_bars_in_trade: 80, min_atr_pct: 0.15, max_atr_pct: 4.0, rsi_buy_min: 52, rsi_sell_max: 48, stop_atr_mult: 1.8, tp1_r: 1.7, tp2_r: 2.8, pullback_bars: 4 },
    balanced: { ...BASE, min_score: 76, min_rr: 1.5, min_stop_distance_pct: 0.45, min_tp1_distance_pct: 0.70, min_tp2_distance_pct: 1.20, max_bars_in_trade: 96, min_atr_pct: 0.15, max_atr_pct: 4.0, rsi_buy_min: 50, rsi_sell_max: 50, stop_atr_mult: 1.6, tp1_r: 1.5, tp2_r: 2.5, pullback_bars: 5 },
    aggressive: { ...BASE, min_score: 72, min_rr: 1.2, min_stop_distance_pct: 0.35, min_tp1_distance_pct: 0.55, min_tp2_distance_pct: 0.95, max_bars_in_trade: 120, min_atr_pct: 0.15, max_atr_pct: 4.0, rsi_buy_min: 48, rsi_sell_max: 52, stop_atr_mult: 1.4, tp1_r: 1.3, tp2_r: 2.2, pullback_bars: 6 },
  },
};
const LIVE_PARAMS = {
  MicroScalper: { ...DEFAULTS.MicroScalper.balanced },
  CompressionBreakout: { ...DEFAULTS.CompressionBreakout.balanced },
  SwingContinuation: { ...BASE, min_score: 72, min_rr: 1.2, max_bars_in_trade: 60, pullback_bars: 6, tp1_r: 1.4, tp2_r: 2.4, swing_15m_tp1_r: 1.3, swing_15m_tp2_r: 2.2 },
};
function paramsForPreset(strategy, preset) {
  if (preset === 'live') return { ...LIVE_PARAMS[strategy] };
  return { ...DEFAULTS[strategy][preset] };
}


function argValue(name) {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
}
function parseDateArg(value, name) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    console.error(`Invalid --${name}=${value}. Use an ISO timestamp, for example 2025-06-08T15:10:00Z.`);
    process.exit(1);
  }
  return ms;
}
function parseArgs() {
  const days = Number(argValue('days') ?? 90);
  const preset = argValue('preset') ?? 'live';
  const startMs = parseDateArg(argValue('start'), 'start');
  const endMs = parseDateArg(argValue('end'), 'end');
  const full = process.argv.includes('--full');
  return { days: Number.isFinite(days) && days > 0 ? days : 90, preset, startMs, endMs, full };
}
function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const h = head.toLowerCase().split(',');
  const ti = h.includes('timestamp') ? h.indexOf('timestamp') : h.indexOf('time');
  return rows.map(row => {
    const c = row.split(',');
    return { time: new Date(c[ti]).toISOString(), open: +c[h.indexOf('open')], high: +c[h.indexOf('high')], low: +c[h.indexOf('low')], close: +c[h.indexOf('close')], volume: +(c[h.indexOf('volume')] || 0) };
  }).filter(c => Number.isFinite(c.close)).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
function resample(candles, target) {
  if (target === '5m') return candles;
  const expected = TF_MINUTES[target] / 5;
  const bucketMs = TF_MINUTES[target] * 60_000;
  const buckets = new Map();
  for (const c of candles) {
    const k = Math.floor(Date.parse(c.time) / bucketMs) * bucketMs;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  const output = [];
  for (const [k, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (group.length !== expected) continue;
    output.push({ time: new Date(k).toISOString(), open: group[0].open, high: Math.max(...group.map(c => c.high)), low: Math.min(...group.map(c => c.low)), close: group[group.length - 1].close, volume: group.reduce((sum, c) => sum + c.volume, 0) });
  }
  return output;
}
function ema(values, period) { if (values.length < period) return values.at(-1) ?? 0; let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period; const k = 2 / (period + 1); for (let i = period; i < values.length; i++) v = values[i] * k + v * (1 - k); return v; }
function atr(candles, period) { if (candles.length < period + 1) return 0; const trs = []; for (let i = 1; i < candles.length; i++) trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close))); return trs.slice(-period).reduce((a, b) => a + b, 0) / period; }
function rsi(closes, period) { if (closes.length < period + 2) return 50; let gains = 0, losses = 0; for (let i = closes.length - period; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gains += d; else losses -= d; } if (gains + losses === 0) return 50; const rs = losses === 0 ? 100 : gains / losses; return 100 - 100 / (1 + rs); }
function momentum(closes, lookback = 3) { if (closes.length < lookback + 1) return 0; const s = closes.slice(-lookback - 1); let up = 0, dn = 0; for (let i = 1; i < s.length; i++) { if (s[i] > s[i - 1]) up++; else if (s[i] < s[i - 1]) dn++; } return (up - dn) / lookback; }
const fail = (reason, diagnostics) => ({ ok: false, reason, diagnostics });
const clamp = value => Math.min(100, Math.max(0, Math.round(value)));
const round = (value, digits = 3) => Number.isFinite(value) ? +value.toFixed(digits) : 0;
const pct = (a, b) => a > 0 ? Math.abs(a - b) / a * 100 : 0;
function distanceGuard(ev, p) { if (ev.entry <= 0 || ev.sl <= 0 || ev.tp1 <= 0 || ev.tp2 <= 0) return 'distance_too_tight'; if (pct(ev.entry, ev.sl) < p.min_stop_distance_pct) return 'sl_too_close'; if (pct(ev.entry, ev.tp1) < p.min_tp1_distance_pct) return 'tp1_too_close'; if (pct(ev.entry, ev.tp2) < p.min_tp2_distance_pct) return 'tp2_too_close'; if (ev.rr < p.min_rr) return 'rr_too_low'; if (ev.score < p.min_score) return 'confidence_too_low'; return ''; }
function regime(e20, e50, rs, rcr, atrPct) { if (e20 > e50 * 1.002 && rs > 52) return 'trend_up'; if (e20 < e50 * 0.998 && rs < 48) return 'trend_down'; if (rcr < 0.55) return 'compression'; if (atrPct > 2) return 'expansion'; if (rs > 45 && rs < 55) return 'ranging'; return 'unclear'; }
function evalMS(w, p, tf) {
  if (!['5m', '15m'].includes(tf)) return fail('unsupported_timeframe'); if (w.length < 60) return fail('insufficient_candles');
  const cl = w.map(c => c.close), e20 = ema(cl, p.ema_fast), e50 = ema(cl, p.ema_slow), a = atr(w, p.atr_len), rs = rsi(cl, p.rsi_len), last = w.at(-1), prev = w.at(-2), price = last.close, atrPct = a / price * 100, body = Math.abs(last.close - last.open) / a;
  if (atrPct < p.min_atr_pct) return fail('volatility_too_low'); if (atrPct > p.max_atr_pct) return fail('volatility_too_high'); if (body < p.min_body_atr) return fail('candle_body_too_small');
  const olderHi = Math.max(...w.slice(-50, -20).map(c => c.high)), olderLo = Math.min(...w.slice(-50, -20).map(c => c.low)), recentHi = Math.max(...w.slice(-20).map(c => c.high)), recentLo = Math.min(...w.slice(-20).map(c => c.low));
  const reg = regime(e20, e50, rs, olderHi > olderLo ? (recentHi - recentLo) / (olderHi - olderLo) : 1, atrPct), m = momentum(cl, p.momentum_lookback);
  let dir, score = 50; if (e20 > e50 && rs >= p.rsi_buy_min && price > e20) { dir = 'buy'; score += 15 + (reg === 'trend_up' ? 10 : 0); if (m <= 0.2) return fail('momentum_failed'); score += 8 + (rs >= 58 ? 8 : 3) + (prev.close < e20 && price > e20 ? 7 : 0) + (last.close > last.open ? 5 : -3); } else if (e20 < e50 && rs <= p.rsi_sell_max && price < e20) { dir = 'sell'; score += 15 + (reg === 'trend_down' ? 10 : 0); if (m >= -0.2) return fail('momentum_failed'); score += 8 + (rs <= 42 ? 8 : 3) + (prev.close > e20 && price < e20 ? 7 : 0) + (last.close < last.open ? 5 : -3); } else return fail('trend_rsi_context_failed');
  const sl = dir === 'buy' ? price - a * p.stop_atr_mult : price + a * p.stop_atr_mult, tp1 = dir === 'buy' ? price + a * p.tp1_r : price - a * p.tp1_r, tp2 = dir === 'buy' ? price + a * p.tp2_r : price - a * p.tp2_r, rr = +(Math.abs(tp2 - price) / Math.abs(price - sl)).toFixed(2); if (rr >= 2.5) score += 10; else if (rr >= 1.8) score += 5; return { ok: true, direction: dir, entry: price, sl, tp1, tp2, score: clamp(score), rr };
}
function evalCB(w, p, tf) {
  if (!['15m', '1h'].includes(tf)) return fail('unsupported_timeframe'); const minLen = Math.max(p.box_lookback + 5, p.atr_expansion_lookback + 2, p.ema_slow + 5, 60); if (w.length < minLen) return fail('insufficient_candles');
  const cl = w.map(c => c.close), a = atr(w, p.atr_len), last = w.at(-1), price = last.close, rs = rsi(cl, p.rsi_len), ef = ema(cl, p.ema_fast), es = ema(cl, p.ema_slow); if (a <= 0) return fail('invalid_atr');
  const box = w.slice(-(p.box_lookback + 1), -1), recent = box.slice(-Math.min(Math.max(p.min_box_bars, 12), box.length)); const bh = Math.max(...box.map(c => c.high)), bl = Math.min(...box.map(c => c.low)), br = bh - bl, rh = Math.max(...recent.map(c => c.high)), rl = Math.min(...recent.map(c => c.low)), rrg = rh - rl; if (br <= 0) return fail('invalid_box_range');
  const use = rrg > 0 && rrg < br, eh = use ? rh : bh, el = use ? rl : bl, buf = a * p.breakout_buffer_atr; const bdu = last.close - eh, bdd = el - last.close, up = bdu > buf && last.close > last.open, dn = bdd > buf && last.close < last.open, earlyUp = bdu > 0 && last.close > last.open && (last.high - last.low) > a * p.min_atr_expansion, earlyDn = bdd > 0 && last.close < last.open && (last.high - last.low) > a * p.min_atr_expansion;
  const dir = up || earlyUp ? 'buy' : dn || earlyDn ? 'sell' : last.close >= (eh + el) / 2 ? 'buy' : 'sell', confirmed = up || dn || earlyUp || earlyDn, bd = (dir === 'buy' ? Math.max(0, bdu) : Math.max(0, bdd)) / a; const inside = box.filter(c => c.high <= bh * 1.0015 && c.low >= bl * 0.9985).length / box.length, rinside = recent.filter(c => c.high <= rh * 1.0015 && c.low >= rl * 0.9985).length / recent.length, boxAtr = br / a, recentAtr = rrg / a;
  const older = box.slice(0, Math.max(0, box.length - recent.length)); const olderRange = older.length ? Math.max(...older.map(c => c.high)) - Math.min(...older.map(c => c.low)) : br, cr = olderRange > 0 ? rrg / olderRange : 1, contract = rrg <= br * 0.72; const strict = inside * box.length >= p.min_box_bars && boxAtr <= p.max_box_atr_range, recentReady = rinside * recent.length >= p.min_box_bars * 0.8 && recentAtr <= p.max_box_atr_range * 1.1;
  const tight = Math.max(0, Math.min(1, 1 - boxAtr / (p.max_box_atr_range * 1.35))), rtight = Math.max(0, Math.min(1, 1 - recentAtr / (p.max_box_atr_range * 1.45))); const cscore = clamp(Math.max(inside, rinside) * 35 + Math.max(tight, rtight) * 55 + Math.max(0, Math.min(1, 1 - cr)) * 30); const near = Math.max(inside, rinside) >= 0.65 && (boxAtr <= p.max_box_atr_range * 1.35 || recentAtr <= p.max_box_atr_range * 1.45 || contract) && cscore >= 45, ready = strict || recentReady || (near && confirmed);
  const hist = w.slice(-(p.atr_expansion_lookback + 1), -1), avg = hist.reduce((s, c) => s + c.high - c.low, 0) / (hist.length || 1), exp = avg > 0 ? (last.high - last.low) / avg : 1, m = momentum(cl, p.momentum_lookback), body = Math.abs(last.close - last.open) / a; const mscore = clamp(Math.max(0, dir === 'buy' ? m : -m) * 45 + Math.min(body, 1) * 30 + Math.min(dir === 'buy' ? Math.max(0, (rs - 45) / 20) : Math.max(0, (55 - rs) / 20), 1) * 15 + (dir === 'buy' ? ef >= es : ef <= es ? 1 : 0.45) * 10);
  let sl, tp1, tp2; if (dir === 'buy') { sl = Math.min(el - a * 0.2, price - a * p.stop_atr_mult); const risk = Math.abs(price - sl); tp1 = price + risk * p.tp1_r; tp2 = price + risk * p.tp2_r; } else { sl = Math.max(eh + a * 0.2, price + a * p.stop_atr_mult); const risk = Math.abs(price - sl); tp1 = price - risk * p.tp1_r; tp2 = price - risk * p.tp2_r; }
  const rr = +(Math.abs(tp2 - price) / Math.abs(price - sl)).toFixed(2), score = clamp(cscore * 0.24 + clamp((confirmed ? 45 : 0) + Math.min(1, bd / Math.max(p.breakout_buffer_atr * 4, 0.25)) * 55) * 0.24 + clamp(Math.min(1.4, exp / Math.max(p.min_atr_expansion, 0.01)) * 70) * 0.16 + mscore * 0.14 + 80 * 0.08 + clamp(Math.min(rr / Math.max(p.min_rr, 0.01), 1.5) * 66) * 0.10 + clamp(Math.min(body, 1.25) * 80) * 0.04); const diagnostics = { box_range_atr: round(boxAtr), recent_box_range_atr: round(recentAtr), configured_max_box_range_atr: p.max_box_atr_range, compression_ratio: round(cr), near_compression_ready: near, breakout_confirmed: confirmed, breakout_distance_atr: round(bd), atr_expansion_ratio: round(exp), rr, primary_failed_gate: 'passed' };
  let gate = ''; if (!ready) gate = 'compression_not_ready'; else if (!confirmed) gate = 'breakout_not_confirmed'; else if (exp < p.min_atr_expansion && !(near && bd >= p.breakout_buffer_atr * 2)) gate = 'atr_expansion_weak'; else if ((a / price) * 100 > 5) gate = 'volatility_too_high'; else if (mscore < 45) gate = 'momentum_failed'; else if (rr < p.min_rr) gate = 'rr_too_low'; else if (score < p.min_score) gate = 'confidence_too_low'; if (gate) { diagnostics.primary_failed_gate = gate; return fail(gate, diagnostics); } return { ok: true, direction: dir, entry: price, sl, tp1, tp2, score, rr };
}
function evalSW(w, p, tf) {
  if (!['15m', '1h'].includes(tf)) return fail('unsupported_timeframe'); const pbars = Math.max(2, Math.floor(p.pullback_bars)); const minLen = Math.max(p.ema_slow + 5, p.atr_len + 2, p.rsi_len + 2, pbars + 10, 60); if (w.length < minLen) return fail('insufficient_candles');
  const cl = w.map(c => c.close), last = w.at(-1), price = last.close, a = atr(w, p.atr_len), rs = rsi(cl, p.rsi_len), ef = ema(cl, p.ema_fast), es = ema(cl, p.ema_slow), priorEf = ema(cl.slice(0, -pbars), p.ema_fast); if (a <= 0 || price <= 0) return fail('invalid_atr_or_price');
  const atrPct = a / price * 100, spread = es > 0 ? (ef - es) / es * 100 : 0, slope = priorEf > 0 ? (ef - priorEf) / priorEf * 100 : 0, bullBias = spread * 1.4 + slope + (price > ef ? 0.25 : -0.25) + (rs - 50) / 100, bearBias = -spread * 1.4 - slope + (price < ef ? 0.25 : -0.25) + (50 - rs) / 100;
  const dir = bullBias >= bearBias ? 'buy' : 'sell', dsp = dir === 'buy' ? spread : -spread, dsl = dir === 'buy' ? slope : -slope, priceVsEma = dir === 'buy' ? (price - ef) / price * 100 : (ef - price) / price * 100, trendScore = clamp((dsp > 0 ? 42 : 12) + Math.min(Math.max(dsp, 0) / 1.2, 1) * 38 + (dsl > 0 ? 20 : 0)), emaSlopeScore = clamp(35 + Math.min(Math.max(dsl, -0.15) + 0.15, 0.65) / 0.65 * 65);
  const pb = w.slice(-(pbars + 1), -1), pl = Math.min(...pb.map(c => c.low)), ph = Math.max(...pb.map(c => c.high)), touchedBuy = pl <= ef + a * 0.75, touchedSell = ph >= ef - a * 0.75, reclaimedBuy = price > ef && last.close > last.open, reclaimedSell = price < ef && last.close < last.open, pullbackReady = dir === 'buy' ? touchedBuy : touchedSell, strictReclaim = dir === 'buy' ? reclaimedBuy : reclaimedSell;
  const pullbackScore = dir === 'buy' ? clamp((touchedBuy ? 48 : 18) + (reclaimedBuy ? 38 : price > ef ? 22 : 0) + (pl > es ? 14 : 5)) : clamp((touchedSell ? 48 : 18) + (reclaimedSell ? 38 : price < ef ? 22 : 0) + (ph < es ? 14 : 5)); const rawMom = momentum(cl, p.momentum_lookback), dm = dir === 'buy' ? rawMom : -rawMom, body = Math.abs(last.close - last.open) / a, mscore = clamp(Math.max(0, dm) * 60 + Math.min(body, 1) * 25 + (strictReclaim ? 15 : 0)), rsiScore = dir === 'buy' ? clamp(Math.min(Math.max((rs - 45) / Math.max(p.rsi_buy_min - 45, 1), 0), 1.25) * 80) : clamp(Math.min(Math.max((55 - rs) / Math.max(55 - p.rsi_sell_max, 1), 0), 1.25) * 80);
  const trendPass = trendScore >= 45 || (emaSlopeScore >= 55 && dsp > -0.08 && priceVsEma > 0 && rsiScore >= 40), reclaimByQuality = pullbackScore >= 68 && mscore >= 45 && priceVsEma > -0.05, reclaim = strictReclaim || reclaimByQuality; let volScore = 85; if (atrPct < p.min_atr_pct) volScore = clamp(atrPct / Math.max(p.min_atr_pct, 0.01) * 55); else if (atrPct > p.max_atr_pct) volScore = clamp(Math.max(20, 80 - ((atrPct - p.max_atr_pct) / Math.max(p.max_atr_pct, 0.01)) * 80));
  const tp1Mult = tf === '15m' && Number.isFinite(p.swing_15m_tp1_r) ? p.swing_15m_tp1_r : p.tp1_r, tp2Mult = tf === '15m' && Number.isFinite(p.swing_15m_tp2_r) ? p.swing_15m_tp2_r : p.tp2_r;
  let sl, tp1, tp2; if (dir === 'buy') { sl = Math.min(pl - a * 0.15, price - a * p.stop_atr_mult); const risk = Math.abs(price - sl); tp1 = price + risk * tp1Mult; tp2 = price + risk * tp2Mult; } else { sl = Math.max(ph + a * 0.15, price + a * p.stop_atr_mult); const risk = Math.abs(price - sl); tp1 = price - risk * tp1Mult; tp2 = price - risk * tp2Mult; }
  const rr = +(Math.abs(tp2 - price) / Math.abs(price - sl)).toFixed(2), rrScore = clamp(Math.min(rr / Math.max(p.min_rr, 0.01), 1.5) * 66), score = clamp(trendScore * 0.22 + emaSlopeScore * 0.14 + pullbackScore * 0.20 + mscore * 0.16 + rsiScore * 0.12 + volScore * 0.08 + rrScore * 0.08); const diagnostics = { trend_score: trendScore, pullback_score: pullbackScore, pullback_ready: pullbackReady, reclaim_confirmed: reclaim, momentum_score: mscore, rsi_score: rsiScore, rr, final_score: score };
  let gate = ''; if (atrPct < p.min_atr_pct) gate = 'volatility_too_low'; else if (atrPct > p.max_atr_pct) gate = 'volatility_too_high'; else if (!trendPass) gate = 'trend_filter_failed'; else if (!pullbackReady || pullbackScore < 45) gate = 'pullback_not_ready'; else if (!reclaim) gate = 'reclaim_not_confirmed'; else if (mscore < 35 || rsiScore < 35) gate = 'momentum_failed'; else if (rr < p.min_rr) gate = 'rr_too_low'; else if (score < p.min_score) gate = 'confidence_too_low'; if (gate) return fail(gate, { ...diagnostics, primary_failed_gate: gate }); return { ok: true, direction: dir, entry: price, sl, tp1, tp2, score, rr };
}
function classify(m) { if (m.trades === 0) return 'too strict / dead participation'; if (m.trades < 10) return 'needs more data'; if (m.totalR > 0 && m.pf > 1 && m.winRate >= 40) return (m.avgR < 0.07 || m.maxDD > Math.max(10, Math.abs(m.totalR) * 0.4) || m.pf < 1.15) ? 'viable but noisy' : 'viable / preserve'; if (m.totalR <= 0) return 'needs tuning'; return 'viable but noisy'; }
function backtest(candles, strategy, tf, p) {
  const evalFn = strategy === 'MicroScalper' ? evalMS : strategy === 'CompressionBreakout' ? evalCB : evalSW; const reasons = {}, diags = {}, trades = []; let evaluations = 0, candidates = 0, rejected = 0, inEnd = -1;
  for (let i = 65; i < candles.length; i++) { if (i <= inEnd) continue; evaluations++; const ev = evalFn(candles.slice(Math.max(0, i - 260), i + 1), p, tf); const reject = (reason, d) => { rejected++; reasons[reason] = (reasons[reason] || 0) + 1; if (d && !diags[reason]) diags[reason] = d; }; if (!ev.ok) { reject(ev.reason, ev.diagnostics); continue; } const g = distanceGuard(ev, p); if (g) { reject(g); continue; } candidates++; let result = 'expired', exit = null; const maxEnd = Math.min(i + p.max_bars_in_trade, candles.length - 1); for (let j = i + 1; j <= maxEnd; j++) { const c = candles[j]; if (ev.direction === 'buy') { if (c.low <= ev.sl) { result = 'sl_hit'; exit = j; break; } if (c.high >= ev.tp2) { result = 'tp2_hit'; exit = j; break; } if (c.high >= ev.tp1) { result = 'tp1_hit'; exit = j; break; } } else { if (c.high >= ev.sl) { result = 'sl_hit'; exit = j; break; } if (c.low <= ev.tp2) { result = 'tp2_hit'; exit = j; break; } if (c.low <= ev.tp1) { result = 'tp1_hit'; exit = j; break; } } } const risk = Math.abs(ev.entry - ev.sl); const pnl = result === 'sl_hit' ? -1 : result === 'tp2_hit' ? +(Math.abs(ev.tp2 - ev.entry) / risk).toFixed(2) : result === 'tp1_hit' ? +(Math.abs(ev.tp1 - ev.entry) / risk).toFixed(2) : 0; trades.push({ pnl, result }); inEnd = exit ?? maxEnd; }
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl < 0), grossWin = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0)), totalR = +trades.reduce((s, t) => s + t.pnl, 0).toFixed(2), pf = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 999 : 0), winRate = trades.length ? +(wins.length / trades.length * 100).toFixed(1) : 0, avgR = trades.length ? +(totalR / trades.length).toFixed(2) : 0; let peak = 0, eq = 0, maxDD = 0, maxCL = 0, cl = 0; for (const t of trades) { eq += t.pnl; if (eq > peak) peak = eq; maxDD = Math.max(maxDD, peak - eq); if (t.pnl < 0) { cl++; maxCL = Math.max(maxCL, cl); } else if (t.pnl > 0) cl = 0; }
  return { evaluations, candidates, rejected, trades: trades.length, wins: wins.length, losses: losses.length, tp1: trades.filter(t => t.result === 'tp1_hit').length, tp2: trades.filter(t => t.result === 'tp2_hit').length, sl: trades.filter(t => t.result === 'sl_hit').length, expired: trades.filter(t => t.result === 'expired').length, winRate, pf, totalR, avgR, maxDD: +maxDD.toFixed(2), maxCL, top: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5), diagnostics: diags };
}


function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function recommendation(r, cls) {
  if (r.trades === 0) return 'Research-only; audit strict gates before any tuning';
  if (r.trades < 30) return 'Research-only / low-sample; collect more evidence';
  if (cls === 'viable / preserve') return 'Preserve unchanged for now';
  if (cls === 'viable but noisy') return r.trades > 1000 ? 'Profitable but overactive; tune later for noise/drawdown' : 'Tune next / monitor exits and blockers';
  return 'Tune before consideration';
}
function decisionScore(r) {
  if (r.trades === 0) return -999;
  const sampleScore = Math.min(r.trades, 300) / 300 * 20;
  const pfScore = Math.max(0, Math.min(r.pf - 1, 0.8)) / 0.8 * 25;
  const totalScore = Math.max(-10, Math.min(r.totalR, 120)) / 120 * 20;
  const avgScore = Math.max(-0.1, Math.min(r.avgR, 0.25)) / 0.25 * 15;
  const ddPenalty = Math.min(r.maxDD, 25) / 25 * 12;
  const clPenalty = Math.min(r.maxCL, 10) / 10 * 8;
  const overactivePenalty = r.trades > 1200 ? Math.min((r.trades - 1200) / 600, 1) * 8 : 0;
  const lowSamplePenalty = r.trades < 30 ? 14 : r.trades < 75 ? 6 : 0;
  return +(sampleScore + pfScore + totalScore + avgScore - ddPenalty - clPenalty - overactivePenalty - lowSamplePenalty).toFixed(2);
}
function runPreset(selected, preset) {
  const rows = [];
  for (const strategy of ['MicroScalper', 'CompressionBreakout', 'SwingContinuation']) {
    for (const tf of STRATEGY_TIMEFRAMES[strategy]) {
      const candles = resample(selected, tf);
      const r = backtest(candles, strategy, tf, paramsForPreset(strategy, preset));
      const cls = classify(r);
      const pl = +(r.totalR * 1000 * 0.005).toFixed(2);
      rows.push({
        preset,
        presetName: PRESET_LABELS[preset],
        strategy,
        timeframe: tf,
        datasetTimeframe: '5m',
        resampled: tf === '5m' ? 'no' : 'yes',
        selectedCandles: selected.length,
        resampledCandles: candles.length,
        ...r,
        profitFactorDisplay: r.trades ? r.pf : 'N/A',
        totalRDisplay: r.trades ? r.totalR : 'N/A',
        avgRDisplay: r.trades ? r.avgR : 'N/A',
        maxDDDisplay: r.trades ? r.maxDD : 'N/A',
        estPL: pl,
        topRejections: r.top.map(([k, v]) => `${k}:${v}`).join('|') || 'none',
        classification: cls,
        recommendation: recommendation(r, cls),
        decisionScore: decisionScore(r),
      });
    }
  }
  return rows;
}

const { days, preset, startMs: argStartMs, endMs: argEndMs, full } = parseArgs();
const requestedPresets = preset === 'all' ? PRESET_ORDER : [preset];
const invalidPreset = requestedPresets.find(p => !PRESET_ORDER.includes(p));
if (invalidPreset) {
  console.error(`Unsupported --preset=${invalidPreset}. Use one of: ${PRESET_ORDER.join(', ')}, all`);
  process.exit(1);
}
const all = parseCsv(fs.readFileSync(CSV, 'utf8'));
const defaultEndMs = Date.parse(all.at(-1).time);
const endMs = full ? defaultEndMs : (argEndMs ?? defaultEndMs);
const startMs = full ? Date.parse(all[0].time) : (argStartMs ?? endMs - days * DAY_MS);
if (startMs > endMs) {
  console.error(`Invalid selected window: start ${new Date(startMs).toISOString()} is after end ${new Date(endMs).toISOString()}.`);
  process.exit(1);
}
const selected = all.filter(c => {
  const t = Date.parse(c.time);
  return t >= startMs && t <= endMs;
});
if (selected.length === 0) {
  console.error(`Selected window contains no candles: ${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()}.`);
  process.exit(1);
}
const results = requestedPresets.flatMap(p => runPreset(selected, p));
console.log(`Fixture: ${CSV}`);
console.log(`Full CSV range: ${all[0].time} -> ${all.at(-1).time}`);
console.log(`Selected test window: ${selected[0].time} -> ${selected.at(-1).time}${full ? ' (full fixture)' : argStartMs || argEndMs ? ' (custom)' : ` (${days} days)`}`);
console.log(`Dataset timeframe: 5m`);
console.log(`Loaded candles: ${all.length}`);
console.log(`Selected candles: ${selected.length}`);
console.log(`Presets: ${requestedPresets.map(p => PRESET_LABELS[p]).join(' | ')}`);
console.log('Parity note: local fixture validator uses the same browser-compatible evaluator family as Backtest Lab; no live scanner/provider/Telegram/outcome/customer/Bot/execution logic is invoked.');
console.log('\npreset,preset_name,strategy,tested_timeframe,dataset_timeframe,resampled,selected_candles,resampled_candles_tested,evaluations,candidates,rejected,trades,wins,losses,tp1_hits,tp2_hits,sl_hits,expired,win_rate,profit_factor,total_r,avg_r,max_dd_r,max_consec_losses,est_pl_1000_0.5pct,top_rejections,classification,recommendation,decision_score');
for (const r of results) {
  console.log([
    r.preset,
    r.presetName,
    r.strategy,
    r.timeframe,
    r.datasetTimeframe,
    r.resampled,
    r.selectedCandles,
    r.resampledCandles,
    r.evaluations,
    r.candidates,
    r.rejected,
    r.trades,
    r.wins,
    r.losses,
    r.tp1,
    r.tp2,
    r.sl,
    r.expired,
    r.winRate,
    r.profitFactorDisplay,
    r.totalRDisplay,
    r.avgRDisplay,
    r.maxDDDisplay,
    r.maxCL,
    r.estPL,
    r.topRejections,
    r.classification,
    r.recommendation,
    r.decisionScore,
  ].map(csvCell).join(','));
}
if (requestedPresets.length > 1) {
  console.log('\nDecision ranking (higher score = better decision-quality balance):');
  for (const [idx, r] of [...results].sort((a, b) => b.decisionScore - a.decisionScore).entries()) {
    console.log(`${idx + 1}. ${r.presetName} · ${r.strategy} ${r.timeframe} · score=${r.decisionScore} · trades=${r.trades} · PF=${r.profitFactorDisplay} · totalR=${r.totalRDisplay} · avgR=${r.avgRDisplay} · maxDD=${r.maxDDDisplay}R · recommendation=${r.recommendation}`);
  }
}
