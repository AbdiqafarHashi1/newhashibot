# Phase 1D — CompressionBreakout 15m Quality Tuning

## Scope and safety

- Scope was limited to CompressionBreakout research/backtest tuning in `src/pages/admin/BacktestLab.tsx` and `scripts/backtest-5m-fixture.mjs`.
- No live scanner/provider/Telegram/outcome/customer/Bot/broker/MT5/execution code was changed.
- No DB `strategy_config` updates were made.
- No symbol universe or timeframe schedule changes were made.
- No trades/signals were faked or forced.
- No `min_score` or `min_rr` thresholds were blindly lowered; all score/RR/distance/compression guards remain in place.

## Baseline observations

Baseline 90-day window: `2025-06-08T15:10:00.000Z` → `2025-09-06T15:10:00.000Z` using `data/backtests/5m.csv`.

CompressionBreakout 15m baseline was viable but modest:

| Preset | Trades | Win % | PF | Total R | Avg R | Max DD R | Max losses | TP1 | TP2 | SL | Expired | Top rejections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Live-like | 141 | 31.9 | 1.29 | 14.10 | 0.10 | 5.00 | 5 | 42 | 3 | 48 | 48 | compression_not_ready, confidence_too_low, atr_expansion_weak |
| Balanced | 141 | 31.9 | 1.29 | 14.10 | 0.10 | 5.00 | 5 | 42 | 3 | 48 | 48 | compression_not_ready, confidence_too_low, atr_expansion_weak |
| Aggressive | 163 | 37.4 | 1.25 | 15.20 | 0.09 | 11.40 | 5 | 58 | 3 | 61 | 41 | compression_not_ready, breakout_not_confirmed, atr_expansion_weak |

Compression diagnostics showed the strategy was not dead: the dominant reject remained `compression_not_ready`, while accepted trades preserved the compression → expansion identity. The main weakness was not a lack of entries; it was trade-management geometry after valid breakouts: too many trades either expired or hit SL before the existing TP1, and TP2 conversion was very low. That points to overly distant first-profit geometry for this fixture, not to loosening entry quality.

## Exact tuning changes

The only tuning change was to CompressionBreakout research/backtest TP1 geometry:

| Preset | TP1 R before | TP1 R after | TP2 R | Rationale |
| --- | ---: | ---: | ---: | --- |
| Conservative | 1.40 | 1.10 | 2.80 unchanged | Earlier partial for stricter setup without changing RR target or compression gates. |
| Balanced / live-like backtest default | 1.30 | 1.00 | 2.50 unchanged | Converts more valid breakout follow-through before common fakeout/mean-reversion. |
| Aggressive | 1.20 | 0.95 | 2.20 unchanged | Keeps aggressive mode lower-quality/noisier, but reduces overextended first target. |

Unchanged:

- Compression requirement.
- Breakout candle requirement.
- ATR expansion gate.
- Momentum gate.
- Structural stop placement.
- TP2 RR construction.
- `min_score` thresholds.
- `min_rr` thresholds.
- Distance guards.
- MicroScalper and SwingContinuation parameters.

## Before vs after — CompressionBreakout 15m, 90d

| Preset | Before trades | Before PF | Before total R | Before avg R | Before DD | Before TP1/TP2/SL/Exp | After trades | After PF | After total R | After avg R | After DD | After TP1/TP2/SL/Exp | Readout |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Live-like | 141 | 1.29 | 14.10 | 0.10 | 5.00 | 42 / 3 / 48 / 48 | 148 | 1.35 | 17.00 | 0.11 | 6.00 | 60 / 2 / 48 / 38 | Improved PF, total R, avg R; DD still controlled. |
| Balanced | 141 | 1.29 | 14.10 | 0.10 | 5.00 | 42 / 3 / 48 / 48 | 148 | 1.35 | 17.00 | 0.11 | 6.00 | 60 / 2 / 48 / 38 | Same as live-like because live-like CB uses balanced defaults. |
| Aggressive | 163 | 1.25 | 15.20 | 0.09 | 11.40 | 58 / 3 / 61 / 41 | 178 | 1.20 | 13.15 | 0.07 | 10.70 | 81 / 1 / 66 / 30 | More first-target hits and fewer expiries, but PF/total R softened; still noisy. |

## Before vs after — CompressionBreakout 1h safety check, 90d

| Preset | Before trades | Before PF | Before total R | Before avg R | Before DD | Before TP1/TP2/SL/Exp | After trades | After PF | After total R | After avg R | After DD | After TP1/TP2/SL/Exp | Readout |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Live-like | 38 | 1.29 | 3.50 | 0.09 | 2.70 | 10 / 1 / 12 / 15 | 40 | 1.12 | 1.50 | 0.04 | 3.00 | 12 / 1 / 13 / 14 | Lower sample; slightly worse, not optimized. |
| Balanced | 38 | 1.29 | 3.50 | 0.09 | 2.70 | 10 / 1 / 12 / 15 | 40 | 1.12 | 1.50 | 0.04 | 3.00 | 12 / 1 / 13 / 14 | Same as live-like. |
| Aggressive | 45 | 1.43 | 7.80 | 0.17 | 6.00 | 16 / 3 / 18 / 8 | 50 | 1.28 | 5.60 | 0.11 | 4.20 | 20 / 3 / 20 / 7 | DD improved; profit softened. |

## Cross-window validation

| Window | Preset | CB 15m before | CB 15m after | Readout |
| --- | --- | --- | --- | --- |
| Previous 90d (`2025-03-10T15:10:00.000Z` → `2025-06-08T15:10:00.000Z`) | Live-like/Balanced | 145 trades, PF 0.91, -5.50R, avg -0.04R, DD 10.40R | 151 trades, PF 0.91, -6.00R, avg -0.04R, DD 11.00R | No improvement; regime remained weak. |
| Previous 90d | Aggressive | 176 trades, PF 1.10, +7.80R, avg 0.04R, DD 11.20R | 192 trades, PF 1.25, +18.95R, avg 0.10R, DD 7.10R | Aggressive benefited materially but remains research-only due to mode variance. |
| Earlier 90d (`2024-12-09T15:10:00.000Z` → `2025-03-10T15:10:00.000Z`) | Live-like/Balanced | 142 trades, PF 1.12, +6.00R, avg 0.04R, DD 11.10R | 147 trades, PF 1.13, +7.00R, avg 0.05R, DD 11.00R | Small improvement. |
| 180d ending fixture end | Live-like | 286 trades, PF 1.06, +6.30R, avg 0.02R, DD 11.90R | 300 trades, PF 1.09, +10.00R, avg 0.03R, DD 11.00R | Modest improvement, still regime-sensitive. |
| Full fixture | Live-like | not re-run pre-change in this phase | 1059 trades, PF 1.07, +28.00R, avg 0.03R, DD 19.50R | Profitable but noisy over the full fixture. |

## Preservation checks

90-day live-like preservation checks after tuning:

| Strategy/timeframe | Trades | PF | Total R | Avg R | Max DD R | Confirmation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| MicroScalper 15m | 762 | 1.32 | 104.57 | 0.14 | 10.95 | Unchanged vs baseline. |
| MicroScalper 5m | 1633 | 1.21 | 154.37 | 0.09 | 17.85 | Unchanged vs baseline. |
| SwingContinuation 15m | 301 | 1.35 | 43.90 | 0.15 | 10.20 | Unchanged vs baseline. |
| SwingContinuation 1h | 79 | 1.41 | 13.80 | 0.17 | 8.20 | Unchanged vs baseline. |

## Phase 1D conclusion

CompressionBreakout 15m improved on the target 90-day window without lowering entry standards:

- PF improved from 1.29 to 1.35.
- Total R improved from +14.10R to +17.00R.
- Avg R improved from +0.10R to +0.11R.
- Max DD moved from 5.00R to 6.00R, inside the requested controlled range.
- Expired trades dropped from 48 to 38.
- TP1 hits increased from 42 to 60.

However, cross-window validation remains mixed: live-like/balanced did not improve in the previous 90-day regime, and full-fixture PF remains only 1.07. CompressionBreakout 15m should be preserved as an improved research/backtest candidate, but it should remain research-only / monitor before any live scanner tuning. Aggressive should not be preferred despite some cross-window improvements because it still carries wider drawdown/noise.

## Updated recommended tuning order

1. Preserve MicroScalper 15m unchanged as the strongest validated candidate.
2. Keep MicroScalper 5m unchanged; profitable but noisy.
3. Keep SwingContinuation 15m research-only from Phase 1C; do not port live yet.
4. Continue monitoring CompressionBreakout 15m with the Phase 1D TP1 geometry; next work should focus on regime/fakeout filters, not looser score/RR.
5. Treat CompressionBreakout 1h as research/monitoring only due to lower sample and mixed safety impact.
6. Revisit SwingContinuation cross-window robustness only after CompressionBreakout 15m fakeout/regime diagnostics are stronger.

## Manual verification steps

1. Open Backtest Lab and select `CompressionBreakout` with the ETHUSDT 5m fixture.
2. Run the 90-day window ending `2025-09-06T15:10:00.000Z` for live-like/balanced/aggressive.
3. Confirm CompressionBreakout 15m live-like/balanced show approximately 148 trades, PF 1.35, +17.00R, max DD 6R.
4. Confirm MicroScalper and SwingContinuation rows match their baseline preservation metrics.
5. Confirm no live scanner or DB `strategy_config` changes are present in the diff.
