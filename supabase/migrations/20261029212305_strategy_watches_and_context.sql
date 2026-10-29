-- Forward only: named-strategy conditional plans, scalp monitoring and administrator coverage evidence.
alter table public.conditional_signal_setups drop constraint conditional_signal_setups_timeframe_check;
alter table public.conditional_signal_setups add constraint conditional_signal_setups_timeframe_check check(timeframe in('5m','15m','1h','4h','1d'));
alter table public.conditional_asset_watch drop constraint conditional_asset_watch_timeframe_check;
alter table public.conditional_asset_watch add constraint conditional_asset_watch_timeframe_check check(timeframe in('5m','15m','1h','4h','1d'));
create table public.watched_strategy_observations(
 strategy_id text not null,symbol text not null,timeframe text not null,checked_at timestamptz not null,
 decision text not null check(decision in('DISABLED','INELIGIBLE','WATCH','HELD_CONTEXT','NO_SETUP')),reason text not null,evidence jsonb not null,
 primary key(strategy_id,symbol,timeframe)
);
alter table public.watched_strategy_observations enable row level security;
revoke all on public.watched_strategy_observations from public,anon,authenticated,service_role;
grant select on public.watched_strategy_observations to authenticated;
grant select,insert,update on public.watched_strategy_observations to service_role;
create policy watched_strategy_admin on public.watched_strategy_observations for select to authenticated using(public.is_admin());
create function public.record_watched_strategy_observations(p_rows jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise exception 'INVALID_STRATEGY_OBSERVATIONS';end if;
 insert into watched_strategy_observations(strategy_id,symbol,timeframe,checked_at,decision,reason,evidence)
 select strategy_id,symbol,timeframe,checked_at,decision,reason,evidence from jsonb_to_recordset(p_rows) as r(strategy_id text,symbol text,timeframe text,checked_at timestamptz,decision text,reason text,evidence jsonb)
 on conflict(strategy_id,symbol,timeframe) do update set checked_at=excluded.checked_at,decision=excluded.decision,reason=excluded.reason,evidence=excluded.evidence
 where excluded.checked_at>=watched_strategy_observations.checked_at and (
 watched_strategy_observations.decision is distinct from excluded.decision or watched_strategy_observations.reason is distinct from excluded.reason
 or watched_strategy_observations.evidence->'source_close' is distinct from excluded.evidence->'source_close'
 or watched_strategy_observations.evidence->'configuration' is distinct from excluded.evidence->'configuration'
 or watched_strategy_observations.evidence#>'{intelligence,newsSources}' is distinct from excluded.evidence#>'{intelligence,newsSources}');
end$$;
revoke all on function public.record_watched_strategy_observations(jsonb) from public,anon,authenticated;
grant execute on function public.record_watched_strategy_observations(jsonb) to service_role;
create function public.watched_strategy_coverage() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with grouped as(select strategy_id,max(evidence->>'strategy_version') version,max(checked_at) checked_at,
 count(*) streams,count(*) filter(where decision='WATCH') watches,count(*) filter(where decision='HELD_CONTEXT') held,
 count(*) filter(where decision='NO_SETUP') no_setup,count(*) filter(where decision='DISABLED') disabled,
 max((evidence#>'{configuration,allowed_timeframes}')::text)::jsonb supported_timeframes,array_agg(distinct timeframe order by timeframe) timeframes from watched_strategy_observations where public.is_admin() group by strategy_id)
 select jsonb_build_object('strategies',coalesce(jsonb_agg(to_jsonb(grouped) order by strategy_id),'[]'),'observed_at',now()) from grouped;
$$;
revoke all on function public.watched_strategy_coverage() from public,anon;
grant execute on function public.watched_strategy_coverage() to authenticated,service_role;

create or replace function public.commit_conditional_signal_setup(p_state jsonb,p_expected_version integer,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.conditional_signal_setups; v integer; st text; k text; notify boolean; destinations text[]; sample boolean; v_market text; vip text; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit','fillAt','observedAt','confirmationIntelligence'];
begin
 perform pg_advisory_xact_lock(2961029); -- global cap, symbol ownership and transition/outbox share one transaction
 k:=p_state->>'id'; v:=(p_state->>'version')::integer; st:=p_state->>'status';
 v_market:=case when p_state->>'symbol' like '%USDT' then 'crypto' else 'forex' end;
 vip:=case when v_market='crypto' then 'vip_crypto' else 'vip_forex_gold' end;
 if coalesce(p_state->>'market',v_market)<>v_market then raise exception 'SETUP_MARKET_MISMATCH';end if;
 if k is null or length(k)>240 or p_state->>'policy' is distinct from 'conditional-signals/v1' or v is null or p_expected_version is null or p_expected_version<0
  or p_state->>'side' is null or p_state->>'side' not in('buy','sell') or p_message is null or length(p_message)>6000
  or p_state->>'expiresAt' is null or p_state->>'lastBar' is null or p_state->>'trigger' is null or p_state->>'stop' is null or p_state->>'tp1' is null or p_state->>'tp2' is null
  or (p_state->>'track') is null or not ((p_state->>'track'='SCALP' and p_state->>'timeframe' in('5m','15m')) or(p_state->>'track'='INTRADAY' and p_state->>'timeframe' in('15m','1h')) or(p_state->>'track'='SWING' and p_state->>'timeframe' in('15m','1h','4h','1d')))
  or st is null or st not in('WAITING','ARMED','ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'INVALID_CONDITIONAL_STATE';end if;
 if not ((p_state->>'trigger')::numeric>0 and(p_state->>'stop')::numeric>0 and(p_state->>'tp1')::numeric>0 and(p_state->>'tp2')::numeric>0) then raise exception 'INVALID_SETUP_PRICES';end if;
 if not ((p_state->>'side'='buy' and(p_state->>'stop')::numeric<(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric<(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric<=(p_state->>'tp2')::numeric) or(p_state->>'side'='sell' and(p_state->>'stop')::numeric>(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric>(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric>=(p_state->>'tp2')::numeric)) then raise exception 'INVALID_SETUP_GEOMETRY';end if;
 if p_state ? 'origin' then
  if p_state#>>'{origin,plan,identity,strategy_id}' is distinct from p_state->>'strategy'
   or p_state#>>'{origin,plan,identity,strategy_version}' is distinct from p_state#>>'{origin,version}'
   or p_state#>>'{origin,plan,market_context,symbol}' is distinct from p_state->>'symbol'
   or p_state#>>'{origin,plan,market_context,timeframe}' is distinct from p_state->>'timeframe'
   or p_state#>'{origin,plan,risk_proposal,initial_stop}' is distinct from p_state->'stop'
   or p_state#>'{origin,plan,risk_proposal,tp1}' is distinct from p_state->'tp1'
   or p_state#>'{origin,plan,risk_proposal,tp2}' is distinct from p_state->'tp2'
   or p_state#>>'{intelligence,priceSource}' is distinct from p_state->>'source'
   or p_state#>>'{origin,plan,provenance,market_data_source}' is distinct from p_state->>'source'
   or p_state#>'{origin,plan,provenance,candle_boundary,closed_only}' is distinct from 'true'::jsonb
   or (case when p_state->>'side'='buy' then p_state#>'{origin,plan,entry_plan,zone,high}' else p_state#>'{origin,plan,entry_plan,zone,low}' end) is distinct from p_state->'trigger'
   or jsonb_typeof(p_state#>'{intelligence,sourceIds}') is distinct from 'array' then raise exception 'ORIGIN_STRATEGY_PLAN_MISMATCH';end if;
  if jsonb_array_length(p_state#>'{intelligence,sourceIds}')=0 then raise exception 'ORIGIN_SOURCE_EVIDENCE_REQUIRED';end if;
 end if;
 select * into old from conditional_signal_setups where id=k for update;
 if found then
  if old.version=v then if old.state=p_state then return true;else raise exception 'CONDITIONAL_CONTENT_CONFLICT';end if;end if;
  if old.version<>p_expected_version or v<>old.version+1 then return false;end if;
  if (old.state-mutable) is distinct from (p_state-mutable) then raise exception 'IMMUTABLE_SETUP_PLAN';end if;
  if old.state->>'fill' is not null and (old.state->'fill' is distinct from p_state->'fill' or old.state->'fillAt' is distinct from p_state->'fillAt') then raise exception 'IMMUTABLE_PAPER_ENTRY';end if;
  if old.status in('CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'TERMINAL_SETUP';end if;
  if not ((old.status='WAITING' and st in('WAITING','ARMED','EXPIRED','INVALIDATED','DATA_GAP')) or(old.status='ARMED' and st in('ACTIVE','CLOSED','INVALIDATED','DATA_GAP')) or(old.status='ACTIVE' and st in('ACTIVE','CLOSED','DATA_GAP'))) then raise exception 'INVALID_SETUP_TRANSITION';end if;
  if (p_state->>'lastBar')::timestamptz<=(old.state->>'lastBar')::timestamptz then
   -- A freshly observed next-open entry may precede that candle's close. No candle is invented.
   if not coalesce((old.status='ARMED' and st in('ACTIVE','INVALIDATED') and p_state->>'lastBar'=old.state->>'lastBar'
    and (p_state->>'observedAt')::timestamptz >= (old.state->>'armedAt')::timestamptz
    and (st='INVALIDATED' or (p_state->>'fillAt'=old.state->>'armedAt' and (p_state->>'fill')::numeric>0))),false) then raise exception 'NONCHRONOLOGICAL_SETUP';end if;
  end if;
  notify:=st<>old.status or coalesce((p_state->>'partial')::boolean,false)<>coalesce((old.state->>'partial')::boolean,false);
  update conditional_signal_setups set state=p_state,status=st,version=v,updated_at=now() where id=k;
 else
  if p_expected_version<>0 or v<>1 or st<>'WAITING' or (p_state->>'expiresAt')::timestamptz<=now() then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and timeframe=p_state->>'timeframe' and (status in('WAITING','ARMED','ACTIVE') or updated_at>now()-case when p_state->>'track'='SCALP' then interval '15 minutes' else interval '4 hours' end)) then return false;end if;
  if exists(select 1 from signals where symbol=p_state->>'symbol' and status in('waiting','active')) then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and status in('WAITING','ARMED','ACTIVE') and state->>'side'<>p_state->>'side') then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and state->>'track'=p_state->>'track' and status in('WAITING','ARMED','ACTIVE'))>=10 then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and state->>'track'=p_state->>'track' and created_at>now()-interval '1 hour')>=3 then return false;end if;
  insert into conditional_signal_setups(id,symbol,timeframe,status,version,state) values(k,p_state->>'symbol',p_state->>'timeframe',st,v,p_state);notify:=true;
 end if;
 -- The daily Free sample is selected at admission, before any outcome is known.
 if p_expected_version=0 and (p_state->>'score')::numeric>=80 then
  insert into conditional_free_samples(sample_day,market,setup_id) values((now() at time zone 'Africa/Nairobi')::date,v_market,k) on conflict do nothing;
 end if;
 sample:=exists(select 1 from conditional_free_samples where setup_id=k);
 destinations:=case when st='DATA_GAP' then array['admin'] when sample then array[vip,'free'] else array[vip] end;
 if notify then perform public.enqueue_canonical_lifecycle_event('conditional:'||k||':'||v,'CONDITIONAL_SETUP',1,null,null,null,null,now(),
  jsonb_build_object('market_type',v_market,'policy','conditional-signals/v1','setup_id',k,'setup_version',v,'state',p_state,'free_sample',sample,'message',p_message),destinations);end if;
 return true;
end$$;
revoke all on function public.commit_conditional_signal_setup(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.commit_conditional_signal_setup(jsonb,integer,text) to service_role;



-- Admission identity is reserved once; later snapshots never replace the original watch plan.
create function public.admit_conditional_signal_setup(p_state jsonb,p_message text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$begin
 perform pg_advisory_xact_lock(2961029);
 if exists(select 1 from conditional_signal_setups where id=p_state->>'id') then return false;end if;
 return public.commit_conditional_signal_setup(p_state,0,p_message);
end$$;
revoke all on function public.admit_conditional_signal_setup(jsonb,text) from public,anon,authenticated;
grant execute on function public.admit_conditional_signal_setup(jsonb,text) to service_role;

-- Extend only the former exact default; keep custom allowlists and disabled controls intact.
update public.strategy_configs set allowed_timeframes='["5m","15m"]'::jsonb
where strategy_name='ForexMicroScalper' and allowed_timeframes='["15m"]'::jsonb;
