-- Phase E: bind Phase-D account decisions to the existing MT5 command queue.
-- No live route, executor, bridge protocol, protection engine, or Prop rules are introduced.

alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_provider_environment_check;
alter table public.connected_execution_accounts add constraint connected_execution_accounts_provider_environment_check check(
  (provider='binance' and lower(environment)='testnet') or (provider='bybit' and lower(environment)='demo') or
  (provider in('MT5_PERSONAL','MT5_PROP') and lower(environment)='demo')) not valid;

alter table public.execution_account_policy_decisions
  add column if not exists intent_id text,
  add column if not exists approved_quantity numeric;
create unique index if not exists execution_policy_intent_scope_uidx
  on public.execution_account_policy_decisions(execution_account_id,intent_id) where intent_id is not null;

create table if not exists public.mt5_account_execution_truth(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  execution_account_id uuid not null references public.connected_execution_accounts(id),
  mt5_account_id uuid not null references public.mt5_accounts(id),
  bridge_id text not null references public.mt5_bridge_registry(bridge_id),
  signal_id uuid not null,
  decision_id text not null references public.execution_account_policy_decisions(id),
  intent_id text not null,
  execution_plan_id text not null,
  command_id uuid references public.mt5_commands(id),
  provider_order_id text,
  provider_position_id text,
  policy_profile_id text not null,
  policy_version text not null,
  brain_version text not null,
  approved_quantity numeric not null check(approved_quantity>0),
  authorized_risk_pct numeric not null check(authorized_risk_pct>0),
  lifecycle_state text not null check(lifecycle_state in
    ('QUEUED','REJECTED','SUBMISSION_UNCERTAIN','PARTIALLY_FILLED','FILLED_PROTECTION_PENDING',
     'PROTECTED','PROTECTION_INCIDENT','RECONCILING','BREAKEVEN','TP1_PROTECTED','TP2_CLOSED')),
  incident_code text,
  lineage jsonb not null,
  last_provider_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(execution_account_id,intent_id), unique(mt5_account_id,execution_plan_id)
);
alter table public.mt5_account_execution_truth enable row level security;
create policy mt5_account_execution_truth_owner_read on public.mt5_account_execution_truth for select to authenticated
  using(customer_id=auth.uid() or public.is_admin());
revoke all on public.mt5_account_execution_truth from anon;
grant select on public.mt5_account_execution_truth to authenticated;

-- Service-only, atomic handoff. The pure Phase-E guard performs the same checks
-- before this RPC; these database checks make bypass or a cross-tenant insert fail closed.
create or replace function public.enqueue_phase_e_mt5_intent(
  p_decision_id text,p_execution_plan_id text,p_mt5_account_id uuid,p_bridge_id text,
  p_idempotency_key text,p_payload jsonb)
returns table(command_id uuid,status text) language plpgsql security definer set search_path=public as $$
declare d public.execution_account_policy_decisions; e public.connected_execution_accounts;
        a public.mt5_accounts; b public.mt5_bridge_registry; c public.mt5_commands;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into d from public.execution_account_policy_decisions where id=p_decision_id for update;
  if not found or d.decision not in('ALLOW','REDUCE') or d.intent_id is null or d.approved_quantity is null then
    raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE'; end if;
  select * into e from public.connected_execution_accounts where id=d.execution_account_id;
  select * into a from public.mt5_accounts where id=p_mt5_account_id for update;
  select * into b from public.mt5_bridge_registry where bridge_id=p_bridge_id;
  if e.customer_id<>d.customer_id or a.user_id<>d.customer_id or e.account_id<>a.id::text then raise exception 'MT5_ACCOUNT_SCOPE_MISMATCH'; end if;
  if e.provider not in('MT5_PERSONAL','MT5_PROP') or lower(e.environment)='live' then raise exception 'LIVE_EXECUTION_FORBIDDEN'; end if;
  if a.bridge_id is distinct from p_bridge_id or b.revoked_at is not null or b.lease_expires_at<=clock_timestamp()
     or b.status not in('online','healthy') then raise exception 'MT5_BRIDGE_OFFLINE'; end if;
  if not e.execution_enabled or not e.is_operational or not a.execution_enabled or not a.operational
     or a.provider_health<>'healthy' or a.last_heartbeat_at<clock_timestamp()-interval '45 seconds' then raise exception 'MT5_ACCOUNT_NOT_READY'; end if;
  if p_payload->>'phase_d_decision_id'<>d.id or p_payload->>'phase_d_intent_id'<>d.intent_id
     or p_payload->>'customer_id'<>d.customer_id::text or p_payload->>'execution_account_id'<>d.execution_account_id::text
     or (p_payload->>'quantity')::numeric<>d.approved_quantity or (p_payload->>'authorized_risk_pct')::numeric<>d.authorized_risk_pct
     or coalesce((p_payload->>'stop_loss')::numeric,0)<=0 then raise exception 'MT5_PHASE_E_LINEAGE_MISMATCH'; end if;
  insert into public.mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,signal_id)
  values(a.id,p_bridge_id,'OPEN_POSITION',p_payload,p_idempotency_key,'received',a.policy,d.signal_id)
  on conflict(account_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into c;
  insert into public.mt5_account_execution_truth(customer_id,execution_account_id,mt5_account_id,bridge_id,signal_id,
    decision_id,intent_id,execution_plan_id,command_id,policy_profile_id,policy_version,brain_version,
    approved_quantity,authorized_risk_pct,lifecycle_state,lineage)
  values(d.customer_id,d.execution_account_id,a.id,p_bridge_id,d.signal_id,d.id,d.intent_id,p_execution_plan_id,c.id,
    d.policy_profile_id,d.policy_version,d.brain_version,d.approved_quantity,d.authorized_risk_pct,'QUEUED',
    jsonb_build_object('signal_id',d.signal_id,'decision_id',d.id,'intent_id',d.intent_id,'execution_plan_id',p_execution_plan_id,
      'command_id',c.id,'customer_id',d.customer_id,'execution_account_id',d.execution_account_id))
  on conflict(execution_account_id,intent_id) do update set updated_at=public.mt5_account_execution_truth.updated_at;
  return query select c.id,c.status;
end $$;
revoke all on function public.enqueue_phase_e_mt5_intent(text,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_phase_e_mt5_intent(text,text,uuid,text,text,jsonb) to service_role;

-- A confirmed fill is never represented as success until protection is observed.
create or replace function public.record_phase_e_mt5_lifecycle(
  p_command_id uuid,p_account_id uuid,p_bridge_id text,p_event text,p_evidence jsonb default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare t public.mt5_account_execution_truth; next_state text; incident text;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into t from public.mt5_account_execution_truth where command_id=p_command_id and mt5_account_id=p_account_id and bridge_id=p_bridge_id for update;
  if not found then raise exception 'MT5_COMMAND_SCOPE_MISMATCH'; end if;
  next_state:=case p_event when 'ORDER_REJECTED' then 'REJECTED' when 'SUBMISSION_UNCERTAIN' then 'SUBMISSION_UNCERTAIN'
    when 'PARTIAL_FILL' then 'PARTIALLY_FILLED' when 'FILL_CONFIRMED' then 'FILLED_PROTECTION_PENDING'
    when 'PROTECTION_CONFIRMED' then 'PROTECTED' when 'PROTECTION_MISSING' then 'PROTECTION_INCIDENT'
    when 'PROTECTION_FAILED' then 'PROTECTION_INCIDENT' when 'RECONCILIATION_STARTED' then 'RECONCILING'
    when 'TP1_FILLED' then 'TP1_PROTECTED' when 'BREAKEVEN_CONFIRMED' then 'BREAKEVEN'
    when 'TP2_FILLED' then 'TP2_CLOSED' else null end;
  if next_state is null then raise exception 'MT5_LIFECYCLE_EVENT_INVALID'; end if;
  incident:=case when next_state='PROTECTION_INCIDENT' then p_event else null end;
  update public.mt5_account_execution_truth set lifecycle_state=next_state,incident_code=incident,
    provider_order_id=coalesce(p_evidence->>'provider_order_id',provider_order_id),
    provider_position_id=coalesce(p_evidence->>'provider_position_id',provider_position_id),
    last_provider_evidence=p_evidence,updated_at=clock_timestamp() where id=t.id;
end $$;
revoke all on function public.record_phase_e_mt5_lifecycle(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_phase_e_mt5_lifecycle(uuid,uuid,text,text,jsonb) to service_role;
