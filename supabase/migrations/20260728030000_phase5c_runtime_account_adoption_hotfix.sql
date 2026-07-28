-- Phase 5C runtime hotfix: preserve explicit operational intent and make the
-- canonical system-account read contract explicit for authenticated admins.
DROP POLICY IF EXISTS connected_execution_accounts_owner_read ON public.connected_execution_accounts;
CREATE POLICY connected_execution_accounts_owner_read ON public.connected_execution_accounts
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR COALESCE(public.is_admin(), false));
GRANT SELECT ON public.connected_execution_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.onboard_execution_account(
  p_ownership text, p_customer_id uuid, p_display_label text, p_provider text,
  p_environment text, p_provider_account_id text, p_secret_json text,
  p_selectable boolean DEFAULT true, p_monitor_enabled boolean DEFAULT true,
  p_operational boolean DEFAULT false
) RETURNS SETOF public.connected_execution_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_owner uuid; v_credential uuid; v_row public.connected_execution_accounts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  IF p_ownership NOT IN ('system', 'customer') THEN RAISE EXCEPTION 'invalid ownership classification'; END IF;
  IF (lower(p_provider), lower(p_environment)) NOT IN (('binance','testnet'), ('bybit','demo')) THEN RAISE EXCEPTION 'provider environment mismatch'; END IF;
  IF nullif(trim(p_display_label), '') IS NULL OR nullif(trim(p_provider_account_id), '') IS NULL THEN RAISE EXCEPTION 'label and discovered provider identity required'; END IF;
  IF p_secret_json IS NULL OR nullif(p_secret_json::jsonb->>'api_key', '') IS NULL OR nullif(p_secret_json::jsonb->>'api_secret', '') IS NULL THEN RAISE EXCEPTION 'verified credentials required'; END IF;
  IF p_ownership = 'system' THEN SELECT owner_id INTO v_owner FROM public.execution_system_owner WHERE singleton;
  ELSE SELECT id INTO v_owner FROM public.profiles WHERE id = p_customer_id AND role <> 'admin'; IF v_owner IS NULL THEN RAISE EXCEPTION 'canonical customer not found'; END IF; END IF;
  IF EXISTS (SELECT 1 FROM public.connected_execution_accounts WHERE customer_id=v_owner AND provider=lower(p_provider) AND environment=lower(p_environment) AND provider_account_identity=trim(p_provider_account_id)) THEN RAISE EXCEPTION 'duplicate owned provider account'; END IF;
  IF p_operational THEN UPDATE public.connected_execution_accounts SET is_operational=false, updated_at=now() WHERE customer_id=v_owner AND provider=lower(p_provider) AND environment=lower(p_environment) AND is_operational; END IF;
  SELECT vault.create_secret(p_secret_json, concat('execution-account-',gen_random_uuid()::text), concat('Opaque ',lower(p_provider),'/',lower(p_environment),' execution credential')) INTO v_credential;
  INSERT INTO public.connected_execution_accounts(display_label,account_id,provider_account_identity,adapter_identity,provider,environment,customer_id,ownership_classification,credential_ref,enabled,monitor_enabled,is_operational,execution_enabled,provider_health,credentials_verified_at,last_synchronized_at,last_error)
  VALUES(trim(p_display_label),trim(p_provider_account_id),trim(p_provider_account_id),CASE lower(p_provider) WHEN 'binance' THEN 'binance_usdm_testnet' ELSE 'bybit_demo' END,lower(p_provider),lower(p_environment),v_owner,p_ownership,v_credential::text,p_selectable,p_monitor_enabled,p_operational,false,'reachable',now(),now(),null)
  RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;
REVOKE ALL ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_execution_account(text,uuid,text,text,text,text,text,boolean,boolean,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
