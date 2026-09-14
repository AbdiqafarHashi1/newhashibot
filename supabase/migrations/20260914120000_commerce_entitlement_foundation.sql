-- Commercial Build 2 Step 1: extend the existing canonical customer_subscriptions path.
-- Additive only. Do not apply remotely without comparing the production migration ledger.

ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS product_slug text,
  ADD COLUMN IF NOT EXISTS commerce_provider text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_membership_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_state text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entitlement_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE public.customer_subscriptions s SET product_slug = p.slug
FROM public.packages p WHERE s.product_slug IS NULL AND s.package_id = p.id;

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS public_reference uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expected_amount_kes numeric,
  ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_public_reference_uidx ON public.access_requests(public_reference);

CREATE TABLE IF NOT EXISTS public.commerce_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('WHOP','MPESA')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_customer_id text,
  provider_membership_id text,
  provider_payment_id text,
  provider_plan_id text,
  provider_occurred_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
  processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts BETWEEN 0 AND 10),
  safe_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);
ALTER TABLE public.commerce_provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read commerce provider events" ON public.commerce_provider_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION public.has_product_entitlement(p_user_id uuid, p_product_slug text, p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM customer_subscriptions
    WHERE user_id = p_user_id AND product_slug = p_product_slug
      AND access_status = 'active' AND payment_status = 'paid'
      AND revoked_at IS NULL AND coalesce(starts_at,created_at) <= p_at
      AND (expires_at IS NULL OR expires_at > p_at)
  ) AND (auth.uid() = p_user_id OR auth.role()='service_role' OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));
$$;
REVOKE ALL ON FUNCTION public.has_product_entitlement(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_product_entitlement(uuid,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_vip_commerce_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s customer_subscriptions; r access_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO s FROM customer_subscriptions WHERE user_id=auth.uid() AND product_slug='crypto_signal_room' ORDER BY updated_at DESC LIMIT 1;
  IF s.id IS NOT NULL AND s.access_status='active' AND s.payment_status='paid' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()) THEN
    RETURN jsonb_build_object('state','ACTIVE','expires_at',s.expires_at,'provider',s.commerce_provider);
  END IF;
  SELECT * INTO r FROM access_requests WHERE user_id=auth.uid() AND product_slug='crypto_signal_room' ORDER BY created_at DESC LIMIT 1;
  IF r.id IS NULL THEN RETURN jsonb_build_object('state','NOT_FOUND'); END IF;
  IF r.status IN ('pending','pending_payment','pending_admin_approval') THEN RETURN jsonb_build_object('state','MPESA_PENDING','reference',r.public_reference,'submitted_at',r.created_at); END IF;
  IF r.status='rejected' THEN RETURN jsonb_build_object('state','REJECTED','reference',r.public_reference); END IF;
  RETURN jsonb_build_object('state','VERIFYING');
END $$;
REVOKE ALL ON FUNCTION public.my_vip_commerce_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_vip_commerce_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_mpesa_request(p_request_id uuid, p_decision text, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r access_requests; pkg packages; sub_id uuid; now_at timestamptz:=now(); end_at timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_decision NOT IN ('APPROVE','REJECT') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO r FROM access_requests WHERE id=p_request_id FOR UPDATE;
  IF r.id IS NULL OR lower(r.payment_method) <> 'mpesa' THEN RAISE EXCEPTION 'mpesa_request_not_found'; END IF;
  IF r.status IN ('converted_to_access','approved') AND p_decision='APPROVE' THEN RETURN jsonb_build_object('state','ACTIVE','idempotent',true); END IF;
  IF r.status='rejected' THEN RETURN jsonb_build_object('state','REJECTED','idempotent',true); END IF;
  IF p_decision='REJECT' THEN
    UPDATE access_requests SET status='rejected',admin_note=p_reason,updated_at=now_at,verified_by=auth.uid() WHERE id=r.id;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'mpesa_payment_rejected','access_requests',r.id::text,jsonb_build_object('product',r.product_slug,'reason',p_reason));
    RETURN jsonb_build_object('state','REJECTED','idempotent',false);
  END IF;
  IF r.product_slug <> 'crypto_signal_room' OR coalesce(r.expected_amount_kes,0) <> 3500 THEN RAISE EXCEPTION 'vip_product_or_amount_mismatch'; END IF;
  IF r.user_id IS NULL THEN RAISE EXCEPTION 'customer_identity_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.user_id::text||':crypto_signal_room',0));
  SELECT * INTO pkg FROM packages WHERE slug='crypto_signal_room' LIMIT 1;
  end_at:=now_at+interval '30 days';
  SELECT id INTO sub_id FROM customer_subscriptions WHERE user_id=r.user_id AND product_slug='crypto_signal_room' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF sub_id IS NULL THEN
    INSERT INTO customer_subscriptions(user_id,profile_id,email,full_name,package_id,package_name,product_slug,payment_status,access_status,amount_paid,currency,payment_reference,payment_method,commerce_provider,starts_at,expires_at,telegram_username,entitlement_provenance,updated_at)
    VALUES(r.user_id,r.user_id,r.email,r.full_name,pkg.id,coalesce(pkg.name,'VIP Signal Room (Forex & Crypto)'),'crypto_signal_room','paid','active',3500,'KES',r.payment_reference,'mpesa','MPESA',now_at,end_at,r.telegram_username,jsonb_build_object('access_request_id',r.id,'actor_id',auth.uid()),now_at) RETURNING id INTO sub_id;
  ELSE
    UPDATE customer_subscriptions SET payment_status='paid',access_status='active',amount_paid=3500,currency='KES',payment_reference=r.payment_reference,payment_method='mpesa',commerce_provider='MPESA',starts_at=now_at,expires_at=end_at,revoked_at=NULL,entitlement_provenance=jsonb_build_object('access_request_id',r.id,'actor_id',auth.uid()),updated_at=now_at WHERE id=sub_id;
  END IF;
  UPDATE access_requests SET status='converted_to_access',admin_note=p_reason,verified_at=now_at,verified_by=auth.uid(),updated_at=now_at WHERE id=r.id;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'mpesa_payment_approved_entitlement_activated','customer_subscriptions',sub_id::text,jsonb_build_object('request_id',r.id,'product','crypto_signal_room','expires_at',end_at,'previous_request_status',r.status));
  RETURN jsonb_build_object('state','ACTIVE','expires_at',end_at,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_review_mpesa_request(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_mpesa_request(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mutate_vip_entitlement(p_user_id uuid,p_action text,p_duration_days integer DEFAULT 30,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s customer_subscriptions; pkg packages; now_at timestamptz:=now(); end_at timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_action NOT IN ('GRANT','EXTEND','REVOKE') OR p_duration_days<1 OR p_duration_days>3650 THEN RAISE EXCEPTION 'invalid_mutation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':crypto_signal_room',0));
 SELECT * INTO s FROM customer_subscriptions WHERE user_id=p_user_id AND product_slug='crypto_signal_room' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF p_action='REVOKE' THEN
   IF s.id IS NULL THEN RETURN jsonb_build_object('state','INACTIVE','idempotent',true); END IF;
   UPDATE customer_subscriptions SET access_status='inactive',revoked_at=now_at,provider_state='admin_revoked',updated_at=now_at WHERE id=s.id;
 ELSE
   end_at := CASE WHEN p_action='EXTEND' AND s.expires_at>now_at THEN s.expires_at ELSE now_at END + make_interval(days=>p_duration_days);
   IF s.id IS NULL THEN SELECT * INTO pkg FROM packages WHERE slug='crypto_signal_room' LIMIT 1; INSERT INTO customer_subscriptions(user_id,profile_id,email,full_name,package_id,package_name,product_slug,payment_status,access_status,payment_method,commerce_provider,starts_at,expires_at,entitlement_provenance,updated_at) SELECT p.id,p.id,p.email,p.full_name,pkg.id,coalesce(pkg.name,'VIP Signal Room (Forex & Crypto)'),'crypto_signal_room','paid','active','manual','MANUAL',now_at,end_at,jsonb_build_object('actor_id',auth.uid(),'reason',p_reason),now_at FROM profiles p WHERE p.id=p_user_id RETURNING * INTO s;
   ELSE UPDATE customer_subscriptions SET payment_status='paid',access_status='active',commerce_provider='MANUAL',expires_at=end_at,revoked_at=NULL,entitlement_provenance=jsonb_build_object('actor_id',auth.uid(),'reason',p_reason),updated_at=now_at WHERE id=s.id RETURNING * INTO s; END IF;
 END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'admin_vip_'||lower(p_action),'customer_subscriptions',s.id::text,jsonb_build_object('target_user_id',p_user_id,'duration_days',p_duration_days,'reason',p_reason,'expires_at',end_at));
 RETURN jsonb_build_object('state',CASE WHEN p_action='REVOKE' THEN 'INACTIVE' ELSE 'ACTIVE' END,'expires_at',end_at);
END $$;
REVOKE ALL ON FUNCTION public.admin_mutate_vip_entitlement(uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mutate_vip_entitlement(uuid,text,integer,text) TO authenticated;
