/*
  HASHIBOT PHASE B4 — Binance truth-first execution cleanup

  Adds durable execution-state metadata so stale database rows no longer block
  Binance testnet retries, and records whether protection is exchange-native or
  managed by HashiBot fallback monitoring.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS latest_auto_skip_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protection_status text NOT NULL DEFAULT 'unprotected',
  ADD COLUMN IF NOT EXISTS bracket_mode text NOT NULL DEFAULT '',
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
  ADD COLUMN IF NOT EXISTS sl_moved_to_be boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_cleanup_reason text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS execution_orders_signal_status_idx
  ON public.execution_orders (signal_id, status);

CREATE INDEX IF NOT EXISTS execution_orders_symbol_status_idx
  ON public.execution_orders (symbol, status);

CREATE OR REPLACE FUNCTION public.mark_stale_testnet_execution_orders(
  p_symbol text DEFAULT NULL,
  p_active_statuses text[] DEFAULT ARRAY['pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','protected_managed','pending_managed_protection'],
  p_stale_status text DEFAULT 'stale_closed',
  p_reason text DEFAULT 'binance_truth_no_position_no_orders'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_count integer := 0;
BEGIN
  UPDATE public.execution_orders
  SET status = p_stale_status,
      stale_checked_at = now(),
      stale_cleanup_reason = p_reason,
      updated_at = now()
  WHERE status = ANY(p_active_statuses)
    AND (p_symbol IS NULL OR symbol = p_symbol);

  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) TO service_role;
