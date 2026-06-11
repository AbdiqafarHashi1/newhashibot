/*
  HASHIBOT CRYPTO FIX 2 — Binance Testnet execution lifecycle

  Adds durable TP1, +0.3R profit-lock, runner, expiry, cleanup, and lifecycle
  classification fields. Keeps the change scoped to execution_orders and
  testnet execution visibility; strategy selection/arbitration are untouched.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS tp1_fill_price numeric,
  ADD COLUMN IF NOT EXISTS tp1_fill_time timestamptz,
  ADD COLUMN IF NOT EXISTS partial_close_qty numeric,
  ADD COLUMN IF NOT EXISTS remaining_qty numeric,
  ADD COLUMN IF NOT EXISTS runner_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profit_lock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profit_lock_r numeric NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS profit_lock_price numeric,
  ADD COLUMN IF NOT EXISTS profit_lock_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_sl_price numeric,
  ADD COLUMN IF NOT EXISTS replacement_sl_price numeric,
  ADD COLUMN IF NOT EXISTS replacement_sl_order_id text,
  ADD COLUMN IF NOT EXISTS replacement_sl_algo_id text,
  ADD COLUMN IF NOT EXISTS replacement_sl_client_algo_id text,
  ADD COLUMN IF NOT EXISTS replacement_sl_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS old_sl_cancelled_after_tp1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sl_replaced_after_tp1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protection_warning_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protection_critical_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protection_status_detail jsonb,
  ADD COLUMN IF NOT EXISTS tp2_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tp2_filled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_lock_sl_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_lock_sl_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS runner_expired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS runner_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleanup_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cleanup_warning text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cleanup_checked_at timestamptz;

UPDATE public.execution_orders
SET profit_lock_enabled = true,
    profit_lock_r = 0.3
WHERE exchange = 'binance_usdm_testnet'
  AND environment = 'testnet'
  AND (profit_lock_r IS NULL OR profit_lock_r = 0);

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_crypto_fix_2_check
  CHECK (status IN (
    'pending','signal_created','execution_planned','entry_submitted','entry_filled',
    'entry_timeout_cancelled','entry_missing_no_position',
    'protection_submitted','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','partially_closed',
    'tp1_hit','sl_moved_to_be','closed_tp','closed_tp2','closed_profit_lock',
    'closed_sl','closed_breakeven','closed_timeout','closed_expired','closed_expired_after_tp1',
    'closed_manual','closed_unprotected_safety','closed_synced','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_crypto_fix_2_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_profit_lock_r_crypto_fix_2_check
  CHECK (profit_lock_r IN (0, 0.1, 0.2, 0.3)) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_execution_orders_crypto_fix_2_runners
  ON public.execution_orders(status, runner_active, profit_lock_sl_active)
  WHERE exchange = 'binance_usdm_testnet' AND environment = 'testnet';
