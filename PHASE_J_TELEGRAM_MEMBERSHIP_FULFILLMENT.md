# Phase J — Telegram membership fulfillment

## Verdict and certification status

**A real customer cannot yet be claimed to complete signup → payment → Telegram linking → correct channel admission automatically.** The contracts and deterministic policy checks are implemented, but this repository contains no evidence that the Phase-I payment providers, deployed migration/function, Telegram bot webhook, private audience IDs, bot administrator permissions, or scheduled worker have been configured and exercised against real Telegram.

| Status class | Phase J status |
|---|---|
| Deterministically tested | Audience isolation, entitlement-state decisions, stale action rejection, retry classification/backoff, token/RLS/service-role/claim guards, invite evidence requirement |
| Real Telegram tested | **Not tested** |
| Externally configured | **Not established**; configuration rows default disabled and contain no chat IDs |
| Blocked | Production admission certification is blocked on provider, Supabase and Telegram deployment/configuration and end-to-end evidence |

## Authority audit

Phase I is the sole verified commerce writer. `process_canonical_commerce_event` validates signed normalized provider evidence and transactionally changes subscription/entitlement truth; `enroll_free_signals` is the canonical zero-price enrollment. Phase H owns customer/account bindings and product readiness. Phase J neither accepts a plan from the browser nor changes an entitlement: it maps current `phase_h_entitlements` rows into delivery work.

`telegram_fulfillment_requests` remains the durable request authority. Phase I created it with unique idempotency keys, owner/admin reads, service-only writes, and `ADD`, `RESTORE`, `SUSPEND`, `REMOVE`. Phase J extends it with atomic `SKIP LOCKED` claims, leases, bounded attempts, retry availability, provider classification, evidence, completion, dead-letter, superseded, action-required, and configuration states. Lost claims recover after five minutes.

The old VIP-only onboarding RPC/fulfiller and manual `telegram_links` form are compatibility paths, not authorities. Phase J removes customer mutation of Telegram identity, replaces the form with bot-confirmed linking, and never uses URL, redirect, username, membership, or client product claims as paid truth. Existing rows are preserved. Existing signal publishers remain responsible only for content routing; they do not grant membership.

## Audience matrix

| Audience | Canonical input | Delivery | Isolation |
|---|---|---|---|
| Free | active/trial/grace `FREE_SIGNALS`, created by canonical Free enrollment | private Free audience invite/join confirmation | no VIP details |
| VIP | active/trial/grace `VIP_SIGNALS`, created by Phase-I verified payment | private VIP audience invite/join confirmation | no execution/customer data |
| Execution | active/trial/grace `FOUNDING_AUTO_EXECUTION` plus separately configured execution audience | customer execution-report audience only | payment does **not** certify or activate trading |
| Admin | operational incident authority | admin audience | never purchasable |
| Owner | configured owner identity/research track | owner only | outside all customer purchase flows |

## Linking and lifecycle

An authenticated customer requests a random 192-bit, ten-minute, single-use token. Only its SHA-256 hash is stored. Starting the configured bot supplies the Telegram user ID from Telegram's signed webhook path. Consumption locks the token, rejects expired/replaced/replayed tokens, serializes Telegram identity assignment, rejects identities bound to another customer, and queues every already-active customer entitlement. This supports payment-before-linking and linking-before-payment. Relinking invalidates previous live tokens and requires a new Telegram-originated update.

The worker atomically claims eligible jobs and immediately reloads entitlement, link and server-only audience configuration. A stale grant becomes `SUPERSEDED`; renewal defeats a stale removal. Active membership is confirmed with `getChatMember`. Telegram cannot silently add a user: a one-person, ten-minute invite is sent and the request remains `ACTION_REQUIRED` until a later Telegram update/reconciliation proves membership. Suspension/removal is similarly verified after API calls. Ambiguous responses retry and are reconciled rather than declared successful. Voluntary departure is drift; an entitled customer may receive a fresh short-lived invite.

Refund, reversal, dispute, expiry and suspension continue to originate in Phase I and enqueue the corresponding membership projection. Duplicate webhooks and requests are constrained by Phase-I event keys and fulfillment idempotency keys. Grace and renewal preserve access. Entitlement survives Telegram downtime, permission loss and bot outages.

## Security and operations

Bot token, webhook secret, worker secret, chat IDs and invite links are server-side. The browser receives only the public bot username and safe customer-scoped membership/request projections. Raw provider payloads, bot credentials and invites are absent from operations views. Customer reads are RLS-scoped; fulfillment/config mutation and token consumption are service-only. Safe errors are capped at 240 characters.

Operations Center reports queue depth, failures, dead letters, unlinked entitled customers, drift and configuration health. Its retry action invokes server reconciliation; it cannot mark payment or membership successful. `READY_FOR_CONFIGURATION` preserves commercial truth and schedules recovery.

## Required production steps

1. Apply migrations through `20260928180000_phase_j_telegram_membership.sql` to the intended Supabase project and deploy `telegram-membership`.
2. Configure and verify Phase-I Whop/M-Pesa products, signing secrets, prices, webhook delivery and reconciliation; prove real payment lifecycle events.
3. Create/choose separate private Free, VIP, execution, admin and owner Telegram audiences. Insert chat IDs server-side, select channel/supergroup join mode, enable only the intended rows, and record bot-permission verification.
4. Set `TELEGRAM_BOT_TOKEN`, a high-entropy `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WORKER_SECRET`, and the safe public `VITE_TELEGRAM_BOT_USERNAME`. Never place the token or private invites in frontend variables.
5. Register Telegram's webhook to the deployed function with the secret-token header. Give the bot only the required invite, join-request and ban permissions in each configured audience.
6. Schedule authenticated worker/reconciliation invocations with bounded concurrency and alerts; verify restart recovery, 429 backoff and dead-letter operations.
7. Exercise Free, VIP, execution, admin and owner isolation using real Telegram accounts, including join acceptance, departure/rejoin, renewal, expiry, refund/dispute, permission loss and outage recovery. Retain safe audit evidence.
8. Only after those checks pass may operators describe website payment → Telegram admission as automatic in production.

## Roadmap handoff

The locked next queue remains: scanner signal-mode validation and strategy calibration; Telegram signal/reporting certification; Customer #001 forward-demo certification; Operations Center and recovery; growth/outreach/proof/engagement agents; Google Cloud portable-worker deployment; controlled acquisition; then separately approved execution expansion. The private owner signal/prop research track remains visible and separate.
