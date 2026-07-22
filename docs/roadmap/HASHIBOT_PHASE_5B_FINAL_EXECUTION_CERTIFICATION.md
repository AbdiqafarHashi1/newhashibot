# HashiBot Phase 5B — Final Execution Certification

**Assessment date:** 2026-07-22 UTC

## Decision

Phase 5B closes the repository execution-suite blocker and strengthens the account/credential and Bybit protection contracts. **Phase 5 is not yet COMPLETE** because the connected Edge runtime still uses environment credentials and provider-wide monitor leases, execution rows are not uniformly scope-keyed, and Bybit TP1/trailing behavior lacks connected testnet evidence. Certifying those claims would be false.

No SQL was executed, no migration was introduced, and no runtime was deployed or scheduled.

## Phase 5A gaps completed

1. The execution suite's stale-order recovery failure was traced to a real compatibility defect: terminal `closed` rows could not pass the canonical trade-truth adapter. Terminal statuses now map to a completed provider execution plus closed lifecycle/protection truth.
2. Recovery now verifies actual protection after a repair cycle and accepts already-restored desired state, rather than requiring that the current call created at least one leg.
3. Customer/provider/account credential resolution now has a fail-closed ROOT contract. It requires an exact opaque reference match and exposes a safe descriptor separately from key material.
4. The Bybit adapter now cancels existing reduce-only stop orders before submitting a break-even/profit-lock/trailing replacement, then uses its existing exchange-confirmed protection placement.
5. Provider tests now cover account credential mismatch rejection and prove safe metadata cannot contain secret material.
6. The complete repository execution suite now passes. Its chaos certification reports 23 PASS, 2 WARNING, and 0 FAIL scenarios; warnings remain honest limitations rather than suppressed assertions.

## Account-scoped execution architecture

The canonical identity remains `(customerId, provider, accountId, instanceId)`. `executionScopeKey()` creates the runtime identity, `validateExecutionTargets()` rejects incomplete/duplicate scopes, and `executeSignalForIsolatedAccounts()` requires every active target to be scoped. Multiple accounts on one provider have distinct scope keys and isolated settled results.

The scope must ultimately be persisted on `execution_orders`, trade-management truth, monitor heartbeats, provider status, recovery events, reporting, analytics, and Telegram dedupe identity. That connected persistence is **not implemented in this phase** because the current production schema has no single reviewed account-ownership contract and adding disconnected columns would not provide isolation.

## Credential resolution architecture

`AccountScopedCredentialResolver` accepts only customer, provider, account, and the scope's opaque reference. The backing store must return the exact same ownership tuple and reference. Disabled, absent, incomplete, or mismatched records fail closed. Provider factories may consume returned secret material; logs, telemetry, events, diagnostics, Telegram, reporting, and analytics may consume only `credentialSafeMetadata()`.

The contract is certified in isolation. A production backing store is deliberately not invented: the connected Edge providers still read environment credentials, so end-to-end customer credential isolation remains un-certified.

## Monitor and recovery ownership

| Responsibility | Current owner | Scope result |
|---|---|---|
| Binance monitoring | `binance-testnet-monitor` | Provider-wide; account scoping pending |
| Bybit monitoring | `bybit-testnet-monitor` | Provider-wide lease; account scoping pending |
| Protection desired state | Existing shared provider contract and monitor branches | One responsibility, no duplicate |
| Recovery | Existing monitor repair paths and `RecoveryEngine` | Deterministic verification fixed; account selection pending |
| Execution truth | Existing `execution_orders` and trade-management truth | One truth; uniform scope attribution pending |
| Telegram execution lifecycle | Existing root Telegram router | One route; account identity in dedupe pending |

A failure in the pure parallel router is isolated with `Promise.allSettled`. Connected monitor isolation cannot be certified until queries, leases, provider clients, and writes are account-filtered together.

## Binance versus Bybit final parity matrix

| Responsibility | Binance | Bybit | Certification |
|---|---|---|---|
| Acceptance/planning/risk sizing | Canonical signal, governor and plan | Same | CERTIFIED statically |
| Entry/acknowledgement | USD-M APIs and persisted ID | V5 APIs and persisted ID | CERTIFIED statically |
| Native SL/TP | Binance algo/managed boundary | V5 reduce-only conditionals | CERTIFIED by provider tests/static path |
| Protection verification | Exchange readback | Exchange readback | CERTIFIED by provider contract |
| Missing-protection recovery | Repair then verify | Repair then verify | CERTIFIED in shared recovery tests |
| Stop replacement | Cancel/replace/verify | Cancel existing stop then place/confirm replacement | CERTIFIED at adapter contract |
| TP1 break-even/profit lock | Connected Binance behavior | Generic profit-lock policy plus Bybit replacement support | PARTIAL — monitor transition/testnet proof missing |
| Trailing lifecycle | Managed Binance behavior | Replacement primitive only | NOT CERTIFIED |
| Expiry/cancellation/stale cleanup | Connected monitor | Connected monitor | CERTIFIED statically |
| Reconciliation/truth/reporting | Canonical stores | Same stores | CERTIFIED provider-wide, not account-scoped |
| Telegram/runtime proof | Root router and monitor proof | Root router and monitor proof | CERTIFIED provider-wide, not account-scoped |
| Credentials | Environment | Environment | NOT ACCOUNT-ISOLATED |

Provider-specific signing, endpoint, trigger-direction, order-ID, margin, and response handling remain legitimate exchange boundaries, not business-logic forks.

## Execution ownership proof

There remains one provider-neutral router, one `ExchangeProvider` abstraction, one lifecycle vocabulary, one execution truth, one desired-state protection responsibility, one recovery responsibility, and one Telegram execution route. This phase added a credential resolver contract, not a provider or execution path.

## Certification evidence

- Scope uniqueness, required-scope behavior, provider failure isolation, and multiple same-provider accounts are covered by `exchangeProviders.test.ts`.
- Credential ownership/ref matching and secret-safe metadata are covered by the same focused provider suite.
- The stale recovery assertion now passes because canonical compatibility accepts terminal truth and recovery verifies actual state.
- The full execution script passes execution truth, Binance monitoring, SQL constraints, providers, trade management, admin execution UI, Telegram/SaaS routing, and crypto chaos certification.
- Build, analytics, and recovery checks pass.

## Remaining limitations and production readiness

Execution code is test-certified at the existing provider-wide/testnet architecture, but **customer-isolated production execution is not ready**. Remaining mandatory work:

1. choose and review the durable account ownership/credential backing contract;
2. persist the complete scope on execution and trade truth;
3. make provider clients resolve credentials per scope;
4. key monitor leases, reads, reconciliation, protection, recovery, runtime proof, reporting, analytics, and Telegram events by scope;
5. connect and test Bybit TP1-to-break-even/profit-lock and trailing transitions; and
6. perform approved credentialed Binance and Bybit testnet proofs.

Repository typecheck still reports unrelated customer/admin typing defects; build and the execution-critical suite pass. No credentialed verification was possible from repository-only credentials and none was attempted.

## Next action

Continue **Phase 5B connected account ownership** rather than advancing to Phase 6. Phase 6 — Professional Telegram Platform & AI Market Intelligence should begin only after the six limitations above are closed and execution certification is reissued as complete.
