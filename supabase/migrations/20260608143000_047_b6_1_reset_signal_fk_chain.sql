/*
  HASHIBOT B6.1 — dependency-safe trading-history reset repair

  Signals FK audit (current/legacy/optional tables seen across B-series schema):
  - public.telegram_deliveries.signal_id -> public.signals.id
  - public.execution_event_logs.signal_id -> public.signals.id
  - public.execution_orders.signal_id -> public.signals.id
  - public.signal_updates.signal_id -> public.signals.id
  - public.signal_outcomes.signal_id -> public.signals.id (optional)
  - public.outcomes.signal_id -> public.signals.id (optional)
  - public.signals.candidate_id -> public.strategy_candidates.id
  - public.strategy_candidates.scanner_run_id -> public.scanner_runs.id (optional)
  - public.rejected_setups.scanner_run_id -> public.scanner_runs.id (optional)

  Preserved tables include customers, packages, subscriptions, profiles/admins,
  scanner_config, strategy_configs, execution_settings, Telegram setup/config,
  bot setup records, candles, symbols, provider config, and other durable config.
*/

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history_batch(p_batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_size integer := greatest(50, least(coalesce(p_batch_size, 500), 2000));
  deleted integer := 0;
  total integer := 0;
  result jsonb := '{}'::jsonb;
  t text;
  dependency_order text[] := ARRAY[
    'telegram_deliveries',
    'execution_event_logs',
    'execution_orders',
    'paper_execution_intents',
    'signal_updates',
    'signal_outcomes',
    'outcomes',
    'signals',
    'strategy_candidates',
    'scanner_candidates',
    'rejected_setups',
    'scanner_runs'
  ];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  FOREACH t IN ARRAY dependency_order LOOP
    total := 0;

    IF to_regclass('public.' || t) IS NULL THEN
      result := result || jsonb_build_object(t, jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
      CONTINUE;
    END IF;

    LOOP
      EXECUTE format(
        'WITH doomed AS (SELECT ctid FROM public.%I LIMIT %s) DELETE FROM public.%I AS target WHERE target.ctid IN (SELECT ctid FROM doomed)',
        t,
        batch_size,
        t
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;

    result := result || jsonb_build_object(t, jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'batch_size', batch_size,
    'dependency_delete_order', dependency_order,
    'deleted_counts', result,
    'preserved_tables', ARRAY[
      'customers','packages','subscriptions','profiles','admin profiles','scanner_config',
      'strategy_configs','execution_settings','telegram config','bot setup records',
      'candles','symbols','provider config'
    ],
    'completed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.admin_reset_trading_history_batch(500);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history_batch(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history() TO authenticated, service_role;
