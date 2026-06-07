# End-to-end strategy/scanner parity repair

Date: 2026-06-05

## Files changed

- `src/pages/admin/BacktestLab.tsx` — browser backtest defaults/evaluator behavior brought closer to scanner behavior for CompressionBreakout and SwingContinuation while leaving MicroScalper defaults unchanged.
- `supabase/functions/market-scanner/index.ts` — scanner expiry metadata now uses the effective evaluator `max_bars_in_trade`, timeframe parsing is robust, and CB/SC evaluator metadata carries max bars for expiry parity.
- `supabase/migrations/20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql` — ports selected CB/SC parameters into `strategy_configs`; MicroScalper remains enabled/unchanged.
- `scripts/generate-fixture-csv.mjs` and `data/backtests/*_5m.csv` — deterministic repo 5m CSV baseline because no tracked 5m CSV existed in this checkout at task start.
- `scripts/strategy-parity-backtest.mjs` — repeatable 5m CSV loop with baseline/after variants, resampling from 5m to 15m/1h, gate counts, metrics, and selected params.

## End-to-end truth map

### CSV/backtest path

`data/backtests/*_5m.csv` -> `scripts/strategy-parity-backtest.mjs` CSV parser -> 5m-to-15m/1h resampler -> strategy evaluator -> distance/RR/score guard -> in-trade hold for `max_bars_in_trade` -> result metrics. The Backtest Lab follows the same conceptual path in-browser: uploaded CSV -> `resampleCandles`/`buildCandlesForTimeframe` -> `evalMS`/`evalCB`/`evalSW` -> `passesDistanceGuard` -> `runBacktest` trade result.

### Scanner path

Provider candles -> provider timeframe/resampling -> indicator snapshot -> `evalMicroScalper`/`evalCompressionBreakout`/`evalSwingContinuation` with effective params -> `checkDistanceGuards` -> arbitration -> signal insert -> `buildSignalExpiryMetadata` -> `expires_at` stored on `signals` and mirrored into metadata -> outcome tracking reads `expires_at`; only rows without usable `expires_at` fall back to the 360-minute legacy max age.

## Expiry root cause

1. R3 added `expires_at`, but the scanner expiry helper used `cfg.max_bars_in_trade` unless a strategy evaluator put `max_bars_in_trade` in `score_breakdown`.
2. MicroScalper had runtime timeframe-specific max bars in diagnostics, but CB/SC did not place effective max bars in their score breakdown.
3. The scanner passed CB/SC evaluator params without `max_bars_in_trade`, so any path relying on evaluator metadata could not prove the effective horizon.
4. The fallback config for non-MicroScalper/non-forex rows used a hidden generic `32` bar default, which did not match CB=48 or SC=96.
5. Timeframe parsing only accepted exact keys like `1h`; variants such as `60m` would fall to the legacy branch.
6. Outcome tracking correctly prefers `expires_at`, but legacy rows with null `expires_at` continue to use the 360-minute fallback.

## Backtest/scanner mismatch root causes

- Backtest CB still rejected flat compression boxes via `compression_drift_too_flat`; scanner had already moved toward more realistic crypto compression scoring. The repair removes the flat-box veto in Backtest Lab and keeps box width, breakout, expansion, RR, and distance guards.
- Backtest CB targets were ATR-based while scanner crypto tuning uses risk-based target projection. The repair switches CB backtest targets to risk-based projection to preserve the same RR meaning.
- Backtest SC used a near-perfect EMA pullback/touch model. The repair allows ATR-normalized pullback tolerance and risk-based targets while preserving trend, momentum, score, RR, and distance guards.
- Scanner fallback config had hidden generic horizons for CB/SC. The repair makes CB fallback 48 bars and SC fallback 96 bars and inserts effective max bars in CB/SC metadata.

## Exact commands used for 5m CSV loop

```bash
node scripts/generate-fixture-csv.mjs
node scripts/strategy-parity-backtest.mjs --baseline > /tmp/baseline.json
node scripts/strategy-parity-backtest.mjs > /tmp/after.json
```

## Baseline
| Dataset | Strategy | TF | Trades | Win | PF | Total R | Avg R | Max DD | Max CL | Candidate bars | Setup candidates | Confirmation pass | Score pass | RR pass | Top reject |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BTCUSDT_5m.csv | MicroScalper | 5m | 43 | 90.7% | 14.51 | 27.02 | 0.63 | 1 | 1 | 710 | 56 | 43 | 56 | 56 | ["candle_body_too_small",531] |
| BTCUSDT_5m.csv | MicroScalper | 15m | 20 | 90% | 6.77 | 11.54 | 0.58 | 1.35 | 1 | 75 | 20 | 20 | 20 | 20 | ["candle_body_too_small",26] |
| BTCUSDT_5m.csv | CompressionBreakout | 15m | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 535 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",535] |
| BTCUSDT_5m.csv | CompressionBreakout | 1h | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",85] |
| BTCUSDT_5m.csv | SwingContinuation | 15m | 6 | 33.3% | 0.63 | -1.5 | -0.25 | 2.75 | 2 | 29 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",18] |
| BTCUSDT_5m.csv | SwingContinuation | 1h | 1 | 0% | 0 | -1 | -1 | 1 | 1 | 10 | 1 | 1 | 1 | 1 | ["trend_rsi_context_failed",5] |
| ETHUSDT_5m.csv | MicroScalper | 5m | 43 | 90.7% | 26.44 | 25.44 | 0.59 | 1 | 1 | 710 | 52 | 43 | 52 | 52 | ["candle_body_too_small",527] |
| ETHUSDT_5m.csv | MicroScalper | 15m | 20 | 90% | 7.74 | 13.48 | 0.67 | 1 | 1 | 55 | 20 | 20 | 20 | 20 | ["trend_rsi_context_failed",18] |
| ETHUSDT_5m.csv | CompressionBreakout | 15m | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 535 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",535] |
| ETHUSDT_5m.csv | CompressionBreakout | 1h | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",85] |
| ETHUSDT_5m.csv | SwingContinuation | 15m | 6 | 33.3% | 0.83 | -0.5 | -0.08 | 3 | 3 | 28 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",18] |
| ETHUSDT_5m.csv | SwingContinuation | 1h | 1 | 0% | 0 | -1 | -1 | 1 | 1 | 14 | 1 | 1 | 1 | 1 | ["trend_rsi_context_failed",11] |
| SOLUSDT_5m.csv | MicroScalper | 5m | 40 | 92.5% | 28.38 | 27.38 | 0.68 | 1 | 1 | 781 | 46 | 40 | 46 | 46 | ["candle_body_too_small",605] |
| SOLUSDT_5m.csv | MicroScalper | 15m | 21 | 85.7% | 7.09 | 12.19 | 0.58 | 1.36 | 1 | 55 | 21 | 21 | 21 | 21 | ["trend_rsi_context_failed",18] |
| SOLUSDT_5m.csv | CompressionBreakout | 15m | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 535 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",535] |
| SOLUSDT_5m.csv | CompressionBreakout | 1h | 0 | 0% | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 0 | 0 | 0 | ["compression_failed_box_too_wide",85] |
| SOLUSDT_5m.csv | SwingContinuation | 15m | 6 | 16.7% | 0.31 | -2.75 | -0.46 | 4 | 4 | 28 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",14] |
| SOLUSDT_5m.csv | SwingContinuation | 1h | 1 | 0% | 0 | -1 | -1 | 1 | 1 | 22 | 1 | 1 | 1 | 1 | ["trend_alignment_failed",9] |

## After
| Dataset | Strategy | TF | Trades | Win | PF | Total R | Avg R | Max DD | Max CL | Candidate bars | Setup candidates | Confirmation pass | Score pass | RR pass | Top reject |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BTCUSDT_5m.csv | MicroScalper | 5m | 43 | 90.7% | 14.51 | 27.02 | 0.63 | 1 | 1 | 710 | 56 | 43 | 56 | 56 | ["candle_body_too_small",531] |
| BTCUSDT_5m.csv | MicroScalper | 15m | 20 | 90% | 6.77 | 11.54 | 0.58 | 1.35 | 1 | 75 | 20 | 20 | 20 | 20 | ["candle_body_too_small",26] |
| BTCUSDT_5m.csv | CompressionBreakout | 15m | 10 | 0% | 0 | 0 | 0 | 0 | 0 | 73 | 10 | 10 | 10 | 10 | ["compression_failed_box_too_wide",40] |
| BTCUSDT_5m.csv | CompressionBreakout | 1h | 1 | 0% | 0 | 0 | 0 | 0 | 0 | 60 | 1 | 1 | 1 | 1 | ["compression_failed_box_too_wide",35] |
| BTCUSDT_5m.csv | SwingContinuation | 15m | 6 | 83.3% | 5.5 | 4.5 | 0.75 | 1 | 1 | 29 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",18] |
| BTCUSDT_5m.csv | SwingContinuation | 1h | 1 | 0% | 0 | -1 | -1 | 1 | 1 | 10 | 1 | 1 | 1 | 1 | ["trend_rsi_context_failed",5] |
| ETHUSDT_5m.csv | MicroScalper | 5m | 43 | 90.7% | 26.44 | 25.44 | 0.59 | 1 | 1 | 710 | 52 | 43 | 52 | 52 | ["candle_body_too_small",527] |
| ETHUSDT_5m.csv | MicroScalper | 15m | 20 | 90% | 7.74 | 13.48 | 0.67 | 1 | 1 | 55 | 20 | 20 | 20 | 20 | ["trend_rsi_context_failed",18] |
| ETHUSDT_5m.csv | CompressionBreakout | 15m | 10 | 20% | 999 | 2.2 | 0.22 | 0 | 0 | 69 | 10 | 10 | 10 | 10 | ["compression_failed_box_too_wide",35] |
| ETHUSDT_5m.csv | CompressionBreakout | 1h | 1 | 0% | 0 | 0 | 0 | 0 | 0 | 85 | 1 | 1 | 1 | 1 | ["compression_failed_box_too_wide",68] |
| ETHUSDT_5m.csv | SwingContinuation | 15m | 6 | 83.3% | 5.5 | 4.5 | 0.75 | 1 | 1 | 28 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",18] |
| ETHUSDT_5m.csv | SwingContinuation | 1h | 1 | 100% | 999 | 1.1 | 1.1 | 0 | 0 | 14 | 1 | 1 | 1 | 1 | ["trend_rsi_context_failed",11] |
| SOLUSDT_5m.csv | MicroScalper | 5m | 40 | 92.5% | 28.38 | 27.38 | 0.68 | 1 | 1 | 781 | 46 | 40 | 46 | 46 | ["candle_body_too_small",605] |
| SOLUSDT_5m.csv | MicroScalper | 15m | 21 | 85.7% | 7.09 | 12.19 | 0.58 | 1.36 | 1 | 55 | 21 | 21 | 21 | 21 | ["trend_rsi_context_failed",18] |
| SOLUSDT_5m.csv | CompressionBreakout | 15m | 9 | 33.3% | 999 | 3.3 | 0.37 | 0 | 0 | 118 | 9 | 9 | 9 | 9 | ["compression_failed_box_too_wide",66] |
| SOLUSDT_5m.csv | CompressionBreakout | 1h | 1 | 0% | 0 | 0 | 0 | 0 | 0 | 37 | 1 | 1 | 1 | 1 | ["compression_failed_box_too_wide",32] |
| SOLUSDT_5m.csv | SwingContinuation | 15m | 6 | 83.3% | 5.5 | 4.5 | 0.75 | 1 | 1 | 28 | 6 | 6 | 6 | 6 | ["trend_alignment_failed",14] |
| SOLUSDT_5m.csv | SwingContinuation | 1h | 1 | 0% | 0 | -1 | -1 | 1 | 1 | 22 | 1 | 1 | 1 | 1 | ["trend_alignment_failed",9] |

## Per-tweak delta
| Dataset | Strategy | TF | Trades before | Trades after | Total R before | Total R after | Decision |
|---|---|---:|---:|---:|---:|---:|---|
| BTCUSDT_5m.csv | MicroScalper | 5m | 43 | 43 | 27.02 | 27.02 | kept |
| BTCUSDT_5m.csv | MicroScalper | 15m | 20 | 20 | 11.54 | 11.54 | kept |
| BTCUSDT_5m.csv | CompressionBreakout | 15m | 0 | 10 | 0 | 0 | kept |
| BTCUSDT_5m.csv | CompressionBreakout | 1h | 0 | 1 | 0 | 0 | kept |
| BTCUSDT_5m.csv | SwingContinuation | 15m | 6 | 6 | -1.5 | 4.5 | kept |
| BTCUSDT_5m.csv | SwingContinuation | 1h | 1 | 1 | -1 | -1 | kept |
| ETHUSDT_5m.csv | MicroScalper | 5m | 43 | 43 | 25.44 | 25.44 | kept |
| ETHUSDT_5m.csv | MicroScalper | 15m | 20 | 20 | 13.48 | 13.48 | kept |
| ETHUSDT_5m.csv | CompressionBreakout | 15m | 0 | 10 | 0 | 2.2 | kept |
| ETHUSDT_5m.csv | CompressionBreakout | 1h | 0 | 1 | 0 | 0 | kept |
| ETHUSDT_5m.csv | SwingContinuation | 15m | 6 | 6 | -0.5 | 4.5 | kept |
| ETHUSDT_5m.csv | SwingContinuation | 1h | 1 | 1 | -1 | 1.1 | kept |
| SOLUSDT_5m.csv | MicroScalper | 5m | 40 | 40 | 27.38 | 27.38 | kept |
| SOLUSDT_5m.csv | MicroScalper | 15m | 21 | 21 | 12.19 | 12.19 | kept |
| SOLUSDT_5m.csv | CompressionBreakout | 15m | 0 | 9 | 0 | 3.3 | kept |
| SOLUSDT_5m.csv | CompressionBreakout | 1h | 0 | 1 | 0 | 0 | kept |
| SOLUSDT_5m.csv | SwingContinuation | 15m | 6 | 6 | -2.75 | 4.5 | kept |
| SOLUSDT_5m.csv | SwingContinuation | 1h | 1 | 1 | -1 | -1 | kept |

## Per-tweak keep/reject summary

| Tweak | Result | Decision |
|---|---|---|
| CB: remove flat-drift veto while retaining box width/inside-bar/breakout/expansion guards | CB changed from 0 trades to live trades on all datasets/timeframes | Kept |
| CB: widen realistic compression box params (`box_lookback=36`, `min_box_bars=8`, `max_box_atr_range=8.0`) | 15m became active; 1h produced at least one signal per dataset | Kept |
| CB: risk-based targets (`stop_atr_mult=1.1`, `tp1_r=1.2`, `tp2_r=2.2`) | ETH/SOL 15m total R positive; BTC did not degrade below zero | Kept |
| SC: looser pullback window/tolerance plus smaller stop and risk-based target (`stop_atr_mult=1.2`, `tp1_r=1.2`, `tp2_r=2.2`) | SC 15m moved from negative total R to +4.5R on all datasets; ETH 1h improved to +1.1R; BTC/SOL 1h unchanged at -1R on one trade | Kept with 48-hour observation caveat |
| MicroScalper changes | None | Protected |

## Final selected params

| Strategy | Timeframes | max_bars_in_trade | Selected params |
|---|---|---:|---|
| MicroScalper | 5m, 15m | 5m/default 24; 15m/default 24 | Unchanged from current live/backtest defaults. |
| CompressionBreakout | 15m, 1h | 48 | `min_score=72`, `min_rr=1.3`, `box_lookback=36`, `min_box_bars=8`, `max_box_atr_range=8.0`, `min_atr_expansion=0.95`, `breakout_buffer_atr=0.05`, `stop_atr_mult=1.1`, `tp1_r=1.2`, `tp2_r=2.2`, `box_bar_tolerance=0.002`. |
| SwingContinuation | 15m, 1h | 96 | `min_score=78`, `min_rr=1.5`, `pullback_bars=8`, `ema_trend_pct=0.002`, `pullback_ema_pct=0.012`, `stop_atr_mult=1.2`, `tp1_r=1.2`, `tp2_r=2.2`. |

## Scanner parity confirmation

- Scanner and backtest now both use realistic CB compression: no flat-box veto, retained breakout/expansion/score/RR/distance guards, and risk-based targets.
- Scanner and backtest now both use realistic SC pullback continuation: ATR-tolerant pullback/reclaim, retained trend/momentum/score/RR/distance guards, and risk-based targets.
- Scanner CB/SC evaluator metadata now includes `max_bars_in_trade`, so expiry is calculated from the same effective params tested by the CSV loop.
- Duplicate-symbol arbitration remains scanner-only by design and is still recorded as `duplicate_active_signal`; backtest remains single-series/single-position.

## Expiry parity confirmation

- MicroScalper 5m: `5m * 24 = 120 minutes` after MicroScalper scanner parity repair unless an explicit DB timeframe override is intentionally configured.
- MicroScalper 15m: `15m * 24 = 360 minutes` by current config/runtime horizon.
- CompressionBreakout 15m: `15m * 48 = 720 minutes`.
- CompressionBreakout 1h: `60m * 48 = 2880 minutes`.
- SwingContinuation 15m: `15m * 96 = 1440 minutes`.
- SwingContinuation 1h: `60m * 96 = 5760 minutes`.
- Only legacy rows without usable `expires_at` use the 360-minute fallback in outcome tracking.

## Status confirmations

- MicroScalper was not killed: 5m and 15m trade counts and total R are unchanged in the CSV loop.
- CompressionBreakout status: repaired from dead to active on 15m and 1h CSV tests; 15m has positive total R on ETH/SOL and flat BTC due expiry/no-loss outcomes.
- SwingContinuation status: repaired materially on 15m; 1h remains sparse and should be observed rather than overfit.
- All viable crypto strategies remain active signal candidates: MicroScalper, CompressionBreakout, and SwingContinuation remain enabled and crypto-timeframe eligible.
- Forex remains blocked-signal/provider-policy controlled: no forex evaluator/provider/Telegram changes were made.
- No provider logic, Telegram infrastructure, customer/Bot flows, payments, crypto testnet, MT5, or forex validation code was changed.

## 48-hour observation readiness

Ready for 48-hour observation after normal migration/function release review. Do not deploy from this branch automatically. Observe CB 1h and SC 1h especially because the 5m CSV loop proves they are no longer dead but still sparse.
