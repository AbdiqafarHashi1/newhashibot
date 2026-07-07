# HashiBot V1 Final Recovery Deployment

This runbook keeps the V1 application as the production product and deploys backend discipline for controlled storage, compact egress, scanner safety, Telegram safety, Binance/Bybit protection, and MT5/HashiBridge readiness.

## 1. SQL migration order

Run all existing migrations through `088`, then run:

1. `supabase/migrations/20260707090000_089_v1_platform_retention_backend.sql`
2. `supabase/migrations/20260707100000_090_v1_final_recovery_backend.sql`

Verify:

```sql
select public.hashibot_retention_report();
select public.hashibot_symbol_universe_report();
select public.hashibot_execution_summary();
select public.hashibot_telegram_status();
```

## 2. Edge Functions changed

Deploy the scanner after this pass because compact scanner persistence flags are now read in `market-scanner`:

1. `market-scanner`
2. `scheduled-market-scanner`
3. `telegram-send`
4. `telegram-test`
5. `telegram-orchestrator`
6. `binance-testnet-execution`
7. `binance-testnet-monitor`
8. `bybit-testnet-monitor`
9. `admin-scheduler-action`
10. `admin-operator-action`

## 3. Required secrets

Keep all secrets environment-managed. Do not hardcode values.

Required existing secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` where required by cron wrappers
- `SCANNER_CRON_SECRET` / configured cron token
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_ID`
- `TELEGRAM_FREE_CHAT_ID`
- `TELEGRAM_VIP_CHAT_ID`
- Binance testnet/API secrets used by existing functions
- Bybit demo/testnet/API secrets used by existing functions

MT5/HashiBridge readiness secrets, when enabling later:

- `HASHIBRIDGE_SHARED_SECRET`
- `HASHIBRIDGE_BASE_URL` or bridge-specific endpoint secret
- MT5 personal/prop account references stored outside source code

## 4. Feature flags

Set these production-safe defaults before scanner deployment:

```bash
HASHIBOT_DISABLE_CANDLE_PERSISTENCE=true
HASHIBOT_DISABLE_INDICATOR_SNAPSHOTS=true
HASHIBOT_COMPACT_SCANNER_LOGS=true
HASHIBOT_COMPACT_PROVIDER_LOGS=true
HASHIBOT_COMPACT_TELEGRAM_LOGS=true
HASHIBOT_COMPACT_EXECUTION_LOGS=true
```

MT5 execution must stay disabled until validated:

```bash
HASHIBOT_MT5_PERSONAL_ENABLED=false
HASHIBOT_MT5_PROP_ENABLED=false
```

## 5. Cron adjustments

Reduce/noise-check cron jobs before cleanup:

- Keep market scanner on the intended production interval, not per-minute test loops.
- Keep Binance/Bybit monitor cadence only for enabled testnet/demo providers.
- Disable intelligence/test crons that run every minute.
- Do not schedule candle-count dashboards or warehouse-size auto-refresh jobs.

## 6. Cleanup dry run first

Run dry-run from SQL or the Admin Retention page:

```sql
select public.hashibot_cleanup_noncritical(false, true);
```

Review matched rows and archive flags. Confirm protected tables are absent:

- users/profiles
- packages
- subscriptions/customer_subscriptions
- active signals
- active trades/trade truth
- provider credentials/settings
- Telegram links
- strategy configs
- critical audit records

## 7. Cleanup execute

After reviewing dry-run output:

```sql
select public.hashibot_cleanup_noncritical(true, true);
```

Then verify storage reduction:

```sql
select public.hashibot_retention_report();
```

## 8. Scanner test

1. Confirm `crypto_core` is enabled and reduced.
2. Confirm `crypto_extended`, `forex_core`, and `forex_extended` are disabled by default.
3. Trigger one manual scanner run.
4. Confirm valid customer-facing signals still persist.
5. Confirm candles and indicator snapshots do not grow when flags are true.

## 9. Telegram test

1. Open Telegram Test admin page.
2. Send Admin/Ops test.
3. Verify Free and VIP channel configuration without exposing secrets.
4. Confirm no duplicate delivery rows for the same signal/channel/type.
5. Confirm failures appear in `public.hashibot_telegram_status()`.

## 10. Binance testnet test

1. Keep live execution disabled.
2. Run Binance testnet validation.
3. Confirm lifecycle reaches `FILLED` then `PROTECTED`, or records `RECOVERY_REQUIRED`.
4. Confirm missing SL/TP appears in protection events.

## 11. Bybit demo/testnet test

1. Keep live execution disabled.
2. Run Bybit demo/testnet validation only.
3. Confirm provider-neutral lifecycle states match Binance.
4. Confirm unprotected Bybit positions are escalated and visible.

## 12. MT5 bridge offline readiness check

1. Confirm `hashibridge_instances` exists.
2. Confirm no bridge is shown as online unless heartbeat exists.
3. Confirm `execution_enabled=false` for MT5 records.
4. Confirm command queue can hold bridge commands but does not execute without validation.

## 13. Rollback plan

1. Disable scanner cron.
2. Disable execution monitor crons.
3. Set compact flags to true if not already set.
4. Restore frontend to previous build if admin pages misbehave.
5. Do not delete archive rows until retention archive review is complete.
6. If SQL rollback is required, disable newly added policies/functions first, then drop only `hashibot_*` recovery objects added by migrations `089` and `090` after confirming no production workflow depends on them.
