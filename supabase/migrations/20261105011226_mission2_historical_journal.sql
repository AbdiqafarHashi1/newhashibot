-- Isolated research persistence: no signal, publication, entitlement or order writes.
create table public.historical_replay_states (
 job_id uuid not null references public.portable_jobs(id) on delete cascade,
 owner_id uuid not null, setup_id text not null, state jsonb not null,
 created_clock bigint not null, updated_clock bigint not null,
 primary key(job_id,setup_id), check(octet_length(state::text)<=200000)
);
create table public.historical_replay_events (
 job_id uuid not null references public.portable_jobs(id) on delete cascade,
 owner_id uuid not null, event_key text not null, sequence bigint not null, payload jsonb not null,
 primary key(job_id,event_key), unique(job_id,sequence), check(octet_length(payload::text)<=200000)
);
create table public.historical_replay_ticks (
 job_id uuid not null references public.portable_jobs(id) on delete cascade,
 owner_id uuid not null, cursor integer not null check(cursor>0), digest text not null,
 primary key(job_id,cursor)
);
create index historical_replay_states_owner on public.historical_replay_states(owner_id,job_id);
create index historical_replay_events_owner on public.historical_replay_events(owner_id,job_id);
create index historical_replay_ticks_owner on public.historical_replay_ticks(owner_id,job_id);
alter table public.historical_replay_states enable row level security;
alter table public.historical_replay_events enable row level security;
alter table public.historical_replay_ticks enable row level security;
revoke all on public.historical_replay_states,public.historical_replay_events,public.historical_replay_ticks from public,anon,authenticated;
grant select on public.historical_replay_states,public.historical_replay_events,public.historical_replay_ticks to authenticated;
grant select,insert,update,delete on public.historical_replay_states,public.historical_replay_events,public.historical_replay_ticks to service_role;
create policy historical_states_owner_read on public.historical_replay_states for select to authenticated using(owner_id=(select auth.uid()) and (select is_admin()));
create policy historical_events_owner_read on public.historical_replay_events for select to authenticated using(owner_id=(select auth.uid()) and (select is_admin()));
create policy historical_ticks_owner_read on public.historical_replay_ticks for select to authenticated using(owner_id=(select auth.uid()) and (select is_admin()));

create function public.checkpoint_historical_replay(p_job uuid,p_token uuid,p_tick jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.portable_jobs; c integer; previous integer; lineage text; stamp timestamptz; digest text; stored text;
 r jsonb; old_state jsonb; old_event jsonb; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit','fillAt','observedAt','confirmationIntelligence','entryDecision','evaluationOutcome','watchOutcome','confirmationEvidence'];
begin
 j:=public.fence_phase_p_job(p_job,p_token);
 if j.kind<>'REPLAY' or j.payload->>'entryPolicyVersion' is distinct from 'entry-decision/v1' then raise exception 'CANONICAL_REPLAY_JOB_REQUIRED';end if;
 if octet_length(p_tick::text)>2000000 or jsonb_typeof(p_tick->'states') is distinct from 'array' or jsonb_typeof(p_tick->'events') is distinct from 'array' or jsonb_typeof(p_tick->'observations') is distinct from 'array' or jsonb_typeof(p_tick->'health') is distinct from 'array' or jsonb_typeof(p_tick->'rejections') is distinct from 'array' then raise exception 'HISTORICAL_TICK_INVALID';end if;
 c:=(p_tick->>'cursor')::integer; previous:=coalesce((j.checkpoint->>'cursor')::integer,0);lineage:=p_tick->>'lineage';stamp:=(p_tick->>'through')::timestamptz;
 if c is null or c<1 or c>coalesce((j.payload->>'maxCycles')::integer,500) or stamp is null or stamp is distinct from (j.payload->>'start')::timestamptz+(c-1)*interval '1 minute' or stamp>=(j.payload->>'end')::timestamptz or lineage is null or lineage!~'^[0-9a-f]{64}$' then raise exception 'HISTORICAL_CLOCK_INVALID';end if;
 if previous>0 and j.checkpoint#>>'{canonical,lineage}' is distinct from lineage then raise exception 'HISTORICAL_LINEAGE_CONFLICT';end if;
 digest:=encode(sha256(convert_to(p_tick::text,'UTF8')),'hex');
 select t.digest into stored from historical_replay_ticks t where job_id=p_job and cursor=c;
 if found then if stored=digest then return false;else raise exception 'HISTORICAL_TICK_CONFLICT';end if;end if;
 if c<>previous+1 then raise exception 'HISTORICAL_CURSOR_CONFLICT';end if;
 if jsonb_array_length(p_tick->'states')>100 or jsonb_array_length(p_tick->'events')>250 then raise exception 'HISTORICAL_TICK_LIMIT';end if;
 for r in select value from jsonb_array_elements(p_tick->'states') loop
  if not coalesce((r#>>'{state,version}')::integer>0,false) or coalesce(r#>>'{state,id}','')='' or (r->>'createdAt')::bigint>(r->>'updatedAt')::bigint or (r->>'updatedAt')::bigint>extract(epoch from stamp)*1000 then raise exception 'HISTORICAL_STATE_INVALID';end if;
  select state into old_state from historical_replay_states where job_id=p_job and setup_id=r#>>'{state,id}' for update;
  if found then
   if (old_state-mutable) is distinct from ((r->'state')-mutable) then raise exception 'IMMUTABLE_SETUP_PLAN';end if;
   if (r#>>'{state,version}')::integer<=(old_state->>'version')::integer then raise exception 'HISTORICAL_STATE_VERSION_CONFLICT';end if;
   if old_state ? 'watchOutcome' and old_state->'watchOutcome' is distinct from r#>'{state,watchOutcome}' then raise exception 'TERMINAL_WATCH_OUTCOME';end if;
  end if;
  insert into historical_replay_states(job_id,owner_id,setup_id,state,created_clock,updated_clock) values(p_job,j.customer_id,r#>>'{state,id}',r->'state',(r->>'createdAt')::bigint,(r->>'updatedAt')::bigint)
  on conflict(job_id,setup_id) do update set state=excluded.state,updated_clock=excluded.updated_clock;
 end loop;
 for r in select value from jsonb_array_elements(p_tick->'events') loop
  if coalesce(r->>'id','')='' or (r->>'at')::timestamptz>stamp then raise exception 'HISTORICAL_EVENT_INVALID';end if;
  select payload into old_event from historical_replay_events where job_id=p_job and event_key=r->>'id';
  if found and old_event is distinct from r then raise exception 'HISTORICAL_EVENT_CONFLICT';end if;
  insert into historical_replay_events(job_id,owner_id,event_key,sequence,payload) values(p_job,j.customer_id,r->>'id',coalesce((select max(sequence) from historical_replay_events where job_id=p_job),0)+1,r) on conflict do nothing;
 end loop;
 perform public.append_validation_cycle_if_running(j.run_id,'canonical:v1:'||c,stamp,p_tick->'observations',jsonb_build_object('policy','entry-decision/v1','qualification_eligible',false,'events',p_tick->'events','rejections',p_tick->'rejections'),p_tick->'health');
 insert into historical_replay_ticks values(p_job,j.customer_id,c,digest);
 update portable_jobs set checkpoint=jsonb_build_object('cursor',c,'canonical',jsonb_build_object('schema','canonical-historical-replay/v1','lineage',lineage,'through',extract(epoch from stamp)*1000)),heartbeat_at=clock_timestamp() where id=p_job;
 return true;
end$$;
revoke all on function public.checkpoint_historical_replay(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_historical_replay(uuid,uuid,jsonb) to service_role;
