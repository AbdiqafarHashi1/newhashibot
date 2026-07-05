# HashiBot V2 Fresh Production Deployment Package

This package is the canonical runbook for deploying HashiBot V2 from a blank repository checkout into a fresh Supabase project, Netlify site, Telegram bot set, and testnet provider accounts. All V2 deployment artifacts intentionally live under `/v2`; the legacy root application is not part of this deployment.

## Repository validation

1. Clone the repository and work only from the `v2` directory.
2. Install dependencies:
   ```bash
   npm --prefix v2 install
   ```
3. Validate the frozen engine and platform contracts:
   ```bash
   npm --prefix v2 run typecheck
   npm --prefix v2 run test
   npm --prefix v2 run test:contracts
   npm --prefix v2 run test:execution
   npm --prefix v2 run test:platform
   npm --prefix v2 run test:telegram
   npm --prefix v2 run test:deployment
   ```
4. Confirm no V2 deployment artifact exists outside `/v2`:
   ```bash
   git diff --name-only HEAD -- ':!v2/**'
   ```

## Deployment audit

### Required runtime packages

- Node.js 20 LTS or newer.
- npm 10 or newer.
- Supabase CLI 1.190 or newer.
- Netlify CLI 17 or newer.
- Telegram BotFather access for FREE, VIP, and ADMIN_OPS bots.
- Binance testnet, Bybit testnet, and MT5 demo credentials.
- HashiBridge desktop host capable of outbound HTTPS to Supabase Edge Functions.

### Migration inventory and order

Execute exactly in filename order:

1. `v2/supabase/migrations/20260705080000_v2_platform_base_fresh_project.sql`
2. `v2/supabase/migrations/20260705090000_v2_trade_truth_store.sql`
3. `v2/supabase/migrations/20260705100000_v2_command_queue_idempotency.sql`
4. `v2/supabase/migrations/20260705120000_platform_foundation.sql`
5. `v2/supabase/migrations/20260705130000_telegram_platform.sql`
6. `v2/supabase/migrations/20260705180000_executor_manager_monitoring.sql`
7. `v2/supabase/migrations/20260705200000_mt5_hashibridge.sql`
8. `v2/supabase/migrations/20260705210000_research_lab.sql`
9. `v2/supabase/migrations/20260705230000_production_hardening_retention.sql`

### Edge Function inventory and deployment order

Deploy shared code first by deploying any function; Supabase bundles `_shared` automatically. Deploy in this order:

1. `runtime-health`
2. `queue-health`
3. `provider-health`
4. `monitoring-summary`
5. `platform-api`
6. `telegram-platform`
7. `executor-heartbeat`
8. `executor-start`
9. `executor-pause`
10. `executor-resume`
11. `executor-stop`
12. `executor-restart`
13. `executor-recovery`
14. `bridge-register`
15. `bridge-heartbeat`
16. `bridge-sync`
17. `mt5-account-register`
18. `mt5-terminal-health`
19. `mt5-recovery`
20. `research-lab`

### Missing items fixed by this package

- Added deterministic fresh-project SQL execution guide.
- Added environment and secret inventory.
- Added Edge Function deployment matrix with verification requests.
- Added storage, Netlify, bootstrap, reset, smoke-test, and operations runbooks.
- Added executable validation scripts and an npm deployment test.

## Fresh deployment sequence

1. Read `v2/deploy/environment.md` and create every required secret.
2. Execute `v2/deploy/sql/SQL_PACKAGE.md` in order against the fresh Supabase project.
3. Apply storage plan from `v2/deploy/storage.md`.
4. Deploy Edge Functions using `v2/deploy/edge-functions.md`.
5. Configure Netlify with `v2/deploy/netlify.md`.
6. Provision secrets using `v2/deploy/secrets.md`.
7. Run owner/admin bootstrap using `v2/deploy/bootstrap.md`.
8. Configure Telegram using `v2/deploy/telegram.md`.
9. Configure testnet providers using `v2/deploy/providers.md`.
10. Run reset/initialization using `v2/deploy/reset-initialization.md`.
11. Run certification smoke test using `v2/deploy/smoke-test.md`.
12. Operate with `v2/deploy/operations-runbook.md`.
