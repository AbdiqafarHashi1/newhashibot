/*
  HASHIBOT B5.1 — signal_id event-log repair + monitor cron auth hardening

  Part E depends on execution/monitor proof rows being attributable to the source
  signal and on pg_cron being able to authenticate to binance-testnet-monitor.
*/

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS cron_pg_token text,
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_job_name text;

UPDATE public.scanner_config
SET cron_pg_token = gen_random_uuid()::text
WHERE id = 1
  AND (cron_pg_token IS NULL OR btrim(cron_pg_token) = '');

UPDATE public.execution_event_logs AS eel
SET signal_id = eo.signal_id,
    symbol = COALESCE(NULLIF(eel.symbol, ''), eo.symbol)
FROM public.execution_orders AS eo
WHERE (eel.execution_order_id = eo.id OR eel.execution_id = eo.id)
  AND (eel.signal_id IS NULL OR eel.symbol = '');

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  monitor_ep text := project_url || '/functions/v1/binance-testnet-monitor';
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_binance_testnet_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_binance_testnet_monitor_1m',
    '*/1 * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
          ),
          body    := '{"source":"pg_cron","run_type":"binance_testnet_monitor"}'::jsonb
        ) AS request_id;
      $cron$,
      monitor_ep
    )
  );

  UPDATE public.scanner_config
  SET binance_monitor_cron_active = true,
      binance_monitor_cron_job_name = 'hashibot_binance_testnet_monitor_1m',
      updated_at = now()
  WHERE id = 1;
END $$;
