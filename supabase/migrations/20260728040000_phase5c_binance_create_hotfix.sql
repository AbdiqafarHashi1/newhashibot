-- Phase 5C Binance-create hotfix. The prior legacy account_id check rejected the
-- deliberate canonical:binance:testnet:system fallback at the canonical insert.
ALTER TABLE public.connected_execution_accounts
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_account_id_check;
ALTER TABLE public.connected_execution_accounts
  ADD CONSTRAINT connected_execution_accounts_account_id_check CHECK (
    account_id !~ ':' OR (
      provider = 'binance' AND environment = 'testnet'
      AND ownership_classification = 'system'
      AND account_id = 'canonical:binance:testnet:system'
    )
  );

CREATE TABLE IF NOT EXISTS public.execution_account_onboarding_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_error_code text NOT NULL,
  failing_stage text NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL,
  owner_classification text NOT NULL,
  canonical_account_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.execution_account_onboarding_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_account_onboarding_diagnostics FROM anon, authenticated;
GRANT INSERT, SELECT ON public.execution_account_onboarding_diagnostics TO service_role;

DROP FUNCTION IF EXISTS public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean);
CREATE FUNCTION public.onboard_execution_account(
  p_ownership text, p_customer_id uuid, p_display_label text, p_provider text,
  p_environment text, p_provider_account_id text, p_secret_json text,
  p_selectable boolean DEFAULT true, p_monitor_enabled boolean DEFAULT true,
  p_operational boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE
  v_owner uuid; v_credential uuid; v_account_id uuid := gen_random_uuid();
  v_existing public.connected_execution_accounts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('error_code','OWNER_RESOLUTION_FAILED','failing_stage','owner_resolution');
  END IF;
  IF p_ownership NOT IN ('system','customer') THEN
    RETURN jsonb_build_object('error_code','OWNER_RESOLUTION_FAILED','failing_stage','owner_resolution');
  END IF;
  IF (lower(p_provider),lower(p_environment)) NOT IN (('binance','testnet'),('bybit','demo')) THEN
    RETURN jsonb_build_object('error_code','INVALID_PROVIDER_ENVIRONMENT','failing_stage','provider_environment_validation');
  END IF;
  IF nullif(trim(p_display_label),'') IS NULL OR nullif(trim(p_provider_account_id),'') IS NULL
     OR p_secret_json IS NULL OR nullif(p_secret_json::jsonb->>'api_key','') IS NULL
     OR nullif(p_secret_json::jsonb->>'api_secret','') IS NULL THEN
    RETURN jsonb_build_object('error_code','CANONICAL_ACCOUNT_INSERT_FAILED','failing_stage','request_contract_validation');
  END IF;

  IF p_ownership = 'system' THEN
    SELECT owner_id INTO v_owner FROM public.execution_system_owner WHERE singleton;
  ELSE
    SELECT id INTO v_owner FROM public.profiles WHERE id=p_customer_id AND role <> 'admin';
  END IF;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('error_code','OWNER_RESOLUTION_FAILED','failing_stage','owner_resolution');
  END IF;

  -- Binance Testnet has one canonical system slot even when native identity is
  -- unavailable. Check it before Vault is touched and return refresh metadata.
  IF p_ownership='system' AND lower(p_provider)='binance' AND lower(p_environment)='testnet' THEN
    SELECT * INTO v_existing FROM public.connected_execution_accounts
      WHERE customer_id=v_owner AND provider='binance' AND environment='testnet'
        AND ownership_classification='system' LIMIT 1;
  ELSE
    SELECT * INTO v_existing FROM public.connected_execution_accounts
      WHERE customer_id=v_owner AND provider=lower(p_provider) AND environment=lower(p_environment)
        AND provider_account_identity=trim(p_provider_account_id) LIMIT 1;
  END IF;
  IF FOUND THEN
    RETURN jsonb_build_object('error_code','SYSTEM_ACCOUNT_ALREADY_EXISTS','failing_stage','duplicate_check',
      'account_id',v_existing.id,'existing_account',jsonb_build_object(
        'id',v_existing.id,'display_label',v_existing.display_label,'provider',v_existing.provider,
        'environment',v_existing.environment,'ownership_classification',v_existing.ownership_classification,
        'enabled',v_existing.enabled,'monitor_enabled',v_existing.monitor_enabled,
        'is_operational',v_existing.is_operational,'execution_enabled',false));
  END IF;

  -- This exception block is a subtransaction: either both Vault and row exist,
  -- or both are rolled back before the safe result is returned.
  BEGIN
    BEGIN
      SELECT vault.create_secret(p_secret_json,concat('execution-account-',gen_random_uuid()::text),
        concat('Opaque ',lower(p_provider),'/',lower(p_environment),' execution credential')) INTO v_credential;
      IF v_credential IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001'; END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error_code','VAULT_WRITE_FAILED','failing_stage','vault_write','account_id',v_account_id);
    END;

    BEGIN
      IF p_operational THEN
        UPDATE public.connected_execution_accounts SET is_operational=false,updated_at=now()
          WHERE customer_id=v_owner AND provider=lower(p_provider) AND environment=lower(p_environment) AND is_operational;
      END IF;
      INSERT INTO public.connected_execution_accounts(
        id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,
        customer_id,ownership_classification,credential_ref,enabled,monitor_enabled,is_operational,
        execution_enabled,provider_health,credentials_verified_at,last_synchronized_at,last_error)
      VALUES(v_account_id,trim(p_display_label),trim(p_provider_account_id),trim(p_provider_account_id),
        CASE lower(p_provider) WHEN 'binance' THEN 'binance_usdm_testnet' ELSE 'bybit_demo' END,
        lower(p_provider),lower(p_environment),v_owner,p_ownership,v_credential::text,p_selectable,
        p_monitor_enabled,p_operational,false,'reachable',now(),now(),null);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='P0002';
    END;
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    RETURN jsonb_build_object('error_code','CANONICAL_ACCOUNT_INSERT_FAILED','failing_stage','canonical_account_insert','account_id',v_account_id);
  END;
  RETURN jsonb_build_object('account_id',v_account_id);
END $$;
REVOKE ALL ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.rollback_onboarded_execution_account(p_account_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_credential uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RETURN false; END IF;
  DELETE FROM public.connected_execution_accounts WHERE id=p_account_id
    RETURNING nullif(credential_ref,'')::uuid INTO v_credential;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_credential IS NOT NULL THEN PERFORM vault.delete_secret(v_credential); END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rollback_onboarded_execution_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_onboarded_execution_account(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
