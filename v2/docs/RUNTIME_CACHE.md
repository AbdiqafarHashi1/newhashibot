# RUNTIME_CACHE

V2 runtime cache is memory-only. Implementations live in `packages/runtime-cache` and currently cover `CandleCache`, `IndicatorCache`, `ActiveSignalStore`, `ActiveTradeStore`, `PendingCommandStore`, `ExecutorHealthStore`, `AdapterHealthStore`, `ProtectionStateStore`, and `MarketFeedStateStore`.

All stores support get, set/delete, list, and clear semantics, with bounded item counts. Candle cache also supports append with max candles per key. No cache implementation writes to Supabase.
