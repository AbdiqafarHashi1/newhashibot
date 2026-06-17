-- X-G lifecycle proof fields for provider-neutral monitor/recovery and Telegram dedupe.
-- Additive only; live trading remains disabled by existing guards.

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS sl_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tp1_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tp2_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS expiry_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS recovery_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cleanup_status text,
  ADD COLUMN IF NOT EXISTS position_size numeric,
  ADD COLUMN IF NOT EXISTS current_price numeric,
  ADD COLUMN IF NOT EXISTS latest_telegram_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_telegram_event_sent text;

-- Keep canonical proof aliases populated for older rows without touching strategy inputs.
UPDATE public.execution_orders
SET sl_status = COALESCE(sl_status, CASE WHEN sl_order_id IS NOT NULL OR binance_sl_order_id IS NOT NULL OR sl_algo_id IS NOT NULL THEN 'submitted' ELSE 'pending' END),
    tp1_status = COALESCE(tp1_status, CASE WHEN tp1_order_id IS NOT NULL OR binance_tp1_order_id IS NOT NULL OR tp1_algo_id IS NOT NULL THEN 'submitted' ELSE 'pending' END),
    tp2_status = COALESCE(tp2_status, CASE WHEN tp2_order_id IS NOT NULL OR binance_tp2_order_id IS NOT NULL OR tp2_algo_id IS NOT NULL THEN 'submitted' ELSE 'pending' END),
    expiry_status = COALESCE(expiry_status, CASE WHEN runner_expired = true THEN 'expired' ELSE 'active' END),
    recovery_status = COALESCE(recovery_status, CASE WHEN protection_status IN ('protection_recovered','protected_native','protected_managed') THEN 'recovered' ELSE 'none' END),
    position_size = COALESCE(position_size, current_position_size, quantity, volume),
    current_price = COALESCE(current_price, latest_mark_price),
    updated_at = now();

NOTIFY pgrst, 'reload schema';
