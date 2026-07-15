# HASHIBOT Production Runtime Stabilization

## Confirmed request-storm root cause

The production request storm was caused by independent page/component polling and broad page-level fan-outs running concurrently. The worst offender was the Operator Command Center, which refreshed `useAdminLiveState` and `loadOperatorTruth` every 5 seconds while `useAdminLiveState` also maintained its own 45 second interval. The operator truth bundle queried many legacy or unstable sources in one `Promise.all`, including `execution_monitor_heartbeats`, `telegram_router_audit`, `runtime_proof_view`, `scheduler_truth_view`, and `provider_status`. When any of those endpoints returned deterministic 400/404/500 errors, the frontend kept re-querying on the next polling cycle.

## Request inventory

| Page/component | Source | Trigger | Interval | Retry policy after fix | Duplicate callers | Expected requests/page load | Current failure mode addressed |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| `useAdminLiveState` | `scanner_runs`, `scanner_config`, `signals`, `admin_runtime_overview_read_model`, `admin_telegram_delivery_health_read_model`, `intelligence_event_health`, `intelligence_events`, `signal_updates` | governed mount poll/manual refresh | 60s | no retry for deterministic 400/401/403/404/schema 500; one transient retry | shared by admin pages | one governed summary batch | previous 45s overlap and legacy sources |
| Operator Command Center | `admin_active_trade_truth_read_model`, `admin_execution_orders_read_model`, `admin_runtime_overview_read_model`, `admin_telegram_delivery_health_read_model`, `signals`, `signal_updates`, `operator_runtime_events`, `intelligence_events`, `intelligence_feed_results`, `scanner_config`, customer/access tables | governed mount poll/manual refresh | 60s | degraded blocked state for broken endpoints | central operator truth bundle only | one governed operator batch | previous 5s loop and legacy fan-out |
| Operator actions | `admin-operator-action` Edge Function | button click only | none | direct abortable POST; no pre-refresh; no post-action awaited refresh | shared `callEdgeFunction` transport | one POST per click | request pool starvation before POST |
| Scheduler/Scanner pages | `useAdminLiveState` plus local page queries | page load/manual refresh | 60s where polling exists | governed state prevents duplicate live-state polling | live state shared hook | bounded | duplicate background refresh |
| Customer/admin management pages | access/profile/subscription tables | page load/actions | load once/manual | no automatic retry loops | local page only | bounded by page | no storm loop identified |
| Historical/reporting pages | reporting and ledger tables/views | page load/manual refresh | manual/slow | deterministic failures become data unavailable | local page only | bounded by page | zero/healthy presentation risk documented |

## Removed duplicate polling

- Added a shared request governance layer with in-flight deduplication, deterministic error blocking, transient retry limits, hidden-tab pausing, operator-action pausing, and abort-on-stop semantics.
- Replaced the Operator Command Center's 5 second interval with one governed 60 second poll.
- Replaced the admin live-state 45 second interval with one governed 60 second poll.
- Removed the awaited background `refresh()`/`loadOperatorTruth()` cleanup after operator actions so the clicked POST is not blocked or followed by a storm.

## Schema/query reconciliation

| Legacy/failing source | Disposition | Canonical replacement/state |
| --- | --- | --- |
| `trade_management_truth` | removed from frontend operator bundle | `admin_active_trade_truth_read_model` |
| `execution_orders` direct wide select | removed from frontend operator bundle | `admin_execution_orders_read_model` |
| `telegram_delivery_health` | replaced for admin live state | `admin_telegram_delivery_health_read_model` |
| `provider_status` | removed from admin live state | `admin_runtime_overview_read_model` plus explicit unavailable/deferred state |
| `execution_monitor_heartbeats` | removed from operator truth polling | monitor state shown as disabled/not run/data unavailable unless canonical overview/proof exists |
| `telegram_router_audit` | removed from operator truth polling | routing audit section remains empty/degraded rather than hitting missing table |
| `runtime_proof_view` | removed from operator truth polling | `admin_runtime_overview_read_model` |
| `scheduler_truth_view` | removed from operator truth polling | `admin_runtime_overview_read_model` and scanner run proof |
| `intelligence_feed_health` | removed from live-state polling | empty explicit unavailable state until canonical feed health model exists |
| `provider_100_trade_readiness_view` | retained as optional bounded operator query | degraded if unavailable |

## Page truth contracts

| Page | Purpose | Canonical source | Freshness | Healthy | Degraded/offline/empty/unavailable |
| --- | --- | --- | --- | --- | --- |
| Command Center | operator runtime control | governed live state + operator truth bundle | 60s | canonical overview/read models load | degraded on unavailable sources; disabled cron shown as disabled/certification required |
| Runtime & Proofs | runtime certification status | `admin_runtime_overview_read_model`, scanner proof | 60s/manual proof | recent proof PASS | NOT YET RUN, STALE, DATA UNAVAILABLE, CERTIFICATION REQUIRED |
| Protection & Recovery | open/protected positions | `admin_active_trade_truth_read_model` | 60s | protection verified rows | no open positions, provider unavailable, query failed, repair required |
| Execution Engine | execution lifecycle | `admin_execution_orders_read_model` | 60–120s | no attention rows | skipped/failed excluded from performance truth; DATA UNAVAILABLE if source fails |
| Signals & Scanner | scanner outputs | scanner runs/signals | 60s/manual | recent scanner run | cron disabled, scanner not run, stale, source unavailable |
| Testing Cockpit | manual tests | explicit button actions | manual | exact backend result | certification required/no background invocation |
| Performance Analytics | P&L/win-loss | execution/read-model outputs | manual/5+ min | complete closed-trade data | outcome evaluator disabled/data stale, not zero-profit |
| Telegram Brain | delivery health | `admin_telegram_delivery_health_read_model` | 60–120s | deliveries available | disabled, not yet sent, data unavailable |
| Provider pages | provider operational state | canonical runtime overview + controls | 60–120s | provider available/recent | disabled, unavailable, stale, certification required |
| Retention/Audit | retention reports/events | retention RPCs/audit logs | manual | report loads | data unavailable, no rows, manual refresh required |
| Ledger/reporting | ledger and closed outcomes | execution read models/provider reconciliation | manual/5+ min | complete reconciled rows | stale/incomplete/evaluator disabled |
| Wins/losses/outcomes | closed-trade classification | authoritative closed execution/order outcome rows | manual/5+ min | closed filled rows classified | skipped/failed excluded; unavailable not shown as zero |
| Customer/admin management | access operations | access/profile/subscription tables | load once/manual | data loads | empty/unavailable explicit |

## Canonical source mapping

- Runtime overview: `admin_runtime_overview_read_model`.
- Active trade/protection truth: `admin_active_trade_truth_read_model`.
- Execution orders: `admin_execution_orders_read_model`.
- Telegram delivery health: `admin_telegram_delivery_health_read_model`.
- Scanner schedule proof: scanner run proof columns plus scanner config.
- Operator runtime events: `operator_runtime_events`.
- Customer/admin access: `customer_subscriptions`, `access_requests`, and related profile/access tables.

## Operator transport behavior

Operator actions now use a direct `callEdgeFunction('admin-operator-action', body, jwt, timeout)` invocation wrapped by `withOperatorAction`. The wrapper only increments a client-side action semaphore that pauses governed background polling. It does not perform database refreshes, profile reloads, or cleanup waits before the POST. Only the clicked action is disabled by the existing `runningAction` state, and exactly one backend POST is issued per click.

## Ledger/P&L truth rules

- Authoritative execution state comes from `admin_execution_orders_read_model`.
- Active/open trade protection state comes from `admin_active_trade_truth_read_model`.
- Provider/environment/account separation must be read from provider, environment/account fields in execution/truth rows; mixed-provider aggregates must remain grouped.
- Closed trades are classified only from filled/closed execution rows with provider reconciliation and close timestamps.
- Skipped, rejected, expired, and failed-before-fill orders are excluded from win-rate and realized P&L calculations.
- Unrealized P&L is shown only for open reconciled positions and marked stale if monitor data is stale.
- If outcome evaluation is disabled or stale, UI must show `outcome evaluator disabled / data stale`, not zero performance.
- Profitability must not be claimed when closed-trade outcome data is incomplete.

## Protection/recovery truth rules

- Cron disabled is `DISABLED`/`CERTIFICATION REQUIRED`, not healthy supervision.
- Monitor never run is `NOT YET RUN`.
- Empty open-position set is distinct from failed provider query.
- Provider unavailable is distinct from no positions.
- Query failure is `DATA UNAVAILABLE`.
- Protection verified requires canonical active-trade truth with SL/TP or native protection verification.
- Missing SL/TP or unsafe position is `REPAIR REQUIRED`.
- Quarantined symbols and recovery incidents are advisory blockers until cleared by canonical runtime truth.

## Manual test sequence

1. Publish only frontend request-governance and canonical query changes.
2. Open DevTools Network on one admin page at a time.
3. Verify one initial governed batch and no repeated 400/404/500 loop.
4. Hide the tab for at least one interval and confirm polling pauses.
5. Click one operator action and confirm POST transmission starts immediately.
6. Verify only one operator event/backend response per click.
7. Check Command Center, Runtime Proof, Scanner, Binance monitor, Bybit monitor, Ledger/P&L, Protection/Recovery, and Telegram in that order.

## Deployment order (documented only; not executed)

1. Frontend request-governance changes.
2. Canonical query/read-model frontend changes.
3. Any required repaired view migration, only if strictly necessary.
4. Operator frontend transport.
5. Changed Edge Functions only if required.
6. Publish frontend.
7. Test one page at a time with DevTools open.
8. Runtime Proof.
9. Scanner.
10. Binance monitor.
11. Bybit monitor.
12. Ledger/P&L validation.
13. Protection/recovery validation.
14. Telegram validation.
15. Enable canonical cron jobs one at a time only after certification.

## Rollback procedure

1. Revert the frontend commit.
2. Publish the previous frontend artifact.
3. Keep cron disabled.
4. Do not invoke production Edge Functions during rollback.
5. Re-test admin page request counts before resuming certification.
