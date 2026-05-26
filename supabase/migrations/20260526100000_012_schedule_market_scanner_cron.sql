/*
  Create 5-minute pg_cron job for scheduled-market-scanner.
  Idempotent: unschedules existing job by name first.

  REQUIRED SETTINGS (set as database GUCs before running this migration):
    - app.settings.supabase_url
    - one auth method:
        A) app.settings.service_role_key
        OR
        B) app.settings.scanner_cron_secret

  Example manual SQL (run in Supabase SQL editor):
    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<PROJECT-REF>.supabase.co';
    ALTER DATABASE postgres SET app.settings.scanner_cron_secret = '<LONG_RANDOM_SECRET>';
    -- Optional alternative auth instead of scanner_cron_secret:
    -- ALTER DATABASE postgres SET app.settings.service_role_key = '<SERVICE_ROLE_KEY>';

  Then reconnect session (or run in a new SQL editor tab) before applying migration.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id bigint;
  project_url text := current_setting('app.settings.supabase_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
  cron_secret text := current_setting('app.settings.scanner_cron_secret', true);
  endpoint text;
BEGIN
  IF project_url IS NULL OR project_url = '' THEN
    RAISE EXCEPTION 'Missing required setting: app.settings.supabase_url';
  END IF;

  IF (coalesce(service_key, '') = '' AND coalesce(cron_secret, '') = '') THEN
    RAISE EXCEPTION 'Missing auth setting: set app.settings.service_role_key or app.settings.scanner_cron_secret';
  END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m' LIMIT 1;
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;

  endpoint := project_url || '/functions/v1/scheduled-market-scanner';

  PERFORM cron.schedule(
    'hashibot_scheduled_market_scanner_5m',
    '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_strip_nulls(jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', CASE WHEN %L <> '' THEN 'Bearer ' || %L ELSE NULL END,
          'x-scanner-cron-secret', CASE WHEN %L <> '' THEN %L ELSE NULL END
        )),
        body := '{"source":"pg_cron"}'::jsonb
      );
    $f$, endpoint, coalesce(service_key,''), coalesce(service_key,''), coalesce(cron_secret,''), coalesce(cron_secret,''))
  );
END $$;
