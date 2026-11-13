# Implementation and reproduction

## Changes

- Admin Prop page begins with practical passing and payout comparisons: counts, percentages, successful-outcome timing ranges, fees from challenge versus funded stage, funded capital/target comparisons, horizon censoring, monthly net cycles and rejected new families.
- Account onboarding accepts first and subsequent payout waits in days. Values are integers 1–60; the matched FTMO Swing preset remains 14/14. Approved account settings are required before a new first cycle is captured.
- `20261113160000_prop_payout_window_profiles.sql` adds a captured cycle wait. Editing account rules cannot shorten a running wait. Existing cycles retain 14 days. An explicit admin cycle reset captures the approved repeat period; it still requires fresh flat provider observations and does not turn trading on or reset losses.
- The migration replaces the latest cutoff observer/reset definitions, preserving account ownership, demo-only provider scope, $25k original capital cap, paused entry invalidation, close/cancel retries, uncertainty checks, flat confirmation and explicit reset reference.
- Historical replay supports five minimum entry days and a research-only 1% target. These optional inputs do not change default runtime targets, risk bounds, production strategy releases or credentials.
- Two research catalogue definitions add Gold trend pullback and Yen London range breakout. London uses Europe/London DST and only the complete past Asian range; fixtures are native broker candles. Both remain disabled. They do not receive calibration, customer release or execution authority.

## Evidence counts

- 576 original bundle/capital/risk/time-frontier cohorts.
- 612 initial-funded cohorts.
- 144 split evaluation/funded-risk cohorts.
- 12 stricter five-day check cohorts (overlap with other sensitivity cases).
- 90 recurring campaigns, each with its complete cycle path.
- 240 canonical new-family campaign cohorts.
- 864 parameter configurations / 1,728 approximate cases; these are screening evidence, not canonical confirmations.

Counts include sensitivity variants and overlapping starts, not independent trials. Full output is compressed in this directory. Native data files remain in the acquisition location referenced by the manifests; reproduction requires those same licensed/source broker files. No fabricated or future candles are substituted.

Canonical archive digest: `586e6233a9756fd399eaf80b7b1d7aa4ccd6416ba25c5aa02ce2fe76789dfba9`, calculated from sorted shared TypeScript paths + bytes, then `scripts/research/run-frequency-audit.ts` path + bytes. The publisher verifies both completed scanner report digests against this source archive before writing deliverables. Later payout-clock and campaign accounting changes are recorded in this commit separately from that scanner snapshot.

## Local reproduction

Run from repository root with existing acquired broker data:

```sh
node --import tsx scripts/research/launch/prop-time-frontier.ts REVIEWED_FULL 25000
node --import tsx scripts/research/launch/prop-funded-frontier.ts 25000
node --import tsx scripts/research/launch/prop-five-day-check.ts
node --import tsx scripts/research/launch/prop-balanced-plan.ts 0.25
node --import tsx scripts/research/launch/prop-solution-cycles.ts 0.25
node --import tsx scripts/research/launch/prop-new-solution-evaluation.ts GOLD_TREND
node --import tsx scripts/research/launch/prop-new-solution-evaluation.ts YEN_LONDON
node --import tsx scripts/research/launch/prop-new-solution-evaluation.ts COMBINED
python3 scripts/research/launch/publish-prop-solution.py
npm run test:mission2
npm run test:operations-readiness
npm run typecheck
npm run check:edge-bundles
npm run build:web
```

The publisher expects all completed variants; inspect runner CLI arguments for capital, profile and risk sweeps. `all-scenarios.json.gz` retains those exact prior outputs. Selection assumptions are preserved in `frozen-plan.json` inside that compressed report; canonical runner options and source hashing are preserved in the source archive. The native fixture generator is reproducible from the same acquisition files.

## Activation boundary

Code and SQL are prepared for the existing PR. They are not applied to hosted Supabase and no broker account is activated. Apply parent migrations including funded profit cutoff, then the payout wait migration, and deploy the matching functions, frontend and MT5 agent through the normal activation path. Existing-cycle clocks deliberately do not change retroactively. For an account that requires a 21-day first wait, set and approve its profile before initializing that cycle.

No payment, price, customer entitlement, provider secret, schedule, Telegram delivery or live position was changed. General subscription-expiry closure remains a separate earlier gap; this work does not establish paid live execution readiness. Browser verification is not claimed: the earlier Chromium launch was blocked by a sandbox UNIX socket restriction. Type/build and domain/database checks are recorded below when complete.

## Completed local checks

- Shared historical/scanner engine: 84 tests passed.
- Operations TypeScript: 140 tests passed; embedded PostgreSQL: 26 tests passed; operations Python: 8 tests passed.
- App TypeScript and Vite web production build passed. Existing large-chunk warnings remain.
- 39 edge-function dependency bundles passed; bundling does not execute hosted imports.
- Canonical evidence publisher verified both source digests and completed report states.
- No new browser pass or hosted activation is claimed.
