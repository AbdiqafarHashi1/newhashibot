-- Content timing only. Trade signals and execution/risk policies are unchanged.
create table if not exists public.telegram_editorial_slots (
 work_id uuid primary key references public.signal_publication_work(id) on delete cascade,
 destination text not null check(destination in ('free','vip','vip_crypto','vip_forex_gold')),
 eligible_at timestamptz not null, granted_at timestamptz
);
create index if not exists telegram_editorial_slots_channel_grants on public.telegram_editorial_slots(destination,granted_at);
alter table public.telegram_editorial_slots enable row level security;
revoke all on public.telegram_editorial_slots from public,anon,authenticated;
grant all on public.telegram_editorial_slots to service_role;
create or replace function public.reserve_editorial_channel_slot(p_work uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.signal_publication_work; slot public.telegram_editorial_slots; due timestamptz; recent timestamptz; now_at timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into w from public.signal_publication_work where id=p_work and lease_token=p_lease and status='processing' and lease_expires_at>now_at for update;
 if not found or w.event_type<>'EDITORIAL' or w.destination not in('free','vip','vip_crypto','vip_forex_gold') then raise exception 'ACTIVE_EDITORIAL_LEASE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('editorial-spacing:'||w.destination,0));
 select * into slot from public.telegram_editorial_slots where work_id=p_work;
 if not found then
  -- Schedule once with 2–12 minute jitter. Concurrent sends share the same channel clock.
  select max(granted_at)+interval '2 hours' into due from public.telegram_editorial_slots where destination=w.destination;
  due:=greatest(now_at+interval '2 minutes'+random()*interval '10 minutes',coalesce(due,now_at));
  insert into public.telegram_editorial_slots(work_id,destination,eligible_at) values(p_work,w.destination,due) returning * into slot;
 end if;
 due:=slot.eligible_at;
 select max(granted_at)+interval '2 hours' into recent from public.telegram_editorial_slots where destination=w.destination and work_id<>p_work;
 due:=greatest(due,coalesce(recent,due));
 select max(updated_at)+interval '2 hours' into recent from public.signal_publication_work where destination=w.destination and event_type='EDITORIAL' and status='sent' and id<>p_work;
 due:=greatest(due,coalesce(recent,due));
 select max(updated_at)+interval '30 minutes' into recent from public.signal_publication_work where destination=w.destination and event_type<>'EDITORIAL' and status='sent';
 due:=greatest(due,coalesce(recent,due));
 -- Known queued/processing trade alerts win the race; no editorial delays a trade.
 if exists(select 1 from public.signal_publication_work where destination=w.destination and event_type<>'EDITORIAL' and status in('pending','processing','failed') and next_attempt_at<=now_at+interval '30 minutes' and attempt_count<5) then due:=greatest(due,now_at+interval '30 minutes');end if;
 if due>now_at then
  update public.telegram_editorial_slots set eligible_at=due where work_id=p_work;
  return jsonb_build_object('allowed',false,'next_attempt_at',due);
 end if;
 update public.telegram_editorial_slots set granted_at=coalesce(granted_at,now_at) where work_id=p_work;
 return jsonb_build_object('allowed',true,'next_attempt_at',now_at);
end$$;
revoke all on function public.reserve_editorial_channel_slot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_editorial_channel_slot(uuid,uuid) to service_role;
