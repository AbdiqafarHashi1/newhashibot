# HashiBot Personal strategy evidence — 27 November 2026

The catalogue remains 16 existing configurations plus five Gold Turbo strategies. The additional compression prototype is outside the catalogue. No paid/live execution or Prop policy was enabled.

## Existing 16: retained costed trades

These 1,159 records were reused, not regenerated. Results are net R from unequal historical windows, not fresh account backtests. Orders and deals cannot be reconstructed from these records. Full covered months, gaps, dates and chronological halves are retained in `existing-16-detailed.json`.

| Configuration | Decisions | Net R | Win % | Avg win R | Avg loss R | PF | Hold min | Decisions/covered day |
|---|---|---|---|---|---|---|---|---|
| crypto.complementary-ema-pullback | 104 | 15.37 | 49.04 | 1.32 | -0.98 | 1.30 | 2416.73 | 0.17 |
| crypto.launch-rsi2-48-3-3-h72 | 86 | 8.41 | 43.02 | 1.50 | -0.96 | 1.18 | 10296.63 | 0.40 |
| crypto.launch-trend-pullback-48-1.5-5 | 109 | 42.45 | 24.77 | 4.80 | -1.06 | 1.49 | 5938.17 | 0.51 |
| crypto.launch-trend-pullback-48-2-3-h72 | 116 | 14.58 | 31.90 | 2.57 | -1.02 | 1.18 | 6058.71 | 0.54 |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | 48 | 4.57 | 52.08 | 0.77 | -0.64 | 1.31 | 283.75 | 0.31 |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | 47 | 3.94 | 55.32 | 0.82 | -0.83 | 1.22 | 44.57 | 0.31 |
| forex.complementary-ema-pullback | 73 | 10.45 | 46.58 | 1.48 | -1.03 | 1.26 | 3394.52 | 0.12 |
| forex.native-band-reentry-60-12-2-5 | 43 | 10.28 | 34.88 | 2.51 | -0.98 | 1.38 | 1861.40 | 0.28 |
| forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 | 37 | 12.46 | 51.35 | 1.38 | -0.77 | 1.91 | 382.16 | 0.24 |
| forex.native-squeeze-15-48-2-3-usdjpy-h12 | 48 | 5.97 | 56.25 | 0.87 | -0.84 | 1.34 | 149.69 | 0.26 |
| forex.native-sweep-retest-60-16-2-5-usdjpy-h72 | 46 | 3.30 | 23.91 | 3.59 | -1.03 | 1.09 | 1647.17 | 0.30 |
| gold.frontier-compression-15-24-1.5-5-h96 | 83 | 5.37 | 24.10 | 3.49 | -1.02 | 1.08 | 758.92 | 0.46 |
| gold.native-band-reentry-15-48-3-5 | 47 | 13.65 | 34.04 | 2.82 | -1.02 | 1.43 | 1553.72 | 0.31 |
| gold.native-momentum-15-48-2-5 | 101 | 32.37 | 27.72 | 3.81 | -1.02 | 1.44 | 879.95 | 0.66 |
| gold.native-momentum-60-24-2-5 | 37 | 17.05 | 40.54 | 2.59 | -0.99 | 1.78 | 3078.78 | 0.24 |
| gold.rsi-trailing-15-48-1.5-5-h96 | 134 | 22.59 | 40.30 | 1.93 | -1.02 | 1.28 | 513.58 | 0.76 |

## Fresh Crypto: 1–26 November, 26 calendar days

Ten existing launch assets, native 4h/1h/15m/5m candle sources as required, paid funding and current volume filters. Six frozen production entry families, two combinations and one frozen prototype. 576 capital/risk/leverage/cost scenarios. Base commissions 5 bps per side, slippage 3 bps per side (ETH complementary 7.5); stress slippage 10 bps (ETH complementary 15). This is an OHLC execution screen, not real bid/ask or exchange qualification. Stops take priority within ambiguous bars. Next-bar entry; gap losses and approximate liquidation checks included.

The table uses $500, 10× available leverage and 1% fixed decision risk. Leverage changes available margin, not the profit of an unchanged position. Risk headroom reserves the full original decision risk until closure, including after partial exits; this is conservative. Daily/peak limits are experimental 15%/60%, correlated risk 10%, entry margin 50%. These are not customer defaults. Drawdown is sampled equity, not verified intrabar maximum.

| Lineup | Return % | Stress % | DD % | Decisions/day | Win % | Avg win $ | Avg loss $ | Hold min |
|---|---|---|---|---|---|---|---|---|
| crypto.complementary-ema-pullback | 5.20 | 4.60 | 1.14 | 7/26 = 0.27 | 71.43 | 7.28 | -5.21 | 1725.00 |
| crypto.launch-rsi2-48-3-3-h72 | 19.34 | 18.49 | 12.48 | 24/26 = 0.92 | 70.83 | 7.32 | -3.97 | 8572.29 |
| crypto.launch-trend-pullback-48-1.5-5 | 41.94 | 39.24 | 13.49 | 24/26 = 0.92 | 62.50 | 16.66 | -4.46 | 7452.08 |
| crypto.launch-trend-pullback-48-2-3-h72 | 28.13 | 24.93 | 11.02 | 22/26 = 0.85 | 72.73 | 10.06 | -3.38 | 7255.45 |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | -0.60 | -0.86 | 1.60 | 5/26 = 0.19 | 60.00 | 2.35 | -5.03 | 285.00 |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | 0.77 | 0.53 | 0.56 | 2/26 = 0.08 | 50.00 | 6.23 | -2.38 | 47.50 |
| research.crypto-compression-sprint-15m-v1 | -23.24 | -27.53 | 24.62 | 70/26 = 2.69 | 22.86 | 3.24 | -3.11 | 127.71 |
| ADAPTIVE_EXISTING_SIX | 46.09 | 43.01 | 12.23 | 34/26 = 1.31 | 76.47 | 10.34 | -4.78 | 7399.85 |
| TREND_AND_VWAP | 43.17 | 39.96 | 13.88 | 26/26 = 1.00 | 61.54 | 16.22 | -4.37 | 6882.50 |

### Crypto combined sizing comparison

All rows use the same six-family arbitration, prices, costs and 15%/60% limits; sizing changes portfolio admission and realized paths. No risk level was tuned for a guaranteed result.

| Capital | Risk % | Leverage | Return % | Stress % | Sampled DD % | Decisions | After $100 fee $ |
|---|---|---|---|---|---|---|---|
| 100 | 1 | 1 | 14.95 | 14.43 | 6.09 | 13 | -85.05 |
| 100 | 1 | 10 | 43.34 | 40.01 | 11.02 | 31 | -56.66 |
| 100 | 2 | 1 | 13.53 | 12.73 | 5.45 | 13 | -86.47 |
| 100 | 2 | 10 | 54.04 | 43.21 | 16.07 | 16 | -45.96 |
| 100 | 3 | 1 | 11.34 | 10.88 | 5.07 | 11 | -88.66 |
| 100 | 3 | 10 | 59.55 | 55.66 | 13.41 | 15 | -40.45 |
| 100 | 5 | 1 | 9.92 | 9.42 | 5.68 | 7 | -90.08 |
| 100 | 5 | 10 | 42.93 | 27.05 | 15.19 | 12 | -57.07 |
| 500 | 1 | 1 | 14.46 | 13.49 | 7.23 | 21 | -27.71 |
| 500 | 1 | 10 | 46.09 | 43.01 | 12.23 | 34 | 130.45 |
| 500 | 2 | 1 | 15.87 | 14.62 | 7.13 | 16 | -20.66 |
| 500 | 2 | 10 | 54.65 | 50.49 | 16.07 | 17 | 173.26 |
| 500 | 3 | 1 | 10.77 | 10.34 | 5.30 | 16 | -46.14 |
| 500 | 3 | 10 | 60.13 | 55.35 | 13.48 | 15 | 200.66 |
| 500 | 5 | 1 | 10.36 | 9.84 | 5.62 | 11 | -48.18 |
| 500 | 5 | 10 | 43.20 | 39.15 | 15.20 | 12 | 116.00 |
| 1000 | 1 | 1 | 13.93 | 13.54 | 6.25 | 20 | 39.27 |
| 1000 | 1 | 10 | 46.12 | 42.99 | 12.46 | 34 | 361.16 |
| 1000 | 2 | 1 | 15.45 | 14.82 | 7.22 | 20 | 54.51 |
| 1000 | 2 | 10 | 54.35 | 50.42 | 16.07 | 17 | 443.50 |
| 1000 | 3 | 1 | 17.51 | 16.81 | 6.99 | 17 | 75.15 |
| 1000 | 3 | 10 | 59.99 | 55.01 | 13.86 | 15 | 499.88 |
| 1000 | 5 | 1 | 17.82 | 17.18 | 7.00 | 16 | 78.18 |
| 1000 | 5 | 10 | 43.32 | 39.15 | 15.20 | 12 | 333.20 |
| 25000 | 1 | 1 | 9.56 | 9.31 | 6.16 | 34 | 2290.65 |
| 25000 | 1 | 10 | 47.09 | 43.99 | 12.61 | 34 | 11673.46 |
| 25000 | 2 | 1 | 10.46 | 10.04 | 7.23 | 27 | 2515.67 |
| 25000 | 2 | 10 | 45.19 | 38.59 | 15.81 | 20 | 11198.58 |
| 25000 | 3 | 1 | 11.09 | 10.49 | 7.01 | 26 | 2671.71 |
| 25000 | 3 | 10 | 59.86 | 55.06 | 14.06 | 15 | 14864.11 |
| 25000 | 5 | 1 | 11.36 | 10.82 | 7.02 | 26 | 2740.37 |
| 25000 | 5 | 10 | 43.30 | 39.20 | 15.20 | 12 | 10724.40 |

A full $100 subscription is an external cost sensitivity; it was not withdrawn from collateral. Terminal positions are forcibly marked/closed at the period end; open-before-terminal counts and exit reasons are disclosed in the JSON. One partial November cannot establish median monthly returns, profitable-month probability or sustainable growth. The ETH complementary case uses perpetual data, unlike its older spot-reference ledger. The losing compression prototype remains rejected.

## Existing Gold Standard: October ticks, higher Personal sizing

These three unchanged rules are intraday/swing, not the new Turbo scalpers. Separate accounts at each size; returns must not be added. Actual retained bid/ask ticks, 100 oz/lot, 0.01 minimum/step, 100× leverage, $3.50/lot/side commission. Base slippage $0.02/side and 200 ms execution; stress $0.05 and 500 ms. Same 15% daily/60% peak/50% entry margin experimental constraints across risk levels. Overnight financing is unverified and omitted; profits are before financing and subscription. Full 96 cases and receipts are retained.

| Configuration | Capital | Risk % | Return % | Stress % | DD % | Decisions | Avg win $ | Avg loss $ |
|---|---|---|---|---|---|---|---|---|
| gold.native-momentum-15-48-2-5 | 500 | 1 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-momentum-15-48-2-5 | 25000 | 1 | 5.90 | 5.43 | 5.43 | 32 | 875.97 | -230.57 |
| gold.native-momentum-15-48-2-5 | 500 | 2 | -5.22 | -5.23 | 9.76 | 5 | 9.62 | -8.93 |
| gold.native-momentum-15-48-2-5 | 25000 | 2 | 11.27 | 10.15 | 10.77 | 32 | 1790.85 | -479.52 |
| gold.native-momentum-15-48-2-5 | 500 | 3 | 27.96 | 27.22 | 13.29 | 28 | 49.57 | -12.84 |
| gold.native-momentum-15-48-2-5 | 25000 | 3 | 15.69 | 13.77 | 15.77 | 32 | 2675.59 | -728.38 |
| gold.native-momentum-15-48-2-5 | 500 | 5 | 22.94 | 9.32 | 23.77 | 30 | 76.46 | -18.28 |
| gold.native-momentum-15-48-2-5 | 25000 | 5 | 17.38 | 13.99 | 28.80 | 30 | 3691.17 | -1144.76 |
| gold.native-momentum-60-24-2-5 | 500 | 1 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-momentum-60-24-2-5 | 25000 | 1 | 5.53 | 5.56 | 5.90 | 8 | 862.88 | -241.05 |
| gold.native-momentum-60-24-2-5 | 500 | 2 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-momentum-60-24-2-5 | 25000 | 2 | 10.93 | 10.90 | 11.42 | 8 | 1743.20 | -499.30 |
| gold.native-momentum-60-24-2-5 | 500 | 3 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-momentum-60-24-2-5 | 25000 | 3 | 16.76 | 16.56 | 16.50 | 8 | 2657.87 | -756.74 |
| gold.native-momentum-60-24-2-5 | 500 | 5 | -13.73 | -9.12 | 21.98 | 3 | — | -22.89 |
| gold.native-momentum-60-24-2-5 | 25000 | 5 | 26.63 | 25.75 | 25.63 | 8 | 4360.27 | -1284.68 |
| gold.native-band-reentry-15-48-3-5 | 500 | 1 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-band-reentry-15-48-3-5 | 25000 | 1 | 6.22 | 6.22 | 6.45 | 10 | 753.13 | -243.10 |
| gold.native-band-reentry-15-48-3-5 | 500 | 2 | 0.00 | 0.00 | 0.00 | 0 | — | — |
| gold.native-band-reentry-15-48-3-5 | 25000 | 2 | 13.35 | 13.52 | 12.83 | 10 | 1591.90 | -504.87 |
| gold.native-band-reentry-15-48-3-5 | 500 | 3 | -2.74 | -2.75 | 3.81 | 1 | — | -13.68 |
| gold.native-band-reentry-15-48-3-5 | 25000 | 3 | 20.79 | 21.10 | 18.99 | 10 | 2463.64 | -776.34 |
| gold.native-band-reentry-15-48-3-5 | 500 | 5 | -2.30 | -2.36 | 24.82 | 9 | 66.75 | -20.71 |
| gold.native-band-reentry-15-48-3-5 | 25000 | 5 | 33.08 | 33.42 | 29.70 | 10 | 4060.79 | -1328.71 |

## Gold Turbo corrected replay

Corrected 72-case replay is still running; no earlier over-margin rejection results are represented as final corrected results.

## What this evidence supports

Crypto trend pullback and the six-family combination are candidates for forward demo comparison; the combination improves participation in this November window, with substantial sampled drawdowns. ETH complementary is slower and does not satisfy a scalp offering. DOGE has only two decisions; LTC and the new compression prototype do not justify promotion. Gold Standard momentum/band rules merit demo comparison only where minimum executable volume fits; higher risk increases severe-loss exposure.

All five Turbo implementations remain available for development/demo qualification. A profitable arm or profitable aggregate does not validate every component. Do not promote losing components, increase risk to repair their entries, or advertise 20% sessions / monthly doubling. Fresh FX entry validation and multiple unseen chronological periods remain outstanding.

## Exact engineering improvements and remaining qualification

Implemented: closed-candle structure cache with per-tick developing-event reassessment; original-feature equality tested. Aggregate account and uncertain pending margin now consume the shared margin budget; lot size reduces to executable headroom and never rounds up beyond risk. Negative free margin is normalized only for protective management facts, while new entries still fail sizing. Research variants require the fake replay terminal, preserving production authorization and conservative defaults.

Functionally tested: 156 targeted Gold Turbo tests, nine Crypto accounting/execution invariant tests; 576 Crypto and 96 Gold Standard account cash audits. Corrected Turbo accounts audit once their full replay completes. No broad repository test suite or live broker session was run.

Historically evaluated: retained 16-family ledger; fresh November six-family Crypto OHLC screen; October three-family Gold Standard tick screen; corrected Turbo selected-session replay when receipts above exist. Profitability validated / commercially qualified: not established. Demo activation still requires native MT5 compilation, broker demo integration and recovery/partial-fill checks; venue-specific Crypto order handling; confirmed subscriptions, provider secrets and Telegram setup. No live or paid activation.

Reproduce: restore the source archive, prepare Crypto input, bundle/run `crypto_validation_signals.ts`, then run `crypto_personal_screen.py`. Scripts retain exact source hashes and period boundaries. Gold uses the previously preserved October tick archive; no duplicate download. Read `experiment.json`, `data-index.json`, `crypto-source-data.json`, summaries and compressed receipts for all case settings.
