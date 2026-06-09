/*
  HASHIBOT B6.5 RESET FINAL HOTFIX — true small-batch performance reset.

  The reset RPC must do only one lightweight delete per call. It intentionally
  does not touch scanner_runs, scanner_config, strategy_configs,
  execution_settings, candles, symbols, Telegram config, Binance credentials,
  Binance positions/orders, customers, packages, subscriptions, or profiles.
*/

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history_batch(
  p_batch_size integer DEFAULT 25,
  p_until_empty boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_size integer := greatest(1, least(coalesce(p_batch_size, 25), 25));
  deleted integer := 0;
  step_name text := 'complete';
  status_text text := 'complete';

  has_eel_signal_id boolean := false;
  has_eel_execution_order_id boolean := false;
  has_eel_execution_id boolean := false;
  linked_log_predicate text := 'false';

  rem_signals integer := 0;
  rem_telegram_deliveries_linked integer := 0;
  rem_execution_orders_linked integer := 0;
  rem_signal_updates integer := 0;
  rem_signal_outcomes integer := 0;
  rem_strategy_candidates integer := 0;
  rem_rejected_setups integer := 0;
  rem_execution_event_logs_linked integer := 0;
  total_remaining integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);

  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.execution_event_logs'::regclass AND attname = 'signal_id' AND NOT attisdropped
    ) INTO has_eel_signal_id;
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.execution_event_logs'::regclass AND attname = 'execution_order_id' AND NOT attisdropped
    ) INTO has_eel_execution_order_id;
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.execution_event_logs'::regclass AND attname = 'execution_id' AND NOT attisdropped
    ) INTO has_eel_execution_id;

    linked_log_predicate := concat_ws(' OR ',
      CASE WHEN has_eel_signal_id AND to_regclass('public.signals') IS NOT NULL
        THEN 'EXISTS (SELECT 1 FROM public.signals s WHERE s.id = eel.signal_id)' END,
      CASE WHEN has_eel_execution_order_id AND to_regclass('public.execution_orders') IS NOT NULL
        THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
      CASE WHEN has_eel_execution_id AND to_regclass('public.execution_orders') IS NOT NULL
        THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
      'false'
    );
  END IF;

  -- Delete at most one dependency group per call, in strict child-first order.
  IF to_regclass('public.telegram_deliveries') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    WITH doomed AS (
      SELECT td.ctid
      FROM public.telegram_deliveries td
      WHERE td.signal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id)
      LIMIT batch_size
    )
    DELETE FROM public.telegram_deliveries target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'telegram_deliveries';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE format(
      'WITH doomed AS (
         SELECT eel.ctid
         FROM public.execution_event_logs eel
         WHERE %s
         LIMIT %s
       )
       DELETE FROM public.execution_event_logs target
       WHERE target.ctid IN (SELECT ctid FROM doomed)',
      linked_log_predicate,
      batch_size
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'execution_event_logs';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.execution_orders') IS NOT NULL THEN
    WITH doomed AS (
      SELECT ctid FROM public.execution_orders
      WHERE signal_id IS NOT NULL
      LIMIT batch_size
    )
    DELETE FROM public.execution_orders target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'execution_orders';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.signal_updates') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.signal_updates LIMIT batch_size)
    DELETE FROM public.signal_updates target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'signal_updates';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.signal_outcomes') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.signal_outcomes LIMIT batch_size)
    DELETE FROM public.signal_outcomes target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'signal_outcomes';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.signals') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.signals LIMIT batch_size)
    DELETE FROM public.signals target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'signals';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.strategy_candidates') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
    DELETE FROM public.strategy_candidates target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'strategy_candidates';
      status_text := 'deleted';
    END IF;
  END IF;

  IF deleted = 0 AND to_regclass('public.rejected_setups') IS NOT NULL THEN
    WITH doomed AS (SELECT ctid FROM public.rejected_setups LIMIT batch_size)
    DELETE FROM public.rejected_setups target
    WHERE target.ctid IN (SELECT ctid FROM doomed);
    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted > 0 THEN
      step_name := 'rejected_setups';
      status_text := 'deleted';
    END IF;
  END IF;

  -- Bounded remaining probes: each count stops after batch_size + 1 rows, enough
  -- to prove zero/success without global COUNT(*) scans on large history tables.
  IF to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_signals
    FROM (SELECT 1 FROM public.signals LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.telegram_deliveries') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_telegram_deliveries_linked
    FROM (
      SELECT 1
      FROM public.telegram_deliveries td
      WHERE td.signal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id)
      LIMIT batch_size + 1
    ) remaining;
  END IF;

  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_execution_orders_linked
    FROM (SELECT 1 FROM public.execution_orders WHERE signal_id IS NOT NULL LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_signal_updates
    FROM (SELECT 1 FROM public.signal_updates LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.signal_outcomes') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_signal_outcomes
    FROM (SELECT 1 FROM public.signal_outcomes LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_strategy_candidates
    FROM (SELECT 1 FROM public.strategy_candidates LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.rejected_setups') IS NOT NULL THEN
    SELECT count(*)::integer INTO rem_rejected_setups
    FROM (SELECT 1 FROM public.rejected_setups LIMIT batch_size + 1) remaining;
  END IF;

  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE format(
      'SELECT count(*)::integer
       FROM (
         SELECT 1 FROM public.execution_event_logs eel WHERE %s LIMIT %s
       ) remaining',
      linked_log_predicate,
      batch_size + 1
    ) INTO rem_execution_event_logs_linked;
  END IF;

  total_remaining := rem_signals + rem_telegram_deliveries_linked + rem_execution_orders_linked +
    rem_signal_updates + rem_signal_outcomes + rem_strategy_candidates + rem_rejected_setups +
    rem_execution_event_logs_linked;

  RETURN jsonb_build_object(
    'success', total_remaining = 0,
    'has_more', total_remaining > 0,
    'step', step_name,
    'deleted_count', deleted,
    'batch_size', batch_size,
    'until_empty_requested', p_until_empty,
    'remaining_counts_are_bounded', true,
    'remaining_count_cap', batch_size + 1,
    'deleted_counts', jsonb_build_object(
      step_name,
      jsonb_build_object('deleted_count', deleted, 'status', status_text)
    ),
    'remaining_counts', jsonb_build_object(
      'signals', rem_signals,
      'telegram_deliveries_linked_to_signals', rem_telegram_deliveries_linked,
      'execution_event_logs_linked', rem_execution_event_logs_linked,
      'execution_orders', rem_execution_orders_linked,
      'signal_updates', rem_signal_updates,
      'signal_outcomes', rem_signal_outcomes,
      'strategy_candidates', rem_strategy_candidates,
      'rejected_setups', rem_rejected_setups
    ),
    'reset_scope', 'performance_history_only',
    'preserved_tables', ARRAY[
      'scanner_runs','scanner_config','strategy_configs','execution_settings','candles','symbols',
      'telegram config','binance credentials','binance positions','binance orders',
      'profiles','customers','packages','subscriptions'
    ],
    'completed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) TO authenticated, service_role;
