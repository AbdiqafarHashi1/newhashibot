/*
  HASHIBOT X-F.8D execution_orders contract repair.
  - Allow Bybit Demo Trading execution rows without relaxing live-trading guards.
  - Preserve Binance testnet/live values and existing submitted/protected rows.
  - Document provider/exchange contract used by edge execution code.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS raw_available_balance numeric,
  ADD COLUMN IF NOT EXISTS equity_used numeric;

ALTER TABLE public.execution_orders
  DROP CONSTRAINT IF EXISTS execution_orders_environment_b6_5_check;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_environment_b6_5_check
  CHECK (environment IN ('testnet','demo','live')) NOT VALID;

COMMENT ON CONSTRAINT execution_orders_environment_b6_5_check ON public.execution_orders IS
  'Allowed execution environments: testnet, demo (Bybit Demo Trading), live. Live trading remains blocked by execution_settings/live policies and edge-function guards.';

COMMENT ON COLUMN public.execution_orders.exchange IS
  'Execution venue key. Current allowed application values include binance_usdm_testnet, bybit_usdt_testnet, bybit_usdt_demo, and bybit_usdt_live.';

COMMENT ON COLUMN public.execution_orders.execution_provider IS
  'Provider adapter key. Current allowed application values include binance and bybit.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'provider'
  ) THEN
    COMMENT ON COLUMN public.execution_orders.provider IS
      'Legacy/provider label when present. Preserve existing Binance values; Bybit rows may use bybit or bybit_usdt_demo depending on caller vintage.';
  END IF;
END $$;
