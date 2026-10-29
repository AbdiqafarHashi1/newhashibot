-- Forward only. One lifecycle/paper ledger for Crypto and Forex/Gold, with independent watch health.
alter table public.conditional_signal_setups drop constraint conditional_signal_setups_symbol_check;
alter table public.conditional_signal_setups add constraint conditional_signal_setups_symbol_check check(symbol in('BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','XAUUSD'));
alter table public.conditional_signal_setups add column market text generated always as(case when symbol like '%USDT' then 'crypto' else 'forex' end) stored;
create index conditional_market_track on public.conditional_signal_setups(market,timeframe,created_at);
alter table public.conditional_free_samples add column market text not null default 'crypto' check(market in('crypto','forex'));
alter table public.conditional_free_samples drop constraint conditional_free_samples_pkey;
alter table public.conditional_free_samples add primary key(sample_day,market);

create table public.conditional_asset_watch(
 symbol text not null,timeframe text not null check(timeframe in('15m','1h')),market text not null check(market in('crypto','forex')),
 checked_at timestamptz not null,last_closed_at timestamptz,state text not null check(state in('HEALTHY','FEED_UNAVAILABLE','MARKET_CLOSED','DISCOVERY_PAUSED')),error text,
 primary key(symbol,timeframe)
);
alter table public.conditional_asset_watch enable row level security;
revoke all on public.conditional_asset_watch from public,anon,authenticated,service_role;
grant select on public.conditional_asset_watch to authenticated;
grant select,insert,update on public.conditional_asset_watch to service_role;
create policy conditional_watch_admin on public.conditional_asset_watch for select to authenticated using(public.is_admin());

-- Persist monotonic watch health and route technical failures to Admin once per changed incident.
create function public.record_conditional_watch_health(p_record jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior conditional_asset_watch; checked timestamptz; refs jsonb;begin
 checked:=(p_record->>'checked_at')::timestamptz;
 if checked is null or p_record->>'symbol' is null or p_record->>'timeframe' is null then raise exception 'INVALID_WATCH_HEALTH';end if;
 perform pg_advisory_xact_lock(hashtext('conditional-watch:'||(p_record->>'symbol')||':'||(p_record->>'timeframe')));
 select * into prior from conditional_asset_watch where symbol=p_record->>'symbol' and timeframe=p_record->>'timeframe' for update;
 if prior.checked_at>checked then return;end if;
 insert into conditional_asset_watch(symbol,timeframe,market,checked_at,last_closed_at,state,error)
 values(p_record->>'symbol',p_record->>'timeframe',p_record->>'market',checked,coalesce((p_record->>'last_closed_at')::timestamptz,prior.last_closed_at),p_record->>'state',p_record->>'error')
 on conflict(symbol,timeframe) do update set checked_at=excluded.checked_at,last_closed_at=excluded.last_closed_at,state=excluded.state,error=excluded.error;
 if p_record->>'state'='FEED_UNAVAILABLE' and (prior.state is distinct from 'FEED_UNAVAILABLE' or prior.error is distinct from p_record->>'error') then
  select coalesce(jsonb_agg(id),'[]') into refs from conditional_signal_setups where symbol=p_record->>'symbol' and timeframe=p_record->>'timeframe' and status in('WAITING','ARMED','ACTIVE');
  perform public.enqueue_canonical_lifecycle_event('watch-health:'||(p_record->>'symbol')||':'||(p_record->>'timeframe')||':'||checked::text||':'||md5(coalesce(p_record->>'error','')),'OPERATIONAL_INCIDENT',1,null,null,null,null,checked,
   jsonb_build_object('source','conditional-watch','details','Watch feed unavailable; outcomes unknown until source continuity is recovered.','watch',p_record,'setup_refs',refs),array['admin']);
 end if;
end$$;
revoke all on function public.record_conditional_watch_health(jsonb) from public,anon,authenticated;
grant execute on function public.record_conditional_watch_health(jsonb) to service_role;

create or replace function public.commit_conditional_signal_setup(p_state jsonb,p_expected_version integer,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.conditional_signal_setups; v integer; st text; k text; notify boolean; destinations text[]; sample boolean; v_market text; vip text; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit','fillAt','observedAt'];
begin
 perform pg_advisory_xact_lock(2961029); -- global cap, symbol ownership and transition/outbox share one transaction
 k:=p_state->>'id'; v:=(p_state->>'version')::integer; st:=p_state->>'status';
 v_market:=case when p_state->>'symbol' like '%USDT' then 'crypto' else 'forex' end;
 vip:=case when v_market='crypto' then 'vip_crypto' else 'vip_forex_gold' end;
 if coalesce(p_state->>'market',v_market)<>v_market then raise exception 'SETUP_MARKET_MISMATCH';end if;
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
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and timeframe=p_state->>'timeframe' and (status in('WAITING','ARMED','ACTIVE') or updated_at>now()-interval '4 hours')) then return false;end if;
  if exists(select 1 from signals where symbol=p_state->>'symbol' and status in('waiting','active')) then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and status in('WAITING','ARMED','ACTIVE') and state->>'side'<>p_state->>'side') then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and timeframe=p_state->>'timeframe' and status in('WAITING','ARMED','ACTIVE'))>=10 then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and timeframe=p_state->>'timeframe' and created_at>now()-interval '1 hour')>=3 then return false;end if;
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


create or replace function public.conditional_service_overview() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with scoped as(select state,market,created_at from conditional_signal_setups where public.is_admin() and (created_at>=now()-interval '31 days' or status in('WAITING','ARMED','ACTIVE'))),
 grouped as(select market,coalesce(state->>'track','UNKNOWN') as track,count(*) as total,
 count(*) filter(where state->>'status' in('WAITING','ARMED','ACTIVE')) as open,
 count(*) filter(where state->>'status'='DATA_GAP') as unknown,
 count(*) filter(where state->>'status'='CLOSED') as closed,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric>0) as wins,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric<0) as losses,
 count(*) filter(where state->>'status'='CLOSED' and (state->>'netR')::numeric=0) as break_even,
 count(*) filter(where state->>'status' in('EXPIRED','INVALIDATED')) as no_entry,
 coalesce(sum((state->>'netR')::numeric) filter(where state->>'status'='CLOSED'),0) as net_r,
 min(created_at) as first_created from scoped group by market,state->>'track')
 select jsonb_build_object('tracks',coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb),'scope','31-day creation cohort plus older open setups; modeled closed R sum, not account return','observed_at',now()) from grouped;
$$;
revoke all on function public.conditional_service_overview() from public,anon;
grant execute on function public.conditional_service_overview() to authenticated,service_role;


-- Add the independently authenticated watcher to the existing paused schedule controls.
create or replace function public.install_hashibot_release_schedules(p_actor uuid,p_project_url text,p_jobs jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb;secret_id uuid;job_id bigint;statement text;result jsonb:='[]';begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_project_url<>'https://uqiwbzfcntlcyyewawfc.supabase.co' or jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>16 then raise exception 'RELEASE_PROJECT_OR_JOB_SCOPE_INVALID';end if;
 update cron.job set active=false where jobname like 'hashibot_%';
 for j in select value from jsonb_array_elements(p_jobs) loop
  if j->>'endpoint' not in('scheduled-market-scanner','evaluate-signal-outcomes','binance-testnet-monitor','bybit-testnet-monitor','account-signal-authorization','phase-n-command-worker','canonical-reporting-worker','commerce-reconcile','telegram-membership','phase-o-worker','intelligence-engine','conditional-watch') or j->>'name'!~'^hashibot_[a-z0-9_]+$' or j->>'schedule' not in('* * * * *','*/5 * * * *') or j->>'header' not in('x-scanner-cron-secret','x-hashibot-cron-token','x-hashibot-internal-secret','Authorization','x-phase-o-worker-secret') or length(coalesce(j->>'token',''))<16 then raise exception 'RELEASE_JOB_CONFIGURATION_INVALID';end if;
  select id into secret_id from vault.secrets where name='release_'||(j->>'name');
  if secret_id is null then secret_id:=vault.create_secret(j->>'token','release_'||(j->>'name'),'HashiBot scheduled worker authorization');else perform vault.update_secret(secret_id,j->>'token');end if;
  statement:=format('select net.http_post(url := %L,headers := jsonb_build_object(''Content-Type'',''application/json'',%L,(select decrypted_secret from vault.decrypted_secrets where id=%L::uuid)),body := %L::jsonb,timeout_milliseconds := 90000);',p_project_url||'/functions/v1/'||(j->>'endpoint'),j->>'header',secret_id::text,coalesce(j->'body','{}'::jsonb)::text);
  select cron.schedule(j->>'name',j->>'schedule',statement) into job_id;perform cron.alter_job(job_id,active:=false);
  result:=result||jsonb_build_array(jsonb_build_object('name',j->>'name','job_id',job_id,'active',false));
 end loop;
 insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'RELEASE_SCHEDULES_INSTALLED_PAUSED',jsonb_build_object('jobs',result));return result;
end$$;
revoke all on function public.install_hashibot_release_schedules(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.install_hashibot_release_schedules(uuid,text,jsonb) to service_role;

create or replace function public.control_hashibot_release_schedule(p_actor uuid,p_name text default null,p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare names text[]:=ARRAY['hashibot_scheduled_market_scanner_5m','hashibot_outcomes_5m','hashibot_binance_monitor_1m','hashibot_bybit_monitor_1m','hashibot_account_authorization_1m','hashibot_account_commands_1m','hashibot_reporting_1m','hashibot_commerce_recovery_5m','hashibot_telegram_membership_1m','hashibot_agents_5m','hashibot_intelligence_5m','hashibot_conditional_watch_1m'];job_id bigint;result jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_enabled is not null then
  if p_name is null or not(p_name=any(names)) then raise exception 'KNOWN_RELEASE_SCHEDULE_REQUIRED';end if;
  select jobid into job_id from cron.job where jobname=p_name;if job_id is null then raise exception 'INSTALL_RELEASE_SCHEDULES_FIRST';end if;
  perform cron.alter_job(job_id,active:=p_enabled);
  insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'RELEASE_SCHEDULE_CONTROLLED',jsonb_build_object('name',p_name,'active',p_enabled));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',n,'job_id',j.jobid,'active',coalesce(j.active,false),'installed',j.jobid is not null,'schedule',j.schedule) order by n),'[]'::jsonb) into result from unnest(names) n left join cron.job j on j.jobname=n;
 return result;
end$$;
revoke all on function public.control_hashibot_release_schedule(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.control_hashibot_release_schedule(uuid,text,boolean) to service_role;
