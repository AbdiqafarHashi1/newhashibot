-- Final Whop lifecycle normalization into existing canonical commerce tables.
ALTER TABLE public.commerce_provider_events
 ADD COLUMN IF NOT EXISTS provider_member_id text,
 ADD COLUMN IF NOT EXISTS provider_product_id text,
 ADD COLUMN IF NOT EXISTS provider_state text,
 ADD COLUMN IF NOT EXISTS period_start timestamptz,
 ADD COLUMN IF NOT EXISTS period_end timestamptz,
 ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean,
 ADD COLUMN IF NOT EXISTS normalized_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.customer_subscriptions
 ADD COLUMN IF NOT EXISTS provider_member_id text,
 ADD COLUMN IF NOT EXISTS provider_plan_id text,
 ADD COLUMN IF NOT EXISTS provider_product_id text;

CREATE TABLE IF NOT EXISTS public.commerce_customer_links(
 provider text NOT NULL CHECK(provider='WHOP'), provider_customer_id text NOT NULL,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 provider_member_id text, linked_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,provider_customer_id), UNIQUE(provider,user_id)
);
ALTER TABLE public.commerce_customer_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read commerce customer links" ON public.commerce_customer_links FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));

CREATE OR REPLACE FUNCTION public.process_whop_commerce_event(
 p_event_id text,p_event_type text,p_product_slug text,p_customer_id text,p_member_id text,p_membership_id text,p_payment_id text,p_plan_id text,p_product_id text,p_customer_email text,p_provider_state text,p_period_start timestamptz,p_period_end timestamptz,p_cancel_at_period_end boolean,p_occurred_at timestamptz,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ev commerce_provider_events; customer uuid; sub customer_subscriptions; pkg packages; now_at timestamptz:=now();
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 IF p_event_id IS NULL OR p_event_type IS NULL THEN RAISE EXCEPTION 'malformed_event'; END IF;
 INSERT INTO commerce_provider_events(provider,provider_event_id,event_type,provider_customer_id,provider_member_id,provider_membership_id,provider_payment_id,provider_plan_id,provider_product_id,provider_state,provider_occurred_at,period_start,period_end,cancel_at_period_end,normalized_metadata,processing_status,processing_attempts)
 VALUES('WHOP',p_event_id,p_event_type,p_customer_id,p_member_id,p_membership_id,p_payment_id,p_plan_id,p_product_id,p_provider_state,p_occurred_at,p_period_start,p_period_end,p_cancel_at_period_end,coalesce(p_metadata,'{}'), 'received',1)
 ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING * INTO ev;
 IF ev.id IS NULL THEN
  SELECT * INTO ev FROM commerce_provider_events WHERE provider='WHOP' AND provider_event_id=p_event_id FOR UPDATE;
  IF ev.processing_status IN ('processed','ignored','received') OR ev.processing_attempts>=10 THEN RETURN jsonb_build_object('state','DUPLICATE','processed',false); END IF;
  UPDATE commerce_provider_events SET processing_status='received',processing_attempts=processing_attempts+1,safe_error_code=NULL WHERE id=ev.id;
 END IF;
 IF p_product_slug IS NULL THEN UPDATE commerce_provider_events SET processing_status='ignored',processed_at=now_at,safe_error_code='unknown_or_unconfigured_plan' WHERE id=ev.id; RETURN jsonb_build_object('state','IGNORED_UNKNOWN_PLAN'); END IF;
 IF p_product_slug NOT IN ('crypto_signal_room','forex_mt5_personal_bot','forex_mt5_prop_bot','crypto_prop_bot') THEN RAISE EXCEPTION 'unsupported_product_mapping'; END IF;
 -- Email is used only when supplied by Whop payment truth and must match an existing authenticated profile.
 IF p_customer_email IS NOT NULL THEN SELECT id INTO customer FROM profiles WHERE lower(email)=lower(p_customer_email) LIMIT 1; END IF;
 IF customer IS NULL AND p_customer_id IS NOT NULL THEN SELECT user_id INTO customer FROM commerce_customer_links WHERE provider='WHOP' AND provider_customer_id=p_customer_id; END IF;
 IF customer IS NOT NULL AND p_customer_id IS NOT NULL THEN INSERT INTO commerce_customer_links(provider,provider_customer_id,user_id,provider_member_id) VALUES('WHOP',p_customer_id,customer,p_member_id) ON CONFLICT(provider,provider_customer_id) DO UPDATE SET provider_member_id=coalesce(EXCLUDED.provider_member_id,commerce_customer_links.provider_member_id),updated_at=now_at; END IF;
 SELECT * INTO sub FROM customer_subscriptions WHERE commerce_provider='WHOP' AND ((p_membership_id IS NOT NULL AND provider_membership_id=p_membership_id) OR (customer IS NOT NULL AND user_id=customer AND product_slug=p_product_slug)) ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF customer IS NULL AND sub.id IS NOT NULL THEN customer:=sub.user_id; END IF;
 IF p_event_type IN ('member.created','member.updated','refund.created','refund.updated','dispute.created','dispute.updated') THEN
  UPDATE commerce_provider_events SET processing_status='processed',processed_at=now_at WHERE id=ev.id; RETURN jsonb_build_object('state','RECORDED');
 END IF;
 IF customer IS NULL THEN UPDATE commerce_provider_events SET processing_status='failed',safe_error_code='customer_not_linked',processed_at=now_at WHERE id=ev.id; RETURN jsonb_build_object('state','RETRYABLE_CUSTOMER_NOT_LINKED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(customer::text||':'||p_product_slug,0));
 SELECT * INTO sub FROM customer_subscriptions WHERE commerce_provider='WHOP' AND ((p_membership_id IS NOT NULL AND provider_membership_id=p_membership_id) OR (user_id=customer AND product_slug=p_product_slug)) ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 SELECT * INTO pkg FROM packages WHERE slug=p_product_slug LIMIT 1;
 IF sub.id IS NULL AND p_event_type IN ('membership.activated','payment.succeeded') THEN
  INSERT INTO customer_subscriptions(user_id,profile_id,email,full_name,package_id,package_name,product_slug,payment_status,access_status,payment_method,commerce_provider,starts_at,expires_at,provider_customer_id,provider_member_id,provider_membership_id,provider_payment_id,provider_plan_id,provider_product_id,provider_state,cancel_at_period_end,entitlement_provenance,updated_at)
  SELECT customer,customer,p.email,p.full_name,pkg.id,pkg.name,p_product_slug,'paid','active','whop','WHOP',coalesce(p_period_start,now_at),p_period_end,p_customer_id,p_member_id,p_membership_id,p_payment_id,p_plan_id,p_product_id,p_provider_state,coalesce(p_cancel_at_period_end,false),jsonb_build_object('provider_event_id',p_event_id),now_at FROM profiles p WHERE p.id=customer RETURNING * INTO sub;
 ELSIF p_event_type='membership.activated' THEN UPDATE customer_subscriptions SET payment_status='paid',access_status='active',revoked_at=NULL,provider_customer_id=coalesce(p_customer_id,provider_customer_id),provider_member_id=coalesce(p_member_id,provider_member_id),provider_membership_id=coalesce(p_membership_id,provider_membership_id),provider_plan_id=p_plan_id,provider_product_id=p_product_id,provider_state=p_provider_state,cancel_at_period_end=coalesce(p_cancel_at_period_end,false),starts_at=coalesce(p_period_start,starts_at,now_at),expires_at=p_period_end,updated_at=now_at WHERE id=sub.id;
 ELSIF p_event_type='membership.cancel_at_period_end_changed' THEN UPDATE customer_subscriptions SET cancel_at_period_end=coalesce(p_cancel_at_period_end,false),provider_state=p_provider_state,expires_at=coalesce(p_period_end,expires_at),updated_at=now_at WHERE id=sub.id;
 ELSIF p_event_type='membership.deactivated' THEN UPDATE customer_subscriptions SET access_status='inactive',provider_state=p_provider_state,revoked_at=now_at,updated_at=now_at WHERE id=sub.id;
 ELSIF p_event_type='payment.succeeded' THEN UPDATE customer_subscriptions SET payment_status='paid',provider_payment_id=p_payment_id,provider_state=coalesce(p_provider_state,provider_state),expires_at=coalesce(p_period_end,expires_at),updated_at=now_at WHERE id=sub.id;
 ELSIF p_event_type IN ('payment.pending','payment.failed') THEN UPDATE customer_subscriptions SET provider_payment_id=p_payment_id,provider_state=p_provider_state,updated_at=now_at WHERE id=sub.id;
 END IF;
 UPDATE commerce_provider_events SET processing_status='processed',processed_at=now_at WHERE id=ev.id;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(NULL,'whop_'||replace(p_event_type,'.','_'),'customer_subscriptions',sub.id::text,jsonb_build_object('event_id',p_event_id,'product',p_product_slug,'plan_id',p_plan_id,'customer_id',customer));
 RETURN jsonb_build_object('state','PROCESSED','subscription_id',sub.id);
EXCEPTION WHEN OTHERS THEN
 IF ev.id IS NOT NULL THEN UPDATE commerce_provider_events SET processing_status='failed',safe_error_code='processing_exception',processed_at=now() WHERE id=ev.id; END IF;
 RAISE;
END $$;
REVOKE ALL ON FUNCTION public.process_whop_commerce_event(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_whop_commerce_event(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,jsonb) TO service_role;
