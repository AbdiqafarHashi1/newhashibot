-- Phase 5C secure system/customer execution-account onboarding.
-- No credential material is added to ordinary tables; Vault is written and the
-- canonical row is created in the same database transaction.
CREATE TABLE IF NOT EXISTS public.execution_system_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT 'HashiBot System',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.execution_system_owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_system_owner FROM anon, authenticated;
INSERT INTO public.execution_system_owner(singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.connected_execution_accounts
  ADD COLUMN IF NOT EXISTS provider_account_identity text,
  ADD COLUMN IF NOT EXISTS adapter_identity text,
  ADD COLUMN IF NOT EXISTS credentials_verified_at timestamptz;

UPDATE public.connected_execution_accounts
SET provider_account_identity = account_id
WHERE provider_account_identity IS NULL;

ALTER TABLE public.connected_execution_accounts
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_customer_id_provider_account_id_key,
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_customer_id_provider_account_id_credential_ref_key;

CREATE UNIQUE INDEX IF NOT EXISTS connected_execution_accounts_owned_provider_identity_uidx
  ON public.connected_execution_accounts(customer_id, provider, environment, provider_account_identity)
  WHERE provider_account_identity IS NOT NULL;

DROP INDEX IF EXISTS public.connected_execution_accounts_one_operational_scope;
CREATE UNIQUE INDEX IF NOT EXISTS connected_execution_accounts_one_operational_owned_scope
  ON public.connected_execution_accounts(customer_id, provider, environment)
  WHERE is_operational;

COMMENT ON COLUMN public.connected_execution_accounts.provider_account_identity IS
  'Stable provider identity discovered by an authenticated provider read; never an API key.';
COMMENT ON COLUMN public.connected_execution_accounts.adapter_identity IS
  'Backend-selected provider adapter contract; never operator supplied.';
COMMENT ON COLUMN public.connected_execution_accounts.credentials_verified_at IS
  'Most recent successful credential and provider identity verification.';

CREATE OR REPLACE FUNCTION public.onboard_execution_account(
  p_ownership text,
  p_customer_id uuid,
  p_display_label text,
  p_provider text,
  p_environment text,
  p_provider_account_id text,
  p_secret_json text,
  p_selectable boolean DEFAULT true,
  p_monitor_enabled boolean DEFAULT true,
  p_operational boolean DEFAULT false
) RETURNS SETOF public.connected_execution_accounts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_owner uuid;
  v_credential uuid;
  v_operational boolean;
  v_row public.connected_execution_accounts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  IF p_ownership NOT IN ('system', 'customer') THEN RAISE EXCEPTION 'invalid ownership classification'; END IF;
  IF (p_provider, p_environment) NOT IN (('binance','testnet'), ('bybit','demo')) THEN RAISE EXCEPTION 'provider environment mismatch'; END IF;
  IF nullif(trim(p_display_label), '') IS NULL OR nullif(trim(p_provider_account_id), '') IS NULL THEN RAISE EXCEPTION 'label and discovered provider identity required'; END IF;
  IF p_secret_json IS NULL OR nullif(p_secret_json::jsonb->>'api_key', '') IS NULL OR nullif(p_secret_json::jsonb->>'api_secret', '') IS NULL THEN RAISE EXCEPTION 'verified credentials required'; END IF;

  IF p_ownership = 'system' THEN
    SELECT owner_id INTO v_owner FROM public.execution_system_owner WHERE singleton;
  ELSE
    SELECT id INTO v_owner FROM public.profiles WHERE id = p_customer_id AND role <> 'admin';
    IF v_owner IS NULL THEN RAISE EXCEPTION 'canonical customer not found'; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.connected_execution_accounts
    WHERE customer_id = v_owner AND provider = p_provider AND environment = p_environment
      AND provider_account_identity = trim(p_provider_account_id)
  ) THEN RAISE EXCEPTION 'duplicate owned provider account'; END IF;

  v_operational := p_operational OR NOT EXISTS (
    SELECT 1 FROM public.connected_execution_accounts
    WHERE customer_id = v_owner AND provider = p_provider AND environment = p_environment
  );
  IF v_operational THEN
    UPDATE public.connected_execution_accounts SET is_operational = false, updated_at = now()
    WHERE customer_id = v_owner AND provider = p_provider AND environment = p_environment AND is_operational;
  END IF;

  SELECT vault.create_secret(
    p_secret_json,
    concat('execution-account-', gen_random_uuid()::text),
    concat('Opaque ', p_provider, '/', p_environment, ' execution credential')
  ) INTO v_credential;

  INSERT INTO public.connected_execution_accounts(
    display_label, account_id, provider_account_identity, adapter_identity,
    provider, environment, customer_id, ownership_classification, credential_ref,
    enabled, monitor_enabled, is_operational, execution_enabled,
    provider_health, credentials_verified_at, last_synchronized_at, last_error
  ) VALUES (
    trim(p_display_label), trim(p_provider_account_id), trim(p_provider_account_id),
    CASE p_provider WHEN 'binance' THEN 'binance_usdm_testnet' ELSE 'bybit_demo' END,
    p_provider, p_environment, v_owner, p_ownership, v_credential::text,
    p_selectable, p_monitor_enabled, v_operational, false,
    'reachable', now(), now(), null
  ) RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;
REVOKE ALL ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
