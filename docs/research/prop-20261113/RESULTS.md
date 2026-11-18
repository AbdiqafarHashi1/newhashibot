# Prop campaign results — 13 November 2026

The implementation is ready for Prop demo forward testing. The preferred tested setup is **FTMO 2-Step Swing, all seven reviewed Forex/Gold configurations, two simultaneous positions, 0.40% maximum challenge/verification risk and 0.25% funded risk**. Lot sizing, available margin and portfolio controls can reduce actual risk. This recommendation was selected retrospectively from the disclosed campaign; it needs forward observation on the intended provider before paid live operation is represented as verified.

## Actual replay

The canonical scanner, conditional confirmations and arbitration produced 247 confirmations from 1 March through 31 August 2025. The campaign then recomputed account decisions on native reference bid/ask for 768 account scenarios: two strategy selections, two position caps, two capitals, two cost assumptions and twelve weekly starts. Challenge runs compare three risk settings; separate funded runs use 0.25%. All starts overlap in the same six-month market window, so they are correlated scenarios rather than independent probability estimates. January–February supplied warmup; the tested strategy selection had already seen this broader research period.

### Recommended full bundle, two positions

| Capital | Challenge risk | Costs | Both phases passed | Unfinished | Firm loss breaches | Median days to funded among passes | Passed accounts observed funded 30 days |
| --- | --- | --- | --- | --- | --- | --- | --- |
| $10,000 | 0.40% | baseline | 12/12 | 0 | 0 | 81.7 | 11; 1 short |
| $10,000 | 0.40% | 1.5× | 10/12 | 2 | 0 | 111.6 | 4; 6 short |
| $100,000 | 0.40% | baseline | 11/12 | 1 | 0 | 77.8 | 11 |
| $100,000 | 0.40% | 1.5× | 8/12 | 4 | 0 | 87.5 | 8 |

Every cohort in these rows passed phase one; unfinished accounts were still in verification. The worst drawdown across every phase in these four arms was 5.74% of that phase's equity peak. Account resets are separate ledgers, with a 24-hour assumed administrative handoff. Passing includes flat, realized net profit targets and four genuine entry days per evaluation phase. No account that missed a target is counted as passed.

### Already-funded accounts, full bundle, two positions, 0.25% risk

| Capital | Costs | Traded / starts | Survived 90 days | Survived 180 days / insufficient history | Observed period return range | Worst equity drawdown |
| --- | --- | --- | --- | --- | --- | --- |
| $10,000 | baseline | 12/12 | 12/12 | 1 / 11 | +9.60% to +15.97% | 3.34% |
| $10,000 | 1.5× | 12/12 | 12/12 | 1 / 11 | +8.70% to +13.63% | 3.38% |
| $100,000 | baseline | 12/12 | 12/12 | 1 / 11 | +12.83% to +20.16% | 4.01% |
| $100,000 | 1.5× | 12/12 | 12/12 | 1 / 11 | +11.35% to +17.79% | 4.11% |

Return ranges cover different observation lengths as later starts end on the same last quote; these are neither annualized returns nor payout records. Already-funded survival is separate evidence from accounts that first completed the challenge. None of the newly passed accounts had 90 days of subsequent funded history in this window. No withdrawals or payout cycles are modeled.

## What the alternatives taught us

The intraday-only selection produced fewer complete challenges; the full diversified bundle is preferred. Higher 0.50% challenge risk did not improve both capitals consistently, especially under costs. A third position also did not improve both capitals consistently. Keep two positions and 0.40% as the recommendation rather than selecting whichever individual row looks best. Full results retain every alternative, unfinished attempt and cost arm.

## Buyer implementation

- Prop entry preserves login routing and saved onboarding. Buyers select Challenge, Verification or Already funded; funded drafts receive the funded account policy before Brain assignment.
- Account controls provide the explicit FTMO Swing rule profile and the seven-strategy selection, plus an optional intraday comparator. Permissions are tied to matching program terms. Different firms/programs require their own rules.
- Prop Brain 1.1.0 reduces position risk when available margin cannot support full size, using actual provider contract/currency information. Loss controls, expiry, customer isolation and final quantity checks remain authoritative.
- Fixed the daily-reset calculation that could incorrectly carry earlier days' losses into a fresh day's lock. Preserved overall high-water protections. Fixed replay phase-reset boundary handling and added regression coverage.
- Admin Prop shows the actual challenge and funded tables, cost stress, unfinished counts and horizon censoring.

## Verification and activation boundary

Local checks passed: 75 historical-engine tests, 135 operations tests, 24 database endpoint tests, 46 phase-P tests, app TypeScript, 39 edge dependency bundles and the production build. The current UI has not been browser-tested in this environment. No new GitHub Actions were run. No backend, account, payment, Telegram delivery or trading schedule was activated. Supabase/provider deployment and a real demo forward run are still required to verify operation outside simulation.

FTMO's maximum allocation applies per trader or strategy, including substantially similar third-party trading. Do not market unlimited replicated accounts or guaranteed challenge completion. Exact official rules and limitations are linked in PROTOCOL.md.

## Evidence and reproduction

- `cohorts.json.gz`: all 768 account results, phase records and summaries.
- `summary.json`: admin-facing summary with full-report, engine and source hashes.
- `scanner.json.gz`: completed canonical signal stream and native data manifests.
- `scanner-source.tar.gz`: exact shared scanner source used for the frozen replay; source identity is recorded in the scanner report.

Run `run-frequency-audit.ts` using the seven IDs in `PROP_STRATEGY_BUNDLES.ALL_TESTED` and the period/data in PROTOCOL.md. For the account campaign:

```sh
node --import tsx scripts/research/launch/run-prop-campaign.ts input=docs/research/prop-20261113/scanner.json.gz out=.tmp/prop-cohorts.json capitals=10000,100000 starts=12 spacingDays=7 risks=.25,.4,.5 fundedRisk=.25 positions=2,3 costs=1,1.5 bundles=ALL_TESTED,INTRADAY phases=CHALLENGE,FUNDED
```

Native archives default to `.tmp/launch-research/exness-data`; each file must match the recorded SHA-256. Independent bundle/position/capital arms can run in parallel and be combined with `merge-prop-campaign.ts`, which rejects mismatched source/engine/protocol identities or duplicate cohorts. `publish-prop-campaign.ts` writes the compressed evidence and public admin summary.
