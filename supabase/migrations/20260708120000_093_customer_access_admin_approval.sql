-- Migration: customer package approval and canonical access state helper
-- 20260708120000_093_customer_access_admin_approval.sql

-- 1. Create performance indexes for access queries
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_pkg 
  ON public.customer_subscriptions(user_id, package_id);

CREATE INDEX IF NOT EXISTS idx_access_requests_user_status 
  ON public.access_requests(user_id, status);

-- 2. Safe backfill for already approved requests that do not have active customer_subscriptions
DO $$
DECLARE
  v_req record;
  v_pkg record;
  v_sub record;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
BEGIN
  FOR v_req IN 
    SELECT * FROM public.access_requests 
    WHERE status IN ('approved', 'converted_to_access')
  LOOP
    -- Lookup package
    SELECT * INTO v_pkg FROM public.packages WHERE slug = v_req.product_slug;
    
    -- Check if subscription exists
    SELECT * INTO v_sub FROM public.customer_subscriptions WHERE user_id = v_req.user_id;
    
    v_starts_at := COALESCE(v_sub.starts_at, v_req.created_at, now());
    IF v_pkg.duration_days IS NOT NULL THEN
      v_expires_at := v_starts_at + (v_pkg.duration_days || ' days')::interval;
    ELSE
      v_expires_at := NULL;
    END IF;

    IF v_sub.id IS NULL THEN
      -- Insert active subscription
      INSERT INTO public.customer_subscriptions (
        user_id,
        profile_id,
        email,
        full_name,
        package_id,
        package_name,
        payment_status,
        access_status,
        amount_paid,
        currency,
        payment_reference,
        payment_method,
        starts_at,
        expires_at,
        telegram_status,
        telegram_username,
        telegram_chat_id,
        notes,
        created_at,
        updated_at
      ) VALUES (
        v_req.user_id,
        v_req.user_id,
        v_req.email,
        v_req.full_name,
        v_pkg.id,
        COALESCE(v_pkg.name, v_req.product_slug),
        'paid',
        'active',
        COALESCE(v_pkg.price_kes, v_pkg.price, 5000),
        COALESCE(v_pkg.currency, 'KES'),
        COALESCE(v_req.payment_reference, ''),
        COALESCE(v_req.payment_method, 'manual'),
        v_starts_at,
        v_expires_at,
        'not_invited',
        COALESCE(v_req.telegram_username, ''),
        COALESCE(v_req.telegram_chat_id, ''),
        COALESCE(v_req.notes, ''),
        v_req.created_at,
        now()
      );
    ELSE
      -- Update if subscription exists but is not active/paid
      IF v_sub.access_status <> 'active' OR v_sub.payment_status <> 'paid' THEN
        UPDATE public.customer_subscriptions SET
          access_status = 'active',
          payment_status = 'paid',
          package_id = COALESCE(v_sub.package_id, v_pkg.id),
          package_name = COALESCE(v_sub.package_name, v_pkg.name, v_req.product_slug),
          starts_at = v_starts_at,
          expires_at = COALESCE(v_sub.expires_at, v_expires_at),
          updated_at = now()
        WHERE id = v_sub.id;
      END IF;
    END IF;

    -- Update legacy user_access
    INSERT INTO public.user_access (
      user_id,
      product_slug,
      status,
      started_at,
      expires_at,
      created_at,
      updated_at
    ) VALUES (
      v_req.user_id,
      'signal_mode',
      'active',
      v_starts_at,
      v_expires_at,
      now(),
      now()
    ) ON CONFLICT (user_id, product_slug) DO UPDATE SET
      status = 'active',
      started_at = EXCLUDED.started_at,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();

  END LOOP;
END $$;

-- 3. Create canonical function get_customer_access_state
CREATE OR REPLACE FUNCTION public.get_customer_access_state(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  package_id uuid,
  package_slug text,
  package_name text,
  access_status text,
  payment_status text,
  approval_status text,
  signal_access_enabled boolean,
  execution_access_enabled boolean,
  telegram_link_status text,
  start_date timestamptz,
  expiry_date timestamptz,
  disabled_reason text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub record;
  v_req record;
  v_tg_status text;
  v_pkg_slug text;
  v_pkg_name text;
  v_pkg_id uuid;
  v_is_past_expiry boolean := false;
  v_access_status text := 'no_package';
  v_payment_status text := 'unpaid';
  v_approval_status text := 'none';
  v_signal_enabled boolean := false;
  v_exec_enabled boolean := false;
  v_disabled_reason text := '';
BEGIN
  -- Fetch subscription
  SELECT * INTO v_sub FROM public.customer_subscriptions WHERE customer_subscriptions.user_id = p_user_id LIMIT 1;
  
  -- Fetch latest request
  SELECT * INTO v_req FROM public.access_requests WHERE access_requests.user_id = p_user_id ORDER BY created_at DESC LIMIT 1;
  
  -- Fetch telegram link status
  SELECT status INTO v_tg_status FROM public.telegram_links WHERE telegram_links.user_id = p_user_id LIMIT 1;
  IF v_tg_status IS NULL THEN
    v_tg_status := 'not linked';
  ELSIF v_tg_status = 'connected' THEN
    v_tg_status := 'joined';
  ELSIF v_tg_status = 'pending' THEN
    v_tg_status := 'pending';
  ELSE
    v_tg_status := 'not linked';
  END IF;

  -- Expiry calculation
  IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
    v_is_past_expiry := true;
  END IF;

  -- Populate package details
  IF v_sub.id IS NOT NULL THEN
    v_pkg_id := v_sub.package_id;
    v_pkg_name := v_sub.package_name;
    -- lookup slug
    SELECT slug INTO v_pkg_slug FROM public.packages WHERE id = v_sub.package_id;
    IF v_pkg_slug IS NULL THEN
      -- try to match by name
      SELECT slug INTO v_pkg_slug FROM public.packages WHERE LOWER(name) = LOWER(v_sub.package_name);
    END IF;
  ELSIF v_req.id IS NOT NULL THEN
    v_pkg_slug := v_req.product_slug;
    SELECT id, name INTO v_pkg_id, v_pkg_name FROM public.packages WHERE slug = v_req.product_slug;
    IF v_pkg_name IS NULL THEN
      v_pkg_name := v_req.product_slug;
    END IF;
  END IF;

  -- Access status resolution
  IF v_sub.id IS NOT NULL THEN
    v_payment_status := v_sub.payment_status;
    v_approval_status := 'approved';
    
    IF v_sub.access_status = 'suspended' THEN
      v_access_status := 'suspended';
      v_disabled_reason := 'Access has been suspended by administration';
    ELSIF v_sub.access_status = 'expired' OR v_sub.payment_status = 'expired' OR v_is_past_expiry THEN
      v_access_status := 'expired';
      v_disabled_reason := 'Subscription has expired';
    ELSIF v_sub.access_status = 'active' OR v_sub.payment_status = 'paid' THEN
      v_access_status := 'active';
      v_payment_status := 'paid';
    ELSE
      v_access_status := 'pending_admin_approval';
    END IF;
  ELSIF v_req.id IS NOT NULL THEN
    v_approval_status := v_req.status;
    IF v_req.status = 'rejected' THEN
      v_access_status := 'rejected';
      v_disabled_reason := COALESCE(v_req.admin_note, 'Request rejected by admin');
    ELSIF v_req.status = 'pending_payment' THEN
      v_access_status := 'pending_payment';
    ELSIF v_req.status IN ('pending', 'pending_admin_approval') THEN
      v_access_status := 'pending_admin_approval';
    ELSIF v_req.status IN ('approved', 'converted_to_access') THEN
      v_access_status := 'active';
      v_payment_status := 'paid';
    END IF;
  ELSE
    v_access_status := 'no_package';
  END IF;

  -- Signal and execution flags
  IF v_access_status = 'active' THEN
    IF v_pkg_slug IN ('crypto_signal_room', 'crypto_personal_bot', 'forex_mt5_personal_bot', 'forex_mt5_prop_bot') THEN
      v_signal_enabled := true;
    END IF;
    -- No live execution unless explicitly configured
    v_exec_enabled := false; 
  END IF;

  RETURN QUERY SELECT
    p_user_id,
    v_pkg_id,
    COALESCE(v_pkg_slug, ''),
    COALESCE(v_pkg_name, ''),
    v_access_status,
    v_payment_status,
    v_approval_status,
    v_signal_enabled,
    v_exec_enabled,
    v_tg_status,
    v_sub.starts_at,
    v_sub.expires_at,
    v_disabled_reason;
END;
$$;
