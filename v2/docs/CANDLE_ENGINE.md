# CANDLE_ENGINE

The candle engine subscribes to `MarketTickReceived`, aggregates ticks into standard `Candle` contracts for 1m, 5m, 15m, and 1h buckets, writes closed candles to the in-memory `CandleCache`, and emits `CandleClosed`.
