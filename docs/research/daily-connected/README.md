# Runnable daily trend and combined altcoin research

This change makes the original BTC/ETH target-free daily lead **runnable through Backtest Lab**, rather than leaving it as a static research table. It also measures that lead together with the existing altcoin evaluator through the shared chronological scanner and lifecycle policy. It does not approve paid publication or trading.

## What an administrator can do

In **Backtest Lab → Calibration → Replay the daily trend strategy**:

1. Download the recorded real BTC/ETH daily history, or register it through the existing authenticated, resumable upload authority. The supplied history is from official cached Binance Spot responses, with source hashes retained; it is not simulated prices.
2. Open **daily replay**. Select the registered native Spot 1d datasets and an evaluation window. Preserve the entire seed prefix: recursive indicators start at the first stored candle, with at least 201 closed bars before the first decision. The parity example evaluates decisions from 2 January 2025 through September 2026 with the 2018 prefix retained.
3. Open **daily + altcoin replay** to add native USD-M 15m BTC reference and BNB/SOL/XRP datasets. Include 960 warm-up bars. Use monthly windows within existing worker/cycle limits. A standalone new UI job starts flat; the continuous research below explicitly carries state across monthly compute batches and is a distinct result.
4. Inspect persisted decisions, outcomes and cash flows; export the same evidence. The controls use the existing authenticated endpoint, concrete store and portable worker. Registering data does not activate a worker or grant publication permission.

The Spot downloader now preserves actual native source, instrument, quote-volume, trade-count and taker fields. It rejects incomplete native provider responses. Older illustrative test responses were updated to the real provider shape; CSV and other provider formats are not manufactured into Spot evidence. The daily evaluator accepts the recorded research source alias `BINANCE_KLINES` and the native decoder identity `BINANCE_SPOT_KLINES`, only with explicit SPOT identity and complete daily cadence.

## Original strategy retained

- Long/cash Spot BTC and ETH; no short, leverage or funding model.
- First-close-seeded recursive EMA20/50/200, matching the original research rather than silently substituting the root indicator's different seed.
- A closed daily EMA20 > EMA50 and close > EMA200 permits the next native daily-open entry.
- Initial stop: signal close minus 2 Wilder ATR14. An invalid entry gap cancels.
- Protection trails to the greater of the prior stop and completed close minus 3 ATR14, effective **next candle**.
- EMA20 <= EMA50 or close < EMA200 schedules a next-open full exit.
- No fixed TP, partial exit, breakeven, arbitrary short holding horizon or fabricated risk/reward. Empty targets and numeric legacy RR=0 are accepted only for the exact versioned target-free research contract; the plan ledger marks fixed RR NOT_APPLICABLE and target fields are null.
- Missing future bars leave OPEN evidence. Old stage-end liquidations remain in the original studies, explicitly distinguished from the connected lifecycle.

The definition is disabled / shadow / research by default. Counterfactual replay eligibility is local to the existing approved-replay builder. No second scanner, arbitrator, publisher or account executor is introduced. Target-free account/Prop simulation is explicitly blocked with `SOURCE_TARGET_FREE_ACCOUNT_POLICY_UNSUPPORTED`, rather than dropping regime exits or passing NaN targets to Phase D. Live target-free publication and fresh forward seeding are not claimed connected or certified by this work.

## Genuine integration and measured results

Daily-only replay uses 6,312 recorded daily candles across the two assets. **23 closed trades** match the original continuous simulator's entry prices, initial stops and exit prices; two remaining positions stay OPEN. Closed equal-notional return PF is 1.3719; initial-risk-weighted signal-R PF is 1.1507. These are different weightings, not account equity. BTC's daily R PF is 0.6749; ETH's is 1.9374. Losing assets are retained.

The combined run uses those Spot prefixes plus 84 vendor-checksummed USD-M monthly archives for BTC/BNB/SOL/XRP. It evaluates 44,918 chronological decision events from February 2025 through September 2026. Alt entries are evaluated at closed hourly boundaries, as required by the unchanged evaluator; intervening 15m times cannot generate an alt candidate. Native 15m candles still determine execution and lifecycle outcomes.

| Combined continuous evidence | Result |
|---|---:|
| Selected / closed / open | 154 / 152 / 2 |
| Net signal-R PF | 1.3289 |
| Stressed signal-R PF | 1.2282 |
| Daily-family closed / net R PF | 20 / 1.1577 |
| Alt-family closed / net R PF | 132 / 1.3821 |
| Entries/day | 0.2537 |
| Quiet days / observed days | 479 / 607 |
| Longest quiet stretch | 27 days |

The daily-only and combined samples have different start dates and concentration context; they are not contradictory or additive counts.

Entry-period diagnostics, not untouched holdouts:

| Entry period | Closed | Net PF | Stress PF |
|---|---:|---:|---:|
| February–December 2025 | 99 | 1.0034 | 0.9351 |
| January–June 2026 | 34 | 1.7859 | 1.5959 |
| July–September 2026 | 19 | 4.9434 | 4.4593 |

All assets and losing periods are retained. Later good results and small samples cannot erase the earlier stress failure. **Daily participation, four complementary strategies and stable approval across periods remain unmet.** These two bullish families do not cover every market condition. No approved-return, approved-participation or release-ready claim is made.

One active position per underlying symbol and three total active signals apply. State carries across monthly compute batches; future outcome timestamps never unlock admission. Costs are modeled reserves: daily 26 bps / stressed 39; alt 25 / stressed 37.5 including its declared funding reserve, not actual settlement data. The separate public-playbook experiment's actual funding must not be attributed to this run. Independent signal R is not a netted portfolio or account balance curve.

All calendar prices have been examined before. This is genuine-data integration and combined diagnosis, **not fresh out-of-sample or provider-fill certification**. Two partial compute attempts were superseded while correcting concentration handling and avoiding unnecessary non-hourly evaluations. An interrupted checkpoint is preserved and is not added to sample counts. The exact final research bundle is pinned by SHA256; mechanical TypeScript cleanups were rerun and numerical equality checked.

## Verification and deployment boundary

`npm run test:daily-trend` covers source/geometry denial, independent stop/fee arithmetic, causal trail activation, next-open regime exits, unresolved positions, profile substitution, genuine endpoint → concrete worker/store → persisted outcomes, owner/admin denial, restart parity, blocked unsupported account adaptation and every combined cash-flow/concentration invariant. It also executes the new migration's status/scope constraints in actual embedded PostgreSQL. Injected endpoint tests are not deployed Auth/PostgREST or concurrent-RPC proof.

The forward-only migration `20261028120000_target_free_replay_outcomes.sql` follows the existing Phase-L/M/P chain. It permits explicit scoped REGIME_EXIT persistence and TIMEOUT, which the replay engine already emits. It preserves grants, RLS and immutable financial evidence guards. No old migration was rewritten. The small embedded fixture validates the new constraint, not the entire production migration chain.

Reproduction from repository root:

```sh
python3 scripts/research/daily-connected/prepare.py ../research-data/spot-daily
npx esbuild scripts/research/daily-connected/verify.ts --bundle --platform=node --format=esm --outfile=.tmp/daily-verify.mjs
node .tmp/daily-verify.mjs
npx esbuild scripts/research/daily-connected/combined.ts --bundle --platform=node --format=esm --outfile=.tmp/daily-combined.mjs
node .tmp/daily-combined.mjs
npm run test:daily-trend
```

The combined command requires the verified local `crypto-development` and `signal-extended` caches. It does not acquire missing data or send orders. Source lineage is in the evidence; original historical studies are preserved against byte-identical snapshots where shared exit code evolved.

External prerequisites remain an active authenticated backend, deployed dataset/job authorities, the forward migration and a configured bounded portable worker. Browser packages exist but Chromium is absent: visual review NOT_RUN. Real deployed database/Auth/RLS/concurrency, fresh forward observation, provider fills and Telegram delivery are NOT_RUN. No remote SQL, deployment, cron change, external send, payment, order, auto-merge or live execution occurred.

Final local checks passed: `test:daily-trend` (15 tests plus the actual embedded PostgreSQL constraint test), `test:phase-p` (46), `test:phase-l`, `test:phase-m`, `test:phase-k`, `test:strategies`, `test:telegram`, `test:historical-data`, `test:phase2-research`, `test:public-playbooks` (17), app/cloud typechecks, production build, Edge discovery and explicit new-source lint. An initial history test failed because its mock omitted provider fields; the mock now uses the documented native shape, and missing fields have a negative test. Initial new-source lint findings were corrected. No final failing check is intentionally omitted.

Older cached Spot datasets without native instrument/source identity must be downloaded again or imported from the recorded files; the code does not invent provenance for old cache entries. Authenticated visual review remains NOT_RUN: Playwright is installed, but its Chromium executable is absent. No `.git` metadata exists in this workspace, so file hashes and whitespace/conflict scans are used rather than claiming `git diff --check` or a clean local Git status.
