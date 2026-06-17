-- X-F final: reconcile execution_orders proof contract used by provider execution paths and UI.
-- Additive/testnet-safe only. Keeps live trading impossible and refreshes PostgREST schema cache.

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS provider_entry_enabled boolean,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS submitted_order_id text,
  ADD COLUMN IF NOT EXISTS submitted_order_payload jsonb,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS error_detail text;

-- Ensure provider-neutral names exist even on rebuilt or manually-repaired schemas.
ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS execution_provider text DEFAULT 'binance',
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS execution_group_id uuid,
  ADD COLUMN IF NOT EXISTS exchange text DEFAULT 'binance_usdm_testnet',
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'testnet',
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS leverage numeric,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS volume numeric,
  ADD COLUMN IF NOT EXISTS entry_order_id text,
  ADD COLUMN IF NOT EXISTS binance_entry_order_id text,
  ADD COLUMN IF NOT EXISTS raw_exchange_response jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS last_exchange_error text,
  ADD COLUMN IF NOT EXISTS latest_auto_skip_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Keep proof aliases populated for UI/debug panels without changing execution logic.
CREATE OR REPLACE FUNCTION public.sync_execution_order_proof_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.qty := COALESCE(NEW.qty, NEW.quantity, NEW.volume);
  NEW.submitted_order_id := COALESCE(NEW.submitted_order_id, NEW.entry_order_id, NEW.binance_entry_order_id);
  NEW.provider_response := COALESCE(NEW.provider_response, NEW.raw_exchange_response, '{}'::jsonb);
  NEW.error_detail := NULLIF(COALESCE(NEW.error_detail, NEW.error_message, NEW.last_exchange_error, NEW.latest_auto_skip_reason), '');
  NEW.blocker := NULLIF(COALESCE(NEW.blocker, NEW.latest_auto_skip_reason, NEW.error_message, NEW.last_exchange_error), '');
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_execution_order_proof_fields ON public.execution_orders;
CREATE TRIGGER trg_sync_execution_order_proof_fields
BEFORE INSERT OR UPDATE ON public.execution_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_execution_order_proof_fields();

-- Backfill existing rows so latest execution/proof panels do not render blank blocker/error fields.
UPDATE public.execution_orders
SET qty = COALESCE(qty, quantity, volume),
    submitted_order_id = COALESCE(submitted_order_id, entry_order_id, binance_entry_order_id),
    provider_response = COALESCE(provider_response, raw_exchange_response, '{}'::jsonb),
    error_detail = NULLIF(COALESCE(error_detail, error_message, last_exchange_error, latest_auto_skip_reason), ''),
    blocker = NULLIF(COALESCE(blocker, latest_auto_skip_reason, error_message, last_exchange_error), ''),
    updated_at = COALESCE(updated_at, now());

-- Re-assert testnet-only safety. This is NOT VALID so existing dirty data cannot enable live trading.
DO $$
BEGIN
  IF to_regclass('public.execution_settings') IS NOT NULL THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_live_trading_false_xf_final_check CHECK (live_trading_enabled = false) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Ask PostgREST/Supabase to reload schema cache after adding provider_entry_enabled/proof columns.
NOTIFY pgrst, 'reload schema';
