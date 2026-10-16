-- Atomic account/provider observations, not an executor or certification override.
create table public.canonical_monitor_observations(
 id text primary key,customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 execution_plan_id text not null,observed_at timestamptz not null,evidence jsonb not null,created_at timestamptz not null default now()
);
alter table public.canonical_monitor_observations enable row level security;
revoke all on public.canonical_monitor_observations from public,anon,authenticated;
grant select on public.canonical_monitor_observations to authenticated;
create policy monitor_observations_owner_read on public.canonical_monitor_observations for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());
create function public.prevent_monitor_evidence_mutation() returns trigger language plpgsql set search_path=public as $$begin raise exception 'IMMUTABLE_MONITOR_EVIDENCE';end$$;
create trigger monitor_evidence_immutable before update or delete on public.canonical_monitor_observations for each row execute function public.prevent_monitor_evidence_mutation();
revoke all on function public.prevent_monitor_evidence_mutation() from public,anon,authenticated;
alter table public.crypto_account_execution_truth add column if not exists entry_observed_at timestamptz;
create function public.record_canonical_monitor_observation(p_customer_id uuid,p_account_id uuid,p_plan_id text,p_observation jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare a public.connected_execution_accounts;t public.crypto_account_execution_truth; r public.execution_orders; at timestamptz;q numeric;n integer;new_state text;gstate text;key text;old jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or not ((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider)='BYBIT' and upper(a.environment)='DEMO')) then raise exception 'MONITOR_ACCOUNT_SCOPE';end if;
 select * into t from public.crypto_account_execution_truth where execution_account_id=a.id and customer_id=a.customer_id and execution_plan_id=p_plan_id for update;
 if not found or t.provider is distinct from upper(a.provider) or t.environment is distinct from upper(a.environment) then raise exception 'MONITOR_TRUTH_SCOPE';end if;
 if p_observation->>'schema_version' is distinct from 'canonical-monitor-observation/v1' then raise exception 'MONITOR_SCHEMA_REQUIRED';end if;
 at:=(p_observation->>'observed_at')::timestamptz;q:=(p_observation->>'position_quantity')::numeric;n:=(p_observation->>'open_order_count')::integer;
 if at is null or at>clock_timestamp()+interval '5 seconds' or at<clock_timestamp()-interval '2 minutes' or q is null or q<0 or q='NaN'::numeric or n is null or n<0 then raise exception 'MONITOR_OBSERVATION_INVALID';end if;
 select * into r from public.execution_orders where id::text=p_observation->>'execution_order_id' and customer_id=a.customer_id and account_id::text=a.id::text and raw_exchange_response->>'certified_execution_plan_id'=p_plan_id and execution_scope_key=p_observation->>'execution_scope_key';
 if not found or r.symbol is distinct from t.symbol or nullif(p_observation->>'execution_scope_key','') is null then raise exception 'MONITOR_ORDER_SCOPE';end if;
 key:=md5(a.id::text||':'||p_plan_id||':'||at::text);
 select evidence into old from public.canonical_monitor_observations where id=key;
 if found then if old is distinct from p_observation then raise exception 'MONITOR_CONTENT_CONFLICT';end if;return t.lifecycle_state;end if;
 if at<coalesce((t.last_provider_evidence->>'observed_at')::timestamptz,t.created_at) then raise exception 'MONITOR_STALE_SEQUENCE';end if;
 if p_observation->>'entry_verified'='true' and (p_observation->'entry_evidence'->>'id' is distinct from p_observation->>'entry_provider_order_id' or p_observation->'entry_evidence'->>'symbol' is distinct from t.symbol or not coalesce(p_observation->'entry_evidence'->>'status' in('FILLED','PARTIALLY_FILLED'),false) or (p_observation->'entry_evidence'->>'filledQuantity')::numeric is null or (p_observation->'entry_evidence'->>'filledQuantity')::numeric<=0 or (p_observation->'entry_evidence'->>'filledQuantity')::numeric='NaN'::numeric or (p_observation->'entry_evidence'->>'filledQuantity')::numeric>t.submitted_quantity or p_observation->'entry_evidence'->>'side' is distinct from case when lower(r.direction) in('buy','long') then 'BUY' when lower(r.direction) in('sell','short') then 'SELL' else null end) then raise exception 'MONITOR_ENTRY_EVIDENCE_INVALID';end if;
 if q>0 and (q>t.submitted_quantity or p_observation->>'position_side' is distinct from case when lower(r.direction) in('buy','long') then 'BUY' when lower(r.direction) in('sell','short') then 'SELL' else null end) then raise exception 'MONITOR_POSITION_LINEAGE';end if;
 new_state:=case
 when t.lifecycle_state in('CLOSED','REJECTED') then t.lifecycle_state
 when q=0 and n=0 and t.entry_observed_at is not null then 'CLOSED'
 when q=0 or (t.entry_observed_at is null and p_observation->>'entry_verified' is distinct from 'true') then 'RECONCILING'
 when p_observation->>'safety_close_pending'='true' then 'SAFETY_CLOSING'
 when p_observation->>'protection_verified'='true' and r.sl_confirmed is true and r.tp2_confirmed is true and (r.tp1_confirmed is true or r.tp1_status='filled') then 'PROTECTION_VERIFIED'
 else 'PROTECTION_INCIDENT' end;
 insert into public.canonical_monitor_observations(id,customer_id,execution_account_id,execution_plan_id,observed_at,evidence) values(key,a.customer_id,a.id,p_plan_id,at,p_observation);
 update public.crypto_account_execution_truth set lifecycle_state=new_state,entry_observed_at=case when p_observation->>'entry_verified'='true' then coalesce(entry_observed_at,at) else entry_observed_at end,last_provider_evidence=p_observation,updated_at=clock_timestamp() where id=t.id;
 gstate:=case new_state when 'CLOSED' then 'CLOSED' when 'PROTECTION_VERIFIED' then 'PROTECTED' when 'SAFETY_CLOSING' then 'SAFETY_CLOSE_PENDING' when 'PROTECTION_INCIDENT' then 'PROTECTION_INCIDENT' else 'RECONCILING' end;
 update public.customer_system_certification_runs set status=gstate,protection_state=case when new_state='PROTECTION_VERIFIED' then 'VERIFIED' when new_state='PROTECTION_INCIDENT' then 'INCIDENT' else protection_state end,last_provider_evidence=p_observation,updated_at=clock_timestamp()
 where customer_id=a.customer_id and execution_account_id=a.id and execution_plan_id=p_plan_id and status not in('PASSED','FAILED','BLOCKED','PRECHECK_FAILED');
 return new_state;
end$$;
revoke all on function public.record_canonical_monitor_observation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_canonical_monitor_observation(uuid,uuid,text,jsonb) to service_role;
