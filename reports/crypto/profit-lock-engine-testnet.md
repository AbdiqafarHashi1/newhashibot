# Profit-Lock Engine Testnet Report

## Config values
- `enable_profit_lock_engine = false` by default.
- `enable_testnet_profit_lock_engine = true` only when `TESTNET_ENABLED=true` and DB config enables action mode.
- `profit_lock_min_r = 0.3`.
- `profit_lock_aggressive_min_r = 0.15`.
- `profit_lock_buffer_r = 0.03`.
- `profit_lock_after_tp1 = true`.
- `profit_lock_before_tp1 = research_only`.
- `profit_lock_before_tp1_testnet_allowed = false` by default.
- `profit_lock_max_updates_per_trade = 3`.
- `profit_lock_cooldown_minutes = 5`.

## Mode
Default is research-only. Action mode is testnet-gated and live trading remains forbidden.

## Study counters
The study function records +0.1R, +0.2R, +0.3R, +0.5R, later reversal count, and estimated USDT saved/captured at 10x. It works when execution is disabled.

## Actions
Allowed decisions are do nothing, research-only, move SL to BE, move SL to +0.3R, or emergency protect. The safety contract is that a valid old SL is never removed before replacement verification succeeds.

## Recommended defaults by strategy
- MicroScalper: research before TP1; after TP1 allow BE/+0.3R because TP distance can be tight and reversals matter.
- CompressionBreakout: research before TP1; after TP1 allow +0.3R only when reversal risk is high.
- SwingContinuation: avoid early before-TP1 locks by default; after TP1 use BE first, then +0.3R only after cooldown.

## Early lock live decision
Not ready for live. Continue testnet observation until the study counters prove improved expectancy and Binance stop replacement verification is consistently successful.
