# V2 Crypto Strategies

The crypto strategies are implemented in `v2/strategies/index.ts` through the shared professional framework. They consume only closed candles, `IndicatorSnapshot`, and `ExtendedIndicatorSnapshot.marketFeatures` from the Shared Indicator Engine.

- `crypto.micro-scalper`: rejects thin liquidity, weak trend, weak momentum, high volatility, poor RR, duplicate opportunities and blocked news/maintenance windows.
- `crypto.compression-breakout`: requires compression, breakout readiness, channel breakout, volume support and post-compression expansion; rejects false breakouts by requiring closed-candle state.
- `crypto.trend-pullback`: requires EMA/trend alignment, adequate trend strength, healthy pullback and momentum recovery.
- `crypto.reversal-exhaustion`: requires strong reversal probability, RSI exhaustion, volatility participation and confirmation metadata.
