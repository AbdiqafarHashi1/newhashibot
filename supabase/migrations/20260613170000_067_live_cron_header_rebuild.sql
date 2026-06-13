-- HashiBot live pg_cron header rebuild.
--
-- Supabase Edge gateway requires Authorization to be a Supabase JWT. The
-- internal scanner cron token must never be sent as Bearer authorization; it is
-- only carried in x-hashibot-cron-token for application-level validation.

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS supabase_anon_key text;

UPDATE public.scanner_config
SET supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaXdiemZjbnRsY3l5ZXdhd2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDY1OTMsImV4cCI6MjA4ODM4MjU5M30.WIZuozSVEK2r8zpff0W_hK1PmXYRQtbblqEI-xbkzVY'
WHERE id = 1
  AND COALESCE(supabase_anon_key, '') = '';

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  monitor_url CONSTANT text := project_url || '/functions/v1/binance-testnet-monitor';
  orchestrator_url CONSTANT text := project_url || '/functions/v1/telegram-orchestrator';
  jobs_to_replace CONSTANT text[] := ARRAY[
    'hashibot_binance_testnet_monitor_1m',
    'hashibot_morning_brief_0800',
    'hashibot_news_digest_1200',
    'hashibot_watchlist_patterns_1600',
    'hashibot_market_wrap_2000',
    'hashibot_test_morning_brief_1m',
    'hashibot_test_news_digest_1m',
    'hashibot_test_watchlist_patterns_1m',
    'hashibot_test_market_wrap_1m'
  ];
  job_name text;
  job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; live cron header rebuild skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net is not installed; live cron header rebuild skipped';
    RETURN;
  END IF;

  FOREACH job_name IN ARRAY jobs_to_replace LOOP
    FOR job IN SELECT jobid FROM cron.job WHERE jobname = job_name LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_binance_testnet_monitor_1m',
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
        body := '{"source":"pg_cron","run_type":"binance_testnet_monitor"}'::jsonb
      ) AS request_id;
    $cron$, monitor_url)
  );

  PERFORM cron.schedule('hashibot_morning_brief_0800', '0 5 * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"morning_brief"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_news_digest_1200', '0 9 * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"news_digest"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_watchlist_patterns_1600', '0 13 * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"watchlist_pattern"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_market_wrap_2000', '0 17 * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"market_wrap"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_test_morning_brief_1m', '*/1 * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"morning_brief"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_test_news_digest_1m', '*/1 * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"news_digest"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_test_watchlist_patterns_1m', '*/1 * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"watchlist_pattern"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  PERFORM cron.schedule('hashibot_test_market_wrap_1m', '*/1 * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"market_wrap"}'::jsonb) AS request_id;
  $cron$, orchestrator_url));

  UPDATE public.scanner_config
  SET binance_monitor_cron_active = true,
      binance_monitor_cron_job_name = 'hashibot_binance_testnet_monitor_1m'
  WHERE id = 1;
END $$;
