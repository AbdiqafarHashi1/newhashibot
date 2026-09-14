-- Commercial Build 2 Step 2. Extends the existing telegram_links identity/operations table.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_display_name text,
  ADD COLUMN IF NOT EXISTS product_slug text NOT NULL DEFAULT 'crypto_signal_room',
  ADD COLUMN IF NOT EXISTS access_state text NOT NULL DEFAULT 'not_linked',
  ADD COLUMN IF NOT EXISTS last_fulfillment_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fulfillment_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfillment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_error text,
  ADD COLUMN IF NOT EXISTS invite_link text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_numeric_identity_uidx
  ON public.telegram_links(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_telegram_numeric_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.role()<>'service_role' AND NEW.telegram_user_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.telegram_user_id IS DISTINCT FROM OLD.telegram_user_id) THEN
  RAISE EXCEPTION 'numeric_telegram_identity_is_bot_managed';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_telegram_numeric_identity_trigger ON public.telegram_links;
CREATE TRIGGER protect_telegram_numeric_identity_trigger BEFORE INSERT OR UPDATE ON public.telegram_links FOR EACH ROW EXECUTE FUNCTION public.protect_telegram_numeric_identity();

CREATE TABLE IF NOT EXISTS public.telegram_onboarding_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_slug text NOT NULL CHECK (product_slug = 'crypto_signal_room'),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_onboarding_tokens ENABLE ROW LEVEL SECURITY;
-- No direct table policies: customers use the scoped RPC and the bot uses service_role.

CREATE OR REPLACE FUNCTION public.create_vip_telegram_onboarding()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE raw_token text; existing_link telegram_links;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF NOT public.has_product_entitlement(auth.uid(),'crypto_signal_room',now()) THEN RAISE EXCEPTION 'active_vip_entitlement_required'; END IF;
 SELECT * INTO existing_link FROM telegram_links WHERE user_id=auth.uid() AND telegram_user_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;
 IF existing_link.id IS NOT NULL THEN RETURN jsonb_build_object('state','LINKED','telegram_user_id',existing_link.telegram_user_id,'access_state',existing_link.access_state); END IF;
 -- Invalidate the prior unused token; only the newest customer link can be consumed.
 UPDATE telegram_onboarding_tokens SET used_at=now() WHERE user_id=auth.uid() AND product_slug='crypto_signal_room' AND used_at IS NULL;
 raw_token:=encode(gen_random_bytes(24),'hex');
 INSERT INTO telegram_onboarding_tokens(user_id,product_slug,token_hash,expires_at) VALUES(auth.uid(),'crypto_signal_room',encode(digest(raw_token,'sha256'),'hex'),now()+interval '15 minutes');
 RETURN jsonb_build_object('state','ONBOARDING_REQUIRED','token',raw_token,'expires_at',now()+interval '15 minutes');
END $$;
REVOKE ALL ON FUNCTION public.create_vip_telegram_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vip_telegram_onboarding() TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_vip_telegram_onboarding(p_token_hash text,p_telegram_user_id bigint,p_username text,p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t telegram_onboarding_tokens; link_id uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 SELECT * INTO t FROM telegram_onboarding_tokens WHERE token_hash=p_token_hash FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
 IF t.used_at IS NOT NULL THEN RAISE EXCEPTION 'token_already_used'; END IF;
 IF t.expires_at<=now() THEN RAISE EXCEPTION 'token_expired'; END IF;
 IF NOT public.has_product_entitlement(t.user_id,'crypto_signal_room',now()) THEN RAISE EXCEPTION 'active_vip_entitlement_required'; END IF;
 IF EXISTS(SELECT 1 FROM telegram_links WHERE telegram_user_id=p_telegram_user_id AND user_id<>t.user_id) THEN RAISE EXCEPTION 'telegram_identity_already_bound'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.user_id::text||':telegram',0));
 SELECT id INTO link_id FROM telegram_links WHERE user_id=t.user_id ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF link_id IS NULL THEN
  INSERT INTO telegram_links(user_id,telegram_user_id,telegram_username,telegram_display_name,status,product_slug,access_state,updated_at)
  VALUES(t.user_id,p_telegram_user_id,coalesce(p_username,''),coalesce(p_display_name,''),'connected','crypto_signal_room','grant_pending',now()) RETURNING id INTO link_id;
 ELSE
  UPDATE telegram_links SET telegram_user_id=p_telegram_user_id,telegram_username=coalesce(p_username,''),telegram_display_name=coalesce(p_display_name,''),status='connected',product_slug='crypto_signal_room',access_state='grant_pending',updated_at=now() WHERE id=link_id;
 END IF;
 UPDATE telegram_onboarding_tokens SET used_at=now() WHERE id=t.id;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(t.user_id,'telegram_identity_bound','telegram_links',link_id::text,jsonb_build_object('product','crypto_signal_room','telegram_user_id',p_telegram_user_id));
 RETURN jsonb_build_object('user_id',t.user_id,'telegram_link_id',link_id,'product_slug','crypto_signal_room');
END $$;
REVOKE ALL ON FUNCTION public.consume_vip_telegram_onboarding(text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_vip_telegram_onboarding(text,bigint,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.my_vip_telegram_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN auth.uid() IS NULL THEN jsonb_build_object('state','UNAUTHENTICATED')
  WHEN NOT public.has_product_entitlement(auth.uid(),'crypto_signal_room',now()) THEN jsonb_build_object('state','INACTIVE')
  ELSE coalesce((SELECT jsonb_build_object('state',CASE WHEN telegram_user_id IS NULL THEN 'NOT_LINKED' WHEN access_state='healthy' THEN 'HEALTHY' WHEN access_state='failed' THEN 'LINKING_FAILED' ELSE 'LINKING' END,'telegram_user_id',telegram_user_id,'username',telegram_username,'access_state',access_state,'last_success_at',last_fulfillment_success_at,'safe_error',fulfillment_error) FROM telegram_links WHERE user_id=auth.uid() ORDER BY updated_at DESC LIMIT 1),jsonb_build_object('state','NOT_LINKED')) END;
$$;
REVOKE ALL ON FUNCTION public.my_vip_telegram_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_vip_telegram_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_vip_telegram_onboarding(p_user_id uuid,p_reason text DEFAULT 'Admin resend')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE raw_token text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF NOT public.has_product_entitlement(p_user_id,'crypto_signal_room',now()) THEN RAISE EXCEPTION 'active_vip_entitlement_required'; END IF;
 UPDATE telegram_onboarding_tokens SET used_at=now() WHERE user_id=p_user_id AND product_slug='crypto_signal_room' AND used_at IS NULL;
 raw_token:=encode(gen_random_bytes(24),'hex');
 INSERT INTO telegram_onboarding_tokens(user_id,product_slug,token_hash,expires_at) VALUES(p_user_id,'crypto_signal_room',encode(digest(raw_token,'sha256'),'hex'),now()+interval '15 minutes');
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'telegram_onboarding_resent','profile',p_user_id::text,jsonb_build_object('product','crypto_signal_room','reason',p_reason));
 RETURN jsonb_build_object('token',raw_token,'expires_at',now()+interval '15 minutes');
END $$;
REVOKE ALL ON FUNCTION public.admin_create_vip_telegram_onboarding(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_vip_telegram_onboarding(uuid,text) TO authenticated;
