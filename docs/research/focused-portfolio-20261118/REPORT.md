> Historical comparison. Current product wiring and the subsequent expansion audit are documented in [DEPLOYMENT.md](DEPLOYMENT.md) and [EXPANSION.md](EXPANSION.md). The earlier ETH/DOGE shortcut has been retired.

# Focused portfolio comparison — 18 November 2026

Saved-ledger research only. ENTRY_QUALITY is an explicitly exploratory extension performed after the BASKET results were inspected. It adds only information already recorded at entry, with fixed feature thresholds; later source periods are not fresh holdouts. No candle downloads or changes to live strategy selection, risk or execution. Full source coverage is aligned within each cohort before comparing baskets. Single strategies, pairs and triples are selected using training outcomes only; later outcomes are reported without replacing losing winners. The later data was previously researched and is **not an untouched holdout**.

Training/test periods: FX_GOLD_2025: 2025-04-01 (61d) / 2025-06-01 (92d); CRYPTO_2025: 2025-05-01 (61d) / 2025-07-01 (62d); CRYPTO_2026: 2026-08-01 (46d) / 2026-09-16 (46d); GOLD_2026: 2026-05-05 (57d) / 2026-07-05 (119d).

Returns are total interval realized-close returns, not monthly forecasts. Each cell belongs to its own $10,000 account. DD excludes open/intratrade losses. Stress deducts an additional 0.10R per closed trade; drop-best removes the highest realized cash winner actually admitted by that account, then reruns admission. Cost drag/removal can alter risk locks and subsequent admissions, so their effects need not be monotonic. Baselines retain the same eligible source coverage and default Prop exclusions.

| Cohort | Tier | Selected / available | Validation entries | Baseline return % | Baseline DD % | Focused return % | Realized DD % | +0.10R drag return % | Drop-best return % | Unpriced/end-open | Assessment |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BASKET / FX_GOLD_2025 | PERSONAL | 3 / 8 | 64 | 10.95 | 7.61 | 2.04 | 5.40 | -6.95 | -1.60 | 0/0 | DID_NOT_SURVIVE |
| BASKET / FX_GOLD_2025 | PROP_CHALLENGE_PASS | 3 / 8 | 57 | N/A | N/A | N/A | N/A | N/A | N/A | 1/0 | UNPRICED_FRIDAY |
| BASKET / FX_GOLD_2025 | PROP_FUNDED_INCOME | 3 / 8 | 65 | N/A | N/A | N/A | N/A | N/A | N/A | 1/0 | UNPRICED_FRIDAY |
| BASKET / CRYPTO_2025 | PERSONAL | 2 / 5 | 28 | 12.20 | 5.31 | 6.98 | 4.97 | 3.42 | 2.15 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| BASKET / CRYPTO_2025 | PROP_CHALLENGE_PASS | 2 / 5 | 23 | 9.71 | 2.22 | 1.41 | 2.61 | 0.44 | 1.38 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| BASKET / CRYPTO_2025 | PROP_FUNDED_INCOME | 1 / 5 | 13 | 8.38 | 1.49 | 2.43 | 1.00 | 1.87 | 1.79 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| BASKET / CRYPTO_2026 | PERSONAL | 2 / 5 | 13 | 1.94 | 7.66 | 2.20 | 2.93 | 1.56 | 0.82 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| BASKET / CRYPTO_2026 | PROP_CHALLENGE_PASS | 3 / 5 | 13 | 1.56 | 4.18 | -3.12 | 3.43 | -3.84 | -3.64 | 0/0 | DID_NOT_SURVIVE |
| BASKET / CRYPTO_2026 | PROP_FUNDED_INCOME | 2 / 5 | 13 | 2.84 | 3.28 | 1.48 | 0.87 | 0.97 | 0.62 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| BASKET / GOLD_2026 | PERSONAL | 2 / 3 | 120 | -10.47 | 13.72 | -4.69 | 12.69 | -11.50 | -7.96 | 0/0 | DID_NOT_SURVIVE |
| BASKET / GOLD_2026 | PROP_CHALLENGE_PASS | — / 1 | — | — | — | — | — | — | — | — | NO_TRAINING_CANDIDATE |
| BASKET / GOLD_2026 | PROP_FUNDED_INCOME | — / 1 | — | — | — | — | — | — | — | — | NO_TRAINING_CANDIDATE |
| ENTRY_QUALITY / FX_GOLD_2025 | PERSONAL | 3 / 8 | 64 | 10.95 | 7.61 | 2.04 | 5.40 | -6.95 | -1.60 | 0/0 | DID_NOT_SURVIVE |
| ENTRY_QUALITY / FX_GOLD_2025 | PROP_CHALLENGE_PASS | 3 / 8 | 57 | N/A | N/A | N/A | N/A | N/A | N/A | 1/0 | UNPRICED_FRIDAY |
| ENTRY_QUALITY / FX_GOLD_2025 | PROP_FUNDED_INCOME | 3 / 8 | 50 | N/A | N/A | 3.61 | 2.52 | 1.97 | 2.02 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| ENTRY_QUALITY / CRYPTO_2025 | PERSONAL | 1 / 5 | 12 | 12.20 | 5.31 | 2.57 | 2.41 | 2.79 | 0.63 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| ENTRY_QUALITY / CRYPTO_2025 | PROP_CHALLENGE_PASS | 2 / 5 | 23 | 9.71 | 2.22 | 1.95 | 2.73 | 1.23 | 0.22 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| ENTRY_QUALITY / CRYPTO_2025 | PROP_FUNDED_INCOME | 1 / 5 | 12 | 8.38 | 1.49 | 1.80 | 1.00 | 1.28 | 1.17 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| ENTRY_QUALITY / CRYPTO_2026 | PERSONAL | 3 / 5 | 15 | 1.94 | 7.66 | -1.49 | 2.87 | -2.79 | -4.14 | 0/0 | DID_NOT_SURVIVE |
| ENTRY_QUALITY / CRYPTO_2026 | PROP_CHALLENGE_PASS | 3 / 5 | 13 | 1.56 | 4.18 | -3.12 | 3.43 | -3.84 | -3.64 | 0/0 | DID_NOT_SURVIVE |
| ENTRY_QUALITY / CRYPTO_2026 | PROP_FUNDED_INCOME | 3 / 5 | 17 | 2.84 | 3.28 | -1.61 | 1.65 | -2.18 | -2.74 | 0/0 | DID_NOT_SURVIVE |
| ENTRY_QUALITY / GOLD_2026 | PERSONAL | 1 / 3 | 29 | -10.47 | 13.72 | 8.88 | 5.60 | 6.20 | 6.31 | 0/0 | SURVIVED_SOURCE_VALIDATION |
| ENTRY_QUALITY / GOLD_2026 | PROP_CHALLENGE_PASS | — / 1 | — | — | — | — | — | — | — | — | NO_TRAINING_CANDIDATE |
| ENTRY_QUALITY / GOLD_2026 | PROP_FUNDED_INCOME | — / 1 | — | — | — | — | — | — | — | — | NO_TRAINING_CANDIDATE |

## Frozen selections

- BASKET / FX_GOLD_2025 / PERSONAL [all]: forex.native-band-reentry-60-12-2-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, gold.native-momentum-60-24-2-5. 91/92 training candidates eligible.
- BASKET / FX_GOLD_2025 / PROP_CHALLENGE_PASS [all]: forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-squeeze-15-48-2-3-usdjpy-h12, gold.native-momentum-60-24-2-5. 51/92 training candidates eligible.
- BASKET / FX_GOLD_2025 / PROP_FUNDED_INCOME [all]: forex.native-band-reentry-60-12-2-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, gold.native-momentum-60-24-2-5. 61/92 training candidates eligible.
- BASKET / CRYPTO_2025 / PERSONAL [all]: crypto.complementary-ema-pullback, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006. 25/25 training candidates eligible.
- BASKET / CRYPTO_2025 / PROP_CHALLENGE_PASS [all]: crypto.launch-trend-pullback-48-1.5-5, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006. 25/25 training candidates eligible.
- BASKET / CRYPTO_2025 / PROP_FUNDED_INCOME [all]: crypto.complementary-ema-pullback. 25/25 training candidates eligible.
- BASKET / CRYPTO_2026 / PERSONAL [all]: crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 24/25 training candidates eligible.
- BASKET / CRYPTO_2026 / PROP_CHALLENGE_PASS [all]: crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 20/25 training candidates eligible.
- BASKET / CRYPTO_2026 / PROP_FUNDED_INCOME [all]: crypto.complementary-ema-pullback, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 24/25 training candidates eligible.
- BASKET / GOLD_2026 / PERSONAL [all]: gold.frontier-compression-15-24-1.5-5-h96, gold.rsi-trailing-15-48-1.5-5-h96. 6/7 training candidates eligible.
- ENTRY_QUALITY / FX_GOLD_2025 / PERSONAL [all]: forex.native-band-reentry-60-12-2-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, gold.native-momentum-60-24-2-5. 534/552 training candidates eligible.
- ENTRY_QUALITY / FX_GOLD_2025 / PROP_CHALLENGE_PASS [all]: forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-squeeze-15-48-2-3-usdjpy-h12, gold.native-momentum-60-24-2-5. 421/552 training candidates eligible.
- ENTRY_QUALITY / FX_GOLD_2025 / PROP_FUNDED_INCOME [higher-timeframe-aligned]: forex.native-band-reentry-60-12-2-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, gold.native-momentum-60-24-2-5. 439/552 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2025 / PERSONAL [normal-volatility]: crypto.complementary-ema-pullback. 116/150 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2025 / PROP_CHALLENGE_PASS [normal-volatility]: crypto.launch-trend-pullback-48-1.5-5, crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006. 114/150 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2025 / PROP_FUNDED_INCOME [normal-volatility]: crypto.complementary-ema-pullback. 114/150 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2026 / PERSONAL [normal-volatility]: crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 101/150 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2026 / PROP_CHALLENGE_PASS [all]: crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 89/150 training candidates eligible.
- ENTRY_QUALITY / CRYPTO_2026 / PROP_FUNDED_INCOME [normal-volatility]: crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006. 101/150 training candidates eligible.
- ENTRY_QUALITY / GOLD_2026 / PERSONAL [active-volume]: gold.rsi-trailing-15-48-1.5-5-h96. 36/42 training candidates eligible.

## Interpretation

A surviving source replay is a forward-demo candidate, not authorization to change customer presets or proof of prop compliance. A provisional/open/unpriced result is not treated as a completed portfolio return. Failure is retained in the table. The selection lock records every training candidate score and input hashes. Only rows whose selected return is at least baseline return and whose drawdown is lower count as a strict improvement; remaining survivors trade return for risk or merely stay positive. Existing confirmation, USD buckets, source costs and Friday policy remain intact. No additional opportunities, intratrade quotes or fills were invented.

## Strict improvement on later source data

- BASKET / CRYPTO_2026 / PERSONAL [all]: crypto.complementary-ema-pullback + crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006; 46 days; return 2.20% versus 1.94%, realized DD 2.93% versus 7.66%.
- ENTRY_QUALITY / GOLD_2026 / PERSONAL [active-volume]: gold.rsi-trailing-15-48-1.5-5-h96; 119 days; return 8.88% versus -10.47%, realized DD 5.60% versus 13.72%.

## Fee sensitivity for positive completed source replays

Hypothetical $100 per 30 days, pro-rated across each validation interval. No payout split, tax, challenge fee or capital withdrawal is modeled. These are arithmetic sensitivities, not recommended deposits or forecasts. All source costs remain included. A positive strategy return does not automatically cover the subscription on a small account.

| Cohort / tier | Days | Gross return % | Software fee $ | Net $ at $10,000 | Net $ at $25,000 |
|---|---:|---:|---:|---:|---:|
| BASKET / CRYPTO_2025 / PERSONAL | 62 | 6.98 | 206.67 | 491.41 | 1538.54 |
| BASKET / CRYPTO_2025 / PROP_CHALLENGE_PASS | 62 | 1.41 | 206.67 | -65.33 | 146.68 |
| BASKET / CRYPTO_2025 / PROP_FUNDED_INCOME | 62 | 2.43 | 206.67 | 36.65 | 401.62 |
| BASKET / CRYPTO_2026 / PERSONAL | 46 | 2.20 | 153.33 | 66.74 | 396.86 |
| BASKET / CRYPTO_2026 / PROP_FUNDED_INCOME | 46 | 1.48 | 153.33 | -5.66 | 215.85 |
| ENTRY_QUALITY / FX_GOLD_2025 / PROP_FUNDED_INCOME | 92 | 3.61 | 306.67 | 54.59 | 596.47 |
| ENTRY_QUALITY / CRYPTO_2025 / PERSONAL | 62 | 2.57 | 206.67 | 50.33 | 435.82 |
| ENTRY_QUALITY / CRYPTO_2025 / PROP_CHALLENGE_PASS | 62 | 1.95 | 206.67 | -11.88 | 280.30 |
| ENTRY_QUALITY / CRYPTO_2025 / PROP_FUNDED_INCOME | 62 | 1.80 | 206.67 | -26.41 | 243.97 |
| ENTRY_QUALITY / GOLD_2026 / PERSONAL | 119 | 8.88 | 396.67 | 491.45 | 1823.62 |

## Same-strategy entry-filter comparison

This isolates the entry rule from the benefit of dropping other configurations. The frozen ENTRY_QUALITY winner is compared with the same selected IDs without the feature filter. Other entry timing, risk and management policies remain unchanged.

| Cohort / tier | Selected rule | Unfiltered same-ID return % | Filtered return % | Unfiltered same-ID realized DD % | Filtered realized DD % |
|---|---|---:|---:|---:|---:|
| FX_GOLD_2025 / PERSONAL | all | 2.04 | 2.04 | 5.40 | 5.40 |
| FX_GOLD_2025 / PROP_CHALLENGE_PASS | all | N/A | N/A | N/A | N/A |
| FX_GOLD_2025 / PROP_FUNDED_INCOME | higher-timeframe-aligned | N/A | 3.61 | N/A | 2.52 |
| CRYPTO_2025 / PERSONAL | normal-volatility | 2.59 | 2.57 | 3.54 | 2.41 |
| CRYPTO_2025 / PROP_CHALLENGE_PASS | normal-volatility | 1.41 | 1.95 | 2.61 | 2.73 |
| CRYPTO_2025 / PROP_FUNDED_INCOME | normal-volatility | 2.43 | 1.80 | 1.00 | 1.00 |
| CRYPTO_2026 / PERSONAL | normal-volatility | -0.56 | -1.49 | 2.33 | 2.87 |
| CRYPTO_2026 / PROP_CHALLENGE_PASS | all | -3.12 | -3.12 | 3.43 | 3.43 |
| CRYPTO_2026 / PROP_FUNDED_INCOME | normal-volatility | -1.15 | -1.61 | 1.35 | 1.65 |
| GOLD_2026 / PERSONAL | active-volume | 10.51 | 8.88 | 9.74 | 5.60 |

Crypto Prop columns are hypothetical risk-policy replays; existing crypto onboarding supports Personal accounts. They do not certify a Crypto Prop execution product. Compressed selection-lock.json.gz preserves every training score before the validation pass.

## Challenge passing audit

0 of 6 frozen Challenge profiles completed both modeled +8% and +5% phases in their later source window. This is a descriptive count over reused/overlapping research, not a pass probability. Unpriced Friday profiles cannot establish a completed result. Fast, repeatable Prop passing is not demonstrated by this study.

## Reproduce and use

Run `node --import tsx scripts/research/focused-portfolio/run.ts` from the repository root. It reconstructs normalized ledgers only from committed reports, then saves the training lock and validation outputs. No activation, migrations or data acquisition are invoked. Run targeted checks with `node --import tsx --test scripts/research/focused-portfolio/replay.test.ts`.

The earlier ETH/DOGE shortcut was retired after the expansion audit. See DEPLOYMENT.md for current Personal/VIP selection and demo risk profiles.

## Personal growth extension

See [GROWTH.md](GROWTH.md) for fixed 2% / 5% risk, explicit expanded Personal exposure budgets, margin sensitivity, admission attribution and the separate VIP-subscriber sizing replay. Prop policies remain unchanged. Compressed growth-results.json.gz retains every training trial and later result, including failures.
