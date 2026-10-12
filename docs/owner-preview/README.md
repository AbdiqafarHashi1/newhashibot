# Owner Preview

Owner Preview is a production-visible, local UI demonstration. Enter from desktop navigation, the phone header/menu, the public footer, or Login. It does not authenticate a user. The persistent banner says **OWNER PREVIEW — simulated data; no real actions.**

## Connected screens

The inventory in [routes.ts](../../src/lib/ownerPreview/routes.ts) lists 84 navigable entries from `App.tsx`, including compatibility aliases and one concrete fixture for `/app/signals/:id`. Every entry is exercised on desktop and phone. Existing page components and layouts are retained.

| Journey | Existing screens |
| --- | --- |
| Operations | `/admin/mission-control`, `/admin/operator`, runtime truth, positions, protection, risk, capital, audit |
| Scanner and strategies | `/admin/scanner`, `/admin/scanner-config`, strategies/configuration, candidates, rejected setups, signal manager/detail, Trading Brain |
| Research | `/admin/backtest`: acquisition of illustrative candles, the existing single-strategy replay, product/portfolio workspace, Phase L replay/shadow controls, Phase M scanner/account/Prop simulation, portable-worker view; `/admin/prop`: existing Prop configuration/campaign workspace |
| Certification | Existing Performance/evidence and provider pages, replay/shadow evidence inspectors, account readiness. All shown results are simulated; no Phase G certificate is granted. |
| Customers and providers | Customers, fleet/provisioning, accounts, Brain/risk preferences, provider overview, MT5 Personal/Prop, Binance testnet, Bybit demo, Visual Bridge |
| Onboarding | Customer onboarding's 13 steps, signal-only and execution setup paths, readiness, admin onboarding operations |
| Commerce and communications | Commerce operations, customer Billing, Telegram setup, links/logs/test, reporting and agents |
| Incidents and support | Operations Center incidents, Recovery, protection, audit and customer Readiness support controls. There is no invented standalone support or incidents route. |

The existing `/admin/operator/signals` and `/admin/operator/settings` URLs previously passed unsupported section names to `OperatorPanel`. They now open the implemented SignalsManager and ScannerConfig screens.

## Fixtures and scope

`ownerPreview/adapter.ts` is the shared in-memory projection adapter selected at the Supabase data boundary. `usePreviewViewer` supplies a separate **presentation subject/display profile** to customer components; AuthContext's `user`, `session`, authorization profile and admin flag remain separate. No Supabase session, JWT, real customer identity or admin role is fabricated. The old emergency bypass and offline fake authentication have been removed. A failed real profile read no longer derives admin status from an email or user metadata.

Amina has a demonstration signal subscription; Yusuf has a pending demonstration execution subscription. Five separately identified accounts cover MT5 Personal/Prop demo, Binance testnet and Bybit demo, with different Brain/risk settings and healthy, pending, blocked, uncertain and incident states. All execution flags stay false. Customer switching scopes customer projections. Account switching scopes customer account-detail portals; readiness retains the customer's whole account list. **Fixture filtering does not prove database isolation or RLS.**

Forms and supported commands update disposable memory. Preview storage is isolated by customer and cannot overwrite real local/session preferences. IndexedDB access is blocked; illustrative research uses bounded CSV/RESEARCH candles, marked non-certifiable. Reset reloads all demonstration state; exit clears the tab's preview flag and reloads normal operation. Only the opt-in preview flag persists in sessionStorage; fixture changes do not survive a document reload.

## Unavailable capabilities

No routed screen is hidden or replaced with a second dashboard. Some existing screen capabilities deliberately remain unavailable:

- Real provider verification, credentials, signed bridge pairing/install proof, execution, safety closes and live/forward certification require authenticated backend configuration. Credential inputs are disabled in preview. No real Phase D/E/F/G decision, protection action or certificate is produced.
- Payment approval/entitlement mutation, checkout, Telegram delivery/invite generation, AI calls, remote workers, database/cron diagnostics and retention cleanup have no real authority in preview. Unimplemented adapter operations return `DEMONSTRATION_UNAVAILABLE` rather than invented successful evidence.
- Empty certification, native-worker, scheduler and other backend ledgers are explicit zero-row demonstrations. Public provider overview's unknown facts remain unknown; they are not connection proof. Some aggregate RPCs have no fixture and show an unavailable notice.
- Product/portfolio details that require frozen eligible strategies remain subject to the existing research gates. Illustrative candles do not establish qualification. Acquisition never downloads venue data in preview; the Phase L/M result histories are independently labelled illustrative fixtures.

The browser isolation layer is installed before the app. It denies all fetch/XHR API calls (including same-origin `/api`), beacons, provider sockets, EventSource and workers; a restrictive CSP also blocks external resources, embedded checkouts and form navigation. Static local application assets are allowed. Service-worker registration is skipped during preview; existing registrations and real browser preferences are preserved. An authenticated backend operation outside preview still uses its existing authorization/RLS. Preview is not a security boundary for the database: the server remains the authority.

## Validation

```bash
npm ci
npm run test:owner-preview
npx playwright install chromium
npm run test:owner-preview:browser
```

An existing Chromium can be selected with `CHROMIUM_PATH=/usr/bin/chromium`. Browser tests build production assets and start/reuse Vite preview on port 4173. They navigate the actual inventory links on 1440×1000 and 390×844 viewports, exercise disposable actions/onboarding, inspect customer/account switching, assert zero external/API mutation requests, reject multiple attempted transport escapes, verify reset/exit and preserve real local preferences. Outside preview, protected routes redirect to Login even with the legacy bypass flag set.

Passed: the five preview adapter tests; four desktop/phone browser tests; scanner Phase K; broker CSV; Permanent Backtest Lab; Phase H onboarding contracts; public purchase journey; operator credential resolution; retained-authority test; production build; `git diff --check`.

Existing failures reproduced against current-main baseline:

- `npm run typecheck`: 247 diagnostics in the changed checkout versus 251 on baseline. No additional file/error-code diagnostics; source issues remain, including existing type/lib mismatches.
- `npm run test:operator-actions`: its first test expects `DEFAULT_OPERATOR_TIMEOUT_MS = 12000`, absent from current main. Later tests in that chained command were not run; credential resolution was run separately and passed.
- `npm run test:public-site`: expects `8,500 KES` while current pricing returns `$100 USD`. Public pricing was preserved.

## Screenshots

| Desktop | Phone |
| --- | --- |
| [Operations Center](screenshots/desktop-operations.png) | [Operations Center](screenshots/phone-operations.png) |
| [Customer readiness](screenshots/desktop-customer.png) | [Customer readiness](screenshots/phone-customer.png) |

No deployment, merge, remote SQL, provider activation or trading action is part of this change.
