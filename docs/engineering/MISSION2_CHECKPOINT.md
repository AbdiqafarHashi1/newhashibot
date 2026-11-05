# Mission 2 implementation checkpoint — canonical replay foundation

Status: **IN PROGRESS. Mission 2 is not complete. No strategy has been qualified or promoted.**

## Baseline

PR #270 is merged. Main/source parent: `ef39c238c06cbc9d08d59e8fa96eab986e0b83bb`; exact source tree `8b1d7747840c8114e560107917accb6fdbd88808`. Branch: `codex/mission2-historical-qualification`. Draft PR: https://github.com/AbdiqafarHashi1/newhashibot/pull/271. First published commit: `dcfaf08766e8b9a4e4facbe66ad7d73fa53dfeb4`. Mission 1 behavior is preserved.

## Implemented and tested

- `canonical-historical-replay.ts`: deterministic one-minute event clock invoking the **actual `runConditionalWatch`**, named production discovery/evaluators, `decideEntry`, frozen confirmation, regime/context checks, arbitration and existing position-management transitions. Higher/anchor feeds expose only closed prefixes. The current candle exposes only its opening quote. Every dataset has verified SHA-256 candle content and explicit instrument/source limitations.
- `historical-conditional-store.ts`: historical persistence boundary; snapshot restores watches, immutable origins, state versions, terminal outcomes, lifecycle events, stable confirmed-event identity and rejection history. CAS/idempotent retries, admission conflict/cooldown/throughput and capacity, frozen plan and late-confirmation checks. This is **not** a broker-fill/account simulator or a substitute live database.
- Existing production store is expressed as a small `ConditionalStore` interface; existing worker accepts explicitly bounded streams, preserving its default live universe. The historical runner uses that worker rather than implementing another watcher.
- Production SQL parity test loads real Mission 1 migrations into isolated PGlite and compares admission, duplicate admission, CAS, frozen-origin rejection, terminal rejection, persisted state and event counts against the historical adapter. Tested contracts are not a claim that every SQL projection failure and concurrency case has parity. Native Postgres multi-session races remain to be added for Mission 2.
- Historical input identity covers datasets, strategy versions/configurations, dates, clock and an explicit release-revocation timeline. Restart cannot silently change any of these. No release source is forged for research. Unqualified configurations never become actionable events.
- `multi-dataset-scanner-replay.ts` now rejects new-policy configurations instead of running old timing logic under a new version marker. Old research runs remain explicitly legacy. The portable worker and Edge API now also expose explicitly signal-policy-only verification (see durable queue section). Full research/fill/account jobs are not yet migrated.
- Existing Backtest Lab → Scanner pipeline has a bounded policy-verification panel for cached campaigns, actual readonly admin configuration/release loading, decisions/events/health, pause, and atomic IndexedDB evidence/checkpoint persistence. New-policy evidence is not passed into legacy account/Prop qualification. It has not been verified against a real activated backend.
- CLI `research:canonical-policy` runs the same shared engine with a local frozen manifest and atomically saves evidence/checkpoint for resume. It has no Telegram/provider/database write access.
- Three previously unused evaluator argument names were prefixed `_` so importing actual production modules into the browser passes the existing strict app compiler. No calculations changed.

## Actual verification

- `npm run test:mission2`: **16 passed, 0 failed**. Tests include genuine evaluator immediate/conditional parity, frozen original confirmation, missing-data expiry, causal release revocation, checkpoint restart, checksum/ordering failures, future-candle mutation independence, no actionable unqualified signals, legacy-policy rejection and migrated SQL persistence parity.
- `npm run test:conditional-signals`: **59 passed, 1 native-Postgres standalone test skipped, 0 failed**. Skip is existing; this session did not run native Postgres.
- `npm run typecheck:mission2`: passed.
- `npm run test:phase-m`: deterministic integration and reviewed blocker suites passed.
- `npm run test:phase-p`: 46 passed.
- `npm run typecheck:cloud`: passed.
- `npm run check:edge-bundles`: 39 passed (dependency bundling, not live Edge execution).
- CLI restart from a completed checkpoint: identical summary, state, events and evidence; zero repeated evaluations.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- Strict TypeScript check of `scripts/research/run-canonical-policy.ts`: passed.
- Targeted ESLint of new frontend modules and Backtest Lab: passed.
- `npx vite build`: passed; existing large-chunk warnings remain.
- Browser visual/interaction verification: **not run**. Playwright Chromium download repeatedly returned a truncated/non-ZIP response in this environment. App compilation/build is not browser verification.
- CI includes the new Mission 2 tests/typecheck and a desktop/phone Backtest Lab smoke test. Remote CI result must be inspected after publishing this branch. The browser test is authored but not claimed passing until CI confirms it.

## Genuine bounded data evidence

The existing independently checksummed 160-candle BTCUSDT **SPOT** fixture is genuine Binance data, not synthetic derivatives or broker quotes. Native sanity test replays `2025-01-01T10:00:00Z` through `12:30:00Z`: **151 minute ticks, 6,946 decisions, zero actionable confirmed events** with unreleased configurations. This verifies fail-closed qualification and reproducibility, **not profitability**. Raw checksum `be6bba57b2edf39f3c866f9aecb6c55eb81ab84794dc77bdc6806148651b1ce1`; source is recorded in fixture manifest. Repeated per-minute decisions are not independent opportunities/trades.

`reports/backtests/mission2-native-policy-sanity.json` contains the actual smaller two-tick CLI smoke result: 50 NO_TRADE, 4 INELIGIBLE, 38 DISABLED, 0 confirmed. Reproduce:

```sh
mkdir -p .tmp/mission2
node --import tsx scripts/research/prepare-native-policy-sanity.ts .tmp/mission2/native-input.json
npm run research:canonical-policy -- .tmp/mission2/native-input.json .tmp/mission2/native-result.json
npm run test:mission2
```

The output envelope retains summary, evidence and checkpoint. To resume after interruption, set the manifest's `resumeFile` to the `.checkpoint.json` path with unchanged datasets/configuration/period. No performance metrics are inferred from zero trades.

## Durable queued policy verification (implemented after first checkpoint)

- Native CLI created `20261105011226_mission2_historical_journal.sql`. Three RLS tables hold per-job watch state, ordered events and tick digests. `checkpoint_historical_replay` uses the **actual current worker lease fence**, immutable lineage, bounded state/event deltas, terminal-state protections and one transaction for evidence plus cursor. Checkpoints remain under 1 KB in tests even with a controlled 20 KB watched-state payload. The old 10 KB queue cap remains unchanged. Service writes are explicit; authenticated reads require both owner identity and admin status; anonymous/customer writes and RPC execution are denied.
- `historical-replay-journal.ts` paginates recovered states/events/diagnostics and writes only changed versions/new events. A stable recursive snapshot hash survives PostgreSQL JSONB key ordering. Clock, retry, lost lease, admin revocation, conflicting event and rollback cases are tested locally. Native bid/ask opening quotes are preserved while future ask extrema and candle flow are removed from current-open observations.
- `preparePortableSubmission` accepts only `entryPolicyVersion: entry-decision/v1`, freezes **server-read** configuration/releases and rejects caller-supplied snapshot authority, other research scopes, cost overrides and unbounded/non-minute clocks. Up to 20 source/context datasets share the existing total candle/job budgets.
- Actual `cloud/worker/handlers.ts` REPLAY dispatches to `canonical-policy.ts`, which validates owned dataset hashes, invokes the actual canonical worker and atomically checkpoints through the journal. Its result is `CANONICAL_SIGNAL_POLICY_VERIFICATION`, **zero broker outcomes**, `qualificationEligible:false`, `execution:false`, `publication:false`. No qualification provenance is minted.
- Existing Edge `phase-m-validation` exposes `canonical_policy_replay` as a queue submission alias. Existing admin scanner controls add **Verify Mission 1 policy with worker**, reusing selected server datasets/start date and a bounded minute window. Existing pause/cancel/inspect worker controls remain authoritative. No second site or production service activation.
- SQL-backed integration invokes the **actual portable handler**, forces a yield after tick one, reloads durable state, completes six ticks, retries completion without duplicate confirmation, and calls the actual run finalizer with zero executable outcomes. Controlled evaluator/release fixtures here are explicitly test-only; this is not evidence of a live promoted strategy or broker connection.
- New migration is tested with the actual L/M/P prerequisite migrations in isolated PGlite. Full native PostgreSQL 15/17 migration rehearsal and native multi-session races on the new journal still require CI verification. Local Docker/advisors and browser installation are unavailable in this environment; no claim of those checks passing is made.

## Exact next dependency

1. Inspect CI for the new migration, worker and browser controls. Fix any failures before building on the journal. Add actual native multi-session journal races and verify owner/admin RLS reads plus cancellation/expiry under different connections.
2. Introduce explicit **research authorization distinct from production release approval**, so unreleased candidates can be studied without forging promoted releases or granting customer execution. Preserve the tested unqualified execution block. Current policy verification may observe unreleased paper analysis but cannot qualify it or manufacture actionable confirmations.
3. Feed confirmed identities into a realistic historical order/fill model and actual account authorization at observation time. Respect next-open executable prices, instrument steps/notional/margin, fees/spread/slippage/funding/swap, conservative stop/target ambiguity and concurrent marked equity. Do not reuse existing post-hoc outcome calculation as proof of canonical fill parity.
4. Replace sequential completed-trade account accounting (`openPositions:0`, immediately realized outcomes) before any Personal/Prop performance claims. Preserve per-account Brain/risk authority; add calendar-day equity locks and floating intrabar risk tests.
5. Then complete configurable challenge → verification → funded → payout eligibility, rolling starts with uncertainty/overlap disclosure, cross-account exposure, adverse costs, qualification and existing Lab results/job integration.
6. Only after these foundations: acquire reproducible larger genuine datasets, bounded development/validation/untouched holdout experiments and actual Crypto/Forex/Gold results. Current registry remains 29 definitions/10 primary; no strategy/configuration was promoted or newly invented.

## Remaining work / readiness

Execution simulator, customer account historical parity, Personal balance/risk grids, expanded Prop/funded survival, cross-account aggregation, stress campaigns, walk-forward/holdout qualification and full historical end-to-end verification are **NOT COMPLETE**. These are engineering work, not tasks waiting only on owner credentials. No pass rates, returns, payouts or profitable strategies are claimed.

Supabase, Telegram, live provider connections and deployment remain untouched. Broker-grade Forex/Gold data is required later for executable qualification; indicative data must remain provisional. Demo forward testing is **not qualified by this checkpoint**. No owner action is required to continue local implementation.

## Continuation: actual research and account-equity integration

The continuation repairs specialist engine-metadata parameter handling, native-flow
aggregation, weekly context width and adequate history requests, without promoting
research definitions. Explicit isolated research authorization never grants live
execution eligibility; the live SQL admission RPC rejects those events.

The canonical runner now drives a full event-based account ledger using the actual
account Brain, current bid/ask assumptions, quantity/margin/contracts, partial exits,
stop-first OHLC ambiguity, gaps, funding reserves, floating equity and loss locks.
The prop equity observer independently enforces hypothetical versioned rules,
phase reset evidence, payout eligibility and censored survival. Controlled tests
are not empirical firm passes or proof of provider connectivity.

See `docs/research/mission2/ACTUAL_RESULTS.md`, the immutable experiment and its
metadata correction, and `DATA_INTEGRITY.json`. Twelve actual provisional screens
cover ten native Crypto symbols, spot and USD-M, chronological windows and entry/
admission controls. The existing Backtest Lab displays genuine compressed evidence,
equity curves, daily frequency, comparisons, full funnel reasons and all 30 catalog
definitions. No raw archives are imported into the website and no production
configuration is promoted. Report files are lazy-loaded in the browser.

Reproduce acquisition with `scripts/research/acquire-canonical-history.py`, verify
cached decoding with `verify-canonical-history.py`, run the canonical strategy/
watcher/account path with `run-frequency-audit.ts`, orchestrate declared chronological
screens with `run-mission2-campaign.py`, and regenerate artifacts with
`publish-research-results.py` then `summarize-mission2-results.py`.
Research jobs persist `.resume.json` using atomic rename with canonical checkpoint,
source digest, configuration, funnel dedup identities, signal snapshots and complete
account ledgers. `resume=true` rejects changed source/configuration; SIGINT/SIGTERM
save a canceled checkpoint. Raw cached data/results stay outside git.

Unfinished, not claimed complete: sufficiently long independently validated strategy
qualification, full account research jobs in the hosted admin worker, genuine MT5/
Forex/Gold bid/ask and rapid Gold ticks, historical Bybit contract/fill evidence,
verified named prop rules and empirical challenge/funded survival cohorts. Broker
archive probes returned HTTP 429. No candidate currently warrants automated demo
promotion on these screens. Continue other feasible engineering/research rather
than interpreting an external data blocker as completed Mission 2.
