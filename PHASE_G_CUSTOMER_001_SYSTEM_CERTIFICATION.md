# Phase G — Customer #001 End-to-End System Certification

## Verdict

**Implementation: complete; real-provider certification: BLOCKED.** No safe repository contract maps the human label “Customer #001” to a deployed customer UUID, no runtime credential capability evidence was read, and no provider or bridge connection was invoked. The deterministic suite is not a claim that a real order was placed. Live execution remains prohibited.

| Case | Result | Evidence / blocker |
|---|---|---|
| MT5 Personal demo | BLOCKED | Customer/account UUID, credential capability and active bridge lease require runtime service evidence |
| MT5 Prop demo | BLOCKED | Customer/account UUID, credential capability and active bridge lease require runtime service evidence |
| Binance testnet | BLOCKED | Customer/account UUID, capability projection and current provider filters/health require runtime service evidence |
| Bybit demo | BLOCKED | Customer/account UUID, capability projection and current provider filters/health require runtime service evidence |
| Cross-account/provider/customer isolation | PASSED (deterministic) | Phase-G gate and database account-scoped uniqueness/RLS tests |
| Risk and quantity preservation | PASSED (deterministic) | Requested quantity is Phase-D quantity; submitted quantity can only decrease |
| Duplicate prevention | PASSED (deterministic) | Per-account intent, plan and client-order unique constraints |
| Protection / reconciliation | PASSED (deterministic) | Sequenced lifecycle, deadlines, incident lock projection, stable-identity reconciliation |
| Telegram projection | PASSED (deterministic) | Admin-only, credential-redacted, deterministic idempotency key |
| Overall Customer #001 readiness | BLOCKED | All configured real accounts must complete service-run preflight through terminal protection/closure |

## Repository audit and reused authorities

The active history contains Phase D (`db4b495`), Phase E (`89bb169`) and Phase F (`3990041`, merged by `2c750cb`). The prompt's `674620c` object is absent locally; the Phase-F implementation is nevertheless directly verifiable in the active lineage by commit contents. Phase D remains the only decision/risk/quantity authority in `account-policy-authority.ts` and migration `20260925120000_phase_d_multi_tenant_account_policy.sql`. Phase E remains the MT5 `OPEN_POSITION` command boundary in `mt5-phase-e-execution.ts` and `20260925180000_phase_e_mt5_demo_execution.sql`. Phase F remains the Binance/Bybit envelope and lifecycle boundary in `crypto-phase-f-execution.ts` and `20260925210000_phase_f_crypto_execution.sql`.

Legacy execution entry points still exist (the Binance testnet function, Bybit demo function, MT5 bridge, monitors, execution adoption code and older order/trade tables). Phase G does not bless them independently: a certification row is a read/projection artifact and has no submission privilege. Existing provider functions continue to own actual submission. Phase-G creation is service-only and rechecks the locked Phase-D decision, account ownership, and sandbox environment in one transaction. No scanner, signal table, arbitrator, risk engine, executor, or lifecycle authority was added.

## Certified call paths

1. Canonical immutable signal → Phase-D `evaluateAccountSignal` / persisted account-policy decision.
2. Service creates an account-scoped Phase-G run through `create_customer_001_certification_run`; this cannot run for `BLOCK`/`LOCK` or a live route.
3. Every preflight check is persisted with a stable code and safe evidence.
4. Passing MT5 work continues through Phase E's `createMt5EntryCommand` → canonical `OPEN_POSITION` queue → HashiBridge. Passing crypto work continues through Phase F's `createCryptoSubmissionEnvelope` → existing Binance/Bybit adoption worker.
5. Canonical provider evidence drives the existing Phase-E/F lifecycle and the Phase-G projection. Submission acknowledgement alone cannot transition to `PASSED`; only terminal `CLOSED → PASSED` is valid.
6. Uncertain submission transitions to `RECONCILING` and queries/adopts by stable client identity; it has no transition back to submission.

## Isolation, provider differences, and safety

All durable keys contain both customer and execution-account scope. RLS permits the owning customer or admin to read, while tables expose no authenticated mutation policy and mutation RPC execution is service-role only. MT5 additionally requires a bridge identity/lease and uses a 45-second protection deadline. Binance requires `TESTNET`; Bybit and MT5 require `DEMO`; crypto uses current tick/step/minimum filters and a 30-second deadline. Normalization floors quantity and may never inflate Phase-D authorization. Credential persistence is capability-only (`trading`, `withdrawal`, `verified`); raw credentials and provider payloads are forbidden.

On deadline expiry, `FILLED_PROTECTION_PENDING` becomes `PROTECTION_INCIDENT`, the account/symbol lock projection is asserted, and only recovery or safety close may follow. Repair/reconciliation is keyed by stable run/account/client identities; duplicate lifecycle events and provider acknowledgements are projections, not new submissions. Protection cannot be verified before the filled/protection-pending sequence.

## Safety-invariant matrix

| Invariant | Control |
|---|---|
| Phase-D ALLOW/REDUCE only | Pure preflight plus service RPC recheck |
| BLOCK/LOCK, stale intent, unhealthy route rejected | Stable failing check codes |
| Customer/account/provider isolation | Exact identity comparisons, account foreign key, scoped uniqueness, RLS |
| Personal/Prop and Binance/Bybit independence | Distinct provider/account identity; no global intent key |
| No live access | Type gate, pure gate, and database environment check |
| No quantity/risk inflation | Original values retained; DB `submitted <= requested`; Phase-D row is authority |
| Credentials safe | Capability projection only; redaction test; no secret columns |
| Duplicate intent/plan/client identity | Three atomic per-account unique constraints |
| Uncertain response | Reconciliation-only transition and stable client lookup |
| Missing protection | Deadline, incident, execution lock projection, recovery/safety-close sequence |
| Telegram dedupe/separation | Stable run/event/version admin key; no Free/VIP channel |
| Customer mutation prohibited | Read-only RLS; service-only creation RPC |

## Telegram and Operations Center

Certification events are projected from certification/lifecycle truth to the existing professional Telegram **admin** authority. The deterministic projection covers start, blocked preflight, acceptance/uncertainty, fills, protection, discrepancy, recovery, safety close, close and verdict; it redacts credential-like text and deduplicates retries. Real Telegram delivery was deferred because repository tests must not send external messages.

The existing MT5 Operations Center certification panel now reads `customer_system_certification_runs`. It exposes provider/environment, lifecycle status, Phase-D decision, requested/submitted quantity, health/protection/reconciliation, and reason. It is deliberately read-only and supplies no execution or mutation control.

## Execution classification and next step

All Phase-G provider cases executed in this change are deterministic simulations. **No real MT5 demo, Binance testnet, Bybit demo, Telegram delivery, remote SQL, cron, credential operation, or live order occurred.** Missing safe runtime identity/configuration is recorded as `BLOCKED`, not passed; non-authorized live cases are `NOT_RUN`.

The exact next step is for an authorized operator, in a non-production Supabase environment, to apply the migration, resolve the existing Customer #001 UUID and owned enabled accounts without exposing credentials, then invoke service-only preflight separately for each configured account. Only accounts whose current health, capabilities, filters/lease, locks and protection pass may proceed through their existing Phase-E/F demo boundary. Capture provider evidence through protected terminal closure; leave unavailable accounts `BLOCKED` and live cases `NOT_RUN`. A separate live-readiness/security review would still be required and this phase provides no live enablement.

## Local command results (2026-09-26 UTC)

`test:phase-g`, Phase D/E/F, execution, execution-adoption, edge-function checks, build, and `git diff --check` passed. The execution chaos suite reported 23 passes, two warnings (provider unavailable and orphan position), and zero failures. `test:recovery` retains the pre-existing assertion that `market-scanner` must contain `SCANNER_MAX_FOREX_SYMBOLS`; Phase G does not touch the scanner. Repository-wide `typecheck` retains numerous existing errors; the Phase-G panel errors observed on the first run were corrected, while representative remaining errors include invalid `Section` values in `src/App.tsx`, account brain type exports, and unrelated Operations/customer UI contracts. No new Phase-G regression is known.
