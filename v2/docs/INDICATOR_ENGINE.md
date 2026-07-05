# INDICATOR_ENGINE

The indicator engine computes shared indicators once per symbol/timeframe from `CandleCache`, writes typed `IndicatorSnapshot` records to `IndicatorCache`, and emits `IndicatorsUpdated`. Strategies must consume these shared snapshots instead of recalculating indicators.

## Missing data and warmup
Indicators return `null` values until warmup is satisfied. Snapshot `missingData` and `warmupRemaining` expose readiness.

## Indicator formulas
- SMA: arithmetic mean of the last N closes. Warmup N.
- EMA: seeded with SMA(N), then `price*k + prev*(1-k)`, `k=2/(N+1)`. Warmup N.
- RSI: average gains/losses over 14 closes; flat market returns 50. Warmup 15.
- ATR: average true range over 14 periods. Warmup 15.
- ADX: current-period directional movement and true range produce +DI, -DI, and DX/ADX strength. Warmup 15.
- VWAP: sum typical-price times volume divided by total volume. Warmup 1.
- Supertrend: ATR(10) bands with multiplier 3 and typed long/short/neutral direction. Warmup 11.
- MACD: EMA(12) minus EMA(26), EMA(9) signal line, histogram. Warmup 35.
- Bollinger Bands: SMA(20) ± 2 standard deviations. Warmup 20.
- Donchian Channels: 20-period high/low/mid channel. Warmup 20.
- Stochastic: %K over 14 bars and %D as 3-period average. Warmup 16.

## Market features
Snapshots also include session classification, Asian range, London/New York status, session/daily/weekly highs and lows, swing highs/lows, trend/range/compression/breakout state, and volatility regime.
