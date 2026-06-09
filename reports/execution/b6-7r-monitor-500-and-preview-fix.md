# B6.7R — Monitor 500 and Supabase Preview Fix

Date: 2026-06-09

## Scope guard

Changed only:

- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260526100000_012_schedule_market_scanner_cron.sql`
- `supabase/migrations/20260529120000_014_repair_scheduled_scanner_cron.sql`
- `supabase/migrations/20260609143000_058_b6_7r_monitor_schema_preview_safety.sql`

No strategy, scanner logic, arbitrator, execution sizing, Telegram logic, public/customer pages, performance history, or live-trading behavior was changed.

## 1. Exact monitor 500 root cause

The B6.7 row recovery protected exceptions raised inside the `for (const row ...)` loop, but the monitor still had pre-row startup paths that returned or escalated non-200 responses:

1. Missing Edge Function environment (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) returned HTTP 500 before Supabase client creation.
2. Auth failure returned HTTP 403 before the row loop.
3. The `execution_orders` startup query threw its PostgREST error into the top-level catch before row processing.
4. The top-level catch returned HTTP 500 for any pre-row DB/schema/startup exception.

The most important 500 path was:

`Deno.serve` startup -> Supabase client/auth/settings gates -> `execution_orders.select('*').in(...).order(...).limit(100)` -> `if (error) throw error` -> top-level catch -> HTTP 500.

That path happens before row processing, so B6.7 row-level isolation cannot catch it.

## 2. Whether failure happened before or inside row loop

The unprotected 500 path happened **before** the row loop. Row-level failures were already isolated by B6.7, but startup/auth/schema/query failures were not.

## 3. Whether migrations were missing

I could not query the real production Supabase database from this environment because no Supabase CLI/project credentials are present in the workspace environment. Code inspection found that migrations 052/053 are intended to add the B6.6/B6.7 lifecycle states and monitor visibility columns. A new idempotent guard migration was added so preview and partially migrated environments add/retain:

- `execution_orders.latest_monitor_error`
- `execution_orders.latest_sync_error`
- `execution_orders.latest_protection_error`
- `execution_orders.last_monitor_action`
- `execution_settings.latest_monitor_error`
- `execution_settings.latest_sync_error`
- B6.6/B6.7 lifecycle status values
- B6.7 protection status values

The Edge Function now probes the required monitor columns at startup and returns HTTP 200 with `success=false`, `monitor_started=false`, and `global_error="missing_table_or_column"` if the deployed database/schema cache is behind.

## 4. Whether cron auth was invalid

I could not inspect production cron run headers or the live `scanner_config.cron_pg_token` without Supabase credentials. Code inspection found that invalid cron auth was another pre-row non-200 path because auth failure previously returned HTTP 403. The monitor now returns a structured HTTP 200 `auth_failed` response so failed auth does not appear as a 500 invocation.

Production cron auth behavior is preserved: service-role bearer, `scanner_config.cron_pg_token`, and `x-scanner-cron-secret` remain the only accepted auth paths.

## 5. Whether deployment mismatch existed

I could not inspect the deployed Edge Function bundle or Supabase cron target from this environment because Supabase CLI/project credentials are not present. A deployment proof guard was added: callers can send `expected_monitor_version`, and the function returns structured HTTP 200 `deployment_mismatch` if the deployed code does not match the expected version.

Current monitor version marker: `b6.7r-monitor-startup-safe`.

## 6. Exact reason Supabase Preview failed

Preview failed because migrations 012 and 014 required database GUCs that preview/CI databases do not define:

- `app.settings.supabase_url`
- `app.settings.scanner_cron_secret`

Those migrations raised exceptions when either value was missing, which failed the migration chain even though preview should not need production cron registration.

## 7. How preview was fixed

Migrations 012 and 014 now detect missing preview/CI-only GUCs, emit a `NOTICE`, and `RETURN` from the cron-registration DO block instead of raising an exception.

Production behavior is preserved because when both settings exist the migrations still unschedule stale jobs and register the scheduled scanner cron exactly as before. No secrets were hardcoded.

## 8. Proof of 3 consecutive 200 monitor runs

Not available from this workspace because there is no Supabase CLI/project credential or live invocation token in environment variables. The code path now guarantees recoverable startup classes return HTTP 200:

- `auth_failed`
- `missing_env`
- `invalid_payload`
- `db_query_failed`
- `missing_table_or_column`
- `deployment_mismatch`

A real deployment validation should run three consecutive calls against the deployed function and confirm status 200 plus response fields: `checked`, `updated`, `row_errors`, and `global_error`.

## 9. Confirmation unchanged areas

No files were changed under strategy configuration, scanner functions, arbitrator logic, execution sizing/execution function, Telegram functions, public/customer pages, performance-history UI, or live-trading controls.

## Tests and checks run

- `npm run test:execution` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with existing Fast Refresh warnings only.
- `npm run build` — passed with existing Vite chunk-size warning.
- `git diff --check` — passed.
