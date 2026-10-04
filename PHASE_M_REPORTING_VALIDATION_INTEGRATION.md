# Phase M — Canonical reporting and validation integration

## Scope and evidence status

This change was built from merge commit `8979f7d` (PR #247), and the merge diff—not its PR summary—was reviewed. PR #245 was not used. Phase L already moved the active crypto evaluators out of `market-scanner`, retained the single scanner/arbitrator boundary, added isolated `validation_runs`/cycles/outcomes, and supplied an MT5 shadow adapter. Phase M strengthens those boundaries; it does not certify profitability.

| Mode | Connected code | Deterministic test | External configuration | Genuine data / observation |
|---|---|---|---|---|
| Individual strategy replay | Existing Phase-L production strategy registry | Existing Phase L suite | Dataset required | NOT_RUN |
| Full scanner selection | Protected multi-dataset endpoint globally orders closed candles and calls production admission, indicators, registry qualification, arbitration and shared selection policy | ordering, lineage conflict, active-signal/cooldown and lookahead tests | Complete immutable datasets/configuration required | NOT_RUN |
| Account/Brain simulation | Protected endpoint → durable simulation run/evidence → concrete `evaluateAccountSignal` Phase-D adapter → accounting; UI control/export connected | Reduced sizing, costs, missing-contract block, endpoint guard | Versioned Brain, contracts and FX conversions required | NOT_RUN |
| Prop challenge | Protected endpoint adapts account trades to `professionalPropEngine`, persists 100 frozen chronological windows, rule coverage and results | timezone/reset, static/trailing, balance/equity, target, minimum days, unsupported-rule and campaign tests | Frozen verified firm profile required | NOT_RUN |
| Shadow | Protected start/resume/observe/cancel endpoint atomically leases one durable run for public Binance/Bybit or dedicated MT5, using the production qualification/arbitration observer | Existing Phase L plus Phase M endpoint/lease checks | MT5 bridge required for Forex; no customer secret for public crypto | NOT_RUN |
| Telegram | Trade, protection, recovery, outcome and MT5 certification producers enqueue immutable lifecycle truth; protected worker supports send/edit/follow-up, uncertain hold and safe retry | duplicate/conflict, stale edit guard, missing original, partial, restart and ambiguous transport tests | bot/destinations and deployed migrations required | NOT_RUN |
| Customer #001 | Handoff documented below | Earlier Phase D–G tests | Four independently configured demo accounts required | BLOCKED / NOT_RUN |

Fixtures are synthetic and are never market evidence. Schedules remain disabled. No message, provider order, payment mutation, deployment, or remote SQL was performed.

## PR #248 reviewed blockers

1. **Evidence persistence — FIXED.** Validation and simulation evidence now use service-only atomic RPCs that are idempotent on identical retries, reject conflicting duplicates, update progress only with accepted evidence, verify the expected evidence count, and conditionally finalize only a still-running, non-cancelled run. Every endpoint/store error is checked; failed evidence or finalization returns failure and cannot report `COMPLETED`.
2. **Run routing and cancellation — FIXED.** Scanner/shadow history and details route to `validation_runs`/`validation_cycles`; account/Prop route to `validation_simulation_runs`/`validation_simulation_evidence`. Cancellation uses table-specific atomic RPCs. Scanner evaluation, Phase-D evaluation, and every evidence loop poll cancellation, while conditional completion prevents a cancellation/completion race from overwriting `CANCELLED`.
3. **Server lineage — FIXED.** Account runs load an owned completed validation run, persisted cycles/outcomes, canonical hashes, the owned execution account, current Brain assignment, and server-stored policy/contracts/conversions. Prop runs derive trades from completed account evidence and resolve the stored Prop configuration against the code-owned frozen profile registry. Client-supplied points, hashes, trades, profile bodies, and verification status are no longer accepted. Research override is explicitly `INCOMPLETE`.
4. **Backtest Lab controls — FIXED.** Structured mode, dataset, dates, provider, symbol/timeframe, source-run, account, Brain/profile, capital, currency, and cost controls replace editable JSON. History/details/cancel route by mode, shadow observation advances only from its explicit resume button, and export serializes fetched persisted evidence. The advanced evidence view is read-only.

## Authority and call-path audit

1. `market-scanner/index.ts` evaluates the single active registry and arbitrator, then calls `commit_scanner_signal_decision`. That Phase-K RPC atomically writes `scanner_cycle_decisions`, immutable `signals`, and `signal_publication_work`.
2. Phase-L replay calls `createApprovedReplayRegistry` → active indicators → `runBoundedValidation`; it writes only validation tables. `shadow-observer` uses the same boundary with publication, Telegram, and execution explicitly false.
3. Phase D remains `evaluateAccountSignal` → registered provider Brain → `decideAccountExecution`. Phase E/F alone translate approved intents into demo/sandbox provider lifecycle evidence.
4. Canonical signal outcomes and converted Binance/Bybit trade, protection and recovery producers now enqueue immutable lifecycle events rather than sending directly. MT5 certification writes are projected by a database trigger. Editorial, membership, test and generic operational alerts remain intentionally on the existing router because they are not canonical trade lifecycle producers.
5. Phase-J membership changes Telegram access only from Phase-I entitlement truth. Phase-G certification projects genuine Phase E/F evidence; neither validation nor shadow rows qualify.

## Canonical publication semantics

`claim_signal_publication_work` uses a bounded `FOR UPDATE SKIP LOCKED` claim, a lease token/owner/expiry, attempt ceiling, and abandoned-claim recovery. The worker reloads canonical truth and rejects identity/version/audience mismatches before rendering. Each part is reserved with the stable identity:

`entity-type : immutable-entity-id : lifecycle-version : destination : part-number`

Free/VIP accept signal-level events without customer identity. Customer delivery requires the exact customer on account lifecycle truth. Admin receives operational/account incidents; Owner remains private. Account/customer payloads cannot be widened to Free/VIP. Renderers must use `formatEastAfricaTime` for customer-visible 12-hour EAT output.

Telegram cannot provide exactly-once delivery. A timeout after submission is persisted as **UNCERTAIN**, never as sent and never blindly retried. HTTP 429 is bounded by `next_attempt_at`; permission/token loss is dead-lettered by the injected transport. A delivered first part is skipped on restart. If reserving or final persistence fails, the worker fails rather than claiming success. Missing original message IDs must render a follow-up; edits are an optional transport concern keyed by persisted prior message ID.

## Validation integrity

Replay events are globally sorted by candle close, symbol and timeframe before evaluation, so a whole symbol is not processed ahead of another. Duplicate identities with different content hashes fail closed. Full-scanner state reproduces active-symbol and cooldown gates; individual strategy mode remains separate in Phase L. Dataset/configuration hashes, exclusions, fill assumptions, warmup and outcomes stay in validation tables.

Account simulation refuses missing contract specs or conversion rates. It reports realized balance and marked equity separately from signal R statistics and applies declared spread, slippage, fees and funding. Its callback is the Phase-D decision boundary: the simulator cannot upgrade BLOCK/LOCK or increase authorized quantity.

Prop results are INCOMPLETE whenever a frozen rule is unsupported. Daily boundaries use the firm IANA timezone (including platform daylight-saving rules). The 100-trial constructor uses sorted documented starting windows and labels overlap/dependence; a caller must select an untouched holdout before construction and may not retune it.

Shadow uses immutable run lineage and durable checkpoints. The Phase-M migration adds lease/checkpoint/cumulative fields and an immutability trigger. Binance and Bybit use public candle endpoints and need no customer trading secret. MT5 remains the Forex/Gold authority; absent bridge/feed configuration is `AWAITING_FEED`. Twelve Data is not an automatic fallback. Workers have cycle/request/duration bounds and schedules are disabled.

## Operations and safe recovery

`canonical_reporting_operations` exposes queue status, claims, expiries, retry timing, uncertain parts and dead letters under invoker security. Safe recovery consists of lease expiry/reclaim, retry after the recorded time, or operator reconciliation of an uncertain Telegram message. There is deliberately no “mark delivered,” payment override, signal mutation, or execution bypass.

The existing Backtest/Prop/Operations surfaces remain the only UI. Backtest Lab now hosts the existing replay panel and the connected Phase-M shadow/account/Prop controls, durable history, queue visibility, cancel/resume/results and lineage export. Modes that require undeployed migrations, real datasets, feeds, credentials or accounts remain NOT_RUN/AWAITING_DATA rather than simulated as healthy. **VISUAL REVIEW NOT_RUN** (browser tooling was unavailable).

## Customer #001 forward-demo handoff

The only certifiable path is:

`production scanner → immutable signals/scanner decision → Phase-D account decision → Phase E/F demo boundary → provider lifecycle and reconciliation evidence → customer-only canonical reporting → Phase-G certification projection`.

Provision MT5 Personal, MT5 Prop, Binance and Bybit as four independently owned account records with distinct credential references, Brain/profile versions, contract metadata, runtime health and reporting destinations. Until genuine demo accounts and providers are configured, each is **BLOCKED/NOT_RUN**. Do not place orders in Phase M. Historical replay and shadow observation never count toward Phase-G forward-demo evidence. The private Owner Prop research track remains separate from customer execution authority.

## Migration and deployment readiness

Dependency order is: all migrations through Phase K → the four Phase-L migrations in timestamp order → `20261002120000_phase_m_canonical_reporting_validation.sql` → `20261003120000_phase_m_lifecycle_publication_and_edits.sql` → `20261004120000_phase_m_atomic_evidence_completion.sql`. Before deployment, compare read-only catalog output for tables, columns, constraints, indexes, policies, functions and triggers (`pg_catalog`, `information_schema`) to the migration; apply the exact SQL to an isolated disposable database; run all Phase D–M and SQL constraint tests; verify rollback is restore-from-backup/forward-fix (never fake migration history or reset production). No remote schema was inspected or changed in this work.

## Remaining work versus configuration

**Missing external configuration/evidence:** deployed migration, Telegram bot/destinations, dedicated MT5 bridge, public-feed network access, complete historical datasets, frozen firm profiles, contract/conversion data, demo provider accounts, genuine shadow duration, and genuine forward-demo observations.

**Remaining repository code:** none for the scoped Phase-M modes. Rules requiring evidence the professional Prop authority cannot evaluate—news blackout without timestamped news, an unspecified consistency formula, exposure without intratrade position snapshots, and payout eligibility—are inventoried and force `INCOMPLETE`. Editorial/membership/test Telegram traffic remains outside lifecycle publication by design.

## Reviewed-head and verification note

This checkout began on branch `work` at `8c964bf`; the review's stated head `a2c68e09990e49ce4a9b1211e37f8bd2d3329c78` was not present in the local object database and no Git remote was configured, so remote PR mergeability could not be asserted from this environment. The actual Phase-M base is `8979f7d`. A detached-base comparison ran the same `npm run typecheck` command: the base produced 262 TypeScript diagnostics, while this reviewed working tree produced zero. This is recorded as an observed local comparison, not as evidence of deployment or GitHub mergeability.

## Roadmap retained

Customer #001 forward-demo and unified Operations/support/recovery → growth/outreach/engagement and genuine screenshot/proof agents → Google Cloud heavy-worker deployment with measured costs → end-to-end release validation and controlled acquisition toward 1,000 active VIP customers.

**PHASE M CODE INTEGRATION: COMPLETE;<br>
GENUINE MARKET AND TELEGRAM VALIDATION: NOT_RUN;<br>
LIVE EXECUTION REMAINS DISABLED.**
