-- Forward only: isolated analysis tracks, immutable observation history and one daily Free sample.
drop index public.conditional_one_open_symbol;
create unique index conditional_one_open_symbol_track on public.conditional_signal_setups(symbol,timeframe) where status in('WAITING','ARMED','ACTIVE');
create table public.conditional_setup_history (
 setup_id text not null references public.conditional_signal_setups(id),version integer not null,state jsonb not null,
 observed_at timestamptz not null default now(),recovered_snapshot boolean not null default false,primary key(setup_id,version)
);
create table public.conditional_free_samples(sample_day date primary key,setup_id text not null unique references public.conditional_signal_setups(id));
alter table public.conditional_setup_history enable row level security;
alter table public.conditional_free_samples enable row level security;
revoke all on public.conditional_setup_history,public.conditional_free_samples from public,anon,authenticated,service_role;
grant select on public.conditional_setup_history,public.conditional_free_samples to authenticated;
grant select,insert on public.conditional_setup_history,public.conditional_free_samples to service_role;
create policy conditional_history_admin on public.conditional_setup_history for select to authenticated using(public.is_admin());
create policy conditional_samples_admin on public.conditional_free_samples for select to authenticated using(public.is_admin());
-- Earlier history cannot be reconstructed. Preserve only the observed pre-upgrade snapshot.
insert into public.conditional_setup_history(setup_id,version,state,observed_at,recovered_snapshot) select id,version,state,updated_at,true from public.conditional_signal_setups;
create function public.record_conditional_observation() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 insert into conditional_setup_history(setup_id,version,state) values(new.id,new.version,new.state);return new;end$$;
revoke all on function public.record_conditional_observation() from public,anon,authenticated;
create trigger conditional_history after insert or update of state on public.conditional_signal_setups for each row execute function public.record_conditional_observation();

create or replace function public.commit_conditional_signal_setup(p_state jsonb,p_expected_version integer,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.conditional_signal_setups; v integer; st text; k text; notify boolean; destinations text[]; sample boolean; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit'];
begin
 perform pg_advisory_xact_lock(2961029); -- global cap, symbol ownership and transition/outbox share one transaction
 k:=p_state->>'id'; v:=(p_state->>'version')::integer; st:=p_state->>'status';
 if k is null or length(k)>240 or p_state->>'policy' is distinct from 'conditional-signals/v1' or v is null or p_expected_version is null or p_expected_version<0
  or p_state->>'side' is null or p_state->>'side' not in('buy','sell') or p_message is null or length(p_message)>6000
  or p_state->>'expiresAt' is null or p_state->>'lastBar' is null or p_state->>'trigger' is null or p_state->>'stop' is null or p_state->>'tp1' is null or p_state->>'tp2' is null
  or (p_state->>'track') is null or not ((p_state->>'track'='INTRADAY' and p_state->>'timeframe'='15m') or(p_state->>'track'='SWING' and p_state->>'timeframe'='1h'))
  or st is null or st not in('WAITING','ARMED','ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'INVALID_CONDITIONAL_STATE';end if;
 if not ((p_state->>'trigger')::numeric>0 and(p_state->>'stop')::numeric>0 and(p_state->>'tp1')::numeric>0 and(p_state->>'tp2')::numeric>0) then raise exception 'INVALID_SETUP_PRICES';end if;
 if not ((p_state->>'side'='buy' and(p_state->>'stop')::numeric<(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric<(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric<(p_state->>'tp2')::numeric) or(p_state->>'side'='sell' and(p_state->>'stop')::numeric>(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric>(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric>(p_state->>'tp2')::numeric)) then raise exception 'INVALID_SETUP_GEOMETRY';end if;
 select * into old from conditional_signal_setups where id=k for update;
 if found then
  if old.version=v then if old.state=p_state then return true;else raise exception 'CONDITIONAL_CONTENT_CONFLICT';end if;end if;
  if old.version<>p_expected_version or v<>old.version+1 then return false;end if;
  if (old.state-mutable) is distinct from (p_state-mutable) then raise exception 'IMMUTABLE_SETUP_PLAN';end if;
  if old.status in('CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'TERMINAL_SETUP';end if;
  if not ((old.status='WAITING' and st in('WAITING','ARMED','EXPIRED','INVALIDATED','DATA_GAP')) or(old.status='ARMED' and st in('ACTIVE','CLOSED','INVALIDATED','DATA_GAP')) or(old.status='ACTIVE' and st in('ACTIVE','CLOSED','DATA_GAP'))) then raise exception 'INVALID_SETUP_TRANSITION';end if;
  if (p_state->>'lastBar')::timestamptz<=(old.state->>'lastBar')::timestamptz then raise exception 'NONCHRONOLOGICAL_SETUP';end if;
  notify:=st<>old.status or coalesce((p_state->>'partial')::boolean,false)<>coalesce((old.state->>'partial')::boolean,false);
  update conditional_signal_setups set state=p_state,status=st,version=v,updated_at=now() where id=k;
 else
  if p_expected_version<>0 or v<>1 or st<>'WAITING' or (p_state->>'expiresAt')::timestamptz<=now() then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and timeframe=p_state->>'timeframe' and (status in('WAITING','ARMED','ACTIVE') or updated_at>now()-interval '4 hours')) then return false;end if;
  if exists(select 1 from signals where symbol=p_state->>'symbol' and status in('waiting','active')) then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and status in('WAITING','ARMED','ACTIVE') and state->>'side'<>p_state->>'side') then return false;end if;
  if (select count(*) from conditional_signal_setups where timeframe=p_state->>'timeframe' and status in('WAITING','ARMED','ACTIVE'))>=10 then return false;end if;
  if (select count(*) from conditional_signal_setups where timeframe=p_state->>'timeframe' and created_at>now()-interval '1 hour')>=3 then return false;end if;
  insert into conditional_signal_setups(id,symbol,timeframe,status,version,state) values(k,p_state->>'symbol',p_state->>'timeframe',st,v,p_state);notify:=true;
 end if;
 -- The daily Free sample is selected at admission, before any outcome is known.
 if p_expected_version=0 and (p_state->>'score')::numeric>=80 then
  insert into conditional_free_samples(sample_day,setup_id) values((now() at time zone 'Africa/Nairobi')::date,k) on conflict do nothing;
 end if;
 sample:=exists(select 1 from conditional_free_samples where setup_id=k);
 destinations:=case when st='DATA_GAP' then array['admin'] when sample then array['vip_crypto','free'] else array['vip_crypto'] end;
 if notify then perform public.enqueue_canonical_lifecycle_event('conditional:'||k||':'||v,'CONDITIONAL_SETUP',1,null,null,null,null,now(),
  jsonb_build_object('market_type','crypto','policy','conditional-signals/v1','setup_id',k,'setup_version',v,'state',p_state,'free_sample',sample,'message',p_message),destinations);end if;
 return true;
end$$;
revoke all on function public.commit_conditional_signal_setup(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.commit_conditional_signal_setup(jsonb,integer,text) to service_role;


-- Complete 31-day creation cohort plus older open setups. No account-equity claim.
create function public.conditional_service_overview() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with scoped as(select state,created_at from conditional_signal_setups where public.is_admin() and (created_at>=now()-interval '31 days' or status in('WAITING','ARMED','ACTIVE'))),
 grouped as(select coalesce(state->>'track','UNKNOWN') as track,count(*) as total,
 count(*) filter(where state->>'status' in('WAITING','ARMED','ACTIVE')) as open,
 count(*) filter(where state->>'status'='DATA_GAP') as unknown,
 count(*) filter(where state->>'status'='CLOSED') as closed,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric>0) as wins,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric<0) as losses,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric=0) as break_even,
 count(*) filter(where state->>'status' in('EXPIRED','INVALIDATED')) as no_entry,
 coalesce(sum((state->>'netR')::numeric) filter(where state->>'status'='CLOSED'),0) as net_r,
 min(created_at) as first_created from scoped group by state->>'track')
 select jsonb_build_object('tracks',coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb),'scope','31-day creation cohort plus older open setups; modeled closed R sum, not account return','observed_at',now()) from grouped;
$$;
revoke all on function public.conditional_service_overview() from public,anon;
grant execute on function public.conditional_service_overview() to authenticated,service_role;

-- Destination identity changes revoke prior publication approvals and readiness.
create function public.phase_o_reset_destination_identity() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if old.external_identity_ref is distinct from new.external_identity_ref or old.platform is distinct from new.platform or old.audience is distinct from new.audience then
  new.configuration_state:='UNCONFIGURED';new.permission_verified_at:=null;
  update phase_o_approvals a set revoked_at=now() from phase_o_drafts d where d.destination_id=new.id and a.draft_id=d.id and a.revoked_at is null;
 end if;return new;end$$;
revoke all on function public.phase_o_reset_destination_identity() from public,anon,authenticated;
create trigger phase_o_identity_change before update on public.phase_o_destinations for each row execute function public.phase_o_reset_destination_identity();
create function public.verify_phase_o_destination_identity(p_id uuid,p_expected_identity text,p_verified_identity text,p_verified_at timestamptz) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$declare d phase_o_destinations;begin
 select * into d from phase_o_destinations where id=p_id for update;
 if not found or d.external_identity_ref is distinct from p_expected_identity or d.platform<>'TELEGRAM' then return false;end if;
 if d.external_identity_ref is not null then update phase_o_destinations set external_identity_ref=p_verified_identity where id=p_id;end if;
 update phase_o_destinations set configuration_state='READY',permission_verified_at=p_verified_at where id=p_id;return true;end$$;
revoke all on function public.verify_phase_o_destination_identity(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.verify_phase_o_destination_identity(uuid,text,text,timestamptz) to service_role;
-- Reuse the existing worker, bound standing template and destination frequency policy.
create function public.queue_due_phase_o_standing() returns integer language plpgsql security invoker set search_path=public,pg_temp as $$declare r record;n integer:=0;begin
 for r in select j.id,a.id as approval_id,a.draft_id from phase_o_agent_jobs j join phase_o_drafts d on d.job_id=j.id join phase_o_approvals a on a.draft_id=d.id join phase_o_destinations dest on dest.id=d.destination_id
 where j.status='COMPLETED' and exists(select 1 from phase_o_agent_configurations cfg where cfg.role=j.role and cfg.enabled and cfg.paused_at is null) and (j.campaign_id is null or exists(select 1 from phase_o_campaigns c where c.id=j.campaign_id and c.status='ACTIVE')) and j.task in('UPGRADE_POST','EDUCATION') and a.scope='STANDING_TEMPLATE' and a.revoked_at is null and a.expires_at>now() and a.used_count<a.max_uses and dest.enabled and dest.configuration_state='READY'
 and a.last_used_at+make_interval(mins=>greatest(a.min_interval_minutes,dest.min_interval_minutes,60))<=now()
 order by a.last_used_at limit 20 for update of j skip locked loop
  update phase_o_agent_jobs set status='QUEUED',attempt=0,checkpoint=jsonb_build_object('stage','DELIVERY','draft_id',r.draft_id,'delivery_key',gen_random_uuid()),available_at=now() where id=r.id and status='COMPLETED';n:=n+1;
 end loop;return n;end$$;
revoke all on function public.queue_due_phase_o_standing() from public,anon,authenticated;
grant execute on function public.queue_due_phase_o_standing() to service_role;

-- Return one JSON snapshot so PostgREST row limits cannot truncate a purported full proof cohort.
create function public.conditional_proof_cohort(p_start timestamptz,p_end timestamptz) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$begin
 if p_start is null or p_end is null or p_end<=p_start or p_end>statement_timestamp() or p_end-p_start>interval '31 days' then raise exception 'CONDITIONAL_PERIOD_INVALID';end if;
 return (with cohort as(select state,created_at,updated_at from conditional_signal_setups where created_at>=p_start and created_at<p_end order by created_at,id limit 10001)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(cohort)),'[]'::jsonb),'total',count(*),'observed_at',statement_timestamp()) from cohort);
 end$$;
revoke all on function public.conditional_proof_cohort(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.conditional_proof_cohort(timestamptz,timestamptz) to service_role;
