/*
  HASHIBOT RECOVERY — Restore B2/B3 Binance execution schema while keeping B4/B4.1 monitor fields.

  Idempotent repair migration only:
  - never drops tables or data
  - restores missing execution_orders / execution_settings columns
  - supports both execution_event_logs.execution_id and execution_order_id during transition
  - keeps live trading impossible by forcing/checking live_trading_enabled = false
*/

-- 1. execution_orders: restore B2/B3 Binance execution columns and keep B4 monitor/cleanup columns.
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
  ADD COLUMN IF NOT EXISTS bracket_mode text,
  ADD COLUMN IF NOT EXISTS protection_status text,
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
  ADD COLUMN IF NOT EXISTS latest_sync_at timestamptz;

-- Keep legacy B2 ids and B4 ids in sync where one side is missing.
UPDATE public.execution_orders
SET binance_entry_order_id = COALESCE(NULLIF(binance_entry_order_id, ''), entry_order_id, ''),
    binance_sl_order_id = COALESCE(NULLIF(binance_sl_order_id, ''), sl_order_id, ''),
    binance_tp1_order_id = COALESCE(NULLIF(binance_tp1_order_id, ''), tp1_order_id, ''),
    binance_tp2_order_id = COALESCE(NULLIF(binance_tp2_order_id, ''), tp2_order_id, '')
WHERE COALESCE(binance_entry_order_id, '') = ''
   OR COALESCE(binance_sl_order_id, '') = ''
   OR COALESCE(binance_tp1_order_id, '') = ''
   OR COALESCE(binance_tp2_order_id, '') = '';

CREATE INDEX IF NOT EXISTS execution_orders_signal_status_idx
  ON public.execution_orders (signal_id, status);
CREATE INDEX IF NOT EXISTS execution_orders_symbol_status_idx
  ON public.execution_orders (symbol, status);

-- Replace only execution status/protection/bracket CHECKs so B2/B3 and B4/B4.1 states are all allowed.
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
  ADD CONSTRAINT execution_orders_status_recovery_check
  CHECK (status IN (
    'pending','sent_to_bridge','accepted','rejected','filled','entry_submitted','entry_filled',
    'sl_submitted','tp_submitted','protected','pending_protection','partially_closed',
    'closed_tp','closed_sl','closed_breakeven','cancelled','failed','skipped','stale_closed',
    'protected_managed','pending_managed_protection'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_recovery_check
  CHECK (protection_status IS NULL OR protection_status IN (
    'unprotected','protected','protected_managed','pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_bracket_mode_recovery_check
  CHECK (bracket_mode IS NULL OR bracket_mode IN ('','exchange_native','managed_exit_fallback','failed')) NOT VALID;

-- 2. execution_settings: restore B2/B3 controls and keep B4 monitor snapshots.
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

-- Live trading must remain impossible even if manual SQL previously toggled it.
UPDATE public.execution_settings
SET live_trading_enabled = false,
    updated_at = now()
WHERE live_trading_enabled IS DISTINCT FROM false;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_settings'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%live_trading_enabled%'
        OR pg_get_constraintdef(oid) ILIKE '%execution_mode%'
        OR pg_get_constraintdef(oid) ILIKE '%exchange%'
        OR pg_get_constraintdef(oid) ILIKE '%capital_basis%'
        OR pg_get_constraintdef(oid) ILIKE '%governor_state%'
        OR pg_get_constraintdef(oid) ILIKE '%max_open_testnet_positions%'
        OR pg_get_constraintdef(oid) ILIKE '%max_total_open_risk_pct%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.execution_settings DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_live_trading_false_recovery_check
  CHECK (live_trading_enabled = false) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_execution_mode_recovery_check
  CHECK (execution_mode IN ('signal_only','disabled','testnet')) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_exchange_recovery_check
  CHECK (exchange = 'binance_usdm_testnet') NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_capital_basis_recovery_check
  CHECK (capital_basis IN ('available_usdt','available_usdc_plus_usdt','total_margin_balance','total_wallet_balance','manual_override')) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_governor_state_recovery_check
  CHECK (governor_state IN ('normal','defensive','aggressive_allowed','paused')) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_testnet_risk_cap_recovery_check
  CHECK (testnet_risk_a >= 0 AND testnet_risk_a <= max_testnet_risk_pct AND testnet_risk_a_plus >= 0 AND testnet_risk_a_plus <= max_testnet_risk_pct AND max_testnet_risk_pct <= 1.0) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_leverage_cap_recovery_check
  CHECK (testnet_leverage_a >= 1 AND testnet_leverage_a <= testnet_max_leverage AND testnet_leverage_a_plus >= 1 AND testnet_leverage_a_plus <= testnet_max_leverage AND testnet_max_leverage <= 7) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_max_open_allowed_recovery_check
  CHECK (max_open_testnet_positions >= 1 AND max_open_testnet_positions <= max_open_testnet_positions_allowed_max AND max_open_testnet_positions_allowed_max <= 10) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_total_open_risk_cap_recovery_check
  CHECK (max_total_open_risk_pct > 0 AND max_total_open_risk_pct <= 3.0) NOT VALID;

ALTER TABLE public.execution_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution settings" ON public.execution_settings;
CREATE POLICY "Admins can read execution settings"
  ON public.execution_settings FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update execution settings" ON public.execution_settings;
CREATE POLICY "Admins can update execution settings"
  ON public.execution_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin() AND live_trading_enabled = false AND exchange = 'binance_usdm_testnet');

-- 3. execution_event_logs: support legacy execution_id and B4 execution_order_id.
CREATE TABLE IF NOT EXISTS public.execution_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid,
  execution_order_id uuid,
  signal_id uuid,
  symbol text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  message text NOT NULL,
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

UPDATE public.execution_event_logs
SET execution_order_id = execution_id
WHERE execution_order_id IS NULL
  AND execution_id IS NOT NULL;

UPDATE public.execution_event_logs
SET execution_id = execution_order_id
WHERE execution_id IS NULL
  AND execution_order_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_execution_id_recovery_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_execution_id_recovery_fkey
      FOREIGN KEY (execution_id) REFERENCES public.execution_orders(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_execution_order_id_recovery_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_execution_order_id_recovery_fkey
      FOREIGN KEY (execution_order_id) REFERENCES public.execution_orders(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_event_logs_signal_id_recovery_fkey') THEN
    ALTER TABLE public.execution_event_logs
      ADD CONSTRAINT execution_event_logs_signal_id_recovery_fkey
      FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS execution_event_logs_execution_created_idx
  ON public.execution_event_logs(execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_execution_order_id_idx
  ON public.execution_event_logs(execution_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_event_type_idx
  ON public.execution_event_logs(event_type, created_at DESC);

ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can read execution event logs"
  ON public.execution_event_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can insert execution event logs"
  ON public.execution_event_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
