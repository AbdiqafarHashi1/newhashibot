# Saved-ledger portfolio diagnostics

Recovered hash-matched original backtest reports; Friday pricing uses recorded native exit-side marks and cached paired vendor candle closes. 1159 unique closed source trades across 16/16 configurations; 0 canonical full reports remain absent from the saved checkout. Each row shares one cash ledger, freezes risk at entry, excludes duplicate symbol exposure, applies USD buckets, calendar entry gates and the same House-Money function as execution. Costs/funding are already netted in source R and are scaled linearly.

**All 16 configurations now have saved ledgers. Coverage below counts configurations whose original test period contains the entire row window; unequal original periods still prevent an all-16 same-window claim.** DD is realized-close drawdown, a lower bound on intratrade equity drawdown. Open-at-end positions are unmarked. Restricted Prop FX/Metals positions use the saved Friday liquidation scenario with original entry costs, accrued carry, exit commission/slippage, currency conversion and prior partial exits. Missing fresh marks on closed holiday sessions still produce N/A. Hourly vendor candle-close timestamps are reference prices, not evidence of last-tick freshness or executable fills. Phase days show +8% then a further +5% from the phase-change balance; no minimum-day/firm handoff assumptions are invented. Funded columns show 14/21-day realized returns only. Windows reuse source periods and must not be pooled as independent evidence. Repricing saved entries cannot reconstruct extra replacement entries that the original account Brain rejected.

| Start / window | Tier | Coverage | Realized return % | Realized DD % | Days +8 / +5 complete | Funded 14 / 21d % | Unpriced Friday / end-open |
|---|---|---:|---:|---:|---:|---:|---:|
| 2025-04-01 / 30d | PERSONAL | 11/16 | -0.64 | 10.08 | — / — | — | 0 / 2 |
| 2025-04-01 / 30d | PROP_CHALLENGE_PASS | 11/16 | N/A | N/A | N/A | — | 1 / 1 |
| 2025-04-01 / 30d | PROP_FUNDED_INCOME | 11/16 | 5.72 | 1.38 | — / — | 5.72 / 5.72 | 0 / 0 |
| 2025-06-01 / 30d | PERSONAL | 13/16 | 10.59 | 7.34 | — / — | — | 0 / 1 |
| 2025-06-01 / 30d | PROP_CHALLENGE_PASS | 13/16 | 1.85 | 5.11 | — / — | — | 0 / 1 |
| 2025-06-01 / 30d | PROP_FUNDED_INCOME | 13/16 | 5.50 | 4.98 | — / — | -1.15 / 1.65 | 0 / 0 |
| 2026-08-01 / 30d | PERSONAL | 8/16 | -4.23 | 8.52 | — / — | — | 0 / 1 |
| 2026-08-01 / 30d | PROP_CHALLENGE_PASS | 8/16 | -2.72 | 6.02 | — / — | — | 0 / 0 |
| 2026-08-01 / 30d | PROP_FUNDED_INCOME | 8/16 | -1.23 | 4.56 | — / — | -3.18 / -1.68 | 0 / 1 |
| 2026-10-01 / 30d | PERSONAL | 8/16 | -5.67 | 10.57 | — / — | — | 0 / 0 |
| 2026-10-01 / 30d | PROP_CHALLENGE_PASS | 8/16 | -1.31 | 5.98 | — / — | — | 0 / 0 |
| 2026-10-01 / 30d | PROP_FUNDED_INCOME | 8/16 | -2.97 | 6.15 | — / — | -4.37 / -6.14 | 0 / 0 |
| 2025-04-01 / 60d | PERSONAL | 11/16 | 6.45 | 10.08 | — / — | — | 0 / 1 |
| 2025-04-01 / 60d | PROP_CHALLENGE_PASS | 11/16 | N/A | N/A | N/A | — | 1 / 1 |
| 2025-04-01 / 60d | PROP_FUNDED_INCOME | 11/16 | 6.85 | 2.76 | — / — | 5.72 / 5.72 | 0 / 2 |
| 2025-06-01 / 60d | PERSONAL | 13/16 | 20.95 | 7.34 | — / — | — | 0 / 2 |
| 2025-06-01 / 60d | PROP_CHALLENGE_PASS | 13/16 | 15.73 | 5.11 | 39.91 / 46.27 | — | 0 / 0 |
| 2025-06-01 / 60d | PROP_FUNDED_INCOME | 13/16 | N/A | N/A | N/A | — | 1 / 0 |
| 2026-07-05 / 60d | PERSONAL | 4/16 | -8.48 | 11.48 | — / — | — | 0 / 5 |
| 2026-07-05 / 60d | PROP_CHALLENGE_PASS | 4/16 | -7.70 | 7.70 | — / — | — | 0 / 0 |
| 2026-07-05 / 60d | PROP_FUNDED_INCOME | 4/16 | -5.48 | 6.71 | — / — | -1.80 / -2.95 | 0 / 3 |
| 2026-09-01 / 60d | PERSONAL | 8/16 | -3.04 | 11.07 | — / — | — | 0 / 0 |
| 2026-09-01 / 60d | PROP_CHALLENGE_PASS | 8/16 | 9.80 | 4.99 | 10.00 / — | — | 0 / 0 |
| 2026-09-01 / 60d | PROP_FUNDED_INCOME | 8/16 | 1.43 | 6.48 | — / — | 4.90 / 4.10 | 0 / 0 |

## Diagnostic 1 — per-strategy contribution

The source columns cover all **1,159 unique completed, originally account-admitted trades**, including source dates outside the scorecard windows. Source win rate, R-based profit factor and loss streak are calculated in chronological exit order across each configuration's saved periods; breakeven resets a streak. Open source positions are outside this completed-trade inventory. The simulation columns cover the existing **24 portfolio rows**, so overlapping windows and tiers repeat the same trade; their totals are not independent observations. Sim admissions include entries still open or subsequently unpriced. Sim net R includes only recorded realized closes, including Friday repricing.

Account contribution is the **mean percentage-point contribution per $10,000 window account**, separately for Personal / Challenge / Funded (P / C / F): sum of strategy realized cash P&L across that tier's eight windows / $80,000 × 100. These contributions reconcile to the mean stored numeric returnPct, including the known cash subtotals behind the three N/A rows; they are not complete marked returns or monthly forecasts. Worst Prop contribution DD is the largest peak-to-trough decline of that strategy's cumulative realized cash contribution in any individual Prop window, as percentage points of initial capital. It is not marginal portfolio drawdown, intratrade equity DD, or a causal removal experiment.

Flags identify negative source or simulated net R, a negative mean contribution in either Prop tier, or worst Prop contribution DD ≥5pp. The 5pp cutoff is a diagnostic reporting choice, not a change to risk rules. Flags identify candidates for a separate preset review; **no configurations or presets are changed**. Incomplete date coverage and missing Friday prices limit the comparison.

| Strategy | Symbol / TF | Source / sim admitted | Source win % | Source PF (R) | Source / sim net R | Mean account pp P / C / F | Source max losses | Worst Prop contribution DD pp | Diagnostic flag |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `gold.rsi-trailing-15-48-1.5-5-h96` | XAUUSD / 15m | 134 / 207 | 40.30 | 1.28 | +22.59 / -11.23 | -0.995 / -0.635 / -0.085 | 7 | 4.94 | negative sim R; negative Prop contribution |
| `gold.frontier-compression-15-24-1.5-5-h96` | XAUUSD / 15m | 83 / 124 | 24.10 | 1.08 | +5.37 / +11.52 | -0.228 / +1.259 / -0.435 | 9 | 3.12 | negative Prop contribution |
| `crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006` | DOGEUSDT / 5m | 47 / 84 | 55.32 | 1.22 | +3.94 / +8.60 | -0.101 / -0.223 / +0.338 | 3 | 1.67 | negative Prop contribution |
| `crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006` | LTCUSDT / 15m | 48 / 52 | 52.08 | 1.31 | +4.57 / +1.96 | +0.005 / +0.019 / +0.037 | 4 | 0.76 | — |
| `crypto.launch-trend-pullback-48-2-3-h72` | USDT basket (10) / 4h | 116 / 40 | 31.90 | 1.18 | +14.58 / -3.86 | -0.265 / -0.676 / -0.073 | 10 | 1.64 | negative sim R; negative Prop contribution |
| `crypto.launch-rsi2-48-3-3-h72` | USDT basket (10) / 4h | 86 / 80 | 43.02 | 1.18 | +8.41 / -1.92 | -0.504 / +0.296 / +0.103 | 10 | 1.95 | negative sim R |
| `forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008` | GBPUSD / 15m | 37 / 69 | 51.35 | 1.91 | +12.46 / +10.08 | -0.579 / +0.098 / +0.315 | 5 | 2.51 | — |
| `forex.native-squeeze-15-48-2-3-usdjpy-h12` | USDJPY / 15m | 48 / 20 | 56.25 | 1.34 | +5.97 / -6.09 | -0.248 / -0.145 / +0.007 | 3 | 0.53 | negative sim R; negative Prop contribution |
| `forex.native-sweep-retest-60-16-2-5-usdjpy-h72` | USDJPY / 1h | 46 / 34 | 23.91 | 1.09 | +3.30 / +42.18 | +2.039 / +0.445 / +0.618 | 11 | 1.74 | — |
| `crypto.launch-trend-pullback-48-1.5-5` | USDT basket (10) / 4h | 109 / 123 | 24.77 | 1.49 | +42.45 / +20.54 | +0.620 / -0.983 / -0.456 | 14 | 3.98 | negative Prop contribution |
| `forex.native-band-reentry-60-12-2-5` | USDJPY / 1h | 43 / 60 | 34.88 | 1.38 | +10.28 / +21.32 | +2.075 / +0.829 / -0.001 | 6 | 1.49 | negative Prop contribution |
| `gold.native-band-reentry-15-48-3-5` | XAUUSD / 15m | 47 / 48 | 34.04 | 1.43 | +13.65 / +27.54 | +0.597 / -0.013 / +0.475 | 10 | 1.80 | negative Prop contribution |
| `gold.native-momentum-15-48-2-5` | XAUUSD / 15m | 101 / 103 | 27.72 | 1.44 | +32.37 / +22.98 | -0.442 / +0.937 / +1.543 | 7 | 3.58 | — |
| `gold.native-momentum-60-24-2-5` | XAUUSD / 1h | 37 / 19 | 40.54 | 1.78 | +17.05 / +5.54 | +0.207 / +0.457 / +0.076 | 4 | 0.79 | — |
| `crypto.complementary-ema-pullback` | ETHUSDT / 1h | 104 / 94 | 49.04 | 1.30 | +15.37 / +20.90 | +0.376 / -0.414 / +0.262 | 5 | 2.21 | negative Prop contribution |
| `forex.complementary-ema-pullback` | XAUUSD / 1h | 73 / 37 | 46.58 | 1.26 | +10.45 / -6.77 | -0.568 / -0.088 / -0.018 | 8 | 0.89 | negative sim R; negative Prop contribution |

USDT basket (10): BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT, AVAXUSDT, LTCUSDT.

## Diagnostic 2 — risk engine and weekend gate audit

The saved JSON records aggregate portfolio results, not event-level risk decisions. The counts below were recovered by observing an offline reconstruction of the existing simulator on the saved ledgers, using its unchanged risk functions, event order and window dates. All 24 reconstructed result objects match the saved JSON exactly. No candles were downloaded and no tests/lint, strategies, risk rules, migrations, UI or original scorecard rows were changed.

Counts are **attempt/event occurrences across overlapping windows**, not unique real-world signals. Risk scaling counts apply only to actually admitted entries. Scaled-up means pre-weekend assigned risk above the ordinary tier base (1.00% / 0.85% / 0.45%). Loss/DD throttling means pre-weekend risk below that base. Weekend throttling records the 0.75× multiplier; it can overlap both escalation and loss/DD throttling. The union row avoids double-counting the two throttle reasons. A funded two-loss reduction is included under loss/DD throttling. Lock counts include later attempts blocked by a latched lock, not just first lock activations.

| Event / decision | Personal (8 windows) | Challenge (8) | Funded (8) | Total (24) |
|---|---:|---:|---:|---:|
| Admitted simulated entries | 513 | 256 | 425 | 1194 |
| Scaled up: pre-weekend risk above tier base | 36 | 34 | 0 | 70 |
| Throttled: loss/DD or weekend (union) | 346 | 141 | 198 | 685 |
| ↳ Loss/DD throttle | 334 | 119 | 179 | 632 |
| ↳ 0.75× weekend crypto multiplier | 21 | 22 | 21 | 64 |
| Blocked: daily loss lock | 1 | 0 | 0 | 1 |
| Blocked: total/peak DD lock | 0 | 96 | 0 | 96 |
| Blocked: challenge phase target lock | 0 | 61 | 0 | 61 |
| Blocked: funded monthly target lock | 0 | 0 | 310 | 310 |
| Blocked: stale/invalid risk evidence | 0 | 0 | 0 | 0 |
| Blocked: weekend entry gate | 92 | 92 | 92 | 276 |
| Blocked: existing same-symbol position | 261 | 144 | 228 | 633 |
| Blocked: portfolio/USD exposure capacity | 395 | 613 | 207 | 1215 |
| Friday FX/Metals positions closed and priced | 0 | 16 | 28 | 44 |
| Friday positions requiring close, price unavailable | 0 | 2 | 1 | 3 |
| Friday pending orders canceled | N/A | N/A | N/A | Not modeled / not recorded |

Friday close counts are admitted FX/Metals positions actually repriced and removed, not all 90 priced source records. Unpriced close requirements are separate and do not imply successful execution. The simulation has no pending-order lifecycle, so cancellation counts cannot be established from these inputs; N/A does not mean zero. Historical risk evidence uses each replay event's timestamp, so zero stale-evidence rejections does not audit production account-feed freshness. This is an audit of the existing replay, not proof that every live gate was exercised.
