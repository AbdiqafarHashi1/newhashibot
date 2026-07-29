-- Additive Phase 5D finalization: scoped runtime identity and complete read truth.
ALTER TABLE public.mt5_account_snapshots
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS bridge_id text,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS terminal_identity jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS leverage integer,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS read_status jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS terminal_authenticated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS mt5_snapshots_account_captured_idx
  ON public.mt5_account_snapshots(account_id, captured_at DESC);

ALTER TABLE public.mt5_commands
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- One atomic claimant owns an account-scoped lease. Final commands and expired
-- commands can never be returned, and an idempotency key remains terminal.
CREATE OR REPLACE FUNCTION public.claim_mt5_command(
  p_account_id uuid, p_owner_id uuid, p_bridge_id text, p_worker_id text)
RETURNS SETOF public.mt5_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed public.mt5_commands;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mt5_accounts a WHERE a.id=p_account_id AND a.user_id=p_owner_id AND a.bridge_id=p_bridge_id) THEN
    RAISE EXCEPTION 'BRIDGE_ACCOUNT_SCOPE_MISMATCH';
  END IF;
  SELECT * INTO claimed FROM public.mt5_commands c
   WHERE c.account_id=p_account_id AND c.bridge_id=p_bridge_id
     AND (c.expires_at IS NULL OR c.expires_at>now())
     AND (c.status='received' OR (c.status='accepted' AND c.claimed_at<now()-interval '2 minutes'))
     AND (c.operation <> 'OPEN_POSITION' OR (
       c.payload->>'certified'='true'
       AND c.payload->>'deterministic_identity'=c.idempotency_key
       AND EXISTS (SELECT 1 FROM public.certified_runtime_claims r
         WHERE r.execution_plan_id::text=c.payload->>'execution_plan_id' AND r.account_id=c.account_id AND r.state='completed')
     ))
   ORDER BY c.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.mt5_commands SET status='accepted', claimed_at=now(), worker_id=p_worker_id,
    attempts=attempts+1 WHERE id=claimed.id RETURNING * INTO claimed;
  RETURN NEXT claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_mt5_command(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mt5_command(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mt5_health(p_heartbeat timestamptz, p_authenticated boolean)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE
 WHEN p_heartbeat IS NULL THEN 'NOT CONFIGURED'
 WHEN NOT p_authenticated THEN 'AUTH FAILED'
 WHEN p_heartbeat < now()-interval '2 minutes' THEN 'OFFLINE'
 WHEN p_heartbeat < now()-interval '30 seconds' THEN 'STALE'
 ELSE 'HEALTHY' END $$;

DROP VIEW IF EXISTS public.mt5_accounts_safe;
CREATE VIEW public.mt5_accounts_safe AS
SELECT id,user_id,owner_kind,broker,server,('****'||account_number_last4) account_number_masked,
 nickname,currency,leverage,account_type,execution_mode,margin_mode,credential_capability,
 operational,monitor_enabled,monitor_healthy,execution_enabled,connection_status,provider_health,
 terminal_authenticated,trade_permission,terminal_autotrading,policy,account_kill_switch,bridge_id,
 public.mt5_health(last_heartbeat_at,terminal_authenticated) health,last_heartbeat_at,last_sync_at,last_error,created_at,updated_at
FROM public.mt5_accounts;
GRANT SELECT ON public.mt5_accounts_safe TO authenticated;
