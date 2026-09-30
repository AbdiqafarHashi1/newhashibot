export const SCANNER_HARD_LIMITS = Object.freeze({ cryptoSymbols: 25, forexSymbols: 6, totalSymbols: 31, timeframes: 4, providerRequests: 124, retries: 2, concurrency: 4 });
const SUPPORTED_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
export function boundedScannerLimit(name: string, raw: string | undefined, fallback: number, hardMaximum: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > hardMaximum) throw new Error(`UNSAFE_SCANNER_LIMIT:${name}:expected_integer_1_to_${hardMaximum}`);
  return value;
}
export function boundedScannerTimeframes(input: readonly unknown[]): string[] {
  const values = [...new Set(input.map(String))];
  if (!values.length || values.length > SCANNER_HARD_LIMITS.timeframes || values.some(value => !SUPPORTED_TIMEFRAMES.has(value))) throw new Error("UNSAFE_SCANNER_TIMEFRAMES");
  return values;
}
export function boundedScannerUniverse<T, U>(crypto: readonly T[], forex: readonly U[], rawCrypto?: string, rawForex?: string, rawTotal?: string): { crypto: T[]; forex: U[] } {
  const total = boundedScannerLimit("SCANNER_MAX_SYMBOLS_PER_SCAN", rawTotal, 13, SCANNER_HARD_LIMITS.totalSymbols);
  const forexLimit = boundedScannerLimit("SCANNER_MAX_FOREX_SYMBOLS", rawForex, 3, SCANNER_HARD_LIMITS.forexSymbols);
  const cryptoLimit = boundedScannerLimit("SCANNER_MAX_CRYPTO_SYMBOLS", rawCrypto, 10, SCANNER_HARD_LIMITS.cryptoSymbols);
  const boundedForex = [...forex].slice(0, Math.min(forexLimit, total));
  return { forex: boundedForex, crypto: [...crypto].slice(0, Math.min(cryptoLimit, total - boundedForex.length)) };
}
export interface RuntimeCandleLike { open_time: string; open: number; high: number; low: number; close: number; volume: number; }
export function admitClosedRuntimeCandles<T extends RuntimeCandleLike>(candles: readonly T[] | null | undefined, timeframeMinutes: number, asOfMs: number, maxStaleBars = 2): { candles: T[]; rejection: string | null; mutableDropped: number } {
  if (!candles?.length) return { candles: [], rejection: "missing_candles", mutableDropped: 0 };
  const seen = new Set<string>(), closed: T[] = []; let mutableDropped = 0;
  for (const candle of candles) {
    const open = Date.parse(candle.open_time);
    if (!Number.isFinite(open) || ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) || candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) return { candles: [], rejection: "malformed_candle", mutableDropped };
    if (seen.has(candle.open_time)) return { candles: [], rejection: "duplicate_candle", mutableDropped }; seen.add(candle.open_time);
    if (open + timeframeMinutes * 60_000 > asOfMs) { mutableDropped++; continue; }
    closed.push(candle);
  }
  closed.sort((a, b) => a.open_time.localeCompare(b.open_time));
  if (!closed.length) return { candles: [], rejection: "mutable_candles_only", mutableDropped };
  const lastClose = Date.parse(closed[closed.length - 1].open_time) + timeframeMinutes * 60_000;
  if (asOfMs - lastClose > timeframeMinutes * 60_000 * maxStaleBars) return { candles: [], rejection: "stale_candles", mutableDropped };
  return { candles: closed, rejection: null, mutableDropped };
}
