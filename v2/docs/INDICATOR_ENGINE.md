# INDICATOR_ENGINE

The indicator engine subscribes to `CandleClosed`, reads candles from `CandleCache`, computes shared EMA, SMA, RSI, and ATR snapshots once per symbol/timeframe, writes them to `IndicatorCache`, and emits `IndicatorsUpdated`. ADX, VWAP, Supertrend, MACD, Bollinger Bands, Donchian Channels, Stochastic, session levels, and market structure are placeholder interfaces for later prompts.
