/*
  # B6.7R monitor schema and preview safety guards

  This migration is intentionally additive/idempotent. It keeps preview databases
  and partially migrated production databases from missing the visibility columns
  used by binance-testnet-monitor startup and row-error persistence.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS latest_monitor_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latest_sync_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latest_protection_error text,
  ADD COLUMN IF NOT EXISTS last_monitor_action text NOT NULL DEFAULT '';

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS latest_monitor_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latest_sync_error text NOT NULL DEFAULT '';

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
  ADD CONSTRAINT execution_orders_status_b6_7r_check
  CHECK (status IN (
    'pending','signal_created','execution_planned','entry_submitted','entry_filled',
    'entry_timeout_cancelled','entry_missing_no_position',
    'protection_submitted','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','partially_closed',
    'tp1_hit','sl_moved_to_be','closed_tp','closed_sl','closed_breakeven','closed_timeout',
    'closed_unprotected_safety','closed_synced','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b6_7r_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_native','protected_managed',
    'pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;
