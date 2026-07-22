# HashiBot Phase 5C — Final Execution Certification

**Assessment date:** 2026-07-22 UTC

## Decision

**Phase 5 repository implementation is COMPLETE.** Connected deployment certification remains pending only on external operations: apply the reviewed migration, configure Vault secrets/connected-account rows, deploy the Edge Functions, and perform approved credentialed Binance and Bybit testnet observation. No migration was applied, no function was deployed, no cron was enabled, and no exchange order was placed during this repository-only assessment.

## Connected-runtime blockers completed

1. ROOT execution now enumerates enabled connected accounts for each selected provider. Every account executes independently through the existing provider-neutral router.
2. Execution API signing resolves credentials from the exact customer/provider/account/instance/reference tuple. Async-local provider construction prevents concurrent accounts from sharing credential context. Environment credentials are rejected unless the explicit `HASHIBOT_LOCAL_DEV_CREDENTIAL_FALLBACK=true` local-development gate is set.
3. Execution inserts receive immutable ownership centrally; duplicate detection is scoped to the same account identity.
4. Binance monitoring rejects unowned rows, resolves each row's connected credential, acquires its account lease, and isolates row failures. Account reconciliation, provider polling, and runtime proof execute in independent settled account scopes.
5. Bybit monitoring enumerates accounts, resolves each credential, acquires account leases, filters execution truth by scope, and settles failures independently.
6. Trade truth derives ownership from the canonical execution order inside the database RPC. Telegram deliveries and account runtime proof persist opaque ownership fields.
7. The connected Bybit monitor detects TP1 by persisted fill or exchange-confirmed size reduction, cancel/replaces the stop, activates a 0.3R profit lock, advances to a 0.5R-distance trailing stop after 1R, reads orders back, and verifies remaining protection.

## Durable execution ownership

The immutable identity is `(customer_id, provider, account_id, execution_instance_id, credential_ref, execution_scope_key)`. Both TypeScript and SQL reject blank components, reserved delimiters, key mismatch, missing connected accounts, and ownership mutation. Existing historical provider-wide rows are not assigned guessed customer identities; active connected work requires ownership.

`trade_management_truth` has an account-capable key. Its sole upsert RPC reads ownership from `execution_orders`, verifies provider consistency, and writes truth with the identical scope. This retains one execution truth rather than introducing an account-specific duplicate store.

## Connected credential architecture

`connected_execution_accounts` stores only an opaque Vault UUID reference. `resolve_execution_account_credentials` is `SECURITY DEFINER`, executable only by `service_role`, verifies the complete ownership tuple and enabled state, and returns decrypted JSON fields only to the provider-client factory boundary. No credential is written into logs, proof, reporting, analytics, Telegram, or events.

The Edge factory uses `AsyncLocalStorage` so concurrent account promises cannot observe each other's provider credentials. Signed Binance and Bybit requests fail closed without that context. The environment fallback is intentionally available only behind the explicit local-development flag.

## Monitoring, protection, and recovery ownership

`execution_monitor_leases` is keyed by the full scope. Atomic acquisition can replace only expired/non-running leases. Binance and Bybit monitors release each lease as completed or failed. Account work uses settled promises, so one rejected account never aborts another.

Provider polling, reconciliation, protection verification, repair, recovery status, runtime proof, and lifecycle Telegram dedupe all use the account scope. `execution_account_runtime_proof` is the per-account operational proof projection of canonical execution truth, not a second execution truth store.

## Final Binance versus Bybit parity matrix

| Capability | Binance | Bybit | Repository status |
|---|---|---|---|
| Connected-account planning/routing | Existing ROOT router | Same ROOT router | COMPLETE |
| Account-scoped credential factory | Vault resolver + async provider scope | Same | COMPLETE |
| Entry/acknowledgement | USD-M signed requests | V5 signed requests | COMPLETE; live observation pending |
| Native SL/TP | Existing algo protection | V5 reduce-only conditionals | COMPLETE; live observation pending |
| Protection readback | Open order/algo readback | V5 realtime-order readback | COMPLETE |
| Repair and recovery verification | Repair then readback | Repair then readback | COMPLETE |
| TP1 transition | Existing connected lifecycle | Fill/size-reduction transition | COMPLETE |
| Break-even/profit lock | Existing managed replacement | Cancel/replace at 0.3R lock | COMPLETE |
| Trailing | Existing managed lifecycle | Readback-verified 0.5R-distance trail after 1R | COMPLETE |
| Reconciliation/runtime proof | Account-scoped | Account-scoped | COMPLETE |
| Telegram ownership/dedupe | Shared ROOT route | Shared ROOT route | COMPLETE |
| Credentialed exchange evidence | Not observed in this run | Not observed in this run | EXTERNAL VERIFICATION PENDING |

Provider-specific signing, endpoint, trigger-direction, order identifiers, and response parsing remain legitimate adapter differences.

## Certification evidence

Repository tests prove immutable scope construction, mixed-ownership rejection, exact credential/reference resolution, secret-safe metadata, account-specific routing, lease isolation, independent monitor settlement, connected Edge imports, service-role Vault resolution, account runtime proof, and connected Bybit TP1/profit-lock/trailing paths. The existing chaos suite reports 23 PASS, 2 WARNING, and 0 FAIL.

No `BINANCE_*`, `BYBIT_*`, or `SUPABASE_*` credential variables were present. Consequently, no claim is made that entry, fill, protection, TP1, break-even, profit-lock, trailing, recovery, reconciliation, runtime proof, or Telegram delivery was observed on either exchange during this run.

## External completion checklist

Only external work remains:

1. approve and apply `20260722000000_phase5c_execution_account_ownership.sql`;
2. create one Vault JSON secret per connected account and insert/enable its ownership row;
3. deploy the updated ROOT execution and monitor Edge Functions;
4. run approved Binance and Bybit testnet lifecycles and retain redacted exchange/runtime/Telegram evidence; and
5. enable scheduling only after that evidence is reviewed.

## Production readiness assessment

The repository is implementation-ready and fail-closed, but production operation is not declared ready until the external checklist is completed. **Phase 5 — Provider Parity, Customer Execution Isolation, and Execution Certification is COMPLETE at the repository implementation boundary.** Proceed to **Phase 6 — Professional Telegram Platform & AI Market Intelligence** for repository development while deployment, migration, secret-manager configuration, and credentialed execution verification are handled through the approved operational process.
