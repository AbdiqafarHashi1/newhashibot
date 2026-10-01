# Public purchase journey: implementation and release boundary

## Before-change inventory (2026-09-30)

| Route | Preserved baseline sections | Purchase/status issues found |
|---|---|---|
| `/free` | Hero, Free/VIP comparison, educational benefits, execution preview, repeated CTAs | CTA called `free-enrollment` without auth resume and exposed backend states; enrollment wording implied Telegram progress. |
| `/vip` | Hero, illustrative Telegram signal and lifecycle, qualification, benefits, VIP/execution distinction, repeated CTAs | Browser-direct Whop URL; only 30-day M-Pesa; send-money/manual-reference primary flow; readiness token shown publicly. |
| `/pricing` | Comparison cards, feature detail, provider guidance, activation/risk education, FAQ and repeated CTAs | Manual M-Pesa receipt was primary; unsupported KES execution prices and trial wording remain release blockers to be reviewed in preview. |
| `/execution` and provider routes | Provider illustrations, MT5/prop/crypto guidance, VPS/HashiBridge, Brain/risk/protection/demo education | Public raw readiness codes; purchase links did not consistently bind an owned account. |
| `/payment/result` | Authenticated route and checkout lookup | Read checkout status alone and called completion verified; no entitlement gate or Telegram handoff. |
| shared public/auth layout | Navigation, contact and responsive layout | Production-capable browser-local emergency admin profile/buttons. |

All manual receipts are historical support evidence only. They never invoke the canonical Phase I grant writer and cannot prove payment.

## VIP/Pricing preservation record

| Baseline section | Final location | Decision | Reason |
|---|---|---|---|
| VIP hero and hierarchy | `/vip` hero | Preserved/updated | Owned Whop checkout replaces direct navigation. |
| Telegram signal + lifecycle illustration | `/vip` immediately after hero | Preserved | Valuable format education; remains explicitly illustrative. |
| VIP term choice | `/vip#vip-purchase` | Updated | Adds approved 1,200 KES/7-day fixed term, keeps 3,500 KES/30-day and $29/month. |
| Qualification and benefits | `/vip` below purchase | Preserved | Core sales explanation retained. |
| VIP vs execution | `/vip` below purchase | Updated | Removes internal token and clarifies separate entitlements. |
| Pricing comparison/details/providers/risk/FAQ | `/pricing` | Preserved | No redesign or shortening. Existing manual receipt section must be treated as support-only pending its complete content pass. |

## Required server configuration

- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_ORIGIN`, and deployment of the forward-only migration and Edge Functions.
- **Daraja:** `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORT_CODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL`, `DARAJA_ENVIRONMENT` (`sandbox` or `production`), callback ingress secret, and the internal reconciliation secret. Safaricom callbacks are not cryptographically signed: a callback secret controls ingress but **does not prove payment**. A successful callback must be confirmed by STK status query/reconciliation against CheckoutRequestID, MerchantRequestID, account reference, exact checkout amount/currency/customer/product/price version before the atomic processor is called.
- **Whop:** server API key, webhook secret, approved product/plan identifiers and return origin. No public checkout URL is an entitlement authority.
- **Telegram:** bot token, configured Free/VIP channel identifiers and Phase J worker/internal authorization.

Never place provider secrets in `VITE_*` variables. HashiBot never asks for, receives, stores, or logs an M-Pesa PIN.

## Release review checklist

Desktop and phone: `/free`, `/vip`, `/pricing`, `/execution`, `/execution/mt5`, `/execution/crypto`, `/execution/prop`, `/payment/result`; verify hierarchy, overflow, tap targets, all repeated CTAs, auth resume, both M-Pesa terms, unconfigured copy, no internal status vocabulary, account-bound execution, and entitlement-gated Telegram link. Real sandbox/production payments and Telegram admission require configured external systems and must be recorded separately.
