# Engineering and reproduction

## Scope

This change adds a bounded Prop speed/edge study and an admin comparison. It does not deploy, enable a provider, change payments or expand customer risk limits. The unrelated admin-surface audit and generated Python caches are excluded.

Research-only account policies require the existing isolated synthetic customer, `historical:` identity and DEMO context, plus the new explicit `SIZING_AND_STATIC_20261113` marker. Under that marker alone, risk can reach 2%, effective leverage 30, open risk 3%, daily cap 4.5% and total cap 9%. Existing research defaults and production bounds are unchanged. Real customer inputs, unmarked larger policies and LIVE contexts are rejected.

Static research retains the actual observed peak in account context, computes losses against initial capital, and omits the separate peak-to-equity cap only for the isolated static policy. It never fabricates a lower high-water mark. Daily drawdown uses the original-capital denominator. Actual firm-limit observation, adverse OHLC equity, margin, quantity steps, entry expiry, costs, one position per symbol and account exposure still apply.

Phase banking closes at a modeled executable target buffer before minimum days finish, preserves the required day count, reduces risk on later genuine qualified setups, skips another completion entry on an already counted day, and resets state only at the existing phase handoff. It is a historical account behavior, not a claim that the deployed terminal manages phase transitions.

## Production risk fix

The MT5 Prop Brain's drawdown-preservation branch previously used a 0.10% floor after halving risk. A request of 0.05% could therefore be raised instead of reduced. Version **1.1.1** removes that floor, retains six decimal places, and caps the result at the already-authorized risk. Tests cover 0.05%, 0.01% and 0.001% requests in actual Prop Brain evaluation. This changes no policy maxima and never increases quantity authority.

Market performance figures were measured before this final monotonic-risk fix and are preserved with their frozen source. No profitability improvement is attributed to that correction. Use `account-study-source.tar.gz` in an isolated reproduction checkout to reproduce the archived account experiment behavior; `capacity-source.tar.gz` is the independently hash-verified scanner source for the matched probe. Later banking is opt-in, so it does not retroactively alter the unbanked scenarios. The sources and exact scripts remain available rather than silently rewriting evidence to match a newer engine.

## Runners

From the frozen study checkout with the same acquired, hash-matching native Exness files:

```sh
node --import tsx scripts/research/launch/prop-speed-study.ts DIAGNOSE
NODE_OPTIONS=--max-old-space-size=768 node --import tsx scripts/research/launch/prop-speed-study.ts SEARCH 0
NODE_OPTIONS=--max-old-space-size=768 node --import tsx scripts/research/launch/prop-speed-study.ts EXTRA 0
node --import tsx scripts/research/launch/validate-prop-speed.ts
node --import tsx scripts/research/launch/validate-prop-speed.ts BANKING
node --import tsx scripts/research/launch/validate-prop-speed.ts BANKING_POS3
node --import tsx scripts/research/launch/prop-speed-cycles.ts
node --import tsx scripts/research/launch/prop-speed-cycles.ts STATIC
python3 scripts/research/launch/prop-lowrr-screen.py XAUUSD
python3 scripts/research/launch/prop-lowrr-screen.py EURUSD
python3 scripts/research/launch/prop-lowrr-screen.py USDJPY
node --import tsx scripts/research/launch/prop-capacity-probe.ts
python3 scripts/research/launch/publish-prop-speed.py
```

Run SEARCH shards 0–7 and EXTRA shards 0–1. Earlier rows must total 2,016 groups / 24,192 cohorts. The validator freezes top candidates before later evaluation, writes a separate file for banking and three-position follow-ups, and never overwrites an earlier output as if it were another run. Use no more than two large account search processes concurrently with a 768MB heap bound: the initial wider local batch lost two processes to memory pressure, and both shards were rerun completely and checked for duplicate/missing cases. No incomplete shard is counted.

The low-reward screen is independent C++ accounting, not the account Brain. It uses unique per-symbol compiled libraries to avoid concurrent library replacement. Its daily clock, financing and failure assumptions are not a full firm model. Failed later candidates are not promoted to canonical or customer releases.

## Completed canonical participation probe

```sh
node --import tsx scripts/research/run-frequency-audit.ts venue=exness data=.tmp/launch-research/exness-data frames=5,15,60,240 months=2025-01,2025-02,2025-03,2025-04,2025-05,2025-06,2025-07,2025-08 symbols=USDJPY,GBPUSD,XAUUSD start=2025-03-01T00:00:00Z end=2025-03-31T00:00:00Z strategyIds=gold.native-momentum-15-48-2-5,gold.native-momentum-60-24-2-5,gold.native-band-reentry-15-48-3-5,forex.native-band-reentry-60-12-2-5,forex.native-sweep-retest-60-16-2-5-usdjpy-h72,forex.native-squeeze-15-48-2-3-usdjpy-h12,forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 entry=COMBINED admission=RISK_CAPACITY_ONLY risks=.5 balances=25000 checkpointEvery=1440 out=.tmp/prop-speed/capacity-probe.json
```

The source archive's sorted shared TypeScript paths/bytes followed by runner path/bytes must match the report's engineSourceSha256. The publisher checks that digest, completed status, 30-day period, account group counts and unique study keys before writing public projections. The longer canceled continuous probe is excluded.

The repeated-cycle model assumes an approved withdrawal and newly issued account before a capital/risk reset. A calendar handoff is a scenario, not an observed processing time. No runtime balance or drawdown ledger is reset by this work.

## Deployment status

GitHub Actions are not used. All computation and checks are local, and the commit uses `[skip ci]`. Current Supabase was queried through its connected project API and reported INACTIVE. No database migration is needed for this study, no hosted function was deployed, no Telegram message was sent and no order was submitted. Existing provider/expiry activation work is not marked complete by these tests.

Browser verification is not claimed: the previously observed Chromium UNIX-socket sandbox blocker remains. This delivery uses domain tests, type checking, edge bundling and the production web build; a successful build does not establish a working hosted trading service.

## Final validation

- 89 shared historical/account-engine tests passed, including minimum-day banking and the small-risk regression.
- 140 operations TypeScript tests passed. SQL and Python agent code were unchanged in this turn; their prior checks are not counted as new passes.
- App TypeScript, typed research/account entry points, 39 edge bundles and the Vite production web build passed. Existing large-chunk warnings remain.
- Sixteen headline market scenarios were rerun after the Brain 1.1.1 correction: the 13.816-day pass, later 2%/14-day and 5%/30-day groups, and later 1.5% banking group retained identical target-hit counts and times. The detailed confirmation records the shared-source hash.
- The publisher verifies completed source status, native source lineage, unique cases and exact totals before producing the admin projection.
