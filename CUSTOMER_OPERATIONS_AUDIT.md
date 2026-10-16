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

## Verification and limits

Focused tests include real Phase-D evaluation, injected provider transports, actual embedded PostgreSQL setup/queue/RLS/transaction tests and the actual onboarding HTTP handler through concrete RPC calls into embedded PostgreSQL. The database fixture includes a Vault shim; this does not validate real Supabase Vault encryption, Auth/PostgREST or a complete migration-chain deployment. PGlite tests do not prove multi-session PostgreSQL concurrency.

The production build and focused D/E/F/G/H/M/N, execution-adoption and recovery checks have passed during development. The full TypeScript comparison against the restored starting source found 220 starting diagnostics and 161 current diagnostics, with no newly introduced diagnostic signatures at that comparison. Final checks: `test:operations-readiness` (16 behavioral tests, 3 PostgreSQL tests including the HTTP handler, 3 Python tests), D/E/F/G/H/M/N, execution, execution-adoption, recovery, Edge checks, source inventory and production build passed. Full typecheck still fails with 161 diagnostic signatures versus 220 in the restored starting source; no new signatures were found. The restored source comparison is not a remote CI run.

Authenticated phone/desktop review and real MT5/Binance/Bybit/Telegram tests remain NOT_RUN. No real strategy profitability, Prop pass, customer isolation in a deployed database or provider certification is claimed.

## Remaining essential integration work — keep draft

1. A production service must load complete fresh canonical account evidence and persist the actual Phase-D decision before plan adoption. The audited default branch contains decision consumers and a pure evaluator, but the durable production producer has not yet been connected. Do not manufacture a decision from a browser payload or a downstream sized plan.
2. Configured loss-response controls need a complete account-scoped provider outcome/history loader. The deterministic defensive gate is implemented; production loss evidence is not yet established.
3. Verify monitor-to-Phase-F certification lifecycle synchronization, not merely execution-order updates or Telegram events.
4. Preserve the documented portfolio overlap/intratrade equity limitations; historical simulation is not provider execution evidence.
5. Rehearse all forward migrations, grants, RLS, Vault and concurrent RPCs against disposable Supabase before remote deployment.
6. The current Python bridge is for an owner-managed Windows host. Global bridge/service credentials must not be distributed in a public customer installer. Public self-service installation requires its own scoped bootstrap and credential-exchange review.

## Migration order

Apply only in a disposable rehearsal after all predecessor migrations:
1. `20261015221031_customer_account_setup_integrity.sql`
2. `20261015225107_account_execution_routing_guards.sql`

No remote SQL, deployment, schedule change, external message or provider order was performed. Live execution remains disabled. The requested complete system remains PARTIAL; do not merge this as a claim that only API keys remain.
