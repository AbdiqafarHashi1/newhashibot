# Twelve Prop accounts: passing, profit and request timing

Recommended account: $10,000 original capital, full seven Forex/Gold configurations, maximum two positions, 0.40% evaluation risk and 0.25% funded risk. The weekly starts overlap and use the same retrospective March–August 2025 market history. These percentages describe scenarios, not independent future probabilities.

| Costs | Both phases passed | Request opportunity / all starts | Request opportunity / passed | Passed accounts still net positive at final closed balance |
| --- | --- | --- | --- | --- |
| Baseline | 12/12 = 100% | 11/12 = 91.7% | 11/12 = 91.7% | 11/12 = 91.7% |
| 1.5× modeled costs | 10/12 = 83.3% | 7/12 = 58.3% | 7/10 = 70% | 4/10 = 40% |

Request opportunity checks: at least 14 calendar days since the first funded trade, no open positions, no pending orders, and at least $20 in closed net trading profit. The $20 minimum applies to bank/card requests; cryptocurrency requests require $50. This is a financial-condition observation, not firm approval, agreement compliance or an actual payout. No withdrawals are deducted, and trading continues after the first opportunity. Under stress three accounts subsequently surrendered their earlier request opportunity profits and finished negative.

## Baseline: every weekly start

| Start (2025 UTC) | Days to funded | First request date | Days after first funded trade | First request gross profit | Funded closed profit at end |
| --- | --- | --- | --- | --- | --- |
| 2025-03-01 | 130.5 | 2025-07-27 | 18.3 | $116.20 | $162.04 |
| 2025-03-08 | 95.1 | 2025-06-25 | 14.1 | $354.42 | $668.89 |
| 2025-03-15 | 88.1 | 2025-06-25 | 14.1 | $354.42 | $668.89 |
| 2025-03-22 | 81.1 | 2025-06-25 | 14.1 | $354.42 | $668.89 |
| 2025-03-29 | 74.1 | 2025-06-25 | 14.1 | $354.42 | $668.89 |
| 2025-04-05 | 95.5 | 2025-07-27 | 18.3 | $116.20 | $162.04 |
| 2025-04-12 | 124.5 | Not observed; short history | — | — | $-79.99 |
| 2025-04-19 | 81.7 | 2025-07-27 | 17.7 | $142.43 | $190.46 |
| 2025-04-26 | 62.3 | 2025-07-27 | 27.2 | $135.07 | $183.10 |
| 2025-05-03 | 67.5 | 2025-07-27 | 18.3 | $116.20 | $162.04 |
| 2025-05-10 | 60.5 | 2025-07-27 | 18.3 | $116.20 | $162.04 |
| 2025-05-17 | 53.5 | 2025-07-27 | 18.3 | $116.20 | $162.04 |

The gross profit figures precede the firm's reward split and do not represent cash received. First request dates are when the simulated financial conditions were observable, not promised payment dates. FTMO reviews requests and invoices separately.

## Monthly interpretation

The admin table shows 30-day cumulative closed-profit checkpoints, and records whether positions were open at each checkpoint. These values cannot be described as monthly payouts: no withdrawals, new reward accounts, post-withdrawal resets, processing delays or recurring payout decisions are modeled. Some accounts have insufficient history for even one 30-day funded checkpoint.

## Integrity

The observation pass replays only the 24 recommended $10k challenge cohorts (baseline and stress), reusing the frozen 247-signal canonical stream and hash-checked native bid/ask. It asserts exact equality with the existing 768-campaign result for each final account, all phase metrics and the complete firm-observer state. Adding payout instrumentation therefore did not change decisions, passes or P&L. No GitHub Actions were used. The immutable old reports remain intact; the observation source is versioned with this change.

Machine-readable results: PAYOUT_OBSERVATIONS.json and public/research/prop-payout-20261113.summary.json. Reproduce with `node --import tsx scripts/research/launch/inspect-prop-payouts.ts 10000 1 .tmp/payout-baseline.json` and repeat with cost `1.5`.

Official source, checked 13 November 2026: https://ftmo.com/faq/how-do-i-withdraw-my-profits/
