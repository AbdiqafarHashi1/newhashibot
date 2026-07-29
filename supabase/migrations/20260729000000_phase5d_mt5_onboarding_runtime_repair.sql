-- Additive Phase 5D runtime repair. This migration does not enable execution or schedule work.
ALTER TABLE public.mt5_accounts
  ALTER COLUMN credential_ref SET DEFAULT gen_random_uuid(),
  ALTER COLUMN execution_enabled SET DEFAULT false;

ALTER TABLE public.mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_owner_kind_check;
ALTER TABLE public.mt5_accounts ADD CONSTRAINT mt5_accounts_owner_kind_check CHECK (owner_kind IN ('system', 'customer')) NOT VALID;
ALTER TABLE public.mt5_accounts VALIDATE CONSTRAINT mt5_accounts_owner_kind_check;
ALTER TABLE public.mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_credential_capability_check;
ALTER TABLE public.mt5_accounts ADD CONSTRAINT mt5_accounts_credential_capability_check CHECK (credential_capability IN ('investor', 'master')) NOT VALID;
ALTER TABLE public.mt5_accounts VALIDATE CONSTRAINT mt5_accounts_credential_capability_check;

CREATE UNIQUE INDEX IF NOT EXISTS mt5_accounts_credential_ref_uidx ON public.mt5_accounts(credential_ref);
CREATE UNIQUE INDEX IF NOT EXISTS mt5_accounts_owner_identity_uidx ON public.mt5_accounts(user_id, broker, server, account_number_hash);

DROP VIEW IF EXISTS public.mt5_accounts_safe;
CREATE VIEW public.mt5_accounts_safe WITH (security_invoker = true) AS
SELECT id,user_id,owner_kind,broker,server,('****'||account_number_last4) account_number_masked,
 nickname,currency,leverage,account_type,execution_mode,margin_mode,credential_capability,
 operational,monitor_enabled,monitor_healthy,execution_enabled,connection_status,provider_health,
 terminal_authenticated,trade_permission,terminal_autotrading,policy,account_kill_switch,bridge_id,
 public.mt5_health(last_heartbeat_at,terminal_authenticated) health,last_heartbeat_at,last_sync_at,last_error,created_at,updated_at
FROM public.mt5_accounts;
REVOKE ALL ON public.mt5_accounts_safe FROM anon;
GRANT SELECT ON public.mt5_accounts_safe TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) TO authenticated, service_role;
