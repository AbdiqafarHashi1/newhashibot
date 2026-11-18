# All-configuration expansion audit

All 16 earlier configurations are replayed individually at 1%, 2% and 5% stop-risk on every fully covered later cohort. No drawdown-based ranking, return-only cherry-picking or new candle download. Later histories were already examined: this is a sensitivity audit, not untouched out-of-sample evidence. Original source account admission still limits participation. Profiles use 15x crypto / 100x FX margin capacity, 50% entry margin budget, same-symbol lock and 0.75x weekend crypto; 2% uses 8% daily / 40% peak entry locks, 5% uses 15% / 60%. 1% uses the 2% budget for a sizing-only comparator. Open-position and intratrade losses are not marked; realized DD can understate actual loss. ETH complementary remains a spot-reference source under hypothetical leverage.

| Strategy / rule | Risk % | Later period | Entries | Return % | Realized DD % | Extra cost return % | Drop best return % | End-open |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| crypto.launch-trend-pullback-48-1.5-5 / all | 1 | 2025_CRYPTO (62d) | 29 | 19.33 | 9.07 | 16.12 | 14.17 | 0 |
| crypto.launch-trend-pullback-48-1.5-5 / all | 1 | 2026_CRYPTO (46d) | 19 | 20.72 | 11.90 | 18.58 | 14.91 | 0 |
| crypto.launch-trend-pullback-48-1.5-5 / all | 2 | 2025_CRYPTO (62d) | 23 | 16.46 | 14.06 | 11.46 | 16.30 | 0 |
| crypto.launch-trend-pullback-48-1.5-5 / all | 2 | 2026_CRYPTO (46d) | 17 | 33.58 | 20.74 | 29.39 | 21.19 | 0 |
| crypto.launch-trend-pullback-48-1.5-5 / all | 5 | 2025_CRYPTO (62d) | 16 | 47.42 | 24.20 | 36.82 | 16.92 | 0 |
| crypto.launch-trend-pullback-48-1.5-5 / all | 5 | 2026_CRYPTO (46d) | 13 | 79.35 | 34.14 | 69.25 | 41.74 | 0 |
| gold.native-momentum-15-48-2-5 / all | 1 | 2025_FX (92d) | 62 | 24.47 | 7.76 | 17.01 | 18.80 | 0 |
| gold.native-momentum-15-48-2-5 / all | 2 | 2025_FX (92d) | 62 | 50.17 | 14.99 | 32.73 | 37.08 | 0 |
| gold.native-momentum-15-48-2-5 / all | 5 | 2025_FX (92d) | 62 | 122.81 | 33.83 | 63.67 | 79.87 | 0 |
| gold.native-momentum-60-24-2-5 / all | 1 | 2025_FX (92d) | 24 | 4.04 | 4.29 | 1.58 | -0.15 | 0 |
| gold.native-momentum-60-24-2-5 / all | 2 | 2025_FX (92d) | 24 | 7.58 | 8.63 | 2.54 | -0.77 | 0 |
| gold.native-momentum-60-24-2-5 / all | 5 | 2025_FX (92d) | 24 | 14.85 | 21.73 | 1.87 | -5.10 | 0 |
| gold.native-band-reentry-15-48-3-5 / all | 1 | 2025_FX (92d) | 31 | 10.35 | 9.31 | 6.99 | 5.31 | 0 |
| gold.native-band-reentry-15-48-3-5 / all | 2 | 2025_FX (92d) | 31 | 20.09 | 17.84 | 12.90 | 9.61 | 0 |
| gold.native-band-reentry-15-48-3-5 / all | 5 | 2025_FX (92d) | 31 | 43.58 | 39.28 | 23.05 | 15.87 | 0 |
| forex.native-band-reentry-60-12-2-5 / all | 1 | 2025_FX (92d) | 26 | 4.00 | 6.16 | 1.33 | -0.66 | 0 |
| forex.native-band-reentry-60-12-2-5 / all | 2 | 2025_FX (92d) | 26 | 7.20 | 12.00 | 1.77 | -1.99 | 0 |
| forex.native-band-reentry-60-12-2-5 / all | 5 | 2025_FX (92d) | 26 | 11.78 | 27.74 | -1.87 | -9.45 | 0 |
| forex.native-sweep-retest-60-16-2-5-usdjpy-h72 / all | 1 | 2025_FX (92d) | 30 | 0.45 | 8.38 | -2.52 | -4.45 | 0 |
| forex.native-sweep-retest-60-16-2-5-usdjpy-h72 / all | 2 | 2025_FX (92d) | 30 | -0.33 | 16.15 | -6.14 | -9.61 | 0 |
| forex.native-sweep-retest-60-16-2-5-usdjpy-h72 / all | 5 | 2025_FX (92d) | 30 | -8.89 | 36.23 | -21.70 | -26.15 | 0 |
| forex.native-squeeze-15-48-2-3-usdjpy-h12 / all | 1 | 2025_FX (92d) | 31 | 3.63 | 4.25 | 0.47 | 0.75 | 0 |
| forex.native-squeeze-15-48-2-3-usdjpy-h12 / all | 2 | 2025_FX (92d) | 31 | 7.00 | 8.36 | 0.57 | 1.22 | 0 |
| forex.native-squeeze-15-48-2-3-usdjpy-h12 / all | 5 | 2025_FX (92d) | 30 | 9.12 | 19.92 | -6.10 | -4.52 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 1 | 2025_CRYPTO (62d) | 31 | 8.16 | 6.96 | 5.03 | 5.10 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 1 | 2026_CRYPTO (46d) | 21 | 13.13 | 9.32 | 10.97 | 9.92 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 2 | 2025_CRYPTO (62d) | 25 | 8.40 | 15.07 | 3.41 | 8.79 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 2 | 2026_CRYPTO (46d) | 17 | 18.91 | 14.22 | 15.36 | 12.40 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 5 | 2025_CRYPTO (62d) | 18 | -4.90 | 26.80 | -12.78 | -8.29 | 0 |
| crypto.launch-trend-pullback-48-2-3-h72 / all | 5 | 2026_CRYPTO (46d) | 13 | 19.50 | 29.68 | 12.76 | 13.65 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 1 | 2025_CRYPTO (62d) | 25 | 6.75 | 7.05 | 4.38 | 3.63 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 1 | 2026_CRYPTO (46d) | 18 | 0.42 | 4.48 | -1.20 | -1.69 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 2 | 2025_CRYPTO (62d) | 17 | 14.77 | 10.12 | 11.43 | 6.68 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 2 | 2026_CRYPTO (46d) | 15 | -0.48 | 8.89 | -3.17 | -4.48 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 5 | 2025_CRYPTO (62d) | 10 | 31.28 | 15.74 | 26.06 | 9.69 | 0 |
| crypto.launch-rsi2-48-3-3-h72 / all | 5 | 2026_CRYPTO (46d) | 10 | 2.14 | 12.09 | -2.40 | 0.50 | 0 |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 / all | 1 | 2026_CRYPTO (46d) | 6 | -0.97 | 1.34 | -1.56 | -1.69 | 0 |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 / all | 2 | 2026_CRYPTO (46d) | 6 | -1.96 | 2.70 | -3.13 | -3.37 | 0 |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 / all | 5 | 2026_CRYPTO (46d) | 6 | -5.03 | 6.80 | -7.87 | -8.37 | 0 |
| forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 / all | 1 | 2025_FX (92d) | 15 | 0.69 | 4.00 | -0.81 | -1.44 | 0 |
| forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 / all | 2 | 2025_FX (92d) | 15 | 1.22 | 7.88 | -1.77 | -2.97 | 0 |
| forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 / all | 5 | 2025_FX (92d) | 15 | 1.86 | 18.78 | -5.52 | -8.05 | 0 |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 / all | 1 | 2025_CRYPTO (62d) | 22 | 2.74 | 3.05 | 0.59 | 1.32 | 0 |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 / all | 2 | 2025_CRYPTO (62d) | 22 | 5.39 | 6.05 | 1.01 | 2.55 | 0 |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 / all | 5 | 2025_CRYPTO (62d) | 22 | 12.60 | 14.71 | 1.27 | 5.33 | 0 |
| gold.frontier-compression-15-24-1.5-5-h96 / all | 1 | 2026_GOLD (119d) | 57 | 3.72 | 8.46 | -2.02 | -1.28 | 0 |
| gold.frontier-compression-15-24-1.5-5-h96 / all | 2 | 2026_GOLD (119d) | 57 | 5.07 | 16.43 | -6.26 | -4.60 | 0 |
| gold.frontier-compression-15-24-1.5-5-h96 / all | 5 | 2026_GOLD (119d) | 57 | -4.05 | 39.28 | -28.00 | -23.45 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / all | 1 | 2026_GOLD (119d) | 99 | 15.47 | 9.69 | 4.60 | 9.99 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / all | 2 | 2026_GOLD (119d) | 99 | 30.08 | 18.63 | 6.74 | 18.29 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / all | 5 | 2026_GOLD (119d) | 99 | 61.41 | 41.28 | -1.64 | 36.84 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / active-volume | 1 | 2026_GOLD (119d) | 29 | 13.88 | 4.26 | 10.63 | 10.05 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / active-volume | 2 | 2026_GOLD (119d) | 29 | 28.66 | 8.44 | 21.46 | 20.28 | 0 |
| gold.rsi-trailing-15-48-1.5-5-h96 / active-volume | 5 | 2026_GOLD (119d) | 29 | 77.40 | 20.40 | 53.77 | 51.10 | 0 |
| crypto.complementary-ema-pullback / all | 1 | 2025_CRYPTO (62d) | 13 | 5.41 | 2.22 | 4.13 | 3.42 | 0 |
| crypto.complementary-ema-pullback / all | 1 | 2026_CRYPTO (46d) | 7 | 3.84 | 1.28 | 3.17 | 1.90 | 0 |
| crypto.complementary-ema-pullback / all | 2 | 2025_CRYPTO (62d) | 13 | 10.82 | 4.42 | 8.15 | 6.71 | 0 |
| crypto.complementary-ema-pullback / all | 2 | 2026_CRYPTO (46d) | 7 | 7.69 | 2.55 | 6.31 | 3.81 | 0 |
| crypto.complementary-ema-pullback / all | 5 | 2025_CRYPTO (62d) | 13 | 26.79 | 10.87 | 19.35 | 15.65 | 0 |
| crypto.complementary-ema-pullback / all | 5 | 2026_CRYPTO (46d) | 7 | 19.27 | 6.35 | 15.55 | 9.08 | 0 |
| forex.complementary-ema-pullback / all | 1 | 2025_FX (92d) | 13 | -5.83 | 7.10 | -7.06 | -7.64 | 0 |
| forex.complementary-ema-pullback / all | 1 | 2026_GOLD (119d) | 13 | -1.02 | 4.18 | -2.30 | -2.93 | 0 |
| forex.complementary-ema-pullback / all | 2 | 2025_FX (92d) | 13 | -11.49 | 13.76 | -13.79 | -14.83 | 0 |
| forex.complementary-ema-pullback / all | 2 | 2026_GOLD (119d) | 13 | -2.20 | 8.28 | -4.72 | -5.90 | 0 |
| forex.complementary-ema-pullback / all | 5 | 2025_FX (92d) | 13 | -27.35 | 31.34 | -32.05 | -33.83 | 0 |
| forex.complementary-ema-pullback / all | 5 | 2026_GOLD (119d) | 13 | -6.66 | 20.06 | -12.58 | -15.01 | 0 |

## Earlier 14-configuration subscriber risk sensitivity

3 concurrent stop-risk units maximum and one open position per symbol; this includes margin admission and the risk-profile daily/peak entry locks, not forced broker liquidations. These are scenario risks rather than recommendations for subscribers. Each account starts independently at $10,000.

| Cohort | Risk % | Days | Entries | Return % | Realized DD % | Extra cost return % |
|---|---:|---:|---:|---:|---:|---:|
| 2025_FX | 1 | 92 | 108 | 32.66 | 8.81 | 19.16 |
| 2025_FX | 2 | 92 | 108 | 69.03 | 16.98 | 36.49 |
| 2025_FX | 5 | 92 | 104 | 225.52 | 40.00 | 57.53 |
| 2025_CRYPTO | 1 | 62 | 34 | 2.71 | 7.44 | -0.35 |
| 2025_CRYPTO | 2 | 62 | 34 | 4.79 | 14.40 | -1.33 |
| 2025_CRYPTO | 5 | 62 | 34 | 7.35 | 32.69 | -13.60 |
| 2026_CRYPTO | 1 | 46 | 22 | 15.00 | 3.30 | 12.76 |
| 2026_CRYPTO | 2 | 46 | 22 | 30.27 | 6.61 | 25.34 |
| 2026_CRYPTO | 5 | 46 | 21 | 81.78 | 16.60 | 66.20 |
| 2026_GOLD | 1 | 119 | 90 | 19.04 | 6.73 | 8.80 |
| 2026_GOLD | 2 | 119 | 90 | 38.70 | 13.13 | 15.90 |
| 2026_GOLD | 5 | 119 | 90 | 94.15 | 30.35 | 23.91 |

The active-volume Gold rows are the same previously investigated volume >= 1 rule; they are not fresh validation. Drop-best removes the largest admitted cash winner then reruns admission, which can change later sizing and eligibility. Fees are included in source net R with extra stress deducting 0.10R/trade. No return is annualized or presented as a monthly forecast. Reproduce: `node --import tsx scripts/research/focused-portfolio/expansion.ts`.

## New eight-configuration product lineup

Roster selected after inspecting the preceding historical diagnostics; this table reuses those histories and is not independent validation. Coverage is aligned per row; unavailable engines are excluded explicitly, never filled across gaps. Gold applies its original saved volume >= 1 entry overlay. No one-entry-per-day quota. Risk and margin profiles match the study, while actual demo authorization can reduce or block entries on fresh provider evidence.

| Cohort | Covered / 8 IDs | Risk % | Entries | Return % | Realized DD % | Extra cost return % | Drop best return % |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2025_FX | 3 | 1 | 92 | 28.20 | 7.89 | 16.98 | 20.96 |
| 2025_FX | 3 | 2 | 92 | 59.47 | 15.27 | 32.86 | 42.09 |
| 2025_FX | 3 | 5 | 85 | 215.32 | 36.85 | 107.57 | 151.90 |
| 2025_CRYPTO | 4 | 1 | 57 | 20.10 | 9.96 | 13.86 | 18.01 |
| 2025_CRYPTO | 4 | 2 | 43 | 6.81 | 15.00 | -1.66 | 3.18 |
| 2025_CRYPTO | 4 | 5 | 30 | 31.30 | 31.65 | 14.12 | 22.18 |
| 2026_CRYPTO | 3 | 1 | 28 | 17.13 | 12.52 | 14.16 | 14.82 |
| 2026_CRYPTO | 3 | 2 | 23 | 33.74 | 17.12 | 28.34 | 26.73 |
| 2026_CRYPTO | 3 | 5 | 16 | 99.68 | 29.88 | 85.92 | 79.01 |
| 2026_GOLD | 1 | 1 | 29 | 13.88 | 4.26 | 10.63 | 10.05 |
| 2026_GOLD | 1 | 2 | 29 | 28.66 | 8.44 | 21.46 | 20.28 |
| 2026_GOLD | 1 | 5 | 29 | 77.40 | 20.40 | 53.77 | 51.10 |

## Crypto Personal default: primary trend engine across its ten approved symbols

The wider four-engine Crypto basket at 2% failed added-cost stress in 2025. Therefore Personal defaults use the primary 1.5 ATR / 5R trend engine; the other engines remain VIP sources and optional Admin comparisons. This is a post-audit deployment choice, not a new holdout claim.

| Cohort | Risk % | Entries | Return % | Realized DD % | Extra cost return % |
|---|---:|---:|---:|---:|---:|
| 2025_CRYPTO | 1 | 29 | 19.33 | 9.07 | 16.12 |
| 2025_CRYPTO | 2 | 23 | 16.46 | 14.06 | 11.46 |
| 2025_CRYPTO | 5 | 16 | 47.42 | 24.20 | 36.82 |
| 2026_CRYPTO | 1 | 19 | 20.72 | 11.90 | 18.58 |
| 2026_CRYPTO | 2 | 17 | 33.58 | 20.74 | 29.39 |
| 2026_CRYPTO | 5 | 13 | 79.35 | 34.14 | 69.25 |
