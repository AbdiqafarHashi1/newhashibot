import { FOREX_RUNTIME_SYMBOLS, MT5_PROVIDER_MARKET_DATA_TIMEFRAMES } from "./forex-runtime-contracts.ts";

/** Durable, account-scoped MT5 market data adapter used by the one scanner. */
export const MT5_FOREX_SYMBOLS = new Set<string>(FOREX_RUNTIME_SYMBOLS);
export const MT5_TIMEFRAMES = new Set<string>(MT5_PROVIDER_MARKET_DATA_TIMEFRAMES);

export function normalizeMT5Timeframe(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace("m1", "1m").replace("m5", "5m").replace("m15", "15m").replace("m30", "30m").replace("h1", "1h").replace("h4", "4h").replace("d1", "1d");
  return MT5_TIMEFRAMES.has(normalized) ? normalized : null;
}

export function canonicalMT5Symbol(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z]/g, "");
  for (const symbol of MT5_FOREX_SYMBOLS) if (compact.includes(symbol)) return symbol;
  return null;
}

export async function loadMT5Candles(db: any, symbol: string, timeframe: string, limit = 110) {
  const canonical = canonicalMT5Symbol(symbol), tf = normalizeMT5Timeframe(timeframe);
  if (!canonical || !tf) return { candles: [], error: !canonical ? "unsupported_symbol" : "unsupported_timeframe", source: "mt5" };
  const { data: feed } = await db.from("mt5_market_data_latest").select("account_id,bridge_id,broker_symbol,last_update_at,stale,market_open").eq("canonical_symbol", canonical).order("last_update_at", { ascending: false }).limit(1).maybeSingle();

  // Primary: try loading from mt5_market_candles
  const query = feed
    ? db.from("mt5_market_candles").select("open_time,open,high,low,close,tick_volume").eq("account_id", feed.account_id).eq("canonical_symbol", canonical).eq("timeframe", tf).order("open_time", { ascending: false }).limit(limit)
    : db.from("mt5_market_candles").select("open_time,open,high,low,close,tick_volume").eq("canonical_symbol", canonical).eq("timeframe", tf).order("open_time", { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (!error && data && data.length > 0) {
    const candles = data.reverse().map((c: any) => ({ symbol: canonical, market_type: "forex", timeframe: tf, open_time: c.open_time, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.tick_volume ?? 0), source: "mt5" }));
    if (candles.every((c: any) => c.open > 0 && c.high >= c.low && c.close > 0)) {
      return { candles, error: candles.length < 55 ? "MT5_INSUFFICIENT_CANDLES" : null, source: "mt5", lineage: feed };
    }
  }

  // Fallback: check general candles table for canonical symbol & timeframe
  const { data: genData } = await db.from("candles").select("open_time,open,high,low,close,volume").eq("symbol", canonical).eq("timeframe", tf).order("open_time", { ascending: false }).limit(limit);
  if (genData && genData.length > 0) {
    const candles = genData.reverse().map((c: any) => ({ symbol: canonical, market_type: "forex", timeframe: tf, open_time: c.open_time, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume ?? 0), source: "mt5" }));
    return { candles, error: candles.length < 55 ? "MT5_INSUFFICIENT_CANDLES" : null, source: "mt5", lineage: feed };
  }

  if (!feed) return { candles: [], error: "MT5_MARKET_DATA_UNAVAILABLE", source: "mt5" };
  if (feed.market_open === false) return { candles: [], error: "MT5_MARKET_CLOSED", source: "mt5" };
  return { candles: [], error: error?.message ?? "MT5_CANDLES_UNAVAILABLE", source: "mt5" };
}
