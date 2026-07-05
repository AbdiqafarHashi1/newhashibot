# CRYPTO_STRATEGIES

All crypto strategies are `RESEARCH_READY` and support controlled candidate production only.

## MicroScalper
- Timeframes: 5m, 15m.
- Purpose: short-term momentum continuation.
- Uses: EMA20/EMA50 alignment, RSI, ATR, ADX, VWAP, volatility regime, trend state.
- No-trade examples: warmup missing, high volatility, weak ADX, RSI not confirming, invalid RR.

## Compression Breakout
- Timeframes: 15m, 1h.
- Purpose: volatility contraction into expansion.
- Uses: Bollinger Bands, ATR, Donchian Channels, breakout state, volume expansion, volatility regime.
- No-trade examples: no channel breakout, no band confirmation, no volume expansion, already-high volatility, invalid RR.

## Trend Pullback
- Timeframes: 15m, 1h.
- Purpose: continuation after retracement.
- Uses: EMA20/EMA50/EMA200, RSI reset, ATR stop, ADX, trend and swing structure.
- No-trade examples: EMA stack not aligned, pullback too extended, RSI not reset, invalid RR.

## Reversal Exhaustion
- Timeframes: 15m, 1h.
- Purpose: high-quality exhaustion reversals.
- Uses: RSI extremes, Bollinger outer band context, volatility regime, swing highs/lows, ATR stop.
- No-trade examples: no extreme RSI/band touch, missing swings, invalid RR.
