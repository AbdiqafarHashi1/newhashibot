# Provider Comparison Dashboard — Phase X-D

Date: 2026-06-15

## Dashboard

Created an admin Provider Comparison dashboard at `/admin/provider-comparison`.

## Per-signal comparison columns

- Signal ID / execution group
- Symbol / direction
- Lifecycle event
- Binance status
- Bybit status
- Fill price and slippage differences
- Protection verification difference
- Recovery difference
- Profit-lock difference
- Best / fastest provider

## Provider rankings

The dashboard surfaces automatic rankings from parity rows:

- Best Provider
- Fastest Provider
- Most Reliable Provider
- Safest Provider
- Lowest Slippage Provider
- Highest Profit Provider

## Provider performance cards

Cards are backed by `provider_execution_performance` and show executions, win rate, execution failure, protection reliability, recovery issues, profit-lock successes, average slippage, and average hold time per provider.
