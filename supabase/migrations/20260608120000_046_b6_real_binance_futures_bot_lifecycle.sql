/*
  HASHIBOT B6 — Real Binance USD-M testnet futures lifecycle and batch reset

  - Adds explicit lifecycle/protection/time-stop columns for Binance testnet bot mode.
  - Extends execution status constraints for protected_native/protected_managed and timeout closes.
  - Replaces reset trading history with a chunked, non-timeout-prone batch reset that preserves
    customers, packages, admin profiles, strategy/scanner config, Telegram settings, bot setup,
    and execution settings.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS entry_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_stop_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS timeout_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_monitor_action text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS margin_mode text NOT NULL DEFAULT 'isolated',
  ADD COLUMN IF NOT EXISTS latest_mark_price numeric,
  ADD COLUMN IF NOT EXISTS latest_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS current_position_size numeric;

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS available_usdt numeric,
  ADD COLUMN IF NOT EXISTS available_usdc numeric,
  ADD COLUMN IF NOT EXISTS open_positions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_sync_time timestamptz,
  ADD COLUMN IF NOT EXISTS open_binance_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_binance_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_monitor_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_monitor_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS latest_monitor_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_managed_exit_action jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%status%'
        OR pg_get_constraintdef(oid) ILIKE '%protection_status%'
        OR pg_get_constraintdef(oid) ILIKE '%bracket_mode%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_b6_check
  CHECK (status IN (
    'signal_created','execution_planned','pending','entry_submitted','entry_filled','protection_submitted',
    'protected','protected_native','protected_managed','pending_protection','pending_managed_protection',
    'partially_closed','tp1_hit','sl_moved_to_be','closed_tp','closed_sl','closed_breakeven','closed_timeout',
    'closed_synced','cancelled','failed','skipped','stale_closed','sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b6_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_managed','pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_bracket_mode_b6_check
  CHECK (bracket_mode IN ('','exchange_native','managed_exit_fallback','failed')) NOT VALID;

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history_batch(p_batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_size integer := greatest(50, least(coalesce(p_batch_size, 500), 2000));
  deleted integer;
  result jsonb := '{}'::jsonb;
  targets text[] := ARRAY[
    'execution_event_logs',
    'execution_orders',
    'signal_updates',
    'signals',
    'strategy_candidates',
    'scanner_candidates',
    'rejected_setups',
    'scanner_runs'
  ];
  t text;
  total integer;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    total := 0;
    IF to_regclass('public.' || t) IS NULL THEN
      result := result || jsonb_build_object(t, 'table_not_present');
      CONTINUE;
    END IF;
    LOOP
      EXECUTE format('WITH doomed AS (SELECT ctid FROM public.%I LIMIT %s) DELETE FROM public.%I WHERE ctid IN (SELECT ctid FROM doomed)', t, batch_size, t);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object(t, total);
  END LOOP;

  result := result || jsonb_build_object('timestamp', now(), 'batch_size', batch_size, 'preserved', ARRAY[
    'customers','packages','profiles','strategy_configs','scanner_config','telegram settings','bot setup config','execution_settings'
  ]);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.admin_reset_trading_history_batch(500);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history() TO service_role;
