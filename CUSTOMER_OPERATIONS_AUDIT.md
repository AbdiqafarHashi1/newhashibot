# Customer account and operations audit

Base: main `de55838aed5b2ace36098022b9032b3aef683403`. Work continues on PR #259. This report does not certify trading or declare the whole system ready.

## Implemented

- Authenticated customer-scoped drafts, serial saves, stale-session fencing, stable setup attempts and transactional account/Brain creation. Repeated requests cannot create another account; superseded policy attempts are rejected.
- Signal-only onboarding requires no provider. Execution setup proceeds to account-specific credentials or MT5 pairing and current readiness.
- Approved Brain family/version and selected strategy families map to actual evaluator IDs. Owner/admin risk changes share the same server authority, stop new entries, retain protection monitoring and require recertification.
- Verify-before-store customer crypto credentials; reject unknown withdrawal permission and ambiguous provider identity. Rotation cannot silently change physical accounts. Revocation needs fresh flat evidence and no unresolved canonical execution, serialized with submission on the account row.
- MT5 one-time pairing consumption; explicit logical execution account to physical terminal mapping. Queue and credential/state endpoints validate customer, account, bridge, worker and lease. Malformed/partial snapshots do not fabricate healthy zero balances or positions. The daemon rejects live terminals.
- Bybit TP1 confirmation uses exact provider order evidence. Stop changes amend existing protection in place, never loosen it, require read-after-write verification and preserve protection after uncertain responses. Runner TP2 covers the remainder. Timeout close stays pending until reconciled.
- Binance close requests use scoped stable IDs and lookup-before-submit; acknowledgement alone cannot permit protective-order cleanup.
- Malformed provider positions and incomplete conditional-order reads cannot prove a flat account.
- Shared internal/admin authorization now verifies the server-held administrator role. A valid ordinary customer JWT is insufficient.
- Trade-truth writes check returned database errors. Direct row updates require exact execution scope and cannot mutate ownership; runtime callers fail when persistence is not confirmed.
- Phase-D defensive loss-response caps cannot increase approved risk. Missing/stale evidence blocks configured loss-response controls. Minimum-lot rounding cannot inflate risk; insufficient margin blocks the position plan.

## Administrator surface preservation and corrections

The static inventory covers 69 administrator routes and the available administrator/operations components. It is a source inventory, not proof of authenticated browser or provider behavior.

| Surface | Result |
| --- | --- |
| Customers, fleet, access and execution | Reuse account-scoped onboarding operations, genuine commerce/membership detail, command history and canonical reporting queue. |
| Risk, capital and modes | Read actual execution accounts and current policies; policy changes use the same server authority. Removed fabricated system customer identities and independent global-account risk editors. |
| Strategy configuration | Lists saved rows, including identities absent from the old hard-coded catalog. Errors cannot claim a save. Removed artificial score boosting and unverified champion-performance deployment controls. Historical templates remain available to research; they cannot promote themselves to production. |
| Prop | Retains ProfessionalPropWorkspace and links to the Backtest Lab/100-window campaigns. Old Bybit Prop records remain in a read-only archive; manual legacy governor overrides do not grant customer execution. |
| Agents | Reuses the actual durable agent and worker controls instead of retired browser-authored AI endpoints. |
| Signals and manual signals | Read canonical truth and use canonical reporting. Manual signal inserts and ad hoc per-signal delivery are removed from these UI paths. |
| Scanner and mission control | No static certification or unconditional live-connected badge. Configuration controls remain; unconfirmed symbol changes cannot display success. |

The large deletions replace duplicate/retired UI implementations and fabricated displays. No historical database records, registered strategy evaluator, approved public price or existing cron definition was deleted. Public conversion pages were not redesigned.

## Deletion review and restored usability

The published patch was reviewed file by file against main. The exact largest replacements and retired mutations are documented in `docs/operations/PR_259_DELETION_REVIEW.md`. Earlier generic replacements lost useful financial inspection and structured parameter help; this follow-up restores account-specific provider financial evidence, recent decisions, recorded plans and crypto incidents, plus strategy market/enabled filters and structured controls for existing saved numeric parameters. Unknown financial fields stay unknown. No historical AI metadata is erased when a configuration is saved; it remains excluded from the editable/calibration presentation. The old score-boost timer, fabricated system-wallet attribution and direct browser execution/subscription grants are intentionally not restored.

## Verification and limits

Focused tests include real Phase-D evaluation, injected provider transports, actual embedded PostgreSQL setup/queue/RLS/transaction tests and the actual onboarding HTTP handler through concrete RPC calls into embedded PostgreSQL. The database fixture includes a Vault shim; this does not validate real Supabase Vault encryption, Auth/PostgREST or a complete migration-chain deployment. PGlite tests do not prove multi-session PostgreSQL concurrency.

The production build and focused D/E/F/G/H/M/N, execution-adoption and recovery checks have passed during development. The full TypeScript comparison against the restored starting source found 220 starting diagnostics and 161 current diagnostics, with no newly introduced diagnostic signatures at that comparison. Final checks: `test:operations-readiness` (16 behavioral tests, 3 PostgreSQL tests including the HTTP handler, 3 Python tests), D/E/F/G/H/M/N, execution, execution-adoption, recovery, Edge checks, source inventory and production build passed. Full typecheck still fails with 161 diagnostic signatures versus 220 in the restored starting source; no new signatures were found. The restored source comparison is not a remote CI run.

Authenticated phone/desktop review and real MT5/Binance/Bybit/Telegram tests remain NOT_RUN. No real strategy profitability, Prop pass, customer isolation in a deployed database or provider certification is claimed.

## Remaining essential integration work — keep draft

1. A production service must load complete fresh canonical account evidence and persist the actual Phase-D decision before plan adoption. The audited default branch contains decision consumers and a pure evaluator, but the durable production producer has not yet been connected. Do not manufacture a decision from a browser payload or a downstream sized plan.
2. Account-scoped provider outcome collectors and the complete canonical history loader are now implemented and connected to Binance/Bybit monitoring and MT5 state sync. Production Phase-D consumption remains part of item 1; do not treat the new loader as proof that the full decision producer is connected. Unsupported/missing history blocks admission. Real provider evidence remains NOT_RUN.
3. Monitor-to-Phase-F and Phase-G synchronization is now connected through a service-only atomic observation RPC. Binance/Bybit load the exact provider entry order, persist immutable observation evidence, update account lifecycle and update the matching certification projection in one transaction. An unobserved entry stays in reconciliation; closure does not fabricate realized P&L or certification. Embedded PostgreSQL and injected adapter tests pass; real provider validation remains NOT_RUN.
4. Preserve the documented portfolio overlap/intratrade equity limitations; historical simulation is not provider execution evidence.
5. Rehearse all forward migrations, grants, RLS, Vault and concurrent RPCs against disposable Supabase before remote deployment.
6. The current Python bridge is for an owner-managed Windows host. Global bridge/service credentials must not be distributed in a public customer installer. Public self-service installation requires its own scoped bootstrap and credential-exchange review.

## Additional connected monitor repair

Certified execution rows now include the exact exchange discriminator used by their monitors. Bybit does not cancel or close an unconfirmed canonical entry as a stale order. Canonical observation loading checks customer/account/scope/plan, snapshot completeness, freshness, side, quantity and exact provider entry identity; persistence failures propagate. No certification is marked PASSED. This does not fill the separate account-decision producer or complete realized-history gaps above.

Verification for this repair: 17 behavioral tests, 4 actual embedded PostgreSQL tests and 3 Python tests passed. Phase F/G passed. Build passed. Typecheck retains the same 161 diagnostics as the preceding published head. No remote/provider evidence is claimed.

Verification of the deletion-review follow-up: 18 behavioral tests, 4 embedded PostgreSQL tests and 3 Python tests passed. Phase H/N, Edge discovery/bundles, source inventory, production build and diff checks passed. Typecheck remains at 161 diagnostics with no new normalized signatures against the preceding head. Authenticated visual review remains NOT_RUN.

## Migration order

Apply only in a disposable rehearsal after all predecessor migrations:
1. `20261015221031_customer_account_setup_integrity.sql`
2. `20261015225107_account_execution_routing_guards.sql`
3. `20261016033058_canonical_monitor_observations.sql`
4. `20261016040740_account_authorization_and_outcome_evidence.sql` (provider outcome evidence only; no production authorization producer)

No remote SQL, deployment, schedule change, external message or provider order was performed. Live execution remains disabled. The requested complete system remains PARTIAL; do not merge this as a claim that only API keys remain.


## Continuation: provider outcomes and review findings

Both review findings from commit `b661bab` are addressed. Canonical lifecycle reads/RPCs resolve the connected account UUID using customer, routing alias, provider, execution instance and credential reference. Execution-order reads retain the routing alias. The observation SQL applies the same distinction. Bybit lease-contention and missing-key exits return before any provider snapshot is used. Tests execute these actual early-exit branches and exercise a real SQL observation with a non-UUID routing alias.

Binance history exhausts bounded time windows/pagination and reconciles the whole entry/partial-exit/terminal-exit quantity, commissions and funding. Bybit reconciles exact closing orders and uses closed P&L with its already allocated costs. MT5 sends UTC history coverage, position IDs, entry/exit identities, commission, swap and fees; failed reads clear previous coverage. Unsupported reversals, ambiguous/manual fills, unavailable history, source conflicts, incomplete quantities or failed durable writes cannot become fabricated zero-loss outcomes. Acquisition handles at most five unrecorded closed executions per account per monitor cycle; the history loader rejects an incomplete backlog. MT5 acquisition currently requires the canonical TP2_CLOSED lifecycle and the bridge's 30-day coverage; older or otherwise unrecorded exits remain blockers.

Outcome rows are immutable and service-written, with owner/admin read policies. Embedded PostgreSQL verifies authorization, tenant isolation, exact retries and content conflicts. Injected provider tests do not establish genuine API connectivity, full Supabase deployment, concurrent database safety or profitability. The unfinished production authorization producer remains unpublished; its local scaffolding is not readiness evidence.

Continuation checks: 26 behavioral tests, 5 embedded PostgreSQL tests and 5 Python tests pass. Phase F/G and execution suites, Edge discovery, modified monitor/bridge bundles and production build pass. Full typecheck still reports 161 diagnostics, with no new normalized signatures against the preceding local source. The deletion preservation map remains applicable. PR stays unmerged and the complete system remains PARTIAL.
