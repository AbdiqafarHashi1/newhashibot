# Provider/account continuation and investor demonstration

## Implemented in this pass

- Providers & accounts is a daily Admin page. Its paginated directory reads actual safe execution-account records, filters provider/environment and opens an account-specific report.
- The report reads the exact customer/account/instance/credential/provider/environment monitor scope (or the owned MT5 terminal snapshot), displays account totals in their supplied currency, whitelists position/order fields, and includes recent provider outcomes, decisions and access expiry. Missing observations remain unknown; observations older than 90 seconds are marked stale. Reports poll every 15 seconds while visible.
- Execution onboarding has three presentation steps: provider/purpose, risk/strategies, review/connection. It reuses canonical account creation, Brain assignment, acknowledgement and the existing verified key/pairing form. The form is available directly after account creation. It does not grant execution permission.
- Waiting canonical scanner signals cannot be authorized. The authorizer requires an active signal and its persisted positive-price entry-trigger journal, with matching identity, valid chronology and unexpired signal. Waiting jobs remain pending rather than committing a permanent rejection before confirmation.
- Additive database guards repeat confirmation/access checks when recording ALLOW/REDUCE, creating crypto submission truth or creating a Phase-D MT5 open command. Expiry blocks new entries while protection and closes remain possible. New verified execution grants are bounded to 30 days; no payment is fabricated.
- The first-month dashboard targets are 50 distinct paying signal customers and 30 distinct paying execution customers. Counts require a current entitlement and a succeeded payment belonging to the same customer. Owner allowances are excluded. The separate long-term 1,000 Free / 1,000 VIP goals remain.
- `/demo` starts an isolated investor walkthrough at `/admin/investor`. The existing fixture transport is reused; credentials, real HTTP/provider/payment actions and real local caches remain unavailable. The demonstration contains sample losses as well as wins and labels all results. It is not verified strategy performance or customer traction.

## Important remaining engineering and external gates

This pass is **not a claim of complete market readiness**.

1. Supabase project `uqiwbzfcntlcyyewawfc` was observed INACTIVE. Restore it, compare the real migration ledger, deploy the complete branch and run actual end-to-end receipts before activating production schedules.
2. Execution account onboarding, policy evidence and certified MT5/crypto dispatch still enforce demo/testnet. The live-money onboarding and certification path requested by the owner remains to be implemented. Legacy provider environment flags are not a certified customer live path.
3. The newer conditional service has its own WAITING → ARMED → ACTIVE paper lifecycle. It is not yet materialized into the canonical measured execution signal/plan/qualification lineage. The added canonical entry fence prevents premature entries; it does not complete that missing bridge. Do not claim the subscriber conditional plans already execute through all providers.
4. Owner demo/testnet forward certification needs genuine account credentials, online provider/bridge feeds, measured strategy release/qualification, per-account access and current provider observations. Unit or fixture results do not establish profitable strategies or real fills.
5. The current founding execution product has 20 account slots. A 30-customer target does not alter that commercial/support capacity. Further slots and any changed offer need a deliberate, tested product/capacity update.
6. Payment configuration, real payment → entitlement → account activation → 30-day expiry/renewal and provider protection/reconnect/closure require deployed verification. No real orders, payments, Telegram sends or production schedules were activated in this pass.

## Review paths

Demo: `/demo` → investor tour → Scanner / Strategies / Backtest Lab / Providers & accounts / Customer connection / Trading controls / Customers / Growth.

Production: Setup & launch → configure sources/payment/channels → verify a customer signal subscription → validate owner demo accounts → inspect real provider evidence → enable only certified account entry controls.

The private investor mirror forces preview mode before application modules load. It has no server credentials or functional live account transport. HashiBot's main repository remains the source of production implementation.
