> Superseded for current readiness by [15 November handoff](READINESS_20261115.md). This dated record describes the earlier branch state.

# HashiBot activation handoff — 13 November 2026

This supersedes the strategy and readiness counts in the 12 November handoff. Continue PR #271 on `codex/mission2-historical-qualification`; do not rebuild or create another site.

## Current evidence

Twelve exact configurations are prepared for signals and authorized demo/testnet execution: five crypto, four Forex and three Gold. The coverage table and evidence limitations are in `../engineering/STRATEGY_COVERAGE_20261113.md`. Positive historical periods do not establish future profitability or the performance of all twelve running together.

The new SQL-to-scanner integration test installs the real bundle with the real migration, reads back its configurations/releases, and resolves the actual `watchedStrategyCatalog`. All twelve become enabled, publishable definitions with matching symbols, frames, score, reward/risk, holding limits and frozen parameters. Mutable research settings cannot overwrite those parameters; disabling a configuration removes it from scanner participation. All four account-product sets preserve matching parameters. This is local integration evidence, not proof of a hosted scanner run or a provider fill.

The admin launch workspace now exposes the actual tested dates, closed trades, net returns and profit factors for each configuration. Each period is shown separately. It does not add individual strategy returns together or present them as monthly returns.

## Activation decisions

| Action | Decision / remaining evidence |
| --- | --- |
| Restore/configure Supabase | Proceed with restoration/setup. The management API still reports project `uqiwbzfcntlcyyewawfc` as INACTIVE. Inspect the actual migration ledger and reconcile the deployment before enabling schedules. |
| Enter payment and Telegram configuration | Proceed in the existing admin configuration pages after backend deployment; never paste secrets into chat or commit them. |
| Install tested strategies | Use Enable tested strategies in `/admin/launch`. The server owns the reviews, retires unreviewed legacy defaults, and installs exact signal/demo releases. This does not start customer accounts. |
| Start signal service | Deploy current functions, connect channels, then observe scanner watch → confirmation → Telegram delivery and lifecycle updates. Verify payment → correct entitlement → admission, renewal and expiry/removal on the deployed backend. |
| Start owner execution demos | Connect Binance testnet, Bybit demo and MT5 demo. Choose exact strategy IDs/assets/risk per account; observe authorized placement, provider acknowledgement, protection, monitor reconciliation and exit. Conditional confirmation is automatic when its market rule is fulfilled; a person does not approve each trade. |
| Sell live automatic execution | Not complete. The twelve releases are demo scoped. Actual provider evidence is still absent, and subscription-expiry closure below remains engineering work. |

## Execution gap that must not be hidden

Finite subscription access blocks new entries. Existing position time stops are not proof that every owned position closes at subscription expiry. Automatic expiry closure of all HashiBot-owned positions, cancellation/reconciliation of outstanding owned entry orders, restart/retry handling, broker-unavailable recovery and account isolation still need implementation and connected verification. Do not revoke provider credentials or stop protective monitoring while positions remain exposed. Do not describe this as merely waiting for owner credentials.

## Deployment sequence

1. Restore the existing project, inspect its current migration history, enabled schedules and deployed function inventory. Keep stale scanner/entry schedules stopped while reconciling. Preserve domain, hosting, customer records and provider identities.
2. Use the existing `scripts/phase-p/inspect-deployment.mjs`, `plan-deployment.mjs` and `deploy-reviewed-release.mjs` workflow. Review the exact pending migration list; the deploy runner checks source hashes and remote dry-run agreement. Do not assume an arbitrary old project is ready for a blind push.
3. Deploy database/functions and current frontend, establish authenticated admin access, then enter worker secrets, payment fields, channel IDs/bot access and provider demo credentials through their existing configuration paths.
4. Install the tested bundle and paused schedules. Run connected signal/commerce/Telegram checks, then enable only the verified service schedules. Execution remains account scoped and separately verified.

## Verification in this continuation

- 129 existing operations TypeScript tests passed; the additional SQL-to-scanner test passed.
- 24 operations database tests and eight Python tests passed.
- App TypeScript and production web build passed; pre-existing bundle-size warnings remain.
- Published PR head `2b2479d51abd85fb0651695cc50ad5dc0d5ca322` had five successful workflow runs, including SaaS checks and native migration rehearsal. Research workflow success is not a claim that every research job ran or passed economically.
- The newly added browser assertion covers twelve choices and twenty-four exact period rows on desktop/phone. Local Chromium launch is blocked by `socket() failed: Operation not permitted`; the updated remote CI result must be checked before claiming that browser assertion passed.
