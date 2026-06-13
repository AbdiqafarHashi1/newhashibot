# Intelligence Cron URL End-to-End Fix

## 1. Root cause of `url = null`

The previous intelligence cron migration built the Edge Function URL from `current_setting('app.supabase_url', true) || '/functions/v1/telegram-orchestrator'`. In PostgreSQL, `current_setting(..., true)` returns `NULL` when the setting is absent. Concatenating `NULL` with the path returns `NULL`, so `net.http_post(url := NULL, ...)` attempted to insert a null URL into `net.http_request_queue`, violating the queue's not-null constraint.

## 2. Exact file/migration causing it

The bad URL construction was in `supabase/migrations/20260612170000_063_telegram_product_layer_router_intelligence.sql`, in the four cron schedules for:

- `hashibot_morning_brief_0800_eat`
- `hashibot_news_digest_1200_eat`
- `hashibot_watchlist_patterns_1600_eat`
- `hashibot_market_wrap_2000_eat`

Those jobs also used `x-scanner-cron-secret` from `current_setting('app.scanner_cron_secret', true)`, which can be unset in the database session and therefore was not aligned with the known working `scanner_config.cron_pg_token` bearer-token pattern.

## 3. Exact fix applied

Added migration `supabase/migrations/20260613120000_064_intelligence_cron_url_auth_test_mode.sql` that:

- Unschedules the four old `_eat` jobs, the four production target jobs, and any prior temporary test jobs.
- Recreates the four production jobs with a hardcoded, non-null orchestrator URL:
  `https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator`
- Uses `Authorization: Bearer <scanner_config.cron_pg_token>` plus `Content-Type: application/json` for every cron call.
- Adds temporary one-minute test jobs for immediate end-to-end verification.
- Adds `public.hashibot_disable_intelligence_test_crons()` as the cleanup helper for the temporary test jobs.

Updated `supabase/functions/telegram-orchestrator/index.ts` so the orchestrator accepts the same `scanner_config.cron_pg_token` bearer auth pattern already used by `scheduled-market-scanner` and `evaluate-signal-outcomes`. It also accepts the requested `watchlist_pattern` cron payload and maps it to the existing engine kind `watchlist_pattern_update` without changing the intelligence engine implementation.

## 4. Production cron jobs recreated

| Job | Schedule | Payload | Target URL |
| --- | --- | --- | --- |
| `hashibot_morning_brief_0800` | `0 5 * * *` (08:00 EAT) | `{"kind":"morning_brief"}` | `https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator` |
| `hashibot_news_digest_1200` | `0 9 * * *` (12:00 EAT) | `{"kind":"news_digest"}` | same |
| `hashibot_watchlist_patterns_1600` | `0 13 * * *` (16:00 EAT) | `{"kind":"watchlist_pattern"}` | same |
| `hashibot_market_wrap_2000` | `0 17 * * *` (20:00 EAT) | `{"kind":"market_wrap"}` | same |

## 5. Temporary test jobs/helper added

Temporary every-minute jobs added:

- `hashibot_test_morning_brief_1m`
- `hashibot_test_news_digest_1m`
- `hashibot_test_watchlist_patterns_1m`
- `hashibot_test_market_wrap_1m`

Cleanup helper:

```sql
select public.hashibot_disable_intelligence_test_crons();
```

## 6. Auth/header pattern used

Every production and temporary cron job sends:

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer " || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
}
```

The orchestrator now validates that bearer token against `public.scanner_config.cron_pg_token`, matching the existing scheduled scanner/outcome cron auth pattern.

## 7. End-to-end test results

Code-level verification completed in this environment. Live Supabase verification requires applying the migration to the remote database and waiting for one minute or manually running one of the generated `net.http_post` statements. No production Supabase database credentials were present in this workspace, so live queue/event/delivery rows could not be queried directly from here.

SQL verification to run after applying the migration:

```sql
-- Cron jobs exist and commands contain the non-null orchestrator URL.
select jobname, schedule, command
from cron.job
where jobname in (
  'hashibot_morning_brief_0800',
  'hashibot_news_digest_1200',
  'hashibot_watchlist_patterns_1600',
  'hashibot_market_wrap_2000',
  'hashibot_test_morning_brief_1m',
  'hashibot_test_news_digest_1m',
  'hashibot_test_watchlist_patterns_1m',
  'hashibot_test_market_wrap_1m'
)
order by jobname;

-- URL strings are present in all intelligence cron commands.
select jobname,
       command like '%https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator%' as has_orchestrator_url,
       command like '%Authorization%' as has_authorization_header,
       command like '%cron_pg_token%' as uses_cron_pg_token
from cron.job
where jobname like 'hashibot%brief%'
   or jobname like 'hashibot%news_digest%'
   or jobname like 'hashibot%watchlist%'
   or jobname like 'hashibot%market_wrap%';

-- net queue rows should have non-null URLs after the temporary jobs fire.
select id, method, url, headers, body, created
from net.http_request_queue
where url = 'https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator'
order by created desc
limit 20;

-- Latest intelligence events.
select event_id, event_type, module, status, created_at
from public.intelligence_events
order by created_at desc
limit 20;

-- Latest real feed results.
select event_id, feed_type, status, classification, source, freshness, error_message, created_at
from public.intelligence_feed_results
order by created_at desc
limit 50;

-- Latest Telegram delivery outcomes by channel.
select event_id, event_type, destination_channel, delivery_status, status, sent_at, created_at
from public.telegram_deliveries
where event_type in ('morning_brief', 'news_digest', 'watchlist_pattern_update', 'market_wrap')
order by created_at desc
limit 50;
```

## 8. Real feeds confirmed

The intelligence engine attempts real feeds for:

- Fear & Greed via Alternative.me or `FEAR_GREED_API_URL`
- BTC dominance via CoinGecko global data
- Binance USD-M funding
- Binance USD-M open interest
- Liquidations if `LIQUIDATIONS_API_URL` is configured
- News if `NEWS_API_URL` is configured
- Market breadth from stored candles

The existing engine stores unavailable/failed providers truthfully in `intelligence_feed_results`; no fake provider data was added.

## 9. Telegram delivery results

The orchestrator continues to route each intelligence output through the existing Telegram Router to `admin`, `free`, and `vip` channels. Delivery success/failure remains logged by the existing router in `telegram_deliveries`. Live delivery results should be confirmed with the SQL above after the temporary one-minute jobs run.

## 10. How to disable/remove test cron jobs

After verification, run:

```sql
select public.hashibot_disable_intelligence_test_crons();
```

Then verify removal:

```sql
select jobname
from cron.job
where jobname in (
  'hashibot_test_morning_brief_1m',
  'hashibot_test_news_digest_1m',
  'hashibot_test_watchlist_patterns_1m',
  'hashibot_test_market_wrap_1m'
);
```

The query should return zero rows.

## 11. Files changed

- `supabase/migrations/20260613120000_064_intelligence_cron_url_auth_test_mode.sql`
- `supabase/functions/telegram-orchestrator/index.ts`
- `reports/product/intelligence-cron-url-end-to-end-fix.md`

## 12. Tests run

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 13. Remaining risks

- The migration must be applied to the live Supabase database before production cron rows change.
- `scanner_config.cron_pg_token` must be populated in production; this is the existing cron token contract.
- Temporary one-minute jobs intentionally send real messages every minute until disabled. Run `select public.hashibot_disable_intelligence_test_crons();` immediately after observation.
- Remote verification of `net.http_request_queue`, `intelligence_events`, `intelligence_feed_results`, `telegram_deliveries`, and Control Room status requires production database access.
