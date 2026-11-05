# Mission 2 implementation checkpoint — canonical replay foundation

Status: **IN PROGRESS. Mission 2 is not complete. No strategy has been qualified or promoted.**

## Baseline

PR #270 is merged. Main/source parent: `ef39c238c06cbc9d08d59e8fa96eab986e0b83bb`; exact source tree `8b1d7747840c8114e560107917accb6fdbd88808`. Branch: `codex/mission2-historical-qualification`. Mission 1 behavior is preserved.

## Implemented and tested

- `canonical-historical-replay.ts`: deterministic one-minute event clock invoking the **actual `runConditionalWatch`**, named production discovery/evaluators, `decideEntry`, frozen confirmation, regime/context checks, arbitration and existing position-management transitions. Higher/anchor feeds expose only closed prefixes. The current candle exposes only its opening quote. Every dataset has verified SHA-256 candle content and explicit instrument/source limitations.
- `historical-conditional-store.ts`: historical persistence boundary; snapshot restores watches, immutable origins, state versions, terminal outcomes, lifecycle events, stable confirmed-event identity and rejection history. CAS/idempotent retries, admission conflict/cooldown/throughput and capacity, frozen plan and late-confirmation checks. This is **not** a broker-fill/account simulator or a substitute live database.
- Existing production store is expressed as a small `ConditionalStore` interface; existing worker accepts explicitly bounded streams, preserving its default live universe. The historical runner uses that worker rather than implementing another watcher.
- Production SQL parity test loads real Mission 1 migrations into isolated PGlite and compares admission, duplicate admission, CAS, frozen-origin rejection, terminal rejection, persisted state and event counts against the historical adapter. Tested contracts are not a claim that every SQL projection failure and concurrency case has parity. Native Postgres multi-session races remain to be added for Mission 2.
- Historical input identity covers datasets, strategy versions/configurations, dates, clock and an explicit release-revocation timeline. Restart cannot silently change any of these. No release source is forged for research. Unqualified configurations never become actionable events.
- `multi-dataset-scanner-replay.ts` now rejects new-policy configurations instead of running old timing logic under a new version marker. Old research runs remain explicitly legacy. **Portable/Edge full research jobs are not yet migrated.**
- Existing Backtest Lab → Scanner pipeline has a bounded policy-verification panel for cached campaigns, actual readonly admin configuration/release loading, decisions/events/health, pause, and atomic IndexedDB evidence/checkpoint persistence. New-policy evidence is not passed into legacy account/Prop qualification. It has not been verified against a real activated backend.
- CLI `research:canonical-policy` runs the same shared engine with a local frozen manifest and atomically saves evidence/checkpoint for resume. It has no Telegram/provider/database write access.
- Three previously unused evaluator argument names were prefixed `_` so importing actual production modules into the browser passes the existing strict app compiler. No calculations changed.

## Actual verification

- `npm run test:mission2`: **11 passed, 0 failed**. Tests include genuine evaluator immediate/conditional parity, frozen original confirmation, missing-data expiry, causal release revocation, checkpoint restart, checksum/ordering failures, future-candle mutation independence, no actionable unqualified signals, legacy-policy rejection and migrated SQL persistence parity.
- `npm run test:conditional-signals`: **59 passed, 1 native-Postgres standalone test skipped, 0 failed**. Skip is existing; this session did not run native Postgres.
- `npm run typecheck:mission2`: passed.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- Strict TypeScript check of `scripts/research/run-canonical-policy.ts`: passed.
- Targeted ESLint of new frontend modules and Backtest Lab: passed.
- `npx vite build`: passed; existing large-chunk warnings remain.
- Browser visual/interaction verification: **not run**. Playwright Chromium download repeatedly returned a truncated/non-ZIP response in this environment. App compilation/build is not browser verification.
- CI includes the new Mission 2 tests/typecheck. Remote CI result must be inspected after publishing this branch.

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

## Exact next dependency

1. Finish canonical research replay integration into both `cloud/worker/handlers.ts` REPLAY and `supabase/functions/phase-m-validation/index.ts`, submission validation and durable queued evidence/checkpoints. Do not call live signal-projection RPCs during historical replay. Never stamp `entry_policy_version` merely because a configuration contains its marker.
2. Introduce explicit **research authorization distinct from production release approval**, so unreleased candidates can be studied without forging promoted releases or granting customer execution. Preserve the tested unqualified execution block. The current adapter deliberately requires real qualified definitions (controlled releases only in tests), so it cannot yet perform candidate profitability research.
3. Feed confirmed identities into a realistic historical order/fill model and actual account authorization at observation time. Respect next-open executable prices, instrument steps/notional/margin, fees/spread/slippage/funding/swap, conservative stop/target ambiguity and concurrent marked equity. Do not reuse the existing post-hoc outcome calculation as proof of canonical fill parity.
4. Replace sequential completed-trade account accounting (`openPositions:0`, immediately realized outcomes) before any Personal/Prop performance claims. Preserve per-account Brain/risk authority; add calendar-day equity locks and floating intrabar risk tests.
5. Then complete configurable challenge → verification → funded → payout eligibility, rolling starts with uncertainty/overlap disclosure, cross-account exposure, adverse costs, qualification and existing Lab results/job integration.
6. Only after these foundations: acquire reproducible larger genuine datasets, bounded development/validation/untouched holdout experiments and actual Crypto/Forex/Gold results. Current registry remains 29 definitions/10 primary; no strategy/configuration was promoted or newly invented.

## Remaining work / readiness

Execution simulator, customer account historical parity, Personal balance/risk grids, expanded Prop/funded survival, cross-account aggregation, stress campaigns, walk-forward/holdout qualification and full historical end-to-end verification are **NOT COMPLETE**. These are engineering work, not tasks waiting only on owner credentials. No pass rates, returns, payouts or profitable strategies are claimed.

Supabase, Telegram, live provider connections and deployment remain untouched. Broker-grade Forex/Gold data is required later for executable qualification; indicative data must remain provisional. Demo forward testing is **not qualified by this checkpoint**. No owner action is required to continue local implementation.
