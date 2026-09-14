# HashiBot Commerce Build 1

## Audit and boundaries

The root React application already has a shared `PublicLayout`, package catalogue in
`src/lib/packages.ts`, `access_requests` as the manual approval queue,
`customer_subscriptions` as the existing access record, and separate FREE/VIP Telegram
destinations in the edge-function Telegram router. Build 1 reuses those contracts. A
provider payment is deliberately not treated as a HashiBot entitlement.

## Whop research status (14 September 2026)

Current official Whop developer documentation was the only intended source. Both the
documentation search endpoint (HTTP 401) and direct access to `https://docs.whop.com`
(proxy HTTP 403) were unavailable in this build environment. Consequently this build
does **not** guess an SDK name, API route, event name, signature algorithm, affiliate
query parameter, or sandbox behavior.

The safe integration boundary accepts a separately configured public plan identifier
and Whop-issued HTTPS checkout URL for each HashiBot product. It uses hosted checkout
only while the official embedded contract remains unconfirmed. Missing or malformed configuration renders a truthful
unavailable state. Attribution is captured in HashiBot's M-Pesa request; it is not added
to Whop URLs until Whop's current officially supported affiliate/referral mechanism can
be verified. Whop remains authoritative for billing, recurring subscriptions, customer
and membership state, renewals, failures, cancellation/expiration, refunds, disputes,
and affiliate finance.

Before production configuration, verify in current official documentation:

1. current React/embedded checkout package and required public product/plan identifier;
2. hosted checkout URL and allowed iframe origins/CSP, completion and return behavior;
3. API authentication and server-side customer/membership management;
4. exact webhook event catalogue for membership, renewal, payment failure,
   cancellation/expiration, refund and dispute lifecycle;
5. raw-body signature verification algorithm, headers, replay tolerance and secret;
6. officially supported checkout affiliate/ref and UTM fields;
7. test/sandbox mode and test product separation.

`WHOP_API_KEY` and `WHOP_WEBHOOK_SECRET` are server-only placeholders. No browser file
reads them. Webhook ingestion and provider-event persistence belong to Build 2.

## Configuration required

Whop: one real public plan ID and Whop-issued HTTPS checkout URL per enabled HashiBot
product, plus later a server API key, webhook endpoint signing secret, verified webhook
event subscriptions, redirect URL and test-mode account/product details.

M-Pesa/Daraja: consumer key, consumer secret, shortcode/till or paybill details,
passkey, registered HTTPS callback URL, environment (sandbox/production), and verified
business recipient details. Build 1 performs no Daraja request or callback.

Telegram Free: `VITE_TELEGRAM_FREE_INVITE_URL` must be a deliberately public `t.me`
invite. Publishing continues to use the existing server-side `TELEGRAM_FREE_CHAT_ID`.

## Build 2 contract

Build 2 will add server-side webhook/API handling, idempotent provider lifecycle event
storage, verified M-Pesa callbacks, mapping from authoritative provider state to the
existing customer subscription/entitlement model, Telegram identity connection using a
stable numeric ID, and bot-driven VIP add/keep/remove behavior. Browser checkout return
state must never grant access.

## Commercial Build 2 Step 1 additions

The additive migration `20260914120000_commerce_entitlement_foundation.sql` extends the
existing `customer_subscriptions` entitlement truth, adds opaque M-Pesa references and a
generic provider event ledger, and installs authenticated entitlement/status plus
admin-only atomic mutation functions. It must not be remotely applied until the hosted
Supabase migration ledger is compared.

The undeployed `whop-webhook` Edge Function will eventually be reachable at
`https://<project-ref>.supabase.co/functions/v1/whop-webhook`. Its verification boundary
currently rejects every request because the official current signature mechanism could
not be confirmed. Deploying it in that state cannot grant access. Server authoritative
plan variables are `WHOP_PLAN_VIP_SIGNALS`, `WHOP_PLAN_PERSONAL_AUTO`,
`WHOP_PLAN_FOREX_PROP`, and `WHOP_PLAN_CRYPTO_PROP`; processing remains disabled until
the verifier and confirmed payload-to-plan extraction are implemented.

Manual M-Pesa submission is tied to an authenticated customer and receives a database-
generated opaque UUID status reference. The existing Admin Access Requests screen calls
one atomic, admin-authorized SQL function for approval/rejection. Approval locks the
request/customer-product pair, validates the VIP slug and 3,500 KES amount, activates
the existing `customer_subscriptions` record for exactly 30 days, updates intake state,
and writes `audit_logs`. Retry returns the existing result without extending again.
