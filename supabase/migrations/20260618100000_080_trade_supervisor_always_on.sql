-- X-G.7 always-on trade supervisor for Binance testnet and Bybit demo.
-- Supervisor is exchange-truth-first, repair-only, and live trading remains disabled by function governor.

ALTER TABLE public.trade_management_truth
  ADD COLUMN IF NOT EXISTS profit_lock_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_lock_reason text,
  ADD COLUMN IF NOT EXISTS next_lock_check_at timestamptz;

ALTER TABLE public.execution_monitor_schedules
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success boolean,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS trade_supervisor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_supervisor_cron_job_name text,
  ADD COLUMN IF NOT EXISTS trade_supervisor_interval_minutes integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trade_supervisor_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS binance_supervisor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bybit_supervisor_enabled boolean NOT NULL DEFAULT true;

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  supervisor_url CONSTANT text := project_url || '/functions/v1/binance-testnet-execution';
  job record;
BEGIN
  INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, status, adapter_status, updated_at)
  VALUES
    ('binance', 'testnet', 'hashibot_trade_supervisor_1m_binance', '*/1 * * * *', 'binance-testnet-execution:run_trade_supervisor_cycle', true, 'scheduled', 'available', now()),
    ('bybit', 'demo', 'hashibot_trade_supervisor_1m_bybit', '*/1 * * * *', 'binance-testnet-execution:run_trade_supervisor_cycle', true, 'scheduled', 'available', now())
  ON CONFLICT (job_name) DO UPDATE SET
    cron_expression = EXCLUDED.cron_expression,
    function_name = EXCLUDED.function_name,
    scheduled = EXCLUDED.scheduled,
    status = EXCLUDED.status,
    adapter_status = EXCLUDED.adapter_status,
    updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    UPDATE public.execution_monitor_schedules
      SET scheduled = false,
          status = 'pg_cron_or_pg_net_missing',
          updated_at = now()
      WHERE job_name IN ('hashibot_trade_supervisor_1m_binance', 'hashibot_trade_supervisor_1m_bybit');
    RETURN;
  END IF;

  FOR job IN SELECT jobid FROM cron.job WHERE jobname IN ('hashibot_trade_supervisor_1m_binance', 'hashibot_trade_supervisor_1m_bybit') LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_trade_supervisor_1m_binance',
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
        body := '{"source":"pg_cron","action":"run_trade_supervisor_cycle","provider":"binance"}'::jsonb
      ) AS request_id;
    $cron$, supervisor_url)
  );

  PERFORM cron.schedule(
    'hashibot_trade_supervisor_1m_bybit',
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
        body := '{"source":"pg_cron","action":"run_trade_supervisor_cycle","provider":"bybit"}'::jsonb
      ) AS request_id;
    $cron$, supervisor_url)
  );

  UPDATE public.scanner_config
  SET trade_supervisor_cron_active = true,
      trade_supervisor_cron_job_name = 'hashibot_trade_supervisor_1m_binance,hashibot_trade_supervisor_1m_bybit',
      trade_supervisor_interval_minutes = 1,
      binance_supervisor_enabled = true,
      bybit_supervisor_enabled = true
  WHERE id = 1;
END $$;

NOTIFY pgrst, 'reload schema';
