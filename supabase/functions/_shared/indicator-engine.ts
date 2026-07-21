/** Root-owned, side-effect-free indicator primitives. No provider or persistence access. */
export interface IndicatorCandle {
  open_time: string; open: number; high: number; low: number; close: number; volume: number;
}

export const INDICATOR_VERSIONS = {
  sma: "indicator.sma/root-v1",
  ema: "indicator.ema/root-v1",
  rsi: "indicator.rsi/root-v1",
  trueRange: "indicator.true-range/root-v1",
  atr: "indicator.atr/root-v1",
  geometry: "indicator.candle-geometry/root-v1",
  volume: "indicator.volume/root-v1",
  distance: "indicator.normalized-distance/root-v1",
  riskReward: "indicator.risk-reward/root-v1",
} as const;

export type IndicatorFailure = "INSUFFICIENT_DATA" | "MALFORMED_INPUT" | "STALE_INPUT" | "UNCLOSED_CANDLE";
export type IndicatorResult<T> =
  | { ok: true; value: T; version: string; evidence: Record<string, unknown>; diagnostics: string[] }
  | { ok: false; value: null; version: string; failure: IndicatorFailure; evidence: Record<string, unknown>; diagnostics: string[] };

const finite = (values: number[]) => values.every(Number.isFinite);
const ok = <T>(value: T, version: string, evidence: Record<string, unknown> = {}): IndicatorResult<T> => ({ ok: true, value, version, evidence, diagnostics: [] });
const fail = <T>(failure: IndicatorFailure, version: string, evidence: Record<string, unknown> = {}): IndicatorResult<T> => ({ ok: false, value: null, version, failure, evidence, diagnostics: [failure.toLowerCase()] });

export function normalizeClosedCandles(candles: readonly IndicatorCandle[], options: { now?: Date; closeBoundary?: Date; staleAfterMs?: number; requestedLookback?: number } = {}): IndicatorResult<IndicatorCandle[]> {
  const version = "indicator.candles/root-v1";
  if (!Array.isArray(candles) || candles.length === 0) return fail("INSUFFICIENT_DATA", version, { received: candles?.length ?? 0 });
  const normalized = candles.map((c) => ({ ...c }));
  if (normalized.some((c) => !Number.isFinite(Date.parse(c.open_time)) || !finite([c.open, c.high, c.low, c.close, c.volume]) || c.high < c.low || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close))) return fail("MALFORMED_INPUT", version);
  for (let i = 1; i < normalized.length; i++) if (Date.parse(normalized[i].open_time) <= Date.parse(normalized[i - 1].open_time)) return fail("MALFORMED_INPUT", version, { reason: "timestamps_not_strictly_increasing", index: i });
  const boundary = options.closeBoundary?.getTime();
  if (boundary !== undefined && Date.parse(normalized[normalized.length - 1].open_time) >= boundary) return fail("UNCLOSED_CANDLE", version, { close_boundary: options.closeBoundary?.toISOString() });
  if (options.requestedLookback && normalized.length < options.requestedLookback) return fail("INSUFFICIENT_DATA", version, { required: options.requestedLookback, received: normalized.length });
  if (options.staleAfterMs && options.now && options.now.getTime() - Date.parse(normalized[normalized.length - 1].open_time) > options.staleAfterMs) return fail("STALE_INPUT", version, { stale_after_ms: options.staleAfterMs });
  return ok(normalized, version, { count: normalized.length, first: normalized[0].open_time, last: normalized[normalized.length - 1].open_time, ordering: "chronological", inclusion: "closed_only" });
}

export function sma(values: readonly number[], period: number): IndicatorResult<number> {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return fail("INSUFFICIENT_DATA", INDICATOR_VERSIONS.sma, { period, received: values.length });
  const window = values.slice(-period);
  if (!finite(window)) return fail("MALFORMED_INPUT", INDICATOR_VERSIONS.sma);
  return ok(window.reduce((a, b) => a + b, 0) / period, INDICATOR_VERSIONS.sma, { period, seed: "simple_average", window: "trailing" });
}

/** Exact active scanner semantics: SMA seed, then recursive EMA; short input returns last/zero. */
export function emaRootV1(values: readonly number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

export function ema(values: readonly number[], period: number): IndicatorResult<number> {
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return fail("INSUFFICIENT_DATA", INDICATOR_VERSIONS.ema, { period, received: values.length });
  if (!finite([...values])) return fail("MALFORMED_INPUT", INDICATOR_VERSIONS.ema);
  return ok(emaRootV1(values, period), INDICATOR_VERSIONS.ema, { period, seed: "sma(first_period)", smoothing: "2/(period+1)", rounding: "none" });
}

/** Exact active scanner RSI: trailing simple gain/loss window, neutral 50 fallback. */
export function rsiRootV1(values: readonly number[], period = 14): number {
  if (values.length < period + 2) return 50;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) { const d = values[i] - values[i - 1]; if (d > 0) gains += d; else losses -= d; }
  if (gains === 0 && losses === 0) return 50;
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

export function rsi(values: readonly number[], period = 14): IndicatorResult<number> {
  if (values.length < period + 2) return fail("INSUFFICIENT_DATA", INDICATOR_VERSIONS.rsi, { period, received: values.length });
  if (!finite([...values])) return fail("MALFORMED_INPUT", INDICATOR_VERSIONS.rsi);
  return ok(rsiRootV1(values, period), INDICATOR_VERSIONS.rsi, { period, smoothing: "trailing-simple-window", zero_loss_rs: 100, rounding: "none" });
}

export function trueRange(candle: IndicatorCandle, previousClose?: number): number {
  return previousClose === undefined ? candle.high - candle.low : Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
}

/** Exact active scanner ATR: simple average of the trailing true ranges. */
export function atrRootV1(candles: readonly IndicatorCandle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i++) ranges.push(trueRange(candles[i], candles[i - 1].close));
  return ranges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function atr(candles: readonly IndicatorCandle[], period = 14): IndicatorResult<number> {
  if (candles.length < period + 1) return fail("INSUFFICIENT_DATA", INDICATOR_VERSIONS.atr, { period, received: candles.length });
  if (candles.some((c) => !finite([c.open, c.high, c.low, c.close]))) return fail("MALFORMED_INPUT", INDICATOR_VERSIONS.atr);
  return ok(atrRootV1(candles, period), INDICATOR_VERSIONS.atr, { period, smoothing: "trailing-simple-average", seed: "not_applicable", rounding: "none" });
}

export const highestHigh = (candles: readonly IndicatorCandle[], lookback: number) => Math.max(...candles.slice(-lookback).map((c) => c.high));
export const lowestLow = (candles: readonly IndicatorCandle[], lookback: number) => Math.min(...candles.slice(-lookback).map((c) => c.low));
export const rollingRange = (candles: readonly IndicatorCandle[], lookback: number) => highestHigh(candles, lookback) - lowestLow(candles, lookback);
export function candleGeometry(c: IndicatorCandle) { const range = c.high - c.low; return { body: Math.abs(c.close - c.open), upperWick: c.high - Math.max(c.open, c.close), lowerWick: Math.min(c.open, c.close) - c.low, bodyToRange: range > 0 ? Math.abs(c.close - c.open) / range : 0 }; }
export const rollingAverageVolume = (candles: readonly IndicatorCandle[], period: number) => candles.slice(-period).reduce((sum, c) => sum + c.volume, 0) / period;
export const relativeVolume = (candles: readonly IndicatorCandle[], period: number) => { const avg = rollingAverageVolume(candles.slice(0, -1), period); return avg > 0 ? candles[candles.length - 1].volume / avg : 0; };
export const percentageChange = (from: number, to: number) => from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
export const normalizedDistance = (from: number, to: number) => Math.abs(percentageChange(from, to));
export const riskReward = (entry: number, stop: number, target: number) => { const risk = Math.abs(entry - stop); return risk > 0 ? Math.abs(target - entry) / risk : 0; };
