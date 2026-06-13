-- HashiBot intelligence cron auth root fix.
-- Supabase gateway validates Authorization as a JWT before function code can run.
-- Therefore intelligence pg_cron requests must send scanner_config.cron_pg_token
-- in a custom header that telegram-orchestrator validates itself.

DO $$
DECLARE
  orchestrator_url CONSTANT text := 'https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator';
  production_jobs CONSTANT text[] := ARRAY[
    'hashibot_morning_brief_0800',
    'hashibot_news_digest_1200',
    'hashibot_watchlist_patterns_1600',
    'hashibot_market_wrap_2000'
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
    RAISE NOTICE 'pg_cron not installed; intelligence cron auth root fix skipped';
    RETURN;
  END IF;

  FOREACH job_name IN ARRAY production_jobs || test_jobs LOOP
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
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
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
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
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
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
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
          'x-hashibot-cron-token', (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
        ),
        body := '{"kind":"market_wrap"}'::jsonb
      ) AS request_id;
    $sql$, orchestrator_url)
  );

  PERFORM cron.schedule('hashibot_test_morning_brief_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"morning_brief"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_news_digest_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"news_digest"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_watchlist_patterns_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"watchlist_pattern"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
  PERFORM cron.schedule('hashibot_test_market_wrap_1m', '*/1 * * * *', format($sql$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)), body := '{"kind":"market_wrap"}'::jsonb) AS request_id;
  $sql$, orchestrator_url));
END $$;

-- Verification SQL for the intelligence cron auth fix.
-- 1. Commands contain the non-null orchestrator URL and custom header.
-- SELECT jobname, command LIKE '%https://uqiwbzfcntlcvyewawfc.supabase.co/functions/v1/telegram-orchestrator%' AS has_url, command LIKE '%x-hashibot-cron-token%' AS has_custom_header
-- FROM cron.job
-- WHERE jobname IN ('hashibot_morning_brief_0800','hashibot_news_digest_1200','hashibot_watchlist_patterns_1600','hashibot_market_wrap_2000','hashibot_test_morning_brief_1m','hashibot_test_news_digest_1m','hashibot_test_watchlist_patterns_1m','hashibot_test_market_wrap_1m')
-- ORDER BY jobname;

-- 2. Latest pg_net response should no longer be 401 after the updated cron fires.
-- SELECT id, status_code, created
-- FROM net._http_response
-- ORDER BY created DESC
-- LIMIT 10;

-- 3. Intelligence event storage should advance after successful orchestration.
-- SELECT event_type, status, created_at
-- FROM public.intelligence_events
-- ORDER BY created_at DESC
-- LIMIT 10;

-- 4. Feed result storage should advance after successful orchestration.
-- SELECT feed_type, status, created_at
-- FROM public.intelligence_feed_results
-- ORDER BY created_at DESC
-- LIMIT 10;

-- 5. Telegram deliveries should include Free + VIP scheduled intelligence rows.
-- SELECT channel, event_type, status, created_at
-- FROM public.telegram_deliveries
-- WHERE event_type IN ('morning_brief','news_digest','watchlist_pattern_update','market_wrap')
-- ORDER BY created_at DESC
-- LIMIT 20;
