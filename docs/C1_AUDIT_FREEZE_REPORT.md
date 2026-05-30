# HashiBot C1 Audit + Frozen Baseline Report

Date: 2026-05-30 UTC
Repository path: `/workspace/newhashibot`

## 1. Git freeze status

- Starting branch was `work`.
- Working tree was clean before freezing (`git status --short --branch` showed only `## work`).
- Recent commit history at freeze point:
  - `1d9ec57 Updated PublicLayout.tsx`
  - `f383084 Updated App.tsx`
  - `f118ee1 Updated BacktestLab.tsx`
  - `fedb536 Updated BacktestLab.tsx`
  - `b7576c5 Updated index.ts`
  - `3c65867 Updated index.ts`
  - `bbb7105 Added 20260530064042_018_strategy_modes_and_distance_guards.sql`
  - `2dd87dc Updated ProviderHealth.tsx`
  - `aafedbd Updated App.tsx`
  - `72e399e Added 20260530054730_017_signal_analytics_views.sql`
- Created freeze branch: `stable-crypto-signal-mvp`.
- Created freeze tag: `stable-crypto-signal-mvp-v1`.
- No merge was performed.
- Bolt sync status: inferred clean at repository level because the starting working tree had no uncommitted files and recent commits are Bolt-style update commits; no Bolt-specific metadata file was found or changed.

## 2. Build verification

Commands run:

- `npm run typecheck` — passed.
- `npm run lint` — passed with warnings only.
- `npm run build` — passed.

Notes:

- `node_modules` was already present, so `npm install` was not run.
- `npm run lint` warnings were pre-existing Fast Refresh / hook warnings in:
  - `src/components/ui/Badge.tsx`
  - `src/contexts/AuthContext.tsx`
  - `src/pages/app/Dashboard.tsx`
- `npm run build` produced a Vite chunk-size warning for the main JS bundle, but completed successfully.
- No build-fix code changes were required.

## 3. Frontend architecture audit

HashiBot is a Vite + React + TypeScript application. The app entry is `src/main.tsx`, routing is centralized in `src/App.tsx`, auth state is provided by `src/contexts/AuthContext.tsx`, Supabase browser client setup is in `src/lib/supabase.ts` and `src/lib/supabaseEnv.ts`, and shared route protection is in `src/components/guards/RequireAuth.tsx`.

### Public/customer pages

Public routes are:

- `/` → `src/pages/public/Home.tsx`
- `/signal-mode` → `src/pages/public/SignalMode.tsx`
- `/personal-ea` → `src/pages/public/PersonalEA.tsx`
- `/prop-ea` → `src/pages/public/PropEA.tsx`
- `/pricing` → `src/pages/public/Pricing.tsx`
- `/results` → `src/pages/public/Results.tsx`
- `/faq` → `src/pages/public/FAQ.tsx`
- `/login` → `src/pages/auth/Login.tsx`
- `/register` → `src/pages/auth/Register.tsx`

Customer app routes are protected by `RequireAuth`:

- `/app/dashboard` → `src/pages/app/Dashboard.tsx`
- `/app/signals` → `src/pages/app/ActiveSignals.tsx`
- `/app/signals/:id` → `src/pages/app/SignalDetail.tsx`
- `/app/history` → `src/pages/app/SignalHistory.tsx`
- `/app/telegram` → `src/pages/app/TelegramSetup.tsx`
- `/app/watchlist` → `src/pages/app/Watchlist.tsx`
- `/app/account` → `src/pages/app/Account.tsx`

### Admin pages

Admin routes are protected by `RequireAdmin`:

- `/admin/control-room` → `src/pages/admin/ControlRoom.tsx`
- `/admin/scanner` → `src/pages/admin/ScannerStatus.tsx`
- `/admin/scanner-config` → `src/pages/admin/ScannerConfig.tsx`
- `/admin/providers` → `src/pages/admin/ProviderHealth.tsx`
- `/admin/candidates` → `src/pages/admin/Candidates.tsx`
- `/admin/rejected` → `src/pages/admin/RejectedSetups.tsx`
- `/admin/signals` → `src/pages/admin/SignalsManager.tsx`
- `/admin/signals/new` → `src/pages/admin/ManualSignal.tsx`
- `/admin/telegram-test` → `src/pages/admin/TelegramTest.tsx`
- `/admin/telegram` → `src/pages/admin/TelegramLogs.tsx`
- `/admin/telegram-links` and `/admin/telegram-requests` → `src/pages/admin/TelegramLinks.tsx`
- `/admin/users` → `src/pages/admin/UsersAccess.tsx`
- `/admin/customers` → `src/pages/admin/Customers.tsx`
- `/admin/access-requests` → `src/pages/admin/AccessRequests.tsx`
- `/admin/audit` → `src/pages/admin/AuditLogs.tsx`
- `/admin/scheduler` → `src/pages/admin/SchedulerGuide.tsx`
- `/admin/outcomes` → `src/pages/admin/OutcomeTracking.tsx`
- `/admin/performance` → `src/pages/admin/Performance.tsx`
- `/admin/checklist` → `src/pages/admin/SetupChecklist.tsx`
- `/admin/strategy-config` → `src/pages/admin/StrategyConfig.tsx`
- `/admin/execution` → `src/pages/admin/Execution.tsx`
- `/admin/trading-brain` → `src/pages/admin/TradingBrain.tsx`
- `/admin/modes` → `src/pages/admin/Modes.tsx`
- `/admin/backtest-lab` → `src/pages/admin/BacktestLab.tsx`
- `/admin/handoff` → `src/pages/admin/Handoff.tsx`

`/admin/setup` and `/admin-setup` are intentionally public bootstrap routes, with UI warnings that they are development/bootstrap-only and should be locked or removed before public launch once an admin exists.

### Auth flow

- `AuthProvider` subscribes to Supabase auth state, loads the authenticated user's `profiles` row, and exposes `user`, `profile`, loading state, and profile errors.
- `AuthRedirect` sends admins to `/admin/control-room` and non-admin users to `/app/dashboard`.
- `RequireAuth` blocks unauthenticated access to app routes.
- `RequireAdmin` blocks unauthenticated users and redirects authenticated non-admin users to `/app/dashboard`.
- Admin authorization is based on `profiles.role === 'admin'`.

### Supabase frontend setup

- Expected Supabase project ref is hardcoded as `uqiwbzfcntlcyyewawfc` for validation.
- Expected public origin is `https://uqiwbzfcntlcyyewawfc.supabase.co`.
- The frontend chooses from public Vite env vars and safe fallback logic only.
- The browser client detects and rejects service-role/secret-style keys by type guess.
- No service-role key is intentionally used in browser code.

## 4. Supabase database migration audit

Migrations present:

1. `20260526042530_001_create_core_tables.sql`
   - Core profile/access tables, symbols, candles, indicator snapshots, scanner runs, strategy candidates, signals, signal updates, provider status, Telegram deliveries, audit logs, and licenses.
   - Seeds initial crypto and forex symbols and provider rows.
   - Adds RLS policies for users/admins/service use.
2. `20260526045924_002_scanner_config.sql`
   - Adds singleton `scanner_config` with scanner enablement, schedule, grade, duplicate, demo, Telegram, and timeframe controls.
3. `20260526053206_003_telegram_links.sql`
   - Adds user-submitted Telegram link records with admin review/update policies.
4. `20260526055533_004_fix_profiles_rls_and_trigger.sql`
   - Repairs profile RLS and new-user trigger/profile creation behavior.
5. `20260526055553_005_access_requests_and_telegram_updates.sql`
   - Adds access request workflow and extends signal/Telegram update support.
6. `20260526062858_006_fix_profiles_rls_recursion.sql`
   - Repairs recursive profile/admin policy behavior with `is_admin()` support.
7. `20260526072547_007_strategy_configs_execution_orders_candidates_schema.sql`
   - Adds `strategy_configs`, `execution_orders`, candidate metadata, and scanner-run counters.
   - Seeds MicroScalper and CompressionBreakout configs.
8. `20260526080120_008_modes_risk_profiles_paper_execution_backtest.sql`
   - Adds modes, risk profiles, paper execution intents, backtest datasets/runs/trades, and mode/risk/paper execution fields on signals.
9. `20260526082022_009_scanner_config_phase5a_fields.sql`
   - Adds scanner config fields for phase 5A controls and market toggles.
10. `20260526084706_010_replay_testnet_lab.sql`
   - Adds replay/testnet lab structures for future/non-live execution experimentation.
11. `20260526090658_011_enable_pg_cron_and_net.sql`
   - Enables `pg_cron` and `pg_net` extensions.
12. `20260526100000_012_schedule_market_scanner_cron.sql`
   - Adds scheduled scanner cron registration logic.
13. `20260526_hashibot_base_schema_combined.sql`
   - Combined/base schema snapshot duplicating major early schema concepts; should be treated carefully to avoid double-application conflicts in fresh environments.
14. `20260527073425_013_signal_updates_column_fix.sql`
   - Adds signal update fields needed by outcome/Telegram status updates.
15. `20260529120000_014_repair_scheduled_scanner_cron.sql`
   - Repairs cron setup and adds scanner run operational/outcome counters.
16. `20260530025404_015_scanner_runs_provenance_columns.sql`
   - Adds scanner run source/trigger/provenance columns.
17. `20260530053148_016_scanner_runs_telegram_skipped_count.sql`
   - Adds Telegram skipped count and duplicate-symbol block counters to scanner runs.
18. `20260530054730_017_signal_analytics_views.sql`
   - Adds signal and grouped performance analytics views by strategy, symbol, timeframe, and grade.
19. `20260530064042_018_strategy_modes_and_distance_guards.sql`
   - Adds strategy `signal_style`, `risk_mode`, minimum distance guards, max bars in trade, updates MicroScalper and CompressionBreakout, and seeds SwingContinuation.
20. `20260530142932_019_packages_and_customer_subscriptions.sql`
   - Adds customer packages and subscriptions/access-management tables.

Major groups confirmed:

- Auth/profile/admin: migrations 001, 004, 006, admin bootstrap function, profile RLS, `is_admin()` policies.
- Scanner/config: migrations 002, 009, 014, 015, 016 and `scanner_config` singleton.
- Signals/candidates: migrations 001, 007, 008, 013, 018.
- Telegram deliveries: migrations 001, 003, 005, 013, 016.
- Scanner runs: migrations 001, 007, 014, 015, 016.
- Analytics/performance: migration 017.
- Backtest/apply-to-live config: migrations 008 and 018 provide backtest tables and strategy configs; the current Backtest Lab itself runs locally and does not create live signals.
- Customer/package/access: migration 019.

No migrations were run during this audit.

## 5. Supabase Edge Functions audit

Functions present:

### `admin-bootstrap`

- Purpose: first-admin/bootstrap role elevation once no admin exists.
- Inputs: authenticated Supabase bearer token.
- Outputs: JSON success/error and profile role update result.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tables: reads/updates `profiles`, inserts `audit_logs`.
- Invocation class: browser-invoked bootstrap/admin setup route; should be treated as sensitive bootstrap-only surface.

### `admin-scheduler-action`

- Purpose: admin scheduler health/control action, probes cron/function state and can trigger scheduled scanner wrapper.
- Inputs: authenticated admin bearer token and JSON action payload.
- Outputs: JSON scheduler status/action results.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_CRON_SECRET`.
- Tables/schemas: reads `profiles`, `scanner_config`, `scanner_runs`, `signal_updates`, `net._http_response`, `cron.job`, `cron.job_run_details`; inserts `audit_logs`.
- Invocation class: admin-only browser invocation.

### `market-scanner`

- Purpose: main scanner pipeline, provider health debug, crypto/forex market scan, candidate generation, signal insertion, and optional Telegram auto-send.
- Inputs: admin bearer token or service-role invocation; JSON can include run type, source, scanner run id, or debug/provider-health flags.
- Outputs: JSON scan/proof summary including candidates, signals, Telegram counts, duplicate blocks, provider status, and errors.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRYPTO_DATA_PROVIDER`, `SIGNAL_ENABLE_CRYPTO`, `SIGNAL_ENABLE_FOREX`, `TELEGRAM_ENABLED`, `ENABLE_SIGNAL_MODE_OUTPUT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHANNEL_ID`/`TELEGRAM_CHAT_ID`, `FOREX_DATA_PROVIDER`, `FOREX_PROVIDER_FALLBACKS`, `FOREX_DEMO_FALLBACK`, `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`/`FOREX_DATA_API_KEY`, `MT5_BRIDGE_BASE_URL`, `MT5_BRIDGE_SECRET`, `SCANNER_CRON_SECRET`.
- Tables: reads `scanner_config`, `strategy_configs`, `modes`, `risk_profiles`, `symbols`, existing active `signals`; writes `scanner_runs`, `strategy_candidates`, `signals`, `paper_execution_intents`, `provider_status`, `telegram_deliveries`.
- Invocation class: admin browser/manual or service-role internal/scheduled invocation.

### `scheduled-market-scanner`

- Purpose: cron-safe wrapper around `market-scanner`, creates/updates a scanner run, validates cron secret/service auth, and triggers outcome evaluation after scan.
- Inputs: `x-scanner-cron-secret` header or service-role bearer token.
- Outputs: JSON scheduled run status and proxied scanner/outcome results.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_CRON_SECRET`.
- Tables: inserts/updates `scanner_runs`, reads `scanner_config`.
- Invocation class: cron-invoked/internal scheduler wrapper.

### `telegram-send`

- Purpose: admin/manual Telegram delivery for a signal.
- Inputs: authenticated admin bearer token and signal id/body.
- Outputs: JSON sent/skipped/failed status and delivery id if created.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_ENABLED`, `ENABLE_SIGNAL_MODE_OUTPUT`, `SIGNAL_ENABLE_CRYPTO`, `SIGNAL_ENABLE_FOREX`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHANNEL_ID`.
- Tables: reads `profiles`, `signals`, `scanner_config`, `telegram_deliveries`; inserts `telegram_deliveries`, `audit_logs`.
- Invocation class: admin-only browser invocation.

### `telegram-test`

- Purpose: admin Telegram test-message sender.
- Inputs: authenticated admin bearer token and optional message/body.
- Outputs: JSON Telegram API send result.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHANNEL_ID`.
- Tables: reads `profiles`; inserts `telegram_deliveries`, `audit_logs`.
- Invocation class: admin-only browser invocation.

### `evaluate-signal-outcomes`

- Purpose: checks open signal outcomes against current Binance prices, updates signal statuses, and optionally sends Telegram outcome updates.
- Inputs: admin bearer token, service-role bearer token, or valid `x-scanner-cron-secret`.
- Outputs: JSON outcome counts and Telegram sent/skipped/failed counts.
- Secrets/env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCANNER_CRON_SECRET`, `SIGNAL_ENABLE_CRYPTO`, `SIGNAL_ENABLE_FOREX`, `TELEGRAM_ENABLED`, `ENABLE_SIGNAL_MODE_OUTPUT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHANNEL_ID`.
- Tables: reads `signals`, `telegram_deliveries`; writes `signals`, `signal_updates`, `telegram_deliveries`.
- Invocation class: admin/manual or cron/scheduled internal invocation.

Provider health is handled inside `market-scanner` via provider-health/debug request branches and surfaced by `src/pages/admin/ProviderHealth.tsx`; there is no separate provider-health Edge Function file.

## 6. Crypto signal pipeline audit

Current crypto pipeline:

1. Provider/data source: crypto candles are fetched from Binance public API (`/api/v3/klines`) and marked `REAL DATA` when sufficient candles are returned.
2. Scanner trigger: admin/manual calls invoke `market-scanner`; cron calls invoke `scheduled-market-scanner`, which in turn calls `market-scanner` with service-role auth.
3. Candidate generation: active symbols and configured timeframes are scanned; indicators are calculated; each enabled strategy evaluates the candles; rejected strategy candidates are recorded.
4. Strategy selection/arbitration: MicroScalper, CompressionBreakout, and SwingContinuation may evaluate a symbol/timeframe; distance guards are applied; a weighted arbitration picks the best candidate when multiple pass.
5. Signal insert: passing real-data candidates above grade/score/risk thresholds are inserted into `signals` with `status='waiting'`, `source='scanner'`, mode and risk snapshots, and the candidate row is marked converted.
6. Telegram entry send: `tryAutoSendTelegram` checks Telegram env flags, signal-mode output flag, real-data source, status, duplicate delivery rows, and configured minimum grade before calling Telegram and inserting `telegram_deliveries`.
7. Outcome tracking: `evaluate-signal-outcomes` fetches current Binance ticker prices and updates open signals to TP/SL/expired-style statuses when conditions are met.
8. Telegram result update: outcome evaluation can write result `telegram_deliveries` entries and send result messages when enabled/configured.
9. Performance analytics: migration 017 creates analytics views consumed by the admin performance page.

Confirmed checks:

- Crypto uses real Binance data: confirmed in `market-scanner` Binance klines fetch and `REAL DATA` gating.
- Forex is disabled by default for the MVP: confirmed by `SIGNAL_ENABLE_FOREX` default false plus DB market toggle checks.
- Demo/fake signals are blocked from Telegram: confirmed by `dataSource !== 'REAL DATA'` / data-source gating and Telegram env gates.
- One-active-signal-per-symbol exists: confirmed by `scanner_config.prevent_duplicate_symbol_signals` and active `waiting`/`active` signal set checks.
- Duplicate Telegram entries are blocked: confirmed by `telegram_deliveries` existing sent check before Telegram send.
- Distance guards exist: confirmed in strategy guard fields and `passesDistanceGuards` logic.
- MicroScalper exists: implemented in `market-scanner` and Backtest Lab, seeded in migrations.
- CompressionBreakout exists: implemented in `market-scanner` and Backtest Lab, seeded in migrations.
- SwingContinuation exists: implemented in `market-scanner` and Backtest Lab, seeded by migration 018.
- Backtest Lab is isolated from live signals: confirmed; it runs in browser, only optionally saves dataset metadata, and explicitly states it creates no live signals, Telegram messages, or account activity.

## 7. Strategy audit

### MicroScalper

- Implemented in: `supabase/functions/market-scanner/index.ts` (`evalMicroScalper`) and `src/pages/admin/BacktestLab.tsx` (`evalMS`).
- Config row: seeded in migration 007 and updated in migration 018.
- Enabled status: seeded/updated as enabled in strategy config unless admin later disables it.
- Intended timeframes: `5m`, `15m`.
- Signal style/risk mode: `scalper` / `balanced` after migration 018.
- Distance guards after migration 018: minimum stop 0.18%, TP1 0.25%, TP2 0.40%.
- Known limitations: short-timeframe momentum strategy; Binance-only production path in C1; no broker execution.

### CompressionBreakout

- Implemented in: `supabase/functions/market-scanner/index.ts` (`evalCompressionBreakout`) and `src/pages/admin/BacktestLab.tsx` (`evalCB`).
- Config row: seeded in migration 007 and updated in migration 018.
- Enabled status: seeded/updated as enabled in strategy config unless admin later disables it.
- Intended timeframes: `15m`, `1h`.
- Signal style/risk mode: `breakout` / `balanced` after migration 018.
- Distance guards after migration 018: minimum stop 0.25%, TP1 0.35%, TP2 0.60%.
- Known limitations: requires a meaningful compression/breakout regime; includes fakeout protection but remains bar-based and not execution-aware.

### SwingContinuation

- Implemented in: `supabase/functions/market-scanner/index.ts` (`evalSwingContinuation`) and `src/pages/admin/BacktestLab.tsx` (`evalSW`).
- Config row: inserted by migration 018.
- Enabled status: inserted as enabled unless admin later disables it.
- Intended timeframes: `15m`, `1h`.
- Signal style/risk mode: `swing` / `conservative` after migration 018.
- Distance guards after migration 018: minimum stop 0.35%, TP1 0.55%, TP2 0.90%.
- Known limitations: trend/pullback continuation strategy; not tied to live broker execution; should be validated further before forex parity.

## 8. Backtest Lab audit

- Page path: `/admin/backtest-lab`.
- File: `src/pages/admin/BacktestLab.tsx`.
- CSV parser location: local `parseCSV()` function in the page file.
- Supported required columns: one time column named `time`, `open_time`, `datetime`, `date`, or `timestamp`; plus `open`, `high`, `low`, `close`.
- Optional column: `volume`.
- Supported strategies: MicroScalper, CompressionBreakout, SwingContinuation.
- Parameter editor: local React state-driven editor with presets/modes and per-strategy parameter controls.
- Date range behavior: full/custom/preset ranges are applied to parsed in-browser candles before simulation.
- Large CSV safety: browser simulation blocks more than 50,000 selected candles and asks confirmation for large ranges before running.
- Presets behavior: range presets update selected date windows; strategy/mode presets update local parameter sets.
- Apply-to-live behavior: current implementation does not directly write live strategy configs or live signals from the backtest run. It only optionally saves dataset metadata to `backtest_datasets`.
- Live isolation: no live `signals` rows or Telegram messages are produced by Backtest Lab.

## 9. Customer/public UI audit

- Landing page: ready for crypto Signal Mode MVP; describes Binance public data and dashboard/Telegram delivery with educational disclaimers.
- Signal Mode page: ready/mostly ready; explicitly says Signal Mode is live and crypto-focused.
- Pricing page: partially ready; depends on actual package/subscription/admin operations and payment process outside this audit.
- Results/showcase page: partially ready; presents examples/history and should continue to avoid implying guaranteed returns.
- Login/register flow: functional route-level flow exists; Supabase env validation is present.
- Customer dashboard: present with subscription/access gating and recent active signals.
- Personal Mode page: correctly marked Coming Soon; no real trades are claimed live.
- Prop Mode page: correctly marked Coming Soon; no real trades are claimed live.
- Admin route protection: present with `RequireAdmin`.
- Customer route protection: present with `RequireAuth`.
- Unsafe/dated copy risk: `src/pages/app/TelegramSetup.tsx` contains text saying “Forex signals use demo data,” which is stale for the current crypto-only MVP and should be corrected in a later copy-only phase, not in C1.

## 10. Security/secrets audit

- Service-role key in frontend/browser code: no literal service-role key found. Frontend config rejects service-role/secret-style keys if accidentally supplied.
- Telegram bot token in frontend/browser code: no literal token found; only secret names/instructions appear in admin docs/pages.
- Supabase anon/service confusion: frontend uses Vite public env variables and secret detection; Edge Functions use service-role env only server-side.
- Hardcoded private keys: no hardcoded private key values found.
- Exposed DB URL/JWT secret/cron secret values: no literal DB URL, JWT secret, or cron secret value found. Secret names and placeholders appear in docs/admin checklist only.
- Admin route protection: present in frontend; Edge Functions that mutate admin/scheduler/Telegram actions verify authenticated admin or service/cron auth.
- Customer/admin separation: route guards and RLS policies separate customer/app access from admin pages and admin tables.
- Risk: `/admin/setup` remains publicly routable by design; the function checks current admin state, but the bootstrap surface should remain monitored/locked before public launch.

## 11. Environment/deployment checklist

### Frontend/Bolt/Vite env

- `VITE_HASHIBOT_SUPABASE_URL` or `VITE_SUPABASE_URL` pointing to `https://uqiwbzfcntlcyyewawfc.supabase.co`.
- `VITE_HASHIBOT_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, or equivalent public anon/publishable key.
- Do not put service-role or Telegram bot token values in Vite/browser env.

### Supabase Edge Function secrets

Required for crypto Signal Mode MVP:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIGNAL_ENABLE_CRYPTO=true`
- `SIGNAL_ENABLE_FOREX=false`
- `ENABLE_SIGNAL_MODE_OUTPUT=true` when Telegram/live output is intentionally enabled.
- `TELEGRAM_ENABLED=true` when Telegram sending is intentionally enabled.
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHANNEL_ID` or configured destination used by the functions.
- `SCANNER_CRON_SECRET` if cron-secret auth is used.
- Optional: `CRYPTO_DATA_PROVIDER=binance`.

Kept for future forex/personal/prop work but not enabled in C1:

- `FOREX_DATA_PROVIDER`
- `FOREX_PROVIDER_FALLBACKS`
- `FOREX_DEMO_FALLBACK`
- `FINNHUB_API_KEY`
- `TWELVEDATA_API_KEY` / `FOREX_DATA_API_KEY`
- `MT5_BRIDGE_BASE_URL`
- `MT5_BRIDGE_SECRET`

### Supabase project settings

- Correct project ref: `uqiwbzfcntlcyyewawfc`.
- Edge Functions deployed: `market-scanner`, `scheduled-market-scanner`, `telegram-send`, `telegram-test`, `evaluate-signal-outcomes`, `admin-bootstrap`, `admin-scheduler-action`.
- Database migrations applied in order, with special care around the combined/base schema snapshot if applying to a fresh project.
- RLS policies active as defined by migrations.
- `pg_cron` and `pg_net` enabled if scheduled scanning is required.

### Telegram setup

- Bot created in Telegram.
- Bot token stored only as Edge Function secret.
- Destination channel/group/chat id configured as Edge Function secret.
- Bot added to the target channel/group with permission to post messages.
- Admin test page/function used to verify delivery after secrets are set.

### Cron/scheduler

- `scheduled-market-scanner` endpoint registered in `pg_cron` or equivalent scheduler.
- `x-scanner-cron-secret` header matches the Edge Function secret when using cron-secret auth.
- Scanner config has scheduling enabled before expecting scheduled runs.
- Scheduler health/admin pages should show recent scheduled scanner runs and outcome checks.

## 12. Current-state summary

### Confirmed working from code/build audit

- Crypto Signal Mode MVP architecture is present.
- Login/admin route flow and guards are present.
- Supabase project ref validation points to `uqiwbzfcntlcyyewawfc`.
- Scheduled scanner wrapper exists.
- Binance real-data crypto scanner exists.
- Telegram entry auto-send path exists with real-data and duplicate guards.
- Outcome tracking exists.
- Performance analytics views exist.
- Backtest Lab exists with CSV upload, strategy picker, parameters, date ranges, large CSV safety, presets, and live isolation.
- Public UI has been redesigned around crypto Signal Mode with Personal/Prop Coming Soon.

### Partially working / operationally dependent

- Telegram delivery depends on correct Edge secrets, Telegram channel/bot setup, and scanner config flags.
- Cron scanning depends on deployed functions, `pg_cron`/`pg_net`, correct cron secret, and schedule enablement.
- Customer package/access workflow exists in schema/UI but still depends on operational admin/payment processes.
- Provider health UI/function debug routes are present but depend on deployed secrets/runtime state.

### Not ready / explicitly disabled

- Forex is not production-ready and is disabled for the crypto-only MVP.
- Personal/Prop execution is not live.
- Broker/demo/live execution must remain disabled.
- MT5 bridge and forex provider secrets should not be activated for production execution during C1.

### Major risks

- Migration history includes a combined/base schema snapshot in addition to numbered migrations; fresh-project migration order should be validated carefully before re-running.
- Public `/admin/setup` bootstrap route/function is a sensitive surface even though it checks for existing admins.
- Old documentation/admin handoff pages still mention forex/demo setup and could confuse operators during crypto-only freeze.
- Vite bundle size warning indicates the app would benefit from future code splitting, but this is not a C1 blocker.
- Live operational success cannot be proven solely from local build; deployed Supabase secrets, cron jobs, and Telegram bot/channel state must be verified in the target project.

## 13. Files inspected

- `package.json`
- `src/App.tsx`
- `src/main.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/guards/RequireAuth.tsx`
- `src/components/layout/PublicLayout.tsx`
- `src/lib/supabase.ts`
- `src/lib/supabaseEnv.ts`
- `src/lib/adminSchedulerTruth.ts`
- `src/lib/edgeFunctionStatus.ts`
- `src/lib/types.ts`
- `src/pages/public/Home.tsx`
- `src/pages/public/SignalMode.tsx`
- `src/pages/public/PersonalEA.tsx`
- `src/pages/public/PropEA.tsx`
- `src/pages/public/Pricing.tsx`
- `src/pages/public/Results.tsx`
- `src/pages/public/FAQ.tsx`
- `src/pages/auth/Login.tsx`
- `src/pages/auth/Register.tsx`
- `src/pages/auth/AdminSetup.tsx`
- `src/pages/app/Dashboard.tsx`
- `src/pages/app/ActiveSignals.tsx`
- `src/pages/app/SignalDetail.tsx`
- `src/pages/app/SignalHistory.tsx`
- `src/pages/app/TelegramSetup.tsx`
- `src/pages/app/Watchlist.tsx`
- `src/pages/app/Account.tsx`
- `src/pages/admin/BacktestLab.tsx`
- `src/pages/admin/ProviderHealth.tsx`
- `src/pages/admin/SetupChecklist.tsx`
- `src/pages/admin/SchedulerGuide.tsx`
- `src/pages/admin/SignalsManager.tsx`
- `src/pages/admin/Performance.tsx`
- `src/pages/admin/Customers.tsx`
- `src/pages/admin/Handoff.tsx`
- `supabase/functions/admin-bootstrap/index.ts`
- `supabase/functions/admin-scheduler-action/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/scheduled-market-scanner/index.ts`
- `supabase/functions/telegram-send/index.ts`
- `supabase/functions/telegram-test/index.ts`
- all files under `supabase/migrations/`
- `docs/CRYPTO_ONLY_MVP_DEPLOY_CHECKLIST.md`
- `docs/RUNTIME_AUDIT.md`
- `docs/RUNTIME_FIX_SUMMARY.md`
- `docs/RUNTIME_FIX_TEST_PLAN.md`

## 14. Files changed in C1

- `docs/C1_AUDIT_FREEZE_REPORT.md` was added as documentation only.
- No application behavior, frontend UI, Supabase URL/ref/key logic, auth behavior, Telegram secret/function logic, scanner strategy logic, or database schema was changed.

## 15. Recommended next Codex phase

Recommended next phase: **C2 — Forex Signal Mode parity with crypto**.

Do not implement C2 until this C1 baseline branch/tag is preserved and deployment operators confirm the frozen crypto Signal Mode MVP is recoverable from `stable-crypto-signal-mvp` / `stable-crypto-signal-mvp-v1`.
