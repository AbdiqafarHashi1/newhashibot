-- Forward only. Conditional research/analysis alerts never create executable signals or account orders.
create table public.conditional_signal_setups (
 id text primary key, symbol text not null check(symbol in('BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT')),
 timeframe text not null check(timeframe in('15m','1h')), status text not null check(status in('WAITING','ARMED','ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP')),
 version integer not null check(version>0), state jsonb not null, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index conditional_one_open_symbol on public.conditional_signal_setups(symbol) where status in('WAITING','ARMED','ACTIVE');
create index conditional_recent on public.conditional_signal_setups(updated_at desc);
alter table public.conditional_signal_setups enable row level security;
revoke all on public.conditional_signal_setups from public,anon,authenticated;
grant select on public.conditional_signal_setups to authenticated;
grant all on public.conditional_signal_setups to service_role;
create policy conditional_admin_read on public.conditional_signal_setups for select to authenticated using(public.is_admin());

create function public.commit_conditional_signal_setup(p_state jsonb,p_expected_version integer,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.conditional_signal_setups; v integer; st text; k text; notify boolean; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit'];
begin
 perform pg_advisory_xact_lock(2961029); -- global cap, symbol ownership and transition/outbox share one transaction
 k:=p_state->>'id'; v:=(p_state->>'version')::integer; st:=p_state->>'status';
 if k is null or length(k)>240 or p_state->>'policy' is distinct from 'conditional-signals/v1' or v is null or p_expected_version is null or p_expected_version<0
  or p_state->>'side' is null or p_state->>'side' not in('buy','sell') or p_message is null or length(p_message)>6000
  or p_state->>'expiresAt' is null or p_state->>'lastBar' is null or p_state->>'trigger' is null or p_state->>'stop' is null or p_state->>'tp1' is null or p_state->>'tp2' is null
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
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and (status in('WAITING','ARMED','ACTIVE') or updated_at>now()-interval '4 hours')) then return false;end if;
  if exists(select 1 from signals where symbol=p_state->>'symbol' and status in('waiting','active')) then return false;end if;
  if (select count(*) from conditional_signal_setups where status in('WAITING','ARMED','ACTIVE'))+(select count(*) from signals where symbol like '%USDT' and status in('waiting','active'))>=3 then return false;end if;
  if (select count(*) from conditional_signal_setups where created_at>now()-interval '1 hour')>=3 then return false;end if;
  insert into conditional_signal_setups(id,symbol,timeframe,status,version,state) values(k,p_state->>'symbol',p_state->>'timeframe',st,v,p_state);notify:=true;
 end if;
 if notify then perform public.enqueue_canonical_lifecycle_event('conditional:'||k||':'||v,'CONDITIONAL_SETUP',1,null,null,null,null,now(),
  jsonb_build_object('market_type','crypto','policy','conditional-signals/v1','setup_id',k,'setup_version',v,'state',p_state,'message',p_message),array['vip_crypto']);end if;
 return true;
end$$;
revoke all on function public.commit_conditional_signal_setup(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.commit_conditional_signal_setup(jsonb,integer,text) to service_role;
