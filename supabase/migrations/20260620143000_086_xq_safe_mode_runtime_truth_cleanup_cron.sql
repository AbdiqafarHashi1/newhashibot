-- HASHIBOT X-Q final recovery: safe mode, compact runtime truth, retention cleanup, exact cron registry.
-- Safe default: all automation remains paused until operator acceptance checks pass.

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS safe_mode_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS execution_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supervisor_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_repair_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_operational_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS latest_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_manual_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_automatic_run_at timestamptz;

UPDATE public.scanner_config
SET safe_mode_enabled = true,
    execution_paused = true,
    supervisor_paused = true,
    auto_repair_paused = true,
    telegram_operational_paused = true,
    is_enabled = false,
    schedule_enabled = false,
    operator_auto_repair_enabled = false,
    operator_telegram_enabled = false
WHERE id = 1;

CREATE TABLE IF NOT EXISTS public.runtime_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  success boolean NOT NULL DEFAULT false,
  rows_deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text
);

ALTER TABLE public.execution_monitor_schedules
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  function_name text NOT NULL,
  route text NOT NULL,
  source text NOT NULL DEFAULT 'cron',
  phase text NOT NULL CHECK (phase IN ('before','after')),
  success boolean,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_job_created ON public.cron_heartbeats(job_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.hashibot_runtime_cleanup(p_cutoff interval DEFAULT interval '24 hours')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - p_cutoff;
  v_deleted jsonb := '{}'::jsonb;
  v_count integer;
  v_run uuid;
  v_tables text[] := ARRAY[
    'indicator_snapshots','scanner_logs','operator_runtime_events','execution_monitor_heartbeats','telegram_deliveries',
    'signal_updates','market_snapshots','intelligence_events','scanner_runs'
  ];
  v_table text;
BEGIN
  INSERT INTO public.runtime_cleanup_runs DEFAULT VALUES RETURNING id INTO v_run;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'created_at') THEN
      EXECUTE format('DELETE FROM public.%I WHERE created_at < $1', v_table) USING v_cutoff;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object(v_table, v_count);
    END IF;
  END LOOP;

  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    DELETE FROM public.strategy_candidates
    WHERE created_at < v_cutoff
      AND coalesce(status,'') NOT IN ('approved','final','active')
      AND coalesce(signal_created,false) IS NOT TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('strategy_candidates', v_count);
  END IF;

  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    DELETE FROM public.execution_event_logs eel
    WHERE eel.created_at < v_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM public.execution_orders eo
        WHERE eo.id = eel.execution_order_id
          AND eo.status IN ('pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','protected_managed','pending_managed_protection')
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('execution_event_logs', v_count);
  END IF;

  UPDATE public.runtime_cleanup_runs SET finished_at = now(), success = true, rows_deleted = v_deleted WHERE id = v_run;
  RETURN v_deleted;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.runtime_cleanup_runs SET finished_at = now(), success = false, error_message = SQLERRM WHERE id = v_run;
  RAISE;
END $$;

CREATE OR REPLACE VIEW public.runtime_truth AS
WITH cfg AS (SELECT * FROM public.scanner_config WHERE id = 1),
settings AS (SELECT * FROM public.execution_settings WHERE id = 1),
scanner AS (
  SELECT max(started_at) FILTER (WHERE run_type ILIKE 'scheduled' OR is_automatic) AS last_automatic_run_at,
         max(started_at) FILTER (WHERE run_type ILIKE 'manual') AS last_manual_run_at,
         max(finished_at) FILTER (WHERE status IN ('completed','success','healthy_zero_signals')) AS last_success_at,
         (array_agg(error_message ORDER BY started_at DESC))[1] AS last_error
  FROM public.scanner_runs
),
sched AS (SELECT jsonb_agg(to_jsonb(s) ORDER BY job_name) AS jobs, count(*) FILTER (WHERE status='FAIL') AS fails, count(*) FILTER (WHERE status='WARNING') AS warns FROM public.scheduler_truth_view s),
hb AS (SELECT jsonb_object_agg(provider, jsonb_build_object('status', status, 'last_success_at', last_success_at, 'last_error', last_error, 'stale_age_minutes', heartbeat_age_minutes)) AS providers FROM public.scheduler_truth_view),
q AS (SELECT count(*) AS active_quarantines FROM public.problem_symbol_quarantine WHERE (disabled_for_execution OR disabled_for_repair) AND coalesce(cooldown_until, now()+interval '1 minute') > now()),
cleanup AS (SELECT rows_deleted, error_message, finished_at FROM public.runtime_cleanup_runs ORDER BY started_at DESC LIMIT 1)
SELECT 'runtime'::text AS scope,
       CASE
         WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'SAFE_MODE'
         WHEN coalesce((SELECT live_trading_enabled FROM settings), false) THEN 'FAIL'
         WHEN coalesce((SELECT fails FROM sched), 0) > 0 THEN 'FAIL'
         WHEN coalesce((SELECT active_quarantines FROM q), 0) > 0 OR coalesce((SELECT warns FROM sched),0) > 0 THEN 'WARNING'
         ELSE 'PASS'
       END AS overall_status,
       CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'paused_safe_mode' WHEN coalesce((SELECT is_enabled FROM cfg), false) THEN 'enabled' ELSE 'paused' END AS scanner_status,
       CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'paused_safe_mode' WHEN coalesce((SELECT supervisor_paused FROM cfg), true) THEN 'paused' ELSE 'enabled' END AS supervisor_status,
       CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'paused_safe_mode' WHEN coalesce((SELECT execution_paused FROM cfg), true) THEN 'paused' ELSE 'enabled' END AS executor_status,
       CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'paused_safe_mode' WHEN coalesce((SELECT auto_repair_paused FROM cfg), true) THEN 'paused' ELSE 'enabled' END AS protection_status,
       CASE WHEN coalesce((SELECT telegram_operational_paused FROM cfg), true) THEN 'paused' ELSE 'enabled' END AS telegram_status,
       coalesce((SELECT jobs FROM sched), '[]'::jsonb) AS scheduler_cron_status,
       coalesce((SELECT providers FROM hb), '{}'::jsonb) AS provider_status,
       CASE WHEN coalesce((SELECT active_quarantines FROM q),0) > 0 THEN 'WARNING' ELSE 'PASS' END AS quarantine_status,
       jsonb_build_object('latest_cleanup_at',(SELECT finished_at FROM cleanup),'rows_deleted',(SELECT rows_deleted FROM cleanup),'error',(SELECT error_message FROM cleanup)) AS storage_egress_warning,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN coalesce((SELECT live_trading_enabled FROM settings), false) THEN 'live_trading_enabled_forbidden' END,
         CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'safe_mode_enabled' END,
         CASE WHEN coalesce((SELECT fails FROM sched),0) > 0 THEN 'cron_or_scheduler_failure' END,
         CASE WHEN coalesce((SELECT active_quarantines FROM q),0) > 0 THEN 'active_symbol_quarantine' END,
         (SELECT last_error FROM scanner)
       ], NULL) AS latest_blockers,
       (SELECT last_automatic_run_at FROM scanner) AS last_automatic_run_timestamp,
       (SELECT last_manual_run_at FROM scanner) AS last_manual_run_timestamp,
       'public.runtime_truth/public.runtime_truth_function'::text AS source_table_function,
       CASE WHEN (SELECT last_automatic_run_at FROM scanner) IS NULL THEN NULL ELSE round(extract(epoch FROM (now() - (SELECT last_automatic_run_at FROM scanner))) / 60.0, 2) END AS stale_age_minutes,
       now() AS generated_at;

CREATE OR REPLACE FUNCTION public.runtime_truth_function()
RETURNS SETOF public.runtime_truth
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT * FROM public.runtime_truth; $$;

-- Exact desired cron registry in execution_monitor_schedules. Jobs stay disabled/safe until acceptance checks re-enable them.
INSERT INTO public.execution_monitor_schedules(provider, environment, job_name, cron_expression, function_name, enabled, scheduled, last_success, last_error, metadata)
VALUES
('scanner','testnet','hashibot_scheduled_market_scanner_5m','*/5 * * * *','scheduled-market-scanner',false,true,false,'safe_mode_initial_off',jsonb_build_object('route','/functions/v1/scheduled-market-scanner','source','cron')),
('signals','testnet','hashibot_evaluate_signal_outcomes_5m','*/5 * * * *','evaluate-signal-outcomes',false,true,false,'safe_mode_initial_off',jsonb_build_object('route','/functions/v1/evaluate-signal-outcomes','source','cron')),
('binance','testnet','hashibot_trade_supervisor_binance_1m','* * * * *','binance-testnet-monitor',false,true,false,'safe_mode_initial_off',jsonb_build_object('route','/functions/v1/binance-testnet-monitor','source','cron')),
('bybit','demo','hashibot_trade_supervisor_bybit_1m','* * * * *','bybit-testnet-monitor',false,true,false,'safe_mode_initial_off',jsonb_build_object('route','/functions/v1/bybit-testnet-monitor','source','cron')),
('runtime','maintenance','hashibot_runtime_cleanup_daily','17 3 * * *','runtime-cleanup',false,true,false,'safe_mode_initial_off',jsonb_build_object('route','rpc/hashibot_runtime_cleanup','source','cron'))
ON CONFLICT (job_name) DO UPDATE SET cron_expression=EXCLUDED.cron_expression,function_name=EXCLUDED.function_name,scheduled=true,enabled=false,last_error='safe_mode_initial_off',metadata=EXCLUDED.metadata;

CREATE OR REPLACE VIEW public.runtime_proof_view AS
SELECT scope, overall_status AS status,
       jsonb_build_object(
         'scanner_status', scanner_status,
         'supervisor_status', supervisor_status,
         'executor_status', executor_status,
         'protection_status', protection_status,
         'telegram_status', telegram_status,
         'provider_status', provider_status,
         'scheduler_cron_status', scheduler_cron_status,
         'storage_egress_warning', storage_egress_warning,
         'source_table_function', source_table_function,
         'stale_age_minutes', stale_age_minutes
       ) AS proof,
       latest_blockers AS blockers,
       generated_at
FROM public.runtime_truth;

NOTIFY pgrst, 'reload schema';
