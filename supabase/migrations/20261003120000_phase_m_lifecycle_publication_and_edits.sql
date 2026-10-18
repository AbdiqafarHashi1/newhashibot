-- Phase M completion: canonical lifecycle inbox and version-aware Telegram edits.
ALTER TABLE public.signal_publication_work ALTER COLUMN signal_id DROP NOT NULL;
ALTER TABLE public.canonical_telegram_delivery_parts ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'SEND' CHECK(operation IN ('SEND','EDIT','FOLLOW_UP'));
ALTER TABLE public.canonical_telegram_delivery_parts ADD COLUMN IF NOT EXISTS edited_from_message_id text;

CREATE OR REPLACE FUNCTION public.claim_signal_publication_work(p_worker text,p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 60,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.signal_publication_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE token uuid:=gen_random_uuid(); BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF; IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 1 AND 300 OR p_max_attempts NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'UNSAFE_PUBLICATION_CLAIM_BOUNDS'; END IF;
 UPDATE public.signal_publication_work stale SET status='suppressed',last_error='STALE_LIFECYCLE_VERSION',updated_at=now() WHERE stale.status IN ('pending','failed') AND EXISTS(SELECT 1 FROM public.signal_publication_work newer WHERE newer.entity_type=stale.entity_type AND newer.entity_id=stale.entity_id AND newer.destination=stale.destination AND newer.event_version>stale.event_version AND newer.status='sent');
 RETURN QUERY WITH candidates AS(SELECT id FROM public.signal_publication_work WHERE attempt_count<p_max_attempts AND next_attempt_at<=now() AND(status IN('pending','failed') OR(status='processing' AND lease_expires_at<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit),claimed AS(UPDATE public.signal_publication_work w SET status='processing',attempt_count=w.attempt_count+1,lease_token=token,lease_owner=p_worker,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now() FROM candidates c WHERE w.id=c.id RETURNING w.*)SELECT * FROM claimed; END $$;

CREATE TABLE IF NOT EXISTS public.canonical_lifecycle_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text NOT NULL,event_type text NOT NULL,event_version integer NOT NULL CHECK(event_version>0),
 signal_id uuid REFERENCES public.signals(id),execution_id uuid,customer_id uuid REFERENCES auth.users(id),account_id uuid,
 occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_key,event_version)
);
ALTER TABLE public.canonical_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canonical_lifecycle_events FROM anon,authenticated; GRANT SELECT,INSERT ON public.canonical_lifecycle_events TO service_role;
CREATE OR REPLACE FUNCTION public.prevent_canonical_lifecycle_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_CANONICAL_LIFECYCLE_EVENT'; END $$;
DROP TRIGGER IF EXISTS trg_canonical_lifecycle_immutable ON public.canonical_lifecycle_events;
CREATE TRIGGER trg_canonical_lifecycle_immutable BEFORE UPDATE OR DELETE ON public.canonical_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_lifecycle_mutation();

CREATE OR REPLACE FUNCTION public.enqueue_canonical_lifecycle_event(p_event_key text,p_event_type text,p_event_version integer,p_signal_id uuid,p_execution_id uuid,p_customer_id uuid,p_account_id uuid,p_occurred_at timestamptz,p_payload jsonb,p_destinations text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event_id uuid; existing_hash text; expected_hash text:=md5(p_payload::text); destination text;
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF p_event_version<1 OR p_event_key='' OR p_event_type='' OR p_destinations IS NULL THEN RAISE EXCEPTION 'INVALID_LIFECYCLE_EVENT'; END IF;
 SELECT id,content_hash INTO event_id,existing_hash FROM public.canonical_lifecycle_events WHERE event_key=p_event_key AND event_version=p_event_version;
 IF event_id IS NOT NULL AND existing_hash<>expected_hash THEN RAISE EXCEPTION 'LIFECYCLE_EVENT_CONTENT_CONFLICT'; END IF;
 IF event_id IS NULL THEN INSERT INTO public.canonical_lifecycle_events(event_key,event_type,event_version,signal_id,execution_id,customer_id,account_id,occurred_at,payload,content_hash) VALUES(p_event_key,p_event_type,p_event_version,p_signal_id,p_execution_id,p_customer_id,p_account_id,p_occurred_at,p_payload,expected_hash) RETURNING id INTO event_id; END IF;
 FOREACH destination IN ARRAY p_destinations LOOP
  IF destination NOT IN ('vip','customer','admin','owner') THEN RAISE EXCEPTION 'INVALID_LIFECYCLE_DESTINATION'; END IF;
  IF destination='customer' AND (p_customer_id IS NULL OR p_account_id IS NULL) THEN RAISE EXCEPTION 'CUSTOMER_ACCOUNT_SCOPE_REQUIRED'; END IF;
  INSERT INTO public.signal_publication_work(signal_id,entity_type,entity_id,event_type,event_version,destination,customer_id,event_key,status)
  VALUES(p_signal_id,'lifecycle_event',coalesce(p_execution_id,p_signal_id,event_id),p_event_type,p_event_version,destination,CASE WHEN destination='customer' THEN p_customer_id ELSE NULL END,p_event_key||':'||destination,'pending') ON CONFLICT DO NOTHING;
 END LOOP; RETURN event_id; END $$;
REVOKE ALL ON FUNCTION public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) TO service_role;

-- Replace reservation with version ordering and edit lookup. Higher delivered versions make stale work suppressible.
CREATE OR REPLACE FUNCTION public.reserve_canonical_delivery_part(p_work_id uuid,p_lease_token uuid,p_part integer,p_identity text)
RETURNS public.canonical_telegram_delivery_parts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.canonical_telegram_delivery_parts%ROWTYPE; work public.signal_publication_work%ROWTYPE; previous_message text;
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO work FROM public.signal_publication_work WHERE id=p_work_id AND lease_token=p_lease_token AND status='processing' AND lease_expires_at>now(); IF work.id IS NULL THEN RAISE EXCEPTION 'PUBLICATION_LEASE_LOST'; END IF;
 IF EXISTS(SELECT 1 FROM public.signal_publication_work newer JOIN public.canonical_telegram_delivery_parts part ON part.publication_work_id=newer.id AND part.message_part=p_part AND part.state='DELIVERED' WHERE newer.entity_type=work.entity_type AND newer.entity_id=work.entity_id AND newer.destination=work.destination AND newer.event_version>work.event_version) THEN RAISE EXCEPTION 'STALE_LIFECYCLE_VERSION'; END IF;
 SELECT part.telegram_message_id INTO previous_message FROM public.signal_publication_work older JOIN public.canonical_telegram_delivery_parts part ON part.publication_work_id=older.id AND part.message_part=p_part AND part.state='DELIVERED' WHERE older.entity_type=work.entity_type AND older.entity_id=work.entity_id AND older.destination=work.destination AND older.event_version<work.event_version ORDER BY older.event_version DESC LIMIT 1;
 INSERT INTO public.canonical_telegram_delivery_parts(publication_work_id,message_identity,message_part,state,attempt_count,operation,edited_from_message_id) VALUES(p_work_id,p_identity,p_part,'RESERVED',1,CASE WHEN previous_message IS NULL THEN 'SEND' ELSE 'EDIT' END,previous_message)
 ON CONFLICT(message_identity) DO UPDATE SET attempt_count=CASE WHEN canonical_telegram_delivery_parts.state IN ('RETRY','RESERVED') THEN canonical_telegram_delivery_parts.attempt_count+1 ELSE canonical_telegram_delivery_parts.attempt_count END,updated_at=now() RETURNING * INTO result; RETURN result; END $$;

CREATE OR REPLACE VIEW public.canonical_reporting_operations WITH (security_invoker=true) AS
 SELECT w.id,w.entity_type,w.entity_id,w.event_type,w.event_version,w.destination,w.status,w.attempt_count,w.lease_owner,w.lease_expires_at,w.next_attempt_at,w.last_error,w.created_at,
 count(p.id) AS message_parts,count(*) FILTER(WHERE p.state='UNCERTAIN') AS uncertain_parts,count(*) FILTER(WHERE p.state='DEAD') AS dead_parts,w.customer_id,count(*) FILTER(WHERE p.operation='EDIT') AS edit_parts
 FROM public.signal_publication_work w LEFT JOIN public.canonical_telegram_delivery_parts p ON p.publication_work_id=w.id GROUP BY w.id;

CREATE OR REPLACE FUNCTION public.project_mt5_certification_publication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event_id uuid; key text:=format('mt5-certification:%s:%s:%s',NEW.account_id,NEW.check_key,NEW.checked_at); body jsonb:=jsonb_build_object('account_id',NEW.account_id,'check_key',NEW.check_key,'status',NEW.status,'error_code',NEW.error_code,'evidence',NEW.evidence,'occurred_at',NEW.checked_at);
BEGIN INSERT INTO public.canonical_lifecycle_events(event_key,event_type,event_version,execution_id,customer_id,account_id,occurred_at,payload,content_hash) VALUES(key,'CERTIFICATION',1,NULL,NEW.owner_id,NEW.account_id,NEW.checked_at,body,md5(body::text)) ON CONFLICT(event_key,event_version) DO NOTHING RETURNING id INTO event_id;
 IF event_id IS NOT NULL THEN INSERT INTO public.signal_publication_work(signal_id,entity_type,entity_id,event_type,event_version,destination,event_key,status) VALUES(NULL,'lifecycle_event',event_id,'CERTIFICATION',1,'admin',key||':admin','pending') ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_mt5_certification_publication ON public.mt5_certification_results;
CREATE TRIGGER trg_mt5_certification_publication AFTER INSERT OR UPDATE ON public.mt5_certification_results FOR EACH ROW EXECUTE FUNCTION public.project_mt5_certification_publication();
