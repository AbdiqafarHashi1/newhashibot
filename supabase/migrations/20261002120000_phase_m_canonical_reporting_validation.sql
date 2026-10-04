-- Phase M: extend Phase-K publication work; no competing signal/event authority.
ALTER TABLE public.signal_publication_work
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'signal',
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'SIGNAL_QUALIFIED',
  ADD COLUMN IF NOT EXISTS event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT 'vip' CHECK (destination IN ('free','vip','customer','admin','owner')),
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text;
UPDATE public.signal_publication_work SET entity_id=signal_id WHERE entity_id IS NULL;
ALTER TABLE public.signal_publication_work ALTER COLUMN entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_entity_version_destination
 ON public.signal_publication_work(entity_type,entity_id,event_type,event_version,destination,coalesce(customer_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_publication_claimable ON public.signal_publication_work(status,next_attempt_at,lease_expires_at);

CREATE TABLE IF NOT EXISTS public.canonical_telegram_delivery_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_work_id uuid NOT NULL REFERENCES public.signal_publication_work(id) ON DELETE RESTRICT,
 message_identity text NOT NULL UNIQUE, message_part integer NOT NULL CHECK(message_part>=0),
 state text NOT NULL CHECK(state IN ('RESERVED','DELIVERED','RETRY','DEAD','UNCERTAIN')),
 telegram_message_id text, attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0), next_attempt_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.canonical_telegram_delivery_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canonical_telegram_delivery_parts FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.canonical_telegram_delivery_parts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_signal_publication_work(p_worker text,p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 60,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.signal_publication_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE token uuid:=gen_random_uuid();
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 1 AND 300 OR p_max_attempts NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'UNSAFE_PUBLICATION_CLAIM_BOUNDS'; END IF;
 RETURN QUERY WITH candidates AS (
  SELECT id FROM public.signal_publication_work
  WHERE attempt_count<p_max_attempts AND next_attempt_at<=now()
   AND (status IN ('pending','failed') OR (status='processing' AND lease_expires_at<now()))
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
  UPDATE public.signal_publication_work w SET status='processing',attempt_count=w.attempt_count+1,lease_token=token,lease_owner=p_worker,
   lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  FROM candidates c WHERE w.id=c.id RETURNING w.*
 ) SELECT * FROM claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_signal_publication_work(text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signal_publication_work(text,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_canonical_delivery_part(p_work_id uuid,p_lease_token uuid,p_part integer,p_identity text)
RETURNS public.canonical_telegram_delivery_parts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.canonical_telegram_delivery_parts%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.signal_publication_work WHERE id=p_work_id AND lease_token=p_lease_token AND status='processing' AND lease_expires_at>now()) THEN RAISE EXCEPTION 'PUBLICATION_LEASE_LOST'; END IF;
 INSERT INTO public.canonical_telegram_delivery_parts(publication_work_id,message_identity,message_part,state,attempt_count)
 VALUES(p_work_id,p_identity,p_part,'RESERVED',1) ON CONFLICT(message_identity) DO UPDATE SET attempt_count=CASE WHEN canonical_telegram_delivery_parts.state IN ('RETRY','RESERVED') THEN canonical_telegram_delivery_parts.attempt_count+1 ELSE canonical_telegram_delivery_parts.attempt_count END,updated_at=now() RETURNING * INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.finish_canonical_delivery_part(p_delivery_id uuid,p_state text,p_message_id text DEFAULT NULL,p_reason text DEFAULT NULL,p_next_attempt_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF p_state NOT IN ('DELIVERED','RETRY','DEAD','UNCERTAIN') THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATE'; END IF;
 UPDATE public.canonical_telegram_delivery_parts SET state=p_state,telegram_message_id=p_message_id,last_error=p_reason,next_attempt_at=p_next_attempt_at,updated_at=now() WHERE id=p_delivery_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_PART_NOT_FOUND'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.finish_signal_publication_work(p_work_id uuid,p_lease_token uuid,p_status text,p_reason text DEFAULT NULL,p_next_attempt_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF p_status NOT IN ('sent','failed','suppressed') THEN RAISE EXCEPTION 'INVALID_PUBLICATION_STATE'; END IF;
 UPDATE public.signal_publication_work SET status=p_status,last_error=p_reason,next_attempt_at=coalesce(p_next_attempt_at,CASE WHEN p_status='failed' THEN now()+interval '100 years' ELSE next_attempt_at END),lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=p_work_id AND lease_token=p_lease_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUBLICATION_LEASE_LOST'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.retry_signal_publication_work(p_work_id uuid) RETURNS public.signal_publication_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.signal_publication_work%ROWTYPE;
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.canonical_telegram_delivery_parts WHERE publication_work_id=p_work_id AND state='UNCERTAIN') THEN RAISE EXCEPTION 'UNCERTAIN_DELIVERY_REQUIRES_TELEGRAM_RECONCILIATION'; END IF;
 UPDATE public.signal_publication_work SET status='pending',next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE id=p_work_id AND status='failed' RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION 'WORK_NOT_RETRYABLE'; END IF; RETURN result; END $$;
REVOKE ALL ON FUNCTION public.reserve_canonical_delivery_part(uuid,uuid,integer,text),public.finish_canonical_delivery_part(uuid,text,text,text,timestamptz),public.finish_signal_publication_work(uuid,uuid,text,text,timestamptz),public.retry_signal_publication_work(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_canonical_delivery_part(uuid,uuid,integer,text),public.finish_canonical_delivery_part(uuid,text,text,text,timestamptz),public.finish_signal_publication_work(uuid,uuid,text,text,timestamptz),public.retry_signal_publication_work(uuid) TO service_role;

ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS cumulative_progress integer NOT NULL DEFAULT 0 CHECK(cumulative_progress>=0);
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS immutable_configuration jsonb;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS feed_lineage jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_validation_cycle_content ON public.validation_cycles(run_id,cycle_key);

CREATE OR REPLACE FUNCTION public.prevent_validation_lineage_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.configuration_hash IS DISTINCT FROM NEW.configuration_hash OR OLD.dataset_hash IS DISTINCT FROM NEW.dataset_hash
  OR OLD.immutable_configuration IS DISTINCT FROM NEW.immutable_configuration OR OLD.feed_lineage IS DISTINCT FROM NEW.feed_lineage
 THEN RAISE EXCEPTION 'IMMUTABLE_VALIDATION_LINEAGE'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validation_lineage_immutable ON public.validation_runs;
CREATE TRIGGER trg_validation_lineage_immutable BEFORE UPDATE ON public.validation_runs FOR EACH ROW EXECUTE FUNCTION public.prevent_validation_lineage_mutation();

CREATE OR REPLACE FUNCTION public.claim_validation_run(p_run_id uuid,p_worker text,p_lease_seconds integer DEFAULT 60)
RETURNS public.validation_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE result public.validation_runs%ROWTYPE; BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF; IF p_lease_seconds NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'UNSAFE_VALIDATION_LEASE'; END IF;
 UPDATE public.validation_runs SET lease_token=gen_random_uuid(),lease_owner=p_worker,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),status='RUNNING'
 WHERE id=p_run_id AND mode='SHADOW' AND status IN ('RUNNING','AWAITING_FEED') AND (lease_expires_at IS NULL OR lease_expires_at<now()) AND cancellation_requested_at IS NULL RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_RUN_NOT_CLAIMABLE'; END IF; RETURN result; END $$;

CREATE TABLE IF NOT EXISTS public.validation_simulation_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN ('ACCOUNT','PROP')),status text NOT NULL CHECK(status IN ('RUNNING','COMPLETED','BLOCKED','INCOMPLETE','FAILED','CANCELLED')),
 source_run_id uuid REFERENCES public.validation_runs(id) ON DELETE RESTRICT,dataset_hash text NOT NULL,configuration_hash text NOT NULL,brain_profile_id text,brain_profile_version text,
 immutable_input jsonb NOT NULL,result_summary jsonb,cancellation_requested_at timestamptz,created_by uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.validation_simulation_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES public.validation_simulation_runs(id) ON DELETE RESTRICT,sequence integer NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(run_id,sequence));
ALTER TABLE public.validation_simulation_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.validation_simulation_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read simulation runs" ON public.validation_simulation_runs FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY "admins read simulation evidence" ON public.validation_simulation_evidence FOR SELECT TO authenticated USING(public.is_admin());
REVOKE ALL ON public.validation_simulation_runs,public.validation_simulation_evidence FROM anon,authenticated; GRANT SELECT,INSERT,UPDATE ON public.validation_simulation_runs,public.validation_simulation_evidence TO service_role;
REVOKE ALL ON FUNCTION public.claim_validation_run(uuid,text,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.claim_validation_run(uuid,text,integer) TO service_role;

-- Read-only operator health; recovery is lease/retry based and has no mark-delivered bypass.
CREATE OR REPLACE VIEW public.canonical_reporting_operations WITH (security_invoker=true) AS
 SELECT w.id,w.entity_type,w.entity_id,w.event_type,w.event_version,w.destination,w.status,w.attempt_count,w.lease_owner,w.lease_expires_at,w.next_attempt_at,w.last_error,w.created_at,
 count(p.id) AS message_parts,count(*) FILTER (WHERE p.state='UNCERTAIN') AS uncertain_parts,count(*) FILTER (WHERE p.state='DEAD') AS dead_parts
 FROM public.signal_publication_work w LEFT JOIN public.canonical_telegram_delivery_parts p ON p.publication_work_id=w.id GROUP BY w.id;
