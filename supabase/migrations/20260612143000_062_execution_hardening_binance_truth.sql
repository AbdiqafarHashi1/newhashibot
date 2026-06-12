/*
  HASHIBOT EXECUTION HARDENING — Binance truth, protection watchdog, and timeline

  This migration keeps signal truth separate from Binance execution truth by adding
  durable protection/reconciliation/timeline fields and widening status checks for
  protection_pending/protection_failed/protection_recovered states.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS protection_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsafe_position_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_watchdog_status text,
  ADD COLUMN IF NOT EXISTS protection_watchdog_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_watchdog_last_recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS protection_critical_reason text,
  ADD COLUMN IF NOT EXISTS execution_truth_source text NOT NULL DEFAULT 'binance',
  ADD COLUMN IF NOT EXISTS signal_truth_source text NOT NULL DEFAULT 'market_price',
  ADD COLUMN IF NOT EXISTS execution_timeline jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.execution_orders
  DROP CONSTRAINT IF EXISTS execution_orders_status_crypto_fix_2_check,
  DROP CONSTRAINT IF EXISTS execution_orders_status_execution_hardening_check,
  DROP CONSTRAINT IF EXISTS execution_orders_protection_status_crypto_fix_2_check,
  DROP CONSTRAINT IF EXISTS execution_orders_protection_status_execution_hardening_check,
  DROP CONSTRAINT IF EXISTS execution_orders_truth_source_execution_hardening_check,
  DROP CONSTRAINT IF EXISTS execution_orders_watchdog_status_execution_hardening_check;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_execution_hardening_check
  CHECK (status IN (
    'pending','entry_submitted','entry_filled','pending_protection','protection_pending','protection_failed','protection_recovered',
    'protected','protected_native','protected_managed','pending_managed_protection','partially_closed',
    'closed_tp','closed_tp2','closed_sl','closed_profit_lock','closed_breakeven','closed_timeout','closed_expired','closed_expired_after_tp1',
    'closed_manual','closed_synced','closed_unprotected_safety','cancelled','failed','skipped','stale_closed',
    'entry_timeout_cancelled','entry_missing_no_position','sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_execution_hardening_check
  CHECK (protection_status IS NULL OR protection_status IN (
    'unprotected','pending_protection','protection_pending','protection_failed','protection_recovered',
    'protected','protected_native','protected_managed','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_truth_source_execution_hardening_check
  CHECK (execution_truth_source = 'binance' AND signal_truth_source = 'market_price') NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_watchdog_status_execution_hardening_check
  CHECK (protection_watchdog_status IS NULL OR protection_watchdog_status IN (
    'SAFE','UNSAFE_POSITION','PROTECTION_RECOVERED','PROTECTION_RECOVERY_FAILED','ORPHAN_CLEANED','RECONCILED'
  )) NOT VALID;

UPDATE public.execution_orders
SET execution_truth_source = 'binance',
    signal_truth_source = 'market_price',
    execution_timeline = COALESCE(execution_timeline, '{}'::jsonb)
WHERE exchange = 'binance_usdm_testnet'
  AND environment = 'testnet';
