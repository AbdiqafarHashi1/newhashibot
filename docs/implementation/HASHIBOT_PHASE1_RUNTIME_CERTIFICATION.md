# HashiBot Phase 1 Runtime Certification

## Certified components

- Runtime Proof, Scanner, Binance Monitor, and admin operator transport were already certified before this pass.
- Bybit Monitor is now repository-certified for bounded execution: one provider snapshot, a fixed execution row limit, fixed cancel/repair budgets, per-stage timings, and a monitor lease that rejects recent overlapping runs.
- Binance and Bybit monitors both require internal/admin authentication, write monitor heartbeats, synchronize trade-management truth, and return structured success/failure payloads.

## Remaining blockers

- Live deployment validation is still required because this pass did not execute SQL, deploy code, enable cron, invoke production Edge Functions, or mutate production data.
- Provider-side Bybit API behavior must be manually validated after deployment with testnet/demo keys because repository tests cannot prove exchange availability.
- Any dashboard value whose backing table or RPC is absent in a deployed environment must remain explicitly unavailable rather than being interpreted as zero.

## Provider comparison

| Lifecycle area | Binance | Bybit | Divergence |
| --- | --- | --- | --- |
| Authentication | Shared `authorizeInternalOrAdmin` guard | Shared `authorizeInternalOrAdmin` guard | None intended |
| Monitor heartbeat | `execution_monitor_heartbeats` | `execution_monitor_heartbeats` | Bybit includes bounded lease metadata in monitor result |
| Canonical truth | execution rows plus trade-management truth | execution rows plus trade-management truth | Provider-specific columns remain separate where already deployed |
| Protection orders | Binance Futures algo/native and managed fallback paths | Bybit linear reduce-only conditional orders | Explicit provider API and order-field divergence |
| Recovery | Monitor-driven stale/orphan/protection repair | Monitor-driven stale/orphan/protection repair | Bybit repair is bounded by per-run budgets |
| Reconciliation | Snapshot, row reconciliation, truth write | Snapshot, row reconciliation, truth write | Bybit refreshes symbol orders after repair to prevent stale duplicate reconciliation |

## Protection certification

- SL, TP1, and TP2 verification are required before Bybit marks a position `protected_native`.
- Missing SL/TP protection downgrades to `protection_failed` or partial protection and records recovery state.
- Repair creates only bounded reduce-only close-on-trigger orders and refreshes the symbol order snapshot after repair.
- Duplicate/stale cleanup is budgeted and never loops unboundedly.
- Orphan detection is represented by no-position/has-orders cleanup and no-position/no-orders closed synchronization.

## Recovery certification

- Restart/open-position recovery uses provider snapshots plus active execution rows and writes truth rows idempotently.
- Open-order reconciliation is deterministic from a single initial snapshot, with a per-symbol refresh only after an attempted repair.
- Missing protection recovery is bounded by `MONITOR_REPAIR_LIMIT` and records success/failure in execution rows and trade truth.
- Stale worker/overlap recovery is handled by a short-lived Bybit monitor lease; overlapping runs return `MONITOR_ALREADY_RUNNING` instead of duplicating reconciliation.
- Orphan cleanup is bounded by `MONITOR_CANCEL_LIMIT`.

## Runtime truth certification

| Truth item | Canonical source | Update path | Reconciliation path |
| --- | --- | --- | --- |
| Execution ledger | `execution_orders` | execution engine and monitors | provider snapshot reconciliation |
| Wins/losses/breakeven | execution status/lifecycle fields | monitor close classification | dashboard reads execution truth; unavailable data must not be shown as zero |
| Expired signals/trades | execution expiry fields | monitor time-stop handling | row reconciliation and lifecycle updates |
| Realized P&L | execution close fields when available | provider fill/close sync | unavailable until provider/execution close data exists |
| Unrealized P&L | trade-management truth and monitor snapshots | provider mark-price snapshot | monitor refresh and truth upsert |
| Provider statistics | provider controls, heartbeats, monitor result | provider monitor/supervisor actions | heartbeat and provider status reconciliation |

## Dashboard certification

- Admin provider operations reads provider controls, monitor heartbeats, execution rows, and active trade-management truth.
- Monitor cards must distinguish healthy, degraded, stale, unavailable, and adapter-pending states.
- Empty active exposure is valid only when the monitor/truth source is fresh; otherwise the UI must show unavailable/stale context instead of misleading zeroes.
- Offline/degraded states should be retained only for true stale heartbeats, critical monitor errors, failed protection, missing protection, or provider transport failures.

## Operator certification

| Action | Target | Certification requirement |
| --- | --- | --- |
| Runtime Proof | runtime proof path | authenticated, bounded, evented |
| Scanner | `scheduled-market-scanner` | authenticated, bounded, evented |
| Binance Monitor | `binance-testnet-monitor` | authenticated, bounded, evented |
| Bybit Monitor | `bybit-testnet-monitor` | authenticated, bounded, overlap-rejected, evented |
| Supervisor | `binance-testnet-execution` | authenticated, idempotent action event |
| Repair Protection | `binance-testnet-execution` | authenticated, idempotent action event |
| Retry Protection | `binance-testnet-execution` | authenticated, idempotent action event |
| Retry Verification | `binance-testnet-execution` | authenticated, idempotent action event |
| Refresh Exchange | `binance-testnet-execution` | authenticated, idempotent action event |

## Exact deployment order

1. Deploy repository code only after tests pass.
2. Deploy shared Edge Function dependencies.
3. Deploy `bybit-testnet-monitor`.
4. Deploy `admin-operator-action` only if its bundle changed in the deployment artifact.
5. Deploy admin UI bundle.
6. Do not enable or change cron until manual operator validation completes.

## Exact manual validation order

1. Confirm no live-trading environment flags are enabled unexpectedly.
2. Run Runtime Proof from the admin operator panel.
3. Run Scanner from the admin operator panel.
4. Run Binance Monitor and confirm a single runtime event and fresh heartbeat.
5. Run Bybit Monitor and confirm either bounded success or deterministic `MONITOR_ALREADY_RUNNING` when deliberately overlapped.
6. Run Supervisor.
7. Run Refresh Exchange.
8. Run Retry Verification.
9. Run Retry Protection.
10. Run Repair Protection.
11. Verify provider operations dashboard truth, including unavailable/stale states.
12. Verify performance dashboard truth does not show false zeroes for unavailable data.
