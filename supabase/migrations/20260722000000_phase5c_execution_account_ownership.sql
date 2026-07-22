-- Phase 5C: one durable, immutable ownership identity for every ROOT execution.
-- Secret values live in the platform vault; this schema persists opaque references only.
CREATE TABLE IF NOT EXISTS public.connected_execution_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('binance', 'bybit')),
  account_id text NOT NULL CHECK (account_id !~ ':'),
  credential_ref text NOT NULL,
  execution_instance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('testnet', 'demo', 'live')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider, account_id),
  UNIQUE (customer_id, provider, account_id, credential_ref)
);

ALTER TABLE public.connected_execution_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connected_execution_accounts FROM anon, authenticated;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS execution_instance_id uuid,
  ADD COLUMN IF NOT EXISTS credential_ref text,
  ADD COLUMN IF NOT EXISTS execution_scope_key text;

ALTER TABLE public.trade_management_truth
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS execution_instance_id uuid,
  ADD COLUMN IF NOT EXISTS credential_ref text,
  ADD COLUMN IF NOT EXISTS execution_scope_key text;

ALTER TABLE public.execution_monitor_heartbeats
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS execution_instance_id uuid,
  ADD COLUMN IF NOT EXISTS credential_ref text,
  ADD COLUMN IF NOT EXISTS execution_scope_key text;
CREATE INDEX IF NOT EXISTS execution_monitor_heartbeats_scope_idx ON public.execution_monitor_heartbeats(execution_scope_key, started_at DESC);

ALTER TABLE public.telegram_deliveries
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS execution_provider text,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS execution_instance_id uuid,
  ADD COLUMN IF NOT EXISTS credential_ref text,
  ADD COLUMN IF NOT EXISTS execution_scope_key text;
CREATE INDEX IF NOT EXISTS telegram_deliveries_scope_idx ON public.telegram_deliveries(execution_scope_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.execution_account_runtime_proof (
  execution_scope_key text PRIMARY KEY,
  customer_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('binance','bybit')),
  account_id text NOT NULL,
  execution_instance_id uuid NOT NULL,
  credential_ref text NOT NULL,
  environment text NOT NULL,
  monitor_status text NOT NULL,
  account_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (execution_scope_key = concat(customer_id::text, ':', provider, ':', account_id, ':', execution_instance_id::text))
);
ALTER TABLE public.execution_account_runtime_proof ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_account_runtime_proof FROM anon, authenticated;

ALTER TABLE public.trade_management_truth DROP CONSTRAINT IF EXISTS trade_management_truth_pkey;
ALTER TABLE public.trade_management_truth ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.trade_management_truth ADD CONSTRAINT trade_management_truth_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS trade_management_truth_owned_position_uidx
  ON public.trade_management_truth (execution_scope_key, provider, environment, symbol, side)
  WHERE execution_scope_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS execution_orders_scope_instance_uidx
  ON public.execution_orders (execution_scope_key, id);
CREATE INDEX IF NOT EXISTS execution_orders_owned_active_idx
  ON public.execution_orders (customer_id, execution_provider, account_id, execution_instance_id, status);
CREATE INDEX IF NOT EXISTS trade_management_truth_owned_idx
  ON public.trade_management_truth (customer_id, provider, account_id, execution_instance_id);

CREATE TABLE IF NOT EXISTS public.execution_monitor_leases (
  execution_scope_key text PRIMARY KEY,
  customer_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('binance', 'bybit')),
  account_id text NOT NULL,
  execution_instance_id uuid NOT NULL,
  run_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('running', 'completed', 'failed')),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (execution_scope_key = concat(customer_id::text, ':', provider, ':', account_id, ':', execution_instance_id::text))
);
ALTER TABLE public.execution_monitor_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_monitor_leases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.acquire_execution_monitor_lease(
  p_execution_scope_key text, p_customer_id uuid, p_provider text, p_account_id text,
  p_execution_instance_id uuid, p_run_id uuid, p_ttl_seconds integer DEFAULT 45
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.execution_monitor_leases(execution_scope_key, customer_id, provider, account_id, execution_instance_id, run_id, state, expires_at)
  VALUES (p_execution_scope_key, p_customer_id, p_provider, p_account_id, p_execution_instance_id, p_run_id, 'running', now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (execution_scope_key) DO UPDATE SET run_id = EXCLUDED.run_id, state = 'running', acquired_at = now(), expires_at = EXCLUDED.expires_at, completed_at = NULL
  WHERE execution_monitor_leases.state <> 'running' OR execution_monitor_leases.expires_at <= now();
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.acquire_execution_monitor_lease(text,uuid,text,text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_execution_monitor_lease(text,uuid,text,text,uuid,uuid,integer) TO service_role;

-- credential_ref is a UUID string naming one Vault secret whose value is a JSON object
-- {"api_key":"...","api_secret":"..."}. Decryption never enters a table or event.
CREATE OR REPLACE FUNCTION public.resolve_execution_account_credentials(
  p_customer_id uuid, p_provider text, p_account_id text, p_execution_instance_id uuid, p_credential_ref text
) RETURNS TABLE(api_key text, api_secret text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  RETURN QUERY
  SELECT secret.secret->>'api_key', secret.secret->>'api_secret'
  FROM public.connected_execution_accounts account
  JOIN LATERAL (
    SELECT decrypted_secret::jsonb AS secret FROM vault.decrypted_secrets
    WHERE id = p_credential_ref::uuid
  ) secret ON true
  WHERE account.customer_id = p_customer_id AND account.provider = p_provider
    AND account.account_id = p_account_id AND account.execution_instance_id = p_execution_instance_id
    AND account.credential_ref = p_credential_ref AND account.enabled
    AND nullif(secret.secret->>'api_key', '') IS NOT NULL
    AND nullif(secret.secret->>'api_secret', '') IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_execution_account_credentials(uuid,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_execution_account_credentials(uuid,text,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_execution_ownership_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (OLD.customer_id, OLD.execution_provider, OLD.account_id, OLD.execution_instance_id, OLD.credential_ref, OLD.execution_scope_key)
       IS DISTINCT FROM
     (NEW.customer_id, NEW.execution_provider, NEW.account_id, NEW.execution_instance_id, NEW.credential_ref, NEW.execution_scope_key)
  THEN RAISE EXCEPTION 'execution ownership is immutable';
  END IF;
  IF NEW.customer_id IS NULL OR NEW.execution_provider IS NULL OR NEW.account_id IS NULL OR
     NEW.execution_instance_id IS NULL OR NEW.credential_ref IS NULL OR NEW.execution_scope_key IS NULL
  THEN RAISE EXCEPTION 'execution ownership is required';
  END IF;
  IF NEW.execution_scope_key <> concat(NEW.customer_id::text, ':', NEW.execution_provider, ':', NEW.account_id, ':', NEW.execution_instance_id::text)
  THEN RAISE EXCEPTION 'execution ownership scope key mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.connected_execution_accounts a
    WHERE a.customer_id = NEW.customer_id AND a.provider = NEW.execution_provider
      AND a.account_id = NEW.account_id AND a.credential_ref = NEW.credential_ref AND a.enabled
  ) THEN RAISE EXCEPTION 'connected execution account unavailable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS execution_orders_ownership_guard ON public.execution_orders;
CREATE TRIGGER execution_orders_ownership_guard BEFORE INSERT OR UPDATE ON public.execution_orders
FOR EACH ROW EXECUTE FUNCTION public.assert_execution_ownership_immutable();

CREATE OR REPLACE FUNCTION public.assert_trade_truth_ownership_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.provider IS NULL OR NEW.account_id IS NULL OR
     NEW.execution_instance_id IS NULL OR NEW.credential_ref IS NULL OR NEW.execution_scope_key IS NULL
  THEN RAISE EXCEPTION 'trade truth ownership is required'; END IF;
  IF TG_OP = 'UPDATE' AND
    (OLD.customer_id, OLD.provider, OLD.account_id, OLD.execution_instance_id, OLD.credential_ref, OLD.execution_scope_key)
      IS DISTINCT FROM
    (NEW.customer_id, NEW.provider, NEW.account_id, NEW.execution_instance_id, NEW.credential_ref, NEW.execution_scope_key)
  THEN RAISE EXCEPTION 'trade truth ownership is immutable'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trade_management_truth_ownership_guard ON public.trade_management_truth;
CREATE TRIGGER trade_management_truth_ownership_guard BEFORE INSERT OR UPDATE ON public.trade_management_truth
FOR EACH ROW EXECUTE FUNCTION public.assert_trade_truth_ownership_immutable();

CREATE OR REPLACE FUNCTION public.upsert_trade_management_truth(
  p_execution_order_id uuid, p_provider text, p_environment text, p_symbol text, p_direction text,
  p_status text, p_protection_status text, p_sl_present boolean, p_tp1_present boolean, p_tp2_present boolean,
  p_entry_price numeric DEFAULT NULL, p_mark_price numeric DEFAULT NULL, p_unrealized_pnl numeric DEFAULT NULL,
  p_quantity numeric DEFAULT NULL, p_leverage numeric DEFAULT NULL, p_sl_price numeric DEFAULT NULL,
  p_tp1_price numeric DEFAULT NULL, p_tp2_price numeric DEFAULT NULL, p_monitor_run_id text DEFAULT NULL,
  p_repair_attempts integer DEFAULT 0, p_recovery_status text DEFAULT 'healthy', p_latest_error text DEFAULT NULL,
  p_last_action_taken text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owned public.execution_orders%ROWTYPE;
BEGIN
  SELECT * INTO owned FROM public.execution_orders WHERE id = p_execution_order_id;
  IF owned.id IS NULL OR owned.customer_id IS NULL OR owned.execution_scope_key IS NULL OR owned.execution_provider <> p_provider
  THEN RAISE EXCEPTION 'owned execution order required for trade truth'; END IF;
  INSERT INTO public.trade_management_truth (
    execution_order_id, provider, environment, symbol, direction, status, protection_status,
    sl_present, tp1_present, tp2_present, entry_price, mark_price, unrealized_pnl, quantity, leverage,
    sl_price, tp1_price, tp2_price, latest_sync_at, monitor_run_id, repair_attempts, recovery_status,
    latest_error, last_action_taken, customer_id, account_id, execution_instance_id, credential_ref, execution_scope_key
  ) VALUES (
    p_execution_order_id, p_provider, p_environment, p_symbol, p_direction, p_status, p_protection_status,
    p_sl_present, p_tp1_present, p_tp2_present, p_entry_price, p_mark_price, p_unrealized_pnl, p_quantity, p_leverage,
    p_sl_price, p_tp1_price, p_tp2_price, now(), p_monitor_run_id, p_repair_attempts, p_recovery_status,
    p_latest_error, p_last_action_taken, owned.customer_id, owned.account_id, owned.execution_instance_id, owned.credential_ref, owned.execution_scope_key
  ) ON CONFLICT (execution_order_id) DO UPDATE SET
    status=EXCLUDED.status, protection_status=EXCLUDED.protection_status, sl_present=EXCLUDED.sl_present,
    tp1_present=EXCLUDED.tp1_present, tp2_present=EXCLUDED.tp2_present, mark_price=EXCLUDED.mark_price,
    unrealized_pnl=EXCLUDED.unrealized_pnl, quantity=EXCLUDED.quantity, latest_sync_at=now(),
    monitor_run_id=EXCLUDED.monitor_run_id, repair_attempts=EXCLUDED.repair_attempts,
    recovery_status=EXCLUDED.recovery_status, latest_error=EXCLUDED.latest_error,
    last_action_taken=EXCLUDED.last_action_taken, updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.upsert_trade_management_truth(uuid,text,text,text,text,text,text,boolean,boolean,boolean,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_trade_management_truth(uuid,text,text,text,text,text,text,boolean,boolean,boolean,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text) TO service_role;

-- Existing provider-wide rows are intentionally not guessed or backfilled. They become
-- legacy history; all new writes fail closed through the guards above.
