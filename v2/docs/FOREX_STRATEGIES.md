# FOREX_STRATEGIES

All forex strategies are `RESEARCH_READY` and session-aware. Spread guards use cached candle/feature metadata where available.

## London Breakout
- Timeframes: 15m, 1h.
- Uses: Asian high/low, London status, ATR, ADX, breakout state, spread guard.
- No-trade: not London open, missing Asian range, spread unsuitable, no range break, invalid RR.

## Forex Trend Pullback
- Timeframes: 15m, 1h.
- Uses: EMA20/EMA50/EMA200, ADX, RSI reset, ATR, trend state, session filter.
- No-trade: off-hours, trend/pullback invalid, missing indicators, invalid RR.

## New York Continuation
- Timeframes: 15m, 1h.
- Uses: NY open, London open/overlap context, EMA trend, ADX momentum, ATR, volatility regime.
- No-trade: outside overlap, weak continuation, invalid RR.

## Swing Continuation
- Timeframes: 1h, 4h.
- Uses: market structure, swing highs/lows, EMA50/EMA200, ATR, trend state, daily/weekly levels.
- No-trade: no swing trend, missing levels/swings, invalid RR.
