# Original HashiBot SaaS release status

Updated 17 October 2026, EAT. Repository: AbdiqafarHashi1/newhashibot. Product domain: hashibot.app.

## Product decision

Keep the original frontend, repository, Supabase architecture and domain. Do not port the platform into the separate Sites experiment. Its scheduled GitHub clock was retired on main in commit f5d7d8bb7de11a4e5fac0bcf67ddd4d4abcb1ca9. The experiment's source/data are retained; this change does not delete the hosted project or claim its URL is offline.

## Changes in this continuation

- `/admin/launch` is an entry point into the existing admin tools, with authenticated, server-reported configuration and evidence availability. Missing backend data never becomes a green readiness indicator. No existing admin pages are removed.
- Original Whop checkout now checks the configured company, plan, price, trial and billing interval, then creates an idempotent provider checkout. Signed events trigger payment source lookup before canonical fulfillment. Customer/product/amount must match. Renewals require the established membership/member binding. Existing payment/entitlement/Telegram authorities remain the fulfillment path.
- Daraja supports explicit PayBill or Buy Goods transaction type and a distinct PartyB destination. References fit 12 characters. Query results lacking ResultCode remain pending. Callback commercial facts resolve against the server-created STK request; a real provider query decides success. A bounded reconciliation pass recovers lost callbacks for known pending requests.
- A database claim is committed before external checkout/STK submission. Uncertain submissions require reconciliation and cannot automatically submit again. Sandbox evidence does not grant paid access through these endpoints.
- Legacy admin receipt review no longer sets payment_verified or accepts browser-selected account/subscription/qualified-set bindings. Its old activation shortcut is retired.
- Customer and administrator demo controls now use one account-scoped database authority. Start requires canonical paid account entitlement, ownership, current provider health, Brain, risk acknowledgement, passed certification and a server-selected qualified set. Pause/manage-only retain position protection. Live start is rejected.
- Canonical execution-strategy bindings replace the legacy manual provisioning projection as Phase D's activation input.
- Backtest Lab → Calibration has a measured release workflow: select completed development/validation scanner runs, freeze their matching configuration, queue one later holdout through the existing portable worker, then explicitly approve the measured strategy. Native database checks require at least 30 resolved trades in each period, declared nonzero costs, positive net results and profit factor >= 1.2. These are screening gates, not profitability guarantees.
- Holdout enqueue/claim are atomic. Already recorded scanner periods and previously consumed holdout periods cannot be reclassified as untouched. The ledger cannot establish what a person may have inspected outside this system.
- Production scanning requires a promoted measured version and reads its frozen parameters. Saving a research configuration does not replace a tested release. Disabled strategies remain disabled. Changed global grade policy blocks an incompatible release. No promoted releases means no approved production strategies; old database configurations are not automatically grandfathered.
- The replay UI now respects the existing worker cycle limit. A larger requested period fails explicitly instead of silently evaluating a prefix. Historical adverse stop gaps use the opening price rather than assuming an impossible fill at the original stop.

- Payment subscriptions and entitlements are scoped to the paid execution account. A source-confirmed refund of an older payment records historical evidence without revoking a newer paid renewal. Existing 7/30-day M-Pesa terms are preserved.
- Full-checkout CI exposed legacy research type errors absent from the earlier partial checkout; those are repaired without excluding files. Legacy calibration no longer fabricates improved projected performance.

- Production qualification now compares the scanner's evaluated parameters with product qualification instead of copying the qualification entry back into its own claim. Signal plans pin a measured release; Phase D and its SQL commit reject retired releases or differing parameters, and release changes alter the transactional evidence fingerprint.
- Failed MT5 positions/orders reads no longer become flat accounts. Real free margin, broker symbol suffixes, tick values, currency conversion, current quotes and actual fill-policy bits are retained. Snapshot persistence failures are errors; scoped provider observations refresh the matching customer account's health.
- M-Pesa status queries now rotate pending attempts by their next due time; provider/processor errors back off instead of monopolizing the recovery batch.

## Administration responsibilities

| Workspace | Responsibility |
| --- | --- |
| Setup & launch | Prerequisites, configuration availability and links to the correct tool |
| Operations Center | Scanner/runtime state, incidents and operational evidence |
| Providers | Existing owner feeds, provider health and diagnostics |
| Backtest Lab | Data, actual scanner replay, account/Prop simulation, calibration, holdout and releases |
| Strategies | Research parameters and disabling strategies; no invented performance score |
| Onboarding & Readiness | Customer/account ownership, payment/entitlement, connection, Brain, risk, certification and controls |
| Commerce & Membership | Verified payment and Telegram fulfillment queues |
| Agents | Campaigns, policies, approval and delivery management |
| 1,000 customer goal | Current recorded acquisition/payment progress |
| Recovery / Audit | Reconciliation, protection incidents and command evidence |

The launch page improves navigation; it is not a claim that every legacy screen has passed authenticated mobile/desktop review.

## Activation configuration

Retain existing owner provider credentials, channel IDs and bot credentials. Inspect them after restoration; do not copy them into customer account records or rotate them as a side effect of this release.

| Service | Server configuration |
| --- | --- |
| App origin | PUBLIC_APP_ORIGIN=https://hashibot.app |
| Whop | WHOP_API_KEY, WHOP_COMPANY_ID, WHOP_WEBHOOK_SECRET, WHOP_VIP_PLAN_ID, WHOP_EXECUTION_PLAN_ID, WHOP_ENVIRONMENT=sandbox initially |
| Daraja | DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORT_CODE, DARAJA_PASSKEY, DARAJA_CALLBACK_URL, DARAJA_ENVIRONMENT=sandbox initially |
| Daraja Till | DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline and DARAJA_PARTY_B=<approved Till destination>; shortcode/passkey must match the approved Daraja integration |
| Telegram | TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WORKER_SECRET; audience configurations and bot permissions in the canonical membership tables |
| Customer crypto onboarding | PHASE_H_SECRET_ADAPTER=SUPABASE_VAULT; PHASE_H_PROVIDER_VERIFICATION=ENABLED |
| Internal workers | Existing internal authentication and deployment configuration; portable worker for replay jobs |

These are server secrets/configuration, never VITE/public environment variables. Merely filling credentials does not automatically enable a product's commerce_product_prices.configured flag or establish provider verification. Commerce & Membership now provides a guided connection console. Secrets are stored in Supabase Vault and never returned to the browser. Saving changes disables provider prices; verification and explicit enabling are separate steps. A credential handshake does not prove successful payments. Existing server environment configuration remains a fallback until a provider is saved in the console.

## Remaining implementation and release blockers

This is **not** a declaration that Supabase activation is the only remaining task.

1. **Complete provider context assembly:** connect each current provider snapshot to verified drawdown baselines, position/open-risk valuation, contract/currency specifications, session/news evidence and routing capabilities, then automatically publish complete account_policy_evidence. The MT5 Personal producer now assembles owned terminal evidence, position-to-stop risk, current contracts, broker suffix mapping and continuous drawdown baselines automatically. Broker buying-power leverage no longer causes a false policy rejection; authorized trade leverage stays capped. Missing transient observations remain retryable and failed jobs rotate behind other pending accounts. Prop firm rules and crypto assembly remain unfinished. Do not fill missing financial facts with zeros or fabricate a news-clear state.
2. **Qualification integration:** validate the measured scanner release together with the existing product-specific qualified sets and downstream E/F dispatch. Promotion approves scanning, not customer execution or live account eligibility.
3. **Commerce recovery integration:** the original admin now supports Vault-backed settings, verification, explicit price enabling, safe event status and an operator-triggered recovery pass. Whop polling uses durable cursors and revisits current subscription payments for lost refund/dispute events; pending M-Pesa requests are queried from the provider. Verify scheduled operation after deployment and M-Pesa now recovers lost submission acknowledgements using a private hashed callback binding and preserves completed payments against late acknowledgements. Losing both the native acknowledgement and callback still needs provider/operator reconciliation. Whop uncertain checkout creation recovery remains unfinished.
4. **Acquisition distribution:** the original goal page now has a private prospect pipeline, dated follow-ups, due-only filtering, campaign links, automatic verified-email matching, payment-backed conversion status, contact suppression and saved-permission outreach drafts. Activity is explicitly operator-reported. Connect and verify the required publishing providers before claiming automated external outreach or 1,000 customers acquired.
5. **Database release rehearsal:** run the complete native migration chain against a representative restored copy; check RLS, Vault, grants, existing data and concurrent claims. Focused embedded-Postgres tests do not certify the entire Supabase deployment.
6. **Payments and membership:** after credentials/configuration, verify real sandbox checkout, source confirmation, duplicate/delayed events, renewal/refund/expiry, Telegram identity linking, paid admission and removal. No real payment or Telegram delivery was performed during this continuation.
7. **Customer #001 provider demonstrations:** MT5 Personal, MT5 Prop, Binance testnet and Bybit demo require separate real credentials/terminal connections and account-specific certification. Verify fills, rejection, SL/TP1/BE/TP2, reconnect, recovery, concurrent accounts, drawdown and loss pauses, and isolation.
8. **Authenticated usability review:** phone and desktop review of every active admin/customer task, connection forms and errors with the deployed backend. The route audit is static, not a usability certification.
9. **Strategy evidence:** collect suitable historical data and run measured development/validation/holdout and forward demo results. No profitable strategy or completed real backtest is asserted by this code change. No live execution boundary has been opened.

Supabase restoration remains blocked by the previously observed unpaid-invoice response. This continuation does not change billing or apply remote migrations.

## Verification

- Strict frontend TypeScript and existing account-authorization strict check.
- Production frontend/server build.
- Operations readiness suite, including provider configuration, source recovery, account subscription isolation, historical refund handling and embedded-Postgres tests for actual provider claim/account controls and native holdout enqueue/promotion.
- Existing Phase I commerce, Phase M validation and Phase P portable-worker integration suites; cloud worker typecheck (its existing configuration is not strict).
- Static admin route/surface audit and changed Edge Function bundle compilation.

Fixtures and simulated provider responses verify code behavior. They are not real payment/provider/Telegram certification.

## Continuation verification (2026-10-18 EAT)

The local operations run passed 57 behavioral tests, 13 embedded PostgreSQL tests and seven Python tests. The frontend build, strict frontend/account authorization typechecks and static admin audit pass. These are local checks; the next commit CI is a separate check. Binance monitor coverage runs the actual HTTP handler against two isolated fake provider accounts, including a failed customer and an enabled entry kill switch. Multi-asset USD financial totals retain their actual currency; coin USDT balances remain separate. No external message, charge, trade or deployment was performed.
