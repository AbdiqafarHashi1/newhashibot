# Phase 1C-Validate — SwingContinuation 15m Cross-Window Validation

Generated: 2026-06-02 (UTC)

## Scope and controls

- Fixture: `data/backtests/5m.csv`
- Symbol / market: ETHUSDT / crypto
- Dataset timeframe: 5m
- Validation preset: Live-like default only
- Validation-only change: the local fixture validator now accepts explicit `--start`, `--end`, and `--full` window selectors so non-overlapping fixture windows can be measured reproducibly.

## Safety statement

This phase did not tune parameters and did not change strategy behavior. It only added local validator date-window selection and this report. No live scanner logic, Supabase Edge Function, provider logic, Telegram logic, outcome tracking, customer/package/Bot setup, broker/MT5/execution, DB `strategy_config`, MicroScalper logic, or CompressionBreakout logic was changed. No fake trades or forced trades were added.

## Windows tested

| Window | Command shape | Selected date range | Selected candles |
| --- | --- | --- | ---: |
| Current 90d | `--start=2025-06-08T15:10:00Z --end=2025-09-06T15:10:00Z --preset=live` | 2025-06-08T15:10:00.000Z -> 2025-09-06T15:10:00.000Z | 25,921 |
| Previous 90d | `--start=2025-03-10T15:10:00Z --end=2025-06-08T15:05:00Z --preset=live` | 2025-03-10T15:10:00.000Z -> 2025-06-08T15:05:00.000Z | 25,920 |
| Earlier 90d | `--start=2024-12-10T15:10:00Z --end=2025-03-10T15:05:00Z --preset=live` | 2024-12-10T15:10:00.000Z -> 2025-03-10T15:05:00.000Z | 25,920 |
| Last 180d | `--days=180 --preset=live` | 2025-03-10T15:10:00.000Z -> 2025-09-06T15:10:00.000Z | 51,841 |
| Full fixture | `--full --preset=live` | 2024-01-01T00:00:00.000Z -> 2025-09-06T15:10:00.000Z | 177,015 |

## SwingContinuation 15m cross-window results

| Window | Trades | Win rate | PF | Total R | Avg R | Max DD R | Max consecutive losses | TP1 | TP2 | SL | Expired | Top rejection reason | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Current 90d | 301 | 40.2% | 1.35 | 43.90 | 0.15 | 10.20 | 8 | 107 | 14 | 126 | 54 | reclaim_not_confirmed:415 | viable / preserve |
| Previous 90d | 327 | 36.7% | 1.00 | 0.60 | 0.00 | 29.40 | 13 | 106 | 14 | 168 | 39 | reclaim_not_confirmed:456 | viable but noisy |
| Earlier 90d | 314 | 42.0% | 1.34 | 46.30 | 0.15 | 11.60 | 8 | 119 | 13 | 137 | 45 | reclaim_not_confirmed:464 | viable / preserve |
| Last 180d | 631 | 38.5% | 1.16 | 46.10 | 0.07 | 29.40 | 13 | 215 | 28 | 295 | 93 | reclaim_not_confirmed:872 | viable but noisy |
| Full fixture | 2,146 | 38.9% | 1.20 | 200.00 | 0.09 | 29.40 | 13 | 730 | 105 | 980 | 331 | reclaim_not_confirmed:2914 | viable but noisy |

## Preservation check — MicroScalper 15m Live-like

| Window | Trades | Win rate | PF | Total R | Avg R | Max DD R | Max consecutive losses | TP1 | TP2 | SL | Expired | Top rejection reason | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Current 90d | 762 | 55.5% | 1.32 | 104.57 | 0.14 | 10.95 | 6 | 270 | 153 | 325 | 14 | candle_body_too_small:1737 | viable / preserve |
| Previous 90d | 774 | 52.8% | 1.20 | 70.26 | 0.09 | 11.93 | 7 | 245 | 164 | 352 | 13 | candle_body_too_small:1751 | viable / preserve |
| Earlier 90d | 773 | 53.7% | 1.23 | 78.68 | 0.10 | 10.48 | 7 | 269 | 146 | 341 | 17 | candle_body_too_small:1774 | viable / preserve |
| Last 180d | 1,543 | 54.3% | 1.26 | 178.99 | 0.12 | 11.93 | 7 | 521 | 317 | 678 | 27 | candle_body_too_small:3501 | viable / preserve |
| Full fixture | 5,143 | 53.7% | 1.24 | 549.57 | 0.11 | 23.31 | 10 | 1687 | 1075 | 2288 | 93 | candle_body_too_small:12593 | viable / preserve |

## Preservation check — CompressionBreakout 15m Live-like

| Window | Trades | Win rate | PF | Total R | Avg R | Max DD R | Max consecutive losses | TP1 | TP2 | SL | Expired | Top rejection reason | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Current 90d | 141 | 31.9% | 1.29 | 14.10 | 0.10 | 5.00 | 5 | 42 | 3 | 48 | 48 | compression_not_ready:4302 | viable but noisy |
| Previous 90d | 145 | 31.0% | 0.91 | -5.50 | -0.04 | 10.40 | 8 | 45 | 0 | 64 | 36 | compression_not_ready:4505 | needs tuning |
| Earlier 90d | 140 | 29.3% | 1.11 | 5.70 | 0.04 | 11.10 | 9 | 39 | 2 | 50 | 49 | compression_not_ready:4234 | viable but noisy |
| Last 180d | 286 | 31.1% | 1.06 | 6.30 | 0.02 | 11.90 | 8 | 86 | 3 | 113 | 84 | compression_not_ready:8841 | viable but noisy |
| Full fixture | 1,008 | 31.0% | 1.03 | 10.40 | 0.01 | 28.40 | 10 | 298 | 14 | 412 | 284 | compression_not_ready:29412 | viable but noisy |

## Preservation check — SwingContinuation 1h Live-like

| Window | Trades | Win rate | PF | Total R | Avg R | Max DD R | Max consecutive losses | TP1 | TP2 | SL | Expired | Top rejection reason | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Current 90d | 79 | 40.5% | 1.41 | 13.80 | 0.17 | 8.20 | 5 | 29 | 3 | 34 | 13 | reclaim_not_confirmed:166 | viable / preserve |
| Previous 90d | 79 | 32.9% | 0.89 | -4.60 | -0.06 | 11.60 | 6 | 25 | 1 | 42 | 11 | reclaim_not_confirmed:153 | needs tuning |
| Earlier 90d | 66 | 28.8% | 0.92 | -2.40 | -0.04 | 9.40 | 6 | 16 | 3 | 32 | 15 | reclaim_not_confirmed:138 | needs tuning |
| Last 180d | 161 | 36.6% | 1.11 | 8.60 | 0.05 | 11.60 | 6 | 55 | 4 | 78 | 24 | reclaim_not_confirmed:315 | viable but noisy |
| Full fixture | 526 | 35.2% | 1.10 | 24.00 | 0.05 | 15.80 | 8 | 171 | 14 | 249 | 92 | reclaim_not_confirmed:979 | viable but noisy |

## Decision readout

The tuned SwingContinuation 15m exit geometry is **not recommended for Phase 1D live-port yet**. It is not a one-window-only result: the current 90d, earlier 90d, 180d, and full fixture windows are positive, and three of five windows have PF above 1.15. However, the previous 90d window is effectively flat (PF 1.00, +0.60R, avg 0.00R) with a materially larger 29.40R drawdown and 13-loss streak. The 180d and full-fixture windows inherit that drawdown stress.

Conclusion: this looks **promising but regime-sensitive**, not robust enough to port to the live scanner without more validation. Keep the tuned 15m exit geometry in research/backtest validation, and validate on additional symbols or rolling windows before live-port consideration.

## Manual verification steps

1. Run `npm run backtest:fixture -- --start=2025-06-08T15:10:00Z --end=2025-09-06T15:10:00Z --preset=live`.
2. Run `npm run backtest:fixture -- --start=2025-03-10T15:10:00Z --end=2025-06-08T15:05:00Z --preset=live`.
3. Run `npm run backtest:fixture -- --start=2024-12-10T15:10:00Z --end=2025-03-10T15:05:00Z --preset=live`.
4. Run `npm run backtest:fixture -- --days=180 --preset=live`.
5. Run `npm run backtest:fixture -- --full --preset=live`.
6. Confirm no live scanner, Supabase Edge Function, provider, Telegram, outcome, customer/Bot, execution, or DB `strategy_config` files changed.
