# MARKET_FEATURES

Market features are part of `IndicatorSnapshot` so every future strategy reads one shared intelligence contract.

## Sessions
UTC sessions classify candles as Asian, London, New York, overlap, or off-hours. The engine tracks Asian range, London/New York open status, active session high/low, daily high/low, and weekly high/low.

## Market structure
- Swing highs/lows: local pivot highs/lows over neighboring candles.
- Trend state: EMA20 versus EMA50 (`up`, `down`, `sideways`).
- Range state: Donchian width relative to price.
- Compression state: compressed when recent channel width is narrow.
- Breakout state: close at/through Donchian upper or lower channel.
- Volatility regime: ATR percentage of price classified low, normal, or high.

Intended strategy use: London breakout uses session ranges; trend-pullback uses trend and ATR; compression breakout uses compression/breakout; reversal/exhaustion can use stochastic, RSI, bands, and swings.
