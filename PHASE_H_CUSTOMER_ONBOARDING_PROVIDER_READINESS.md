# Phase H — Customer onboarding and provider readiness

## Status and safety boundary

Phase H implements repository contracts and controlled UI projections. It does **not** activate live or demo execution, place orders, deploy SQL, configure credentials, reserve a paid slot, or certify an external provider. Missing external dependencies resolve to `READY_FOR_CONFIGURATION`, `CHECKOUT_NOT_CONFIGURED`, `NOT_CONFIGURED`, or `BLOCKED` rather than success.

## Repository audit and reused authorities

The pre-change audit found canonical ownership in `connected_execution_accounts.customer_id`, with customer-scoped provider identity from Phase 5C. Phase D extends that table with immutable identity, mode, policy version and runtime control and remains the only decision/risk authority. Phase E owns MT5 command/fill/reconciliation truth. Phase F owns Binance/Bybit sandbox submission truth. Phase G owns certification runs and verdicts. `customer_subscriptions` and commerce migrations are the existing commercial projection; Telegram identity is in `telegram_links`. Customer pages use `AppLayout`; administration uses the existing Operations Center routes and `AdminLayout`.

The audit also found legacy setup surfaces (`CustomerBotSetup`, MT5 portals, crypto portal, and fleet UI). Phase H adds one canonical onboarding entry rather than extending their provider-specific mutation paths. The historical fleet screen derives fallback values and must not be treated as Phase-H readiness truth; the new operations projection shows no mock rows. Existing credential references are opaque IDs in canonical accounts. Phase H application tables contain only `secret_reference`; the safe view omits it. No browser API returns pairing hashes or secrets.

## Data model and RLS

Migration `20260926180000_phase_h_customer_onboarding.sql` adds resumable onboarding sessions, configurable products, entitlement projections, provider metadata, single-use HashiBridge pairings, approved Brain assignments, risk acknowledgements, deterministic readiness, legacy ten-slot inventory, corrected forward to twenty slots, safe audit events, and portable jobs. It extends—not replaces—canonical execution accounts. Account/provider uniqueness remains customer scoped.

RLS limits customer reads to `auth.uid()` ownership and allows only draft onboarding inputs and acknowledgement insertion. Entitlements, connection verification, pairing consumption, Brain assignment, readiness, slots, audits, and jobs are service/admin managed. The pairing RPC is service-role only and consumes a row under `FOR UPDATE`. Admin access uses the existing explicit `is_admin()` authority. Execution truth has no authenticated-user mutation policy.

## Customer journey and UI

`/app/onboarding` provides 13 responsive stages: package, access, market, purpose, provider, experience, risk, strategies, approved Brain, connection, acknowledgement, review, and completion. Draft progress persists locally for immediate reload recovery; the canonical migration provides durable cross-session progress once deployed. Unsupported provider/mode/market combinations fail closed. Signal-only customers skip connection. Advanced explanations distinguish preferences from authority.

`/app/readiness` is the customer control center. Empty state is honest and links to onboarding. Server-backed account cards are deliberately not fabricated before deployment. The model supports multiple independently owned accounts per customer.

## HashiBridge journey

MT5 is demo-only. Installer metadata can be presented, but until a signed artifact service is configured it reports `READY_FOR_CONFIGURATION`; a click never proves installation. Pairing codes have short expiry, one-way hashes, customer/account/connection scope, five-attempt maximum, revocation, single active code and atomic single use. The first authenticated service handshake records bridge identity/version and safe audit data. Heartbeat projection is `HEALTHY` through 60 seconds, `DEGRADED` through 180 seconds, then `OFFLINE`; older bridge versions report `VERSION_OUTDATED`. Account/broker fingerprints belong in safe metadata, never MT5 passwords.

## Binance and Bybit

Only Binance testnet and Bybit demo are allowed. Browser forms submit API key, secret, and optional provider passphrase directly to a server authority; Phase-H projections retain only an opaque secret reference and safe fingerprint. Verification must authenticate, confirm trading, reject withdrawal permission, confirm the selected environment, derive a fingerprint, check health, retrieve symbols/filters, and verify required endpoints. Stable failures include `AUTHENTICATION_FAILED`, `ENVIRONMENT_MISMATCH`, `WITHDRAWAL_PERMISSION_REJECTED`, `CAPABILITY_REJECTED`, and `PROVIDER_UNAVAILABLE`. Without configured adapters, state is `READY_FOR_CONFIGURATION`, never `CONNECTED`.

## Secret handling

`SecretStore` supplies a local/test fake and the boundary for a deployment Supabase vault adapter and future Google Secret Manager adapter. Secrets are write-only, account scoped, rotatable and revocable. They are excluded from safe views, audit metadata, logs, Telegram, customer/admin projections and fixtures. Redaction covers key/secret/password/passphrase/credential fields. Google Secret Manager is not operational or claimed.

## Brain assignment

Approved profiles are `PERSONAL_MT5_GROWTH`, `PERSONAL_BINANCE_CRYPTO`, `PERSONAL_BYBIT_CRYPTO`, and `PROP_MT5_STRICT`, initially policy version `2026.09`. Recommendation is deterministic by provider and purpose. Server assignment is versioned/account-scoped and audited. Risk and strategy preferences are validated against profile ranges. Prop cannot select crypto providers; drawdown locks, protection and certification cannot be disabled. Phase D still produces every `ALLOW`, `REDUCE`, `BLOCK`, or `LOCK` decision.

## Readiness

The deterministic projection evaluates onboarding, entitlement/payment, acknowledgement/terms, provider connection and health, Brain/configuration, sandbox environment, certification, incidents and locks. Stable results are `DRAFT`, `AWAITING_PAYMENT`, `AWAITING_PROVIDER`, `AWAITING_PAIRING`, `AWAITING_VERIFICATION`, `AWAITING_ACKNOWLEDGEMENT`, `AWAITING_CERTIFICATION`, `READY_FOR_CONFIGURATION`, `READY_FOR_DEMO`, `DEGRADED`, `LOCKED`, `SUSPENDED`, and `BLOCKED`, with reason codes. It always returns `executionEnabled: false`; it is not an execution authority.

## Operations Center

`/admin/onboarding` adds a safe customer/account readiness table inside the existing Operations Center shell. It shows customer/account IDs, readiness, reasons and required action without secret references. Support notes, suspend/disable and overrides must be performed through future audited server commands; no client-side bypass was introduced.

## Packages and founding slots

The forward completion migration replaces the legacy Prop-only offer with `FOUNDING_AUTO_EXECUTION`: **Founding 20 — $100/month per connected execution account**. It supports approved MT5 Personal, MT5 Prop, Binance Personal and Bybit Personal configurations. There is no crossed-out future price, permanent-price promise or discount claim. A slot is occupied only while `RESERVED` or `ACTIVE`; an explicit service-only release routine expires abandoned reservations. Availability is counted from durable rows and is never fabricated. The legacy product remains inactive for migration compatibility.

One entitlement binds to exactly one execution account. Unique entitlement, account and founding-reservation constraints prevent reuse. A trigger verifies that the entitlement, account, reservation and customer share ownership, and refuses activation unless payment evidence has produced an eligible entitlement whose source is not `NOT_CONFIGURED`. Every additional account therefore needs another verified entitlement, another applicable slot, connection, Brain, risk configuration, readiness and certification.

## Public routes and conversion status

Canonical share routes are `/free`, `/vip`, `/pricing`, `/execution`, `/execution/mt5`, `/execution/crypto` and `/execution/prop`. `/crypto-automation` and `/crypto-personal-bot` redirect to `/execution/crypto`; `/mt5-automation` and `/personal-ea` redirect to `/execution/mt5`; `/prop-ea` and `/forex-mt5-prop-bot` redirect to `/execution/prop`. `/ai-signals` remains the canonical public signal explanation. Shared links remain valid while contradictory legacy execution pricing is removed.

`/free` retains the permanent community, selected previews, education, Telegram CTA and Free/VIP comparison and now shows the Free → VIP → Execution path plus a canonical-evidence placeholder. `/vip` retains $29/month, 3,500 KES/30 days, M-Pesa/card, signal lifecycle and Free link; it states that VIP and Auto Execution are separate entitlements and projects founding availability as `READY_FOR_CONFIGURATION`.

The new conversion page explains the single scanner/signal truth, Phase-D account decisions, position sizing, Personal/Prop policy, MT5/Binance/Bybit, protection lifecycle, reconciliation, HashiBridge/VPS, secure credentials, risks and independent additional-account rule. It describes code readiness separately from provider configuration, certification and live activation.

## Product previews

The reusable `ExecutionProductPreview` is read-only by construction: no callbacks, forms, Supabase client, provider API or mutation. It labels every surface `Product preview` or `Example interface` and demonstrates dashboard, account, Brain, bounded risk, strategies, decision, HashiBridge, pairing, detection, heartbeat, VPS, exchange setup, withdrawal rejection, readiness, lifecycle, protection incident and Telegram notification without presenting a real connected account or performance.

## HashiBridge, VPS and assisted setup

The customer presentation explains why MT5 needs HashiBridge, always-on Windows/VPS requirements, configurable minimum guidance, signed-download state, installation, expiring pairing, terminal/account detection, heartbeat expiry, version updates, certification and assisted setup. Downloading is not installation; pairing plus heartbeat is connection proof. Closing MT5, HashiBridge, the VPS or computer interrupts service.

Public sales contact configuration may answer compatibility, pricing, VPS and Prop questions. Entitlement-protected assisted setup covers installation, VPS, pairing, provider forms, additional accounts and troubleshooting. The contact destination lives in `phase_h_configuration`; it is not hardcoded into UI. `assisted_setup_requests` rejects secret-like customer messages, is customer/account scoped and requires an active account entitlement or explicit authorized access through the server authority. The permanent warning is: **HashiBot support will never ask you to send API secrets, MT5 passwords or private keys through WhatsApp.**

## Durable backend and provider authorities

`phaseHApi` connects the authenticated wizard to `phase-h-authority` for load/resume, idempotent persistence, server validation, recommendation, approved assignment, account/connection draft setup, acknowledgement, readiness, pairing, credential lifecycle, support and additional-account requests. Local storage is only a recovery cache; remote state wins at equal/newer progress. Missing schema/deployment remains `READY_FOR_CONFIGURATION` and retains the local draft.

The Edge Function authenticates every request, proves account ownership, permits only MT5 demo/Binance testnet/Bybit demo, emits safe reason codes and audit events, and never enables execution. Pairing codes are returned once, hashed durably, expiring, revocable and scoped. Binance/Bybit credential submission is rejected before acceptance when `PHASE_H_SECRET_ADAPTER` is absent; no secret is echoed. A configured future adapter must store first and then enqueue capability verification without changing this contract.

## Customer dashboard, Operations Center and campaigns

The customer dashboard now renders canonical `execution_accounts_safe` rows when present and explicitly marks missing balance/equity, fingerprint, drawdown, positions and protection truth unavailable rather than inventing it. It exposes safe management and additional-account request paths. Operations Center counts onboarding, entitlement, connections, Brains, acknowledgements, slots, support, additional accounts, campaigns and audit rows beside readiness reasons; there are no client-side activation controls.

`campaign_attributions` captures campaign/source/medium/content/referral, landing route, click, permitted anonymous reference, later customer association, package and conversion stage. Future agents read the configured canonical share routes; Phase H starts no Telegram, proof, affiliate or outreach worker.

## Completion matrix

| Requirement | Status | Repository outcome |
|---|---|---|
| Canonical ownership and Phase D–G boundaries | Reused | Existing account, policy, execution and certification authorities retained |
| Founding 20 and $100/account | Complete | Forward catalog and inventory correction |
| Entitlement/account/slot uniqueness | Complete | Durable unique constraints and ownership trigger |
| Public conversion routes | Consolidated | Canonical pages and safe legacy redirects |
| Free and VIP | Consolidated | Existing experiences preserved and extended |
| Product previews | Complete | Responsive, labelled and non-mutating |
| Durable onboarding UI | Complete | Authenticated authority with local reconciliation/fail-closed fallback |
| Provider registration authorities | Ready for configuration | Server boundary complete; secret/provider adapters intentionally absent |
| HashiBridge installer | Ready for configuration | Pairing/health journey complete; signed artifact absent |
| Customer/admin projections | Complete | Canonical rows and honest unavailable fields |
| WhatsApp assisted setup | Ready for configuration | Entitlement gate/model complete; contact destination absent |
| Campaign/agent targets | Complete | Attribution and configured routes; posting deferred |
| Google Cloud adapters | Deferred | Portable envelope retained; no resources deployed |
| Payments and verified entitlements | Deferred | Exact Phase-I responsibility |
| Live execution | Blocked | Explicitly prohibited |

## Payment boundary and exact Phase-I handoff

Phase I must implement authenticated checkout creation, signed Whop/M-Pesa webhook verification, idempotent payment events, subscription activation/renewal/grace/failure/expiry/refund/cancellation, entitlement grant/revoke, Telegram-access action requests, and atomic founding-slot reserve/activate/release. It must replace the local adapter without changing readiness business logic, never infer payment from redirects, and backfill no verified payment without provider evidence.

## Google Cloud portability

`PortableJob`/`portable_jobs` carries payload, customer/account scope, idempotency, attempts, retry availability, dead-letter/cancellation timestamps, safe errors, audit lineage, rate-limit key and human approval. Local/test and Supabase/Edge runners can use the same contract. Future Cloud Run, Tasks, Pub/Sub and Scheduler change transport only; Secret Manager and Cloud Logging/Monitoring adapters must preserve redaction and account scope. No cloud credentials, scheduler or deployment are included.

## External deferrals and known blockers

Remote migration application, Supabase authority deployment, signed HashiBridge artifacts/download signing, real sandbox credentials, provider capability calls, Whop/M-Pesa, Google Cloud, Telegram membership automation, and Customer #001 forward certification are deferred. Until deployment, local progress is device-local and durable APIs remain `READY_FOR_CONFIGURATION`. No live environment is accepted.

## Test inventory

`npm run test:phase-h` covers provider/mode variants, approved Brains and unsafe preferences, pairing ownership/expiry/replay, heartbeat/version transitions, Binance/Bybit capability outcomes, secret redaction/store lifecycle, payment placeholder, readiness gates and live-mode rejection. SQL inspection covers customer ownership, RLS, service-only pairing, twenty slots, entitlement binding, idempotency and portable jobs. Phase D–G and execution/recovery suites remain regression authorities.
