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

These are server secrets/configuration, never VITE/public environment variables. Merely filling credentials does not automatically enable a product's commerce_product_prices.configured flag or establish provider verification. The remaining guided credential/price activation UI is still a code task. The launch page currently reports configuration, it does not store secret values.

## Remaining implementation and release blockers

This is **not** a declaration that Supabase activation is the only remaining task.

1. **Complete provider context assembly:** connect each current provider snapshot to verified drawdown baselines, position/open-risk valuation, contract/currency specifications, session/news evidence and routing capabilities, then automatically publish complete account_policy_evidence. The current producer correctly blocks without that complete context. Do not fill missing financial facts with zeros or fabricate a news-clear state.
2. **Qualification integration:** validate the measured scanner release together with the existing product-specific qualified sets and downstream E/F dispatch. Promotion approves scanning, not customer execution or live account eligibility.
3. **Guided commerce configuration and recovery:** complete the original admin UI for server-held provider settings, price activation, webhook health and actionable reconciliation. Whop lost-webhook polling/recovery and uncertain checkout recovery still need completion; event source verification alone does not provide that scheduler.
4. **Acquisition:** complete the integrated outreach CRM/acquisition pipeline. Existing campaign/content/approval/delivery components are not a complete automated 1,000-VIP customer acquisition operation.
5. **Database release rehearsal:** run the complete native migration chain against a representative restored copy; check RLS, Vault, grants, existing data and concurrent claims. Focused embedded-Postgres tests do not certify the entire Supabase deployment.
6. **Payments and membership:** after credentials/configuration, verify real sandbox checkout, source confirmation, duplicate/delayed events, renewal/refund/expiry, Telegram identity linking, paid admission and removal. No real payment or Telegram delivery was performed during this continuation.
7. **Customer #001 provider demonstrations:** MT5 Personal, MT5 Prop, Binance testnet and Bybit demo require separate real credentials/terminal connections and account-specific certification. Verify fills, rejection, SL/TP1/BE/TP2, reconnect, recovery, concurrent accounts, drawdown and loss pauses, and isolation.
8. **Authenticated usability review:** phone and desktop review of every active admin/customer task, connection forms and errors with the deployed backend. The route audit is static, not a usability certification.
9. **Strategy evidence:** collect suitable historical data and run measured development/validation/holdout and forward demo results. No profitable strategy or completed real backtest is asserted by this code change. No live execution boundary has been opened.

Supabase restoration remains blocked by the previously observed unpaid-invoice response. This continuation does not change billing or apply remote migrations.

## Verification

- Strict frontend TypeScript and existing account-authorization strict check.
- Production frontend/server build.
- Operations readiness suite, including six new behavioral tests and two new embedded-Postgres tests for actual provider claim/account controls and native holdout enqueue/promotion.
- Existing Phase I commerce, Phase M validation and Phase P portable-worker integration suites; cloud worker strict typecheck.
- Static admin route/surface audit and changed Edge Function bundle compilation.

Fixtures and simulated provider responses verify code behavior. They are not real payment/provider/Telegram certification.
