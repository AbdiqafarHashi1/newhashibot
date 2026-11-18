# Personal growth and participation experiment

All comparisons reuse saved cost-inclusive account ledgers. No candle downloads, live account changes, strategy edits or Prop risk changes. This is exploratory research on previously examined history, not a fresh holdout. Training selection maximizes return after extra 0.10R/trade cost, with at least eight entries and no positions left open; **no drawdown penalty**. Singles, pairs, triples and the complete covered universe are searched; all trials are retained in growth-results.json.gz. Each later row is an independent $10,000 flat-start account; periods overlap and must not be compounded together.

| Cohort (days) | Risk / capacity | Entries | Return % | Realized DD % | Extra 0.10R return % | End-open |
|---|---|---:|---:|---:|---:|---:|
| FX_GOLD_2025 (92) | CURRENT | 60 | 8.46 | 7.05 | -0.82 | 0 |
| FX_GOLD_2025 (92) | 2% existing caps | 42 | 6.21 | 14.23 | -9.75 | 0 |
| FX_GOLD_2025 (92) | 5% existing caps | 0 | 0.00 | 0.00 | 0.00 | 0 |
| FX_GOLD_2025 (92) | 2% growth / 20x margin | 43 | 8.76 | 14.72 | -0.20 | 0 |
| FX_GOLD_2025 (92) | 2% growth / 100x margin | 62 | 20.11 | 12.42 | 6.25 | 0 |
| FX_GOLD_2025 (92) | 5% growth / 20x margin | 12 | 4.65 | 20.10 | -1.45 | 0 |
| FX_GOLD_2025 (92) | 5% growth / 100x margin | 53 | 17.76 | 35.73 | -9.77 | 0 |
| CRYPTO_2025 (62) | CURRENT | 28 | 6.98 | 4.97 | 3.42 | 0 |
| CRYPTO_2025 (62) | 2% existing caps | 13 | 10.82 | 4.42 | 8.15 | 0 |
| CRYPTO_2025 (62) | 5% existing caps | 0 | 0.00 | 0.00 | 0.00 | 0 |
| CRYPTO_2025 (62) | 2% growth / 3x margin | 27 | 13.19 | 4.42 | 7.59 | 0 |
| CRYPTO_2025 (62) | 2% growth / 15x margin | 35 | 16.41 | 6.86 | 8.92 | 0 |
| CRYPTO_2025 (62) | 5% growth / 3x margin | 13 | -7.82 | 30.45 | -12.85 | 0 |
| CRYPTO_2025 (62) | 5% growth / 15x margin | 33 | 39.38 | 16.50 | 19.38 | 0 |
| CRYPTO_2026 (46) | CURRENT | 13 | 2.20 | 2.93 | 1.56 | 0 |
| CRYPTO_2026 (46) | 2% existing caps | 11 | 3.39 | 5.08 | 1.24 | 0 |
| CRYPTO_2026 (46) | 5% existing caps | 0 | 0.00 | 0.00 | 0.00 | 0 |
| CRYPTO_2026 (46) | 2% growth / 3x margin | 9 | -0.94 | 6.32 | -2.61 | 0 |
| CRYPTO_2026 (46) | 2% growth / 15x margin | 13 | 5.58 | 4.80 | 2.99 | 0 |
| CRYPTO_2026 (46) | 5% growth / 3x margin | 9 | 8.14 | 10.21 | 3.92 | 0 |
| CRYPTO_2026 (46) | 5% growth / 15x margin | 13 | 13.31 | 11.73 | 6.50 | 0 |
| GOLD_2026 (119) | CURRENT | 116 | -10.47 | 13.72 | -13.68 | 0 |
| GOLD_2026 (119) | 2% existing caps | 100 | -1.34 | 18.64 | -13.58 | 0 |
| GOLD_2026 (119) | 5% existing caps | 0 | 0.00 | 0.00 | 0.00 | 0 |
| GOLD_2026 (119) | 2% growth / 20x margin | 108 | -9.63 | 32.68 | -27.23 | 0 |
| GOLD_2026 (119) | 2% growth / 100x margin | 116 | -11.43 | 33.27 | -29.81 | 0 |
| GOLD_2026 (119) | 5% growth / 20x margin | 13 | 1.64 | 14.48 | -4.78 | 0 |
| GOLD_2026 (119) | 5% growth / 100x margin | 104 | -49.35 | 60.03 | -60.90 | 0 |
| GOLD_2026 / prior activity gate (119) | 2% growth / 100x margin | 29 | 28.66 | 8.44 | 21.46 | 0 |
| GOLD_2026 / prior activity gate (119) | 5% growth / 100x margin | 29 | 77.40 | 20.40 | 53.77 | 0 |

## What changed in the experiment

Existing-cap rows fix risk at 2% or 5% but retain 6% portfolio / 3% correlated caps, 4% realized daily stop and 18% realized peak halt. A 5% entry cannot fit a 3% correlated cap; zero admissions demonstrate that incompatibility, not zero strategy opportunity. Growth rows explicitly vary those **Personal-only research** constraints: 2% uses 8% portfolio / 6% correlated / 8% daily / 40% peak; 5% uses 15% portfolio / 10% correlated / 15% daily / 60% peak. These thresholds are realized-entry locks, not guaranteed maximum losses: simultaneous open losses can overshoot. All retain one position per symbol, original costs and a 0.75x weekend crypto risk multiplier. Growth permits all covered crypto symbols on weekends. FX entries still respect existing weekend restrictions; Personal positions retain their original source exits.

Leverage only changes admission through margin: planned notional = account stop-risk × entry / absolute(entry − original stop); used margin = sum of entry notionals / stated leverage, limited to 50% of current realized balance. This is a linear margin sensitivity, **not a venue liquidation simulation**: no cross-margin netting, contract rounding, mark-price maintenance margin or floating-equity path is reconstructed. Crypto includes an ETH spot-reference ledger; leverage on it is hypothetical exposure financing, not a verified perpetual fill. Entry plans supply geometry for 1159/1159 source trades; missing geometry rejects admission. Higher leverage does not multiply PnL on an unchanged position.

## Admission attribution and frozen baskets

| Cohort / profile | Selected strategies | Blocked entries by reason | Same basket at current risk: return / DD % |
|---|---|---|---:|
| FX_GOLD_2025 / CURRENT | forex.native-band-reentry-60-12-2-5, forex.native-sweep-retest-60-16-2-5-usdjpy-h72, gold.native-momentum-60-24-2-5 | SYMBOL_LOCK: 18; CORRELATED_RISK_CAPACITY_EXCEEDED: 2 | 8.46 / 7.05 |
| FX_GOLD_2025 / 2% existing caps | forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-squeeze-15-48-2-3-usdjpy-h12, gold.native-momentum-60-24-2-5 | CORRELATED_RISK_CAPACITY_EXCEEDED: 27; EXPERIMENT_DAILY_HALT: 1 | 2.22 / 8.57 |
| FX_GOLD_2025 / 5% existing caps | gold.native-momentum-15-48-2-5, gold.native-momentum-60-24-2-5, gold.native-band-reentry-15-48-3-5, forex.native-band-reentry-60-12-2-5, forex.native-sweep-retest-60-16-2-5-usdjpy-h72, forex.native-squeeze-15-48-2-3-usdjpy-h12, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.complementary-ema-pullback | CORRELATED_RISK_CAPACITY_EXCEEDED: 232 | 10.95 / 7.61 |
| FX_GOLD_2025 / 2% growth / 20x margin | forex.native-band-reentry-60-12-2-5, forex.native-sweep-retest-60-16-2-5-usdjpy-h72, gold.native-momentum-60-24-2-5 | SYMBOL_LOCK: 16; MARGIN_CAPACITY: 21 | 8.46 / 7.05 |
| FX_GOLD_2025 / 2% growth / 100x margin | forex.native-band-reentry-60-12-2-5, forex.native-sweep-retest-60-16-2-5-usdjpy-h72, gold.native-momentum-60-24-2-5 | SYMBOL_LOCK: 18 | 8.46 / 7.05 |
| FX_GOLD_2025 / 5% growth / 20x margin | forex.native-band-reentry-60-12-2-5, gold.native-momentum-60-24-2-5 | MARGIN_CAPACITY: 38 | 6.34 / 8.46 |
| FX_GOLD_2025 / 5% growth / 100x margin | forex.native-band-reentry-60-12-2-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-sweep-retest-60-16-2-5-usdjpy-h72 | SYMBOL_LOCK: 18 | 1.97 / 7.71 |
| CRYPTO_2025 / CURRENT | crypto.complementary-ema-pullback, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | WEEKEND_ENTRY: 3; CORRELATED_RISK_CAPACITY_EXCEEDED: 4 | 6.98 / 4.97 |
| CRYPTO_2025 / 2% existing caps | crypto.complementary-ema-pullback | none | 2.59 / 3.54 |
| CRYPTO_2025 / 5% existing caps | crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.launch-rsi2-48-3-3-h72, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006, crypto.complementary-ema-pullback | CORRELATED_RISK_CAPACITY_EXCEEDED: 102; WEEKEND_ENTRY: 18 | 12.20 / 5.31 |
| CRYPTO_2025 / 2% growth / 3x margin | crypto.complementary-ema-pullback, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | MARGIN_CAPACITY: 8 | 6.98 / 4.97 |
| CRYPTO_2025 / 2% growth / 15x margin | crypto.complementary-ema-pullback, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | none | 6.98 / 4.97 |
| CRYPTO_2025 / 5% growth / 3x margin | crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.launch-rsi2-48-3-3-h72, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006, crypto.complementary-ema-pullback | MARGIN_CAPACITY: 51; SYMBOL_LOCK: 12; CORRELATED_RISK_CAPACITY_EXCEEDED: 44 | 12.20 / 5.31 |
| CRYPTO_2025 / 5% growth / 15x margin | crypto.complementary-ema-pullback, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | CORRELATED_RISK_CAPACITY_EXCEEDED: 2 | 6.98 / 4.97 |
| CRYPTO_2026 / CURRENT | crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | SYMBOL_LOCK: 1 | 2.20 / 2.93 |
| CRYPTO_2026 / 2% existing caps | crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | SYMBOL_LOCK: 1; CORRELATED_RISK_CAPACITY_EXCEEDED: 2 | 2.20 / 2.93 |
| CRYPTO_2026 / 5% existing caps | crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006, crypto.complementary-ema-pullback | CORRELATED_RISK_CAPACITY_EXCEEDED: 60; WEEKEND_ENTRY: 12 | 1.94 / 7.66 |
| CRYPTO_2026 / 2% growth / 3x margin | crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | MARGIN_CAPACITY: 4; SYMBOL_LOCK: 1 | 2.20 / 2.93 |
| CRYPTO_2026 / 2% growth / 15x margin | crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | SYMBOL_LOCK: 1 | 2.20 / 2.93 |
| CRYPTO_2026 / 5% growth / 3x margin | crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006, crypto.complementary-ema-pullback | MARGIN_CAPACITY: 13; CORRELATED_RISK_CAPACITY_EXCEEDED: 38; SYMBOL_LOCK: 12 | 1.94 / 7.66 |
| CRYPTO_2026 / 5% growth / 15x margin | crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | SYMBOL_LOCK: 1 | 2.20 / 2.93 |
| GOLD_2026 / CURRENT | forex.complementary-ema-pullback, gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | SYMBOL_LOCK: 53 | -10.47 / 13.72 |
| GOLD_2026 / 2% existing caps | forex.complementary-ema-pullback, gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | SYMBOL_LOCK: 41; EXPERIMENT_DAILY_HALT: 15; EXPERIMENT_PEAK_HALT: 13 | -10.47 / 13.72 |
| GOLD_2026 / 5% existing caps | gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96, forex.complementary-ema-pullback | CORRELATED_RISK_CAPACITY_EXCEEDED: 169 | -10.47 / 13.72 |
| GOLD_2026 / 2% growth / 20x margin | forex.complementary-ema-pullback, gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | SYMBOL_LOCK: 53; MARGIN_CAPACITY: 8 | -10.47 / 13.72 |
| GOLD_2026 / 2% growth / 100x margin | forex.complementary-ema-pullback, gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | SYMBOL_LOCK: 53 | -10.47 / 13.72 |
| GOLD_2026 / 5% growth / 20x margin | gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | MARGIN_CAPACITY: 134; SYMBOL_LOCK: 9 | -4.69 / 12.69 |
| GOLD_2026 / 5% growth / 100x margin | forex.complementary-ema-pullback, gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96 | SYMBOL_LOCK: 48; EXPERIMENT_PEAK_HALT: 17 | -10.47 / 13.72 |
| GOLD_2026 / prior activity gate / 2% growth / 100x margin | gold.rsi-trailing-15-48-1.5-5-h96 | none | 8.88 / 5.60 |
| GOLD_2026 / prior activity gate / 5% growth / 100x margin | gold.rsi-trailing-15-48-1.5-5-h96 | none | 8.88 / 5.60 |

## Signal subscriber sensitivity

Flat 1% stop-risk, maximum 3% combined open risk, one position per symbol, all covered VIP-eligible configurations; 0.75x weekend crypto multiplier retained. No one-trade-per-day quota or account House-Money throttle. This is an independent subscriber sizing model, not a change to VIP footer recommendations. Source trades remain account-admitted, so this is not a count of every actual Telegram alert.

| Cohort | Covered VIP configs | Days | Entries | Return % | Realized DD % | End-open |
|---|---:|---:|---:|---:|---:|---:|
| FX_GOLD_2025 | 7 | 92 | 108 | 32.66 | 8.81 | 0 |
| CRYPTO_2025 | 5 | 62 | 34 | 2.71 | 7.44 | 0 |
| CRYPTO_2026 | 5 | 46 | 22 | 15.00 | 3.30 | 0 |
| GOLD_2026 | 2 | 119 | 90 | 19.04 | 6.73 | 0 |

The additional Gold activity-gate rows reuse the previously frozen ENTRY_QUALITY selection after viewing this growth experiment; they are post-result sensitivities, not independent validation. They preserve the earlier selected strategy and rule, rather than selecting a new winner on the later period.

## Interpretation limits

DD and return are realized-close only; end-open rows are provisional and exclude unknown terminal marks. There are no liquidation/account-survival claims. Stops do not cap gap losses. Source ledgers already exclude entries rejected by their original account replay; widening this replay cannot recreate those missing fills. Saved watch outcomes are reference lifecycle outcomes, not interchangeable provider executions. Raw opportunity frequency and scalable venue capacity are therefore not established here. Higher-risk gains are position sizing, not improved strategy expectancy. A $500 account needs 20% per 30 days just to cover a $100 subscription before any net profit; total multi-month returns must not be marketed as monthly returns. Prop retains the previously reported results and unchanged constraints; this study adds no evidence of faster challenge passing.

Reproduce: `node --import tsx scripts/research/focused-portfolio/growth.ts`.
