# Phase 1B — 90-Day All Research Preset Validation Report

Generated: 2026-06-02 (UTC)

## Scope and controls

- Fixture: `data/backtests/5m.csv`
- Symbol: ETHUSDT
- Market: crypto
- Dataset timeframe: 5m
- Selected 90-day range: `2025-06-08T15:10:00.000Z` -> `2025-09-06T15:10:00.000Z`
- Selected candles: 25,921
- Full CSV range: `2024-01-01T00:00:00.000Z` -> `2025-09-06T15:10:00.000Z`
- Presets tested: Live-like default, Conservative research, Balanced research, Aggressive research
- Capital assumption for estimated P/L: $1,000 account, 0.5% risk/trade, so estimated P/L = total R × $5.

## Phase-safety statement

This phase changed validation/reporting only. No live scanner, provider, Telegram send logic, outcome tracking, customer app, package/Bot setup, broker/MT5/execution, or DB `strategy_config` was changed. The Backtest Lab browser-side live-like SwingContinuation preset was aligned with the Phase 1A local fixture approximation so the validator and Backtest Lab use the same backtest-only approximation for this report.

## Parity note

`npm run backtest:fixture -- --days=90 --preset=all` now supports one-preset runs and all-preset runs. The fixture validator uses the same browser-compatible evaluator family and preset labels as Backtest Lab. Live-like and Balanced are identical for MicroScalper and CompressionBreakout; SwingContinuation intentionally keeps the repaired Phase 1A live-like approximation separate from Balanced research.

## Full all-preset result table

| preset_name | strategy | tested_timeframe | dataset_timeframe | resampled | selected_candles | resampled_candles_tested | evaluations | candidates | rejected | trades | wins | losses | tp1_hits | tp2_hits | sl_hits | expired | win_rate | profit_factor | total_r | avg_r | max_dd_r | max_consec_losses | est_pl_1000_0.5pct | top_rejections | classification | recommendation | decision_score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Live-like default | MicroScalper | 5m | 5m | no | 25921 | 25921 | 17663 | 1633 | 16030 | 1633 | 879 | 731 | 578 | 301 | 731 | 23 | 53.8 | 1.21 | 154.37 | 0.09 | 17.85 | 9 | 771.85 | candle_body_too_small:6422\|trend_rsi_context_failed:5592\|momentum_failed:1742\|tp1_too_close:1357\|volatility_too_low:458 | viable / preserve | Preserve unchanged for now | 30.42 |
| Live-like default | MicroScalper | 15m | 5m | yes | 25921 | 8640 | 4585 | 762 | 3823 | 762 | 423 | 325 | 270 | 153 | 325 | 14 | 55.5 | 1.32 | 104.57 | 0.14 | 10.95 | 6 | 522.85 | candle_body_too_small:1737\|trend_rsi_context_failed:1664\|momentum_failed:373\|tp1_too_close:31\|tp2_too_close:16 | viable / preserve | Preserve unchanged for now | 45.77 |
| Live-like default | CompressionBreakout | 15m | 5m | yes | 25921 | 8640 | 4578 | 141 | 4437 | 141 | 45 | 48 | 42 | 3 | 48 | 48 | 31.9 | 1.29 | 14.1 | 0.1 | 5.0 | 5 | 70.5 | compression_not_ready:4302\|confidence_too_low:77\|atr_expansion_weak:45\|momentum_failed:8\|breakout_not_confirmed:5 | viable but noisy | Tune next / monitor exits and blockers | 20.41 |
| Live-like default | CompressionBreakout | 1h | 5m | yes | 25921 | 2159 | 959 | 38 | 921 | 38 | 11 | 12 | 10 | 1 | 12 | 15 | 28.9 | 1.29 | 3.5 | 0.09 | 2.7 | 2 | 17.5 | compression_not_ready:894\|confidence_too_low:13\|atr_expansion_weak:12\|momentum_failed:2 | viable but noisy | Tune next / monitor exits and blockers | 8.68 |
| Live-like default | SwingContinuation | 15m | 5m | yes | 25921 | 8640 | 1249 | 283 | 966 | 283 | 99 | 131 | 91 | 8 | 131 | 53 | 35.0 | 1.12 | 15.6 | 0.06 | 12.2 | 8 | 78.0 | trend_filter_failed:389\|reclaim_not_confirmed:383\|momentum_failed:104\|confidence_too_low:85\|pullback_not_ready:5 | viable but noisy | Tune next / monitor exits and blockers | 16.56 |
| Live-like default | SwingContinuation | 1h | 5m | yes | 25921 | 2159 | 376 | 79 | 297 | 79 | 32 | 34 | 29 | 3 | 34 | 13 | 40.5 | 1.41 | 13.8 | 0.17 | 8.2 | 5 | 69.0 | reclaim_not_confirmed:166\|trend_filter_failed:87\|momentum_failed:35\|confidence_too_low:6\|pullback_not_ready:3 | viable / preserve | Preserve unchanged for now | 22.64 |
| Conservative research | MicroScalper | 5m | 5m | no | 25921 | 25921 | 25856 | 0 | 25856 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0 | N/A | N/A | N/A | N/A | 0 | 0.0 | candle_body_too_small:9609\|trend_rsi_context_failed:7887\|rr_too_low:3496\|momentum_failed:2597\|tp1_too_close:1388 | too strict / dead participation | Research-only; audit strict gates before any tuning | -999.0 |
| Conservative research | MicroScalper | 15m | 5m | yes | 25921 | 8640 | 8575 | 0 | 8575 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0 | N/A | N/A | N/A | N/A | 0 | 0.0 | candle_body_too_small:3331\|trend_rsi_context_failed:2631\|rr_too_low:1729\|momentum_failed:832\|tp1_too_close:35 | too strict / dead participation | Research-only; audit strict gates before any tuning | -999.0 |
| Conservative research | CompressionBreakout | 15m | 5m | yes | 25921 | 8640 | 5470 | 110 | 5360 | 110 | 27 | 32 | 27 | 0 | 32 | 51 | 24.5 | 1.18 | 5.8 | 0.05 | 7.2 | 5 | 29.0 | compression_not_ready:5143\|confidence_too_low:162\|atr_expansion_weak:49\|momentum_failed:6 | viable but noisy | Tune next / monitor exits and blockers | 9.47 |
| Conservative research | CompressionBreakout | 1h | 5m | yes | 25921 | 2159 | 1207 | 30 | 1177 | 30 | 7 | 8 | 6 | 1 | 8 | 15 | 23.3 | 1.4 | 3.2 | 0.11 | 4.6 | 4 | 16.0 | compression_not_ready:1136\|confidence_too_low:28\|atr_expansion_weak:11\|momentum_failed:2 | viable but noisy | Tune next / monitor exits and blockers | 10.23 |
| Conservative research | SwingContinuation | 15m | 5m | yes | 25921 | 8640 | 1727 | 205 | 1522 | 205 | 60 | 108 | 59 | 1 | 108 | 37 | 29.3 | 0.95 | -4.9 | -0.02 | 18.0 | 11 | -24.5 | reclaim_not_confirmed:559\|trend_filter_failed:427\|confidence_too_low:332\|momentum_failed:144\|pullback_not_ready:42 | needs tuning | Tune before consideration | -4.99 |
| Conservative research | SwingContinuation | 1h | 5m | yes | 25921 | 2159 | 419 | 57 | 362 | 57 | 19 | 30 | 17 | 2 | 30 | 8 | 33.3 | 1.15 | 4.5 | 0.08 | 6.6 | 6 | 22.5 | reclaim_not_confirmed:182\|trend_filter_failed:92\|confidence_too_low:44\|momentum_failed:37\|pullback_not_ready:7 | viable but noisy | Tune next / monitor exits and blockers | 0.07 |
| Balanced research | MicroScalper | 5m | 5m | no | 25921 | 25921 | 17663 | 1633 | 16030 | 1633 | 879 | 731 | 578 | 301 | 731 | 23 | 53.8 | 1.21 | 154.37 | 0.09 | 17.85 | 9 | 771.85 | candle_body_too_small:6422\|trend_rsi_context_failed:5592\|momentum_failed:1742\|tp1_too_close:1357\|volatility_too_low:458 | viable / preserve | Preserve unchanged for now | 30.42 |
| Balanced research | MicroScalper | 15m | 5m | yes | 25921 | 8640 | 4585 | 762 | 3823 | 762 | 423 | 325 | 270 | 153 | 325 | 14 | 55.5 | 1.32 | 104.57 | 0.14 | 10.95 | 6 | 522.85 | candle_body_too_small:1737\|trend_rsi_context_failed:1664\|momentum_failed:373\|tp1_too_close:31\|tp2_too_close:16 | viable / preserve | Preserve unchanged for now | 45.77 |
| Balanced research | CompressionBreakout | 15m | 5m | yes | 25921 | 8640 | 4578 | 141 | 4437 | 141 | 45 | 48 | 42 | 3 | 48 | 48 | 31.9 | 1.29 | 14.1 | 0.1 | 5.0 | 5 | 70.5 | compression_not_ready:4302\|confidence_too_low:77\|atr_expansion_weak:45\|momentum_failed:8\|breakout_not_confirmed:5 | viable but noisy | Tune next / monitor exits and blockers | 20.41 |
| Balanced research | CompressionBreakout | 1h | 5m | yes | 25921 | 2159 | 959 | 38 | 921 | 38 | 11 | 12 | 10 | 1 | 12 | 15 | 28.9 | 1.29 | 3.5 | 0.09 | 2.7 | 2 | 17.5 | compression_not_ready:894\|confidence_too_low:13\|atr_expansion_weak:12\|momentum_failed:2 | viable but noisy | Tune next / monitor exits and blockers | 8.68 |
| Balanced research | SwingContinuation | 15m | 5m | yes | 25921 | 8640 | 1239 | 222 | 1017 | 222 | 83 | 116 | 78 | 5 | 116 | 23 | 37.4 | 1.12 | 13.5 | 0.06 | 12.0 | 8 | 67.5 | reclaim_not_confirmed:398\|trend_filter_failed:334\|confidence_too_low:126\|momentum_failed:102\|pullback_not_ready:21 | viable but noisy | Tune next / monitor exits and blockers | 12.24 |
| Balanced research | SwingContinuation | 1h | 5m | yes | 25921 | 2159 | 406 | 68 | 338 | 68 | 27 | 36 | 26 | 1 | 36 | 5 | 39.7 | 1.15 | 5.5 | 0.08 | 9.0 | 5 | 27.5 | reclaim_not_confirmed:189\|trend_filter_failed:89\|momentum_failed:36\|confidence_too_low:21\|pullback_not_ready:3 | viable but noisy | Tune next / monitor exits and blockers | 0.62 |
| Aggressive research | MicroScalper | 5m | 5m | no | 25921 | 25921 | 18150 | 2027 | 16123 | 2027 | 1107 | 915 | 675 | 432 | 915 | 5 | 54.6 | 1.2 | 185.25 | 0.09 | 15.87 | 8 | 926.25 | candle_body_too_small:6652\|trend_rsi_context_failed:5334\|momentum_failed:1969\|tp1_too_close:1263\|volatility_too_low:458 | viable / preserve | Preserve unchanged for now | 29.63 |
| Aggressive research | MicroScalper | 15m | 5m | yes | 25921 | 8640 | 4985 | 920 | 4065 | 920 | 500 | 416 | 283 | 217 | 416 | 4 | 54.3 | 1.22 | 90.14 | 0.1 | 12.19 | 6 | 450.7 | candle_body_too_small:1898\|trend_rsi_context_failed:1646\|momentum_failed:477\|tp1_too_close:34\|tp2_too_close:8 | viable / preserve | Preserve unchanged for now | 37.25 |
| Aggressive research | CompressionBreakout | 15m | 5m | yes | 25921 | 8640 | 3443 | 163 | 3280 | 163 | 61 | 61 | 58 | 3 | 61 | 41 | 37.4 | 1.25 | 15.2 | 0.09 | 11.4 | 5 | 76.0 | compression_not_ready:3156\|breakout_not_confirmed:81\|atr_expansion_weak:24\|confidence_too_low:10\|momentum_failed:9 | viable but noisy | Tune next / monitor exits and blockers | 17.14 |
| Aggressive research | CompressionBreakout | 1h | 5m | yes | 25921 | 2159 | 883 | 45 | 838 | 45 | 19 | 18 | 16 | 3 | 18 | 8 | 42.2 | 1.43 | 7.8 | 0.17 | 6.0 | 6 | 39.0 | compression_not_ready:807\|breakout_not_confirmed:22\|confidence_too_low:4\|atr_expansion_weak:4\|momentum_failed:1 | viable / preserve | Preserve unchanged for now | 14.26 |
| Aggressive research | SwingContinuation | 15m | 5m | yes | 25921 | 8640 | 1172 | 232 | 940 | 232 | 102 | 114 | 92 | 10 | 114 | 16 | 44.0 | 1.24 | 27.6 | 0.12 | 12.1 | 6 | 138.0 | reclaim_not_confirmed:400\|trend_filter_failed:334\|momentum_failed:96\|confidence_too_low:56\|tp1_too_close:18 | viable but noisy | Tune next / monitor exits and blockers | 24.16 |
| Aggressive research | SwingContinuation | 1h | 5m | yes | 25921 | 2159 | 265 | 61 | 204 | 61 | 27 | 26 | 27 | 0 | 26 | 8 | 44.3 | 1.35 | 9.1 | 0.15 | 6.7 | 5 | 45.5 | reclaim_not_confirmed:122\|trend_filter_failed:57\|momentum_failed:20\|confidence_too_low:5 | viable / preserve | Preserve unchanged for now | 12.3 |

## Decision-quality ranking

Decision score balances adequate sample, PF, total R, avg R, max drawdown, max consecutive losses, overactivity, and low-sample warnings. It is for historical fixture comparison only, not future-profit prediction.

| rank | preset | candidate | trades | PF | totalR | avgR | maxDD | maxCL | score | decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Live-like default | MicroScalper 15m | 762 | 1.32 | 104.57 | 0.14 | 10.95 | 6 | 45.77 | Preserve unchanged for now |
| 2 | Balanced research | MicroScalper 15m | 762 | 1.32 | 104.57 | 0.14 | 10.95 | 6 | 45.77 | Preserve unchanged for now |
| 3 | Aggressive research | MicroScalper 15m | 920 | 1.22 | 90.14 | 0.1 | 12.19 | 6 | 37.25 | Preserve unchanged for now |
| 4 | Live-like default | MicroScalper 5m | 1633 | 1.21 | 154.37 | 0.09 | 17.85 | 9 | 30.42 | Preserve unchanged for now |
| 5 | Balanced research | MicroScalper 5m | 1633 | 1.21 | 154.37 | 0.09 | 17.85 | 9 | 30.42 | Preserve unchanged for now |
| 6 | Aggressive research | MicroScalper 5m | 2027 | 1.2 | 185.25 | 0.09 | 15.87 | 8 | 29.63 | Preserve unchanged for now |
| 7 | Aggressive research | SwingContinuation 15m | 232 | 1.24 | 27.6 | 0.12 | 12.1 | 6 | 24.16 | Tune next / monitor exits and blockers |
| 8 | Live-like default | SwingContinuation 1h | 79 | 1.41 | 13.8 | 0.17 | 8.2 | 5 | 22.64 | Preserve unchanged for now |
| 9 | Live-like default | CompressionBreakout 15m | 141 | 1.29 | 14.1 | 0.1 | 5.0 | 5 | 20.41 | Tune next / monitor exits and blockers |
| 10 | Balanced research | CompressionBreakout 15m | 141 | 1.29 | 14.1 | 0.1 | 5.0 | 5 | 20.41 | Tune next / monitor exits and blockers |
| 11 | Aggressive research | CompressionBreakout 15m | 163 | 1.25 | 15.2 | 0.09 | 11.4 | 5 | 17.14 | Tune next / monitor exits and blockers |
| 12 | Live-like default | SwingContinuation 15m | 283 | 1.12 | 15.6 | 0.06 | 12.2 | 8 | 16.56 | Tune next / monitor exits and blockers |
| 13 | Aggressive research | CompressionBreakout 1h | 45 | 1.43 | 7.8 | 0.17 | 6.0 | 6 | 14.26 | Preserve unchanged for now |
| 14 | Aggressive research | SwingContinuation 1h | 61 | 1.35 | 9.1 | 0.15 | 6.7 | 5 | 12.3 | Preserve unchanged for now |
| 15 | Balanced research | SwingContinuation 15m | 222 | 1.12 | 13.5 | 0.06 | 12.0 | 8 | 12.24 | Tune next / monitor exits and blockers |
| 16 | Conservative research | CompressionBreakout 1h | 30 | 1.4 | 3.2 | 0.11 | 4.6 | 4 | 10.23 | Tune next / monitor exits and blockers |
| 17 | Conservative research | CompressionBreakout 15m | 110 | 1.18 | 5.8 | 0.05 | 7.2 | 5 | 9.47 | Tune next / monitor exits and blockers |
| 18 | Live-like default | CompressionBreakout 1h | 38 | 1.29 | 3.5 | 0.09 | 2.7 | 2 | 8.68 | Tune next / monitor exits and blockers |
| 19 | Balanced research | CompressionBreakout 1h | 38 | 1.29 | 3.5 | 0.09 | 2.7 | 2 | 8.68 | Tune next / monitor exits and blockers |
| 20 | Balanced research | SwingContinuation 1h | 68 | 1.15 | 5.5 | 0.08 | 9.0 | 5 | 0.62 | Tune next / monitor exits and blockers |
| 21 | Conservative research | SwingContinuation 1h | 57 | 1.15 | 4.5 | 0.08 | 6.6 | 6 | 0.07 | Tune next / monitor exits and blockers |
| 22 | Conservative research | SwingContinuation 15m | 205 | 0.95 | -4.9 | -0.02 | 18.0 | 11 | -4.99 | Tune before consideration |
| 23 | Conservative research | MicroScalper 5m | 0 | N/A | N/A | N/A | N/A | 0 | -999.0 | Research-only; audit strict gates before any tuning |
| 24 | Conservative research | MicroScalper 15m | 0 | N/A | N/A | N/A | N/A | 0 | -999.0 | Research-only; audit strict gates before any tuning |

## Required decision picks

1. **Best overall candidate:** Live-like default / Balanced research MicroScalper 15m. It ranks highest on decision quality with 762 trades, PF 1.32, +104.57R, avg +0.14R, max DD 10.95R, and 6 max consecutive losses.
2. **Best preserve candidate:** MicroScalper 15m under Live-like default / Balanced research. Preserve untouched because it has the best risk-adjusted decision score and ample sample.
3. **Best low-drawdown candidate:** Live-like default / Balanced CompressionBreakout 1h has the lowest max DD (2.7R) among positive candidates, but the sample is only 38 trades. If requiring more than 100 trades, Live-like default / Balanced CompressionBreakout 15m is the better low-drawdown candidate (141 trades, 5.0R max DD).
4. **Best 15m strategy:** MicroScalper 15m under Live-like default / Balanced research.
5. **Best 1h strategy:** Live-like default SwingContinuation 1h by decision quality among 1h candidates; Aggressive CompressionBreakout 1h has stronger PF/avg R but only 45 trades.
6. **Most overactive/noisy candidate:** Aggressive MicroScalper 5m (2,027 trades). It has the highest total R (+185.25R), but the trade count is materially noisier than Live-like/Balanced and PF is only 1.20.
7. **Worst/dead candidate:** Conservative MicroScalper 5m and Conservative MicroScalper 15m both generated zero trades. Conservative SwingContinuation 15m is the worst non-dead active candidate (PF 0.95, -4.90R, 18.0R max DD, 11 max consecutive losses).
8. **Strategy/timeframe needing tune first:** Aggressive SwingContinuation 15m is the highest-impact tuning candidate because it improved Live-like SwingContinuation 15m materially (+27.60R, PF 1.24, win rate 44.0%) while remaining noisy with 12.1R DD.
9. **Strategy/timeframe to preserve untouched:** MicroScalper 15m Live-like/Balanced; also preserve MicroScalper 5m Live-like/Balanced until later because it remains profitable but more active/noisy.
10. **Disable or keep research-only if evidence is weak:** Conservative MicroScalper 5m/15m (dead), Conservative SwingContinuation 15m (negative), and low-sample 1h CompressionBreakout variants should remain research-only.

## Per-strategy preset comparison

| strategy_tf | best_pf | best_total_r | lowest_dd | best_avg_r | most_stable | notes |
| --- | --- | --- | --- | --- | --- | --- |
| MicroScalper 5m | Live-like default | Aggressive research | Aggressive research | Live-like default | Live-like default | Live-like/Balanced are strong, but Aggressive has the most trades and total R with lower PF and overactivity; Conservative killed participation. |
| MicroScalper 15m | Live-like default | Live-like default | Live-like default | Live-like default | Live-like default | Live-like/Balanced are the best decision-quality profile: strong PF/Total R/Avg R with adequate sample; Aggressive adds trades but reduces quality; Conservative killed participation. |
| CompressionBreakout 15m | Live-like default | Aggressive research | Live-like default | Live-like default | Live-like default | Live-like/Balanced are already good enough historically; Aggressive slightly improves total R/trades but damages drawdown and PF; Conservative reduces participation/quality. |
| CompressionBreakout 1h | Aggressive research | Aggressive research | Live-like default | Aggressive research | Aggressive research | Aggressive improves PF, Total R, Avg R, and participation but remains low-sample; Live-like/Balanced have lowest DD but only 38 trades. |
| SwingContinuation 15m | Aggressive research | Aggressive research | Balanced research | Aggressive research | Aggressive research | Aggressive materially improves PF, win rate, total R, and avg R versus Live-like/Balanced; Conservative is negative and should not be used. |
| SwingContinuation 1h | Live-like default | Live-like default | Conservative research | Live-like default | Live-like default | Live-like has the best PF and total R among safer samples; Aggressive has lower DD than Live-like but less total R; Balanced/Conservative are weak. |

## Recommendation summary after Phase 1B

### Preserve unchanged

- MicroScalper 15m Live-like/Balanced: best decision-quality candidate and enough sample.
- MicroScalper 5m Live-like/Balanced: strong total R and enough sample; classify as preserve but monitor overactivity/noise.
- SwingContinuation 1h Live-like: positive and strongest 1h decision-quality profile, but keep evidence caveat due lower sample than 15m sets.

### Tune first

- SwingContinuation 15m, starting from the Aggressive research evidence, because it shows the largest quality improvement over Live-like SwingContinuation 15m while still needing DD/noise work.

### Tune later

- CompressionBreakout 15m: Live-like/Balanced are already participating and profitable; tune later for quality after SwingContinuation 15m.
- Aggressive MicroScalper 5m: profitable but overactive; do not touch before preserving current MicroScalper defaults.

### Research-only / low confidence

- CompressionBreakout 1h all presets: positive variants exist but trade samples are low (30-45 trades).
- SwingContinuation 1h Balanced/Conservative/Aggressive: positive but lower decision quality or low sample relative to Live-like.

### Do not use

- Conservative MicroScalper 5m and 15m: zero trades.
- Conservative SwingContinuation 15m: negative expectancy in this historical fixture.

## Limitations

- This is one symbol (ETHUSDT), one market type (crypto), one historical CSV fixture, and one 90-day window.
- Results are backtest approximations using browser-compatible logic and do not represent live execution, slippage, latency, spread, partial fills, or future profitability.
- No preset was applied to live configuration or DB strategy config.

## Manual verification steps

1. Run `npm run backtest:fixture -- --days=90 --preset=all` and verify the selected range is `2025-06-08T15:10:00.000Z -> 2025-09-06T15:10:00.000Z`.
2. In Backtest Lab, load `data/backtests/5m.csv`, select ETHUSDT / crypto / 5m, select the 90-day range, and compare each preset label/result family.
3. Confirm only browser-side validation/reporting files and this report changed via `git diff --stat`.
