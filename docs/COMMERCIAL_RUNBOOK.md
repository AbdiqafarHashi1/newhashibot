# HashiBot commercial fulfillment runbook

## Canonical flow

Payment truth (manual M-Pesa approval, audited Admin grant, or future verified Whop)
must first activate `customer_subscriptions`. Telegram fulfillment calls
`has_product_entitlement(user_id, 'crypto_signal_room', now())`; neither an access
request nor browser state can grant Telegram.

For M-Pesa, the customer submits evidence, receives `PENDING_VERIFICATION`, and may
leave. An Admin uses Access Requests to approve atomically for 30 days or reject. The
customer returns to `/vip/complete`, which resolves backend truth.

## Telegram onboarding and access

1. An ACTIVE customer selects **Connect Telegram** on `/vip/complete`.
2. `create_vip_telegram_onboarding` checks canonical entitlement, invalidates an older
   unused token, creates 24 random bytes, stores only SHA-256, and expires in 15 minutes.
3. The customer follows `t.me/<VITE_TELEGRAM_BOT_USERNAME>?start=<token>`.
4. Telegram POSTs to the existing `telegram-orchestrator`; the endpoint validates
   `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`.
5. The bot hashes and atomically consumes the token, rechecks entitlement, and binds the
   stable numeric `message.from.id` in the existing `telegram_links`. Username/display
   name are metadata only.
6. If `getChatMember` is already healthy nothing changes. Otherwise the bot creates a
   one-member, ten-minute private invite with `createChatInviteLink` and sends it by DM.

The bot must be an administrator in the private VIP supergroup/channel with **Invite
Users via Link** and **Ban Users** permissions. It must be able to message a user who has
started it. `TELEGRAM_CHAT_ID` is the established VIP destination; FREE and ADMIN retain
their separate IDs.

## Renewal, revocation, restoration, and reconciliation

Renewal/extension leaves the numeric identity linked; a healthy member is maintained
without a new token. Invoke the existing `telegram-orchestrator` with internal/Admin
authorization and `{ "action": "reconcile_vip_access" }`. One call processes at most
50 links. Active linked customers are maintained/restored; inactive/expired/revoked
customers are removed with `banChatMember`, then unbanned so later reactivation remains
possible. Failures persist a safe error and timestamps in `telegram_links` for bounded
operator retry. No production cron is enabled by this change.

Admin Customers continues to grant/extend/revoke canonical entitlement. Admin Telegram
Links displays numeric identity, status, last attempt/success and safe failure, and can
create an audited replacement onboarding link. Granting Telegram directly is forbidden.

## Configuration and deployment order

Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID` (or the
existing `TELEGRAM_DEFAULT_CHANNEL_ID` fallback), and public bot username
`VITE_TELEGRAM_BOT_USERNAME`. Keep `TELEGRAM_FREE_CHAT_ID`, `TELEGRAM_ADMIN_CHAT_ID`,
analytics, test and VIP execution destinations isolated.

Reactivate Supabase; compare its migration ledger; apply only missing chronological
migrations (Step 1, then `20260914180000_vip_telegram_fulfillment.sql`); deploy the
updated `telegram-orchestrator`; set secrets; register its URL as Telegram webhook with
the secret token; grant exact group permissions; deploy frontend; then test M-Pesa
pending → Admin approval → ACTIVE → link → invite/member. Test reject, expiry, revoke,
and reactivation. Only afterward resolve the unchanged Whop signature/payload blocker,
deploy Whop processing, and perform a controlled Whop test purchase. Nothing in this
repository task was deployed.

## Controlled test

Use test customers and a private test VIP group: assert pending cannot create a token;
approve and confirm `/vip/complete`; connect and inspect numeric ID; reconcile twice to
prove idempotency; extend without relinking; expire/revoke and reconcile removal; grant
again and reconcile restoration. Verify Auto/Prop-only customers never enter this path.
