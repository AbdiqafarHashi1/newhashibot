-- A release is a tested immutable configuration, never a browser score or an AI prediction.
create table public.strategy_release_candidates(
 id uuid primary key default gen_random_uuid(),strategy_id text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 development_run_id uuid not null references public.validation_runs(id),validation_run_id uuid not null references public.validation_runs(id),
 configuration_hash text not null,immutable_configuration jsonb not null,validation_end timestamptz not null,
 holdout_run_id uuid unique references public.validation_runs(id),holdout_claimed_at timestamptz,holdout_start timestamptz,holdout_end timestamptz,
 state text not null default 'FROZEN' check(state in('FROZEN','HOLDOUT_RUNNING','PROMOTED','RETIRED')),promoted_at timestamptz,
 unique(strategy_id,development_run_id,validation_run_id)
);
create unique index one_active_measured_strategy on public.strategy_release_candidates(strategy_id) where state='PROMOTED';
alter table public.strategy_release_candidates enable row level security;
revoke all on public.strategy_release_candidates from public,anon,authenticated;
grant select on public.strategy_release_candidates to authenticated;
grant all on public.strategy_release_candidates to service_role;
create policy strategy_release_admin_read on public.strategy_release_candidates for select to authenticated using(public.is_admin());

create function public.assert_measured_strategy_run(p_run uuid,p_strategy text,p_hash text) returns void
language plpgsql security invoker set search_path=public as $$
declare r validation_runs;n integer;unresolved integer;profit numeric;loss numeric;begin
 select * into r from validation_runs where id=p_run;
 if not found or r.mode<>'REPLAY' or r.status<>'COMPLETED' or r.configuration_hash is distinct from p_hash or r.failure_code is not null or r.cancellation_requested_at is not null then raise exception 'COMPLETED_MATCHING_SCANNER_REPLAY_REQUIRED';end if;
 if r.provenance->>'start' is null or r.provenance->>'end' is null then raise exception 'RECORDED_REPLAY_RANGE_REQUIRED';end if;
 if coalesce((r.outcome_assumptions->>'feeBps')::numeric,0)+coalesce((r.outcome_assumptions->>'spreadBps')::numeric,0)+coalesce((r.outcome_assumptions->>'slippageBps')::numeric,0)<=0 then raise exception 'DECLARED_NONZERO_COSTS_REQUIRED';end if;
 select count(*),count(*) filter(where net_r is null or net_r::text in('NaN','Infinity','-Infinity') or status not in('STOP','TARGET')),coalesce(sum(greatest(net_r,0)),0),-coalesce(sum(least(net_r,0)),0)
 into n,unresolved,profit,loss from validation_outcomes where run_id=p_run and strategy_id=p_strategy;
 if n<30 then raise exception 'AT_LEAST_30_TRADES_PER_PERIOD_REQUIRED';end if;
 if unresolved>0 then raise exception 'UNRESOLVED_OUTCOMES_REQUIRE_REVIEW';end if;
 if loss<=0 or profit/loss<1.2 or profit-loss<=0 then raise exception 'POSITIVE_NET_EDGE_AND_PROFIT_FACTOR_1_2_REQUIRED';end if;
end$$;
revoke all on function public.assert_measured_strategy_run(uuid,text,text) from public,anon,authenticated;
grant execute on function public.assert_measured_strategy_run(uuid,text,text) to service_role;

create function public.freeze_strategy_release_candidate(p_actor uuid,p_development uuid,p_validation uuid,p_strategy text) returns uuid
language plpgsql security definer set search_path=public as $$
declare d validation_runs;v validation_runs;result uuid;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 select * into d from validation_runs where id=p_development and created_by=p_actor;select * into v from validation_runs where id=p_validation and created_by=p_actor;
 if d.id is null or v.id is null or d.id=v.id or d.configuration_hash is distinct from v.configuration_hash or d.immutable_configuration is distinct from v.immutable_configuration or d.outcome_assumptions is distinct from v.outcome_assumptions then raise exception 'MATCHING_FROZEN_RESEARCH_REQUIRED';end if;
 if not exists(select 1 from jsonb_array_elements(d.immutable_configuration->'strategies') s where s->>'id'=p_strategy and (s->>'enabled')::boolean) then raise exception 'TESTED_STRATEGY_REQUIRED';end if;
 perform assert_measured_strategy_run(d.id,p_strategy,d.configuration_hash);perform assert_measured_strategy_run(v.id,p_strategy,d.configuration_hash);
 if (d.provenance->>'end')::timestamptz>(v.provenance->>'start')::timestamptz then raise exception 'CHRONOLOGICAL_NONOVERLAPPING_PERIODS_REQUIRED';end if;
 insert into strategy_release_candidates(strategy_id,created_by,development_run_id,validation_run_id,configuration_hash,immutable_configuration,validation_end)
 values(p_strategy,p_actor,d.id,v.id,d.configuration_hash,d.immutable_configuration,(v.provenance->>'end')::timestamptz)
 on conflict(strategy_id,development_run_id,validation_run_id) do nothing returning id into result;
 if result is null then select id into result from strategy_release_candidates where strategy_id=p_strategy and development_run_id=d.id and validation_run_id=v.id;end if;return result;
end$$;

-- Called within the enqueue transaction: a candidate has exactly one holdout attempt.
create function public.claim_strategy_release_holdout(p_candidate uuid,p_actor uuid,p_run uuid,p_start timestamptz,p_end timestamptz) returns void
language plpgsql security invoker set search_path=public as $$
declare c strategy_release_candidates;r validation_runs;v validation_runs;begin
 perform pg_advisory_xact_lock(hashtext('STRATEGY_RELEASE_HOLDOUT'));
 select * into c from strategy_release_candidates where id=p_candidate and created_by=p_actor for update;
 if not found or c.state<>'FROZEN' or c.holdout_run_id is not null then raise exception 'HOLDOUT_ALREADY_CONSUMED_OR_CANDIDATE_UNAVAILABLE';end if;
 select * into r from validation_runs where id=p_run and created_by=p_actor;select * into v from validation_runs where id=c.validation_run_id;
 if r.id is null or r.created_at<c.created_at or p_start is null or p_end is null or r.configuration_hash is distinct from c.configuration_hash or r.immutable_configuration is distinct from c.immutable_configuration or r.outcome_assumptions is distinct from v.outcome_assumptions or p_start<c.validation_end or p_end<=p_start then raise exception 'FROZEN_HOLDOUT_LINEAGE_REQUIRED';end if;
 -- Previously inspected periods cannot be relabelled as an untouched holdout, even for another proposal.
 if exists(select 1 from validation_runs x where x.id<>r.id and x.mode='REPLAY' and x.provenance->>'start' is not null and tstzrange((x.provenance->>'start')::timestamptz,(x.provenance->>'end')::timestamptz,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'HOLDOUT_PERIOD_PREVIOUSLY_INSPECTED';end if;
 if exists(select 1 from strategy_release_candidates x where x.id<>c.id and x.holdout_run_id is not null and x.strategy_id=c.strategy_id and tstzrange(x.holdout_start,x.holdout_end,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'HOLDOUT_PERIOD_ALREADY_CONSUMED';end if;
 update strategy_release_candidates set holdout_run_id=r.id,holdout_claimed_at=clock_timestamp(),holdout_start=p_start,holdout_end=p_end,state='HOLDOUT_RUNNING' where id=c.id;
end$$;

create function public.promote_measured_strategy_release(p_actor uuid,p_candidate uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c strategy_release_candidates;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext('MEASURED_STRATEGY_PROMOTION'));
 select * into c from strategy_release_candidates where id=p_candidate for update;
 if not found then raise exception 'RELEASE_CANDIDATE_REQUIRED';end if;
 if c.state='PROMOTED' then return jsonb_build_object('state','PROMOTED','id',c.id,'strategy_id',c.strategy_id,'execution_enabled',false);end if;
 if c.state<>'HOLDOUT_RUNNING' or c.holdout_run_id is null or c.holdout_claimed_at<c.created_at then raise exception 'FROZEN_HOLDOUT_REQUIRED';end if;
 perform assert_measured_strategy_run(c.development_run_id,c.strategy_id,c.configuration_hash);
 perform assert_measured_strategy_run(c.validation_run_id,c.strategy_id,c.configuration_hash);
 perform assert_measured_strategy_run(c.holdout_run_id,c.strategy_id,c.configuration_hash);
 update strategy_release_candidates set state='RETIRED' where strategy_id=c.strategy_id and state='PROMOTED';
 update strategy_release_candidates set state='PROMOTED',promoted_at=clock_timestamp() where id=c.id;
 return jsonb_build_object('state','PROMOTED','id',c.id,'strategy_id',c.strategy_id,'execution_enabled',false);
end$$;
revoke all on function public.freeze_strategy_release_candidate(uuid,uuid,uuid,text),public.claim_strategy_release_holdout(uuid,uuid,uuid,timestamptz,timestamptz),public.promote_measured_strategy_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.freeze_strategy_release_candidate(uuid,uuid,uuid,text),public.claim_strategy_release_holdout(uuid,uuid,uuid,timestamptz,timestamptz),public.promote_measured_strategy_release(uuid,uuid) to service_role;

-- Preserve native worker quotas, leases and idempotency; bind holdout atomically with its native run.
CREATE OR REPLACE FUNCTION public.enqueue_phase_p_job(p_actor uuid,p_kind text,p_payload jsonb,p_key text,p_hash text,p_account uuid DEFAULT NULL)
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
  VALUES('REPLAY','RUNNING',p_hash,p_payload->'configuration',p_payload->>'datasetHash',jsonb_build_object('datasetIds',p_payload->'datasetIds','datasetHashes',p_payload->'datasetHashes','host_contract','phase-p/v1','start',p_payload->>'start','end',p_payload->>'end'),(p_payload->>'maxCycles')::integer,4,p_actor,p_payload->'assumptions') RETURNING id INTO run;
 ELSE
  INSERT INTO validation_simulation_runs(kind,status,source_run_id,dataset_hash,configuration_hash,brain_profile_id,brain_profile_version,immutable_input,created_by)
  VALUES(p_kind,'RUNNING',(p_payload->>'canonicalSourceRunId')::uuid,p_payload->>'datasetHash',p_payload->>'sourceConfigurationHash',p_payload->>'brainAssignmentId',p_payload->>'brainVersion',p_payload,p_actor) RETURNING id INTO run;
 END IF;
 IF p_kind='REPLAY' AND p_payload->>'releaseCandidateId' IS NOT NULL THEN PERFORM claim_strategy_release_holdout((p_payload->>'releaseCandidateId')::uuid,p_actor,run,(p_payload->>'start')::timestamptz,(p_payload->>'end')::timestamptz); END IF;
 INSERT INTO portable_jobs(kind,payload,customer_id,execution_account_id,idempotency_key,max_attempts,run_id,configuration_hash)
 VALUES(p_kind,p_payload,p_actor,p_account,'phase-p:'||p_actor::text||':'||p_key,3,run,p_hash) RETURNING * INTO j;
 RETURN j;
END $$;

