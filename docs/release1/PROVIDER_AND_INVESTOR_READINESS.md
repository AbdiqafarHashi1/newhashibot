# HashiBot provider and launch handover

## Implemented behavior

The real application has one three-step onboarding flow for demo/testnet and live accounts. Environment selection is explicit and identities, credentials, reports and execution evidence remain account scoped. Connecting credentials does not start trading.

- Binance verifies futures reads and per-key live trading/withdrawal permissions. Bybit verifies supported native endpoints; demo keys without a UID use an explicitly classified key-bound identity. A missing demo write permission requires consent for an empty-account cancellation check, never a sample entry. Raw credentials stay in Vault.
- MT5 pairing matches the selected environment to authenticated terminal evidence. Live terminals can report without mutation permission. Live mutations additionally require the local bridge setting and the exact terminal identity.
- Providers & accounts shows current balances, margin, positions, orders, outcomes, decisions, access expiry, dispatch receipts and certification evidence. Missing data remains unknown. Crypto reports can be refreshed from the UI; MT5 pushes snapshots from the bridge.
- Own-admin demo access is a separate audited 30-day allowance. It never creates payment or PASSED certification. Start still needs current provider health, risk acknowledgement and a qualified measured strategy configuration.
- Only a persisted conditional movement confirmation, projected with its original measured strategy lineage, can enter automatic execution. The database repeats confirmation and finite-access checks at decision and submission boundaries. Expiry stops new entries while observation and protection remain available.
- The canonical dispatcher uses durable claims and exact stored plans. Unknown submissions require native client-ID reconciliation; they are never silently retried. Crypto forward testing is flat-account only, with one unresolved entry per account. MT5 uses its measured exposure context.
- Native quotes can reject an entry that moved outside its geometry or risk budget; they cannot increase the approved quantity. Live execution also needs explicit bounded approval, current paid or own-admin access, a genuine protected and closed demo round trip with the same policy configuration, and current capital evidence. Live risk is capped at 0.25 percent and an owner-selected equity ceiling. Approval and Start are separate actions.
- Certification follows actual submission, observed protection, closure and attributed provider outcome. A loss can pass system-mechanics certification; no profitability claim is created.
- Execution purchases are account scoped with 30-day access, verified payment evidence and 30 paid account slots. Admin Payments configures the execution KES price and requires provider re-verification after price changes. Owner test allowances do not count as sales.
- Telegram channels, payments and provider connections have UI configuration paths. Setup & launch installs the 12 service schedules paused, with explicit activation controls.
- First-month targets are 50 paying signal customers and 30 paying execution customers, counted from real current payment-backed entitlements.
- `/demo` opens the isolated investor tour covering Scanner, Strategies, Backtest Lab, Providers & accounts, customer onboarding, trading controls and growth. Fixture results are labeled and include losses. They establish neither strategy performance nor traction.

## External activation steps

Project `uqiwbzfcntlcyyewawfc` was rechecked on 2026-10-30 and is INACTIVE. No deployment or native provider receipt is claimed while it is paused.

1. Owner restores Supabase and supplies the deployment connection when requested. Apply the complete integration branch migration chain against the actual ledger, deploy its functions and frontend, then verify deployed endpoints before enabling schedules.
2. Owner enters demo/testnet provider credentials in onboarding and runs the MT5 bridge on the terminal host. Enter live credentials separately when ready. Keys must belong to the selected environment.
3. Owner supplies Telegram bot/channel administration, payment merchant credentials, and chosen execution price through the setup screens. Verification must succeed before collection or publication is enabled.
4. Owner selects and qualifies real strategy configurations and starts the three own demo accounts. Real forward trades must produce protection, closure and outcome receipts before the corresponding small-capital live approval becomes available.
5. After those inputs exist, perform the connected acceptance run: conditional signal → account decision → native order → protection → closure → reported outcome; actual payment → entitlement → account start → expiry. Local tests do not replace these receipts.

No real orders, payments, Telegram messages or production schedules were activated during local preparation. Engineering changes and their tests are on PR 269; deployment and real-account verification remain contingent on these external inputs.

## Local verification

Application build and TypeScript checks, all 39 Edge Function dependency bundles, operation policy/provider tests, 21 PostgreSQL operation tests, bridge tests, conditional-signal tests and commerce/operations integration tests are run against this change. These checks validate code paths and persisted guards, not real provider availability or investment returns. Browser test execution depends on a usable Chromium runtime; the investor mirror remains private.
