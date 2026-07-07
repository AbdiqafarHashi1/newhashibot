-- 089: V1 production retention, compact backend RPCs, and HashiBridge readiness
-- Keeps V1 UI/product intact while adding bounded retention and compact admin DTOs.

CREATE TABLE IF NOT EXISTS public.hashibot_retention_policies (
  table_name text PRIMARY KEY,
  timestamp_column text NOT NULL DEFAULT 'created_at',
  retention_days integer NOT NULL CHECK (retention_days > 0),
  archive_enabled boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hashibot_retention_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_pk text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  cutoff_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hashibot_command_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type text NOT NULL,
  provider text,
  symbol text,
  status text NOT NULL DEFAULT 'queued',
  idempotency_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hashibridge_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_name text NOT NULL UNIQUE,
  mt5_mode text NOT NULL CHECK (mt5_mode IN ('personal','prop')),
  status text NOT NULL DEFAULT 'ready',
  last_heartbeat_at timestamptz,
  account_login text,
  broker text,
  capabilities jsonb NOT NULL DEFAULT '{"market_order":true,"sl_tp":true,"modify_order":true}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hashibot_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashibot_retention_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashibot_command_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashibridge_instances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_retention_policies" ON public.hashibot_retention_policies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_retention_archive" ON public.hashibot_retention_archive FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_command_queue" ON public.hashibot_command_queue FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibridge_instances" ON public.hashibridge_instances FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.hashibot_retention_policies(table_name, timestamp_column, retention_days, archive_enabled, reason) VALUES
  ('candles','timestamp',14,true,'Market candles are runtime input, not a warehouse'),
  ('indicator_snapshots','created_at',7,true,'Indicators are derived scanner runtime state'),
  ('scanner_runs','started_at',30,true,'Keep recent operational proof only'),
  ('strategy_candidates','created_at',30,true,'Candidates are non-critical scanner work product'),
  ('telegram_deliveries','created_at',60,true,'Delivery proof is bounded after support window'),
  ('execution_event_logs','created_at',45,true,'Execution debug logs are non-critical after truth tables settle'),
  ('operator_runtime_events','created_at',30,true,'Runtime event stream is summarized and bounded'),
  ('provider_parity_audit','created_at',30,true,'Provider history is compacted'),
  ('replay_datasets','created_at',14,true,'Replay data is reproducible research payload'),
  ('intelligence_events','created_at',14,true,'Research/intelligence feed events are non-critical')
ON CONFLICT (table_name) DO UPDATE SET
  timestamp_column = EXCLUDED.timestamp_column,
  retention_days = EXCLUDED.retention_days,
  archive_enabled = EXCLUDED.archive_enabled,
  reason = EXCLUDED.reason,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.hashibot_cleanup_noncritical(p_execute boolean DEFAULT false, p_archive boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  policy record;
  cutoff timestamptz;
  matched integer;
  archived integer;
  deleted integer;
  target jsonb;
  targets jsonb := '[]'::jsonb;
  totals_matched integer := 0;
  totals_archived integer := 0;
  totals_deleted integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;

  FOR policy IN SELECT * FROM public.hashibot_retention_policies WHERE enabled ORDER BY table_name LOOP
    IF to_regclass('public.' || quote_ident(policy.table_name)) IS NULL THEN CONTINUE; END IF;
    cutoff := now() - make_interval(days => policy.retention_days);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I < $1', policy.table_name, policy.timestamp_column) INTO matched USING cutoff;
    archived := 0; deleted := 0;

    IF p_execute AND matched > 0 THEN
      IF p_archive AND policy.archive_enabled THEN
        EXECUTE format(
          'INSERT INTO public.hashibot_retention_archive(source_table, source_pk, cutoff_at, payload) SELECT %L, COALESCE((to_jsonb(t)->>''id''), NULL), $1, to_jsonb(t) FROM public.%I t WHERE %I < $1',
          policy.table_name, policy.table_name, policy.timestamp_column
        ) USING cutoff;
        GET DIAGNOSTICS archived = ROW_COUNT;
      END IF;
      EXECUTE format('DELETE FROM public.%I WHERE %I < $1', policy.table_name, policy.timestamp_column) USING cutoff;
      GET DIAGNOSTICS deleted = ROW_COUNT;
    END IF;

    totals_matched := totals_matched + matched;
    totals_archived := totals_archived + archived;
    totals_deleted := totals_deleted + deleted;
    target := jsonb_build_object('table_name', policy.table_name, 'timestamp_column', policy.timestamp_column, 'retention_days', policy.retention_days, 'archive_enabled', policy.archive_enabled, 'enabled', policy.enabled, 'reason', policy.reason, 'cutoff_at', cutoff, 'rows_estimate', matched, 'rows_matched', matched, 'rows_archived', archived, 'rows_deleted', deleted);
    targets := targets || jsonb_build_array(target);
  END LOOP;

  RETURN jsonb_build_object('mode', CASE WHEN p_execute THEN 'execute' ELSE 'dry_run' END, 'generated_at', now(), 'archive', p_archive, 'targets', targets, 'totals', jsonb_build_object('matched', totals_matched, 'archived', totals_archived, 'deleted', totals_deleted));
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_retention_report()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.hashibot_cleanup_noncritical(false, true);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_runtime_health_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  latest_scanner jsonb := '{}'::jsonb;
  exec_settings jsonb := '{}'::jsonb;
  providers jsonb := '[]'::jsonb;
  queued integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF to_regclass('public.scanner_runs') IS NOT NULL THEN
    SELECT to_jsonb(s) INTO latest_scanner FROM (SELECT id, run_type, status, started_at, finished_at, symbols_scanned, signals_created, telegram_sent_count, telegram_failed_count FROM public.scanner_runs ORDER BY started_at DESC LIMIT 1) s;
  END IF;
  IF to_regclass('public.execution_settings') IS NOT NULL THEN
    SELECT to_jsonb(e) INTO exec_settings FROM (SELECT latest_monitor_run_at, latest_monitor_status, latest_monitor_error, open_positions_count, open_binance_positions, open_binance_orders, latest_sync_time FROM public.execution_settings WHERE id = 1) e;
  END IF;
  IF to_regclass('public.provider_status') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO providers FROM (SELECT provider, status, latency_ms, last_checked_at, error_message FROM public.provider_status ORDER BY provider) p;
  END IF;
  SELECT count(*) INTO queued FROM public.hashibot_command_queue WHERE status IN ('queued','running');
  RETURN jsonb_build_object('generated_at', now(), 'scanner', COALESCE(latest_scanner, '{}'::jsonb), 'execution', COALESCE(exec_settings, '{}'::jsonb), 'providers', providers, 'queues', jsonb_build_object('active_commands', queued));
END $$;
