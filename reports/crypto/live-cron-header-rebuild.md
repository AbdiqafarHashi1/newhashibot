# Live cron header rebuild

## Scope

This report covers only the pg_cron header rebuild requested for the Binance testnet monitor and intelligence cron jobs. It does not change strategy logic, scanner logic, Binance execution logic, Telegram routing, intelligence calculations, Forex, MT5, or UI design.

## Implemented migration

Migration: `supabase/migrations/20260613170000_067_live_cron_header_rebuild.sql`

### Header rule enforced

Every rebuilt job sends:

- `Content-Type: application/json`
- `apikey: <scanner_config.supabase_anon_key>`
- `Authorization: Bearer <scanner_config.supabase_anon_key>`
- `x-hashibot-cron-token: <scanner_config.cron_pg_token>`

The migration adds `scanner_config.supabase_anon_key` if missing and seeds it from the production anon JWT when empty. The cron token is never used as the Bearer token in the rebuilt commands.

### Rebuilt production jobs

- `hashibot_binance_testnet_monitor_1m`
- `hashibot_morning_brief_0800`
- `hashibot_news_digest_1200`
- `hashibot_watchlist_patterns_1600`
- `hashibot_market_wrap_2000`

### Recreated temporary one-minute intelligence jobs

- `hashibot_test_morning_brief_1m`
- `hashibot_test_news_digest_1m`
- `hashibot_test_watchlist_patterns_1m`
- `hashibot_test_market_wrap_1m`

## Verification SQL to run on live Supabase after applying the migration

### 1. Verify cron.job command headers

```sql
WITH target_jobs AS (
  SELECT *
  FROM cron.job
  WHERE jobname IN (
    'hashibot_binance_testnet_monitor_1m',
    'hashibot_morning_brief_0800',
    'hashibot_news_digest_1200',
    'hashibot_watchlist_patterns_1600',
    'hashibot_market_wrap_2000',
    'hashibot_test_morning_brief_1m',
    'hashibot_test_news_digest_1m',
    'hashibot_test_watchlist_patterns_1m',
    'hashibot_test_market_wrap_1m'
  )
), cfg AS (
  SELECT supabase_anon_key, cron_pg_token
  FROM public.scanner_config
  WHERE id = 1
)
SELECT
  jobname,
  command LIKE '%''Authorization''%' AS has_authorization,
  command LIKE '%''apikey''%' AS has_apikey,
  command LIKE '%''x-hashibot-cron-token''%' AS has_custom_token,
  command NOT LIKE '%Authorization'', ''Bearer '' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)%' AS authorization_is_not_cron_pg_token_expression,
  command NOT LIKE '%' || (SELECT cron_pg_token FROM cfg) || '%' AS command_does_not_inline_cron_pg_token_value
FROM target_jobs
ORDER BY jobname;
```

Expected for every row:

- `has_authorization = true`
- `has_apikey = true`
- `has_custom_token = true`
- `authorization_is_not_cron_pg_token_expression = true`
- `command_does_not_inline_cron_pg_token_value = true`

### 2. Verify pg_net responses after one minute

```sql
SELECT id, status_code, created, error_msg
FROM net._http_response
ORDER BY created DESC
LIMIT 30;
```

Expected: the rebuilt job calls should not return `401`.

### 3. Verify Edge Function invocations after one minute

Use Supabase Edge Function logs for:

- `telegram-orchestrator`
- `intelligence-engine`
- `binance-testnet-monitor`

Expected: invocations exist after the one-minute test jobs and monitor job fire.

### 4. Verify intelligence output rows

```sql
SELECT event_type, status, created_at
FROM public.intelligence_events
ORDER BY created_at DESC
LIMIT 20;

SELECT feed_type, status, created_at
FROM public.intelligence_feed_results
ORDER BY created_at DESC
LIMIT 20;
```

Expected: fresh rows exist after the one-minute intelligence jobs fire.

### 5. Verify Telegram deliveries for Free and VIP

```sql
SELECT channel, event_type, status, created_at
FROM public.telegram_deliveries
WHERE event_type IN ('morning_brief','news_digest','watchlist_pattern_update','market_wrap')
ORDER BY created_at DESC
LIMIT 40;
```

Expected: fresh intelligence deliveries include both Free and VIP routing rows.

## Live verification status from this environment

This repository environment does not expose Supabase database credentials or the Supabase CLI, so the migration could be authored and checked locally but not applied to live Supabase from here. Live verification must be completed by applying the migration to the project database and running the verification SQL above after at least one minute.

- CRON HEADERS FIXED: NO — migration authored, but live database application was not possible from this environment.
- INTELLIGENCE LIVE VERIFIED: NO — live Supabase access was not available from this environment.
- BINANCE MONITOR LIVE VERIFIED: NO — live Supabase access was not available from this environment.
