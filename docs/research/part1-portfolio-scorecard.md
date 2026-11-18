# Saved-ledger portfolio diagnostics

No candle data was downloaded. 822 unique closed source trades across 11/16 configurations; 10 canonical full reports are absent from the saved checkout. Each row shares one cash ledger, freezes risk at entry, excludes duplicate symbol exposure, applies USD buckets, calendar entry gates and the same House-Money function as execution. Costs/funding are already netted in source R and are scaled linearly.

**These are partial-coverage diagnostics, not a verified all-16 portfolio or firm-passing probability.** DD is realized-close drawdown, a lower bound on intratrade equity drawdown. Open-at-end positions are unmarked. Restricted Prop exposure crossing Friday needs a recorded Friday exit fill; missing fills produce N/A rather than using the later exit. Phase days show +8% then a further +5% from the phase-change balance; no minimum-day/firm handoff assumptions are invented. Funded columns show 14/21-day realized returns only. Windows reuse source periods and must not be pooled as independent evidence.

| Start / window | Tier | Coverage | Realized return % | Realized DD % | Days +8 / +5 complete | Funded 14 / 21d % | Unpriced Friday / end-open |
|---|---|---:|---:|---:|---:|---:|---:|
| 2025-04-01 / 30d | PERSONAL | 7/16 | 22.16 | 7.47 | — / — | — | 0 / 1 |
| 2025-04-01 / 30d | PROP_CHALLENGE_PASS | 7/16 | 14.62 | 1.80 | 6.58 / 10.41 | — | 0 / 0 |
| 2025-04-01 / 30d | PROP_FUNDED_INCOME | 7/16 | N/A | N/A | N/A | — | 2 / 1 |
| 2025-06-01 / 30d | PERSONAL | 8/16 | 3.88 | 6.18 | — / — | — | 0 / 1 |
| 2025-06-01 / 30d | PROP_CHALLENGE_PASS | 8/16 | N/A | N/A | N/A | — | 5 / 1 |
| 2025-06-01 / 30d | PROP_FUNDED_INCOME | 8/16 | N/A | N/A | N/A | — | 9 / 2 |
| 2026-08-01 / 30d | PERSONAL | 7/16 | -4.21 | 7.97 | — / — | — | 0 / 1 |
| 2026-08-01 / 30d | PROP_CHALLENGE_PASS | 7/16 | N/A | N/A | N/A | — | 2 / 0 |
| 2026-08-01 / 30d | PROP_FUNDED_INCOME | 7/16 | N/A | N/A | N/A | — | 8 / 1 |
| 2026-10-01 / 30d | PERSONAL | 7/16 | -4.19 | 9.58 | — / — | — | 0 / 0 |
| 2026-10-01 / 30d | PROP_CHALLENGE_PASS | 7/16 | N/A | N/A | N/A | — | 3 / 0 |
| 2026-10-01 / 30d | PROP_FUNDED_INCOME | 7/16 | N/A | N/A | N/A | — | 6 / 0 |
| 2025-04-01 / 60d | PERSONAL | 7/16 | 15.93 | 11.14 | — / — | — | 0 / 2 |
| 2025-04-01 / 60d | PROP_CHALLENGE_PASS | 7/16 | 14.62 | 1.80 | 6.58 / 10.41 | — | 0 / 0 |
| 2025-04-01 / 60d | PROP_FUNDED_INCOME | 7/16 | N/A | N/A | N/A | — | 7 / 0 |
| 2025-06-01 / 60d | PERSONAL | 8/16 | 4.60 | 6.62 | — / — | — | 0 / 2 |
| 2025-06-01 / 60d | PROP_CHALLENGE_PASS | 8/16 | N/A | N/A | N/A | — | 7 / 2 |
| 2025-06-01 / 60d | PROP_FUNDED_INCOME | 8/16 | N/A | N/A | N/A | — | 16 / 3 |
| 2026-07-05 / 60d | PERSONAL | 4/16 | -7.03 | 10.95 | — / — | — | 0 / 5 |
| 2026-07-05 / 60d | PROP_CHALLENGE_PASS | 4/16 | N/A | N/A | N/A | — | 3 / 0 |
| 2026-07-05 / 60d | PROP_FUNDED_INCOME | 4/16 | N/A | N/A | N/A | — | 11 / 3 |
| 2026-09-01 / 60d | PERSONAL | 7/16 | -5.15 | 13.40 | — / — | — | 0 / 0 |
| 2026-09-01 / 60d | PROP_CHALLENGE_PASS | 7/16 | N/A | N/A | N/A | — | 11 / 0 |
| 2026-09-01 / 60d | PROP_FUNDED_INCOME | 7/16 | N/A | N/A | N/A | — | 20 / 0 |
