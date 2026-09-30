# HashiBot commerce go-live

## A. Pre-deploy

Reactivate Supabase and compare the remote migration ledger with this repository. Apply
only missing chronological migrations; never replay every migration blindly. Back up
commerce/customer rows and use a staging project for controlled tests first.

## B. Required migrations

1. `20260914120000_commerce_entitlement_foundation.sql`
2. `20260914180000_vip_telegram_fulfillment.sql`
3. `20260914210000_whop_lifecycle_processing.sql`

## C. Edge Functions

Deploy `whop-webhook` and the updated existing `telegram-orchestrator`. No other new
commerce function is required. URLs are:

* `https://<project-ref>.supabase.co/functions/v1/whop-webhook`
* `https://<project-ref>.supabase.co/functions/v1/telegram-orchestrator`

## D. Backend secrets

**Required for Whop:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`WHOP_WEBHOOK_SECRET`, `WHOP_PLAN_VIP_SIGNALS`, `WHOP_PLAN_PERSONAL_AUTO`,
`WHOP_PLAN_FOREX_PROP`, `WHOP_PLAN_CRYPTO_PROP`, and `WHOP_API_KEY`. Webhook processing
uses the read-only API to reconcile membership/payment objects after signature
verification and requires no Whop write permission.

**Required for VIP Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and
either `TELEGRAM_CHAT_ID` or `TELEGRAM_DEFAULT_CHANNEL_ID`.

**Optional destinations, required only when that existing feature is enabled:**
`TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_FREE_CHAT_ID`, `TELEGRAM_TEST_CHAT_ID`,
`TELEGRAM_VIP_EXECUTION_CHAT_ID`, `TELEGRAM_ANALYTICS_CHAT_ID`.

**Future Daraja only—not required for manual M-Pesa launch:** `MPESA_CONSUMER_KEY`,
`MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`.

## E. Telegram configuration

Make the existing bot an Admin of the private VIP destination with membership lookup,
invite-link creation, and ban/remove capabilities. Register the orchestrator URL as its
webhook and supply `TELEGRAM_WEBHOOK_SECRET` as Telegram's secret token. Do not reuse
FREE, ADMIN, analytics, test, or execution destinations as VIP.

## F. Whop configuration

The implementation follows the official `@whop/sdk` **1.1.4** `verifyWebhook` source and
its `standardwebhooks` 1.0.0 dependency. Configure the exact `ws_` endpoint secret
verbatim. Whop supplies `webhook-id`, `webhook-timestamp`, and `webhook-signature`; the
library enforces its five-minute timestamp tolerance and verifies the raw body before
JSON is trusted.

Enter actual server plan IDs and enable exactly: `member.created`, `member.updated`,
`membership.activated`, `membership.cancel_at_period_end_changed`,
`membership.deactivated`, `payment.succeeded`, `payment.failed`, `payment.pending`,
`refund.created`, `refund.updated`, `dispute.created`, `dispute.updated`.

The API key needs the configured read scopes plus **member email read** so a successful
payment's `customer_email` can be matched to an existing authenticated HashiBot profile.
No Whop write permission is required. Set hosted checkout return to
`https://hashibot.app/vip/complete`.

## G. Frontend values

Required frontend core: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_TELEGRAM_BOT_USERNAME`. Configure `PUBLIC_APP_ORIGIN` and every payment
credential only on the server. Public provider checkout URLs, merchant numbers,
manual receipt forms, and direct Telegram invite URLs are intentionally not part
of the canonical funnel.

## H. Controlled tests

In staging: purchase VIP; verify one event ledger row and ACTIVE entitlement; create and
consume Telegram onboarding; join through the one-member invite; schedule cancellation
and confirm access lasts to period end; deactivate and reconcile removal; reactivate and
reconcile restoration; redeliver the same webhook and confirm no duplicate subscription
or period; test pending/failed payment, refund and dispute visibility. Then approve a
manual M-Pesa request and prove it creates no Whop payment, membership, or affiliate
record.

## I. Rollback and fail-closed controls

Disable Whop activation without deleting data by removing `WHOP_WEBHOOK_SECRET` or
disabling the webhook endpoint in Whop; the function then returns only missing-
configuration failures. Disable Telegram fulfillment by removing its webhook in
Telegram, then remove `TELEGRAM_BOT_TOKEN`; canonical entitlements and identity history
remain intact. Never delete `customer_subscriptions`, provider events, or Telegram links
as a rollback technique.
