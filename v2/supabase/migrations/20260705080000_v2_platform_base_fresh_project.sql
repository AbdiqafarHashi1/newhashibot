/*
  HashiBot V2 fresh-project platform base.
  This migration intentionally runs before engine/platform migrations so V2 does not
  depend on legacy/root application tables or helper functions.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('owner','admin','customer','service_role','anonymous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('owner','admin','customer','service_role','anonymous')),
  platform_role public.platform_role NOT NULL DEFAULT 'customer',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','disabled')),
  is_service_account boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = '' OR position('@' in email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_uq ON public.profiles(lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS profiles_platform_role_idx ON public.profiles(platform_role, status);

CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'KES',
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('free','one_time','monthly','quarterly','yearly')),
  package_type text NOT NULL DEFAULT 'signal_only',
  signal_access boolean NOT NULL DEFAULT true,
  execution_access boolean NOT NULL DEFAULT false,
  telegram_access boolean NOT NULL DEFAULT false,
  account_limit integer NOT NULL DEFAULT 1 CHECK (account_limit >= 0),
  executor_limit integer NOT NULL DEFAULT 0 CHECK (executor_limit >= 0),
  provider_permissions jsonb NOT NULL DEFAULT '["binance","bybit"]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_active_sort_idx ON public.packages(active, sort_order, package_code);

CREATE OR REPLACE FUNCTION public.platform_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid() OR p.id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_platform_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT platform_role::text FROM public.profiles WHERE auth_user_id = auth.uid() OR id = auth.uid() LIMIT 1),
    CASE WHEN auth.role() = 'service_role' THEN 'service_role' ELSE 'anonymous' END
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_platform_role() = 'owner' OR auth.role() = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_platform_role() IN ('owner','admin') OR auth.role() = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_platform_role() IN ('owner','admin','service_role') OR auth.role() = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_operator()
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner()
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

INSERT INTO public.packages (package_code, name, description, price, currency, billing_period, signal_access, execution_access, telegram_access, account_limit, executor_limit, provider_permissions, sort_order)
VALUES
  ('free','Free','Community education and public sample signals',0,'KES','free',true,false,false,0,0,'["binance","bybit"]',10),
  ('vip_signals','VIP Signals','Premium signal dashboard and VIP Telegram delivery',5000,'KES','monthly',true,false,true,1,0,'["binance","bybit"]',20),
  ('vip_execution','VIP Execution','Managed execution visibility and account governance after approval',15000,'KES','monthly',true,true,true,3,1,'["binance","bybit","mt5"]',30)
ON CONFLICT (package_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  billing_period = EXCLUDED.billing_period,
  signal_access = EXCLUDED.signal_access,
  execution_access = EXCLUDED.execution_access,
  telegram_access = EXCLUDED.telegram_access,
  account_limit = EXCLUDED.account_limit,
  executor_limit = EXCLUDED.executor_limit,
  provider_permissions = EXCLUDED.provider_permissions,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = auth_user_id OR auth.uid() = id OR public.is_operator());
DROP POLICY IF EXISTS profiles_self_update_limited ON public.profiles;
CREATE POLICY profiles_self_update_limited ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id OR auth.uid() = id OR public.is_operator()) WITH CHECK (auth.uid() = auth_user_id OR auth.uid() = id OR public.is_operator());
DROP POLICY IF EXISTS profiles_service_all ON public.profiles;
CREATE POLICY profiles_service_all ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS packages_public_read ON public.packages;
CREATE POLICY packages_public_read ON public.packages FOR SELECT USING (active OR public.is_operator());
DROP POLICY IF EXISTS packages_operator_write ON public.packages;
CREATE POLICY packages_operator_write ON public.packages FOR ALL TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
DROP POLICY IF EXISTS packages_service_all ON public.packages;
CREATE POLICY packages_service_all ON public.packages FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS touch_profiles_updated_at ON public.profiles;
CREATE TRIGGER touch_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();
DROP TRIGGER IF EXISTS touch_packages_updated_at ON public.packages;
CREATE TRIGGER touch_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();
