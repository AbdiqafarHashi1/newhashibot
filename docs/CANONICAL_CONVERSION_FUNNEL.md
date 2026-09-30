# Canonical conversion-to-Telegram completion

## Implemented in code

All paid public journeys now use the authenticated `commerce-checkout` authority. Browser attribution is retained across landing, authentication, checkout, conversion records, and the Telegram fulfillment projection. Checkout creation, redirects, manual receipts, Telegram usernames, and invite delivery never prove payment or membership. Payment result requires a succeeded canonical payment and its active/grace entitlement before offering the Telegram handoff.

The customer sequence is: landing → signup/sign-in and resume → checkout created → provider pending → verified entitlement → Telegram linked → invite sent (`ACTION_REQUIRED`) → membership confirmed. Payment and linking may occur in either order. Refund, expiry, suspension, and removal remain Phase I/J service-only flows.

Founding 20 stays $100/month per owned connected execution account. Capacity is read from `founding_inventory_status`; clients must say “unverified” if that call is unavailable and must never derive or guess a count. Auto Execution still requires onboarding, provider setup, Brain policy approval, and paper/demo certification. No live trading was enabled.

## External configuration required

- Apply the forward-only migration through the approved deployment process.
- Set `PUBLIC_APP_ORIGIN` to the exact production web origin.
- Install and review server-only Whop and/or M-Pesa checkout transports and credentials. The current endpoint deliberately returns `CHECKOUT_NOT_CONFIGURED` while retaining the intent.
- Configure and verify Telegram bot permissions and private audience identifiers, webhook secret, worker secret, and scheduled membership reconciliation.

## Not tested or claimed

No real provider charge, webhook, Telegram identity link, invite acceptance, private-channel admission, demo certification, fill, return, or live execution was performed. Product visuals are illustrations. Permissioned evidence may be added only with source, timestamp, canonical identity, paper/demo/live classification, consent, and redaction.

## Outreach links and authority

Approved campaign destinations are `/free`, `/vip`, `/pricing`, and `/execution`. Use `source`, `campaign`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `affiliate`/`ref` parameters. Outreach actors may distribute these links only; they have no authority to mark payments verified, grant entitlements, admit Telegram members, or describe signal truth.
