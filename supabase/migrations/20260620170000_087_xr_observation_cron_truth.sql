-- HASHIBOT X-R final stabilization: real pg_cron truth and one-command observation mode.
-- Live trading stays disabled; observation mode runs scanner/outcomes/monitors only.

ALTER TABLE public.execution_monitor_schedules
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'cron';

UPDATE public.execution_monitor_schedules
SET route = coalesce(route, metadata->>'route'),
    source = coalesce(source, metadata->>'source', 'cron')
WHERE job_name IN (
  'hashibot_scheduled_market_scanner_5m',
  'hashibot_evaluate_signal_outcomes_5m',
  'hashibot_trade_supervisor_binance_1m',
  'hashibot_trade_supervisor_bybit_1m',
  'hashibot_runtime_cleanup_daily'
);

CREATE OR REPLACE FUNCTION public.hashibot_install_observation_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  project_url constant text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  v_jobs jsonb := '[]'::jsonb;
  v_job record;
BEGIN
  FOR v_job IN SELECT unnest(ARRAY[
    'hashibot_scheduled_market_scanner_5m',
    'hashibot_evaluate_signal_outcomes_5m',
    'hashibot_trade_supervisor_binance_1m',
    'hashibot_trade_supervisor_bybit_1m',
    'hashibot_runtime_cleanup_daily'
  ]) AS jobname LOOP
    BEGIN
      PERFORM cron.unschedule(v_job.jobname);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  PERFORM cron.schedule('hashibot_scheduled_market_scanner_5m', '*/5 * * * *', format($cmd$
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_scheduled_market_scanner_5m','scheduled-market-scanner','/functions/v1/scheduled-market-scanner','cron','before',NULL);
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)),
      body := jsonb_build_object('source','pg_cron','run_type','scheduled')
    ) AS request_id;
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_scheduled_market_scanner_5m','scheduled-market-scanner','/functions/v1/scheduled-market-scanner','cron','after',true);
  $cmd$, project_url || '/functions/v1/scheduled-market-scanner'));

  PERFORM cron.schedule('hashibot_evaluate_signal_outcomes_5m', '*/5 * * * *', format($cmd$
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_evaluate_signal_outcomes_5m','evaluate-signal-outcomes','/functions/v1/evaluate-signal-outcomes','cron','before',NULL);
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)),
      body := jsonb_build_object('source','pg_cron','run_type','scheduled')
    ) AS request_id;
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_evaluate_signal_outcomes_5m','evaluate-signal-outcomes','/functions/v1/evaluate-signal-outcomes','cron','after',true);
  $cmd$, project_url || '/functions/v1/evaluate-signal-outcomes'));

  PERFORM cron.schedule('hashibot_trade_supervisor_binance_1m', '* * * * *', format($cmd$
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_trade_supervisor_binance_1m','binance-testnet-execution','/functions/v1/binance-testnet-execution','cron','before',NULL);
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)),
      body := jsonb_build_object('action','run_trade_supervisor_cycle','provider','binance','source','pg_cron')
    ) AS request_id;
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_trade_supervisor_binance_1m','binance-testnet-execution','/functions/v1/binance-testnet-execution','cron','after',true);
  $cmd$, project_url || '/functions/v1/binance-testnet-execution'));

  PERFORM cron.schedule('hashibot_trade_supervisor_bybit_1m', '* * * * *', format($cmd$
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_trade_supervisor_bybit_1m','bybit-testnet-monitor','/functions/v1/bybit-testnet-monitor','cron','before',NULL);
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'apikey',(SELECT supabase_anon_key FROM public.scanner_config WHERE id = 1),'x-hashibot-cron-token',(SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)),
      body := jsonb_build_object('source','pg_cron','environment','demo')
    ) AS request_id;
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_trade_supervisor_bybit_1m','bybit-testnet-monitor','/functions/v1/bybit-testnet-monitor','cron','after',true);
  $cmd$, project_url || '/functions/v1/bybit-testnet-monitor'));

  PERFORM cron.schedule('hashibot_runtime_cleanup_daily', '17 3 * * *', $cmd$
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_runtime_cleanup_daily','hashibot_runtime_cleanup','rpc/hashibot_runtime_cleanup','cron','before',NULL);
    SELECT public.hashibot_runtime_cleanup(interval '24 hours');
    INSERT INTO public.cron_heartbeats(job_name,function_name,route,source,phase,success)
    VALUES ('hashibot_runtime_cleanup_daily','hashibot_runtime_cleanup','rpc/hashibot_runtime_cleanup','cron','after',true);
  $cmd$);

  UPDATE public.execution_monitor_schedules s
  SET enabled = true,
      scheduled = true,
      last_error = NULL,
      route = v.route,
      source = 'cron',
      metadata = coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object('route', v.route, 'source', 'cron'),
      updated_at = now()
  FROM (VALUES
    ('hashibot_scheduled_market_scanner_5m','/functions/v1/scheduled-market-scanner'),
    ('hashibot_evaluate_signal_outcomes_5m','/functions/v1/evaluate-signal-outcomes'),
    ('hashibot_trade_supervisor_binance_1m','/functions/v1/binance-testnet-execution'),
    ('hashibot_trade_supervisor_bybit_1m','/functions/v1/bybit-testnet-monitor'),
    ('hashibot_runtime_cleanup_daily','rpc/hashibot_runtime_cleanup')
  ) AS v(job_name, route)
  WHERE s.job_name = v.job_name;

  SELECT jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule, 'active', active) ORDER BY jobname)
  INTO v_jobs
  FROM cron.job
  WHERE jobname IN (
    'hashibot_scheduled_market_scanner_5m',
    'hashibot_evaluate_signal_outcomes_5m',
    'hashibot_trade_supervisor_binance_1m',
    'hashibot_trade_supervisor_bybit_1m',
    'hashibot_runtime_cleanup_daily'
  );

  RETURN coalesce(v_jobs, '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_enable_observation_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs jsonb;
BEGIN
  UPDATE public.execution_settings
  SET live_trading_enabled = false,
      updated_at = now()
  WHERE id = 1;

  UPDATE public.scanner_config
  SET safe_mode_enabled = false,
      is_enabled = true,
      schedule_enabled = true,
      cron_job_active = true,
      execution_paused = true,
      supervisor_paused = false,
      supervisor_enabled = true,
      auto_repair_paused = true,
      operator_auto_repair_enabled = false,
      telegram_operational_paused = true,
      operator_telegram_enabled = false,
      updated_at = now()
  WHERE id = 1;

  SELECT public.hashibot_install_observation_cron() INTO v_jobs;
  RETURN jsonb_build_object(
    'mode','observation',
    'live_trading_enabled', false,
    'safe_mode_enabled', false,
    'execution_paused', true,
    'auto_repair_paused', true,
    'telegram_operational_paused', true,
    'cron_jobs', v_jobs
  );
END $$;

DROP FUNCTION IF EXISTS public.runtime_truth_function();
DROP VIEW IF EXISTS public.runtime_proof_view;
DROP VIEW IF EXISTS public.runtime_truth;
DROP VIEW IF EXISTS public.scheduler_truth_view CASCADE;

CREATE OR REPLACE VIEW public.scheduler_truth_view AS
WITH expected AS (
  SELECT * FROM (VALUES
    ('scanner'::text,'testnet'::text,'hashibot_scheduled_market_scanner_5m'::text,'*/5 * * * *'::text,'scheduled-market-scanner'::text,'/functions/v1/scheduled-market-scanner'::text),
    ('signals','testnet','hashibot_evaluate_signal_outcomes_5m','*/5 * * * *','evaluate-signal-outcomes','/functions/v1/evaluate-signal-outcomes'),
    ('binance','testnet','hashibot_trade_supervisor_binance_1m','* * * * *','binance-testnet-execution','/functions/v1/binance-testnet-execution'),
    ('bybit','demo','hashibot_trade_supervisor_bybit_1m','* * * * *','bybit-testnet-monitor','/functions/v1/bybit-testnet-monitor'),
    ('runtime','maintenance','hashibot_runtime_cleanup_daily','17 3 * * *','hashibot_runtime_cleanup','rpc/hashibot_runtime_cleanup')
  ) AS t(provider, environment, job_name, cron_expression, function_name, route)
),
cron_jobs AS (
  SELECT jobname, schedule, active, command FROM cron.job
),
last_hb AS (
  SELECT DISTINCT ON (job_name) job_name, created_at, success, error_message
  FROM public.cron_heartbeats
  WHERE phase = 'after'
  ORDER BY job_name, created_at DESC
),
last_before AS (
  SELECT DISTINCT ON (job_name) job_name, created_at
  FROM public.cron_heartbeats
  WHERE phase = 'before'
  ORDER BY job_name, created_at DESC
)
SELECT e.provider,
       e.environment,
       e.job_name,
       e.cron_expression,
       e.function_name,
       e.route,
       'cron'::text AS source,
       (cj.jobname IS NOT NULL) AS configured,
       coalesce(cj.active,false) AS enabled,
       coalesce(lb.created_at, lh.created_at) AS last_run_at,
       CASE WHEN lh.success IS TRUE THEN lh.created_at ELSE NULL END AS last_success_at,
       CASE WHEN e.cron_expression = '* * * * *' THEN coalesce(lb.created_at, now()) + interval '1 minute'
            WHEN e.cron_expression = '*/5 * * * *' THEN coalesce(lb.created_at, now()) + interval '5 minutes'
            ELSE coalesce(lb.created_at, now()) + interval '24 hours' END AS next_run_at,
       CASE WHEN cj.jobname IS NULL THEN 'missing_pg_cron_job'
            WHEN coalesce(cj.active,false) IS FALSE THEN 'pg_cron_job_disabled'
            WHEN lh.success IS FALSE THEN lh.error_message
            ELSE NULL END AS last_error,
       CASE WHEN coalesce(lb.created_at, lh.created_at) IS NULL THEN NULL ELSE round(extract(epoch FROM (now() - coalesce(lb.created_at, lh.created_at)))/60.0,2) END AS heartbeat_age_minutes,
       CASE WHEN cj.jobname IS NULL THEN 'FAIL'
            WHEN coalesce(cj.active,false) IS FALSE THEN 'WARNING'
            WHEN e.cron_expression = '* * * * *' AND coalesce(lb.created_at, lh.created_at) < now() - interval '3 minutes' THEN 'FAIL'
            WHEN e.cron_expression = '*/5 * * * *' AND coalesce(lb.created_at, lh.created_at) < now() - interval '10 minutes' THEN 'FAIL'
            WHEN lh.success IS FALSE THEN 'FAIL'
            ELSE 'PASS' END AS status
FROM expected e
LEFT JOIN cron_jobs cj ON cj.jobname = e.job_name
LEFT JOIN last_hb lh ON lh.job_name = e.job_name
LEFT JOIN last_before lb ON lb.job_name = e.job_name;

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
readiness AS (SELECT jsonb_object_agg(provider, jsonb_build_object('clean_trades_completed', clean_trades_completed, 'target', target, 'remaining_to_target', remaining_to_target, 'blockers', blockers)) AS readiness FROM public.provider_100_trade_readiness_view),
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
       coalesce((SELECT readiness FROM readiness), '{}'::jsonb) AS provider_100_trade_readiness,
       CASE WHEN coalesce((SELECT active_quarantines FROM q),0) > 0 THEN 'WARNING' ELSE 'PASS' END AS quarantine_status,
       jsonb_build_object('latest_cleanup_at',(SELECT finished_at FROM cleanup),'rows_deleted',(SELECT rows_deleted FROM cleanup),'error',(SELECT error_message FROM cleanup)) AS storage_egress_warning,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN coalesce((SELECT live_trading_enabled FROM settings), false) THEN 'live_trading_enabled_forbidden' END,
         CASE WHEN coalesce((SELECT safe_mode_enabled FROM cfg), true) THEN 'safe_mode_enabled' END,
         CASE WHEN coalesce((SELECT execution_paused FROM cfg), true) THEN 'execution_paused_observation_only' END,
         CASE WHEN coalesce((SELECT auto_repair_paused FROM cfg), true) THEN 'auto_repair_paused' END,
         CASE WHEN coalesce((SELECT telegram_operational_paused FROM cfg), true) THEN 'telegram_operational_paused' END,
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
         'provider_100_trade_readiness', provider_100_trade_readiness,
         'storage_egress_warning', storage_egress_warning,
         'source_table_function', source_table_function,
         'stale_age_minutes', stale_age_minutes
       ) AS proof,
       latest_blockers AS blockers,
       generated_at
FROM public.runtime_truth;

NOTIFY pgrst, 'reload schema';
