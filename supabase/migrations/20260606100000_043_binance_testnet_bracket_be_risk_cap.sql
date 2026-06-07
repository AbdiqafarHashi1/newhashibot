/*
  # 043 Binance testnet bracket BE management and total open risk cap

  Adds TP1/BE trade-management visibility plus an aggregate open-risk cap while
  keeping Binance execution testnet-only.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS max_open_testnet_positions_allowed_max integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_total_open_risk_pct numeric NOT NULL DEFAULT 3.0;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS breakeven_sl_order_id text,
  ADD COLUMN IF NOT EXISTS tp1_filled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sl_moved_to_be boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS be_stop_level numeric,
  ADD COLUMN IF NOT EXISTS latest_protection_error text,
  ADD COLUMN IF NOT EXISTS current_open_risk_pct numeric,
  ADD COLUMN IF NOT EXISTS total_open_risk_after_trade numeric;

UPDATE public.execution_settings
SET max_open_testnet_positions_allowed_max = 10,
    max_open_testnet_positions = LEAST(GREATEST(COALESCE(max_open_testnet_positions, 3), 1), 10),
    max_total_open_risk_pct = LEAST(COALESCE(max_total_open_risk_pct, 3.0), 5.0)
WHERE id = 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_max_open_allowed_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_max_open_allowed_check
      CHECK (max_open_testnet_positions_allowed_max BETWEEN 1 AND 10 AND max_open_testnet_positions BETWEEN 1 AND 10);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_total_open_risk_cap_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_total_open_risk_cap_check
      CHECK (max_total_open_risk_pct >= 0 AND max_total_open_risk_pct <= 5.0);
  END IF;
END $$;

ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS execution_orders_protection_status_check;
ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_check
  CHECK (protection_status IS NULL OR protection_status IN ('protected','pending_protection','protected_managed','pending_managed_protection','unprotected_failed'));

ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS execution_orders_status_check;
ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_check CHECK (status IN (
    'pending', 'entry_submitted', 'entry_filled', 'protected', 'pending_protection',
    'sl_submitted', 'tp_submitted', 'partially_closed', 'closed_tp', 'closed_sl',
    'closed_breakeven', 'cancelled', 'failed', 'skipped', 'sent_to_bridge',
    'accepted', 'rejected', 'filled'
  ));
