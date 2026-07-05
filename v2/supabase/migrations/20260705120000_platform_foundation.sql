/*
  HashiBot V2 Step 15 — Platform Foundation
  Production customer/subscription/account/executor platform around the frozen trading engine.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('owner','admin','customer','service_role','anonymous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.customer_status AS ENUM ('registered','pending_approval','trial','active','suspended','expired','cancelled','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('pending_payment','pending_review','clarification_requested','active','trial','expired','suspended','cancelled','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.executor_status AS ENUM ('pending','provisioning','running','paused','recovering','stopped','failed','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.provider_name AS ENUM ('binance','bybit','mt5','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.provider_environment AS ENUM ('testnet','demo','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.payment_review_status AS ENUM ('submitted','approved','rejected','clarification_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.platform_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_platform_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT platform_role::text FROM public.profiles WHERE id = auth.uid()), (SELECT CASE WHEN role = 'admin' THEN 'admin' ELSE 'customer' END FROM public.profiles WHERE id = auth.uid()), 'anonymous')
$$;

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_platform_role() IN ('owner','admin')
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_platform_role() = 'owner'
$$;

CREATE OR REPLACE FUNCTION public.platform_customer_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF to_regclass('public.customers') IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.customers WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform_role public.platform_role NOT NULL DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_service_account boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.profiles SET platform_role = CASE WHEN role = 'admin' THEN 'admin'::public.platform_role ELSE 'customer'::public.platform_role END WHERE platform_role IS NULL;

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key public.platform_role NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO public.roles (role_key, name, description) VALUES
 ('owner','Owner','Full platform ownership'), ('admin','Admin','Operational administration'), ('customer','Customer','Authenticated customer access'), ('service_role','Service Role','Backend and engine service access'), ('anonymous','Anonymous','Public website access')
ON CONFLICT (role_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO public.permissions (permission_key, description) VALUES
 ('customers.read','Read customer records'), ('customers.write','Modify customer records'), ('subscriptions.review','Review manual billing'), ('accounts.manage','Manage customer accounts'), ('executors.manage','Manage executors'), ('engine_events.ingest','Ingest engine events'), ('audit.read','Read audit log'), ('settings.manage','Manage system settings')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON
 (r.role_key = 'owner') OR
 (r.role_key = 'admin' AND p.permission_key <> 'settings.manage') OR
 (r.role_key = 'service_role' AND p.permission_key IN ('executors.manage','engine_events.ingest','audit.read')) OR
 (r.role_key = 'customer' AND p.permission_key IN ('accounts.manage'))
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  status public.customer_status NOT NULL DEFAULT 'registered',
  status_reason text NOT NULL DEFAULT '',
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at timestamptz,
  suspension_reason text NOT NULL DEFAULT '',
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  manually_verified_at timestamptz,
  manually_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON public.customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'UTC', locale text NOT NULL DEFAULT 'en', telegram_username text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.customer_preferences (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  notification_channels jsonb NOT NULL DEFAULT '{"email":true,"telegram":false}', risk_disclosures_accepted boolean NOT NULL DEFAULT false, preferences jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'signal_only';
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS signal_access boolean NOT NULL DEFAULT true;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS execution_access boolean NOT NULL DEFAULT false;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS telegram_access boolean NOT NULL DEFAULT false;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS account_limit integer NOT NULL DEFAULT 1;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS executor_limit integer NOT NULL DEFAULT 0;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS provider_permissions jsonb NOT NULL DEFAULT '["binance","bybit"]';

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE, package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL, status public.subscription_status NOT NULL DEFAULT 'pending_payment', starts_at timestamptz, expires_at timestamptz, payment_method text NOT NULL DEFAULT 'manual_mpesa', mpesa_transaction_code text NOT NULL DEFAULT '', payment_screenshot_path text NOT NULL DEFAULT '', payment_review_status public.payment_review_status NOT NULL DEFAULT 'submitted', payment_review_note text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, reviewed_at timestamptz, amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'KES', provider_payment_reference text NOT NULL DEFAULT '', metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (payment_method IN ('manual_mpesa','manual_bank','manual_cash','future_gateway'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_mpesa_code ON public.subscriptions(mpesa_transaction_code) WHERE mpesa_transaction_code <> '';
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_status ON public.subscriptions(customer_id, status);

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE, provider public.provider_name NOT NULL, environment public.provider_environment NOT NULL DEFAULT 'testnet', label text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', capabilities jsonb NOT NULL DEFAULT '{}', metadata jsonb NOT NULL DEFAULT '{}', credential_ref text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (credential_ref = '' OR credential_ref !~ '(?i)(secret|api[_-]?key)')
);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_owner ON public.customer_accounts(customer_id, provider, environment);

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_account_id uuid NOT NULL UNIQUE REFERENCES public.customer_accounts(id) ON DELETE CASCADE, vault_ref text NOT NULL, encrypted_payload bytea, status text NOT NULL DEFAULT 'pending', rotated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_executors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE, executor_key text NOT NULL UNIQUE, provider public.provider_name NOT NULL, status public.executor_status NOT NULL DEFAULT 'pending', assigned_account_ids uuid[] NOT NULL DEFAULT '{}', engine_connection jsonb NOT NULL DEFAULT '{}', current_position jsonb NOT NULL DEFAULT '{}', resource_usage jsonb NOT NULL DEFAULT '{}', last_sync_at timestamptz, last_trade_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_executors_owner_status ON public.customer_executors(customer_id, status);
CREATE TABLE IF NOT EXISTS public.executor_heartbeats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), executor_id uuid NOT NULL REFERENCES public.customer_executors(id) ON DELETE CASCADE, heartbeat_at timestamptz NOT NULL DEFAULT now(), status public.executor_status NOT NULL, latency_ms integer, payload jsonb NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_executor_heartbeats_latest ON public.executor_heartbeats(executor_id, heartbeat_at DESC);
CREATE TABLE IF NOT EXISTS public.executor_health (executor_id uuid PRIMARY KEY REFERENCES public.customer_executors(id) ON DELETE CASCADE, health_status text NOT NULL DEFAULT 'unknown', last_heartbeat_at timestamptz, last_error text NOT NULL DEFAULT '', diagnostics jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, actor_role text NOT NULL DEFAULT '', customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, before_state jsonb, after_state jsonb, metadata jsonb NOT NULL DEFAULT '{}', ip_address inet, user_agent text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_audit_log_customer_created ON public.audit_log(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE, channel text NOT NULL DEFAULT 'in_app', title text NOT NULL, body text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz);
CREATE TABLE IF NOT EXISTS public.system_settings (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}', is_public boolean NOT NULL DEFAULT false, updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.customer_activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE, activity_type text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.engine_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL, executor_id uuid REFERENCES public.customer_executors(id) ON DELETE SET NULL, event_type text NOT NULL, severity text NOT NULL DEFAULT 'info', payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(), ingested_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION public.platform_audit(p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL, p_after jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_log(actor_user_id, actor_role, customer_id, action, entity_type, entity_id, after_state)
  VALUES (auth.uid(), public.current_platform_role(), p_customer_id, p_action, p_entity_type, p_entity_id, p_after) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_platform_customer(p_email text, p_full_name text DEFAULT '', p_timezone text DEFAULT 'UTC')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid;
BEGIN
  INSERT INTO public.customers(auth_user_id, email, full_name, status) VALUES (auth.uid(), lower(p_email), p_full_name, 'pending_approval') RETURNING id INTO v_customer_id;
  INSERT INTO public.customer_profiles(customer_id, timezone) VALUES (v_customer_id, p_timezone);
  INSERT INTO public.customer_preferences(customer_id) VALUES (v_customer_id);
  PERFORM public.platform_audit('customer.registered','customers',v_customer_id,v_customer_id,jsonb_build_object('email', lower(p_email)));
  RETURN v_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_manual_mpesa_subscription(p_subscription_id uuid, p_decision public.payment_review_status, p_note text DEFAULT '')
RETURNS public.subscription_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid; v_status public.subscription_status;
BEGIN
  IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT customer_id INTO v_customer FROM public.subscriptions WHERE id = p_subscription_id;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'subscription not found'; END IF;
  v_status := CASE p_decision WHEN 'approved' THEN 'active'::public.subscription_status WHEN 'rejected' THEN 'rejected'::public.subscription_status WHEN 'clarification_requested' THEN 'clarification_requested'::public.subscription_status ELSE 'pending_review'::public.subscription_status END;
  UPDATE public.subscriptions SET status = v_status, payment_review_status = p_decision, payment_review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), starts_at = CASE WHEN p_decision='approved' THEN COALESCE(starts_at, now()) ELSE starts_at END, updated_at = now() WHERE id = p_subscription_id;
  IF p_decision = 'approved' THEN UPDATE public.customers SET status='active', activated_at=COALESCE(activated_at, now()), updated_at=now() WHERE id=v_customer; END IF;
  PERFORM public.platform_audit('subscription.manual_mpesa_reviewed','subscriptions',p_subscription_id,v_customer,jsonb_build_object('decision', p_decision, 'note', p_note));
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_executor_heartbeat(p_executor_key text, p_status public.executor_status, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_executor_id uuid;
BEGIN
  SELECT id INTO v_executor_id FROM public.customer_executors WHERE executor_key = p_executor_key;
  IF v_executor_id IS NULL THEN RAISE EXCEPTION 'executor not found'; END IF;
  INSERT INTO public.executor_heartbeats(executor_id, status, payload) VALUES (v_executor_id, p_status, p_payload);
  INSERT INTO public.executor_health(executor_id, health_status, last_heartbeat_at, diagnostics, updated_at) VALUES (v_executor_id, 'healthy', now(), p_payload, now()) ON CONFLICT (executor_id) DO UPDATE SET health_status='healthy', last_heartbeat_at=now(), diagnostics=EXCLUDED.diagnostics, updated_at=now();
  UPDATE public.customer_executors SET status=p_status, last_sync_at=now(), updated_at=now() WHERE id=v_executor_id;
  RETURN v_executor_id;
END;
$$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions','customers','customer_profiles','customer_preferences','packages','subscriptions','customer_accounts','provider_credentials','customer_executors','executor_heartbeats','executor_health','audit_log','notifications','system_settings','customer_activity','engine_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- RLS policies: customer self-isolation, operator visibility, service-role bypass by Supabase role.

DROP POLICY IF EXISTS roles_operator_read ON public.roles;
CREATE POLICY roles_operator_read ON public.roles FOR SELECT TO authenticated USING (public.is_platform_operator());
DROP POLICY IF EXISTS permissions_operator_read ON public.permissions;
CREATE POLICY permissions_operator_read ON public.permissions FOR SELECT TO authenticated USING (public.is_platform_operator());
DROP POLICY IF EXISTS role_permissions_operator_read ON public.role_permissions;
CREATE POLICY role_permissions_operator_read ON public.role_permissions FOR SELECT TO authenticated USING (public.is_platform_operator());
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customers','customer_profiles','customer_preferences','subscriptions','customer_accounts','customer_executors','executor_heartbeats','executor_health','notifications','customer_activity','engine_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_operator_all ON public.%I', t);
    EXECUTE format('CREATE POLICY platform_operator_all ON public.%I FOR ALL TO authenticated USING (public.is_platform_operator()) WITH CHECK (public.is_platform_operator())', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS customers_self_select ON public.customers;
CREATE POLICY customers_self_select ON public.customers FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
DROP POLICY IF EXISTS customers_self_update_limited ON public.customers;
CREATE POLICY customers_self_update_limited ON public.customers FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id) WITH CHECK (auth.uid() = auth_user_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customer_profiles','customer_preferences','subscriptions','customer_accounts','customer_executors','notifications','customer_activity','engine_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_customer_own_select ON public.%I', t);
    EXECUTE format('CREATE POLICY platform_customer_own_select ON public.%I FOR SELECT TO authenticated USING (customer_id = public.platform_customer_id())', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS provider_credentials_operator_only ON public.provider_credentials;
CREATE POLICY provider_credentials_operator_only ON public.provider_credentials FOR ALL TO authenticated USING (public.is_platform_operator()) WITH CHECK (public.is_platform_operator());
DROP POLICY IF EXISTS audit_log_operator_select ON public.audit_log;
CREATE POLICY audit_log_operator_select ON public.audit_log FOR SELECT TO authenticated USING (public.is_platform_operator() OR customer_id = public.platform_customer_id());
DROP POLICY IF EXISTS system_settings_public_read ON public.system_settings;
CREATE POLICY system_settings_public_read ON public.system_settings FOR SELECT USING (is_public OR public.is_platform_operator());
DROP POLICY IF EXISTS system_settings_owner_write ON public.system_settings;
CREATE POLICY system_settings_owner_write ON public.system_settings FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP TRIGGER IF EXISTS touch_customers_updated_at ON public.customers;
CREATE TRIGGER touch_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();
