# Runtime Fix Summary (Phase 2)

## What was fixed
- Scheduled scanner now proxies to `market-scanner` so both manual/scheduled use the same pipeline.
- `market-scanner` now accepts `run_type_override` and supports service-role scheduled invocation.
- Provider Health and Control Room now treat `provider_status.data_source_label` as forex truth.
- `evaluate-signal-outcomes` is now mutating: updates `signals.status` and writes `signal_updates` with idempotency.
- `telegram-send` now blocks duplicate delivery per `signal_id + delivery_type`.

## Remaining deployment steps
- Ensure Supabase Edge secrets are set: `TWELVEDATA_API_KEY` or `FOREX_DATA_API_KEY`, `FOREX_DATA_PROVIDER`, `FOREX_DEMO_FALLBACK`, `TELEGRAM_BOT_TOKEN`.
- Ensure pg_cron job calls `scheduled-market-scanner` endpoint with service role key.
- If needed, add DB migration columns for new scan metrics before production rollout.
