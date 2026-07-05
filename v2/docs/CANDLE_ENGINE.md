# CANDLE_ENGINE

The V2 candle engine is deterministic and memory-only. It subscribes to `MarketTickReceived`, floors ticks to exact timeframe boundaries, emits `CandleClosed` only when a bucket closes, and writes closed candles to `CandleCache`.

## Production behavior
- Boundaries: candle `openTime` is the exact UTC floor of the timeframe and `closeTime` is `openTime + timeframe`.
- Timer flush: `flush(now)` closes open candles whose `closeTime <= now` without requiring a next tick.
- Late ticks: default policy ignores ticks for already closed buckets. `update-open` is reserved for controlled replay.
- Out-of-order ticks: default policy ignores ticks older than the current open bucket.
- Gaps: optional gap candles are flat OHLC candles with zero volume and `sourceMetadata.generatedBy = "gap"`.
- Warmup: `warmup(key, candles)` validates and loads closed historical candles into memory.
- Retention: `InMemoryCandleCache` applies max keys and max candles per key.
- Source metadata: candles include provider, tick count, first/last tick timestamps, generation mode, and quality.
- Validation: OHLC must be finite and satisfy `low <= open/close <= high` and `low <= high`.

The engine has no external exchange, MT5, or database dependency.
