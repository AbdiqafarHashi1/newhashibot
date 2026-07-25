-- Migration: Customer Security, Entitlement Authorization and Runtime Dispatcher Hardening
-- File: /supabase/migrations/20260725120000_customer_security_and_runtime_hardening.sql

BEGIN;

-- 1. Correct get_customer_entitlements security authorization
-- Prevents non-admin authenticated callers from querying other users' entitlement records.
CREATE OR REPLACE FUNCTION public.get_customer_entitlements(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  package_slug text,
  package_name text,
  access_status text,
  payment_status text,
  expires_at timestamptz,
  has_signal_access boolean,
  has_crypto_execution boolean,
  has_mt5_personal boolean,
  has_mt5_prop boolean,
  can_configure_bot boolean,
  active_product_slug text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_user_id uuid;
  v_sub record;
  v_req record;
  v_pkg_slug text := 'free_preview';
  v_pkg_name text := 'Free Preview';
  v_access_status text := 'no_package';
  v_payment_status text := 'unpaid';
  v_expires_at timestamptz := NULL;
  v_is_active boolean := false;
  v_has_signal boolean := false;
  v_has_crypto boolean := false;
  v_has_mt5_personal boolean := false;
  v_has_mt5_prop boolean := false;
  v_can_config boolean := false;
BEGIN
  -- Strict caller check: Non-admins can ONLY inspect their own user_id
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    v_target_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_target_user_id := auth.uid();
  END IF;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to inspect entitlements' USING ERRCODE = '28000';
  END IF;

  -- Retrieve subscription
  SELECT * INTO v_sub FROM public.customer_subscriptions WHERE customer_subscriptions.user_id = v_target_user_id LIMIT 1;
  -- Retrieve latest access request
  SELECT * INTO v_req FROM public.access_requests WHERE access_requests.user_id = v_target_user_id ORDER BY created_at DESC LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    v_pkg_name := COALESCE(v_sub.package_name, 'Unknown Package');
    SELECT slug INTO v_pkg_slug FROM public.packages WHERE id = v_sub.package_id;
    IF v_pkg_slug IS NULL THEN
      SELECT slug INTO v_pkg_slug FROM public.packages WHERE LOWER(name) = LOWER(v_sub.package_name);
    END IF;
    IF v_pkg_slug IS NULL THEN
      v_pkg_slug := LOWER(REPLACE(v_sub.package_name, ' ', '_'));
    END IF;

    v_payment_status := COALESCE(v_sub.payment_status, 'unpaid');
    v_expires_at := v_sub.expires_at;

    IF v_sub.access_status = 'suspended' THEN
      v_access_status := 'suspended';
    ELSIF v_sub.access_status = 'expired' OR v_sub.payment_status = 'expired' OR (v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now()) THEN
      v_access_status := 'expired';
    ELSIF v_sub.access_status = 'active' OR v_sub.payment_status = 'paid' THEN
      v_access_status := 'active';
      v_is_active := true;
    ELSE
      v_access_status := 'pending_admin_approval';
    END IF;
  ELSIF v_req.id IS NOT NULL THEN
    v_pkg_slug := COALESCE(v_req.product_slug, 'crypto_signal_room');
    SELECT name INTO v_pkg_name FROM public.packages WHERE slug = v_req.product_slug;
    IF v_pkg_name IS NULL THEN v_pkg_name := v_req.product_slug; END IF;

    IF v_req.status = 'rejected' THEN
      v_access_status := 'rejected';
    ELSIF v_req.status = 'pending_payment' THEN
      v_access_status := 'pending_payment';
    ELSIF v_req.status IN ('pending', 'pending_admin_approval') THEN
      v_access_status := 'pending_admin_approval';
    ELSIF v_req.status IN ('approved', 'converted_to_access') THEN
      v_access_status := 'active';
      v_is_active := true;
    END IF;
  END IF;

  -- Compute exact entitlements based on active status and package slug
  IF v_is_active THEN
    v_has_signal := true; -- All active paid packages include signal access
    IF v_pkg_slug = 'crypto_personal_bot' THEN
      v_has_crypto := true;
      v_can_config := true;
    ELSIF v_pkg_slug = 'forex_mt5_personal_bot' THEN
      v_has_mt5_personal := true;
      v_can_config := true;
    ELSIF v_pkg_slug = 'forex_mt5_prop_bot' THEN
      v_has_mt5_prop := true;
      v_can_config := true;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_target_user_id,
    v_pkg_slug,
    v_pkg_name,
    v_access_status,
    v_payment_status,
    v_expires_at,
    v_has_signal,
    v_has_crypto,
    v_has_mt5_personal,
    v_has_mt5_prop,
    v_can_config,
    v_pkg_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_entitlements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_entitlements(uuid) TO authenticated, service_role;

-- 2. Ensure customer isolation on customer_subscriptions
ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_subscriptions_owner_read ON public.customer_subscriptions;
CREATE POLICY customer_subscriptions_owner_read ON public.customer_subscriptions
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = customer_id OR public.is_admin());

-- 3. Ensure customer isolation on access_requests
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_requests_owner_read ON public.access_requests;
CREATE POLICY access_requests_owner_read ON public.access_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- 4. Ensure customer isolation on connected_execution_accounts
ALTER TABLE public.connected_execution_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connected_execution_accounts_owner_read ON public.connected_execution_accounts;
CREATE POLICY connected_execution_accounts_owner_read ON public.connected_execution_accounts
  FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = user_id OR public.is_admin());

-- 5. Ensure customer isolation on execution_orders
ALTER TABLE public.execution_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execution_orders_customer_read ON public.execution_orders;
CREATE POLICY execution_orders_customer_read ON public.execution_orders
  FOR SELECT USING (auth.uid() = customer_id OR public.is_admin());

-- 6. Ensure customer isolation on trade_management_truth
ALTER TABLE public.trade_management_truth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trade_management_truth_customer_read ON public.trade_management_truth;
CREATE POLICY trade_management_truth_customer_read ON public.trade_management_truth
  FOR SELECT USING (auth.uid() = customer_id OR public.is_admin());

-- 7. Ensure customer isolation on execution_event_logs
IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'execution_event_logs') THEN
  ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS execution_event_logs_customer_read ON public.execution_event_logs;
  CREATE POLICY execution_event_logs_customer_read ON public.execution_event_logs
    FOR SELECT USING (
      public.is_admin() OR 
      EXISTS (
        SELECT 1 FROM public.execution_orders eo 
        WHERE eo.id = execution_event_logs.execution_order_id 
          AND eo.customer_id = auth.uid()
      )
    );
END IF;

COMMIT;
