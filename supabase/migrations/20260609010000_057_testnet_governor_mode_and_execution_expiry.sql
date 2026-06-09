/*
  HASHIBOT — Testnet governor modes and execution expiry management

  - Adds execution_settings.testnet_governor_mode for normal, readonly, and off_for_testing.
  - Adds explicit execution expiry fields so monitor cron owns Binance Futures time-stops.
  - Documents that Binance Futures positions and GTC conditional TP/SL orders do not expire automatically.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS testnet_governor_mode text NOT NULL DEFAULT 'normal';

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%testnet_governor_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_settings DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_settings
  ADD CONSTRAINT execution_settings_testnet_governor_mode_check
  CHECK (testnet_governor_mode IN ('normal','readonly','off_for_testing')) NOT VALID;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_hold_minutes integer,
  ADD COLUMN IF NOT EXISTS expiry_reason text,
  ADD COLUMN IF NOT EXISTS last_monitor_checked_at timestamptz;

COMMENT ON COLUMN public.execution_settings.testnet_governor_mode IS
  'normal blocks on governor pause; readonly calculates governor state without blocking Binance Testnet entries; off_for_testing bypasses governor blocking for Binance Testnet entries only. Live trading remains impossible.';
COMMENT ON COLUMN public.execution_orders.opened_at IS
  'HashiBot-managed testnet execution open timestamp. Binance Futures positions do not expire automatically.';
COMMENT ON COLUMN public.execution_orders.expires_at IS
  'HashiBot monitor-cron time-stop deadline. GTC TP/SL conditional orders can remain open until triggered or cancelled.';
COMMENT ON COLUMN public.execution_orders.max_hold_minutes IS
  'Strategy/timeframe max hold in minutes used to compute HashiBot-managed expiry.';
COMMENT ON COLUMN public.execution_orders.expiry_reason IS
  'Reason/source for HashiBot-managed expiry and timeout close.';
COMMENT ON COLUMN public.execution_orders.last_monitor_checked_at IS
  'Last time monitor cron checked this execution for protection, TP/SL, stale truth, or expiry.';

CREATE INDEX IF NOT EXISTS idx_execution_orders_testnet_expires_at
  ON public.execution_orders(expires_at)
  WHERE environment = 'testnet' AND expires_at IS NOT NULL;

UPDATE public.execution_settings
SET testnet_governor_mode = COALESCE(testnet_governor_mode, 'normal')
WHERE id = 1;
