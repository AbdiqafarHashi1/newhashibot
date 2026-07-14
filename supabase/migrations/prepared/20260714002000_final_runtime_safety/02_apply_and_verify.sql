-- Operator execution helper for 20260714002000_final_runtime_safety.sql
-- Run only after reviewing 01_preflight.sql output and clearing STOP conditions.
-- Contains the forward migration followed immediately by postflight verification.
-- Rollback remains only in the complete prepared migration reference.

-- SECTION 2: FORWARD MIGRATION (WRITES; RUN ONLY AFTER PREFLIGHT PASSES)
-- ============================================================================

BEGIN;

-- 2.1 Schema-compatible tables. Additive changes are repeat-safe; incompatible existing
-- schemas must be fixed manually after preflight review.
CREATE TABLE IF NOT EXISTS public.runtime_worker_leases (
  lease_name text PRIMARY KEY,
  owner_id text NOT NULL,
  run_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  renewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.runtime_worker_leases
  ADD COLUMN IF NOT EXISTS lease_name text,
  ADD COLUMN IF NOT EXISTS owner_id text,
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS renewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_worker_leases_lease_name_unique
  ON public.runtime_worker_leases (lease_name);

CREATE INDEX IF NOT EXISTS runtime_worker_leases_expires_at_idx
  ON public.runtime_worker_leases (expires_at);

CREATE INDEX IF NOT EXISTS runtime_worker_leases_owner_run_idx
  ON public.runtime_worker_leases (owner_id, run_id);

CREATE TABLE IF NOT EXISTS public.runtime_event_idempotency (
  idempotency_key text PRIMARY KEY,
  canonical_event_id text NOT NULL,
  trade_id text,
  event_type text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  occurrence_count integer NOT NULL DEFAULT 1,
  original_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_duplicate_payload jsonb,
  collision_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.runtime_event_idempotency
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS canonical_event_id text,
  ADD COLUMN IF NOT EXISTS trade_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_duplicate_payload jsonb,
  ADD COLUMN IF NOT EXISTS collision_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_event_idempotency_key_unique
  ON public.runtime_event_idempotency (idempotency_key);

CREATE INDEX IF NOT EXISTS runtime_event_idempotency_trade_event_idx
  ON public.runtime_event_idempotency (trade_id, event_type, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.runtime_incidents (
  incident_fingerprint text PRIMARY KEY,
  severity text NOT NULL,
  incident_status text NOT NULL DEFAULT 'open',
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  occurrence_count integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  last_error_code text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.runtime_incidents
  ADD COLUMN IF NOT EXISTS incident_fingerprint text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS incident_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_incidents_fingerprint_unique
  ON public.runtime_incidents (incident_fingerprint);

CREATE INDEX IF NOT EXISTS runtime_incidents_status_severity_idx
  ON public.runtime_incidents (incident_status, severity, last_seen_at DESC);

-- 2.2 Constraints are added idempotently and validated after creation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtime_worker_leases_nonempty_identifiers_check'
  ) THEN
    ALTER TABLE public.runtime_worker_leases
      ADD CONSTRAINT runtime_worker_leases_nonempty_identifiers_check
      CHECK (
        length(btrim(lease_name)) > 0
        AND length(btrim(owner_id)) > 0
        AND length(btrim(run_id)) > 0
        AND expires_at IS NOT NULL
        AND expires_at > acquired_at
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtime_event_idempotency_valid_check'
  ) THEN
    ALTER TABLE public.runtime_event_idempotency
      ADD CONSTRAINT runtime_event_idempotency_valid_check
      CHECK (
        length(btrim(idempotency_key)) > 0
        AND length(btrim(canonical_event_id)) > 0
        AND length(btrim(event_type)) > 0
        AND occurrence_count >= 1
        AND collision_count >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtime_incidents_valid_check'
  ) THEN
    ALTER TABLE public.runtime_incidents
      ADD CONSTRAINT runtime_incidents_valid_check
      CHECK (
        length(btrim(incident_fingerprint)) > 0
        AND severity IN ('info', 'warning', 'error', 'critical')
        AND incident_status IN ('open', 'acknowledged', 'resolved', 'suppressed')
        AND occurrence_count >= 1
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.runtime_worker_leases VALIDATE CONSTRAINT runtime_worker_leases_nonempty_identifiers_check;
ALTER TABLE public.runtime_event_idempotency VALIDATE CONSTRAINT runtime_event_idempotency_valid_check;
ALTER TABLE public.runtime_incidents VALIDATE CONSTRAINT runtime_incidents_valid_check;

-- 2.3 RLS and table grants. Backend service_role is the only intended writer.
ALTER TABLE public.runtime_worker_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_event_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_incidents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.runtime_worker_leases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.runtime_event_idempotency FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.runtime_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runtime_worker_leases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runtime_event_idempotency TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runtime_incidents TO service_role;

DROP POLICY IF EXISTS runtime_worker_leases_service_role_all ON public.runtime_worker_leases;
DROP POLICY IF EXISTS runtime_event_idempotency_service_role_all ON public.runtime_event_idempotency;
DROP POLICY IF EXISTS runtime_incidents_service_role_all ON public.runtime_incidents;

CREATE POLICY runtime_worker_leases_service_role_all
  ON public.runtime_worker_leases
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY runtime_event_idempotency_service_role_all
  ON public.runtime_event_idempotency
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY runtime_incidents_service_role_all
  ON public.runtime_incidents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2.4 RPCs. All functions use database-controlled clock_timestamp(); there is no
-- caller-controlled time parameter. TTL is bounded to 5..900 seconds.
CREATE OR REPLACE FUNCTION public.runtime_acquire_worker_lease(
  p_lease_name text,
  p_owner_id text,
  p_run_id text,
  p_ttl_seconds integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(acquired boolean, lease_name text, owner_id text, run_id text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
BEGIN
  IF p_lease_name IS NULL OR length(btrim(p_lease_name)) = 0 THEN
    RAISE EXCEPTION 'lease_name is required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_id IS NULL OR length(btrim(p_owner_id)) = 0 THEN
    RAISE EXCEPTION 'owner_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_run_id IS NULL OR length(btrim(p_run_id)) = 0 THEN
    RAISE EXCEPTION 'run_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'ttl_seconds must be between 5 and 900' USING ERRCODE = '22023';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata must be a JSON object' USING ERRCODE = '22023';
  END IF;

  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);

  INSERT INTO public.runtime_worker_leases AS leases (
    lease_name,
    owner_id,
    run_id,
    acquired_at,
    renewed_at,
    heartbeat_at,
    expires_at,
    metadata
  )
  VALUES (
    p_lease_name,
    p_owner_id,
    p_run_id,
    v_now,
    v_now,
    v_now,
    v_expires_at,
    p_metadata
  )
  ON CONFLICT (lease_name) DO UPDATE
  SET owner_id = EXCLUDED.owner_id,
      run_id = EXCLUDED.run_id,
      renewed_at = v_now,
      heartbeat_at = v_now,
      expires_at = EXCLUDED.expires_at,
      metadata = EXCLUDED.metadata
  WHERE leases.expires_at <= v_now
     OR (leases.owner_id = p_owner_id AND leases.run_id = p_run_id);

  RETURN QUERY
  SELECT true, l.lease_name, l.owner_id, l.run_id, l.expires_at
  FROM public.runtime_worker_leases l
  WHERE l.lease_name = p_lease_name
    AND l.owner_id = p_owner_id
    AND l.run_id = p_run_id
    AND l.expires_at = v_expires_at;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, l.lease_name, l.owner_id, l.run_id, l.expires_at
    FROM public.runtime_worker_leases l
    WHERE l.lease_name = p_lease_name;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.runtime_renew_worker_lease(
  p_lease_name text,
  p_owner_id text,
  p_run_id text,
  p_ttl_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'ttl_seconds must be between 5 and 900' USING ERRCODE = '22023';
  END IF;

  UPDATE public.runtime_worker_leases
  SET renewed_at = v_now,
      heartbeat_at = v_now,
      expires_at = v_now + make_interval(secs => p_ttl_seconds)
  WHERE lease_name = p_lease_name
    AND owner_id = p_owner_id
    AND run_id = p_run_id
    AND expires_at > v_now;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.runtime_release_worker_lease(
  p_lease_name text,
  p_owner_id text,
  p_run_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_lease_name IS NULL OR length(btrim(p_lease_name)) = 0
     OR p_owner_id IS NULL OR length(btrim(p_owner_id)) = 0
     OR p_run_id IS NULL OR length(btrim(p_run_id)) = 0 THEN
    RAISE EXCEPTION 'lease_name, owner_id, and run_id are required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.runtime_worker_leases
  WHERE lease_name = p_lease_name
    AND owner_id = p_owner_id
    AND run_id = p_run_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.runtime_record_event_idempotency(
  p_idempotency_key text,
  p_canonical_event_id text,
  p_trade_id text,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(accepted boolean, duplicate boolean, collision boolean, occurrence_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.runtime_event_idempotency%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_canonical_event_id IS NULL OR length(btrim(p_canonical_event_id)) = 0 THEN
    RAISE EXCEPTION 'canonical_event_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR length(btrim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type is required' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.runtime_event_idempotency
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.canonical_event_id IS DISTINCT FROM p_canonical_event_id
       OR v_existing.trade_id IS DISTINCT FROM p_trade_id
       OR v_existing.event_type IS DISTINCT FROM p_event_type THEN
      UPDATE public.runtime_event_idempotency
      SET collision_count = collision_count + 1,
          last_seen_at = v_now,
          last_duplicate_payload = p_payload
      WHERE idempotency_key = p_idempotency_key;

      RETURN QUERY SELECT false, false, true, v_existing.occurrence_count;
      RETURN;
    END IF;

    UPDATE public.runtime_event_idempotency
    SET occurrence_count = occurrence_count + 1,
        last_seen_at = v_now,
        last_duplicate_payload = p_payload
    WHERE idempotency_key = p_idempotency_key
    RETURNING runtime_event_idempotency.occurrence_count INTO occurrence_count;

    RETURN QUERY SELECT false, true, false, occurrence_count;
    RETURN;
  END IF;

  INSERT INTO public.runtime_event_idempotency (
    idempotency_key,
    canonical_event_id,
    trade_id,
    event_type,
    first_seen_at,
    last_seen_at,
    occurrence_count,
    original_payload
  ) VALUES (
    p_idempotency_key,
    p_canonical_event_id,
    p_trade_id,
    p_event_type,
    v_now,
    v_now,
    1,
    p_payload
  );

  RETURN QUERY SELECT true, false, false, 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.runtime_record_incident(
  p_incident_fingerprint text,
  p_severity text,
  p_error_code text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(incident_fingerprint text, incident_status text, occurrence_count integer, reopened boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_existing public.runtime_incidents%ROWTYPE;
  v_reopened boolean := false;
BEGIN
  IF p_incident_fingerprint IS NULL OR length(btrim(p_incident_fingerprint)) = 0 THEN
    RAISE EXCEPTION 'incident_fingerprint is required' USING ERRCODE = '22023';
  END IF;
  IF p_severity NOT IN ('info', 'warning', 'error', 'critical') THEN
    RAISE EXCEPTION 'invalid severity: %', p_severity USING ERRCODE = '22023';
  END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'details must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.runtime_incidents
  WHERE runtime_incidents.incident_fingerprint = p_incident_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    v_reopened := v_existing.incident_status = 'resolved';

    UPDATE public.runtime_incidents
    SET severity = p_severity,
        incident_status = CASE WHEN incident_status = 'resolved' THEN 'open' ELSE incident_status END,
        resolved_at = CASE WHEN incident_status = 'resolved' THEN NULL ELSE resolved_at END,
        last_seen_at = v_now,
        occurrence_count = occurrence_count + 1,
        last_error_code = p_error_code,
        details = jsonb_strip_nulls(details || p_details || jsonb_build_object('reopened_from_resolved', v_reopened))
    WHERE runtime_incidents.incident_fingerprint = p_incident_fingerprint
    RETURNING runtime_incidents.incident_fingerprint,
              runtime_incidents.incident_status,
              runtime_incidents.occurrence_count
    INTO incident_fingerprint, incident_status, occurrence_count;

    RETURN QUERY SELECT incident_fingerprint, incident_status, occurrence_count, v_reopened;
    RETURN;
  END IF;

  INSERT INTO public.runtime_incidents (
    incident_fingerprint,
    severity,
    incident_status,
    first_seen_at,
    last_seen_at,
    occurrence_count,
    last_error_code,
    details
  ) VALUES (
    p_incident_fingerprint,
    p_severity,
    'open',
    v_now,
    v_now,
    1,
    p_error_code,
    p_details
  )
  RETURNING runtime_incidents.incident_fingerprint,
            runtime_incidents.incident_status,
            runtime_incidents.occurrence_count
  INTO incident_fingerprint, incident_status, occurrence_count;

  RETURN QUERY SELECT incident_fingerprint, incident_status, occurrence_count, false;
END;
$$;

REVOKE ALL ON FUNCTION public.runtime_acquire_worker_lease(text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.runtime_renew_worker_lease(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.runtime_release_worker_lease(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.runtime_record_event_idempotency(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.runtime_record_incident(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.runtime_acquire_worker_lease(text, text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.runtime_renew_worker_lease(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.runtime_release_worker_lease(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.runtime_record_event_idempotency(text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.runtime_record_incident(text, text, text, jsonb) TO service_role;

COMMIT;

-- ============================================================================
-- SECTION 3: POSTFLIGHT VERIFICATION (READ-ONLY)
-- ============================================================================

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('runtime_worker_leases', 'runtime_event_idempotency', 'runtime_incidents')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid, true) AS definition, convalidated
FROM pg_constraint
WHERE conrelid IN (
  'public.runtime_worker_leases'::regclass,
  'public.runtime_event_idempotency'::regclass,
  'public.runtime_incidents'::regclass
)
ORDER BY conrelid::regclass::text, conname;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('runtime_worker_leases', 'runtime_event_idempotency', 'runtime_incidents')
ORDER BY tablename, policyname;

SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'runtime_acquire_worker_lease',
    'runtime_renew_worker_lease',
    'runtime_release_worker_lease',
    'runtime_record_event_idempotency',
    'runtime_record_incident'
  )
ORDER BY routine_name;

-- 3.1 Optional postflight concurrency examples. Run in a non-production transaction or
-- staging database and ROLLBACK when finished.
-- BEGIN;
-- SELECT * FROM public.runtime_acquire_worker_lease('postflight-monitor', 'worker-a', 'run-1', 30, '{}'::jsonb);
-- SELECT * FROM public.runtime_acquire_worker_lease('postflight-monitor', 'worker-b', 'run-2', 30, '{}'::jsonb); -- acquired=false while run-1 is active
-- SELECT * FROM public.runtime_acquire_worker_lease('postflight-monitor', 'worker-a', 'run-3', 30, '{}'::jsonb); -- acquired=false: same owner, different run_id
-- SELECT * FROM public.runtime_acquire_worker_lease('postflight-monitor', 'worker-a', 'run-1', 30, '{}'::jsonb); -- acquired=true: same current run renewal/acquisition
-- SELECT * FROM public.runtime_release_worker_lease('postflight-monitor', 'worker-a', 'run-1');
-- SELECT * FROM public.runtime_acquire_worker_lease('postflight-monitor', 'worker-b', 'run-2', 30, '{}'::jsonb); -- acquired=true after release
-- ROLLBACK;

-- ============================================================================
