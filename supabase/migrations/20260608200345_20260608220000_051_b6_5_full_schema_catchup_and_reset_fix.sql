/*
  HASHIBOT B6.5 — Full schema catch-up (migrations 038-050) + reset RPC fix

  Applies all schema changes from unapplied migrations 038-050 in a single
  idempotent pass. Every ALTER TABLE uses ADD COLUMN IF NOT EXISTS. Constraints
  that conflict with prior versions are dropped and replaced. The canonical
  admin_reset_trading_history_batch(integer, boolean) is installed at the end.

  Scope: execution_orders, execution_settings, execution_event_logs,
         strategy_configs, scanner_config, reset RPC.
  Not touched: signals, providers, Telegram, forex, live trading, strategies.
*/

-- ===========================================================================
-- 1. execution_orders: add all Binance testnet columns (idempotent)
-- ===========================================================================

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'binance_usdm_testnet',
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'testnet',
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS leverage numeric,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS entry_order_id text,
  ADD COLUMN IF NOT EXISTS sl_order_id text,
  ADD COLUMN IF NOT EXISTS tp1_order_id text,
  ADD COLUMN IF NOT EXISTS tp2_order_id text,
  ADD COLUMN IF NOT EXISTS raw_exchange_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS testnet_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_exchange_error text,
  ADD COLUMN IF NOT EXISTS bracket_mode text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protection_status text NOT NULL DEFAULT 'unprotected',
  ADD COLUMN IF NOT EXISTS capital_basis text,
  ADD COLUMN IF NOT EXISTS raw_total_margin_balance numeric,
  ADD COLUMN IF NOT EXISTS raw_total_wallet_balance numeric,
  ADD COLUMN IF NOT EXISTS raw_available_usdt numeric,
  ADD COLUMN IF NOT EXISTS raw_available_usdc numeric,
  ADD COLUMN IF NOT EXISTS selected_capital_used numeric,
  ADD COLUMN IF NOT EXISTS max_capital_cap_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_pct numeric,
  ADD COLUMN IF NOT EXISTS risk_amount numeric,
  ADD COLUMN IF NOT EXISTS notional numeric,
  ADD COLUMN IF NOT EXISTS leverage_source text,
  ADD COLUMN IF NOT EXISTS latest_auto_skip_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS breakeven_sl_order_id text,
  ADD COLUMN IF NOT EXISTS tp1_filled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sl_moved_to_be boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS be_stop_level numeric,
  ADD COLUMN IF NOT EXISTS latest_protection_error text,
  ADD COLUMN IF NOT EXISTS current_open_risk_pct numeric,
  ADD COLUMN IF NOT EXISTS total_open_risk_after_trade numeric,
  ADD COLUMN IF NOT EXISTS governor_state text,
  ADD COLUMN IF NOT EXISTS governor_reason text,
  ADD COLUMN IF NOT EXISTS risk_multiplier numeric,
  ADD COLUMN IF NOT EXISTS adjusted_risk_pct numeric,
  ADD COLUMN IF NOT EXISTS adjusted_max_leverage numeric,
  ADD COLUMN IF NOT EXISTS binance_entry_order_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS binance_sl_order_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS binance_tp1_order_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS binance_tp2_order_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS intended_sl numeric,
  ADD COLUMN IF NOT EXISTS intended_tp1 numeric,
  ADD COLUMN IF NOT EXISTS intended_tp2 numeric,
  ADD COLUMN IF NOT EXISTS tp1_quantity numeric,
  ADD COLUMN IF NOT EXISTS tp2_quantity numeric,
  ADD COLUMN IF NOT EXISTS remaining_quantity numeric,
  ADD COLUMN IF NOT EXISTS tp1_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tp2_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sl_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_cleanup_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_position_size numeric,
  ADD COLUMN IF NOT EXISTS latest_mark_price numeric,
  ADD COLUMN IF NOT EXISTS latest_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS latest_account_total_margin_balance numeric,
  ADD COLUMN IF NOT EXISTS latest_account_total_wallet_balance numeric,
  ADD COLUMN IF NOT EXISTS latest_available_usdt numeric,
  ADD COLUMN IF NOT EXISTS latest_available_usdc numeric,
  ADD COLUMN IF NOT EXISTS latest_sync_at timestamptz,
  -- B6 lifecycle columns
  ADD COLUMN IF NOT EXISTS entry_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_stop_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS timeout_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_monitor_action text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS margin_mode text NOT NULL DEFAULT 'isolated',
  -- B6.4 algo TP/SL identifiers
  ADD COLUMN IF NOT EXISTS sl_algo_id text,
  ADD COLUMN IF NOT EXISTS tp1_algo_id text,
  ADD COLUMN IF NOT EXISTS tp2_algo_id text,
  ADD COLUMN IF NOT EXISTS sl_client_algo_id text,
  ADD COLUMN IF NOT EXISTS tp1_client_algo_id text,
  ADD COLUMN IF NOT EXISTS tp2_client_algo_id text,
  ADD COLUMN IF NOT EXISTS native_protection_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_fallback_active boolean NOT NULL DEFAULT false;

-- Sync legacy order ID columns to binance_ prefixed equivalents
UPDATE public.execution_orders
SET binance_entry_order_id = COALESCE(NULLIF(binance_entry_order_id, ''), entry_order_id, ''),
    binance_sl_order_id    = COALESCE(NULLIF(binance_sl_order_id, ''), sl_order_id, ''),
    binance_tp1_order_id   = COALESCE(NULLIF(binance_tp1_order_id, ''), tp1_order_id, ''),
    binance_tp2_order_id   = COALESCE(NULLIF(binance_tp2_order_id, ''), tp2_order_id, '')
WHERE COALESCE(binance_entry_order_id, '') = ''
   OR COALESCE(binance_sl_order_id, '') = ''
   OR COALESCE(binance_tp1_order_id, '') = ''
   OR COALESCE(binance_tp2_order_id, '') = '';

-- Drop all prior status/protection/bracket constraints and replace with final canonical set
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
        OR pg_get_constraintdef(oid) ILIKE '%environment%'
        OR pg_get_constraintdef(oid) ILIKE '%governor_state%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_b6_5_check
  CHECK (status IN (
    'pending','signal_created','execution_planned','entry_submitted','entry_filled',
    'protection_submitted','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','partially_closed',
    'tp1_hit','sl_moved_to_be','closed_tp','closed_sl','closed_breakeven','closed_timeout',
    'closed_synced','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b6_5_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_bracket_mode_b6_5_check
  CHECK (bracket_mode IN ('','exchange_native','managed_exit_fallback','failed')) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_environment_b6_5_check
  CHECK (environment IN ('testnet','live')) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_governor_state_b6_5_check
  CHECK (governor_state IS NULL OR governor_state IN ('normal','defensive','aggressive_allowed','paused')) NOT VALID;

-- Indexes
CREATE INDEX IF NOT EXISTS execution_orders_signal_status_idx ON public.execution_orders(signal_id, status);
CREATE INDEX IF NOT EXISTS execution_orders_symbol_status_idx ON public.execution_orders(symbol, status);
CREATE UNIQUE INDEX IF NOT EXISTS execution_orders_signal_exchange_env_unique
  ON public.execution_orders(signal_id, exchange, environment)
  WHERE signal_id IS NOT NULL;

-- ===========================================================================
-- 2. execution_settings: create table if missing, then add all columns
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.execution_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1)
);

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'signal_only',
  ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'binance_usdm_testnet',
  ADD COLUMN IF NOT EXISTS testnet_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_trading_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_execute_testnet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_open_testnet_positions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_open_testnet_positions_allowed_max integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_total_open_risk_pct numeric NOT NULL DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS one_active_execution_per_symbol boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS testnet_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_account_balance numeric NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS capital_basis text NOT NULL DEFAULT 'available_usdt',
  ADD COLUMN IF NOT EXISTS testnet_capital_override_usdt numeric,
  ADD COLUMN IF NOT EXISTS max_capital_used_usdt numeric,
  ADD COLUMN IF NOT EXISTS testnet_risk_a numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS testnet_risk_a_plus numeric NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS max_testnet_risk_pct numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS testnet_leverage_a integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS testnet_leverage_a_plus integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS testnet_max_leverage integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS governor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS governor_state text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS daily_start_equity numeric,
  ADD COLUMN IF NOT EXISTS current_equity numeric,
  ADD COLUMN IF NOT EXISTS daily_realized_pnl numeric,
  ADD COLUMN IF NOT EXISTS daily_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS daily_pnl_pct numeric,
  ADD COLUMN IF NOT EXISTS max_daily_loss_pct numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS max_unrealized_drawdown_pct numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS aggressive_allowed_profit_pct numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS defensive_loss_pct numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS max_consecutive_failed_executions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_consecutive_closed_sl integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS failed_execution_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_sl_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_governor_reason text,
  ADD COLUMN IF NOT EXISTS last_governor_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_account_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_account_state_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_total_margin_balance numeric,
  ADD COLUMN IF NOT EXISTS account_total_wallet_balance numeric,
  ADD COLUMN IF NOT EXISTS account_available_balance numeric,
  ADD COLUMN IF NOT EXISTS account_available_usdt numeric,
  ADD COLUMN IF NOT EXISTS account_available_usdc numeric,
  ADD COLUMN IF NOT EXISTS account_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS account_open_positions integer,
  ADD COLUMN IF NOT EXISTS account_margin_ratio numeric,
  ADD COLUMN IF NOT EXISTS account_open_order_count integer,
  ADD COLUMN IF NOT EXISTS latest_monitor_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_monitor_status text NOT NULL DEFAULT 'never_run',
  ADD COLUMN IF NOT EXISTS latest_monitor_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_managed_exit_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS open_binance_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_binance_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pnl_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stale_rows_cleaned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_position_size numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mark_price numeric,
  ADD COLUMN IF NOT EXISTS unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS available_usdt numeric,
  ADD COLUMN IF NOT EXISTS available_usdc numeric,
  ADD COLUMN IF NOT EXISTS current_open_risk_pct numeric,
  ADD COLUMN IF NOT EXISTS open_positions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_sync_time timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.execution_settings (id, execution_mode, exchange, testnet_enabled, live_trading_enabled, kill_switch_enabled)
VALUES (1, 'signal_only', 'binance_usdm_testnet', false, false, true)
ON CONFLICT (id) DO NOTHING;

-- Force live_trading_enabled = false always
UPDATE public.execution_settings
SET live_trading_enabled = false, updated_at = now()
WHERE live_trading_enabled IS DISTINCT FROM false;

-- Drop and re-add execution_settings constraints
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_settings'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_settings DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_id_check CHECK (id = 1),
  ADD CONSTRAINT execution_settings_live_trading_false_check CHECK (live_trading_enabled = false) NOT VALID,
  ADD CONSTRAINT execution_settings_execution_mode_check CHECK (execution_mode IN ('signal_only','disabled','testnet')) NOT VALID,
  ADD CONSTRAINT execution_settings_exchange_check CHECK (exchange = 'binance_usdm_testnet') NOT VALID,
  ADD CONSTRAINT execution_settings_capital_basis_check CHECK (capital_basis IN ('available_usdt','available_usdc_plus_usdt','total_margin_balance','total_wallet_balance','manual_override')) NOT VALID,
  ADD CONSTRAINT execution_settings_governor_state_check CHECK (governor_state IN ('normal','defensive','aggressive_allowed','paused')) NOT VALID;

ALTER TABLE public.execution_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution settings" ON public.execution_settings;
CREATE POLICY "Admins can read execution settings"
  ON public.execution_settings FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update execution settings" ON public.execution_settings;
CREATE POLICY "Admins can update execution settings"
  ON public.execution_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin() AND live_trading_enabled = false AND exchange = 'binance_usdm_testnet');

DROP POLICY IF EXISTS "Service role can update execution settings" ON public.execution_settings;
CREATE POLICY "Service role can update execution settings"
  ON public.execution_settings FOR UPDATE TO service_role
  USING (true) WITH CHECK (live_trading_enabled = false);

DROP POLICY IF EXISTS "Service role can read execution settings" ON public.execution_settings;
CREATE POLICY "Service role can read execution settings"
  ON public.execution_settings FOR SELECT TO service_role
  USING (true);

-- ===========================================================================
-- 3. execution_event_logs: create table if missing, add all columns + FKs
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.execution_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid,
  execution_order_id uuid,
  signal_id uuid,
  symbol text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_event_logs
  ADD COLUMN IF NOT EXISTS execution_id uuid,
  ADD COLUMN IF NOT EXISTS execution_order_id uuid,
  ADD COLUMN IF NOT EXISTS signal_id uuid,
  ADD COLUMN IF NOT EXISTS symbol text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_sent boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_execution_id_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_execution_id_fkey
      FOREIGN KEY (execution_id) REFERENCES public.execution_orders(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_execution_order_id_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_execution_order_id_fkey
      FOREIGN KEY (execution_order_id) REFERENCES public.execution_orders(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_signal_id_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_signal_id_fkey
      FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS execution_event_logs_execution_id_idx ON public.execution_event_logs(execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_execution_order_id_idx ON public.execution_event_logs(execution_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_event_type_idx ON public.execution_event_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_signal_id_idx ON public.execution_event_logs(signal_id, created_at DESC);

ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can read execution event logs"
  ON public.execution_event_logs FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can insert execution event logs"
  ON public.execution_event_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage execution event logs" ON public.execution_event_logs;
CREATE POLICY "Service role can manage execution event logs"
  ON public.execution_event_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ===========================================================================
-- 4. scanner_config: add Binance monitor cron columns if missing
-- ===========================================================================

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_job_name text;

-- ===========================================================================
-- 5. mark_stale_testnet_execution_orders helper function
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.mark_stale_testnet_execution_orders(
  p_symbol text DEFAULT NULL,
  p_active_statuses text[] DEFAULT ARRAY['pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','protected_managed','pending_managed_protection','protected_native'],
  p_stale_status text DEFAULT 'stale_closed',
  p_reason text DEFAULT 'binance_truth_no_position_no_orders'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_count integer := 0;
BEGIN
  UPDATE public.execution_orders
  SET status = p_stale_status,
      stale_checked_at = now(),
      stale_cleanup_reason = p_reason,
      updated_at = now()
  WHERE status = ANY(p_active_statuses)
    AND (p_symbol IS NULL OR symbol = p_symbol);
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) TO service_role;

-- ===========================================================================
-- 6. Canonical admin_reset_trading_history_batch(integer, boolean)
--    Matches the exact signature called by Performance.tsx
--    Deletes ALL FK children before parent signals in dependency-safe loops.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.admin_reset_trading_history_batch(integer);
DROP FUNCTION IF EXISTS public.admin_reset_trading_history_batch(integer, boolean);

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
  batch_size integer := greatest(25, least(coalesce(p_batch_size, 50), 500));
  deleted integer := 0;
  total integer := 0;
  result jsonb := '{}'::jsonb;
  has_signal_id boolean;
  has_execution_order_id boolean;
  has_execution_id boolean;

  -- Remaining counts
  rem_signals bigint := 0;
  rem_signal_updates bigint := 0;
  rem_telegram_deliveries bigint := 0;
  rem_execution_event_logs bigint := 0;
  rem_execution_orders bigint := 0;
  rem_paper_execution_intents bigint := 0;
  rem_strategy_candidates bigint := 0;
  rem_scanner_candidates bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history_batch is admin-only'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);

  -- 1. telegram_deliveries: only signal-linked rows
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    total := 0;
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
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('telegram_deliveries', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 2. signal_updates
  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (SELECT ctid FROM public.signal_updates LIMIT batch_size)
      DELETE FROM public.signal_updates target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signal_updates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 3. execution_event_logs (supports both execution_id and execution_order_id column names)
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='signal_id') INTO has_signal_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='execution_order_id') INTO has_execution_order_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='execution_event_logs' AND column_name='execution_id') INTO has_execution_id;
    total := 0;
    LOOP
      EXECUTE format(
        'WITH doomed AS (
           SELECT eel.ctid FROM public.execution_event_logs eel
           WHERE (%s) LIMIT %s
         )
         DELETE FROM public.execution_event_logs target
         WHERE target.ctid IN (SELECT ctid FROM doomed)',
        concat_ws(' OR ',
          CASE WHEN has_signal_id THEN 'eel.signal_id IS NOT NULL' END,
          CASE WHEN has_execution_order_id THEN 'eel.execution_order_id IS NOT NULL' END,
          CASE WHEN has_execution_id THEN 'eel.execution_id IS NOT NULL' END,
          'false'
        ),
        batch_size
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_event_logs', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 4. execution_orders: only signal-linked rows
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT ctid FROM public.execution_orders WHERE signal_id IS NOT NULL LIMIT batch_size
      )
      DELETE FROM public.execution_orders target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('execution_orders', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('execution_orders', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 5. paper_execution_intents: only signal-linked rows
  -- signals.paper_execution_intent_id → paper_execution_intents.id (SET NULL on delete, so safe)
  -- paper_execution_intents.signal_id → signals.id (SET NULL on delete, so safe)
  -- We delete paper_execution_intents BEFORE signals to avoid any residual reference issues.
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (
        SELECT ctid FROM public.paper_execution_intents WHERE signal_id IS NOT NULL LIMIT batch_size
      )
      DELETE FROM public.paper_execution_intents target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('paper_execution_intents', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 6. signals (all FK children cleared above)
  IF to_regclass('public.signals') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (SELECT ctid FROM public.signals LIMIT batch_size)
      DELETE FROM public.signals target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('signals', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('signals', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 7. strategy_candidates (after signals because signals.candidate_id references it)
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (SELECT ctid FROM public.strategy_candidates LIMIT batch_size)
      DELETE FROM public.strategy_candidates target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('strategy_candidates', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('strategy_candidates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- 8. scanner_candidates
  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN
    total := 0;
    LOOP
      WITH doomed AS (SELECT ctid FROM public.scanner_candidates LIMIT batch_size)
      DELETE FROM public.scanner_candidates target WHERE target.ctid IN (SELECT ctid FROM doomed);
      GET DIAGNOSTICS deleted = ROW_COUNT;
      total := total + deleted;
      EXIT WHEN deleted = 0;
    END LOOP;
    result := result || jsonb_build_object('scanner_candidates', jsonb_build_object('deleted_count', total, 'status', 'deleted'));
  ELSE
    result := result || jsonb_build_object('scanner_candidates', jsonb_build_object('deleted_count', 0, 'status', 'table_not_present'));
  END IF;

  -- Remaining counts for UI verification
  IF to_regclass('public.signals') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.signals' INTO rem_signals;
  END IF;
  IF to_regclass('public.signal_updates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.signal_updates' INTO rem_signal_updates;
  END IF;
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.telegram_deliveries WHERE signal_id IS NOT NULL' INTO rem_telegram_deliveries;
  END IF;
  IF to_regclass('public.execution_orders') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.execution_orders WHERE signal_id IS NOT NULL' INTO rem_execution_orders;
  END IF;
  IF to_regclass('public.paper_execution_intents') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.paper_execution_intents WHERE signal_id IS NOT NULL' INTO rem_paper_execution_intents;
  END IF;
  IF to_regclass('public.strategy_candidates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.strategy_candidates' INTO rem_strategy_candidates;
  END IF;
  IF to_regclass('public.scanner_candidates') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.scanner_candidates' INTO rem_scanner_candidates;
  END IF;
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.execution_event_logs' INTO rem_execution_event_logs;
  END IF;

  DECLARE
    total_remaining bigint := rem_signals + rem_signal_updates + rem_telegram_deliveries +
                              rem_execution_orders + rem_paper_execution_intents +
                              rem_strategy_candidates + rem_scanner_candidates +
                              rem_execution_event_logs;
  BEGIN
    RETURN jsonb_build_object(
      'success', total_remaining = 0,
      'reset_scope', 'performance_history_only',
      'batch_size', batch_size,
      'until_empty_requested', p_until_empty,
      'has_more', total_remaining > 0,
      'deleted_counts', result,
      'remaining_counts', jsonb_build_object(
        'signals', rem_signals,
        'signal_updates', rem_signal_updates,
        'telegram_deliveries', rem_telegram_deliveries,
        'execution_event_logs', rem_execution_event_logs,
        'execution_orders', rem_execution_orders,
        'paper_execution_intents', rem_paper_execution_intents,
        'strategy_candidates', rem_strategy_candidates,
        'scanner_candidates', rem_scanner_candidates
      ),
      'preserved_tables', ARRAY[
        'scanner_config','strategy_configs','execution_settings',
        'profiles','customers','packages','subscriptions',
        'telegram config','bot setup','binance credentials',
        'candles','symbols','provider config','scanner_runs'
      ],
      'completed_at', now()
    );
  END;
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
