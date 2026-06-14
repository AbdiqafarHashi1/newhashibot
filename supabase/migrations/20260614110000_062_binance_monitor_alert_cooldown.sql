-- Store the last Binance monitor admin alert fingerprint/time so the 1-minute
-- monitor can keep running without sending the same degraded Telegram alert
-- every minute.
ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS latest_monitor_alert_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.execution_settings.latest_monitor_alert_state IS
  'Last Binance monitor admin alert fingerprint/time used for degraded/critical cooldown and healthy recovery suppression.';
