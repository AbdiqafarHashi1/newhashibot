# Intelligence Cron Auth Root Fix

## Root cause

The intelligence cron URL was correct and pg_cron jobs were firing, but the jobs sent `scanner_config.cron_pg_token` in the standard `Authorization: Bearer ...` header. Supabase Edge Function gateway treats `Authorization` as a JWT-bearing header when JWT verification is enabled. Because `cron_pg_token` is an internal random token rather than a Supabase JWT, the gateway can reject the request with `401 UNAUTHORIZED_INVALID_JWT_FORMAT` before `telegram-orchestrator` code runs.

## Investigation results

1. **JWT verification disabled state**: the repository did not preserve a deploy-time `--no-verify-jwt` flag for `telegram-orchestrator` or `intelligence-engine` in the GitHub Actions workflow, so dashboard toggle/redeploy attempts could be overwritten by CI deploys.
2. **Supabase CLI deploy support**: Supabase CLI deploy supports function-level JWT verification control via `--no-verify-jwt`; CI now passes that flag for both intelligence functions.
3. **GitHub Action deploy command**: CI previously deployed `telegram-orchestrator` and `intelligence-engine` without `--no-verify-jwt`; this is now fixed.
4. **config.toml/function config override**: no `supabase/config.toml` function-specific JWT override is present in this repository, so the repo-level deploy path was the actionable source of configuration drift.
5. **Malformed Authorization header**: intelligence pg_cron commands used `Authorization: Bearer <scanner_config.cron_pg_token>`, where the token is not a Supabase JWT.
6. **Gateway interception**: the observed `UNAUTHORIZED_INVALID_JWT_FORMAT` indicates Supabase gateway rejected the Authorization header before custom function authorization logic could validate `cron_pg_token`.
7. **Required custom header**: cron calls now send `x-hashibot-cron-token: <scanner_config.cron_pg_token>` and omit Authorization for the custom cron token.

## Code changes

- `telegram-orchestrator` now accepts `x-hashibot-cron-token` first, validates it against `scanner_config.cron_pg_token`, and retains optional fallback support for service-role/admin JWT and legacy bearer cron token if the request reaches function code.
- CORS allowed headers for both intelligence functions now include `x-hashibot-cron-token`.
- GitHub Actions now deploys `telegram-orchestrator` and `intelligence-engine` with `--no-verify-jwt`.
- Local deploy script now also includes `--no-verify-jwt` for both intelligence functions.
- New migration rebuilds the eight required intelligence cron jobs with `x-hashibot-cron-token` instead of `Authorization`.

## Updated cron jobs

The migration rebuilds all required jobs against:

`https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator`

with headers:

- `Content-Type: application/json`
- `x-hashibot-cron-token: <scanner_config.cron_pg_token>`

Jobs updated:

- `hashibot_morning_brief_0800`
- `hashibot_news_digest_1200`
- `hashibot_watchlist_patterns_1600`
- `hashibot_market_wrap_2000`
- `hashibot_test_morning_brief_1m`
- `hashibot_test_news_digest_1m`
- `hashibot_test_watchlist_patterns_1m`
- `hashibot_test_market_wrap_1m`

## Verification SQL

The migration includes verification SQL to show:

1. Cron commands contain the non-null orchestrator URL.
2. Cron commands contain `x-hashibot-cron-token`.
3. Latest `net._http_response` status is no longer 401 after updated cron execution.
4. `intelligence_events` has new rows.
5. `intelligence_feed_results` has new rows.
6. `telegram_deliveries` includes Free + VIP intelligence rows.

## Out of scope / untouched

This fix intentionally does not modify intelligence calculations, Telegram routing rules, scanner logic, Binance logic, execution logic, monitor logic, strategy logic, Forex, or MT5 behavior.

```sql
-- 1 and 2. Show cron commands contain the URL and custom header.
SELECT jobname,
       command LIKE '%https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator%' AS has_url,
       command LIKE '%x-hashibot-cron-token%' AS has_custom_header
FROM cron.job
WHERE jobname IN ('hashibot_morning_brief_0800','hashibot_news_digest_1200','hashibot_watchlist_patterns_1600','hashibot_market_wrap_2000','hashibot_test_morning_brief_1m','hashibot_test_news_digest_1m','hashibot_test_watchlist_patterns_1m','hashibot_test_market_wrap_1m')
ORDER BY jobname;

-- 3. Show latest pg_net responses are no longer 401 after updated cron execution.
SELECT id, status_code, created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- 4. Show intelligence_events has new rows.
SELECT event_type, status, created_at
FROM public.intelligence_events
ORDER BY created_at DESC
LIMIT 10;

-- 5. Show intelligence_feed_results has new rows.
SELECT feed_type, status, created_at
FROM public.intelligence_feed_results
ORDER BY created_at DESC
LIMIT 10;

-- 6. Show telegram_deliveries has Free + VIP intelligence rows.
SELECT channel, event_type, status, created_at
FROM public.telegram_deliveries
WHERE event_type IN ('morning_brief','news_digest','watchlist_pattern_update','market_wrap')
ORDER BY created_at DESC
LIMIT 20;
```
