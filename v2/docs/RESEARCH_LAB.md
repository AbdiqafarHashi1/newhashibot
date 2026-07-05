# V2 Research Lab

The Research Lab provides replay, backtesting, walk-forward testing, Monte Carlo analysis, parameter comparison, certification, live shadow-test summaries, and compact reports for V2 strategies.

## Storage and egress controls

Supabase stores metadata, compact summaries, certification status, shadow-test summaries, audit-friendly report sections, and dataset references only. Raw market datasets, replay ticks, full candle histories, and per-candle traces must stay in local files, uploaded files, external providers, compressed fixtures, or runtime memory.

The migration enforces compact JSON limits and rejects raw payload keys such as `candles`, `ticks`, `rawCandles`, `fullHistory`, and `perCandleTrace`.

## Execution boundaries

Replay and backtest code replays closed candles into the indicator engine and strategy framework. It does not import live exchange providers and does not create real orders. Backtests simulate entries/exits and produce compact metrics only.

## Certification

A strategy + parameter set may be `EXPERIMENTAL`, `SHADOW`, `CERTIFIED`, `REJECTED`, or `RETIRED`. Certification checks minimum trades, profit factor, drawdown, stability, expectancy, win rate, and regime diversity before production promotion.
