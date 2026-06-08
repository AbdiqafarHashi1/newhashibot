/*
  HASHIBOT B6.2 — separate performance-history reset from testnet governor reset

  Separation contract:
  - admin_reset_trading_history* is performance/history-only. It clears signal,
    scanner, candidate/rejection, Telegram-delivery, outcome, and linked DB
    execution history rows in dependency-safe batches.
  - It preserves scanner_config, strategy_configs, execution_settings, customers,
    packages, subscriptions, profiles, Telegram setup/config, bot setup records,
    Binance credentials/secrets, Binance account snapshots, and real Binance
    positions/orders. It does not disable the scanner and does not reset governor.
  - Governor streak fields are persisted in execution_settings so deleting old DB
    history rows does not silently clear a governor pause/lockout.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS failed_execution_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_sl_streak integer NOT NULL DEFAULT 0;

UPDATE public.execution_settings
SET failed_execution_streak = GREATEST(failed_execution_streak, max_consecutive_failed_executions)
WHERE id = 1
  AND governor_state = 'paused'
  AND last_governor_reason = 'consecutive_failed_executions_limit';

UPDATE public.execution_settings
SET closed_sl_streak = GREATEST(closed_sl_streak, max_consecutive_closed_sl)
WHERE id = 1
  AND governor_state = 'paused'
  AND last_governor_reason = 'consecutive_closed_sl_limit';

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
    'paper_execution_intents',
    'execution_orders',
    'signal_updates',
    'signal_outcomes',
    'outcomes',
    'signals',
    'strategy_candidates',
    'scanner_candidates',
    'rejected_setups',
    'scanner_runs'
  ];
  has_signal_id boolean;
  has_execution_order_id boolean;
  has_execution_id boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('statement_timeout', '0', true);
  PERFORM set_config('lock_timeout', '5s', true);

  FOREACH t IN ARRAY dependency_order LOOP
    total := 0;

    IF to_regclass('public.' || t) IS NULL THEN
      result := result || jsonb_build_object(t, jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
      CONTINUE;
    END IF;

    IF t = 'execution_event_logs' THEN
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'signal_id') INTO has_signal_id;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'execution_order_id') INTO has_execution_order_id;
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'execution_id') INTO has_execution_id;

      LOOP
        EXECUTE format(
          'WITH doomed AS (
             SELECT eel.ctid
             FROM public.execution_event_logs eel
             WHERE (%s)
             LIMIT %s
           )
           DELETE FROM public.execution_event_logs AS target
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
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSIF t = 'execution_orders' THEN
      LOOP
        EXECUTE format(
          'WITH doomed AS (SELECT ctid FROM public.execution_orders WHERE signal_id IS NOT NULL LIMIT %s)
           DELETE FROM public.execution_orders AS target WHERE target.ctid IN (SELECT ctid FROM doomed)',
          batch_size
        );
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    ELSE
      LOOP
        EXECUTE format(
          'WITH doomed AS (SELECT ctid FROM public.%I LIMIT %s)
           DELETE FROM public.%I AS target WHERE target.ctid IN (SELECT ctid FROM doomed)',
          t,
          batch_size,
          t
        );
        GET DIAGNOSTICS deleted = ROW_COUNT;
        total := total + deleted;
        EXIT WHEN deleted = 0;
      END LOOP;
    END IF;

    result := result || jsonb_build_object(t, jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reset_scope', 'performance_history_only',
    'batch_size', batch_size,
    'dependency_delete_order', dependency_order,
    'deleted_counts', result,
    'preserved_tables', ARRAY[
      'customers','packages','subscriptions','profiles','admin profiles','scanner_config',
      'strategy_configs','execution_settings','telegram config','bot setup records',
      'binance credentials/secrets','binance account balance snapshots','candles','symbols','provider config'
    ],
    'not_performed', ARRAY[
      'governor reset','scanner disable','binance position close','binance order cancel',
      'strategy change','scanner config change','execution settings reset'
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
