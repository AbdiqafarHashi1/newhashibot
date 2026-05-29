/*
  Repair HashiBot scheduled scanner cron registration.

  Why this exists after 012:
    - pg_cron reports success when net.http_post successfully queues a request;
      that does not prove the Edge Function completed or inserted scanner_runs.
    - Re-running this migration unschedules every duplicate/stale job with the
      intended name and registers exactly one 5-minute job pointed at the
      scheduled-market-scanner wrapper with scanner-secret auth.

  Required database GUCs:
    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<PROJECT-REF>.supabase.co';
    ALTER DATABASE postgres SET app.settings.scanner_cron_secret = '<SCANNER_CRON_SECRET>';

  Run this migration in a fresh SQL session after those settings are present.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS telegram_failed_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS market_mode text;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_skipped_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS outcome_checked boolean;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS outcomes_updated integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS outcome_telegram_sent integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS outcome_telegram_skipped integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS outcome_telegram_failed integer NOT NULL DEFAULT 0;

DO $$
DECLARE
  job record;
  project_url text := current_setting('app.settings.supabase_url', true);
  cron_secret text := current_setting('app.settings.scanner_cron_secret', true);
  endpoint text;
BEGIN
  IF coalesce(project_url, '') = '' THEN
    RAISE EXCEPTION 'Missing required setting: app.settings.supabase_url';
  END IF;

  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Missing auth setting: app.settings.scanner_cron_secret';
  END IF;

  FOR job IN
    SELECT jobid FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m'
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  endpoint := rtrim(project_url, '/') || '/functions/v1/scheduled-market-scanner';

  PERFORM cron.schedule(
    'hashibot_scheduled_market_scanner_5m',
    '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scanner-cron-secret', %L
        ),
        body := '{"source":"pg_cron","run_type":"scheduled","market_mode":"crypto_only"}'::jsonb
      ) AS request_id;
    $f$, endpoint, cron_secret)
  );

  UPDATE public.scanner_config
  SET cron_job_active = true,
      cron_job_name = 'hashibot_scheduled_market_scanner_5m',
      schedule_enabled = coalesce(schedule_enabled, true),
      updated_at = now()
  WHERE id = 1;
END $$;
