/*
  HASHIBOT B6.5 HOTFIX — admin_reset_trading_history_batch single-pass mode

  When p_until_empty = false: performs ONE delete of p_batch_size rows per table.
  When p_until_empty = true : loops until each table is empty (legacy full-drain).

  The JS caller (Performance.tsx) calls with p_until_empty=false in a loop, checking
  has_more after each call, to avoid statement timeout on large datasets.

  Also adds to_regclass guards for rejected_setups and signal_outcomes (not yet
  provisioned but cleared if present).
*/

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history_batch(
  p_batch_size integer DEFAULT 50,
  p_until_empty boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  batch_size integer := greatest(10, least(coalesce(p_batch_size, 25), 200));
  deleted   integer := 0;
  total     integer := 0;
  result    jsonb   := '{}'::jsonb;

  -- column existence flags
  has_signal_id           boolean;
  has_execution_order_id  boolean;
  has_execution_id        boolean;

  -- remaining counts
  rem_signals              bigint := 0;
  rem_signal_updates       bigint := 0;
  rem_telegram_deliveries  bigint := 0;
  rem_execution_event_logs bigint := 0;
  rem_execution_orders     bigint := 0;
  rem_paper_intents        bigint := 0;
  rem_strategy_candidates  bigint := 0;
  rem_scanner_candidates   bigint := 0;
  rem_rejected_setups      bigint := 0;
  rem_signal_outcomes      bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);

  -- ── 1. telegram_deliveries (signal-linked only) ──────────────────────────
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (
          SELECT td.ctid FROM public.telegram_deliveries td
          WHERE td.signal_id IS NOT NULL LIMIT batch_size
        )
        DELETE FROM public.telegram_deliveries target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (
        SELECT td.ctid FROM public.telegram_deliveries td
        WHERE td.signal_id IS NOT NULL LIMIT batch_size
      )
      DELETE FROM public.telegram_deliveries target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('telegram_deliveries',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('telegram_deliveries',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 2. signal_updates ────────────────────────────────────────────────────
  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.signal_updates LIMIT batch_size)
        DELETE FROM public.signal_updates target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.signal_updates LIMIT batch_size)
      DELETE FROM public.signal_updates target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('signal_updates',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signal_updates',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 3. signal_outcomes ───────────────────────────────────────────────────
  IF to_regclass('public.signal_outcomes') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.signal_outcomes LIMIT batch_size)
        DELETE FROM public.signal_outcomes target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.signal_outcomes LIMIT batch_size)
      DELETE FROM public.signal_outcomes target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('signal_outcomes',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  END IF;

  -- ── 4. execution_event_logs ──────────────────────────────────────────────
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='signal_id'
    ) INTO has_signal_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='execution_order_id'
    ) INTO has_execution_order_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='execution_id'
    ) INTO has_execution_id;

    total := 0;
    IF p_until_empty THEN
      LOOP
        EXECUTE format(
          'WITH doomed AS (
             SELECT eel.ctid FROM public.execution_event_logs eel
             WHERE (%s) LIMIT %s
           )
           DELETE FROM public.execution_event_logs target
           WHERE target.ctid IN (SELECT ctid FROM doomed)',
          concat_ws(' OR ',
            CASE WHEN has_signal_id          THEN 'eel.signal_id IS NOT NULL' END,
            CASE WHEN has_execution_order_id THEN 'eel.execution_order_id IS NOT NULL' END,
            CASE WHEN has_execution_id       THEN 'eel.execution_id IS NOT NULL' END,
            'false'
          ),
          batch_size
        );
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      EXECUTE format(
        'WITH doomed AS (
           SELECT eel.ctid FROM public.execution_event_logs eel
           WHERE (%s) LIMIT %s
         )
         DELETE FROM public.execution_event_logs target
         WHERE target.ctid IN (SELECT ctid FROM doomed)',
        concat_ws(' OR ',
          CASE WHEN has_signal_id          THEN 'eel.signal_id IS NOT NULL' END,
          CASE WHEN has_execution_order_id THEN 'eel.execution_order_id IS NOT NULL' END,
          CASE WHEN has_execution_id       THEN 'eel.execution_id IS NOT NULL' END,
          'false'
        ),
        batch_size
      );
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('execution_event_logs',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_event_logs',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 5. execution_orders (signal-linked only) ─────────────────────────────
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (
          SELECT ctid FROM public.execution_orders
          WHERE signal_id IS NOT NULL LIMIT batch_size
        )
        DELETE FROM public.execution_orders target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (
        SELECT ctid FROM public.execution_orders
        WHERE signal_id IS NOT NULL LIMIT batch_size
      )
      DELETE FROM public.execution_orders target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('execution_orders',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_orders',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 6. paper_execution_intents (signal-linked only) ──────────────────────
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (
          SELECT ctid FROM public.paper_execution_intents
          WHERE signal_id IS NOT NULL LIMIT batch_size
        )
        DELETE FROM public.paper_execution_intents target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (
        SELECT ctid FROM public.paper_execution_intents
        WHERE signal_id IS NOT NULL LIMIT batch_size
      )
      DELETE FROM public.paper_execution_intents target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('paper_execution_intents',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('paper_execution_intents',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 7. signals ───────────────────────────────────────────────────────────
  IF to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.signals LIMIT batch_size)
        DELETE FROM public.signals target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.signals LIMIT batch_size)
      DELETE FROM public.signals target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('signals',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signals',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 8. strategy_candidates ───────────────────────────────────────────────
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
        DELETE FROM public.strategy_candidates target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
      DELETE FROM public.strategy_candidates target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('strategy_candidates',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('strategy_candidates',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 9. scanner_candidates ────────────────────────────────────────────────
  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.scanner_candidates LIMIT batch_size)
        DELETE FROM public.scanner_candidates target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.scanner_candidates LIMIT batch_size)
      DELETE FROM public.scanner_candidates target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('scanner_candidates',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('scanner_candidates',
      jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- ── 10. rejected_setups (if table exists) ────────────────────────────────
  IF to_regclass('public.rejected_setups') IS NOT NULL THEN
    total := 0;
    IF p_until_empty THEN
      LOOP
        WITH doomed AS (SELECT ctid FROM public.rejected_setups LIMIT batch_size)
        DELETE FROM public.rejected_setups target
        WHERE target.ctid IN (SELECT ctid FROM doomed);
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      WITH doomed AS (SELECT ctid FROM public.rejected_setups LIMIT batch_size)
      DELETE FROM public.rejected_setups target
      WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS total = ROW_COUNT;
    END IF;
    result := result || jsonb_build_object('rejected_setups',
      jsonb_build_object('deleted_count', total, 'status', 'deleted'));
    EXECUTE 'SELECT count(*) FROM public.rejected_setups' INTO rem_rejected_setups;
  END IF;

  -- ── Remaining counts ─────────────────────────────────────────────────────
  IF to_regclass('public.signals') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.signals' INTO rem_signals;
  END IF;
  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.signal_updates' INTO rem_signal_updates;
  END IF;
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.telegram_deliveries WHERE signal_id IS NOT NULL'
      INTO rem_telegram_deliveries;
  END IF;
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.execution_event_logs' INTO rem_execution_event_logs;
  END IF;
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.execution_orders WHERE signal_id IS NOT NULL'
      INTO rem_execution_orders;
  END IF;
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.paper_execution_intents WHERE signal_id IS NOT NULL'
      INTO rem_paper_intents;
  END IF;
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.strategy_candidates' INTO rem_strategy_candidates;
  END IF;
  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.scanner_candidates' INTO rem_scanner_candidates;
  END IF;
  IF to_regclass('public.signal_outcomes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.signal_outcomes' INTO rem_signal_outcomes;
  END IF;

  DECLARE
    total_remaining bigint :=
      rem_signals + rem_signal_updates + rem_telegram_deliveries +
      rem_execution_orders + rem_paper_intents +
      rem_strategy_candidates + rem_scanner_candidates +
      rem_execution_event_logs + rem_rejected_setups + rem_signal_outcomes;
  BEGIN
    RETURN jsonb_build_object(
      'success',              total_remaining = 0,
      'reset_scope',          'performance_history_only',
      'batch_size',           batch_size,
      'until_empty_requested', p_until_empty,
      'has_more',             total_remaining > 0,
      'deleted_counts',       result,
      'remaining_counts',     jsonb_build_object(
        'signals',              rem_signals,
        'signal_updates',       rem_signal_updates,
        'telegram_deliveries',  rem_telegram_deliveries,
        'execution_event_logs', rem_execution_event_logs,
        'execution_orders',     rem_execution_orders,
        'paper_execution_intents', rem_paper_intents,
        'strategy_candidates',  rem_strategy_candidates,
        'scanner_candidates',   rem_scanner_candidates,
        'rejected_setups',      rem_rejected_setups,
        'signal_outcomes',      rem_signal_outcomes
      ),
      'preserved_tables', ARRAY[
        'scanner_config','strategy_configs','execution_settings',
        'profiles','customers','packages','subscriptions',
        'telegram_links','scanner_runs','candles','symbols'
      ],
      'completed_at', now()
    );
  END;
END;
$$;
