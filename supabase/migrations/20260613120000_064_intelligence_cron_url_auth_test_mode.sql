-- HashiBot intelligence cron URL/auth repair + temporary end-to-end test mode.
-- Scope: only telegram-orchestrator cron wiring for scheduled intelligence content.

DO $$
DECLARE
  orchestrator_url CONSTANT text := 'https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator';
  production_jobs CONSTANT text[] := ARRAY[
    'hashibot_morning_brief_0800',
    'hashibot_news_digest_1200',
    'hashibot_watchlist_patterns_1600',
    'hashibot_market_wrap_2000'
  ];
  legacy_jobs CONSTANT text[] := ARRAY[
    'hashibot_morning_brief_0800_eat',
    'hashibot_news_digest_1200_eat',
    'hashibot_watchlist_patterns_1600_eat',
    'hashibot_market_wrap_2000_eat'
  ];
  test_jobs CONSTANT text[] := ARRAY[
    'hashibot_test_morning_brief_1m',
    'hashibot_test_news_digest_1m',
    'hashibot_test_watchlist_patterns_1m',
    'hashibot_test_market_wrap_1m'
  ];
  job_name text;
  job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; intelligence cron repair skipped';
    RETURN;
  END IF;

  FOREACH job_name IN ARRAY production_jobs || legacy_jobs || test_jobs LOOP
    FOR job IN SELECT jobid FROM cron.job WHERE jobname = job_name LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_morning_brief_0800',
    '0 5 * * *',
    format($sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"kind":"morning_brief"}'::jsonb
      ) AS request_id;
    $sql$, orchestrator_url)
  );

  PERFORM cron.schedule(
    'hashibot_news_digest_1200',
    '0 9 * * *',
    format($sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"kind":"news_digest"}'::jsonb
      ) AS request_id;
    $sql$, orchestrator_url)
  );

  PERFORM cron.schedule(
    'hashibot_watchlist_patterns_1600',
    '0 13 * * *',
    format($sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"kind":"watchlist_pattern"}'::jsonb
      ) AS request_id;
    $sql$, orchestrator_url)
  );

  PERFORM cron.schedule(
    'hashibot_market_wrap_2000',
    '0 17 * * *',
    format($sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"kind":"market_wrap"}'::jsonb
      ) AS request_id;
    $sql$, orchestrator_url)
  );

  -- TEMPORARY TEST MODE: every-minute jobs for immediate live verification. Drop after observation.
  PERFORM cron.schedule('hashibot_test_morning_brief_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"morning_brief"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_news_digest_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"news_digest"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_watchlist_patterns_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"watchlist_pattern"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_market_wrap_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"market_wrap"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_disable_intelligence_test_crons()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  test_jobs CONSTANT text[] := ARRAY[
    'hashibot_test_morning_brief_1m',
    'hashibot_test_news_digest_1m',
    'hashibot_test_watchlist_patterns_1m',
    'hashibot_test_market_wrap_1m'
  ];
  job_name text;
  job record;
BEGIN
  FOREACH job_name IN ARRAY test_jobs LOOP
    FOR job IN SELECT jobid FROM cron.job WHERE jobname = job_name LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.hashibot_disable_intelligence_test_crons() IS
  'Temporary cleanup helper for HashiBot intelligence every-minute verification crons. Run: select public.hashibot_disable_intelligence_test_crons();';
