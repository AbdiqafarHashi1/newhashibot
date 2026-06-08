/*
  HASHIBOT B6.3 — restore working Performance reset with current schema

  Restores the original history reset semantics (clear signal/performance history;
  preserve configuration, market data, credentials, scanner scheduling, and
  account/position state) while adapting the delete order to the current FK chain.

  The batch RPC intentionally performs one bounded delete pass per table. The UI
  calls it until `has_more = false`, avoiding one giant Supabase RPC statement that
  can hit statement_timeout on large history tables.
*/

DROP FUNCTION IF EXISTS public.admin_reset_trading_history_batch(integer);

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history_batch(p_batch_size integer DEFAULT 50, p_until_empty boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_size integer := greatest(25, least(coalesce(p_batch_size, 50), 100));
  deleted integer := 0;
  result jsonb := '{}'::jsonb;
  remaining jsonb := '{}'::jsonb;
  delete_order text[] := ARRAY[
    'telegram_deliveries',
    'signal_updates',
    'signal_outcomes',
    'outcomes',
    'execution_event_logs',
    'execution_orders',
    'paper_execution_intents',
    'rejected_setups',
    'signals',
    'strategy_candidates',
    'scanner_candidates'
  ];
  has_signal_id boolean;
  has_execution_order_id boolean;
  has_execution_id boolean;
  remaining_signals bigint := 0;
  remaining_signal_updates bigint := 0;
  remaining_signal_outcomes bigint := 0;
  remaining_outcomes bigint := 0;
  remaining_candidates bigint := 0;
  remaining_scanner_candidates bigint := 0;
  remaining_rejected_setups bigint := 0;
  remaining_rejected_candidates bigint := 0;
  remaining_telegram_deliveries bigint := 0;
  remaining_execution_event_logs bigint := 0;
  remaining_execution_orders bigint := 0;
  remaining_paper_execution_intents bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  -- Keep each statement short; do not disable the platform statement timeout for
  -- the whole RPC. The caller repeats this bounded function until clean.
  PERFORM set_config('lock_timeout', '5s', true);

  -- 1. telegram_deliveries: only signal-linked delivery history. Preserve config/test rows.
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    WITH doomed AS (
      SELECT td.ctid
      FROM public.telegram_deliveries td
      WHERE td.signal_id IS NOT NULL
      LIMIT batch_size
    )
    DELETE FROM public.telegram_deliveries target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 2. signal_updates: outcome/status tracking rows behind signal_analytics_view.
  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.signal_updates LIMIT batch_size)
    DELETE FROM public.signal_updates target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 3. Optional newer outcome tables, if present in a deployed database.
  IF to_regclass('public.signal_outcomes') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'signal_outcomes' AND column_name = 'signal_id') INTO has_signal_id;
    IF has_signal_id THEN
      EXECUTE format('WITH doomed AS (SELECT ctid FROM public.signal_outcomes WHERE signal_id IS NOT NULL LIMIT %s) DELETE FROM public.signal_outcomes target WHERE target.ctid IN (SELECT ctid FROM doomed)', batch_size);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      result := result || jsonb_build_object('signal_outcomes', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
    ELSE
      result := result || jsonb_build_object('signal_outcomes', jsonb_build_object('deleted_count', 0, 'status', 'no_signal_id_column'));
    END IF;
  ELSE
    result := result || jsonb_build_object('signal_outcomes', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  IF to_regclass('public.outcomes') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'outcomes' AND column_name = 'signal_id') INTO has_signal_id;
    IF has_signal_id THEN
      EXECUTE format('WITH doomed AS (SELECT ctid FROM public.outcomes WHERE signal_id IS NOT NULL LIMIT %s) DELETE FROM public.outcomes target WHERE target.ctid IN (SELECT ctid FROM doomed)', batch_size);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      result := result || jsonb_build_object('outcomes', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
    ELSE
      result := result || jsonb_build_object('outcomes', jsonb_build_object('deleted_count', 0, 'status', 'no_signal_id_column'));
    END IF;
  ELSE
    result := result || jsonb_build_object('outcomes', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 4. Execution event logs before execution orders. Support both historical column names.
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'signal_id') INTO has_signal_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_order_id') INTO has_execution_order_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_id') INTO has_execution_id;
    EXECUTE format(
      'WITH doomed AS (
         SELECT eel.ctid
         FROM public.execution_event_logs eel
         WHERE (%s)
         LIMIT %s
       )
       DELETE FROM public.execution_event_logs target
       WHERE target.ctid IN (SELECT ctid FROM doomed)',
      concat_ws(' OR ',
        CASE WHEN has_signal_id THEN 'eel.signal_id IS NOT NULL' END,
        CASE WHEN has_execution_order_id THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
        CASE WHEN has_execution_id THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
        'false'
      ),
      batch_size
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 5. DB execution history linked to signals. Does not touch Binance account/position state.
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.execution_orders WHERE signal_id IS NOT NULL LIMIT batch_size)
    DELETE FROM public.execution_orders target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('execution_orders', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_orders', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.paper_execution_intents WHERE signal_id IS NOT NULL LIMIT batch_size)
    DELETE FROM public.paper_execution_intents target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 6. Optional rejected setup table. Current UI rejected setups are strategy_candidates.status='rejected'.
  IF to_regclass('public.rejected_setups') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.rejected_setups LIMIT batch_size)
    DELETE FROM public.rejected_setups target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('rejected_setups', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('rejected_setups', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 7. Parent performance rows. FK children above are handled first.
  IF to_regclass('public.signals') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.signals LIMIT batch_size)
    DELETE FROM public.signals target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('signals', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signals', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 8. Candidate history after signals because signals.candidate_id references strategy_candidates.id.
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
    DELETE FROM public.strategy_candidates target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('strategy_candidates', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('strategy_candidates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.scanner_candidates LIMIT batch_size)
    DELETE FROM public.scanner_candidates target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    result := result || jsonb_build_object('scanner_candidates', jsonb_build_object('deleted_count', deleted, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('scanner_candidates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- Remaining counts that matter for UI verification.
  IF to_regclass('public.signals') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.signals' INTO remaining_signals; END IF;
  IF to_regclass('public.signal_updates') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.signal_updates' INTO remaining_signal_updates; END IF;
  IF to_regclass('public.signal_outcomes') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.signal_outcomes' INTO remaining_signal_outcomes; END IF;
  IF to_regclass('public.outcomes') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.outcomes' INTO remaining_outcomes; END IF;
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.strategy_candidates' INTO remaining_candidates; END IF;
  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.scanner_candidates' INTO remaining_scanner_candidates; END IF;
  IF to_regclass('public.rejected_setups') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.rejected_setups' INTO remaining_rejected_setups; END IF;
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.strategy_candidates WHERE status = ''rejected''' INTO remaining_rejected_candidates; END IF;
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.telegram_deliveries WHERE signal_id IS NOT NULL' INTO remaining_telegram_deliveries; END IF;
  IF to_regclass('public.execution_orders') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.execution_orders WHERE signal_id IS NOT NULL' INTO remaining_execution_orders; END IF;
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.paper_execution_intents WHERE signal_id IS NOT NULL' INTO remaining_paper_execution_intents; END IF;
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'signal_id') INTO has_signal_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_order_id') INTO has_execution_order_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_id') INTO has_execution_id;
    EXECUTE format(
      'SELECT count(*) FROM public.execution_event_logs eel WHERE (%s)',
      concat_ws(' OR ',
        CASE WHEN has_signal_id THEN 'eel.signal_id IS NOT NULL' END,
        CASE WHEN has_execution_order_id THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
        CASE WHEN has_execution_id THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
        'false'
      )
    ) INTO remaining_execution_event_logs;
  END IF;

  remaining := jsonb_build_object(
    'signals', remaining_signals,
    'outcomes', remaining_signal_updates + remaining_signal_outcomes + remaining_outcomes,
    'signal_updates', remaining_signal_updates,
    'signal_outcomes', remaining_signal_outcomes,
    'outcomes_table', remaining_outcomes,
    'telegram_deliveries', remaining_telegram_deliveries,
    'execution_event_logs', remaining_execution_event_logs,
    'execution_orders', remaining_execution_orders,
    'paper_execution_intents', remaining_paper_execution_intents,
    'candidates', remaining_candidates + remaining_scanner_candidates,
    'strategy_candidates', remaining_candidates,
    'scanner_candidates', remaining_scanner_candidates,
    'rejected_setups', remaining_rejected_setups + remaining_rejected_candidates
  );

  RETURN jsonb_build_object(
    'success', NOT ((remaining_signals + remaining_signal_updates + remaining_signal_outcomes + remaining_outcomes + remaining_telegram_deliveries + remaining_execution_event_logs + remaining_execution_orders + remaining_paper_execution_intents + remaining_candidates + remaining_scanner_candidates + remaining_rejected_setups) > 0),
    'reset_pass_complete', true,
    'until_empty_requested', p_until_empty,
    'reset_scope', 'performance_history_only',
    'batch_size', batch_size,
    'has_more', (remaining_signals + remaining_signal_updates + remaining_signal_outcomes + remaining_outcomes + remaining_telegram_deliveries + remaining_execution_event_logs + remaining_execution_orders + remaining_paper_execution_intents + remaining_candidates + remaining_scanner_candidates + remaining_rejected_setups) > 0,
    'dependency_delete_order', delete_order,
    'deleted_counts', result,
    'remaining_counts', remaining,
    'preserved_tables', ARRAY[
      'scanner_config','strategy_configs','execution_settings','provider settings','telegram configuration',
      'profiles','customers','subscriptions','packages','access records','bot setup records',
      'symbols','candles','market data','binance credentials','binance positions','binance account state','scanner_runs'
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
  RETURN public.admin_reset_trading_history_batch(50, true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history() TO authenticated, service_role;
