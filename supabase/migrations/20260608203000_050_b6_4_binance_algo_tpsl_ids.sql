/*
  HASHIBOT B6.4 — Binance USD-M Futures algo TP/SL identifiers

  Binance USD-M Futures TP/SL conditional orders use /fapi/v1/algoOrder and
  return algoId/clientAlgoId. These IDs are distinct from normal entry orderId
  values and must be stored and queried through algo-order endpoints.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS sl_algo_id text,
  ADD COLUMN IF NOT EXISTS tp1_algo_id text,
  ADD COLUMN IF NOT EXISTS tp2_algo_id text,
  ADD COLUMN IF NOT EXISTS sl_client_algo_id text,
  ADD COLUMN IF NOT EXISTS tp1_client_algo_id text,
  ADD COLUMN IF NOT EXISTS tp2_client_algo_id text,
  ADD COLUMN IF NOT EXISTS native_protection_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_fallback_active boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%protection_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b6_4_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_native','protected_managed','pending_protection',
    'pending_managed_protection','unprotected_failed'
  )) NOT VALID;
