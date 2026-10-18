-- 20260708160000_097_crypto_execution_protection_closeout.sql
-- Complete Phase 4.8 closeout: add repair/recovery columns and update upsert function.

ALTER TABLE public.trade_management_truth
  ADD COLUMN IF NOT EXISTS repair_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS latest_error text,
  ADD COLUMN IF NOT EXISTS last_action_taken text;

-- Update the RPC to support the new repair and recovery columns
CREATE OR REPLACE FUNCTION public.upsert_trade_management_truth(
  p_execution_order_id uuid,
  p_provider text,
  p_environment text,
  p_symbol text,
  p_direction text,
  p_status text,
  p_protection_status text,
  p_sl_present boolean,
  p_tp1_present boolean,
  p_tp2_present boolean,
  p_entry_price numeric DEFAULT NULL,
  p_mark_price numeric DEFAULT NULL,
  p_unrealized_pnl numeric DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_leverage numeric DEFAULT NULL,
  p_sl_price numeric DEFAULT NULL,
  p_tp1_price numeric DEFAULT NULL,
  p_tp2_price numeric DEFAULT NULL,
  p_monitor_run_id text DEFAULT NULL,
  p_repair_attempts integer DEFAULT 0,
  p_recovery_status text DEFAULT 'healthy',
  p_latest_error text DEFAULT NULL,
  p_last_action_taken text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.trade_management_truth (
    execution_order_id, provider, environment, symbol, direction, status,
    protection_status, sl_present, tp1_present, tp2_present,
    entry_price, mark_price, unrealized_pnl, quantity, leverage,
    sl_price, tp1_price, tp2_price, latest_sync_at, monitor_run_id,
    repair_attempts, recovery_status, latest_error, last_action_taken
  )
  VALUES (
    p_execution_order_id, p_provider, p_environment, p_symbol, p_direction, p_status,
    p_protection_status, p_sl_present, p_tp1_present, p_tp2_present,
    p_entry_price, p_mark_price, p_unrealized_pnl, p_quantity, p_leverage,
    p_sl_price, p_tp1_price, p_tp2_price, now(), p_monitor_run_id,
    p_repair_attempts, p_recovery_status, p_latest_error, p_last_action_taken
  )
  ON CONFLICT (execution_order_id) DO UPDATE SET
    status            = EXCLUDED.status,
    protection_status = EXCLUDED.protection_status,
    sl_present        = EXCLUDED.sl_present,
    tp1_present       = EXCLUDED.tp1_present,
    tp2_present       = EXCLUDED.tp2_present,
    mark_price        = EXCLUDED.mark_price,
    unrealized_pnl    = EXCLUDED.unrealized_pnl,
    quantity          = EXCLUDED.quantity,
    latest_sync_at    = now(),
    monitor_run_id    = EXCLUDED.monitor_run_id,
    repair_attempts   = EXCLUDED.repair_attempts,
    recovery_status   = EXCLUDED.recovery_status,
    latest_error      = EXCLUDED.latest_error,
    last_action_taken = EXCLUDED.last_action_taken,
    updated_at        = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth(uuid,text,text,text,text,text,text,boolean,boolean,boolean,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text) FROM anon;

NOTIFY pgrst, 'reload schema';
