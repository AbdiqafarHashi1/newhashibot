/*
  HASHIBOT X-E provider-neutral routing, Bybit always-on monitor proof, dynamic scanner universe.
  Safety: keeps live_trading_enabled guarded false and testnet-only provider defaults.
*/

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS max_symbols_per_scan integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS min_24h_volume numeric NOT NULL DEFAULT 10000000,
  ADD COLUMN IF NOT EXISTS min_liquidity numeric NOT NULL DEFAULT 10000000,
  ADD COLUMN IF NOT EXISTS exclude_symbols text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS include_symbols text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dynamic_binance_universe_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bybit_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bybit_monitor_cron_job_name text;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS execution_group_id uuid,
  ADD COLUMN IF NOT EXISTS symbol_base text,
  ADD COLUMN IF NOT EXISTS provider_symbol text,
  ADD COLUMN IF NOT EXISTS provider_lifecycle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_comparison jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS execution_orders_execution_group_idx ON public.execution_orders(execution_group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_orders_provider_lifecycle_idx ON public.execution_orders(execution_provider, exchange, status, created_at DESC);

INSERT INTO public.execution_provider_controls (provider_name, enabled, entry_enabled, monitor_enabled, protection_recovery_enabled, recovery_enabled, status, metadata, updated_at)
VALUES
  ('binance', true, true, true, true, true, 'configured', '{"role":"execution_provider","environment":"testnet"}'::jsonb, now()),
  ('bybit', true, false, true, true, true, 'monitor_pending', '{"role":"execution_provider","environment":"testnet","entry_default":"disabled_until_operator_enables"}'::jsonb, now()),
  ('mt5', false, false, false, false, false, 'placeholder', '{"role":"future_execution_provider","entry_default":"disabled"}'::jsonb, now())
ON CONFLICT (provider_name) DO UPDATE SET
  monitor_enabled = EXCLUDED.monitor_enabled,
  protection_recovery_enabled = EXCLUDED.protection_recovery_enabled,
  recovery_enabled = EXCLUDED.recovery_enabled,
  updated_at = now();

DO $$
DECLARE
  project_url text := current_setting('app.settings.supabase_url', true);
  monitor_ep text;
  job record;
BEGIN
  IF project_url IS NULL OR project_url = '' THEN
    SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  END IF;
  IF project_url IS NULL OR project_url = '' THEN
    RETURN;
  END IF;
  monitor_ep := project_url || '/functions/v1/bybit-testnet-monitor';
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_bybit_testnet_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'hashibot_bybit_testnet_monitor_1m',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"source":"pg_cron","run_type":"bybit_testnet_monitor"}'::jsonb
      );
    $cmd$, monitor_ep)
  );
  UPDATE public.scanner_config SET bybit_monitor_cron_active = true, bybit_monitor_cron_job_name = 'hashibot_bybit_testnet_monitor_1m' WHERE id = 1;
END $$;

UPDATE public.execution_settings SET live_trading_enabled = false WHERE id = 1;
