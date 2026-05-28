# HashiBot Crypto-Only MVP Deploy Checklist

## 1. Branch / Phase Summary

This checklist covers the final merge/deploy for the crypto-only Signal Mode MVP after:

- Phase 1A: audit / truth check.
- Phase 1B: truthful scheduler proof and scheduled-wrapper hardening.
- Phase 1C: crypto-only market gating; forex sidelined but not deleted.
- Phase 1D: Telegram initial signal auto-send proof and idempotency.
- Phase 1E: automatic outcome tracking and outcome Telegram updates.
- Phase 1F: final UI truth cleanup and deploy checklist.

Current MVP target:

- Crypto scanning is enabled through Binance.
- Forex scanning/outcome tracking is disabled for MVP and reserved for the future MT5/OANDA phase.
- Manual and scheduled scans use the same `market-scanner` pipeline.
- Scheduled scans call outcome tracking after scan success.
- Telegram initial signal and outcome update deliveries are stored in `telegram_deliveries`.

## 2. Files Changed by Area

### Frontend UI

- `src/pages/admin/ControlRoom.tsx`
- `src/pages/admin/ProviderHealth.tsx`
- `src/pages/admin/ScannerStatus.tsx`
- `src/pages/admin/SchedulerGuide.tsx`
- `src/pages/admin/SignalsManager.tsx`
- `src/pages/admin/OutcomeTracking.tsx`
- `src/pages/admin/TelegramLogs.tsx`
- `src/components/ui/Badge.tsx`

### Hooks / Types

- `src/hooks/useAdminLiveState.ts`
- `src/lib/types.ts`

### Supabase Edge Functions

- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/scheduled-market-scanner/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/functions/telegram-send/index.ts`
- `supabase/functions/admin-bootstrap/index.ts`

### Docs

- `docs/CRYPTO_ONLY_MVP_DEPLOY_CHECKLIST.md`

## 3. SQL Migrations Needed

No new SQL migration was added in Phase 1F.

Confirm these existing migrations have already been applied before final deploy:

- `supabase/migrations/20260526082022_009_scanner_config_phase5a_fields.sql`
- `supabase/migrations/20260527073425_013_signal_updates_column_fix.sql`

The outcome tracker expects `signal_updates.previous_status`, `signal_updates.reason`, and `signal_updates.telegram_sent` to exist. The scanner proof UI expects scanner run Telegram counters from the existing scanner config Phase 5A migration.

## 4. Supabase Edge Functions to Replace / Deploy

Deploy these together after merge:

1. `market-scanner`
2. `scheduled-market-scanner`
3. `evaluate-signal-outcomes`
4. `telegram-send`
5. `admin-bootstrap` if your currently deployed version is older than this branch

Recommended order:

1. `admin-bootstrap` if needed
2. `telegram-send`
3. `evaluate-signal-outcomes`
4. `market-scanner`
5. `scheduled-market-scanner`

## 5. Supabase Secrets to Keep

Keep these for the crypto-only MVP:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIGNAL_ENABLE_CRYPTO=true`
- `SIGNAL_ENABLE_FOREX=false`
- `CRYPTO_DATA_PROVIDER=binance`
- `TELEGRAM_ENABLED=true`
- `ENABLE_SIGNAL_MODE_OUTPUT=true`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHANNEL_ID` or `TELEGRAM_CHAT_ID`
- `SCANNER_CRON_SECRET` if pg_cron uses the `x-scanner-cron-secret` header

## 6. Supabase Secrets to Ignore for Now, Not Delete

These are ignored while `SIGNAL_ENABLE_FOREX=false`. Do not delete them if you plan to restore forex later:

- `FOREX_DATA_PROVIDER`
- `FOREX_PROVIDER_FALLBACKS`
- `FOREX_DEMO_FALLBACK`
- `FINNHUB_API_KEY`
- `TWELVEDATA_API_KEY`
- `FOREX_DATA_API_KEY`
- `MT5_BRIDGE_BASE_URL`
- `MT5_BRIDGE_SECRET`

## 7. Bolt / Frontend Env Vars to Keep

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never expose service-role keys or Telegram bot tokens in frontend env vars.

## 8. Publish Frontend Step

After deploying the Edge Functions, publish the frontend from this merged branch so the admin UI matches the function response shape.

## 9. Post-Deploy Tests

Run these in order:

1. Provider Health loads without a black screen.
2. Provider Health shows:
   - Current Runtime Mode: Crypto-only
   - Crypto Provider: Binance
   - Forex: Disabled for MVP
   - Runtime Requirements booleans only, no secrets
3. Control Room shows crypto-only mode, Binance provider, forex disabled, and truthful cron status.
4. Scheduler Guide shows cron as active only when real scheduled proof exists, and explains manual wrapper testing.
5. Run a manual scan from Control Room.
6. Confirm latest `scanner_runs` row is crypto-only and does not contain new forex provider errors.
7. Confirm Telegram initial signal sent/skipped/failed proof is visible in Control Room, Signal Manager, and Telegram Logs.
8. Click Scheduler Guide → Run Scheduled Scan Now.
9. Confirm wrapper response includes:
   - `run_type: scheduled`
   - `telegram_sent`
   - `telegram_skipped`
   - `telegram_failed`
   - `outcome_checked`
   - `outcomes_updated`
   - `outcome_telegram_sent`
   - `outcome_telegram_skipped`
   - `outcome_telegram_failed`
10. Wait 5–6 minutes for real pg_cron.
11. Confirm a new `scanner_runs.run_type='scheduled'` row appears.
12. Open Outcome Tracking and run a manual outcome check.
13. Confirm `signal_updates` rows appear when signals change status.
14. Confirm `telegram_deliveries` rows with `delivery_type like 'outcome_%'` appear for TP1/TP2/SL/expired updates.
15. Confirm historical forex provider rows are shown as historical, not active blockers.

## 10. SQL Checks After Deploy

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'hashibot_scheduled_market_scanner_5m';
```

```sql
select id, run_type, status, started_at, finished_at, telegram_sent_count, telegram_blocked_count, error_message
from scanner_runs
order by started_at desc
limit 20;
```

```sql
select id, signal_id, old_status, previous_status, new_status, reason, telegram_sent, created_at
from signal_updates
order by created_at desc
limit 20;
```

```sql
select id, signal_id, delivery_type, chat_id, status, error_message, created_at
from telegram_deliveries
order by created_at desc
limit 50;
```

```sql
select id, provider_name, market_type, status, data_source_label, error_message, updated_at
from provider_status
order by updated_at desc;
```

## 11. Rollback Notes

### Disable Auto Telegram

Set either:

- Supabase secret `TELEGRAM_ENABLED=false`, or
- `scanner_config.auto_send_telegram=false`

This stops new auto sends. Existing delivery rows remain historical proof.

### Disable Scheduler

Set:

```sql
update scanner_config
set schedule_enabled = false
where id = 1;
```

Optionally disable the pg_cron job in Supabase if needed.

### Keep Crypto Scan Only

Keep:

- `SIGNAL_ENABLE_CRYPTO=true`
- `SIGNAL_ENABLE_FOREX=false`
- `CRYPTO_DATA_PROVIDER=binance`

Do not delete forex code or secrets. They remain dormant for the future MT5/OANDA phase.
