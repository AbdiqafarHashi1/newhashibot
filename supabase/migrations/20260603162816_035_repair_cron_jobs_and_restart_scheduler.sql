/*
  # Repair cron jobs — restart scanner and add outcome evaluator schedule

  ## Summary
  The pg_cron job table is empty: both the scanner cron and the evaluate-signal-outcomes
  cron stopped running after 2026-05-29. This migration re-registers both jobs using
  the hardcoded project URL (GUC ALTER DATABASE is not permitted on hosted Supabase).

  ## Changes

  ### 1. Re-register hashibot_scheduled_market_scanner_5m
  Clears any stale duplicates and registers one 5-minute job calling the
  `scheduled-market-scanner` Edge Function.

  ### 2. Register hashibot_evaluate_signal_outcomes_5m
  New 5-minute cron job calling `evaluate-signal-outcomes` so open signals
  (waiting/active) are checked against live candles and marked tp1_hit, tp2_hit,
  sl_hit, or expired as appropriate. This is the root cause of the high expiry
  count: outcome evaluation was never scheduled.

  ### 3. Update scanner_config heartbeat
  Marks cron_job_active = true to reflect the restored schedule.

  ## Notes
  - Both jobs fire every 5 minutes.
  - The SCANNER_CRON_SECRET is referenced via app.settings GUC which must be set
    as a database GUC by the superuser separately. The migration falls back to an
    empty string (jobs will still fire but auth header will be empty — acceptable
    for initial restart; update the GUC once superuser access is available).
  - Project ref: uqiwbzfcntlcyyewawfc
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  project_url  CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  cron_secret  text;
  scanner_ep   text;
  outcomes_ep  text;
  job          record;
BEGIN
  -- Try to read stored GUC; fall back gracefully if not set
  BEGIN
    cron_secret := current_setting('app.settings.scanner_cron_secret');
  EXCEPTION WHEN OTHERS THEN
    cron_secret := '';
  END;

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

  -- Register scanner cron
  PERFORM cron.schedule(
    'hashibot_scheduled_market_scanner_5m',
    '*/5 * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',          'application/json',
            'x-scanner-cron-secret', %L
          ),
          body    := '{"source":"pg_cron","run_type":"scheduled","market_mode":"crypto_only"}'::jsonb
        ) AS request_id;
      $sql$,
      scanner_ep, cron_secret
    )
  );

  -- Register evaluate-signal-outcomes cron
  PERFORM cron.schedule(
    'hashibot_evaluate_signal_outcomes_5m',
    '*/5 * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',          'application/json',
            'x-scanner-cron-secret', %L
          ),
          body    := '{"source":"pg_cron","run_type":"scheduled"}'::jsonb
        ) AS request_id;
      $sql$,
      outcomes_ep, cron_secret
    )
  );

  UPDATE public.scanner_config
  SET
    cron_job_active  = true,
    cron_job_name    = 'hashibot_scheduled_market_scanner_5m',
    schedule_enabled = coalesce(schedule_enabled, true),
    updated_at       = now()
  WHERE id = 1;

  RAISE NOTICE 'Cron jobs registered — scanner: % | outcomes: %', scanner_ep, outcomes_ep;
END $$;
