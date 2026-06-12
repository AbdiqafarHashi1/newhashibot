/*
  HASHIBOT CRYPTO FIX 3 — final testnet stress mode and execution truth

  Adds testnet-only stress override controls and durable execution truth fields.
  Strategy generation, scanner logic, arbitration, Forex, MT5, and AI systems are
  intentionally untouched.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS stress_override_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stress_risk_pct numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS stress_leverage integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS stress_ignore_open_risk_limit boolean NOT NULL DEFAULT true;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS risk_source text,
  ADD COLUMN IF NOT EXISTS stress_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_risk_guard text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE public.execution_settings
  DROP CONSTRAINT IF EXISTS execution_settings_stress_risk_crypto_fix_3_check,
  DROP CONSTRAINT IF EXISTS execution_settings_stress_leverage_crypto_fix_3_check;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_stress_risk_crypto_fix_3_check
  CHECK (stress_risk_pct >= 0 AND stress_risk_pct <= 2.0) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_stress_leverage_crypto_fix_3_check
  CHECK (stress_leverage BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE public.execution_orders
  DROP CONSTRAINT IF EXISTS execution_orders_open_risk_guard_crypto_fix_3_check;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_open_risk_guard_crypto_fix_3_check
  CHECK (open_risk_guard IN ('ACTIVE', 'IGNORED_FOR_STRESS_TEST')) NOT VALID;

UPDATE public.execution_settings
SET
  stress_override_enabled = true,
  stress_risk_pct = 2.0,
  stress_leverage = 10,
  stress_ignore_open_risk_limit = true,
  testnet_governor_mode = 'off_for_testing',
  updated_at = now()
WHERE id = 1
  AND execution_mode = 'testnet'
  AND testnet_enabled = true
  AND COALESCE(live_trading_enabled, false) = false;

UPDATE public.execution_orders
SET risk_source = COALESCE(risk_source, 'legacy_pre_crypto_fix_3'),
    open_risk_guard = COALESCE(NULLIF(open_risk_guard, ''), 'ACTIVE')
WHERE exchange = 'binance_usdm_testnet'
  AND environment = 'testnet';
