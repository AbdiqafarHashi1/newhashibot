/*
  HASHIBOT CRYPTO FIX 1 — testnet-only risk/leverage stress settings
  Applies only to Binance USD-M testnet execution settings. Live/future defaults
  remain protected by execution_mode/testnet_enabled gates in the Edge Function.
*/

ALTER TABLE public.execution_settings
  DROP CONSTRAINT IF EXISTS execution_settings_testnet_risk_cap_check,
  DROP CONSTRAINT IF EXISTS execution_settings_testnet_risk_cap_recovery_check,
  DROP CONSTRAINT IF EXISTS execution_settings_testnet_leverage_cap_check,
  DROP CONSTRAINT IF EXISTS execution_settings_leverage_cap_recovery_check;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_testnet_risk_cap_crypto_fix_1_check
  CHECK (
    testnet_risk_a >= 0
    AND testnet_risk_a <= max_testnet_risk_pct
    AND testnet_risk_a_plus >= 0
    AND testnet_risk_a_plus <= max_testnet_risk_pct
    AND max_testnet_risk_pct <= 2.0
  ) NOT VALID;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_testnet_leverage_cap_crypto_fix_1_check
  CHECK (
    testnet_leverage_a BETWEEN 1 AND testnet_max_leverage
    AND testnet_leverage_a_plus BETWEEN 1 AND testnet_max_leverage
    AND testnet_max_leverage <= 10
  ) NOT VALID;

UPDATE public.execution_settings
SET
  testnet_risk_a = 2.0,
  testnet_risk_a_plus = 2.0,
  max_testnet_risk_pct = 2.0,
  testnet_leverage_a = 10,
  testnet_leverage_a_plus = 10,
  testnet_max_leverage = 10,
  updated_at = now()
WHERE id = 1
  AND execution_mode = 'testnet'
  AND testnet_enabled = true
  AND COALESCE(live_trading_enabled, false) = false;
