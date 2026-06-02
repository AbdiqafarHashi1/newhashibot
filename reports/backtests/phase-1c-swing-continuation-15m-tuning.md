# Phase 1C — SwingContinuation 15m Quality + Exit Tuning

Generated: 2026-06-02 (UTC)

## Scope and controls

- Fixture: `data/backtests/5m.csv`
- Symbol / market: ETHUSDT / crypto
- Dataset timeframe: 5m
- Selected 90-day range: `2025-06-08T15:10:00.000Z` -> `2025-09-06T15:10:00.000Z`
- Selected candles: 25,921
- Command used for final validation: `npm run backtest:fixture -- --days=90 --preset=all`

## Safety statement

This phase changed browser/local backtest research logic only. It did not change live scanner logic, provider logic, Telegram logic, outcome tracking, customer/package/Bot setup, broker/MT5/execution, or DB `strategy_config`. No fake trades/signals were added. No RR or distance guard was removed. No `min_score` or `min_rr` was blindly lowered.

## Root issue found

SwingContinuation 15m was not primarily weak because Aggressive was looser. Isolated checks showed:

| Isolated change tested on Live-like SwingContinuation | 15m result | 1h impact | Read |
| --- | --- | --- | --- |
| Baseline Phase 1B | 283 trades, PF 1.12, +15.60R, avg +0.06R, max DD 12.20R | 79 trades, PF 1.41, +13.80R | Stable but weak 15m expectancy. |
| Max bars 60 -> 120 only | 218 trades, PF 1.06, +6.60R, max DD 17.20R | 62 trades, PF 1.34, +9.80R | Longer expiry alone made quality worse. |
| Aggressive distance guards only | 280 trades, PF 1.08, +10.40R, max DD 14.40R | unchanged | Stricter distance filters alone did not explain improvement. |
| ATR floor 0.10 -> 0.15 only | 283 trades, PF 1.12, +15.60R, max DD 12.20R | unchanged | ATR floor had negligible 15m effect on this fixture. |
| RSI buy/sell 52/48 -> 48/52 only | 291 trades, PF 1.13, +17.20R, max DD 13.00R | 79 trades, PF 1.29, +10.00R | Slight 15m participation gain but not enough and weakened 1h. |
| TP construction 1.4R/2.4R -> 1.3R/2.2R only | 301 trades, PF 1.35, +43.90R, avg +0.15R, max DD 10.20R | 75 trades, PF 1.32, +9.80R if applied to 1h too | Exit construction was the main 15m quality driver; it needed 15m isolation to keep 1h safe. |

Conclusion: the key 15m issue was exit geometry. The 15m continuation entries often had valid pullback/reclaim structure, but the previous 1.4R/2.4R targets were too stretched for the 15m follow-through profile before timeout or reversal. Aggressive improved 15m mostly because it used closer 1.3R/2.2R targets, not because every Aggressive gate was better.

## Tuning changes made

- Added optional SwingContinuation-only `swing_15m_tp1_r` and `swing_15m_tp2_r` research parameters.
- Set Live-like SwingContinuation 15m exits to TP1 = 1.3R and TP2 = 2.2R while preserving the existing 1h exits at TP1 = 1.4R and TP2 = 2.4R.
- Kept `min_score = 72`, `min_rr = 1.2`, existing distance guards, pullback/reclaim checks, trend checks, and stop placement intact.
- Fixed Backtest Lab preset parity so `balanced` uses the Balanced research preset instead of aliasing to Live-like; MicroScalper and CompressionBreakout remain unchanged because their Balanced defaults already equal Live-like.

## Before vs after — SwingContinuation 15m

| Preset | Before trades | Before PF | Before total R | Before avg R | Before max DD | Before max CL | After trades | After PF | After total R | After avg R | After max DD | After max CL | Assessment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Live-like default | 283 | 1.12 | 15.60 | 0.06 | 12.20 | 8 | 301 | 1.35 | 43.90 | 0.15 | 10.20 | 8 | Target met; quality and exits improved without DD damage. |
| Balanced research | 222 | 1.12 | 13.50 | 0.06 | 12.00 | 8 | 222 | 1.12 | 13.50 | 0.06 | 12.00 | 8 | Preserved as research baseline. |
| Aggressive research | 232 | 1.24 | 27.60 | 0.12 | 12.10 | 6 | 232 | 1.24 | 27.60 | 0.12 | 12.10 | 6 | Preserved for comparison; not copied wholesale. |

## Before vs after — SwingContinuation 1h safety check

| Preset | Before trades | Before PF | Before total R | Before avg R | Before max DD | Before max CL | After trades | After PF | After total R | After avg R | After max DD | After max CL | Assessment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Live-like default | 79 | 1.41 | 13.80 | 0.17 | 8.20 | 5 | 79 | 1.41 | 13.80 | 0.17 | 8.20 | 5 | Unchanged; 15m-specific exits kept 1h safe. |
| Balanced research | 68 | 1.15 | 5.50 | 0.08 | 9.00 | 5 | 68 | 1.15 | 5.50 | 0.08 | 9.00 | 5 | Unchanged. |
| Aggressive research | 61 | 1.35 | 9.10 | 0.15 | 6.70 | 5 | 61 | 1.35 | 9.10 | 0.15 | 6.70 | 5 | Unchanged. |

## Preserve checks for non-target families

| Candidate | Phase 1B expected | Phase 1C after | Status |
| --- | --- | --- | --- |
| MicroScalper 15m Live-like | 762 trades, PF 1.32, +104.57R, avg +0.14R, max DD 10.95R | 762 trades, PF 1.32, +104.57R, avg +0.14R, max DD 10.95R | Unchanged. |
| CompressionBreakout 15m Live-like | 141 trades, PF 1.29, +14.10R, avg +0.10R, max DD 5.00R | 141 trades, PF 1.29, +14.10R, avg +0.10R, max DD 5.00R | Unchanged. |

## Target metric assessment

| Target | Result |
| --- | --- |
| PF ideally above 1.20 | Met: Live-like SwingContinuation 15m improved to PF 1.35. |
| Total R ideally above +20R | Met: improved to +43.90R. |
| Avg R ideally above +0.09R | Met: improved to +0.15R. |
| Max DD not worse than ~12R | Met: improved to 10.20R. |
| Trade count preferably 150–300 | Near target: 301 trades, one trade above preferred range and still reasonable. |
| Loss streak not materially worse | Met: max consecutive losses stayed 8. |

## Updated recommended tuning order after Phase 1C

1. Preserve MicroScalper 15m Live-like/Balanced unchanged.
2. Preserve tuned SwingContinuation 15m Live-like for broader validation; do not tune further on this same fixture before cross-window checks.
3. Validate tuned SwingContinuation 15m on another symbol/window and compare against the unchanged Balanced/Aggressive research baselines.
4. Tune CompressionBreakout 15m later for participation/quality once SwingContinuation 15m is validated outside this 90-day fixture.
5. Keep CompressionBreakout 1h and non-live SwingContinuation 1h variants research-only until larger sample evidence exists.

## Manual verification steps

1. Run `npm run backtest:fixture -- --days=90 --preset=all`.
2. Confirm Live-like SwingContinuation 15m is `301 trades, PF 1.35, +43.90R, avg +0.15R, max DD 10.20R`.
3. Confirm Live-like SwingContinuation 1h remains `79 trades, PF 1.41, +13.80R, avg +0.17R, max DD 8.20R`.
4. Confirm MicroScalper 15m Live-like remains `762 trades, PF 1.32, +104.57R`.
5. Confirm CompressionBreakout 15m Live-like remains `141 trades, PF 1.29, +14.10R`.
6. Confirm no DB `strategy_config`, provider, Telegram, scanner schedule, customer app, Bot setup, or execution files changed.
