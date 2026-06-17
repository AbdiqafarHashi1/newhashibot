-- X-G.2 automatic provider monitor scheduler proof.
-- Keeps provider results separated and keeps live trading disabled.

ALTER TABLE public.execution_monitor_heartbeats
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.execution_monitor_schedules (
  provider text NOT NULL,
  environment text NOT NULL,
  job_name text PRIMARY KEY,
  cron_expression text,
  function_name text NOT NULL,
  scheduled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  adapter_status text NOT NULL DEFAULT 'available',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS bybit_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bybit_monitor_cron_job_name text;

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  bybit_monitor_url CONSTANT text := project_url || '/functions/v1/bybit-testnet-monitor';
  job record;
BEGIN
  INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, status, adapter_status, updated_at)
  VALUES
    ('binance', 'testnet', 'hashibot_binance_testnet_monitor_1m', '*/1 * * * *', 'binance-testnet-monitor', true, 'scheduled_existing', 'available', now()),
    ('mt5', 'personal', 'hashibot_mt5_personal_monitor_pending', null, 'mt5-personal-monitor', false, 'adapter_pending', 'adapter_pending', now()),
    ('mt5', 'prop', 'hashibot_mt5_prop_monitor_pending', null, 'mt5-prop-monitor', false, 'adapter_pending', 'adapter_pending', now())
  ON CONFLICT (job_name) DO UPDATE SET
    scheduled = EXCLUDED.scheduled,
    status = EXCLUDED.status,
    adapter_status = EXCLUDED.adapter_status,
    updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, status, adapter_status, updated_at)
    VALUES ('bybit', 'demo', 'hashibot_bybit_demo_monitor_1m', '*/1 * * * *', 'bybit-testnet-monitor', false, 'pg_cron_missing', 'available', now())
    ON CONFLICT (job_name) DO UPDATE SET scheduled = false, status = 'pg_cron_missing', updated_at = now();
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, status, adapter_status, updated_at)
    VALUES ('bybit', 'demo', 'hashibot_bybit_demo_monitor_1m', '*/1 * * * *', 'bybit-testnet-monitor', false, 'pg_net_missing', 'available', now())
    ON CONFLICT (job_name) DO UPDATE SET scheduled = false, status = 'pg_net_missing', updated_at = now();
    RETURN;
  END IF;

  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_bybit_demo_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_bybit_demo_monitor_1m',
    '*/1 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),
          'Authorization', 'Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"source":"pg_cron","run_type":"bybit_demo_monitor"}'::jsonb
      ) AS request_id;
    $cron$, bybit_monitor_url)
  );

  INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, status, adapter_status, updated_at)
  VALUES ('bybit', 'demo', 'hashibot_bybit_demo_monitor_1m', '*/1 * * * *', 'bybit-testnet-monitor', true, 'scheduled', 'available', now())
  ON CONFLICT (job_name) DO UPDATE SET scheduled = true, status = 'scheduled', cron_expression = EXCLUDED.cron_expression, updated_at = now();

  UPDATE public.scanner_config
  SET bybit_monitor_cron_active = true,
      bybit_monitor_cron_job_name = 'hashibot_bybit_demo_monitor_1m'
  WHERE id = 1;
END $$;

NOTIFY pgrst, 'reload schema';
