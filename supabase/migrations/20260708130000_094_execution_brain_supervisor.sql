-- 20260708130000_094_execution_brain_supervisor.sql
-- Additive migration for canonical trade truth, runtime supervisor and execution supervisor optimizations.

-- 1. Add canonical columns to trade_management_truth safely
ALTER TABLE public.trade_management_truth
  ADD COLUMN IF NOT EXISTS customer text,
  ADD COLUMN IF NOT EXISTS account text,
  ADD COLUMN IF NOT EXISTS market_type text DEFAULT 'crypto',
  ADD COLUMN IF NOT EXISTS strategy text,
  ADD COLUMN IF NOT EXISTS entry numeric,
  ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'SIGNAL_CREATED',
  ADD COLUMN IF NOT EXISTS protection_state text DEFAULT 'unprotected',
  ADD COLUMN IF NOT EXISTS recovery_state text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS execution_state text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS entry_order text,
  ADD COLUMN IF NOT EXISTS "SL" numeric,
  ADD COLUMN IF NOT EXISTS "TP1" numeric,
  ADD COLUMN IF NOT EXISTS "TP2" numeric,
  ADD COLUMN IF NOT EXISTS exchange_position_id text,
  ADD COLUMN IF NOT EXISTS exchange_order_ids text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS last_sync timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_provider_ack timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS repair_attempts integer DEFAULT 0;

-- 2. Optimize Execution Queue, Runtime, and Trade Truth with indexation
CREATE INDEX IF NOT EXISTS idx_tmt_customer_account ON public.trade_management_truth(customer, account);
CREATE INDEX IF NOT EXISTS idx_tmt_market_type_symbol ON public.trade_management_truth(market_type, symbol);
CREATE INDEX IF NOT EXISTS idx_tmt_lifecycle_state ON public.trade_management_truth(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_tmt_protection_state ON public.trade_management_truth(protection_state);
CREATE INDEX IF NOT EXISTS idx_tmt_recovery_state ON public.trade_management_truth(recovery_state);

-- 3. Enhance upsert function to support canonical trade truth fields
CREATE OR REPLACE FUNCTION public.upsert_canonical_trade_truth(
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
  p_entry_price numeric,
  p_mark_price numeric,
  p_unrealized_pnl numeric,
  p_quantity numeric,
  p_leverage numeric,
  p_sl_price numeric,
  p_tp1_price numeric,
  p_tp2_price numeric,
  p_customer text,
  p_account text,
  p_market_type text,
  p_strategy text,
  p_entry numeric,
  p_lifecycle_state text,
  p_protection_state text,
  p_recovery_state text,
  p_execution_state text,
  p_entry_order text,
  p_sl_val numeric,
  p_tp1_val numeric,
  p_tp2_val numeric,
  p_exchange_position_id text,
  p_exchange_order_ids text[],
  p_last_error text,
  p_repair_attempts integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.trade_management_truth (
    execution_order_id, provider, environment, symbol, direction, status,
    protection_status, sl_present, tp1_present, tp2_present,
    entry_price, mark_price, unrealized_pnl, quantity, leverage,
    sl_price, tp1_price, tp2_price,
    customer, account, market_type, strategy, entry,
    lifecycle_state, protection_state, recovery_state, execution_state,
    entry_order, "SL", "TP1", "TP2",
    exchange_position_id, exchange_order_ids,
    last_sync, last_provider_ack, last_error, repair_attempts
  )
  VALUES (
    p_execution_order_id, p_provider, p_environment, p_symbol, p_direction, p_status,
    p_protection_status, p_sl_present, p_tp1_present, p_tp2_present,
    p_entry_price, p_mark_price, p_unrealized_pnl, p_quantity, p_leverage,
    p_sl_price, p_tp1_price, p_tp2_price,
    p_customer, p_account, p_market_type, p_strategy, p_entry,
    p_lifecycle_state, p_protection_state, p_recovery_state, p_execution_state,
    p_entry_order, p_sl_val, p_tp1_val, p_tp2_val,
    p_exchange_position_id, p_exchange_order_ids,
    now(), now(), p_last_error, p_repair_attempts
  )
  ON CONFLICT (execution_order_id) DO UPDATE SET
    status               = EXCLUDED.status,
    protection_status    = EXCLUDED.protection_status,
    sl_present           = EXCLUDED.sl_present,
    tp1_present          = EXCLUDED.tp1_present,
    tp2_present          = EXCLUDED.tp2_present,
    mark_price           = EXCLUDED.mark_price,
    unrealized_pnl       = EXCLUDED.unrealized_pnl,
    quantity             = EXCLUDED.quantity,
    lifecycle_state      = EXCLUDED.lifecycle_state,
    protection_state     = EXCLUDED.protection_state,
    recovery_state       = EXCLUDED.recovery_state,
    execution_state      = EXCLUDED.execution_state,
    exchange_position_id = EXCLUDED.exchange_position_id,
    exchange_order_ids   = EXCLUDED.exchange_order_ids,
    last_sync            = now(),
    last_provider_ack    = now(),
    last_error           = EXCLUDED.last_error,
    repair_attempts      = EXCLUDED.repair_attempts,
    updated_at           = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_canonical_trade_truth FROM anon;

NOTIFY pgrst, 'reload schema';
