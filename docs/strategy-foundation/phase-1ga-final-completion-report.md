# Phase 1G-A final completion report

## Completion decision

Phase 1G-A repository wiring is complete. Adoption remains disabled by two independent persisted defaults (`enabled=false`, `rollout_percentage=0`), LIVE is rejected in planning and adoption, and the account loader returns no account unless monitor-owned truth is complete and fresh. No migration was applied and no provider was contacted.

## Account truth mapping

One `loadCertifiedExecutionAccounts` loader consumes `certified-account-truth/v1`; it has no provider-specific fallback. The prepared `load_certified_execution_account_truth` RPC joins versioned policies to existing `connected_execution_accounts` plus `execution_account_runtime_proof`, or existing `mt5_accounts` plus the latest `mt5_account_snapshots`. Static policy structures contain the certified risk policy, provider contract, routing policy and capabilities. Dynamic balance, equity, margin, P&L, drawdown basis, positions, exposure, health and freshness remain monitor-owned `certified_truth`. A missing dynamic payload produces no RPC row; malformed, stale, disabled, unauthorized, locked, LIVE, duplicate, cross-provider, disallowed-strategy/symbol/grade, or mismatched contract data is rejected before RiskDecision.

Policies are immutable revisions scoped by customer, execution profile, provider, environment and account. Only one revision may be current. Every revision retains version, prior revision, changer and timestamp. Enabling an account policy still cannot adopt unless a separately versioned current adoption policy is enabled with non-zero rollout.

## Active call graph

`market-scanner` → existing `arbitrate` → exact frozen registry StrategyPlan → `certified_strategy_plans` → account truth RPC → `loadCertifiedExecutionAccounts` → `runCertifiedRuntime` with the already-computed arbitration result → per-account RiskDecision → CapitalAllocationPlan → ExecutionPlan → `certified_runtime_artifacts` → existing `binance-testnet-execution` action `adopt_execution_plan` → adoption revalidation → atomic SQL claim → append-only events → existing certified provider adapter → Binance/Bybit request or MT5 primary queue.

The scanner invokes certified execution only after its arbitration, duplicate, grade, and real-data gates. Signal, Telegram, analytics and paper compatibility output remains downstream publication and is never read by adoption. NO_TRADE has no winner block, no account load, and no work.

## Adoption and provider transport

`adopt_execution_plan` accepts only a deeply frozen reconstruction of `execution-plan/v1`, checks complete account/provider/environment lineage, rejects LIVE, loads the exact current adoption-policy version, checks the persisted disable/rollout columns against the immutable policy body, loads fresh adoption truth, and calls existing `adoptExecutionPlan`. Its atomic claim RPC locks every plan/configuration/order idempotency key before a provider port is invoked. Completed claims are replay no-ops.

Binance and Bybit transports remove only internal idempotency metadata and send the already-planned provider payload. They do not load SignalRow or calculate economics. MT5 Personal/Prop enqueue exact planned payloads, plan/attempt identity and deterministic command identity into the existing primary queue. The bridge releases only `test_connection` or certified commands with a matching completed account/plan claim; the legacy queue remains disabled. Personal and Prop use distinct plan providers and adapter validation.

## Runtime truth, monitors and protection

Adoption events have unique deterministic event IDs, non-null normalized states, raw provider status only in evidence, and immutable plan/attempt/account/client/provider-order lineage. Provider acknowledgements create `certified_provider_order_bindings` and an exact compatibility `execution_orders` row so existing Binance/Bybit monitors retain ownership. MT5 retains its existing bridge snapshot/ack monitor path. The account read projection exposes policy version, observed balance/equity/freshness, latest risk/allocation/plan, provider order, canonical state and protection result.

Acknowledgement is not protection. Crypto protection instructions remain exact planned instructions and existing monitors observe fill/open quantity and live stop/targets before protection status changes. The existing professional protection tests prove missing stop and partial-fill coverage do not project protected. Recovery remains limited to observed in-flight work.

## Legacy removal

SignalRow-based Binance/Bybit opening functions remain permanently fail-closed. The scanner never calls them. Direct uncertified MT5 trading rows fail bridge certification and the Phase 5 fallback is not polled. Existing close, protection, reconciliation and recovery actions remain for in-flight and legacy positions.

## Final verdict

| # | Requirement | Verdict |
|---:|---|---|
| 1 | Scanner invokes `runCertifiedRuntime` | PASS |
| 2 | Immutable StrategyPlan actively persisted | PASS |
| 3 | Real account truth loaded without defaults | PASS |
| 4 | Freshness and ownership fail closed | PASS |
| 5 | RiskDecision active once per valid account | PASS |
| 6 | CapitalAllocationPlan active once per accepted account | PASS |
| 7 | ExecutionPlan active once per allocation | PASS |
| 8 | Durable atomic claims and events | PASS |
| 9 | Binance consumes exact ExecutionPlan | PASS |
| 10 | Bybit consumes exact ExecutionPlan | PASS |
| 11 | MT5 Personal consumes exact ExecutionPlan | PASS |
| 12 | MT5 Prop consumes exact ExecutionPlan | PASS |
| 13 | Executors transport-only for new openings | PASS |
| 14 | Legacy opening paths unreachable | PASS |
| 15 | Existing monitors plan-bound | PASS |
| 16 | Runtime truth canonically connected | PASS |
| 17 | Production execution impossible | PASS |
| 18 | Adoption disabled by default | PASS |
| 19 | Phase 1G-A complete | PASS |
| 20 | Ready for migration review, manual SQL, deployment, health verification and Phase 1G-B | PASS |

## Go/no-go

**SQL review: GO. Manual SQL application: GO only after schema review and backup. Deployment: GO only after SQL succeeds. Phase 1G-B: conditional GO only after deployment health proves fresh certified truth, disabled adoption, monitor visibility and provider credentials in the intended non-production environments.** Until then provider submission is a NO-GO.
