-- Operator execution helper for 20260714003000_final_cron_consolidation.sql
-- Run only after reviewing 01_preflight.sql output and clearing STOP conditions.
-- Contains the forward migration followed immediately by postflight verification.
-- Rollback remains only in the complete prepared migration reference.

-- SECTION 2 — FORWARD CONSOLIDATION (WRITES; INSTALLS DISABLED JOBS ONLY)
-- ============================================================================

BEGIN;

-- 2.1 Metadata and backup tables.
CREATE TABLE IF NOT EXISTS public.hashibot_cron_consolidation_backup (
  migration_id text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  jobid bigint NOT NULL,
  jobname text NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL,
  active boolean NOT NULL,
  nodename text,
  nodeport integer,
  database text,
  username text,
  PRIMARY KEY (migration_id, jobid)
);

CREATE TABLE IF NOT EXISTS public.hashibot_scheduler_jobs (
  job_name text PRIMARY KEY,
  responsibility text NOT NULL,
  schedule text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('edge_function', 'rpc')),
  target_name text NOT NULL,
  lease_key text NOT NULL,
  max_runtime_seconds integer NOT NULL CHECK (max_runtime_seconds BETWEEN 5 AND 900),
  retry_policy text NOT NULL,
  payload_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  certification_gate text NOT NULL,
  activation_order integer NOT NULL,
  installed_disabled boolean NOT NULL DEFAULT true,
  enabled_after_certification boolean NOT NULL DEFAULT false,
  scheduler_version text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.hashibot_scheduler_runs (
  scheduler_run_id text PRIMARY KEY,
  job_name text NOT NULL REFERENCES public.hashibot_scheduler_jobs(job_name),
  lease_key text NOT NULL,
  idempotency_key text NOT NULL,
  run_status text NOT NULL CHECK (run_status IN ('queued', 'skipped_lease_busy', 'posted', 'failed_before_post')),
  request_id bigint,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS hashibot_scheduler_runs_idempotency_key_unique
  ON public.hashibot_scheduler_runs(idempotency_key);

-- 2.2 Abort if required secrets or prerequisite functions are absent.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(required.name ORDER BY required.name)
  INTO v_missing
  FROM (VALUES ('HASHIBOT_PROJECT_URL'), ('HASHIBOT_SERVICE_ROLE_KEY')) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets s
    WHERE s.name = required.name
      AND COALESCE(NULLIF(btrim(s.decrypted_secret), ''), '') <> ''
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required Vault scheduler secrets: %', array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure('public.runtime_acquire_worker_lease(text,text,text,integer,jsonb)') IS NULL
     OR to_regprocedure('public.runtime_release_worker_lease(text,text,text)') IS NULL
     OR to_regprocedure('public.runtime_record_event_idempotency(text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Runtime safety RPCs must be installed before cron consolidation';
  END IF;
END $$;

-- 2.3 Backend-only scheduler dispatcher. Cron commands store only this function call;
-- the service role key is read from Vault at runtime and is never embedded in cron.job.command.
CREATE OR REPLACE FUNCTION public.hashibot_scheduler_dispatch(p_job_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.hashibot_scheduler_jobs%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_slot text;
  v_run_id text;
  v_idempotency_key text;
  v_payload jsonb;
  v_supabase_url text;
  v_service_key text;
  v_request_id bigint;
  v_acquired boolean := false;
  v_result jsonb;
BEGIN
  IF p_job_name IS NULL OR length(btrim(p_job_name)) = 0 THEN
    RAISE EXCEPTION 'job_name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.hashibot_scheduler_jobs
  WHERE job_name = p_job_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown scheduler job: %', p_job_name USING ERRCODE = '22023';
  END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'HASHIBOT_PROJECT_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'HASHIBOT_SERVICE_ROLE_KEY' LIMIT 1;

  IF COALESCE(NULLIF(btrim(v_supabase_url), ''), '') = '' OR COALESCE(NULLIF(btrim(v_service_key), ''), '') = '' THEN
    RAISE EXCEPTION 'scheduler Vault secrets are missing';
  END IF;

  v_slot := to_char(date_trunc('minute', v_now), 'YYYYMMDDHH24MI');
  v_run_id := p_job_name || ':' || v_slot;
  v_idempotency_key := 'scheduler:' || v_run_id;
  v_payload := v_job.payload_template
    || jsonb_build_object(
      'source', 'pg_cron',
      'scheduler_job_name', p_job_name,
      'scheduler_run_id', v_run_id,
      'idempotency_key', v_idempotency_key,
      'lease_key', v_job.lease_key,
      'max_runtime_seconds', v_job.max_runtime_seconds
    );

  SELECT acquired INTO v_acquired
  FROM public.runtime_acquire_worker_lease(v_job.lease_key, 'pg_cron', v_run_id, v_job.max_runtime_seconds, jsonb_build_object('job_name', p_job_name));

  IF NOT v_acquired THEN
    INSERT INTO public.hashibot_scheduler_runs(scheduler_run_id, job_name, lease_key, idempotency_key, run_status, payload, finished_at)
    VALUES (v_run_id, p_job_name, v_job.lease_key, v_idempotency_key, 'skipped_lease_busy', v_payload, clock_timestamp())
    ON CONFLICT (scheduler_run_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'skipped_lease_busy', 'job_name', p_job_name, 'lease_key', v_job.lease_key);
  END IF;

  PERFORM public.runtime_record_event_idempotency(v_idempotency_key, v_run_id, NULL, 'scheduler_invocation', v_payload);

  INSERT INTO public.hashibot_scheduler_runs(scheduler_run_id, job_name, lease_key, idempotency_key, run_status, payload)
  VALUES (v_run_id, p_job_name, v_job.lease_key, v_idempotency_key, 'queued', v_payload)
  ON CONFLICT (scheduler_run_id) DO NOTHING;

  IF v_job.target_kind = 'edge_function' THEN
    SELECT net.http_post(
      url := rtrim(v_supabase_url, '/') || '/functions/v1/' || v_job.target_name,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_service_key,
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := v_payload,
      timeout_milliseconds := (v_job.max_runtime_seconds * 1000)
    ) INTO v_request_id;

    UPDATE public.hashibot_scheduler_runs
    SET run_status = 'posted', request_id = v_request_id, finished_at = clock_timestamp()
    WHERE scheduler_run_id = v_run_id;

    v_result := jsonb_build_object('status', 'posted', 'request_id', v_request_id, 'job_name', p_job_name);
  ELSIF v_job.target_kind = 'rpc' AND v_job.target_name = 'hashibot_cleanup_noncritical' THEN
    PERFORM public.hashibot_cleanup_noncritical(true, true, 500);

    UPDATE public.hashibot_scheduler_runs
    SET run_status = 'posted', finished_at = clock_timestamp()
    WHERE scheduler_run_id = v_run_id;

    v_result := jsonb_build_object('status', 'rpc_executed', 'job_name', p_job_name);
  ELSE
    RAISE EXCEPTION 'unsupported scheduler target: %.%', v_job.target_kind, v_job.target_name USING ERRCODE = '22023';
  END IF;

  PERFORM public.runtime_release_worker_lease(v_job.lease_key, 'pg_cron', v_run_id);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    INSERT INTO public.hashibot_scheduler_runs(scheduler_run_id, job_name, lease_key, idempotency_key, run_status, error_message, payload, finished_at)
    VALUES (v_run_id, COALESCE(p_job_name, 'unknown'), COALESCE(v_job.lease_key, 'unknown'), COALESCE(v_idempotency_key, 'unknown'), 'failed_before_post', SQLERRM, COALESCE(v_payload, '{}'::jsonb), clock_timestamp())
    ON CONFLICT (scheduler_run_id) DO UPDATE
    SET run_status = 'failed_before_post', error_message = EXCLUDED.error_message, finished_at = EXCLUDED.finished_at;
  END IF;

  IF v_acquired AND v_job.lease_key IS NOT NULL AND v_run_id IS NOT NULL THEN
    PERFORM public.runtime_release_worker_lease(v_job.lease_key, 'pg_cron', v_run_id);
  END IF;

  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.hashibot_scheduler_dispatch(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hashibot_scheduler_dispatch(text) TO service_role;

-- 2.4 Backup all existing HashiBot cron definitions, then unschedule/delete legacy rows.
INSERT INTO public.hashibot_cron_consolidation_backup (
  migration_id,
  jobid,
  jobname,
  schedule,
  command,
  active,
  nodename,
  nodeport,
  database,
  username
)
SELECT
  '20260714003000_final_cron_consolidation',
  jobid,
  jobname,
  schedule,
  command,
  active,
  nodename,
  nodeport,
  database,
  username
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
   OR command ILIKE '%scheduled-market-scanner%'
   OR command ILIKE '%evaluate-signal-outcomes%'
   OR command ILIKE '%binance-testnet-monitor%'
   OR command ILIKE '%bybit-testnet-monitor%'
   OR command ILIKE '%telegram-orchestrator%'
   OR command ILIKE '%run_trade_supervisor_cycle%'
ON CONFLICT (migration_id, jobid) DO UPDATE
SET backed_up_at = EXCLUDED.backed_up_at,
    jobname = EXCLUDED.jobname,
    schedule = EXCLUDED.schedule,
    command = EXCLUDED.command,
    active = EXCLUDED.active,
    nodename = EXCLUDED.nodename,
    nodeport = EXCLUDED.nodeport,
    database = EXCLUDED.database,
    username = EXCLUDED.username;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname ILIKE 'hashibot%'
       OR command ILIKE '%scheduled-market-scanner%'
       OR command ILIKE '%evaluate-signal-outcomes%'
       OR command ILIKE '%binance-testnet-monitor%'
       OR command ILIKE '%bybit-testnet-monitor%'
       OR command ILIKE '%telegram-orchestrator%'
       OR command ILIKE '%run_trade_supervisor_cycle%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- 2.5 Install exactly one disabled canonical job per approved responsibility.
INSERT INTO public.hashibot_scheduler_jobs (
  job_name,
  responsibility,
  schedule,
  target_kind,
  target_name,
  lease_key,
  max_runtime_seconds,
  retry_policy,
  payload_template,
  certification_gate,
  activation_order,
  installed_disabled,
  enabled_after_certification,
  scheduler_version
)
VALUES
  ('hashibot_prod_scanner_5m', 'market_scanner', '*/5 * * * *', 'edge_function', 'scheduled-market-scanner', 'scanner:global', 240, 'no_pg_cron_retry; worker handles bounded retries', '{"run_type":"scheduled","market_mode":"crypto_only"}'::jsonb, 'scanner_manual_cycle_certified', 1, true, false, '20260714003000'),
  ('hashibot_prod_outcome_evaluator_5m', 'outcome_evaluator', '2-59/5 * * * *', 'edge_function', 'evaluate-signal-outcomes', 'outcome-evaluator:global', 180, 'no_pg_cron_retry; structural errors non-retryable', '{"run_type":"scheduled"}'::jsonb, 'outcome_evaluator_certified', 2, true, false, '20260714003000'),
  ('hashibot_prod_binance_testnet_monitor_1m', 'runtime_monitor_binance_testnet', '* * * * *', 'edge_function', 'binance-testnet-monitor', 'monitor:binance:testnet', 55, 'no_pg_cron_retry; monitor/recovery classify retries', '{"run_type":"binance_testnet_monitor","provider":"binance","environment":"testnet"}'::jsonb, 'binance_monitor_certified', 3, true, false, '20260714003000'),
  ('hashibot_prod_bybit_demo_monitor_1m', 'runtime_monitor_bybit_demo', '* * * * *', 'edge_function', 'bybit-testnet-monitor', 'monitor:bybit:demo', 55, 'no_pg_cron_retry; monitor/recovery classify retries', '{"run_type":"bybit_demo_monitor","provider":"bybit","environment":"demo"}'::jsonb, 'bybit_monitor_certified', 4, true, false, '20260714003000'),
  ('hashibot_prod_content_morning_brief_0800_eat', 'content_morning_brief', '0 5 * * *', 'edge_function', 'telegram-orchestrator', 'content:morning-brief', 120, 'no_pg_cron_retry; delivery pipeline dedupes', '{"kind":"morning_brief"}'::jsonb, 'content_pipeline_certified', 8, true, false, '20260714003000'),
  ('hashibot_prod_content_news_digest_1200_eat', 'content_news_digest', '0 9 * * *', 'edge_function', 'telegram-orchestrator', 'content:news-digest', 120, 'no_pg_cron_retry; delivery pipeline dedupes', '{"kind":"news_digest"}'::jsonb, 'content_pipeline_certified', 9, true, false, '20260714003000'),
  ('hashibot_prod_content_watchlist_1600_eat', 'content_watchlist_patterns', '0 13 * * *', 'edge_function', 'telegram-orchestrator', 'content:watchlist-patterns', 120, 'no_pg_cron_retry; delivery pipeline dedupes', '{"kind":"watchlist_pattern"}'::jsonb, 'content_pipeline_certified', 10, true, false, '20260714003000'),
  ('hashibot_prod_content_market_wrap_2000_eat', 'content_market_wrap', '0 17 * * *', 'edge_function', 'telegram-orchestrator', 'content:market-wrap', 120, 'no_pg_cron_retry; delivery pipeline dedupes', '{"kind":"market_wrap"}'::jsonb, 'content_pipeline_certified', 11, true, false, '20260714003000'),
  ('hashibot_prod_runtime_cleanup_daily', 'runtime_cleanup', '30 2 * * *', 'rpc', 'hashibot_cleanup_noncritical', 'cleanup:runtime', 300, 'no_pg_cron_retry; cleanup is bounded/batched', '{"run_type":"runtime_cleanup","archive":true,"batch_size":500}'::jsonb, 'retention_cleanup_certified_after_runtime_stable', 12, true, false, '20260714003000')
ON CONFLICT (job_name) DO UPDATE
SET responsibility = EXCLUDED.responsibility,
    schedule = EXCLUDED.schedule,
    target_kind = EXCLUDED.target_kind,
    target_name = EXCLUDED.target_name,
    lease_key = EXCLUDED.lease_key,
    max_runtime_seconds = EXCLUDED.max_runtime_seconds,
    retry_policy = EXCLUDED.retry_policy,
    payload_template = EXCLUDED.payload_template,
    certification_gate = EXCLUDED.certification_gate,
    activation_order = EXCLUDED.activation_order,
    installed_disabled = true,
    enabled_after_certification = false,
    scheduler_version = EXCLUDED.scheduler_version,
    updated_at = clock_timestamp();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT job_name, schedule FROM public.hashibot_scheduler_jobs WHERE scheduler_version = '20260714003000' ORDER BY activation_order LOOP
    PERFORM cron.schedule(r.job_name, r.schedule, format('SELECT public.hashibot_scheduler_dispatch(%L);', r.job_name));
    UPDATE cron.job SET active = false WHERE jobname = r.job_name;
  END LOOP;
END $$;

-- Mirror disabled state into legacy config/proof tables only for columns that exist.
DO $$
DECLARE
  v_sets text := '';
BEGIN
  IF to_regclass('public.scanner_config') IS NOT NULL THEN
    SELECT string_agg(format('%I = false', column_name), ', ')
    INTO v_sets
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scanner_config'
      AND column_name IN (
        'cron_job_active',
        'binance_monitor_cron_active',
        'bybit_monitor_cron_active',
        'trade_supervisor_cron_active'
      );

    IF v_sets IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'updated_at'
      ) THEN
        v_sets := v_sets || ', updated_at = now()';
      END IF;

      EXECUTE 'UPDATE public.scanner_config SET ' || v_sets || ' WHERE id = 1';
    END IF;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- SECTION 3 — POSTFLIGHT VERIFICATION (READ-ONLY)
-- ============================================================================

-- 3.1 No duplicate HashiBot job names.
SELECT jobname, COUNT(*) AS duplicate_count
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
GROUP BY jobname
HAVING COUNT(*) > 1;

-- 3.2 Every installed canonical job exists exactly once and is disabled.
SELECT
  sj.job_name,
  sj.schedule AS metadata_schedule,
  cj.schedule AS cron_schedule,
  cj.active,
  sj.target_kind,
  sj.target_name,
  sj.lease_key,
  sj.certification_gate,
  sj.activation_order
FROM public.hashibot_scheduler_jobs sj
LEFT JOIN cron.job cj ON cj.jobname = sj.job_name
WHERE sj.scheduler_version = '20260714003000'
ORDER BY sj.activation_order;

-- 3.3 Deleted legacy jobs should not remain.
SELECT jobid, jobname, active, schedule, command
FROM cron.job
WHERE jobname IN (
  'hashibot_scheduled_market_scanner_5m',
  'hashibot_evaluate_signal_outcomes_5m',
  'hashibot_binance_testnet_monitor_1m',
  'hashibot_bybit_testnet_monitor_1m',
  'hashibot_bybit_demo_monitor_1m',
  'hashibot_trade_supervisor_1m_binance',
  'hashibot_trade_supervisor_1m_bybit',
  'hashibot_test_morning_brief_1m',
  'hashibot_test_news_digest_1m',
  'hashibot_test_watchlist_patterns_1m',
  'hashibot_test_market_wrap_1m'
)
   OR command ILIKE '%run_trade_supervisor_cycle%';

-- 3.4 Approved authorization method: cron.job.command calls only the dispatcher, not raw URLs/secrets.
SELECT jobname, active, schedule, command
FROM cron.job
WHERE jobname ILIKE 'hashibot%'
  AND (
    command ILIKE '%HASHIBOT_SERVICE_ROLE_KEY%'
    OR command ILIKE '%supabase_anon_key%'
    OR command ILIKE '%cron_pg_token%'
    OR command ILIKE '%x-scanner-cron-secret%'
    OR command ILIKE '%Authorization%'
    OR command ILIKE '%net.http_post%'
  );

-- 3.5 Every runtime job has a lease key and no canonical target is duplicated unexpectedly.
SELECT job_name, lease_key
FROM public.hashibot_scheduler_jobs
WHERE scheduler_version = '20260714003000'
  AND (lease_key IS NULL OR btrim(lease_key) = '');

SELECT target_kind, target_name, COUNT(*) AS job_count, array_agg(job_name ORDER BY job_name) AS jobs
FROM public.hashibot_scheduler_jobs
WHERE scheduler_version = '20260714003000'
GROUP BY target_kind, target_name
HAVING COUNT(*) > 1 AND target_name NOT IN ('telegram-orchestrator');

-- ============================================================================
