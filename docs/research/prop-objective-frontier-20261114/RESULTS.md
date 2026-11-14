# Prop objectives: measured frontier, 14 November 2026

## What is wired

13 reviewed configurations: five crypto, four Forex and four Gold. Exact inventory is in inventory.json. These have positive costed historical review periods and shared scanner/demo execution support. Reviews authorize signals and forward demo, not live approval. Installation was not observed. Thirteen configurations are not thirteen independent strategy families. The dynamically trailed Gold RSI model below is research-only and is NOT counted among the thirteen.

## Study

364 primary objective scenarios, 84 baseline scenarios and 84 recurring campaigns. Genuine ordered XAUUSD RawSpread bid/ask quotes, May–12 November 2026, with archive hashes and observed timestamps in compressed results. Strategy selected using earlier May–October research; these overlapping starts reuse that history. Percentages below are retrospective scenario frequencies, not independent pass probabilities or dependable income forecasts.

A $25,000 numerical account uses closed-bar M15 RSI exhaustion, 1.5 ATR/structure stop, 5R target and trailing only after 2R; up to 24-hour holding. Costs include spread, commissions, adverse fills, entry/management delay and adverse daily financing. No target at a mid-price, free fills or monthly capital resets. Numerical UTC loss rules and modeled transitions do not establish compliance with any named firm.

## Funding within 30 calendar days

Both an 8%/5% and a 10%/5% two-phase evaluation were tested, four genuine entry days per phase and a modeled 24-hour transition. The internal guard uses evaluation daily 4.5% / peak loss 9%, funded daily 4% / peak loss 8%.

| Evaluation risk | Evaluation targets | Funded within 30 days | Censored starts | Fastest successful funding |
|---|---|---|---|---|
| 0.5% | 8% / 5% | 0/13 (0.0%) | 2 | None |
| 0.5% | 10% / 5% | 0/13 (0.0%) | 2 | None |
| 1% | 8% / 5% | 4/13 (30.8%) | 2 | 13.47 days |
| 1% | 10% / 5% | 4/13 (30.8%) | 2 | 15.36 days |

1% evaluation risk is an explicitly experimental counterfactual above the current production Prop cap of 0.5%. No cap or customer default changed. With static buffered 9% overall / 4.5% daily rules, the 1% version funded 5/13 starts within 30 days; that different loss model must not be substituted for internal policy. Some scenarios failed over their full follow-up.

## Already funded: target and request eligibility

Goal clock begins at first funded trade. 2% uses 14 days; 5% uses 30 days. A financial target closes positions and stops trading. Earliest modeled request eligibility additionally requires the 14-day wait and observed follow-up. No firm approved or paid these requests. All 13 starts stay in the denominator; partial starts are explicitly censored.

| Risk per trade | Goal | Financial target on time | Earliest modeled request eligible on time | Unresolved financial-target starts |
|---|---|---|---|---|
| 0.25% | 2% | 5/13 (38.5%) | 4/13 (30.8%) | 0 |
| 0.25% | 5% | 1/13 (7.7%) | 1/13 (7.7%) | 1 |
| 0.4% | 2% | 8/13 (61.5%) | 7/13 (53.8%) | 0 |
| 0.4% | 5% | 8/13 (61.5%) | 7/13 (53.8%) | 0 |
| 0.5% | 2% | 9/13 (69.2%) | 8/13 (61.5%) | 0 |
| 0.5% | 5% | 9/13 (69.2%) | 8/13 (61.5%) | 0 |

This is a first-goal study. It does not imply the same frequency every subsequent month. See recurring campaigns next.

## Repeated modeled withdrawals

The recurring study withdraws all flat eligible profit with an assumed 80% customer reward split, a one-day modeled approval delay and at least 14/30 days between cycle starts. Withdrawals reduce peak and day-start equity by the same verified cash flow, preserving drawdown distance. Waiting periods prohibit new entries. Monthly zero-reward periods are retained. Ending open-position costs are included in cash reconciliation; open positions are marked, not falsely closed after history ends. $100 monthly service fees are only a sensitivity, not actual billing.

| Start | Risk | Cutoff | Modeled cycles | Hypothetical customer rewards | Failed guard | Zero-reward full months |
|---|---|---|---|---|---|---|
| 2026-05-01 | 0.25% | 2% | 7 | $2,805.75 | False | 2 |
| 2026-05-01 | 0.25% | 5% | 2 | $2,007.76 | False | 4 |
| 2026-05-01 | 0.4% | 2% | 7 | $2,854.79 | False | 2 |
| 2026-05-01 | 0.4% | 5% | 4 | $4,009.83 | False | 3 |
| 2026-05-01 | 0.5% | 2% | 6 | $2,413.45 | False | 2 |
| 2026-05-01 | 0.5% | 5% | 3 | $3,014.08 | False | 3 |

These are $25,000 reference accounts. Results cannot be scaled into a $500 personal customer promise: minimum lots, financing, spreads and margin constraints differ.

## Decision

The research supports testing a 0.4% funded-risk, 2% stop-and-request profile as a compromise candidate, with 0.5% as a higher-risk comparison. It does not establish dependable 5% monthly payouts or routine 30-day funding. The fastest passing experiments need above-cap evaluation risk; no production limits were relaxed. Do not advertise these model results as live customer returns.

The next implementation gap is the research RSI trailing policy: scanner decision parity, provider-owned stop updates, restart recovery and actual provider demo fills must be verified before making that strategy selectable for execution. Existing thirteen configurations remain available on their reviewed signal/demo terms. Paid live readiness has not been demonstrated by this research.

## Why the existing return is lower

Approved configurations have comparatively thin net expectancy. Lower funded risk, finite eligible opportunities, scanner admission/cooldowns and loss locks reduce realized return. Higher nominal reward ratios do not create winning trades. Prior research measured 203 trades over six months at 0.149R mean expectancy: at 0.25% risk, simple expectancy arithmetic is about 1.26% per month before path/cutoff effects. The stronger RSI trailing research must not be attributed to the approved fixed-management bundle.

## Reproduction and validation

Run `python scripts/research/prop-objective-frontier/run.py --expanded`, `python scripts/research/prop-objective-frontier/recurring.py`, then the publisher. Original baseline used archived engine-v2.cpp; engine-v1.cpp was discarded after a synthetic test found canceled preservation entries. All reported successful studies use the corrected source. Raw source archives are referenced by hash, not committed. Run `python -m unittest discover -s tests/propObjectiveFrontier -v` (nine state/accounting tests). Read-only inventory is reproduced using `node --import tsx scripts/research/prop-objective-frontier/inventory.ts`.

Reference firm terms, not a claim of exact firm simulation: [FTMO two-step objectives](https://ftmo.com/en/2-step-challenge/) and [minimum trading days](https://ftmo.com/en/trading-objectives/page/2/). Different products use different loss and reward conditions. Source feed archive and costs are documented in the protocol/manifests.

No production files, risk defaults, accounts, payments, Telegram messages or workflows were changed by this study.
