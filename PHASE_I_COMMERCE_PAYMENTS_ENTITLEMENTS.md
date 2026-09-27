# Phase I — Commerce, payments and entitlements

## Executive status
Phase I adds a fail-closed, provider-neutral commerce model while preserving Phase H's catalog, `phase_h_entitlements`, founding reservations, execution ownership and portable jobs. No live checkout, payment, Telegram membership, infrastructure or trading is enabled. Missing provider configuration returns `CHECKOUT_NOT_CONFIGURED`, `WEBHOOK_NOT_CONFIGURED`, or `READY_FOR_CONFIGURATION`.

## Repository audit and authority map
The supplied Phase-H object IDs are not present in this clone, but merge `447b552` contains equivalent Phase-H contents (feature commit `2623435` and migration `20260926180000_phase_h_customer_onboarding.sql`). The audit found legacy `packages`/`customer_subscriptions`, manual `access_requests` and admin VIP mutation RPCs; the 2026-09 commerce entitlement foundation and Whop webhook; and Phase-H `phase_h_products`, `phase_h_entitlements`, `founding_slot_reservations`, `execution_entitlement_bindings`, `connected_execution_accounts`, `additional_account_requests`, campaign attribution and `portable_jobs`. Direct browser Whop URLs and a manual M-Pesa receipt flow remain compatibility surfaces and are not payment proof. `customer-provisioning` can create a pending access request, not verified payment. Existing Whop processing remains separately deployed legacy code; Phase-I tables are canonical for new checkout/payment truth.

| Concern | Authority retained or consolidated |
|---|---|
| Products, entitlements, slots | Phase-H tables, extended forward-only |
| Customer/account ownership | `auth.users` + `connected_execution_accounts.customer_id` |
| Checkout/payment/subscription | New `commerce_*` tables and server-only checkout authority |
| Account binding | Phase-H binding plus unique active entitlement/account index |
| Trading eligibility | Phases D–H; commerce cannot enable execution |
| Telegram | `telegram_fulfillment_requests`; Phase J alone delivers |
| Work | Phase-H `portable_jobs`; no cron enabled |

RLS audit: legacy subscription rows are owner-readable and admin-writable. Phase-H sensitive tables revoke customer mutation. Phase-I grants customers owner-scoped reads only; event inbox, reviews, refunds and all mutations remain service-only. Provider secrets are environment-only. Deployment configuration was inspected and only local function declarations were added.

## Product and price catalog
| Product | Canonical price | Term | Entitlement |
|---|---:|---|---|
| Free Signals | Free | Permanent unless suspended | Free community only |
| VIP Signals / Whop | USD 29 | Monthly | VIP signals, no execution |
| VIP Signals / M-Pesa | KES 3,500 | Fixed 30 days | VIP signals, no autopay assumption |
| Founding 20 Auto Execution | USD 100 | Monthly, per account | One execution-account entitlement and one of 20 slots |
| Auto Execution / M-Pesa | Not approved | — | Configuration required; no invented conversion |

Prices use minor currency units and versioned database rows. Provider visibility requires `configured=true`. Each additional execution account requires a distinct checkout, payment, slot, entitlement, provider setup, Brain and certification.

## Checkout and founding-slot lifecycle
Authenticated `commerce-checkout` reads a current canonical price, rejects client price changes, checks provider/currency, validates same-origin return URLs, bounds attribution, requires idempotency and verifies target-account ownership. It never returns secrets or calls a live provider in this phase. Founding checkout invokes a transaction-scoped advisory lock, expires abandoned reservations, chooses one free slot from 1–20 and binds it to checkout. Payment processing must lock payment/checkout/subscription rows. A late payment reacquires capacity or becomes `REVIEW_REQUIRED`; it must never silently grant or lose funds. Checkout failure/expiry releases reservations through the reservation-expiry portable job.

## Provider adapters and webhooks
`ProviderAdapter` defines configuration, checkout, webhook authenticity and reconciliation. `DeterministicUnconfiguredAdapter` is fail closed. Whop uses USD recurring periods; real checkout and official signed webhook configuration are deferred. M-Pesa uses normalized Kenya numbers, masked projections and fixed paid periods. Its callback endpoint has a 256 KiB bound, server secret verification, SHA-256 payload identity, unique inbox event handling and duplicate acknowledgement. It persists verified callbacks before asynchronous normalization. No redirect is evidence.

A configured processor must verify authenticity first, persist `(provider,event_id)`, lock canonical rows, compare amount/currency/product/customer to checkout, apply a legal state-machine transition, atomically activate/revoke entitlement and slot/binding, enqueue Telegram work and audit. Invalid or conflicting events change no commercial truth. Full card data, secrets and general-log phone values are prohibited. Restricted payload has explicit retention and no customer grant.

## Lifecycle behavior
Payment transitions are explicit and illegal transitions throw. Verified VIP payment creates/extends an entitlement from the later of existing expiry or confirmation. Failure uses finite configured grace; expiry, refund and dispute suspend/revoke deterministically. M-Pesa renewal is a new verified payment. Free enrollment requires authenticated server work but no payment and queues a Free `ADD` request. Execution activation additionally requires ownership, active slot and unique account binding. Entitlement is commercial access only: provider pairing, acknowledgement, policy, Brain, sandbox readiness and Phase-G certification remain independent.

Cancellation at period end preserves access through its verified period. Refund, reversal, dispute and chargeback evidence are first-class cases and can require review. Manual grants must be separately audited and may never be labeled provider verified.

## UI and Operations Center
`/payment/result` starts at **PENDING VERIFICATION** and reads backend checkout state. `/app/billing` projects subscription/provider, amount, period and entitlement state without sensitive data and links additional-account onboarding. `/admin/commerce` provides safe aggregate queues for checkouts, payments, subscriptions, manual reviews and Telegram requests; it includes no “mark paid” control. Public legacy CTAs remain visible, but unconfigured canonical products cannot fabricate checkout.

## Reconciliation and recovery
The Phase-H portable envelope is reused for `PAYMENT_RECONCILIATION`, `RESERVATION_EXPIRY`, `SUBSCRIPTION_RENEWAL_CHECK`, `GRACE_EXPIRY`, `TELEGRAM_FULFILLMENT` (Phase J) and `MANUAL_REVIEW_ESCALATION`. Jobs are customer-scoped, idempotent, retryable, rate-limitable, auditable and dead-letter capable. Reconciliation covers delayed/missed/duplicate/conflicting events, local commit failure, expired reservation, late payment, provider/local subscription drift, late disputes and worker restart. No scheduler is activated.

## Security
Customers have no INSERT/UPDATE/DELETE privileges on payment truth, subscriptions, entitlements, reservations, inbox or fulfillment completion. Webhook/reconciliation mutation is service-only. Same-customer account ownership and a unique active entitlement per execution account are enforced. Return URLs are same-origin. Attribution is allow-listed and length bounded. Safe receipt views mask references. Raw event retention is restricted; secrets and card data are never stored.

## External configuration
Required later: Whop API/webhook secrets and product references; official deployed verification configuration; M-Pesa credentials/callback secret, approved Auto Execution KES price and reconciliation adapter; channel/audience IDs; worker/scheduler deployment. No real credentials are included.

## Google Cloud portability
A future Cloud Run authority can host checkout/webhooks; Cloud Tasks can execute retries; Pub/Sub can distribute payment/entitlement events; Cloud Scheduler can initiate reconciliation; Secret Manager can hold provider credentials; Logging/Monitoring plus a dead-letter alert can expose health; budgets and quotas must bound cost. Database truth and portable envelopes remain provider independent.

## Delivery matrix
| Capability | Implemented | Deterministically tested | Ready for configuration | Externally configured | Payment verified | Telegram fulfilled | Deferred |
|---|---:|---:|---:|---:|---:|---:|---:|
| Catalog/prices/states | Yes | Yes | Yes | No | N/A | N/A | No |
| Checkout/slot authority | Yes | Yes | Yes | No | No | No | Provider network |
| Whop adapter contract | Yes | Yes | Yes | No | No | No | Live adapter |
| M-Pesa inbox/contract | Yes | Yes | Yes | No | No | No | Live request/reconcile |
| Entitlement schema | Yes | Yes | Yes | No | No | No | Processor deployment |
| Telegram requests | Yes | Yes | Yes | No | Independent | No | Phase J worker |
| Cloud workers | Contract | Yes | Yes | No | No | No | Deployment |

## Tests and baseline
`npm run test:phase-i` exercises prices, capacity, one-account semantics, price/provider rejection, safe URLs/attribution, phone privacy, legal transitions, evidence mismatch, exhaustion/expiry/late payment review, unconfigured adapters and security schema markers. Required earlier phase and build checks are recorded in the final delivery report. Before changes, `npm run typecheck` failed in existing UI/Brain code and `npm run test:recovery` failed because its static scanner expected `SCANNER_MAX_FOREX_SYMBOLS`; these are pre-existing and outside Phase I.

## Exact Phase-J handoff
Phase J must claim only `PENDING` `telegram_fulfillment_requests`, atomically move them to `CLAIMED`, use the idempotency key for Telegram delivery, then set `COMPLETED`, `FAILED` or `DEAD_LETTER` with a safe error and timestamp. It must never infer entitlement from Telegram state, mutate payment truth, expose channel credentials, or erase verified commercial access on delivery failure. It must implement ADD/RESTORE/REMOVE/SUSPEND for Free, VIP and configured execution audiences and enqueue bounded retry jobs through `portable_jobs`.

## Completion pass: canonical writer audit
The completion audit classified every commercial writer:

| Writer | Previous capability | Completion restriction |
|---|---|---|
| `process_whop_commerce_event` | Mutated legacy `customer_subscriptions` | Execute revoked; Whop endpoint now writes the canonical inbox and invokes only `process_canonical_commerce_event` |
| `admin_review_mpesa_request` | Could label a manual receipt paid | Execute revoked from authenticated administrators |
| `admin_mutate_vip_entitlement` | Could create a legacy manual paid subscription | Execute revoked from authenticated administrators |
| Admin Access Requests / Customers pages | Direct legacy subscription insert/update under admin RLS | Table INSERT/UPDATE/DELETE revoked from `authenticated`; historical reads remain |
| `customer-provisioning` | Creates a pending access request | Compatibility input only; no canonical Phase-I mutation |
| Direct public Whop URL | Navigated without canonical checkout metadata | Removed from the checkout component; it invokes `commerce-checkout` |
| Free Telegram invite | Bypassed fulfillment truth | Removed; authenticated `free-enrollment` creates entitlement and pending request |
| `process_canonical_commerce_event` | New | **Only canonical paid-access writer**, executable only by `service_role` |
| `enroll_free_signals` | New | Separate service-only, non-payment Free authority |

Legacy records remain intact and readable where existing product UI needs them, but cannot manufacture canonical verified payment or Phase-H entitlement truth.

## Canonical normalized event and processing sequence
`NormalizedCommerceEvent` includes provider, event ID/type, payment/checkout/subscription identities, canonical checkout/customer/product references, minor-unit amount, currency, payment status, occurrence time, verified flag, payload hash, reconciliation flag, refund/dispute type, periods and bounded safe evidence. Whop normalization consumes only a successfully verified Standard Webhooks event. M-Pesa normalization requires merchant and checkout identities plus a recognized result code. Incomplete evidence enters `REVIEW_REQUIRED`; it is never completed heuristically.

The exact transaction boundary is one invocation of `process_canonical_commerce_event`:

1. Lock the unique inbox row and reject unverified/invalid events.
2. Validate the normalized envelope and timestamp.
3. Lock the canonical checkout and validate provider/customer/product/amount/currency/price version.
4. Lock or create the stable payment attempt; an already-applied provider payment returns idempotently.
5. Lock the current subscription and entitlement.
6. For execution, lock inventory, reservation, owned account and binding; atomically reacquire late capacity or persist payment as review-required.
7. Apply subscription and entitlement transitions and verified lineage exactly once.
8. Create the deterministic Telegram request with `ON CONFLICT DO NOTHING`.
9. Write safe audit evidence.
10. Mark the inbox event processed last. Any raised error rolls back the complete invocation.

A review outcome intentionally commits the payment evidence, review record and `REVIEW_REQUIRED` states without granting access. Retrying the same processed event or stable payment cannot extend a period again.

## Completed provider behavior
Whop uses the repository's official Standard Webhooks verifier. A configuration-ready adapter injects provider transport for checkout creation and lookup and always attaches HashiBot checkout, customer and product metadata. Missing transport, secrets or product plan returns a configuration state without network activity. The webhook no longer requires API reconciliation before durable inbox insertion; ambiguous evidence is preserved for reconciliation rather than discarded.

M-Pesa exposes an injected STK/status contract, Kenya phone normalization/masking, callback-secret authentication, merchant/checkout/receipt identities and result-code normalization. Successful M-Pesa evidence is accepted only for `VIP_SIGNALS`, KES 350,000 minor units, and exactly 30 days. Every renewal requires a distinct stable receipt/payment identity. Auto Execution through M-Pesa remains unsupported.

## Completed transitions and slot rules
Initial success activates one subscription and one Phase-H entitlement, records payment lineage, and emits one `ADD`. Renewal extends from the later of current expiry or verified event time; a stable payment cannot extend twice. `RESTORE` is emitted only when prior access was suspended or lapsed. Cancellation-at-period-end changes subscription state but preserves entitlement through its paid expiry. Failed renewal enters the configured finite three-day grace policy. Expiry/cancellation/refund/reversal revokes access and releases binding/slot; dispute/chargeback suspends binding but deliberately retains the occupied slot while funds are ambiguous. Partial refunds route to manual review.

Late Founding payments run under the same inventory advisory lock. The original slot is activated when safe, a different free slot is acquired when necessary, and exhausted inventory persists the verified payment as `REVIEW_REQUIRED` without entitlement. Additional-account checkouts retain their independent request, account, reservation, payment, entitlement and binding identities.

## Free enrollment and reconciliation
`free-enrollment` authenticates the customer and invokes the separate service-only `enroll_free_signals` RPC. It creates no checkout, payment, subscription or reservation. Its entitlement and Free `ADD` request are idempotent.

`commerce-reconcile` is an internal-secret-protected, undeployed handler that retries verified `RECEIVED`/`FAILED` inbox events through the same canonical RPC. Provider lookup adapters can insert discovered events under stable provider identities. Missing checkout, price drift, mismatches, late exhausted capacity and ambiguous evidence become review items. Telegram retry remains independent and never rolls back entitlement.

## Completion implementation matrix
| Layer | Business logic | Deterministic test | Configuration ready | Credentials present | Deployed | Real payment performed |
|---|---:|---:|---:|---:|---:|---:|
| Atomic database processor | Yes | Yes | Yes | N/A | No | No |
| Whop verification/normalization | Yes | Signed fixture | Yes | No | No | No |
| Whop checkout/reconciliation transport | Contract | Yes | Yes | No | No | No |
| M-Pesa callback/normalization | Yes | Fixture | Yes | No | No | No |
| M-Pesa STK/status transport | Contract | Yes | Yes | No | No | No |
| Free enrollment | Yes | Yes | Yes | N/A | No | N/A |
| Telegram request creation | Yes | Yes | Phase-J ready | No | No | No delivery |
| Reconciliation retry | Yes | Yes | Yes | No | No | No |

## Completion validation notes
The completion pass reran the required Phase D–H, execution, adoption, edge and production-build checks. Repository-wide `typecheck` still fails, but filtering its diagnostics to every changed TypeScript/TSX module produced no Phase-I completion diagnostics after the checkout product-map correction. `test:recovery` fails at the same unchanged `SCANNER_MAX_FOREX_SYMBOLS` static assertion recorded before Phase I; the completion diff does not touch the scanner or recovery test. No new regression was observed in the required passing suites.
