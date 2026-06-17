-- Execution symbol cache and proof controls for provider-tradable testnet universes.
CREATE TABLE IF NOT EXISTS public.provider_symbol_cache (
  provider text NOT NULL,
  symbol text NOT NULL,
  base_asset text,
  quote_asset text,
  status text NOT NULL,
  tick_size numeric,
  step_size numeric,
  min_qty numeric,
  min_notional numeric,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  raw_exchange_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, symbol)
);
CREATE INDEX IF NOT EXISTS idx_provider_symbol_cache_provider_status ON public.provider_symbol_cache(provider, status);

ALTER TABLE public.execution_provider_global_controls
  ADD COLUMN IF NOT EXISTS mirror_required_for_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS execute_supported_provider_only boolean NOT NULL DEFAULT true;

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS bybit_latest_successful_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_error text,
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_result jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Register Bybit testnet monitor every minute when project URL/token are present.
DO $$
DECLARE
  endpoint text := coalesce(current_setting('app.settings.supabase_url', true), current_setting('app.supabase_url', true), '');
  job record;
BEGIN
  IF endpoint = '' THEN
    RAISE NOTICE 'Skipping Bybit monitor cron registration: missing Supabase URL setting.';
    RETURN;
  END IF;
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_bybit_testnet_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'hashibot_bybit_testnet_monitor_1m',
    '*/1 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1),
          'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"source":"pg_cron","run_type":"bybit_testnet_monitor"}'::jsonb
      ) AS request_id;
    $cron$, endpoint || '/functions/v1/bybit-testnet-monitor')
  );
END $$;
