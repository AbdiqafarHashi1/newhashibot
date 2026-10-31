import type { StrategyCandle } from './professional-strategies.ts';
/** Binance's documented 12-field SPOT/USD-M schema. No missing flow is replaced with zero. */
export function decodeNativeKline(symbol: string, timeframe: string, row: readonly unknown[],
  instrument: 'SPOT' | 'USDT_PERPETUAL'): StrategyCandle {
  if (row.length < 11) throw Error('NATIVE_KLINE_FIELDS_MISSING');
  const value = (i: number) => (typeof row[i]!=='number'&&typeof row[i]!=='string')||String(row[i]).trim()==='' ? NaN : Number(row[i]);
  const rawTime = value(0), timestamp = rawTime >= 100_000_000_000_000 ? rawTime / 1000 : rawTime;
  const [open, high, low, close, volume, quote, trades, buy, buyQuote] = [1, 2, 3, 4, 5, 7, 8, 9, 10].map(value);
  if (![timestamp, open, high, low, close, volume, quote, trades, buy, buyQuote].every(Number.isFinite) ||
      !Number.isSafeInteger(timestamp) || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close) ||
      volume < 0 || quote < 0 || !Number.isSafeInteger(trades) || trades < 0 || buy < 0 || buy > volume || buyQuote < 0 || buyQuote > quote)
    throw Error('NATIVE_KLINE_INVALID');
  return { symbol, market_type: 'crypto', timeframe, open_time: new Date(timestamp).toISOString(), open, high, low, close, volume,
    source: instrument === 'SPOT' ? 'BINANCE_SPOT_KLINES' : 'BINANCE_USDM_KLINES', instrument_type: instrument,
    quote_volume: quote, trade_count: trades, taker_buy_volume: buy, taker_buy_quote_volume: buyQuote };
}
