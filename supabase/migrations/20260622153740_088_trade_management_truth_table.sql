-- 088: Create missing trade_management_truth table
-- This table is queried by operatorTruth.ts but was never created.
-- It acts as a unified active-trade truth surface for the operator panel.

CREATE TABLE IF NOT EXISTS public.trade_management_truth (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_order_id      uuid REFERENCES public.execution_orders(id) ON DELETE CASCADE,
  provider                text NOT NULL,  -- 'binance' | 'bybit'
  environment             text NOT NULL DEFAULT 'testnet',
  symbol                  text NOT NULL,
  direction               text,           -- 'long' | 'short'
  status                  text NOT NULL,  -- mirrors execution_orders.status
  protection_status       text,           -- 'protected' | 'missing_sl' | 'missing_tp' | etc
  sl_present              boolean NOT NULL DEFAULT false,
  tp1_present             boolean NOT NULL DEFAULT false,
  tp2_present             boolean NOT NULL DEFAULT false,
  entry_price             numeric,
  mark_price              numeric,
  unrealized_pnl          numeric,
  quantity                numeric,
  leverage                numeric,
  sl_price                numeric,
  tp1_price               numeric,
  tp2_price               numeric,
  latest_sync_at          timestamptz NOT NULL DEFAULT now(),
  monitor_run_id          text,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_management_truth
 ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN IF NOT EXISTS direction text,
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS quantity numeric,
 ADD COLUMN IF NOT EXISTS leverage numeric,
 ADD COLUMN IF NOT EXISTS sl_price numeric,
 ADD COLUMN IF NOT EXISTS tp1_price numeric,
 ADD COLUMN IF NOT EXISTS tp2_price numeric,
 ADD COLUMN IF NOT EXISTS monitor_run_id text,
 ADD COLUMN IF NOT EXISTS notes text;
UPDATE public.trade_management_truth SET direction=side WHERE direction IS NULL;
UPDATE public.trade_management_truth SET quantity=qty WHERE quantity IS NULL;
ALTER TABLE public.trade_management_truth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_trade_management_truth" ON public.trade_management_truth
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_tmt_provider_status ON public.trade_management_truth(provider, status);
CREATE INDEX IF NOT EXISTS idx_tmt_execution_order ON public.trade_management_truth(execution_order_id);
CREATE INDEX IF NOT EXISTS idx_tmt_latest_sync ON public.trade_management_truth(latest_sync_at DESC);

-- Trigger to keep updated_at current
DROP TRIGGER IF EXISTS trade_management_truth_updated_at ON public.trade_management_truth;
CREATE TRIGGER trade_management_truth_updated_at
  BEFORE UPDATE ON public.trade_management_truth
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC: upsert a trade management row (called by monitors)
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
  p_monitor_run_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.trade_management_truth (
    execution_order_id, provider, environment, symbol, direction, status,
    protection_status, sl_present, tp1_present, tp2_present,
    entry_price, mark_price, unrealized_pnl, quantity, leverage,
    sl_price, tp1_price, tp2_price, latest_sync_at, monitor_run_id
  )
  VALUES (
    p_execution_order_id, p_provider, p_environment, p_symbol, p_direction, p_status,
    p_protection_status, p_sl_present, p_tp1_present, p_tp2_present,
    p_entry_price, p_mark_price, p_unrealized_pnl, p_quantity, p_leverage,
    p_sl_price, p_tp1_price, p_tp2_price, now(), p_monitor_run_id
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
    updated_at        = now();
END;
$$;

-- Unique constraint needed for ON CONFLICT
ALTER TABLE public.trade_management_truth
  DROP CONSTRAINT IF EXISTS trade_management_truth_execution_order_uniq;
ALTER TABLE public.trade_management_truth
  ADD CONSTRAINT trade_management_truth_execution_order_uniq UNIQUE (execution_order_id);

REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth FROM anon;

NOTIFY pgrst, 'reload schema';
