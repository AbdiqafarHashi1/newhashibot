# Phase N — Customer #001 and unified operations readiness

## Status

**PHASE N CODE READINESS: COMPLETE. CUSTOMER #001 REAL PROVIDER CERTIFICATION: NOT_RUN/BLOCKED. LIVE EXECUTION REMAINS DISABLED.** Phase-M PR #249 is present in this lineage at merge `853a85e`. This delivery does not deploy migrations/functions, configure credentials, send messages, submit orders, or mutate production truth.

## Requirement-by-requirement connection matrix

| Requirement | Existing authority reused | Endpoint / concrete adapter | Durable store / consumer | Customer / admin UI | Connected behavioral coverage | External configuration | Genuine evidence |
|---|---|---|---|---|---|---|---|
| Signal-only journey | Phase I commerce and Phase J Telegram | Phase-H onboarding authority; no provider call | onboarding session and entitlement truth | onboarding explicitly completes without an execution account | Phase H/I/J suites | payment and Telegram credentials | NOT_RUN |
| Independent execution accounts | Phase-H account authority; Phase-D policy | `phase-h-authority` account, Brain and acknowledgement actions | connected account, Brain assignment and acknowledgement | onboarding completion creates the selected MT5 Personal/Prop, Binance testnet or Bybit demo account; readiness manages each independently | Phase H plus Phase-N multi-account tests | none for durable drafts | local only |
| Provider lifecycle | Phase-H provider connection, pairing RPC and existing provider adapters | `phase-h-authority`; HashiBridge and crypto server boundaries | provider connection, hashed pairing rows and safe audit | readiness pairing/status/reconnect/revoke controls; no download is labelled connected | Phase H pairing, expiry, replay, redaction tests | signed artifact and provider credentials | NOT_RUN |
| Operations commands | Phase D account controls; Phase E/F lifecycle and MT5 command queue | `phase-n-operations` plus `phase-n-command-worker` | command rows, atomic `SKIP LOCKED` claims, expiring leases, attempts, safe results/errors | existing Onboarding Operations Center provides audited stop/reconcile actions; customer sees resulting projection | Phase-N request and durable-consumer suites | authenticated worker invocation | injected only |
| Customer #001 certification | Phase-G run/check/event model and preflight; Phase D decision lineage | start persists via Phase-G RPC; disabled-by-default dispatcher invokes existing Phase E/F boundary | certification runs/checks plus linked command result | readiness inspection; admin operations authority | Phase G and Phase-N BLOCK/REDUCE/sandbox tests | explicit real UUID, provider connection and separately enabled demo order capability | NOT_RUN/BLOCKED |
| Recovery and protection | Phase E/F lifecycle RPCs, MT5 recovery/close command queue | command worker dispatches reconciliation and crypto lifecycle or MT5 canonical commands | Phase E/F truth plus leased command result | admin stop/reconcile actions; safe customer next action | uncertainty, restart, protection-preserving stop and incident tests | provider transport | injected only |
| Unified projections | Phase H/I/J/E/F/G/M truth | safe views and authenticated history/inspection | canonical source tables; no parallel business truth | existing readiness and combined Onboarding Operations drill-down | owner/cross-account tests | deployed RLS database | NOT_RUN |

An operations command is complete when the existing authority durably accepts or rejects the requested control; this is not evidence that a provider order, protection change, reconciliation, or certification verdict succeeded. Certification cannot progress to `PASSED` without canonical provider lifecycle evidence through protected terminal closure.

## Completed repository wiring

* Customer readiness now provides HashiBridge pairing creation, status refresh, reconnect and revocation controls; only a verified handshake and current heartbeat establish connection.
* Binance testnet and Bybit demo forms verify trading-only credentials before an account-scoped Vault write, support rotation in place and revocation, and reject missing adapter configuration or withdrawal capability without fallback storage.
* Phase-G start now requires an immutable Phase-D execution plan and dispatches through existing Phase-E/F boundaries only when `PHASE_N_DEMO_DISPATCH_ENABLED=TRUE`; the default is blocked.
* The existing Operations Center now loads an administrator-authorized customer drill-down across accounts, entitlements, provider, Brain, acknowledgements, certification, commands, audits, support, commerce, Telegram and reporting evidence.

## PR #250 reviewed blockers

| Blocker | Disposition | Evidence |
|---|---|---|
| Browser-controlled certification evidence | **FIXED** | Start accepts only customer/account, persisted execution-plan ID, Phase-D decision ID and idempotency key. `request_phase_n_certification` loads the plan/decision/account/connection/entitlement server-side, persists server checks atomically, and `load_phase_n_certification_dispatch` repeats mutable gates immediately before dispatch. |
| Unknown withdrawal capability collapsed to false | **FIXED** | Binance preserves absent or malformed `canWithdraw` as `null`; Bybit preserves absent or malformed permission evidence as `null`. Verify-before-store rejects every value except explicit `false`, with negative tests proving the store is not called. |
| Noncanonical execution plan shape | **FIXED** | The dispatch adapter requires `execution-plan/v1`, `PLANNED`, nested `routing.account_id`, and nested `risk_decision` policy lineage. A production-shaped plan generated by `planExecution` is passed through Phase N into `adoptExecutionPlan` and the existing Binance adapter with injected transport. |
| Nonatomic run/command and unbounded retries | **FIXED** | A transaction-level advisory lock, request-content hash and one RPC create the run/checks/command or return the same pair. Conflicting reuse is rejected. Claims and completion enforce `max_attempts`; exhausted leases become terminal failures. Uncertain submissions remain reconciliation-only. |

## Authority and gap map

| Journey | Reused authority | Phase-N connection / remaining gap |
|---|---|---|
| Onboarding and account setup | Phase H sessions, account drafts, Brain assignments, acknowledgements, provider connections, support requests | Readiness UI now reads an account-scoped operations projection. Customer #001 must be bound by an administrator to a real auth UUID; no inferred identity or seed exists. |
| Commerce | Phase I entitlement/payment truth and one-account bindings | Projection reads the existing binding. Owner-test authorization is represented separately and cannot manufacture payment. The explicit, expiring authorization record is administrator-readable and remains independent from payment truth. |
| Telegram | Phase J membership/delivery truth | Remains a projection of canonical truth. Phase N does not add delivery overrides or send test messages. The combined Operations drill-down reads canonical membership state and does not add delivery overrides. |
| Signals / risk | One Phase-K scanner/arbitrator and immutable signal; Phase D policy decision | Certification preflight preserves ALLOW/REDUCE, decision/signal/intent/plan/client-order lineage, risk, quantity, locks, filters, duplicates and protection. BLOCK/LOCK fails closed. No new risk engine exists. |
| Execution / protection | Account-scoped Phase E MT5 and Phase F crypto truth and workers | Phase-N emits audited commands only. Existing E/F boundaries remain the only possible order route. Uncertainty permits reconciliation/stop only; stop-new-entries requires protection to remain enabled; recovery/close requires an existing protection incident. Worker code is present but is not deployed or scheduled here. |
| Certification | Phase G state machine and canonical evidence | Administrator-only coordinator requires sandbox, ownership, provider identity, healthy heartbeat, entitlement or owner-test authority, and complete Phase-G preflight. Acknowledgement alone cannot pass. Only terminal canonical provider evidence can advance through protected closure to PASSED. |
| Reporting | Phase M canonical lifecycle publication, queue and evidence | Retained unchanged. The combined Operations drill-down includes reporting queue, uncertainty and dead-letter evidence; worker deployment remains configuration work. |
| Recovery/support | Existing reconciliation, protection, safety-close boundaries; Phase-H assisted setup | Safe commands are idempotent and tenant-scoped. Support rejects secret-like content and has no fake WhatsApp destination. The combined Operations drill-down includes assisted-setup status and audited support history. |

## Account/provider readiness matrix

All four routes are independent. An absent optional route remains unconfigured; a route required by a certification plan is blocked.

| Route | Required environment | Connection proof | Secret path | Code readiness | Genuine certification |
|---|---|---|---|---|---|
| MT5 Personal | DEMO | authenticated HashiBridge identity, supported version, terminal/account match and fresh heartbeat | pairing code is hashed, expiring, single-use | Existing Phase H/E plus Phase-N gate | NOT_RUN |
| MT5 Prop | DEMO | same, independently scoped | same | Existing Phase H/E plus Phase-N gate; Prop policy remains Phase D | NOT_RUN |
| Binance | TESTNET | server adapter authentication, trading capability, no withdrawal permission, current health | configured server-only secret adapter | Existing Phase F adapter; Phase H honestly returns unavailable until secret/provider adapter configuration | NOT_RUN |
| Bybit | DEMO | same | configured server-only secret adapter | Existing Phase F adapter; same configuration block | NOT_RUN |

Downloading HashiBridge is not installation evidence. Missing signed installers, secret adapters, provider credentials or transports are explicitly unavailable and never treated as connected.

## Connected paths

* Customer UI: `/app/readiness` → `inspectAccountOperations` → authenticated `phase-n-operations` Edge Function → `phase_n_account_operations_safe` → existing account, provider connection, entitlement and Phase E/F truth.
* Admin action: authenticated request with explicit customer UUID, account UUID and idempotency key → `PhaseNOperationsService` → ownership/admin gates → Phase-G preflight → `phase_n_operations_commands`. The command is evidence of a request, not successful execution.
* Customer #001 resolution: `phase_n_customer_configuration(key='CUSTOMER_001', customer_id=<real auth UUID>)`. There is deliberately no fallback to email, label, row order, or an invented UUID.
* Safe reads expose no credentials. The command trigger rejects secret-shaped payload keys. Crypto credential submission continues to fail closed unless a server-only adapter is configured.

## Incident and recovery controls

* `STOP_NEW_ENTRIES` is rejected if protection is disabled; it never cancels protection management.
* `SUBMISSION_UNCERTAIN` permits only reconciliation or stop-new-entries, never retry/resubmit.
* `RETRY_SAFE_WORK` requires a prior command explicitly classified `FAILED_SAFE_RETRY` and no uncertain submission.
* Protection recovery and safety close require persisted Phase E/F protection-incident evidence. They remain requests for existing execution boundaries, not direct orders.
* Cross-customer/account access, missing explicit identity, live environments, stale/missing heartbeats, provider mismatch, duplicate lineage, and Phase-D BLOCK/LOCK fail closed.

## Configuration and deployment prerequisites

1. Review and deploy `20261006120000_phase_n_customer_operations.sql`, then explicitly insert Customer #001's real authenticated UUID as an administrator. Do not infer it.
2. Deploy the Phase-N migrations including `20261008120000_phase_n_provider_credentials.sql` and `20261009120000_phase_n_certification_atomicity.sql`, then deploy `phase-n-operations`; configure Supabase URL/service role only in server runtime. Register authentication/JWT policy and monitor safe errors.
3. Configure signed HashiBridge artifact publication and minimum supported version. Complete a real pairing handshake and heartbeat from each MT5 demo terminal.
4. Enable Supabase Vault, set `PHASE_H_SECRET_ADAPTER=SUPABASE_VAULT` and `PHASE_H_PROVIDER_VERIFICATION=ENABLED`, and configure Binance testnet/Bybit demo credentials server-side. Verify trading-only capabilities and reject withdrawal permission. Never use client storage or an insecure fallback.
5. Deploy the reviewed `phase-n-command-worker`, configure its internal secret, and set `PHASE_N_DEMO_DISPATCH_ENABLED=TRUE` only for the separately authorized demo certification window. It delegates exclusively to existing Phase D/E/F/G and recovery stores; runtime order capability remains disabled until separately configured and authorized.
6. Configure the entitlement-protected WhatsApp destination before exposing it. Until then, show guidance/request status without a destination.
7. Exercise migration/RLS/RPC contracts against a disposable Supabase database, deploy injected transports, restart workers, and verify dead letters/reconciliation before any controlled Customer #001 run.

## Verification boundary and retained limitations

Unit/integration tests use an in-memory store and injected state; they make no external calls and cannot certify a provider or Customer #001. Real HashiBridge installation/handshake, crypto authentication, order/fill/protection lifecycle, Telegram delivery, WhatsApp contact, database failure/restart, deployed RLS, and end-to-end browser review are **NOT_RUN**. **VISUAL REVIEW NOT_RUN**.

Phase-M lab limitations are retained: overlapping-position and intratrade-equity validation remains required before portfolio or Prop performance claims. Phase N does not redesign backtesting.

## Remaining roadmap

* **Phase O:** growth/outreach/engagement and genuine proof agents.
* **Phase P:** selective Google Cloud workers, cost controls and deployment preparation.
* Then database reconciliation, configured end-to-end testing and controlled launch.
