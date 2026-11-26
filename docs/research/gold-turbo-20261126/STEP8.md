# Work period 8: reproducible real-tick baseline

**Implemented and historically screened; not profitability validated or commercially qualified. Demo-only remains enforced.** No strategy thresholds changed, no existing ledger regenerated, no customer account activated.

Restored only the missing October 2026 Exness XAUUSD Raw Spread monthly archive. Its original SHA256 matches prior retained research. Preserved all 5,910,062 original quotes, the derived 30,174 M1 bars and manifest for subsequent work; exact persistent references are in data-preservation.json. No August/September download. The original 1,159-trade / 16-configuration ledger remains untouched and separately fingerprinted.

## Scope and execution

Predeclared October 6, 14 and 22, 08:00–16:00 UTC, with one minute of local tick warmup and 64 previously completed bars per timeframe. 411,764 original bid/ask quotes were processed; no candle-to-tick fabrication or future completed-bar release. Three selected eight-hour sessions are **not** a whole-month backtest. October had already appeared in earlier research and is not unseen validation.

Eight lineups at $100/$500/$1,000/$25,000: all five individually, Momentum+Trend, Micro+Range+Basket, and adaptive all-five. The unchanged local strategy classes, production sizing, basket coordinator, arbitration, account guards and management code execute against an offline scenario terminal. Only disk checkpointing/heartbeat transport is bypassed. This is not a broker connection or proof of live terminal behavior.

Scenario: USD hedging account, 100 oz/lot, minimum/step 0.01 lot, 1:100 leverage, minimum stop distance $0.10, observed bid/ask spread, $3.50/lot/side commission, adverse $0.02/oz slippage per side. Entries/management every five seconds; broker SL/TP crossings inspect every original quote and stop gaps fill at observed executable prices with slippage. Immediate scenario fills, zero order latency, no partial fills or requotes. These are configurable research assumptions, not verified Exness/customer contract specifications. Historical news calendar unavailable: explicit clear-news scenario, **not** empirical news-protection validation. Production calendar requirement is unchanged. Positions are forced flat at each selected session end, with costs; no overnight swap assumptions are needed.

Conservative runtime caps: decision/basket allowance .25% up to $500, .20% up to $5,000, .15% above; daily lock 1.5%, peak lock 8%, aggregate open risk 1%, margin 20%, basket target .2%. Stops and daily locks are not guaranteed maximum realized losses in gaps.

## Measured results

Net returns include observed spread, scenario commission and slippage. Selected sessions carry account cash/guards forward; they omit intervening sessions.

| Lineup | $100 return | $500 return | $1,000 return | $25,000 return | $25k max DD | $25k baskets / orders |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Micro | 0.00% | -1.93% | -2.03% | -1.86% | 2.32% | 30 / 30 |
| Momentum | 0.00% | +0.22% | -1.08% | -2.77% | 2.93% | 48 / 48 |
| Range | 0.00% | +0.24% | +1.37% | +0.79% | 0.53% | 21 / 21 |
| Trend | 0.00% | 0.00% | 0.00% | -0.03% | 0.71% | 8 / 8 |
| Price-action Basket | 0.00% | -1.63% | -1.09% | -1.96% | 2.56% | 105 / 130 |
| Momentum + Trend | 0.00% | +0.22% | -1.08% | -2.89% | 3.05% | 56 / 56 |
| Micro + Range + Basket | 0.00% | -1.21% | -0.35% | -1.53% | 3.00% | 98 / 116 |
| Adaptive all-five | 0.00% | -1.33% | -1.69% | -3.18% | 3.34% | 98 / 109 |

$100 generated no fills under this standard-lot scenario. Zero return here is inactivity, not evidence of success. Cent-account execution requires a separate verified contract scenario. There is no evidence to recommend aggressive commercial profiles at any capital from this sample. Range is the strongest **next validation candidate**, not a proven portfolio. Adaptive all-five underperformed the best individual strategy.

baseline-summary.json contains per-case PF, expectancy, win rate, volume-weighted exit holding time, basket frequency, individual entries, commissions, peak margin, realized session P&L and drawdown. All cases remained above zero, which does not establish a survival probability. Subscription-adjusted money subtracts an illustrative whole $100 monthly fee from this partial-session outcome; it is not a customer monthly-profit estimate. Monthly returns, median month, profitable-month percentage and worst complete month are unavailable; no annualization or extrapolation is used.

baseline-receipts.json.gz contains the full baseline, fills, closed baskets and rejection/model counters. Its decompressed SHA256 is in baseline-summary.json. Every case reconciles balance against all receipts, basket totals against receipts, and every filled position's entry/exit volume to flat. Individual orders are not counted as independent baskets.

## What number 9 should address

At $25k, Micro persistent-burst baskets lost $483.18; Momentum strong-candle continuation lost $691.48. Basket wrapper losses concentrate in those same source models ($215.04 and $296.63, grouped by basket's initial model; later legs may differ). Adaptive selection also admitted costly continuation/burst opportunities. Planned reward/risk ranking is therefore not evidence of signal quality. Range's failed-breakout/rejection outcomes deserve preservation and separate validation. Trend participation is low (eight baskets over these sessions).

The focused improvement round should diagnose chase/continuation invalidation and exit timing, review adaptive quality/regime weighting and participation, preserve this baseline, and compare one bounded change set against it. Do not simply raise risk, disable every losing family, tune repeatedly to these three days, or call the same dates unseen validation. Longer chronological coverage, execution-cost/latency stress, a historical calendar, actual broker specs and sustained demo fills remain qualification requirements.

## Verification and reuse

- 139 existing targeted Gold Turbo tests pass; five new replay tests cover long/short executable stop sides, gap fills, fee/partial accounting, insufficient risk and causal completed context.
- 32 baseline case cash/basket/flat-volume audits pass; changed Python files compile; whitespace checks pass.
- Replay computation: approximately 156 seconds for the 32-case matrix, without historical parameter sweeps or full-repository tests.

After restoring the preserved source files to .tmp/gold-micro/data:

```sh
python3 scripts/research/gold-turbo/replay.py
python3 scripts/research/gold-turbo/report.py
python3 scripts/research/gold-turbo/test_replay.py
```

The first command writes ignored .tmp/gold-turbo-baseline.json; the report writes compact committed summary/full receipts. All defaults are a bounded screening baseline. Production strategies remain at commit 2f16a2505e8db50b0a4570ff5fa8686f9eb918b5.
