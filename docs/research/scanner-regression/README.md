# Scanner participation regression audit — 28 October 2026

**A real replay participation mismatch is corrected. Four profitable live strategies have not been established. No deployment, SQL, schedule, message, payment, order or strategy promotion.**

## Product requirement retained

The required product is a multi-asset signal service with at least four complementary strategies sharing one scanner/arbitrator, useful aggregate participation and measured quality after costs. A slow two-asset spot hypothesis is a separate research lead; it does not replace that requirement. One qualified alert per day is a measured participation target across the full calendar, not a reason to force a bad trade or relabel a research selection as certified.

## What actually changed

Recovered scanner commit `cacaf8f49fd0c9fcca9de717d7b80f962e14ac63` (31 July 2026) contains the four crypto evaluators MicroScalper, QuickScalp, CompressionBreakout and SwingContinuation, alongside Forex/Gold and research definitions. Both source snapshots here match their authenticated historical Git blob SHAs exactly. The fifth strategy/configuration the owner remembers cannot be identified from this snapshot and inaccessible database alone; its absence is not fabricated as proof that it never existed.

The original four evaluators were **preserved**. Across26,496 hourly-sampled native closed contexts and four evaluators (105,984 comparisons), their status/direction/levels/RR/score/grade outputs matched the recovered functions when given identical inputs. Indicator construction did evolve:4,804 regime labels and26,471 volatility labels differed in the sample, but raw evaluator outputs did not change from those indicator differences in this sample. That does not prove every configuration/timeframe is identical or reproduce the old deployed profile.

Activation changed from the old fallback's `enabled=true` to requiring measured-release authority. New four-role research also used a much smaller four-asset/hourly setup scope; its frequency was not a substitute for the older broad15m service. Those distinctions were previously mixed together in status reporting.

The recovered live source reads **SPOT first**, with a futures fallback. The controlled comparison below uses native USD-M **PERPETUAL** data and repository fallback settings. It is not a claim to reconstruct actual July instrument selection, private database parameters, funding, fills or profitability.

## Concrete defect fixed: lock lifetime

Old isolated replay held a symbol's active lock until the maximum expiry, even when its virtual trade had already hit a stop/target. The earlier live scanner instead read persisted waiting/active signal state; an actual lifecycle close could free it earlier. This conservative replay mismatch suppressed later setups and made frequency comparison misleading.

The new `observed-closed-bars/v1` policy:

- Reuses the existing replay outcome authority and exact declared partial/BE/cost/holding assumptions.
- Observes only native candles whose closes are at or before the current scanner event. A future stop or target cannot free the symbol early.
- Frees the lock after a known virtual close; incomplete/ambiguous or missing-entry/gapped history stays conservative, with maximum expiry as fallback.
- Preserves one active signal per underlying symbol, cooldown and existing concentration rules. No opposite simultaneous signal is introduced.
- Persists tracked candidates, assumptions and lifecycle version with the existing replay checkpoint; restart/batch continuation cannot forget the old position.
- Memoizes identical candidate/time observations within a shared multi-asset timestamp; this does not skip a new candidate or a newly closed bar.
- New server-created jobs freeze a separate selection-policy hash; workers reject unknown/substituted policy lineage. Browser requests cannot author this field.
- Existing queued jobs without the new version retain their previous maximum-expiry semantics, and historical evidence is not rewritten.
- The corresponding private coordinated paper book now clears its active lock when an observed virtual close is recorded. Delayed next-open-after-observation, cancellation and the durable pending-projection outbox remain unchanged.

New behavior is scoped to crypto; no missing Forex candles or spreads are synthesized. Production signal lifecycle, execution sizing and publication authority are unchanged.

## Same-data twelve-asset comparison

48 official Binance USD-M archive/checksum pairs;140,544 native15m candles include June warmup and July–September2026 observations. Scope is BTC,BNB,SOL,XRP,ADA,DOGE,LINK,AVAX,LTC,BCH,NEAR,TRX. ETH was not in this recovered Q3 cache and is explicitly untested in this comparison, not omitted based on P&L. Dates/assets were already researched: this is development diagnosis, not untouched validation.

Four original evaluators run together through shared admission, registry, qualification, canonical arbitration and global chronological symbol state. Weekly slices carry state. There are105,984 decision cycles per policy; calendar includes all92days, including quiet days. Signal outcomes use next-open fills,50%TP1/BE, stop-first and declared20.5bps cost reserves, stressed30.75bps. Results are independent signal R, not account or portfolio equity.

| Policy | Selected | Resolved | Mean/day | Quiet days | Net PF |
|---|---:|---:|---:|---:|---:|
| Maximum-expiry lock |1461|1456|15.88|0|0.4883|
| Known closed-outcome release |2756|2746|29.96|0|0.6078|

| Original strategy · corrected policy | Selected | Resolved | Net PF |
|---|---:|---:|---:|
| MicroScalper |255|255|0.3244|
| QuickScalp |13|13|0.1022|
| CompressionBreakout |1491|1481|0.5642|
| SwingContinuation |997|997|0.7570|

All four contribute. Raw participation is not the bottleneck in this pool; profitability is. Corrected gross PF is0.9857 before costs. **Increasing alerts alone would increase losing exposure.** These are technical replay selections, not qualified paid-channel signals or a forecast of30 live alerts/day. The old actual deployed configuration, provider path, coverage rotation, delivery gates and account controls are not reconstructed by these fallback settings.

The full evidence retains every selected candidate and base/stress outcome plus aggregate rejection counts. It is not a stored row for every no-trade cycle. A copied period-boundary implementation initially included a duplicate/inclusive boundary; the final rerun uses non-overlapping half-open decision intervals. Every selected trade/outcome and differential result was unchanged; only the cycle-boundary bookkeeping changed. Tool-added source trailing newlines were also removed and source blobs verified against the historical Git tree; source-program behavior and trade results remained identical. No P&L-based rule was tuned.

## Coordinated four-role retest

The same corrected lifetime policy was separately applied to the prior fixed four-role2025 study without changing strategy rules, scope, costs or gates. Evidence is in `docs/research/crypto-team-causal`:

| Role | Resolved | Net PF | Screen |
|---|---:|---:|---|
| Trend |201|0.7077|Fails return/cost gates |
| Range |6|6.6716|Insufficient sample |
| Breakout |109|1.0617|Fails PF/stress gates |
| Alt strength |47|1.4443|Insufficient sample |
| Combined |312|0.8633|Fails return/cost gates |

Use exact committed numbers rather than the rounded table if calculating. All five cases fail at least one unchanged development gate, so later validation remains blocked. The earlier maximum-expiry report remains preserved. No4-profitable-strategy claim is made.

## Connected operator path

Backtest Lab → Calibration shows **Original four-strategy scanner: participation and quality** and individual contribution. Its link opens Scanner replay with the built-in **Original four crypto strategies · research baseline** selection.

The server freezes all four identities/versions/settings/costs; it does not need an enabled production configuration to describe a counterfactual research baseline. Up to four owned complete native USD-M15m datasets fit existing job bounds. At least110closed warmup bars are required. BTC is an eligible asset, not a mandatory reference for this profile. Native source/instrument mismatch is rejected by the concrete worker. Existing persisted results/export and restart/cancel controls are reused. Research-only snapshots cannot become production permission, and no existing strategy configuration row was enabled.

## Actual backend availability

Connected Supabase `list_projects` on28October reports the repository-referenced project `uqiwbzfcntlcyyewawfc` as **INACTIVE**. No activation, database SQL or secret retrieval occurred. Its exact old strategy/scanner settings, provider ledger and trade journal could not be read. Therefore the owner's earlier profitable experience is **unverified here**, not declared false from this counterfactual dataset. Exact live regression attribution requires that source evidence.

## Verification and reproduction

```sh
node --import tsx scripts/research/participation-regression.ts /path/crypto-alt-validation /path/alt-universe
node --import tsx scripts/research/crypto-team-causal-study.ts /path/crypto-development
npm run test:phase-m
npm run test:phase-p
npm run test:phase-l
```

New behavioral tests cover completed-bar-only release, future-candle invariance, missing-entry hold, cooldown preservation, real production-evaluator reentry, continuous/batch/restart equivalence, endpoint→frozen baseline→concrete worker/store, forbidden browser policy fields and terminal rejection of substituted policy hashes. Evidence checks independently reconcile8,404 partial-exit/cost/cash-flow outcomes, authenticate historical blobs, retain all failed coordinated cases and check symbol exclusivity.

Tests use genuine recorded candles for the study and injected deterministic database/provider adapters for connected boundaries. They are not real Telegram sends, provider fills, deployed Auth/RLS/concurrency or new market certification. No remote deployment, migration or schedule is authorized by these results. The remaining goal is four complementary strategies with demonstrated net edge and honest combined participation; **this patch improves participation fidelity and operator access, not that missing edge**.

Final local checks passed: PhaseL/K/M/P (41 PhaseP tests), Release1, Telegram, historical data, application/cloud types, production build, Edge discovery and three affected Edge bundles. Full app lint has zero errors and27 retained warnings; explicit lint for new runtime/research/test/UI modules passed. A frontend-only catalog initially pulled server evaluator types into the app graph; the catalog is now dependency-light and the final app/cloud checks pass. New negative tests were corrected to the existing409 rejection and DEAD_LETTER terminal contract. No test failure remains in the final listed checks. Added-line whitespace/conflict checks replace unavailable Git diff metadata in this checkout. Browser visual review and remote PostgreSQL/provider/Telegram validation remain NOT_RUN. Published-head CI is checked separately.
