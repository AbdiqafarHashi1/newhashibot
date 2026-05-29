/*
  Create 5-minute pg_cron job for scheduled-market-scanner.
  Idempotent: unschedules existing job by name first.

  TRUTH RULES:
    - pg_cron must POST to https://<project-ref>.supabase.co/functions/v1/scheduled-market-scanner.
    - pg_cron must include Content-Type: application/json and x-scanner-cron-secret.
    - pg_cron must not call market-scanner directly for the MVP automatic path.
    - Fresh scanner_runs.run_type='scheduled' rows are the primary proof of real automation.
    - net._http_response success and cron.job_run_details success are secondary diagnostics.
    - scanner_config.cron_job_active=true is configuration only, not proof.

  REQUIRED SETTINGS (set as database GUCs before running this migration):
    - app.settings.supabase_url
    - app.settings.scanner_cron_secret

  Example manual SQL (run in Supabase SQL editor):
    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<PROJECT-REF>.supabase.co';
    ALTER DATABASE postgres SET app.settings.scanner_cron_secret = '<SCANNER_CRON_SECRET>';

  Then reconnect session (or run in a new SQL editor tab) before applying migration.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id bigint;
  project_url text := current_setting('app.settings.supabase_url', true);
  cron_secret text := current_setting('app.settings.scanner_cron_secret', true);
  endpoint text;
BEGIN
  IF project_url IS NULL OR project_url = '' THEN
    RAISE EXCEPTION 'Missing required setting: app.settings.supabase_url';
  END IF;

  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Missing auth setting: set app.settings.scanner_cron_secret';
  END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m' LIMIT 1;
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;

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
END $$;
