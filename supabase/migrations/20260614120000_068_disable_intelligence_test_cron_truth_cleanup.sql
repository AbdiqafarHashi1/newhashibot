-- Final production truth cleanup: keep production intelligence schedules and remove
-- one-minute proof/test jobs so Control Room does not show test cron spam as live production.
DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'hashibot_test_morning_brief_1m',
      'hashibot_test_news_digest_1m',
      'hashibot_test_watchlist_patterns_1m',
      'hashibot_test_market_wrap_1m'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END $$;

COMMENT ON EXTENSION pg_cron IS 'HashiBot production intelligence cron remains at 08:00/12:00/16:00/20:00 EAT; one-minute intelligence proof jobs are disabled after verification.';
