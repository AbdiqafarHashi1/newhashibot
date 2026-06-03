/*
  # Fix cron authentication: cron_pg_token column + rebuild cron jobs

  ## Problem
  Migration 035 registered both pg_cron jobs with `x-scanner-cron-secret: ''` because
  `current_setting('app.settings.scanner_cron_secret')` returned NULL on hosted Supabase
  (the GUC was never set). Both Edge Functions reject empty secrets with 403.
  Every cron fire since 2026-06-03 ~19:45 has returned 403 — scanner has not run.

  ## Fix
  1. Add `cron_pg_token` (text) to `scanner_config`. A UUID is generated once and stored.
  2. Rebuild both cron jobs so their `net.http_post` headers use:
       `'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)`
     The subquery is embedded in the job's SQL string, so pg_cron evaluates it dynamically
     at every fire — no secret needs to be passed at registration time.
  3. Update `scanner_config.cron_job_active = true` and clear the empty cron_job_name note.

  ## Security
  The `cron_pg_token` is a random UUID visible only inside the Postgres instance.
  Edge Functions validate it by querying `scanner_config` with the service_role key.
  This is equivalent security to a shared secret, scoped to the DB boundary.

  ## Affected tables
  - `public.scanner_config`: new column `cron_pg_token text`

  ## Cron jobs rebuilt
  - `hashibot_scheduled_market_scanner_5m`  → uses dynamic cron_pg_token
  - `hashibot_evaluate_signal_outcomes_5m`  → uses dynamic cron_pg_token
*/

-- 1. Add cron_pg_token column
ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS cron_pg_token text;

-- 2. Generate token for row id = 1 if not already set
UPDATE public.scanner_config
SET cron_pg_token = gen_random_uuid()::text
WHERE id = 1 AND cron_pg_token IS NULL;

-- 3. Rebuild cron jobs
DO $$
DECLARE
  project_url  CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  scanner_ep   text;
  outcomes_ep  text;
  job          record;
BEGIN
  scanner_ep  := project_url || '/functions/v1/scheduled-market-scanner';
  outcomes_ep := project_url || '/functions/v1/evaluate-signal-outcomes';

  -- Remove stale scanner cron
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  -- Remove stale outcome cron
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_evaluate_signal_outcomes_5m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  -- Register scanner cron — Authorization token is read dynamically from scanner_config
  PERFORM cron.schedule(
    'hashibot_scheduled_market_scanner_5m',
    '*/5 * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
          ),
          body    := '{"source":"pg_cron","run_type":"scheduled","market_mode":"crypto_only"}'::jsonb
        ) AS request_id;
      $sql$,
      scanner_ep
    )
  );

  -- Register outcome cron — same dynamic token
  PERFORM cron.schedule(
    'hashibot_evaluate_signal_outcomes_5m',
    '*/5 * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
          ),
          body    := '{"source":"pg_cron","run_type":"scheduled"}'::jsonb
        ) AS request_id;
      $sql$,
      outcomes_ep
    )
  );

  UPDATE public.scanner_config
  SET
    cron_job_active = true,
    cron_job_name   = 'hashibot_scheduled_market_scanner_5m',
    updated_at      = now()
  WHERE id = 1;

  RAISE NOTICE 'cron jobs rebuilt with dynamic cron_pg_token auth: % | %', scanner_ep, outcomes_ep;
END $$;
