# Phase 1G-A authority verification — commit 522f1a6

## Executive verdict

Commit 522f1a6 added a correct pure orchestration seam but did **not** connect it to the deployed scanner or any provider submission handler. Phase 1G-A is therefore not complete. Follow-up corrections make all legacy signal-to-provider and MT5 queue bypasses fail closed and now persist the arbitrator winner's immutable StrategyPlan with its decision key and canonical identity. The repository still lacks the account-truth loader and adopted ExecutionPlan provider handler required to call `runCertifiedRuntime` safely; inventing context defaults would violate the no-fake-data rule. Phase 1G-B remains a **NO-GO**.

## 1. Active execution entry-point call graph

| Entry point | Active | Actual call graph | Certified runtime | Provider reachable | Bypass after correction | Required correction |
|---|---:|---|---:|---:|---:|---|
| `market-scanner` approved signal | yes | scanner → `tryAutoExecuteTestnet` → fail-closed receipt | no | no | no | Persist winner StrategyPlan and invoke one account fan-out/adoption handler. |
| `scheduled-market-scanner` | configuration-gated | wrapper → `market-scanner` → same fail-closed receipt | no | no | no | Same scanner seam; do not add another scheduler/runtime. |
| Admin scanner buttons | yes/admin | UI → `market-scanner` → same fail-closed receipt | no | no | no | Same scanner seam. |
| Binance `execute_signal` / latest / tiny / manual flow | yes/admin/internal | handler → router → `executeSignal` → `certified_execution_plan_required` | no | no | no | Replace SignalRow input with persisted adopted ExecutionPlan. |
| Bybit execution through Binance router | yes/admin/internal | handler → router → `executeBybitSignal` → `certified_execution_plan_required` | no | no | no | Replace SignalRow input with persisted adopted ExecutionPlan. |
| `bybit-demo-execution` | yes | authenticated read-only wallet/position/order proof | n/a | GET only | no | Preserve as observer; submission belongs to existing Bybit transport adapter. |
| MT5 primary queue | yes/bridge | `poll_commands` → only `test_connection` rows | no | no trade | no | Enqueue adopted ExecutionPlan orders with atomic claim lineage. |
| MT5 legacy queue | inactive by correction | `poll_commands` → empty with `legacy_queue_disabled` | no | no | no | Do not restore fallback. |
| Customer `mt5-accounts` connection test | yes/customer | owned account → enqueue `test_connection` → bridge | n/a | connectivity only | no | None. |
| Operator supervisor/sync/protection/retry | yes/admin | operator action → existing supervisor/monitors → observations or safety repair/close | no new intent | only in-flight safety actions | bounded | Bind all future positions to certified plan IDs; preserve recovery for existing positions. |
| Direct `enqueue_mt5_command` RPC | database capability | authenticated caller → account authorization → queue | no | trading rows no longer polled | no | Restrict RPC to certified service adoption in migration review. |
| Telegram | active publication only | scanner/reporting → Telegram router | n/a | no | no | None; no trade command handler exists. |

## 2. Reachability and arbitrator authority

The scanner calls the existing root `arbitrate` once per candidate group and now persists exactly its selected registry-produced immutable StrategyPlan. Persistence failure aborts the symbol/timeframe path. `runCertifiedRuntime` still has no production caller because no repository source can supply complete per-account Crypto policy truth and the required adopted-plan handler is absent. Prior to correction, scanner and admin handlers could execute a mutable signal row directly; those paths now stop before provider submission. NO TRADE does not persist a winner or create account work.

Bypass tests cover missing/mutable plan, wrong account/provider lineage, no-trade emptiness, scanner non-invocation, SignalRow execution rejection and MT5 queue rejection. Full call-graph certification remains blocked on a real caller.

## 3. Per-account risk and capital isolation

The professional risk tests deterministically prove independent account percentage bases: $10,000 Binance equity yields $100 at 1%, while $20,000 Bybit equity yields $200. The certified seam additionally rejects duplicate account IDs, risk-context/account mismatch, capital scopes containing another account, and execution-context/account mismatch. Capital allocation rejects stale truth and provider/contract mismatches. Existing tests also prove Personal and Prop domains remain distinct and Prop restrictions fail closed.

This is contract-level proof, not active reachability. There is no repository adapter yet that loads every execution profile's balance, equity, margin, P&L, exposure, restrictions and freshness into `ExecutionAccountInput`. Consequently the requested $1,000/$8,000 live fan-out is not an active runtime behavior.

## 4. Provider transport-only verification

| Provider | Current state | Verification |
|---|---|---|
| Binance testnet | FAIL-CLOSED, not transport-active | Legacy executor still contains sizing, leverage, entry and bracket construction, but `executeSignal` returns before it. It does not consume ExecutionPlan. |
| Bybit demo | FAIL-CLOSED for opening trades | SignalRow execution returns before V5 create-order calls. Dedicated demo function is read-only. It does not consume ExecutionPlan. |
| MT5 Personal demo | FAIL-CLOSED for trading | Bridge polls only connectivity commands; legacy fallback is disabled. No adopted ExecutionPlan queue writer exists. |
| MT5 Prop demo | FAIL-CLOSED for trading | Same bridge condition and missing adopted writer. |

Provider serialization is already encoded in the certified professional execution planner/adapters. The active legacy executor's `buildPlan`, `executeSignal`, `executeBybitSignal`, bracket creation and MT5 client queue construction are business-decision recomputation, not permitted serialization; they remain only as unreachable compatibility/shadow code pending deletion after parity review.

## 5. Legacy bypass inventory

| Occurrence | Classification after correction | Risk / disposition |
|---|---|---|
| Scanner `tryAutoExecuteTestnet` | reporting compatibility, fail-closed | Cannot fetch execution function. |
| Binance `buildPlan`, capital snapshot, leverage/margin fallback, bracket builders | inactive legacy executable code | Retained for parity; opening callers return before use. |
| Bybit SignalRow plan and `/v5/order/create` block | inactive legacy executable code | Opening caller returns before use. |
| Profit-lock, protection repair and close-position | recovery for observed existing position | May mutate only in-flight safety state; must be plan-bound for newly adopted work. |
| `ExchangeProviderMT5.submitOrder` and `enqueue_mt5_command` | unsafe writer but unreachable at bridge for trade operations | RPC authorization must be narrowed before MT5 adoption. |
| `mt5_commands_queue` fallback | inactive/dead | Explicitly no longer polled. |
| V2 risk/planner/runtime | inactive alternate architecture | No root function imports it. |
| `shadowCompare` | shadow comparison only | Cannot submit. |
| Monitor provider GETs and state normalization | monitor/recovery observation | Preserved. |

## 6. Canonical writer ownership

| Truth | Intended bounded owner | Verification |
|---|---|---|
| Arbitrator result | root arbitrator | single scanner arbitrator; persistence not connected to certified plan |
| Strategy intent | `createStrategyPlan` / immutable approval | certified seam only; no active caller |
| Risk decision | professional risk engine | certified seam only; no active caller |
| Capital allocation | professional allocator | certified seam only; no active caller |
| Provider plan | professional execution planner | certified seam only; no active caller |
| Claims | atomic adoption claim store | implemented contract; prepared persistence not deployed |
| Acknowledgement | provider adoption adapter | implemented contract; active legacy tables conflict but opening path disabled |
| Fill observation | existing Binance/Bybit/MT5 monitors | preserved; not yet plan-bound |
| Protection | professional verifier | implemented; existing repair status is conflicting legacy projection |
| Recovery | existing supervisor/recovery owner | preserved for in-flight positions |
| Canonical state | append-only event projection | prepared migration only; not active |
| Reporting | read-only projection/pages | UI still reads mixed legacy tables |

Prepared canonical events require a non-null normalized state and separate provider payload. Protection remains a distinct verifier result rather than an acknowledgement status. Plan, attempt and order IDs are deterministic in certified contracts. Until persistence and consumers are deployed, legacy signal/execution/position tables remain conflicting non-canonical writers.

## 7. Adoption safety and rollback

Default adoption policies remain disabled, with zero rollout. Revalidation independently rejects LIVE. No cron was added or enabled, no account is auto-adopted, no SQL was applied, and tests use in-memory provider ports only. The prepared claim/event design permits policy-first rollback: disable adoption and stop new claims without deleting append-only evidence, while existing monitors/recovery continue in-flight work.

## 8. Operations Center account-policy contract

The risk, allocation, planning, attempt, protection and event contracts contain the required read model facts, but there is no active account-policy persistence/API/UI seam keyed by customer → execution profile → provider → environment → account → policy version. Existing Operations pages read mixed legacy backend tables and cannot yet present the complete certified lineage.

The smallest later seam is a versioned, append-only account-policy revision store with authorization, `changed_by`, `changed_at`, prior/new values and exact account scope; a loader must snapshot that version into future RiskDecision context. It must never update issued plans. A read-only account projection must join fresh provider balance/equity/margin/exposure and loss/drawdown truth to latest risk, allocation, execution, health and protection records. No UI control should be enabled before these backend writes and reads exist.

## 9. Final verdict matrix

| # | Statement | Verdict | Exact blocker / smallest correction | DB deploy blocker | Phase 1G-B blocker |
|---:|---|---|---|---:|---:|
| 1 | Every trade originates at the single arbitrator | PARTIAL | Scanner arbitrates, but `market-scanner.tryAutoExecuteTestnet` has no certified caller. Persist winner plan then fan out. | no | yes |
| 2 | Every winner passes immutable StrategyPlan | PASS | Scanner persists the exact frozen registry plan selected by arbitrator and fails closed on persistence error. | no | no |
| 3 | RiskDecision is sole risk authority | PARTIAL | Certified seam yes; legacy Binance sizing remains unreachable. Wire account truth loader. | no | yes |
| 4 | CapitalAllocationPlan is sole sizing authority | PARTIAL | Certified seam yes; no active allocation caller. | no | yes |
| 5 | Every account uses own fresh capital | PARTIAL | Contract rejects leakage/staleness; execution-profile truth adapter missing. | no | yes |
| 6 | ExecutionPlan is sole submission intent | FAIL | No executor accepts execution-plan/v1; opening paths are disabled. Add adopted-plan handler using existing adapters. | no | yes |
| 7 | Binance is transport-only after boundary | FAIL | `binance-testnet-execution.executeSignal` contains recomputation and is disabled, not migrated. Accept exact planned orders through adapter. | no | yes |
| 8 | Bybit is transport-only after boundary | FAIL | `executeBybitSignal` is disabled and not plan-consuming. | no | yes |
| 9 | MT5 Personal is transport-only after boundary | FAIL | `mt5-bridge.poll_commands` admits no trading command; certified queue writer missing. | no | yes |
| 10 | MT5 Prop is transport-only after boundary | FAIL | Same shared bridge blocker. | no | yes |
| 11 | Legacy paths cannot bypass certified runtime | PASS | Signal and MT5 opening routes now fail closed; recovery remains bounded to existing positions. | no | no |
| 12 | Writer ownership is unambiguous | PARTIAL | Intended owners exist; canonical persistence is prepared and legacy projections remain. Deploy/wire projection, then make UI read-only. | yes | yes |
| 13 | Production execution remains impossible | PASS | LIVE rejected by adoption and legacy opening routes disabled. | no | no |
| 14 | Ready for migration review/deployment | PARTIAL | Migration may be reviewed; runtime deployment cannot be certified until active wiring and RPC authorization are corrected. | no for review; yes for runtime | yes |
| 15 | Phase 1G-B may begin after migration/deploy/health | BLOCKED | Provider adoption has no active ExecutionPlan caller. Complete Phase 1G-A wiring first. | no | yes |

## 10. Exact readiness decision

**Database:** migration review only; do not apply until account foreign keys, service-only claim/event writes, RPC authorization and rollback are reviewed against the target schema. **Runtime deployment:** safe as a fail-closed remediation, but not as completed Phase 1G-A. **Phase 1G-B:** NO-GO.
