/*
  HASHIBOT B6.5 FINAL — performance-history reset must be truly batch-safe.

  Canonical RPC: public.admin_reset_trading_history_batch(integer, boolean).

  This function intentionally clears only performance/trading history rows. It never
  touches scanner_config, strategy_configs, execution_settings, candles, symbols,
  Telegram settings, Binance credentials/balances/positions/orders, profiles,
  customers, packages, or subscriptions.

  FK rule: signals are deleted only after signal-linked child rows are gone. In
  particular, telegram_deliveries rows linked to existing signals are counted and
  removed first, so telegram_deliveries_signal_id_fkey cannot block signal deletes.
*/

DROP FUNCTION IF EXISTS public.admin_reset_trading_history();
DROP FUNCTION IF EXISTS public.admin_reset_trading_history_batch(integer);

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
  total integer := 0;
  result jsonb := '{}'::jsonb;

  has_eel_signal_id boolean := false;
  has_eel_execution_order_id boolean := false;
  has_eel_execution_id boolean := false;

  rem_signals bigint := 0;
  rem_telegram_deliveries_linked bigint := 0;
  rem_execution_event_logs_linked bigint := 0;
  rem_execution_orders_linked bigint := 0;
  rem_paper_execution_intents_linked bigint := 0;
  rem_signal_updates bigint := 0;
  rem_signal_outcomes bigint := 0;
  rem_outcomes bigint := 0;
  rem_strategy_candidates bigint := 0;
  rem_rejected_setups bigint := 0;
  rem_scanner_runs bigint := 0;
  blocking_signal_children bigint := 0;
  total_remaining bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);

  -- 1. telegram_deliveries linked to existing signals. This is the hard FK guard.
  IF to_regclass('public.telegram_deliveries') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    LOOP
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
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 2. execution_event_logs linked directly to signals or to signal-linked execution_orders.
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'signal_id'
    ) INTO has_eel_signal_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_order_id'
    ) INTO has_eel_execution_order_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_id'
    ) INTO has_eel_execution_id;

    total := 0;
    LOOP
      EXECUTE format(
        'WITH doomed AS (
           SELECT eel.ctid
           FROM public.execution_event_logs eel
           WHERE %s
           LIMIT %s
         )
         DELETE FROM public.execution_event_logs target
         WHERE target.ctid IN (SELECT ctid FROM doomed)',
        concat_ws(' OR ',
          CASE WHEN has_eel_signal_id AND to_regclass('public.signals') IS NOT NULL
            THEN 'EXISTS (SELECT 1 FROM public.signals s WHERE s.id = eel.signal_id)' END,
          CASE WHEN has_eel_execution_order_id AND to_regclass('public.execution_orders') IS NOT NULL
            THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
          CASE WHEN has_eel_execution_id AND to_regclass('public.execution_orders') IS NOT NULL
            THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
          'false'
        ),
        batch_size
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- Count linked logs before orders. Orders are not deleted until logs are drained,
  -- otherwise SET NULL/CASCADE variants can orphan old execution history.
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE format(
      'SELECT count(*) FROM public.execution_event_logs eel WHERE %s',
      concat_ws(' OR ',
        CASE WHEN has_eel_signal_id AND to_regclass('public.signals') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.signals s WHERE s.id = eel.signal_id)' END,
        CASE WHEN has_eel_execution_order_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
        CASE WHEN has_eel_execution_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
        'false'
      )
    ) INTO rem_execution_event_logs_linked;
  END IF;

  -- 3. execution_orders linked to signals. Real Binance orders/positions are not touched.
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    total := 0;
    IF rem_execution_event_logs_linked = 0 THEN
      LOOP
        WITH doomed AS (
          SELECT ctid FROM public.execution_orders
          WHERE signal_id IS NOT NULL
          LIMIT batch_size
        )
        DELETE FROM public.execution_orders target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT;
      END LOOP;
    END IF;
    result := result || jsonb_build_object(
      'execution_orders',
      jsonb_build_object('deleted_count', total, 'status', CASE WHEN rem_execution_event_logs_linked = 0 THEN 'deleted' ELSE 'blocked_by_execution_event_logs' END)
    );
  ELSE
    result := result || jsonb_build_object('execution_orders', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 4. paper_execution_intents linked to signals, if present.
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT ctid FROM public.paper_execution_intents
        WHERE signal_id IS NOT NULL
        LIMIT batch_size
      )
      DELETE FROM public.paper_execution_intents target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 5. signal_updates linked to signals.
  IF to_regclass('public.signal_updates') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT su.ctid
        FROM public.signal_updates su
        WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = su.signal_id)
        LIMIT batch_size
      )
      DELETE FROM public.signal_updates target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 6. signal_outcomes linked to signals, if present.
  IF to_regclass('public.signal_outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT so.ctid
        FROM public.signal_outcomes so
        WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = so.signal_id)
        LIMIT batch_size
      )
      DELETE FROM public.signal_outcomes target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('signal_outcomes', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signal_outcomes', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 7. Legacy optional outcomes table linked to signals, if present.
  IF to_regclass('public.outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT o.ctid
        FROM public.outcomes o
        WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = o.signal_id)
        LIMIT batch_size
      )
      DELETE FROM public.outcomes target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    result := result || jsonb_build_object('outcomes', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('outcomes', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- Re-count blockers. Do not delete signals until all signal children are gone.
  IF to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signals FROM public.signals;
  END IF;

  IF to_regclass('public.telegram_deliveries') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_telegram_deliveries_linked
    FROM public.telegram_deliveries td
    WHERE td.signal_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id);
  END IF;

  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    SELECT count(*) INTO rem_execution_orders_linked FROM public.execution_orders WHERE signal_id IS NOT NULL;
  END IF;

  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    SELECT count(*) INTO rem_paper_execution_intents_linked FROM public.paper_execution_intents WHERE signal_id IS NOT NULL;
  END IF;

  IF to_regclass('public.signal_updates') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signal_updates
    FROM public.signal_updates su
    WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = su.signal_id);
  END IF;

  IF to_regclass('public.signal_outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signal_outcomes
    FROM public.signal_outcomes so
    WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = so.signal_id);
  END IF;

  IF to_regclass('public.outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_outcomes
    FROM public.outcomes o
    WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = o.signal_id);
  END IF;

  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'signal_id'
    ) INTO has_eel_signal_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_order_id'
    ) INTO has_eel_execution_order_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'execution_event_logs' AND column_name = 'execution_id'
    ) INTO has_eel_execution_id;
    EXECUTE format(
      'SELECT count(*) FROM public.execution_event_logs eel WHERE %s',
      concat_ws(' OR ',
        CASE WHEN has_eel_signal_id AND to_regclass('public.signals') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.signals s WHERE s.id = eel.signal_id)' END,
        CASE WHEN has_eel_execution_order_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
        CASE WHEN has_eel_execution_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
        'false'
      )
    ) INTO rem_execution_event_logs_linked;
  END IF;

  blocking_signal_children := rem_telegram_deliveries_linked + rem_execution_event_logs_linked +
    rem_execution_orders_linked + rem_paper_execution_intents_linked + rem_signal_updates + rem_signal_outcomes + rem_outcomes;

  -- 8. signals, only after the FK hard-check is clean.
  IF to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    IF blocking_signal_children = 0 THEN
      LOOP
        WITH doomed AS (SELECT id FROM public.signals LIMIT batch_size)
        DELETE FROM public.signals target
        WHERE target.id IN (SELECT id FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT;
      END LOOP;
      SELECT count(*) INTO rem_signals FROM public.signals;
    END IF;
    result := result || jsonb_build_object(
      'signals',
      jsonb_build_object(
        'deleted_count', total,
        'status', CASE WHEN blocking_signal_children = 0 THEN 'deleted' ELSE 'blocked_by_child_rows' END
      )
    );
  ELSE
    result := result || jsonb_build_object('signals', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 9. strategy_candidates after signals no longer reference them.
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    total := 0;
    IF rem_signals = 0 THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
        DELETE FROM public.strategy_candidates target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT;
      END LOOP;
    END IF;
    SELECT count(*) INTO rem_strategy_candidates FROM public.strategy_candidates;
    result := result || jsonb_build_object(
      'strategy_candidates',
      jsonb_build_object('deleted_count', total, 'status', CASE WHEN rem_signals = 0 THEN 'deleted' ELSE 'blocked_by_signals' END)
    );
  ELSE
    result := result || jsonb_build_object('strategy_candidates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 10. rejected_setups.
  IF to_regclass('public.rejected_setups') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (SELECT ctid FROM public.rejected_setups LIMIT batch_size)
      DELETE FROM public.rejected_setups target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT;
    END LOOP;
    SELECT count(*) INTO rem_rejected_setups FROM public.rejected_setups;
    result := result || jsonb_build_object('rejected_setups', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('rejected_setups', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 11. scanner_runs are history/performance rows. Delete after candidate/reject rows.
  IF to_regclass('public.scanner_runs') IS NOT NULL THEN
    total := 0;
    IF coalesce(rem_strategy_candidates, 0) = 0 AND coalesce(rem_rejected_setups, 0) = 0 THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.scanner_runs LIMIT batch_size)
        DELETE FROM public.scanner_runs target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT;
      END LOOP;
    END IF;
    SELECT count(*) INTO rem_scanner_runs FROM public.scanner_runs;
    result := result || jsonb_build_object(
      'scanner_runs',
      jsonb_build_object('deleted_count', total, 'status', CASE WHEN coalesce(rem_strategy_candidates, 0) = 0 AND coalesce(rem_rejected_setups, 0) = 0 THEN 'deleted' ELSE 'blocked_by_candidates_or_rejections' END)
    );
  ELSE
    result := result || jsonb_build_object('scanner_runs', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- Final counts after this bounded pass.
  IF to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signals FROM public.signals;
  END IF;
  IF to_regclass('public.telegram_deliveries') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_telegram_deliveries_linked
    FROM public.telegram_deliveries td
    WHERE td.signal_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id);
  END IF;
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    SELECT count(*) INTO rem_execution_orders_linked FROM public.execution_orders WHERE signal_id IS NOT NULL;
  END IF;
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    SELECT count(*) INTO rem_paper_execution_intents_linked FROM public.paper_execution_intents WHERE signal_id IS NOT NULL;
  END IF;
  IF to_regclass('public.signal_updates') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signal_updates FROM public.signal_updates su WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = su.signal_id);
  END IF;
  IF to_regclass('public.signal_outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_signal_outcomes FROM public.signal_outcomes so WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = so.signal_id);
  END IF;
  IF to_regclass('public.outcomes') IS NOT NULL AND to_regclass('public.signals') IS NOT NULL THEN
    SELECT count(*) INTO rem_outcomes FROM public.outcomes o WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = o.signal_id);
  END IF;
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE format(
      'SELECT count(*) FROM public.execution_event_logs eel WHERE %s',
      concat_ws(' OR ',
        CASE WHEN has_eel_signal_id AND to_regclass('public.signals') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.signals s WHERE s.id = eel.signal_id)' END,
        CASE WHEN has_eel_execution_order_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_order_id AND eo.signal_id IS NOT NULL)' END,
        CASE WHEN has_eel_execution_id AND to_regclass('public.execution_orders') IS NOT NULL
          THEN 'EXISTS (SELECT 1 FROM public.execution_orders eo WHERE eo.id = eel.execution_id AND eo.signal_id IS NOT NULL)' END,
        'false'
      )
    ) INTO rem_execution_event_logs_linked;
  END IF;
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    SELECT count(*) INTO rem_strategy_candidates FROM public.strategy_candidates;
  END IF;
  IF to_regclass('public.rejected_setups') IS NOT NULL THEN
    SELECT count(*) INTO rem_rejected_setups FROM public.rejected_setups;
  END IF;
  IF to_regclass('public.scanner_runs') IS NOT NULL THEN
    SELECT count(*) INTO rem_scanner_runs FROM public.scanner_runs;
  END IF;

  total_remaining := rem_signals + rem_telegram_deliveries_linked + rem_execution_event_logs_linked +
    rem_execution_orders_linked + rem_paper_execution_intents_linked + rem_signal_updates + rem_signal_outcomes + rem_outcomes +
    rem_strategy_candidates + rem_rejected_setups + rem_scanner_runs;

  RETURN jsonb_build_object(
    'success', total_remaining = 0,
    'reset_scope', 'performance_history_only',
    'batch_size', batch_size,
    'until_empty_requested', p_until_empty,
    'has_more', total_remaining > 0,
    'dependency_delete_order', ARRAY[
      'telegram_deliveries linked to signals',
      'execution_event_logs linked to signals/orders',
      'execution_orders linked to signals',
      'paper_execution_intents linked to signals',
      'signal_updates linked to signals',
      'signal_outcomes/outcomes linked to signals',
      'signals',
      'strategy_candidates',
      'rejected_setups',
      'scanner_runs'
    ],
    'deleted_counts', result,
    'remaining_counts', jsonb_build_object(
      'signals', rem_signals,
      'telegram_deliveries_linked_to_signals', rem_telegram_deliveries_linked,
      'telegram_deliveries', rem_telegram_deliveries_linked,
      'execution_event_logs_linked', rem_execution_event_logs_linked,
      'execution_orders', rem_execution_orders_linked,
      'paper_execution_intents', rem_paper_execution_intents_linked,
      'signal_updates', rem_signal_updates,
      'signal_outcomes', rem_signal_outcomes,
      'outcomes', rem_outcomes,
      'strategy_candidates', rem_strategy_candidates,
      'rejected_setups', rem_rejected_setups,
      'scanner_runs', rem_scanner_runs
    ),
    'preserved_tables', ARRAY[
      'scanner_config','strategy_configs','execution_settings','candles','symbols',
      'telegram settings','binance credentials','binance balances','binance positions','binance orders',
      'profiles','customers','packages','subscriptions'
    ],
    'completed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history_batch(integer, boolean) TO authenticated, service_role;
