/*
  # 041 Binance testnet auto execution, capital/risk/leverage, bracket protection state

  Extends phase 040 without enabling live trading. Defaults keep auto execution OFF and
  capital basis conservative (available USDT only).
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS auto_execute_testnet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capital_basis text NOT NULL DEFAULT 'available_usdt',
  ADD COLUMN IF NOT EXISTS testnet_capital_override_usdt numeric,
  ADD COLUMN IF NOT EXISTS max_capital_used_usdt numeric,
  ADD COLUMN IF NOT EXISTS testnet_risk_a numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS testnet_risk_a_plus numeric NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS max_testnet_risk_pct numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS testnet_leverage_a integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS testnet_leverage_a_plus integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS testnet_max_leverage integer NOT NULL DEFAULT 7;

ALTER TABLE public.execution_orders
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
  ADD COLUMN IF NOT EXISTS latest_auto_skip_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_capital_basis_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_capital_basis_check
      CHECK (capital_basis IN ('available_usdt','available_usdc_plus_usdt','total_margin_balance','total_wallet_balance','manual_override'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_testnet_risk_cap_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_testnet_risk_cap_check
      CHECK (testnet_risk_a >= 0 AND testnet_risk_a_plus >= 0 AND max_testnet_risk_pct <= 1.0 AND max_testnet_risk_pct >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_testnet_leverage_cap_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_testnet_leverage_cap_check
      CHECK (testnet_leverage_a BETWEEN 1 AND 7 AND testnet_leverage_a_plus BETWEEN 1 AND 7 AND testnet_max_leverage BETWEEN 1 AND 7);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_orders_bracket_mode_check') THEN
    ALTER TABLE public.execution_orders
      ADD CONSTRAINT execution_orders_bracket_mode_check
      CHECK (bracket_mode IS NULL OR bracket_mode IN ('exchange_native','managed_exit_fallback','failed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_orders_protection_status_check') THEN
    ALTER TABLE public.execution_orders
      ADD CONSTRAINT execution_orders_protection_status_check
      CHECK (protection_status IS NULL OR protection_status IN ('protected','pending_protection','unprotected_failed'));
  END IF;
END $$;

ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS execution_orders_status_check;
ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_check CHECK (status IN (
    'pending', 'entry_submitted', 'entry_filled', 'protected', 'pending_protection',
    'sl_submitted', 'tp_submitted', 'partially_closed', 'closed_tp', 'closed_sl',
    'cancelled', 'failed', 'skipped', 'sent_to_bridge', 'accepted', 'rejected', 'filled'
  ));

UPDATE public.execution_settings
SET auto_execute_testnet = COALESCE(auto_execute_testnet, false),
    capital_basis = COALESCE(capital_basis, 'available_usdt'),
    testnet_risk_a = COALESCE(testnet_risk_a, 0.5),
    testnet_risk_a_plus = COALESCE(testnet_risk_a_plus, 0.75),
    max_testnet_risk_pct = LEAST(COALESCE(max_testnet_risk_pct, 1.0), 1.0),
    testnet_leverage_a = LEAST(COALESCE(testnet_leverage_a, 3), 7),
    testnet_leverage_a_plus = LEAST(COALESCE(testnet_leverage_a_plus, 5), 7),
    testnet_max_leverage = LEAST(COALESCE(testnet_max_leverage, 7), 7)
WHERE id = 1;
