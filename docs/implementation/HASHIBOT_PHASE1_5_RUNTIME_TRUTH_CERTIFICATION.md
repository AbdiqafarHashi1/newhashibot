# HASHIBOT Phase 1.5 Runtime Truth Certification

Date: 2026-07-15
Scope: repository-only certification. No SQL execution, deployment, production Edge Function invocation, production data mutation, cron enablement, strategy tuning, scanner behavior change, Telegram implementation, MT5 implementation, or customer workflow change is part of this phase.

## Final recommendation

**GO for Phase 2: Telegram End-to-End Certification**, after deploying the repository changes through the normal release path and completing the manual validation order below. Telegram implementation remains unstarted in this phase.

## Resolved defects

1. **Trade Truth Auditor DESYNCHRONIZED false positive**: the Operator Panel no longer determines synchronization by provider and symbol alone. Certification now uses canonical execution identity first (`execution_order_id`, `trade_id`, or `id`) and falls back to provider/environment/symbol/side only when identity is unavailable.
2. **Manual scheduler false failure risk**: disabled cron is classified as **Manual Mode** and **Expected**, never failed/offline/broken solely because cron is disabled.
3. **Dashboard truth contract missing from repository**: dashboard cards now have a static inventory declaring canonical source, refresh trigger, failure, unavailable, stale, healthy, and adapter-pending states.
4. **Page ownership not certified**: all Operator Panel navigation destinations now have an explicit single responsibility matrix in repository code and this report.
5. **Runtime widget ownership not certified**: canonical owners are declared for Runtime Proof, Trade Truth Auditor, Overall Health, Provider Health Summary, Protection Summary, Runtime Event Summary, Execution Summary, Scanner Summary, and Telegram Summary.
6. **No false-zero certification gap**: the Trade Truth certification returns **NO DATA / unavailable** when no rows are available instead of fabricating a healthy zero state.

## Trade Truth synchronization changes

Trade Truth certification is implemented as a repository-only deterministic auditor. It verifies:

- every active `execution_orders` row maps to exactly one `trade_management_truth` row;
- no active orphan truth rows exist;
- duplicate truth rows are detected by canonical execution identity;
- stale truth rows are surfaced instead of hidden;
- empty datasets remain unavailable/no-data, not silently healthy.

Canonical mapping order:

1. `execution_orders.id` / `execution_order_id` / `trade_id` to `trade_management_truth.execution_order_id` / `trade_id` / `id`;
2. fallback identity: provider or exchange, environment, symbol, and side/direction.

## Dashboard inventory and canonical truth sources

| Displayed value | Canonical source | Refresh trigger | Failure | Unavailable | Stale | Healthy | Adapter pending |
|---|---|---|---|---|---|---|---|
| Runtime Proof | `runtime_proof_view(scope=runtime)` | runtime proof action or monitor certification write | failed | unavailable | stale | healthy | adapter_pending |
| Trade Truth | `execution_orders` joined to `trade_management_truth` by execution identity | execution writer and monitor reconciliation | desynchronized | unavailable | stale | healthy | adapter_pending |
| Protection | `trade_management_truth.protection_status` plus `execution_orders` protection fields | provider monitor verification/repair | failed | unavailable | stale | healthy | adapter_pending |
| Scheduler | `scanner_runs` automatic proof only when enabled; `scanner_config` when manual | manual scan or pg_cron only when enabled | failed only when configured automatic proof query fails | manual mode | stale | healthy | adapter_pending |

No dashboard may fabricate zeros when data is unavailable. Unavailable remains unavailable/no-data.

## Dashboard ownership matrix

| Widget | Canonical owner page |
|---|---|
| Runtime Proof | Runtime & Proofs |
| Trade Truth Auditor | Runtime & Proofs |
| Overall Health | Command Center |
| Provider Health Summary | Prop Providers |
| Protection Summary | Protection & Recovery |
| Runtime Event Summary | Runtime & Proofs |
| Execution Summary | Execution Engine |
| Scanner Summary | Signals & Scanner |
| Telegram Summary | Telegram Brain |

Other pages may consume shared components, but they must not duplicate business logic.

## Page responsibility matrix

| Page | Authoritative responsibility |
|---|---|
| Command Center | Mission control, critical alerts, shortcuts, and overview only. |
| Runtime & Proofs | Single canonical source for runtime proof, trade truth, health certification, and runtime events. |
| Testing Cockpit | Manual diagnostics, certification, provider tests, recovery tests, and chaos tests. |
| Signals & Scanner | Scanner configuration, diagnostics, history, signal generation, and outcome summaries. |
| Execution Engine | Orders, positions, execution workers, lifecycle, and execution state. |
| Protection & Recovery | SL, TP1, TP2, verification, repair, recovery, duplicate cleanup, orphan cleanup, and protection certification. |
| Prop Providers | Binance, Bybit, MT5 adapters, future providers, connectivity, latency, health, and diagnostics. |
| Access Requests | Pending approvals, package assignment, and customer onboarding. |
| Customer Management | Customers, executors, subscriptions, risk profiles, and provider assignment. |
| Telegram Links | Invitation links, membership verification, VIP onboarding. |
| Telegram Brain | Delivery engine, queue, templates, rich messages, images, channel health, and delivery analytics. |
| Market Intelligence | News, research, AI analysis, and market summaries. |
| Performance Analytics | Signal, execution, provider, and customer performance. |
| Outcome Tracking | Signal outcomes, trade outcomes, expiry, TP, SL, and break-even. |
| Retention & Storage | Cleanup, rotation, storage, and retention. |
| Audit Trail | Operator actions, recovery actions, runtime events, repairs, and certification history. |
| Settings & Secrets | Environment configuration, secrets, providers, security, and runtime settings. |
| Scheduler Guide | Manual mode, automatic mode, scheduler certification; disabled cron displays Manual Mode, never Failed. |

## Warning certification

| Warning | Classification | Certification action |
|---|---|---|
| Scheduler shown while cron disabled | Expected | Display Manual Mode, never Failed. |
| Telegram warnings before Phase 2 | Expected | Keep as pre-certification or adapter-pending warnings only. |
| Future provider/MT5 cards | Adapter Pending | Do not show as runtime failure. |
| Trade Truth desynchronization | Runtime | Detect real orphan/duplicate/stale defects only. |
| Provider connectivity issue | Provider | Surface provider-specific failure. |
| Missing environment/secrets | Configuration | Surface configuration issue. |
| Unavailable query/data | Unavailable | Do not convert to zero. |
| Historical completed defects | Historical | Keep in reports/audit trail only. |
| Obsolete false warning | False Warning | Remove or reclassify when not runtime-real. |

## Execution synchronization certification

Lifecycle stages certified by repository tests and constants:

- Created
- Qualified
- Submitted
- Filled
- Protected
- TP1
- Break-even
- TP2
- Stopped
- Expired
- Cancelled
- Recovered
- Closed

Every stage must update execution order state, trade truth state, runtime dashboards, provider dashboards, runtime proof, and operator history through the canonical truth path. This phase did not alter execution algorithms.

## Protection certification

Protection stages certified:

- SL
- TP1
- TP2
- Missing protection
- Verification
- Repair
- Recovery
- Duplicate cleanup
- Orphan cleanup

Protection state must remain synchronized across execution orders, trade truth, runtime dashboards, provider dashboards, runtime proof, and operator history.

## Recovery certification

Recovery is certified as repository architecture only: missing protection, stale truth, duplicate truth, orphan execution rows, orphan truth rows, repair attempts, and recovery status are exposed as truth defects. No production recovery invocation was performed.

## Operator certification

Operator pages now have one declared question each. Runtime proof and trade truth are canonicalized to Runtime & Proofs; operational summaries elsewhere are overview/shortcut consumers only.

## Runtime architecture

The runtime foundation now has one canonical truth path:

`execution_orders` → `trade_management_truth` → protection state → dashboard → runtime proof → operator UI.

The repository certification module is a shared source of runtime truth semantics for UI and tests.

## Phase 2 dependency matrix

| Dependency | Telegram integration consumer | Phase 2 blocker status |
|---|---|---|
| Scanner | Telegram signal publishing | No architectural blocker after manual validation. |
| Execution | Telegram execution notifications | Requires Phase 2 notification adapter implementation. |
| Protection | Telegram protection/repair alerts | Requires Phase 2 message templates and delivery certification. |
| Recovery | Telegram recovery alerts | Requires Phase 2 queue and dedupe certification. |
| Customer Management | Telegram package/channel entitlement | Requires Phase 2 membership/link workflow certification. |
| Telegram Brain | Telegram Links | Requires Phase 2 end-to-end delivery and link validation. |
| Runtime | Notifications | Requires Phase 2 notification event mapping; runtime truth foundation is ready. |

## Known limitations and remaining defects

- Certification is repository-only and static/unit-level; live production data is not inspected in this phase.
- SQL migrations are not executed in this phase.
- Production Edge Functions are not invoked in this phase.
- Telegram end-to-end behavior remains intentionally pending for Phase 2.
- MT5 implementation remains intentionally pending.
- Manual validation is required after normal deployment to prove live row-level data health.

## Deployment order

1. Review and merge the repository-only certification change.
2. Deploy frontend/runtime code through the normal release pipeline.
3. Do not enable cron during this validation.
4. Do not run SQL for this phase.
5. Open Operator Panel and verify Manual Mode scheduler display.
6. Run safe non-production certification checks only.

## Manual validation order

1. Confirm cron remains disabled.
2. Confirm Scheduler Guide and Operator Panel display Manual Mode, not Failed.
3. Confirm Runtime & Proofs owns Runtime Proof and Trade Truth Auditor.
4. Confirm Command Center contains only overview/alerts/shortcuts.
5. Confirm Trade Truth Auditor shows NO DATA/unavailable for unavailable rows, not fabricated zero health.
6. Confirm any live active execution row maps to exactly one trade truth row through the canonical identity.
7. Confirm protection defects are shown under Protection & Recovery.
8. Confirm provider-specific defects remain under Prop Providers.
9. Confirm Telegram warnings remain Expected/Adapter Pending before Phase 2.
10. Record results in Audit Trail/certification history after deployment.

## Final constraints confirmation

- No SQL executed.
- Nothing deployed.
- Cron remained OFF.
- No production Edge Functions invoked.
- No production data modified.
- No strategies modified.
- No scanner behavior modified.
- No execution algorithms modified.
- No Telegram implementation added.
- No MT5 implementation added.
- No customer workflows modified.
