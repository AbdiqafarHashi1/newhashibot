-- Phase M pipeline repair: scanner outcome evidence participates in atomic completion.
CREATE OR REPLACE FUNCTION public.append_validation_outcome_if_running(p_run_id uuid,p_cycle_key text,p_outcome jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old public.validation_outcomes%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO old FROM public.validation_outcomes WHERE run_id=p_run_id AND cycle_key=p_cycle_key;
 IF FOUND THEN
  IF to_jsonb(old)-'id'-'created_at'-'run_id'-'cycle_key' <> p_outcome-'id'-'created_at'-'run_id'-'cycle_key' THEN RAISE EXCEPTION 'VALIDATION_OUTCOME_CONFLICT'; END IF;
  RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.validation_runs WHERE id=p_run_id AND status='RUNNING' AND cancellation_requested_at IS NULL) THEN RAISE EXCEPTION 'VALIDATION_RUN_NOT_WRITABLE'; END IF;
 INSERT INTO public.validation_outcomes(run_id,cycle_key,candidate_id,strategy_id,symbol,timeframe,status,entry_time,exit_time,entry_price,exit_price,gross_r,net_r,cost_r,partial_exit,conservative,exclusion_reason,cash_flow_events,assumptions,configuration_hash,dataset_hash)
 VALUES(p_run_id,p_cycle_key,p_outcome->>'candidate_id',p_outcome->>'strategy_id',p_outcome->>'symbol',p_outcome->>'timeframe',p_outcome->>'status',(p_outcome->>'entry_time')::timestamptz,nullif(p_outcome->>'exit_time','')::timestamptz,(p_outcome->>'entry_price')::numeric,nullif(p_outcome->>'exit_price','')::numeric,nullif(p_outcome->>'gross_r','')::numeric,nullif(p_outcome->>'net_r','')::numeric,(p_outcome->>'cost_r')::numeric,(p_outcome->>'partial_exit')::boolean,(p_outcome->>'conservative')::boolean,p_outcome->>'exclusion_reason',coalesce(p_outcome->'cash_flow_events','[]'::jsonb),p_outcome->'assumptions',p_outcome->>'configuration_hash',p_outcome->>'dataset_hash');
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.complete_validation_run_with_outcomes(p_run_id uuid,p_expected_cycles integer,p_expected_outcomes integer,p_summary jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF (SELECT count(*) FROM public.validation_cycles WHERE run_id=p_run_id)<>p_expected_cycles OR (SELECT count(*) FROM public.validation_outcomes WHERE run_id=p_run_id)<>p_expected_outcomes THEN RAISE EXCEPTION 'VALIDATION_EVIDENCE_INCOMPLETE'; END IF;
 UPDATE public.validation_runs SET status='COMPLETED',outcome_metrics=p_summary,finished_at=now() WHERE id=p_run_id AND status='RUNNING' AND cancellation_requested_at IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.append_validation_outcome_if_running(uuid,text,jsonb),public.complete_validation_run_with_outcomes(uuid,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_validation_outcome_if_running(uuid,text,jsonb),public.complete_validation_run_with_outcomes(uuid,integer,integer,jsonb) TO service_role;
