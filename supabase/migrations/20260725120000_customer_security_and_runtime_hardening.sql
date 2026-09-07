-- Migration: Customer Security, Entitlement Authorization
-- and Runtime Dispatcher Hardening
-- File:
-- /supabase/migrations/20260725120000_customer_security_and_runtime_hardening.sql
--
-- This migration is intentionally schema-aware:
-- - It never references customer_id/user_id unless that column exists.
-- - RLS remains fail-closed when a recognizable ownership column is absent.
-- - Non-admin users may inspect only their own entitlements.

BEGIN;

-- ============================================================
-- 1. Secure customer entitlement lookup
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_customer_entitlements(
  p_user_id uuid DEFAULT NULL
)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
  /*
   * Service-role and administrators may inspect another user.
   * All other callers are hard-bound to auth.uid().
   */
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    v_target_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_target_user_id := auth.uid();
  END IF;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to inspect entitlements'
      USING ERRCODE = '28000';
  END IF;

  -- Retrieve the most relevant/latest subscription.
  SELECT cs.*
  INTO v_sub
  FROM public.customer_subscriptions AS cs
  WHERE cs.user_id = v_target_user_id
  ORDER BY
    cs.expires_at DESC NULLS LAST,
    cs.created_at DESC NULLS LAST
  LIMIT 1;

  -- Retrieve the latest access request.
  SELECT ar.*
  INTO v_req
  FROM public.access_requests AS ar
  WHERE ar.user_id = v_target_user_id
  ORDER BY ar.created_at DESC
  LIMIT 1;

  -- ----------------------------------------------------------
  -- Active subscription path
  -- ----------------------------------------------------------

  IF v_sub.id IS NOT NULL THEN
    v_pkg_name := COALESCE(v_sub.package_name, 'Unknown Package');

    IF v_sub.package_id IS NOT NULL THEN
      SELECT p.slug
      INTO v_pkg_slug
      FROM public.packages AS p
      WHERE p.id = v_sub.package_id
      LIMIT 1;
    END IF;

    IF v_pkg_slug IS NULL AND v_sub.package_name IS NOT NULL THEN
      SELECT p.slug
      INTO v_pkg_slug
      FROM public.packages AS p
      WHERE lower(p.name) = lower(v_sub.package_name)
      LIMIT 1;
    END IF;

    IF v_pkg_slug IS NULL THEN
      v_pkg_slug := lower(
        regexp_replace(
          COALESCE(v_sub.package_name, 'free_preview'),
          '[^a-zA-Z0-9]+',
          '_',
          'g'
        )
      );

      v_pkg_slug := trim(both '_' FROM v_pkg_slug);
    END IF;

    v_payment_status :=
      COALESCE(v_sub.payment_status, 'unpaid');

    v_expires_at := v_sub.expires_at;

    IF v_sub.access_status = 'suspended' THEN
      v_access_status := 'suspended';

    ELSIF v_sub.access_status = 'rejected' THEN
      v_access_status := 'rejected';

    ELSIF
      v_sub.access_status = 'expired'
      OR v_sub.payment_status = 'expired'
      OR (
        v_sub.expires_at IS NOT NULL
        AND v_sub.expires_at <= now()
      )
    THEN
      v_access_status := 'expired';

    ELSIF
      v_sub.access_status = 'active'
      AND COALESCE(v_sub.payment_status, 'unpaid')
          IN ('paid', 'approved', 'active')
      AND (
        v_sub.expires_at IS NULL
        OR v_sub.expires_at > now()
      )
    THEN
      v_access_status := 'active';
      v_is_active := true;

    ELSIF
      COALESCE(v_sub.payment_status, 'unpaid')
      IN ('unpaid', 'pending', 'pending_payment')
    THEN
      v_access_status := 'pending_payment';

    ELSE
      v_access_status := 'pending_admin_approval';
    END IF;

  -- ----------------------------------------------------------
  -- Access-request fallback path
  -- ----------------------------------------------------------

  ELSIF v_req.id IS NOT NULL THEN
    v_pkg_slug :=
      COALESCE(v_req.product_slug, 'crypto_signal_room');

    SELECT p.name
    INTO v_pkg_name
    FROM public.packages AS p
    WHERE p.slug = v_req.product_slug
    LIMIT 1;

    IF v_pkg_name IS NULL THEN
      v_pkg_name := COALESCE(
        v_req.product_slug,
        'Crypto Signal Room'
      );
    END IF;

    CASE v_req.status
      WHEN 'rejected' THEN
        v_access_status := 'rejected';

      WHEN 'pending_payment' THEN
        v_access_status := 'pending_payment';

      WHEN 'pending' THEN
        v_access_status := 'pending_admin_approval';

      WHEN 'pending_admin_approval' THEN
        v_access_status := 'pending_admin_approval';

      WHEN 'approved' THEN
        v_access_status := 'active';
        v_payment_status := 'paid';
        v_is_active := true;

      WHEN 'converted_to_access' THEN
        v_access_status := 'active';
        v_payment_status := 'paid';
        v_is_active := true;

      ELSE
        v_access_status := 'pending_admin_approval';
    END CASE;
  END IF;

  -- ----------------------------------------------------------
  -- Exact entitlement mapping
  -- ----------------------------------------------------------

  IF v_is_active THEN
    CASE v_pkg_slug
      WHEN 'crypto_signal_room' THEN
        v_has_signal := true;

      WHEN 'crypto_personal_bot' THEN
        v_has_signal := true;
        v_has_crypto := true;
        v_can_config := true;

      WHEN 'forex_mt5_personal_bot' THEN
        v_has_signal := true;
        v_has_mt5_personal := true;
        v_can_config := true;

      WHEN 'forex_mt5_prop_bot' THEN
        v_has_signal := true;
        v_has_mt5_prop := true;
        v_can_config := true;

      ELSE
        /*
         * Unknown packages receive no privileged execution
         * capabilities automatically.
         */
        v_has_signal := false;
        v_has_crypto := false;
        v_has_mt5_personal := false;
        v_has_mt5_prop := false;
        v_can_config := false;
    END CASE;
  END IF;

  RETURN QUERY
  SELECT
    v_target_user_id,
    COALESCE(v_pkg_slug, 'free_preview'),
    COALESCE(v_pkg_name, 'Free Preview'),
    v_access_status,
    v_payment_status,
    v_expires_at,
    v_has_signal,
    v_has_crypto,
    v_has_mt5_personal,
    v_has_mt5_prop,
    v_can_config,
    COALESCE(v_pkg_slug, 'free_preview');
END;
$$;

REVOKE ALL
ON FUNCTION public.get_customer_entitlements(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_customer_entitlements(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_customer_entitlements(uuid)
TO authenticated, service_role;


-- ============================================================
-- 2. customer_subscriptions RLS
-- ============================================================

ALTER TABLE public.customer_subscriptions
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_subscriptions_owner_read
ON public.customer_subscriptions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_subscriptions'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY customer_subscriptions_owner_read
      ON public.customer_subscriptions
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_subscriptions'
      AND column_name = 'customer_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY customer_subscriptions_owner_read
      ON public.customer_subscriptions
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSE
    RAISE NOTICE
      'customer_subscriptions has no user_id/customer_id; RLS remains fail-closed';
  END IF;
END
$$;


-- ============================================================
-- 3. access_requests RLS
-- ============================================================

ALTER TABLE public.access_requests
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_requests_owner_read
ON public.access_requests;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'access_requests'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY access_requests_owner_read
      ON public.access_requests
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'access_requests'
      AND column_name = 'customer_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY access_requests_owner_read
      ON public.access_requests
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSE
    RAISE NOTICE
      'access_requests has no user_id/customer_id; RLS remains fail-closed';
  END IF;
END
$$;


-- ============================================================
-- 4. connected_execution_accounts RLS
-- ============================================================

ALTER TABLE public.connected_execution_accounts
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connected_execution_accounts_owner_read
ON public.connected_execution_accounts;

DO $$
DECLARE
  v_has_user_id boolean;
  v_has_customer_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'connected_execution_accounts'
      AND column_name = 'user_id'
  )
  INTO v_has_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'connected_execution_accounts'
      AND column_name = 'customer_id'
  )
  INTO v_has_customer_id;

  IF v_has_user_id AND v_has_customer_id THEN
    EXECUTE $policy$
      CREATE POLICY connected_execution_accounts_owner_read
      ON public.connected_execution_accounts
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_user_id THEN
    EXECUTE $policy$
      CREATE POLICY connected_execution_accounts_owner_read
      ON public.connected_execution_accounts
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_customer_id THEN
    EXECUTE $policy$
      CREATE POLICY connected_execution_accounts_owner_read
      ON public.connected_execution_accounts
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSE
    RAISE NOTICE
      'connected_execution_accounts has no user_id/customer_id; RLS remains fail-closed';
  END IF;
END
$$;


-- ============================================================
-- 5. execution_orders RLS
-- ============================================================

ALTER TABLE public.execution_orders
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execution_orders_customer_read
ON public.execution_orders;

DO $$
DECLARE
  v_has_user_id boolean;
  v_has_customer_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execution_orders'
      AND column_name = 'user_id'
  )
  INTO v_has_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execution_orders'
      AND column_name = 'customer_id'
  )
  INTO v_has_customer_id;

  IF v_has_customer_id AND v_has_user_id THEN
    EXECUTE $policy$
      CREATE POLICY execution_orders_customer_read
      ON public.execution_orders
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_customer_id THEN
    EXECUTE $policy$
      CREATE POLICY execution_orders_customer_read
      ON public.execution_orders
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_user_id THEN
    EXECUTE $policy$
      CREATE POLICY execution_orders_customer_read
      ON public.execution_orders
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSE
    RAISE NOTICE
      'execution_orders has no user_id/customer_id; RLS remains fail-closed';
  END IF;
END
$$;


-- ============================================================
-- 6. trade_management_truth RLS
-- ============================================================

ALTER TABLE public.trade_management_truth
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_management_truth_customer_read
ON public.trade_management_truth;

DO $$
DECLARE
  v_has_user_id boolean;
  v_has_customer_id boolean;
  v_has_execution_order_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trade_management_truth'
      AND column_name = 'user_id'
  )
  INTO v_has_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trade_management_truth'
      AND column_name = 'customer_id'
  )
  INTO v_has_customer_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trade_management_truth'
      AND column_name = 'execution_order_id'
  )
  INTO v_has_execution_order_id;

  IF v_has_customer_id AND v_has_user_id THEN
    EXECUTE $policy$
      CREATE POLICY trade_management_truth_customer_read
      ON public.trade_management_truth
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_customer_id THEN
    EXECUTE $policy$
      CREATE POLICY trade_management_truth_customer_read
      ON public.trade_management_truth
      FOR SELECT
      TO authenticated
      USING (
        customer_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_user_id THEN
    EXECUTE $policy$
      CREATE POLICY trade_management_truth_customer_read
      ON public.trade_management_truth
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR COALESCE(public.is_admin(), false)
      )
    $policy$;

  ELSIF v_has_execution_order_id THEN
    /*
     * Use the execution order as the ownership chain when direct
     * ownership columns do not exist.
     */
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'execution_orders'
        AND column_name = 'customer_id'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY trade_management_truth_customer_read
        ON public.trade_management_truth
        FOR SELECT
        TO authenticated
        USING (
          COALESCE(public.is_admin(), false)
          OR EXISTS (
            SELECT 1
            FROM public.execution_orders AS eo
            WHERE eo.id = trade_management_truth.execution_order_id
              AND eo.customer_id = auth.uid()
          )
        )
      $policy$;

    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'execution_orders'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY trade_management_truth_customer_read
        ON public.trade_management_truth
        FOR SELECT
        TO authenticated
        USING (
          COALESCE(public.is_admin(), false)
          OR EXISTS (
            SELECT 1
            FROM public.execution_orders AS eo
            WHERE eo.id = trade_management_truth.execution_order_id
              AND eo.user_id = auth.uid()
          )
        )
      $policy$;

    ELSE
      RAISE NOTICE
        'trade_management_truth ownership chain cannot be resolved; RLS remains fail-closed';
    END IF;

  ELSE
    RAISE NOTICE
      'trade_management_truth has no supported ownership column; RLS remains fail-closed';
  END IF;
END
$$;


-- ============================================================
-- 7. execution_event_logs RLS, when the table exists
-- ============================================================

DO $$
DECLARE
  v_has_execution_order_id boolean;
  v_orders_have_customer_id boolean;
  v_orders_have_user_id boolean;
BEGIN
  IF to_regclass('public.execution_event_logs') IS NULL THEN
    RAISE NOTICE
      'execution_event_logs does not exist; skipping its RLS policy';
    RETURN;
  END IF;

  EXECUTE
    'ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY';

  EXECUTE
    'DROP POLICY IF EXISTS execution_event_logs_customer_read
     ON public.execution_event_logs';

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execution_event_logs'
      AND column_name = 'execution_order_id'
  )
  INTO v_has_execution_order_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execution_orders'
      AND column_name = 'customer_id'
  )
  INTO v_orders_have_customer_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'execution_orders'
      AND column_name = 'user_id'
  )
  INTO v_orders_have_user_id;

  IF NOT v_has_execution_order_id THEN
    RAISE NOTICE
      'execution_event_logs has no execution_order_id; RLS remains fail-closed';

  ELSIF v_orders_have_customer_id THEN
    EXECUTE $policy$
      CREATE POLICY execution_event_logs_customer_read
      ON public.execution_event_logs
      FOR SELECT
      TO authenticated
      USING (
        COALESCE(public.is_admin(), false)
        OR EXISTS (
          SELECT 1
          FROM public.execution_orders AS eo
          WHERE eo.id = execution_event_logs.execution_order_id
            AND eo.customer_id = auth.uid()
        )
      )
    $policy$;

  ELSIF v_orders_have_user_id THEN
    EXECUTE $policy$
      CREATE POLICY execution_event_logs_customer_read
      ON public.execution_event_logs
      FOR SELECT
      TO authenticated
      USING (
        COALESCE(public.is_admin(), false)
        OR EXISTS (
          SELECT 1
          FROM public.execution_orders AS eo
          WHERE eo.id = execution_event_logs.execution_order_id
            AND eo.user_id = auth.uid()
        )
      )
    $policy$;

  ELSE
    RAISE NOTICE
      'execution_orders has no supported ownership column; execution_event_logs RLS remains fail-closed';
  END IF;
END
$$;

COMMIT;
