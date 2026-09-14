# HashiBot Telegram product contract

## Authority and delivery path

`telegram-router.ts` is the only supported outbound gateway. It owns channel selection, eligibility, channel-specific idempotency, Telegram error classification, retry/dead-letter state, and writes to the existing `telegram_deliveries` ledger. Scanner, signal truth, trade management, intelligence, admin tooling, and future agents must submit structured events to this router; they must not call Telegram directly.

Initial signals use the canonical signal identifier. Lifecycle updates use canonical signal/trade events and a distinct lifecycle-stage idempotency key. An outcome or R value is publishable only when authoritative trade/outcome truth supplies it. Retries never change the audience. Free and VIP keys are intentionally distinct.

## ADMIN — operations only

Admin accepts material runtime/backend, provider, bridge, scanner, execution/protection, risk-lock, recovery/failover, delivery, certification, and data-integrity incidents plus concise operations digests. It rejects marketing, conversion CTAs, customer signal hype, and routine low-severity noise. Producers should supply stable event IDs/reasons so duplicate incident noise collapses.

## FREE — value, trust, conversion

Free receives a configurable, capped subset of genuine eligible canonical signals; professional previews; approved intelligence/market briefs; education; truthful verified outcomes/recaps; product education; and rate-limited VIP invitations. No signal is fabricated to fill a quota and no eligible signal is intentionally corrupted or delayed until useless. Preview mode may withhold management levels but must say that it is a preview. CTAs are campaigns, not an automatic paragraph on every message. Fake scarcity, profits, member counts, testimonials, win rates, and countdowns are prohibited.

Operational cadence is controlled by the Free publisher/campaign configuration (`maxSignalsPerDay`, grade/confidence/R:R eligibility, cooldown and daily campaign limits), not scattered constants.

## VIP — premium signal delivery

VIP receives the complete canonically approved SIGNAL/VIP stream for eligible Forex, Gold/Metals, and Crypto markets without requiring execution credentials. It includes initial qualified signals, canonical entry/TP/SL/break-even/close/cancel/invalidate lifecycle updates, relevant approved context, daily recaps, and weekly reports. It contains minimal sales content. Internal execution-product mode names are not customer-facing and qualification logic remains outside Telegram.

Signal fields (entry zone, stop, targets, R:R, strategy, grade, confidence, session, exchange) are emitted only when present in canonical data. Times are displayed in 12-hour East Africa Time while source timestamps remain UTC. Lifecycle posts reference the initial signal identity. LLM/editorial prose never determines levels, qualification, lifecycle state, or outcome.

## Briefs, recaps, and reports

Morning/session briefs are typed editorial publications backed by at least one approved intelligence/runtime source ID, a generation time, optional expiry, market scope, evidence class, author, approval and compliance state. Expired content is rejected. News keeps its source identity and timestamp; severity/confidence belong in sourced sections only when the source supplies them.

Daily and weekly recap calculations consume authoritative outcome records. Open trades are not wins or closed trades. Net R includes only closed records with canonical R. Reports never translate R into customer money. `LIVE`, `FORWARD`, and `RESEARCH` are calculated separately; backtests are never blended into VIP forward/live performance. Weekly consumers may display legitimately computable profit factor, market/strategy breakdown, best/worst records, and drawdown when an authoritative ordered-equity source provides it.

Admin operations digests similarly consume runtime, scanner, provider, signal, Telegram-delivery, and incident truth; missing data must remain unknown rather than being invented.

## Editorial and news agent boundary

Future `EDITORIAL_AGENT`, `NEWS_AGENT`, and `GROWTH_AGENT` authors may transform canonical structured facts into approved briefs, education, verified recaps, explanations, invitations, session context, operations digests, and incident summaries. The centralized contract requires source IDs, evidence classification, expiry, approval/compliance, and a dedupe key.

Agents cannot create or modify a canonical signal, entry, stop, target, trade outcome, execution command, risk override, qualification result, or frozen configuration. Agent-authored text resembling those fields is rejected. News claims require approved intelligence evidence and must be rejected after expiry. SYSTEM/ADMIN authors remain subject to audience and approval rules; canonical trading truth continues to originate only in HashiBot signal/trade systems.

## Routing configuration and failure behavior

Production destinations are isolated and fail closed:

| Audience | Required secret | Missing behavior |
|---|---|---|
| ADMIN | `TELEGRAM_ADMIN_CHAT_ID` | record configuration failure; do not send |
| FREE | `TELEGRAM_FREE_CHAT_ID` | record configuration failure; do not send |
| VIP | `TELEGRAM_CHAT_ID` or `TELEGRAM_DEFAULT_CHANNEL_ID` | record configuration failure; do not send |
| VIP execution (optional) | `TELEGRAM_VIP_EXECUTION_CHAT_ID` | record configuration failure; no implicit VIP alias |
| TEST | `TELEGRAM_TEST_CHAT_ID` | test blocked; never fall back to a production room |
| Analytics (optional) | `TELEGRAM_ANALYTICS_CHAT_ID` | blocked; no implicit Admin alias |

`TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are also required by the Edge runtime. Customer-direct destinations remain database-owned and must be resolved from the authenticated customer link rather than a shared channel fallback.

The Admin Telegram view derives configuration and health only from backend delivery truth. With no backend truth it displays **BACKEND UNAVAILABLE OR NO DELIVERY TRUTH**, never a green local-default state. Operator test messages are conspicuously labelled TEST. Browser-side direct broadcasts and browser-stored bot-token delivery are unsupported.

## Deferred deployment procedure

1. Restore and validate Supabase without running Telegram tests.
2. Apply reviewed repository migrations with the normal Supabase deployment process (this change adds no migration).
3. Set the required secrets above, using different chat IDs for Admin, Free, VIP, and Test. Add optional destinations only when explicitly intended.
4. Deploy `_shared` dependants and the existing `telegram-test`, `telegram-orchestrator`, scanner/outcome, and admin operator Edge functions using the repository deployment script.
5. Keep cron, execution, and broad publishers disabled. Verify the Admin UI reports backend truth and isolated routes.
6. With an operator present, invoke one explicitly labelled TEST per configured destination. Confirm Telegram receipt and the matching `telegram_deliveries` row, destination, provider message ID, and idempotency key.
7. Exercise a synthetic/non-production canonical event through staging; confirm retry bounds and permanent-error dead-letter observability. Do not infer success from HTTP alone.
8. Only after review, separately authorize production publishers/cron. This implementation does not deploy, enable cron, execute SQL, enable real-money execution, or send Telegram messages.
