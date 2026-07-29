-- Phase 5D hotfix: durable bridge leases and explicit, fail-closed assignment.
ALTER TABLE public.mt5_bridge_registry
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS hostname text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS agent_version text,
  ADD COLUMN IF NOT EXISTS process_id text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS supported_account_classes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS supported_providers text[] NOT NULL DEFAULT ARRAY['mt5']::text[],
  ADD COLUMN IF NOT EXISTS startup_stage text NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS command_polling_state text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS control_request text,
  ADD COLUMN IF NOT EXISTS control_requested_at timestamptz;

-- The old partial unique index accidentally limited a bridge to one account.
DROP INDEX IF EXISTS public.mt5_accounts_one_bridge_identity_uidx;
CREATE INDEX IF NOT EXISTS mt5_accounts_bridge_idx ON public.mt5_accounts(bridge_id) WHERE bridge_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_mt5_bridge(
  p_bridge_id text, p_worker_id text, p_hostname text, p_platform text,
  p_agent_version text, p_process_id text, p_supported_classes text[])
RETURNS SETOF public.mt5_bridge_registry LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public AS $$
DECLARE existing public.mt5_bridge_registry%ROWTYPE; now_at timestamptz := clock_timestamp();
BEGIN
  IF p_bridge_id = '' OR p_worker_id = '' THEN RAISE EXCEPTION 'BRIDGE_REGISTRATION_FAILED'; END IF;
  SELECT * INTO existing FROM public.mt5_bridge_registry WHERE bridge_id=p_bridge_id FOR UPDATE;
  IF FOUND AND existing.worker_id IS DISTINCT FROM p_worker_id
     AND existing.revoked_at IS NULL AND existing.lease_expires_at > now_at
     AND existing.status IN ('starting','online','healthy') THEN
    RAISE EXCEPTION 'BRIDGE_ALREADY_ACTIVE';
  END IF;
  INSERT INTO public.mt5_bridge_registry
    (bridge_id,worker_id,hostname,platform,agent_version,process_id,started_at,last_heartbeat_at,
     lease_expires_at,status,supported_account_classes,startup_stage,revoked_at,last_error_code,last_error_message)
  VALUES (p_bridge_id,p_worker_id,left(p_hostname,255),left(p_platform,255),left(p_agent_version,64),
    left(p_process_id,64),now_at,now_at,now_at+interval '45 seconds','starting',p_supported_classes,'registered',NULL,NULL,NULL)
  ON CONFLICT (bridge_id) DO UPDATE SET worker_id=excluded.worker_id,hostname=excluded.hostname,
    platform=excluded.platform,agent_version=excluded.agent_version,process_id=excluded.process_id,
    started_at=excluded.started_at,last_heartbeat_at=excluded.last_heartbeat_at,
    lease_expires_at=excluded.lease_expires_at,status=excluded.status,
    supported_account_classes=excluded.supported_account_classes,startup_stage=excluded.startup_stage,
    revoked_at=NULL,last_error_code=NULL,last_error_message=NULL
  RETURNING * INTO existing;
  RETURN NEXT existing;
END $$;

CREATE OR REPLACE FUNCTION public.assign_mt5_bridge_account(
  p_bridge_id text, p_worker_id text, p_account_id uuid, p_owner_id uuid, p_credential_ref uuid)
RETURNS SETOF public.mt5_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account public.mt5_accounts%ROWTYPE; bridge public.mt5_bridge_registry%ROWTYPE; other public.mt5_bridge_registry%ROWTYPE;
BEGIN
  SELECT * INTO bridge FROM public.mt5_bridge_registry WHERE bridge_id=p_bridge_id AND worker_id=p_worker_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRIDGE_ALREADY_ACTIVE'; END IF;
  SELECT * INTO account FROM public.mt5_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF account.user_id IS DISTINCT FROM p_owner_id THEN RAISE EXCEPTION 'ACCOUNT_OWNER_MISMATCH'; END IF;
  -- The canonical mt5_accounts table is itself the provider discriminator; no
  -- generic execution-account row can pass this typed lookup.
  IF account.credential_ref IS DISTINCT FROM p_credential_ref THEN RAISE EXCEPTION 'CREDENTIAL_REF_MISMATCH'; END IF;
  IF account.execution_enabled OR account.operational THEN RAISE EXCEPTION 'ACCOUNT_ASSIGNMENT_FAILED'; END IF;
  IF account.bridge_id IS NOT NULL AND account.bridge_id <> p_bridge_id THEN
    SELECT * INTO other FROM public.mt5_bridge_registry WHERE bridge_id=account.bridge_id;
    IF FOUND AND other.revoked_at IS NULL AND other.lease_expires_at > clock_timestamp()
       AND other.status IN ('starting','online','healthy') THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
  END IF;
  UPDATE public.mt5_accounts SET bridge_id=p_bridge_id,updated_at=clock_timestamp() WHERE id=p_account_id RETURNING * INTO account;
  RETURN NEXT account;
END $$;

-- Browser controls stay admin-only and never receive the bridge token or credentials.
CREATE OR REPLACE FUNCTION public.request_mt5_bridge_control(p_bridge_id text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_action NOT IN ('graceful_stop','restart','read_only_sync','revoke') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  UPDATE public.mt5_bridge_registry SET control_request=p_action,control_requested_at=clock_timestamp(),
    revoked_at=CASE WHEN p_action='revoke' THEN clock_timestamp() ELSE revoked_at END WHERE bridge_id=p_bridge_id;
END $$;

CREATE OR REPLACE FUNCTION public.unassign_mt5_bridge_account(p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account public.mt5_accounts%ROWTYPE; bridge public.mt5_bridge_registry%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO account FROM public.mt5_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  SELECT * INTO bridge FROM public.mt5_bridge_registry WHERE bridge_id=account.bridge_id;
  IF FOUND AND bridge.revoked_at IS NULL AND bridge.lease_expires_at > clock_timestamp()
    AND bridge.status IN ('starting','online','healthy') THEN RAISE EXCEPTION 'BRIDGE_ALREADY_ACTIVE'; END IF;
  UPDATE public.mt5_accounts SET bridge_id=NULL,updated_at=clock_timestamp() WHERE id=p_account_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_assign_mt5_bridge_account(p_bridge_id text, p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account public.mt5_accounts%ROWTYPE; bridge public.mt5_bridge_registry%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO account FROM public.mt5_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  SELECT * INTO bridge FROM public.mt5_bridge_registry WHERE bridge_id=p_bridge_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRIDGE_REGISTRATION_FAILED'; END IF;
  IF account.execution_enabled OR account.operational THEN RAISE EXCEPTION 'ACCOUNT_ASSIGNMENT_FAILED'; END IF;
  IF account.bridge_id IS NOT NULL AND account.bridge_id <> p_bridge_id THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
  UPDATE public.mt5_accounts SET bridge_id=p_bridge_id,updated_at=clock_timestamp() WHERE id=p_account_id;
END $$;

REVOKE ALL ON FUNCTION public.register_mt5_bridge(text,text,text,text,text,text,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_mt5_bridge_account(text,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_mt5_bridge(text,text,text,text,text,text,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_mt5_bridge_account(text,text,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_mt5_bridge_control(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_mt5_bridge_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_mt5_bridge_account(text,uuid) TO authenticated;
