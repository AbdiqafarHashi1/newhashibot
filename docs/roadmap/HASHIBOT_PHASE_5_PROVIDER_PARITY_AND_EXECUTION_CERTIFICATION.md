# HashiBot Phase 5 — Provider Parity and Execution Certification

**Date:** 2026-07-21 UTC

## Scope and safety

This phase audits the connected ROOT execution path, hardens the provider-neutral TypeScript boundary for isolated accounts, and records the remaining production gaps. It does not change signals, strategies, scoring, arbitration, database schema, credentials, cron, deployment, or live-trading gates. Binance remains the behavioral reference.

## Binance versus Bybit parity matrix

| Responsibility | Classification | Binance | Bybit | Decision |
|---|---|---|---|---|
| Signal acceptance | IDENTICAL | Approved root signal plus provider/global gates | Same canonical signal and gates | One router remains authoritative |
| Provider symbol validation | PROVIDER SPECIFIC | USD-M exchange information | V5 linear instruments | Normalized into `provider_symbol_cache` |
| Execution planning | IDENTICAL | Shared plan/risk/capital inputs | Same `buildPlan` inputs | No provider business rule fork |
| Risk sizing | IDENTICAL | Shared governor and sizing | Shared governor and sizing | Identical |
| Leverage | DIFFERENT | Binance leverage/margin endpoints and fallback | Plan records leverage; V5 account semantics differ | API-specific; testnet proof still required |
| Entry creation | PROVIDER SPECIFIC | Binance USD-M order APIs | V5 `/v5/order/create` | Both persist before submit and use idempotent identities |
| Acknowledgement | IDENTICAL | Provider ID persisted and lifecycle advanced | Provider ID persisted and lifecycle advanced | Identical truth contract |
| Fill detection | IDENTICAL | Monitor reconciles provider state | Monitor reconciles V5 positions/orders | Identical responsibility, API-specific payloads |
| Stop-loss placement | PROVIDER SPECIFIC | Native algo/managed fallback | Reduce-only V5 conditional | Both exchange-verified |
| TP1/TP2 placement | PROVIDER SPECIFIC | Native algo/managed fallback | Reduce-only V5 conditionals | Both exchange-verified |
| TP updates / break-even | MISSING | Binance supports TP1-driven replacement/profit lock | Monitor repairs protection but has no proven TP1-driven profit-lock replacement | Do not claim parity until certified |
| Trailing protection | MISSING | Binance managed/profit-lock behavior exists | No independently proven trailing lifecycle | Future focused provider-parity increment |
| Cancellation | IDENTICAL | Cancel entry/stale protection | Cancel entry/stale V5 orders | Same lifecycle intent |
| Expiry | IDENTICAL | Close and clean protection | Close and clean V5 orders | Same lifecycle intent |
| Monitoring | IDENTICAL | Bounded monitor and proof | Bounded monitor, lease, stages, limits | Provider-specific API only |
| Recovery | IDENTICAL | Detect, repair, verify | Detect, repair, verify | Same desired-versus-actual model |
| Reconciliation | IDENTICAL | Orders/positions to canonical truth | Orders/positions to canonical truth | Same truth writer contract |
| Reporting | IDENTICAL | `execution_orders` and trade truth | Same stores | No second reporting owner |
| Telegram | IDENTICAL | Root router with dedupe | Root router with lifecycle dedupe | One Telegram ownership |
| Runtime proof/diagnostics | IDENTICAL | Heartbeat/provider status/settings proof | Same categories plus lease/stage timings | Payload fields remain provider-specific |
| Failure handling | IDENTICAL | Fail closed, quarantine, event/error truth | Fail closed, quarantine, event/error truth | Provider error codes remain provider-specific |

## Exact differences found

1. Bybit uses V5 signing, linear instruments, `triggerDirection`, `closeOnTrigger`, `orderLinkId`, testnet/demo environments, and V5 response codes. These are legitimate provider-specific API differences.
2. Binance has mature margin-asset fallback and explicit leverage/margin endpoint handling. Bybit uses Unified Account/USDT linear semantics; equivalent external testnet evidence is not present in this repository.
3. Binance contains TP1-to-profit-lock/break-even replacement and managed fallback behavior. The Bybit monitor performs expiry, stale-order cleanup, missing protection repair, strict verification, reconciliation, Telegram, and truth writes, but does not prove the equivalent TP1-driven replacement or trailing lifecycle.
4. Both connected server paths currently resolve provider credentials from environment-level configuration. They are not yet safe to claim as simultaneous multi-customer credential isolation.
5. The existing database read-model preparation recognizes `account_id`, but the connected execution writer does not consistently require a customer/account scope. No migration was introduced in this phase.

## Implementation completed

### Isolation-safe provider routing contract

`src/lib/exchange/executionRouter.ts` now defines an execution scope containing `customerId`, `accountId`, opaque `credentialRef`, and `instanceId`. The scope key includes customer, provider, account, and instance identity. The router:

- rejects incomplete scopes;
- rejects the same mutable scope twice in one dispatch;
- supports multiple accounts on the same provider because account/instance keys differ;
- propagates only an opaque credential reference, never credential material;
- returns a scope identity on success and isolated provider failure; and
- provides `executeSignalForIsolatedAccounts`, which fails closed when any active target is unscoped.

The legacy routing function remains backward compatible. Connected Edge execution is deliberately not switched to isolated mode until durable account ownership and server-side credential resolution are reviewed together.

### Focused TypeScript compilation repair

Runtime-contract type imports now use explicit NodeNext-compatible `.js` paths, and the legacy trade-truth failure branch uses an explicit `mapped.ok === false` discriminator. This removes the prior focused compilation blockers without changing runtime behavior.

## Execution ownership map

| Responsibility | ROOT owner |
|---|---|
| Signal acceptance and provider selection | `binance-testnet-execution` provider-neutral router |
| Provider contract | `src/lib/exchange/exchangeProvider.ts` |
| Client-side/testable routing contract | `src/lib/exchange/executionRouter.ts` |
| Planning/risk/governor | Existing shared logic in `binance-testnet-execution` |
| Execution truth | `execution_orders`, execution events, trade-management truth |
| Binance provider execution/monitor | `binance-testnet-execution` / `binance-testnet-monitor` |
| Bybit provider execution/monitor | Same execution function / `bybit-testnet-monitor` |
| Protection/recovery | Existing provider branches implementing one desired-state contract |
| Telegram | Root Telegram router/orchestrator |
| Runtime proof | Provider monitors, monitor heartbeats, provider status and execution settings |

There is one lifecycle vocabulary, one execution truth, one provider router, one Telegram route, and one desired-state protection/recovery responsibility. Provider API calls differ only at exchange boundaries. No second worker or truth store was added.

## Customer execution isolation architecture

The required identity is `(customer, provider, account, execution instance)`. Each instance must receive one immutable scope, resolve its own credential reference server-side, and query/write only orders, positions, monitor leases, recovery actions, reports, and truth rows bearing that scope. Credentials must never be stored in signal metadata or returned in diagnostics.

Isolation rollout must be atomic across credential resolution, row ownership/RLS, execution inserts, provider clients, monitor selection, leases, recovery, and reporting. The pure router contract delivered here is the fail-closed boundary; environment credentials remain the current single-operator implementation and are not misrepresented as customer isolation.

## Multi-account architecture

Multiple accounts on one provider are represented by distinct scope keys. A dispatch group may contain Binance account A, Binance account B, Bybit account C, and later MT5 account D without sharing provider instances or mutable results. Each monitor lease and recovery cycle must be keyed by account scope rather than provider alone. Account-local failure must produce an isolated result and must not cancel sibling-account work.

MT5 can adopt the same scope contract, with the credential reference resolving to a bridge/terminal identity. HashiBridge remains execution-only and must not receive strategy or arbitration ownership.

## Certification

| Invariant | Result |
|---|---|
| One execution lifecycle and truth | CERTIFIED statically |
| One provider abstraction/router | CERTIFIED statically |
| One protection/recovery responsibility | CERTIFIED statically |
| Provider failure isolation | CERTIFIED by focused test |
| Duplicate account-scope rejection | CERTIFIED by focused test |
| Multiple accounts per provider identity | CERTIFIED by focused test |
| Credential-value isolation | CERTIFIED at contract boundary; only opaque references propagate |
| Connected customer-isolated execution | NOT CERTIFIED; environment credentials and unscoped DB writes remain |
| Binance/Bybit TP1 profit-lock parity | NOT CERTIFIED |
| Repository-wide execution suite | NOT CERTIFIED; later trade-management assertion fails after compilation/tests begin |

## Tests and known limitations

The focused execution command now compiles and passes execution truth, Binance monitor, SQL constraint, and exchange-provider tests, including the new isolation assertions. It subsequently fails an existing assertion in `tradeManagementCore.test` (`false !== true`), so repository-wide execution certification is not claimed.

Repository typecheck continues to contain unrelated application errors recorded in the final V2 recovery report. Production build remains the appropriate runnable-bundle validation. No credentialed provider smoke test was performed, so exchange acceptance cannot be inferred from static tests.

## Production readiness assessment

**Phase 5 foundation is implemented, but final provider parity and customer execution certification are not complete.** Binance and Bybit are aligned for acceptance, planning, sizing, entry, native protection, monitoring, expiry, repair, reconciliation, reporting, Telegram, runtime proof, and fail-closed handling. Remaining blockers are:

1. certified Bybit TP1-driven break-even/profit-lock and trailing parity;
2. durable customer/account ownership on execution and truth rows;
3. server-side account-scoped credential resolution;
4. account-scoped monitor leases and recovery selection;
5. a passing complete execution suite; and
6. credentialed Bybit testnet evidence after deployment approval.

## Recommended next roadmap phase

Complete **Phase 5B — Account-Scoped Execution Persistence and Bybit Profit-Lock Certification**. It should introduce the smallest reviewed schema/credential boundary required for account ownership, wire the existing router scope end to end, certify Bybit TP1 replacement against testnet fixtures, and only then run credentialed testnet proof. MT5 should follow after Binance/Bybit account isolation is certified.
