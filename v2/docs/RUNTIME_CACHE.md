# RUNTIME_CACHE

Runtime cache is memory-only and contains no database client dependency. Stores provide get, set, delete, list, snapshot/export, clear, and reset methods.

## Policies
- TTL: optional per-write or default store TTL purges expired entries on access.
- Max size: stores evict the oldest inserted key when max item count is reached.
- Candle retention: `InMemoryCandleCache` limits both cache keys and candles per key.
- Tests: `reset()` clears values and internal insertion counters for deterministic test setup.

These stores are operational memory, not durable persistence.
