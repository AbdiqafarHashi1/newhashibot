# Fixed crypto study — 18 October 2026

Research failed profitability screening. No configuration was promoted, published, certified or deployed.

| Hourly spot dataset | Bars | Resolved signals | Open signals | Net expectancy per resolved signal | Profit factor |
|---|---:|---:|---:|---:|---:|
| BTCUSDT June 2024 | 720 | 104 | 25 | -0.1464R | 0.7732 |
| BTCUSDT January 2025 | 744 | 129 | 21 | -0.3924R | 0.4530 |
| ETHUSDT March 2025 | 744 | 115 | 44 | -0.1887R | 0.7181 |

These are independent, potentially overlapping signal outcomes, not portfolio returns or customer account drawdowns. R is the distance between the next-bar entry and original stop. Open trades have no final return; partial cash flows and modeled costs remain in the realized curve. Small regime groups are descriptive and must not be used to select profitable filters on these same samples.

The frozen research snapshot uses CompressionBreakout and SwingContinuation parameters from migration 038, with migration 018 distance guards. It is **not** a recovered copy of the inactive project's current configuration. No parameter search was performed. Each dataset uses its first 200 bars to warm up indicators. All strategy inputs precede the decision; entry uses the next open. The scanner's exact registry evaluators, indicator builder, qualification and arbitration are reused. Per-strategy holding limits are respected. Outcomes use 50% TP1, runner breakeven, stop-first collisions, and explicit aggregate estimates of 10 bps fees + 2 bps spread + 4 bps slippage. These costs are assumptions, not measured fills. Spot funding is zero; this study does not validate futures or funding.

Three nonoverlapping historical months do not prove robustness across every condition and are not an unseen prospective holdout. Results include per-regime counts and outcomes, plus rejection counts; no loss-making regime was silently removed. Spot OHLC cannot establish live execution quality, provider isolation, real intrabar sequences or Forex results.

## Reproduce without Supabase

From the repository root, run each importer command and then the fixed runner:

```sh
python3 scripts/research/import-binance-archive.py --symbol BTCUSDT --month 2024-06 --output .tmp/market-study/BTCUSDT-2024-06.json
python3 scripts/research/import-binance-archive.py --symbol BTCUSDT --month 2025-01 --output .tmp/market-study/BTCUSDT-2025-01.json
python3 scripts/research/import-binance-archive.py --symbol ETHUSDT --month 2025-03 --output .tmp/market-study/ETHUSDT-2025-03.json
node --import tsx scripts/research/market-study.ts scripts/research/fixed-crypto-research.json .tmp/market-study/results.json .tmp/market-study/BTCUSDT-2024-06.json .tmp/market-study/BTCUSDT-2025-01.json .tmp/market-study/ETHUSDT-2025-03.json
```

The importer verifies each official archive checksum and preserves source URLs, archive SHA-256 and normalized-data SHA-256. It handles Binance's 2025 spot timestamp switch to microseconds. `CRYPTO_FIXED_STUDY_SOURCES.json` records the source hashes; `CRYPTO_FIXED_STUDY_2026-10-18.json` records the complete fixed configuration, configuration hash and results. This runner accepts hourly Binance spot data only and rejects admission exclusions rather than interpolating gaps.

## Runtime changes accompanying this study

MicroScalper now recognizes the scanner's `ranging` label as well as legacy `range_chop` for its existing low-momentum chop guard. Arbitration rejects unknown sides and nonsequential targets. Replay rejects future, duplicate or out-of-order bars anywhere in its input window. These are correctness repairs, not a claim that the hourly strategies tested above became profitable; MicroScalper is not part of this hourly study.

Further calibration requires a distinct development period, fixed validation/holdout periods, and portfolio/provider checks before owner promotion. Do not repeatedly tune on these three reported months and call them holdouts. Forex requires actual broker MT5 history; connected demo forward testing remains necessary after project activation and VPS setup.
