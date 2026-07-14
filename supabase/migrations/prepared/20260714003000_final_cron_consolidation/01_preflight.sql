-- Operator execution helper for 20260714003000_final_cron_consolidation.sql
-- Run this file first. It must remain read-only.
-- Source SQL logic is copied from the complete prepared migration reference.

-- HASHIBOT FINAL PREPARED MIGRATION: cron consolidation and disabled production scheduler
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT SQL REVIEW AND THE RUNBOOK.
-- Purpose: remove legacy/duplicate/test/supervisor schedules and install exactly one disabled canonical scheduler per approved responsibility.

-- ============================================================================
-- SECTION 1 — READ-ONLY PREFLIGHT (NO WRITES)
-- ============================================================================

-- 1.1 Verify required extensions and runtime safety functions exist before any forward work.
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net', 'vault')
ORDER BY extname;

SELECT routine_schema, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'runtime_acquire_worker_lease',
    'runtime_release_worker_lease',
    'runtime_record_event_idempotency',
    'runtime_record_incident',
    'hashibot_cleanup_noncritical'
  )
ORDER BY routine_name;

-- 1.2 Verify required Vault secrets exist. Values are intentionally not selected.
SELECT name, created_at, updated_at
FROM vault.decrypted_secrets
WHERE name IN ('HASHIBOT_PROJECT_URL', 'HASHIBOT_SERVICE_ROLE_KEY')
ORDER BY name;

-- STOP if either HASHIBOT_PROJECT_URL or HASHIBOT_SERVICE_ROLE_KEY is absent or blank.
-- The forward migration aborts if either secret is missing.

-- 1.3 Output every current HashiBot cron.job row.
SELECT
  jobid,
  jobname,
  active,
  schedule,
  command
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
   OR command ILIKE '%scheduled-market-scanner%'
   OR command ILIKE '%evaluate-signal-outcomes%'
   OR command ILIKE '%binance-testnet-monitor%'
   OR command ILIKE '%bybit-testnet-monitor%'
   OR command ILIKE '%telegram-orchestrator%'
   OR command ILIKE '%run_trade_supervisor_cycle%'
ORDER BY jobname, jobid;

-- 1.4 Last ten run results for HashiBot jobs.
SELECT
  d.jobid,
  j.jobname,
  d.runid,
  d.status,
  d.return_message,
  d.start_time,
  d.end_time
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname ILIKE 'hashibot%'
   OR j.command ILIKE '%scheduled-market-scanner%'
   OR j.command ILIKE '%evaluate-signal-outcomes%'
   OR j.command ILIKE '%binance-testnet-monitor%'
   OR j.command ILIKE '%bybit-testnet-monitor%'
   OR j.command ILIKE '%telegram-orchestrator%'
   OR j.command ILIKE '%run_trade_supervisor_cycle%'
ORDER BY d.start_time DESC
LIMIT 10;

-- 1.5 Duplicate job names, duplicate targets, and duplicate schedules.
SELECT jobname, COUNT(*) AS duplicate_count, array_agg(jobid ORDER BY jobid) AS jobids
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
GROUP BY jobname
HAVING COUNT(*) > 1
ORDER BY jobname;

SELECT
  CASE
    WHEN command ILIKE '%scheduled-market-scanner%' THEN 'scheduled-market-scanner'
    WHEN command ILIKE '%evaluate-signal-outcomes%' THEN 'evaluate-signal-outcomes'
    WHEN command ILIKE '%binance-testnet-monitor%' THEN 'binance-testnet-monitor'
    WHEN command ILIKE '%bybit-testnet-monitor%' THEN 'bybit-testnet-monitor'
    WHEN command ILIKE '%telegram-orchestrator%' THEN 'telegram-orchestrator'
    WHEN command ILIKE '%run_trade_supervisor_cycle%' THEN 'legacy-trade-supervisor'
    ELSE 'other'
  END AS target,
  COUNT(*) AS job_count,
  array_agg(jobname ORDER BY jobname) AS jobs
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
GROUP BY target
HAVING COUNT(*) > 1
ORDER BY target;

SELECT schedule, COUNT(*) AS job_count, array_agg(jobname ORDER BY jobname) AS jobs
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
GROUP BY schedule
HAVING COUNT(*) > 1
ORDER BY schedule;

-- 1.6 Jobs using invalid/old authorization patterns or deprecated targets.
SELECT
  jobid,
  jobname,
  active,
  schedule,
  CASE
    WHEN command ILIKE '%Authorization%' AND command ILIKE '%cron_pg_token%' THEN 'MALFORMED_AUTHORIZATION_CRON_TOKEN_AS_BEARER'
    WHEN command ILIKE '%x-scanner-cron-secret%' THEN 'LEGACY_SCANNER_SECRET_HEADER'
    WHEN command ILIKE '%supabase_anon_key%' THEN 'ANON_KEY_IN_CRON_COMMAND'
    WHEN command ILIKE '%run_trade_supervisor_cycle%' THEN 'DEPRECATED_SUPERVISOR_TARGET'
    WHEN command ILIKE '%hashibot_test_%_1m%' THEN 'TEST_ONE_MINUTE_JOB'
    ELSE 'OK_OR_REVIEW'
  END AS finding,
  command
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
  AND (
    command ILIKE '%Authorization%cron_pg_token%'
    OR command ILIKE '%x-scanner-cron-secret%'
    OR command ILIKE '%supabase_anon_key%'
    OR command ILIKE '%run_trade_supervisor_cycle%'
    OR jobname ILIKE '%test%1m%'
  )
ORDER BY finding, jobname;

-- ============================================================================
