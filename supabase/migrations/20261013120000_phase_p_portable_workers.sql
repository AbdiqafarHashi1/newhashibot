-- Forward-only. Existing migration history and cron definitions remain untouched.
-- CLI migration generation was unavailable in the authoring environment; timestamp
-- is explicitly after Phase O's latest dependency (20261012120000).
ALTER TABLE public.portable_jobs
 ADD COLUMN status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','RETRY','DEAD_LETTER')),
 ADD COLUMN lease_token uuid, ADD COLUMN lease_owner text, ADD COLUMN lease_expires_at timestamptz,
 ADD COLUMN heartbeat_at timestamptz, ADD COLUMN worker_revision text,
 ADD COLUMN checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN run_id uuid, ADD COLUMN configuration_hash text,
 ADD COLUMN slice_count integer NOT NULL DEFAULT 0, ADD COLUMN result_summary jsonb;
CREATE INDEX phase_p_claimable ON public.portable_jobs(status,available_at,lease_expires_at) WHERE kind IN ('HISTORY','REPLAY','ACCOUNT','PROP');
CREATE TABLE public.phase_p_worker_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), stop_new_work boolean NOT NULL DEFAULT true,
 daily_job_limit integer NOT NULL DEFAULT 20 CHECK(daily_job_limit BETWEEN 1 AND 20),
 daily_slice_limit integer NOT NULL DEFAULT 100 CHECK(daily_slice_limit BETWEEN 1 AND 100),
 concurrency_limit integer NOT NULL DEFAULT 1 CHECK(concurrency_limit=1), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.phase_p_worker_control(id) VALUES(true);
CREATE TABLE public.phase_p_worker_usage (
 customer_id uuid NOT NULL REFERENCES auth.users(id), day date NOT NULL,
 jobs integer NOT NULL DEFAULT 0 CHECK(jobs>=0), slices integer NOT NULL DEFAULT 0 CHECK(slices>=0),
 PRIMARY KEY(customer_id,day)
);
ALTER TABLE public.phase_p_worker_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_p_worker_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phase_p_worker_control,public.phase_p_worker_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.phase_p_worker_control,public.phase_p_worker_usage,public.portable_jobs TO service_role;
GRANT SELECT ON public.profiles,public.connected_execution_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.validation_runs,public.validation_datasets,public.validation_simulation_runs TO service_role;
GRANT SELECT,INSERT ON public.validation_cycles,public.validation_outcomes,public.validation_dataset_candles,public.validation_simulation_evidence TO service_role;

-- All RPCs are invoker functions, service-role-only. The authenticated Edge API
-- validates the actual Auth user; the database rechecks the current profiles role.
CREATE FUNCTION public.enqueue_phase_p_job(p_actor uuid,p_kind text,p_payload jsonb,p_key text,p_hash text,p_account uuid DEFAULT NULL)
RETURNS public.portable_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j public.portable_jobs; control public.phase_p_worker_control; run uuid; used integer; d date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF p_kind NOT IN ('HISTORY','REPLAY','ACCOUNT','PROP') OR length(p_key) NOT BETWEEN 8 AND 100 OR octet_length(p_payload::text)>100000 THEN RAISE EXCEPTION 'TASK_INVALID'; END IF;
 -- Serialize duplicate submitters before charging quotas or creating native runs.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key,0));
 SELECT * INTO j FROM portable_jobs WHERE idempotency_key='phase-p:'||p_actor::text||':'||p_key;
 IF FOUND THEN
  IF j.kind<>p_kind OR j.payload IS DISTINCT FROM p_payload OR j.configuration_hash IS DISTINCT FROM p_hash OR j.execution_account_id IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN j;
 END IF;
 SELECT * INTO control FROM phase_p_worker_control WHERE id=true FOR UPDATE;
 IF control.stop_new_work THEN RAISE EXCEPTION 'NEW_WORK_STOPPED'; END IF;
 IF p_account IS NOT NULL AND NOT EXISTS(SELECT 1 FROM connected_execution_accounts WHERE id=p_account AND customer_id=p_actor) THEN RAISE EXCEPTION 'ACCOUNT_UNAUTHORIZED'; END IF;
 INSERT INTO phase_p_worker_usage(customer_id,day) VALUES(p_actor,d) ON CONFLICT DO NOTHING;
 UPDATE phase_p_worker_usage SET jobs=jobs+1 WHERE customer_id=p_actor AND day=d AND jobs<control.daily_job_limit RETURNING jobs INTO used;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTA_EXCEEDED'; END IF;
 IF p_kind='HISTORY' THEN
  INSERT INTO validation_datasets(source,status,symbol,timeframe,starts_at,ends_at,dataset_hash,provenance,created_by)
  VALUES(p_payload->>'provider','DOWNLOADING',p_payload->>'symbol',p_payload->>'timeframe',(p_payload->>'start')::timestamptz,(p_payload->>'end')::timestamptz,'PENDING','PUBLIC_RESEARCH_PORTABLE_PHASE_P',p_actor) RETURNING id INTO run;
 ELSIF p_kind='REPLAY' THEN
  INSERT INTO validation_runs(mode,status,configuration_hash,immutable_configuration,dataset_hash,provenance,max_cycles,max_requests,created_by,outcome_assumptions)
  VALUES('REPLAY','RUNNING',p_hash,p_payload->'configuration',p_payload->>'datasetHash',jsonb_build_object('datasetIds',p_payload->'datasetIds','datasetHashes',p_payload->'datasetHashes','host_contract','phase-p/v1'),(p_payload->>'maxCycles')::integer,4,p_actor,p_payload->'assumptions') RETURNING id INTO run;
 ELSE
  INSERT INTO validation_simulation_runs(kind,status,source_run_id,dataset_hash,configuration_hash,brain_profile_id,brain_profile_version,immutable_input,created_by)
  VALUES(p_kind,'RUNNING',(p_payload->>'canonicalSourceRunId')::uuid,p_payload->>'datasetHash',p_payload->>'sourceConfigurationHash',p_payload->>'brainAssignmentId',p_payload->>'brainVersion',p_payload,p_actor) RETURNING id INTO run;
 END IF;
 INSERT INTO portable_jobs(kind,payload,customer_id,execution_account_id,idempotency_key,max_attempts,run_id,configuration_hash)
 VALUES(p_kind,p_payload,p_actor,p_account,'phase-p:'||p_actor::text||':'||p_key,3,run,p_hash) RETURNING * INTO j;
 RETURN j;
END $$;

CREATE FUNCTION public.claim_phase_p_job(p_host text,p_revision text)
RETURNS SETOF public.portable_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE control public.phase_p_worker_control; candidate public.portable_jobs; d date:=(clock_timestamp() AT TIME ZONE 'UTC')::date; used integer;
BEGIN
 IF length(p_host) NOT BETWEEN 1 AND 100 OR length(p_revision) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'WORKER_IDENTITY_INVALID'; END IF;
 SELECT * INTO control FROM phase_p_worker_control WHERE id=true FOR UPDATE;
 -- Recover cancellation/terminal states independently of the stop-new-work switch.
 UPDATE portable_jobs j SET status='CANCELLED',cancelled_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL
 WHERE j.kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') AND j.status IN ('QUEUED','RETRY','RUNNING') AND
 (EXISTS(SELECT 1 FROM validation_runs r WHERE r.id=j.run_id AND (r.status='CANCELLED' OR r.cancellation_requested_at IS NOT NULL)) OR
  EXISTS(SELECT 1 FROM validation_simulation_runs r WHERE r.id=j.run_id AND (r.status='CANCELLED' OR r.cancellation_requested_at IS NOT NULL)) OR
  EXISTS(SELECT 1 FROM validation_datasets r WHERE r.id=j.run_id AND r.status='CANCELLED'));
 UPDATE portable_jobs SET status='DEAD_LETTER',dead_lettered_at=clock_timestamp(),safe_error='ATTEMPTS_OR_SLICES_EXHAUSTED',lease_token=NULL,lease_expires_at=NULL
 WHERE kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') AND status IN ('QUEUED','RETRY','RUNNING') AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp()) AND (attempt>=max_attempts OR slice_count>=40 OR NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=portable_jobs.customer_id AND p.role='admin'));
 UPDATE validation_runs r SET status='FAILED',failure_code='PORTABLE_DEAD_LETTER',finished_at=clock_timestamp() FROM portable_jobs j WHERE j.run_id=r.id AND j.status='DEAD_LETTER' AND r.status='RUNNING';
 UPDATE validation_simulation_runs r SET status='FAILED',finished_at=clock_timestamp() FROM portable_jobs j WHERE j.run_id=r.id AND j.status='DEAD_LETTER' AND r.status='RUNNING';
 UPDATE validation_datasets r SET status='FAILED' FROM portable_jobs j WHERE j.run_id=r.id AND j.status='DEAD_LETTER' AND r.status='DOWNLOADING';
 IF control.stop_new_work OR EXISTS(SELECT 1 FROM portable_jobs WHERE kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') AND status='RUNNING' AND lease_expires_at>clock_timestamp()) THEN RETURN; END IF;
 SELECT j.* INTO candidate FROM portable_jobs j
 LEFT JOIN phase_p_worker_usage u ON u.customer_id=j.customer_id AND u.day=d
 WHERE j.kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') AND j.status IN ('QUEUED','RETRY','RUNNING') AND j.available_at<=clock_timestamp()
 AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) AND j.cancelled_at IS NULL AND j.attempt<j.max_attempts AND j.slice_count<40
 AND coalesce(u.slices,0)<control.daily_slice_limit
 ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF candidate.id IS NULL THEN RETURN; END IF;
 INSERT INTO phase_p_worker_usage(customer_id,day) VALUES(candidate.customer_id,d) ON CONFLICT DO NOTHING;
 UPDATE phase_p_worker_usage SET slices=slices+1 WHERE customer_id=candidate.customer_id AND day=d AND slices<control.daily_slice_limit RETURNING slices INTO used;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE portable_jobs SET status='RUNNING',claimed_at=clock_timestamp(),attempt=attempt+1,slice_count=slice_count+1,
 lease_token=gen_random_uuid(),lease_owner=p_host,worker_revision=p_revision,lease_expires_at=clock_timestamp()+interval '90 seconds',heartbeat_at=clock_timestamp()
 WHERE id=candidate.id RETURNING *;
END $$;

CREATE FUNCTION public.fence_phase_p_job(p_id uuid,p_token uuid) RETURNS public.portable_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j public.portable_jobs;
BEGIN
 SELECT * INTO j FROM portable_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.lease_token IS DISTINCT FROM p_token OR j.status<>'RUNNING' OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'LEASE_LOST'; END IF;
 IF j.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'JOB_CANCELLED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=j.customer_id AND role='admin') THEN RAISE EXCEPTION 'AUTHORIZATION_REVOKED'; END IF;
 IF j.execution_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM connected_execution_accounts WHERE id=j.execution_account_id AND customer_id=j.customer_id) THEN RAISE EXCEPTION 'AUTHORIZATION_REVOKED'; END IF;
 IF j.kind='REPLAY' THEN
  PERFORM 1 FROM validation_runs WHERE id=j.run_id AND created_by=j.customer_id AND status='RUNNING' AND cancellation_requested_at IS NULL FOR UPDATE;
 ELSIF j.kind='HISTORY' THEN
  PERFORM 1 FROM validation_datasets WHERE id=j.run_id AND created_by=j.customer_id AND status='DOWNLOADING' FOR UPDATE;
 ELSE
  PERFORM 1 FROM validation_simulation_runs WHERE id=j.run_id AND created_by=j.customer_id AND status='RUNNING' AND cancellation_requested_at IS NULL FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_CANCELLED'; END IF;
 RETURN j;
END $$;
CREATE FUNCTION public.heartbeat_phase_p_job(p_id uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM fence_phase_p_job(p_id,p_token);
 UPDATE portable_jobs SET heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds' WHERE id=p_id;
END $$;
CREATE FUNCTION public.checkpoint_phase_p_job(p_id uuid,p_token uuid,p_checkpoint jsonb,p_rows jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j public.portable_jobs; r jsonb; prior jsonb; sequence_number integer; old_outcome public.validation_outcomes; normalized public.validation_outcomes;
BEGIN
 j:=fence_phase_p_job(p_id,p_token);
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>250 OR octet_length(p_rows::text)>2000000 OR octet_length(p_checkpoint::text)>10000 THEN RAISE EXCEPTION 'CHECKPOINT_LIMIT'; END IF;
 IF (p_checkpoint->>'cursor')::integer<coalesce((j.checkpoint->>'cursor')::integer,0) THEN RAISE EXCEPTION 'CHECKPOINT_REGRESSION'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF j.kind='HISTORY' THEN
   IF r->>'symbol' IS DISTINCT FROM j.payload->>'symbol' OR r->>'timeframe' IS DISTINCT FROM j.payload->>'timeframe' OR r->>'source' IS DISTINCT FROM j.payload->>'provider' OR r->>'market_type'<>'crypto' THEN RAISE EXCEPTION 'EVIDENCE_CONFLICT'; END IF;
   SELECT jsonb_build_object('open',open,'high',high,'low',low,'close',close,'volume',volume) INTO prior FROM validation_dataset_candles WHERE dataset_id=j.run_id AND open_time=(r->>'open_time')::timestamptz;
   IF FOUND AND prior IS DISTINCT FROM jsonb_build_object('open',(r->>'open')::numeric,'high',(r->>'high')::numeric,'low',(r->>'low')::numeric,'close',(r->>'close')::numeric,'volume',(r->>'volume')::numeric) THEN RAISE EXCEPTION 'EVIDENCE_CONFLICT'; END IF;
   INSERT INTO validation_dataset_candles SELECT j.run_id,x.* FROM jsonb_to_record(r) AS x(symbol text,market_type text,timeframe text,open_time timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,source text) ON CONFLICT DO NOTHING;
  ELSIF j.kind='REPLAY' THEN
   PERFORM append_validation_cycle_if_running(j.run_id,r->>'cycle_key',(r->>'candle_close_time')::timestamptz,r->'strategy_results',r->'arbitration',r->'data_exclusions');
   IF r->'outcome' IS NOT NULL AND r->'outcome'<>'null'::jsonb THEN
    SELECT * INTO old_outcome FROM validation_outcomes WHERE run_id=j.run_id AND cycle_key=r->>'cycle_key';
    IF FOUND THEN
     normalized:=jsonb_populate_record(old_outcome,r->'outcome');
     IF normalized IS DISTINCT FROM old_outcome THEN RAISE EXCEPTION 'EVIDENCE_CONFLICT'; END IF;
    ELSE PERFORM append_validation_outcome_if_running(j.run_id,r->>'cycle_key',r->'outcome'); END IF;
   END IF;
  ELSE
   sequence_number:=(r->>'sequence')::integer;
   SELECT evidence INTO prior FROM validation_simulation_evidence WHERE run_id=j.run_id AND sequence=sequence_number;
   IF FOUND AND prior IS DISTINCT FROM r->'evidence' THEN RAISE EXCEPTION 'EVIDENCE_CONFLICT'; END IF;
   PERFORM append_simulation_evidence_if_running(j.run_id,sequence_number,r->'evidence');
  END IF;
 END LOOP;
 IF j.kind='HISTORY' AND (SELECT count(*) FROM validation_dataset_candles WHERE dataset_id=j.run_id)>3000 THEN RAISE EXCEPTION 'CANDLE_LIMIT'; END IF;
 UPDATE portable_jobs SET checkpoint=p_checkpoint,heartbeat_at=clock_timestamp() WHERE id=p_id;
END $$;
CREATE FUNCTION public.finish_phase_p_job(p_id uuid,p_token uuid,p_state text,p_summary jsonb,p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j public.portable_jobs; ok boolean;
BEGIN
 j:=fence_phase_p_job(p_id,p_token);
 IF p_state NOT IN ('COMPLETED','YIELD','RETRY','DEAD_LETTER') OR octet_length(p_summary::text)>2000000 THEN RAISE EXCEPTION 'FINALIZATION_INVALID'; END IF;
 IF p_state='COMPLETED' THEN
  IF j.kind='HISTORY' THEN
   IF (p_summary->>'rowCount')::integer IS DISTINCT FROM (SELECT count(*)::integer FROM validation_dataset_candles WHERE dataset_id=j.run_id) OR p_summary->>'datasetHash' IS NULL THEN RAISE EXCEPTION 'COMPLETION_EVIDENCE_MISSING'; END IF;
   UPDATE validation_datasets SET status='READY',dataset_hash=p_summary->>'datasetHash',row_count=(p_summary->>'rowCount')::integer,first_open_time=(p_summary->>'first')::timestamptz,last_open_time=(p_summary->>'last')::timestamptz,coverage=p_summary,resume_cursor=(p_summary->>'last')::timestamptz WHERE id=j.run_id;
  ELSIF j.kind='REPLAY' THEN
   ok:=complete_validation_run_with_outcomes(j.run_id,(p_summary->>'cycles')::integer,(p_summary->>'outcomes')::integer,p_summary);
   IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'COMPLETION_EVIDENCE_MISSING'; END IF;
  ELSE
   ok:=complete_simulation_run_if_current(j.run_id,(j.checkpoint->>'total')::integer,p_summary->>'status',p_summary);
   IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'COMPLETION_EVIDENCE_MISSING'; END IF;
  END IF;
 END IF;
 IF p_state='DEAD_LETTER' THEN
  UPDATE validation_runs SET status='FAILED',failure_code='PORTABLE_DEAD_LETTER',finished_at=clock_timestamp() WHERE id=j.run_id;
  UPDATE validation_simulation_runs SET status='FAILED',finished_at=clock_timestamp() WHERE id=j.run_id;
  UPDATE validation_datasets SET status='FAILED' WHERE id=j.run_id;
 END IF;
 UPDATE portable_jobs SET status=CASE WHEN p_state='YIELD' THEN 'QUEUED' ELSE p_state END,
 attempt=CASE WHEN p_state='YIELD' THEN greatest(0,attempt-1) ELSE attempt END,
 available_at=clock_timestamp()+CASE WHEN p_state='RETRY' THEN interval '15 seconds'*power(2,least(attempt,3)) ELSE interval '1 second' END,
 completed_at=CASE WHEN p_state='COMPLETED' THEN clock_timestamp() ELSE NULL END,
 dead_lettered_at=CASE WHEN p_state='DEAD_LETTER' THEN clock_timestamp() ELSE NULL END,
 result_summary=p_summary,safe_error=left(p_reason,100),lease_token=NULL,lease_expires_at=NULL WHERE id=p_id;
END $$;
CREATE FUNCTION public.control_phase_p_worker(p_actor uuid,p_action text,p_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j public.portable_jobs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF p_action IN ('stop','resume') THEN
  UPDATE phase_p_worker_control SET stop_new_work=p_action='stop',updated_at=clock_timestamp() WHERE id=true;
 ELSIF p_action='cancel' THEN
  SELECT * INTO j FROM portable_jobs WHERE id=p_id AND customer_id=p_actor AND kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') FOR UPDATE;
  IF NOT FOUND OR j.status IN ('COMPLETED','DEAD_LETTER','CANCELLED') THEN RAISE EXCEPTION 'JOB_NOT_CANCELLABLE'; END IF;
  UPDATE portable_jobs SET status='CANCELLED',cancelled_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=p_id;
  UPDATE validation_runs SET status='CANCELLED',cancellation_requested_at=clock_timestamp(),finished_at=clock_timestamp() WHERE id=j.run_id AND status='RUNNING';
  UPDATE validation_simulation_runs SET status='CANCELLED',cancellation_requested_at=clock_timestamp(),finished_at=clock_timestamp() WHERE id=j.run_id AND status='RUNNING';
  UPDATE validation_datasets SET status='CANCELLED' WHERE id=j.run_id AND status='DOWNLOADING';
 ELSIF p_action='retry' THEN
  UPDATE portable_jobs SET status='QUEUED',available_at=clock_timestamp(),safe_error=NULL WHERE id=p_id AND customer_id=p_actor AND status='RETRY' AND attempt<max_attempts AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_RETRYABLE'; END IF;
 ELSE RAISE EXCEPTION 'CONTROL_NOT_ALLOWED'; END IF;
END $$;
-- Do not resurrect dead letters with incomplete lineage; submit a new idempotent run.
DO $$DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('enqueue_phase_p_job','claim_phase_p_job','fence_phase_p_job','heartbeat_phase_p_job','checkpoint_phase_p_job','finish_phase_p_job','control_phase_p_worker') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;

CREATE FUNCTION public.preserve_phase_p_lineage() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.kind IN ('HISTORY','REPLAY','ACCOUNT','PROP') AND
  (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.payload IS DISTINCT FROM OLD.payload OR
   NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.execution_account_id IS DISTINCT FROM OLD.execution_account_id OR
   NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.configuration_hash IS DISTINCT FROM OLD.configuration_hash OR
   NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts) THEN
  RAISE EXCEPTION 'IMMUTABLE_PORTABLE_LINEAGE';
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_phase_p_lineage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_phase_p_lineage BEFORE UPDATE ON public.portable_jobs FOR EACH ROW EXECUTE FUNCTION public.preserve_phase_p_lineage();
