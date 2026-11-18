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
