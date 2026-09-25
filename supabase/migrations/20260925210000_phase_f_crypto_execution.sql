-- Phase F account-scoped projection over the existing certified crypto worker,
-- provider order bindings, trade manager, protection verifier and recovery path.
create table if not exists public.crypto_account_execution_truth(
  id uuid primary key default gen_random_uuid(), customer_id uuid not null,
  execution_account_id uuid not null references public.connected_execution_accounts(id),
  provider text not null check(provider in('BINANCE','BYBIT')),
  environment text not null check((provider='BINANCE' and environment='TESTNET') or (provider='BYBIT' and environment='DEMO')),
  signal_id uuid not null, decision_id text not null references public.execution_account_policy_decisions(id),
  intent_id text not null, execution_plan_id text not null, deterministic_client_order_id text not null,
  provider_order_id text, provider_position_id text, symbol text not null,
  requested_quantity numeric not null check(requested_quantity>0), submitted_quantity numeric not null check(submitted_quantity>0 and submitted_quantity<=requested_quantity),
  requested_price numeric not null check(requested_price>0), submitted_price numeric not null check(submitted_price>0),
  authorized_risk_pct numeric not null check(authorized_risk_pct>0), normalization jsonb not null default '[]',
  lifecycle_state text not null check(lifecycle_state in('ENTRY_SUBMITTED','SUBMISSION_UNCERTAIN','RECONCILING','REJECTED','PARTIALLY_FILLED','ENTRY_FILLED','PROTECTION_PENDING','PROTECTION_VERIFIED','PROTECTION_INCIDENT','SAFETY_CLOSING','TP1_FILLED','BREAKEVEN','PROFIT_LOCKED','TRAILING','CLOSED')),
  incident_code text, lineage jsonb not null, last_provider_evidence jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(execution_account_id,intent_id), unique(execution_account_id,deterministic_client_order_id),
  unique(execution_account_id,execution_plan_id)
);
alter table public.crypto_account_execution_truth enable row level security;
create policy crypto_account_execution_truth_owner_read on public.crypto_account_execution_truth for select to authenticated using(customer_id=auth.uid() or public.is_admin());
revoke all on public.crypto_account_execution_truth from anon; grant select on public.crypto_account_execution_truth to authenticated;

create or replace function public.record_phase_f_crypto_submission(p_decision_id text,p_execution_plan_id text,p_client_order_id text,p_symbol text,p_requested_quantity numeric,p_submitted_quantity numeric,p_requested_price numeric,p_submitted_price numeric,p_normalization jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare d public.execution_account_policy_decisions; a public.connected_execution_accounts; result uuid;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into d from public.execution_account_policy_decisions where id=p_decision_id for update;
 if not found or d.decision not in('ALLOW','REDUCE') or d.intent_id is null or d.approved_quantity is null then raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE'; end if;
 select * into a from public.connected_execution_accounts where id=d.execution_account_id for update;
 if not found or a.customer_id<>d.customer_id then raise exception 'CRYPTO_ACCOUNT_SCOPE_MISMATCH'; end if;
 if not ((lower(a.provider)='binance' and upper(a.environment)='TESTNET') or (lower(a.provider)='bybit' and upper(a.environment)='DEMO')) then raise exception 'LIVE_EXECUTION_FORBIDDEN'; end if;
 if not a.enabled or not a.execution_enabled or not a.is_operational or upper(a.provider_health)<>'HEALTHY' then raise exception 'PROVIDER_ROUTE_NOT_READY'; end if;
 if p_requested_quantity<>d.approved_quantity or p_submitted_quantity>p_requested_quantity then raise exception 'PHASE_D_QUANTITY_LINEAGE_MISMATCH'; end if;
 insert into public.crypto_account_execution_truth(customer_id,execution_account_id,provider,environment,signal_id,decision_id,intent_id,execution_plan_id,deterministic_client_order_id,symbol,requested_quantity,submitted_quantity,requested_price,submitted_price,authorized_risk_pct,normalization,lifecycle_state,lineage)
 values(d.customer_id,d.execution_account_id,upper(a.provider),upper(a.environment),d.signal_id,d.id,d.intent_id,p_execution_plan_id,p_client_order_id,p_symbol,p_requested_quantity,p_submitted_quantity,p_requested_price,p_submitted_price,d.authorized_risk_pct,p_normalization,'ENTRY_SUBMITTED',jsonb_build_object('signal_id',d.signal_id,'decision_id',d.id,'intent_id',d.intent_id,'execution_plan_id',p_execution_plan_id,'customer_id',d.customer_id,'execution_account_id',d.execution_account_id))
 on conflict(execution_account_id,intent_id) do update set updated_at=public.crypto_account_execution_truth.updated_at returning id into result;
 return result;
end $$;
revoke all on function public.record_phase_f_crypto_submission(text,text,text,text,numeric,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.record_phase_f_crypto_submission(text,text,text,text,numeric,numeric,numeric,numeric,jsonb) to service_role;

create or replace function public.record_phase_f_crypto_lifecycle(p_execution_account_id uuid,p_client_order_id text,p_event text,p_evidence jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare t public.crypto_account_execution_truth; next_state text;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into t from public.crypto_account_execution_truth where execution_account_id=p_execution_account_id and deterministic_client_order_id=p_client_order_id for update;
 if not found then raise exception 'CRYPTO_ORDER_SCOPE_MISMATCH'; end if;
 next_state:=case p_event when 'ORDER_REJECTED' then 'REJECTED' when 'SUBMISSION_UNCERTAIN' then 'SUBMISSION_UNCERTAIN' when 'RECONCILIATION_STARTED' then 'RECONCILING' when 'PARTIAL_FILL' then 'PARTIALLY_FILLED' when 'ENTRY_FILLED' then 'ENTRY_FILLED' when 'PROTECTION_REQUESTED' then 'PROTECTION_PENDING' when 'PROTECTION_VERIFIED' then 'PROTECTION_VERIFIED' when 'PROTECTION_MISSING' then 'PROTECTION_INCIDENT' when 'PROTECTION_FAILED' then 'PROTECTION_INCIDENT' when 'SAFETY_CLOSE_REQUESTED' then 'SAFETY_CLOSING' when 'TP1_FILLED' then 'TP1_FILLED' when 'BREAKEVEN_CONFIRMED' then 'BREAKEVEN' when 'PROFIT_LOCK_CONFIRMED' then 'PROFIT_LOCKED' when 'TRAILING_ACTIVE' then 'TRAILING' when 'TP2_FILLED' then 'CLOSED' when 'TERMINAL_EXIT' then 'CLOSED' else null end;
 if next_state is null then raise exception 'CRYPTO_LIFECYCLE_EVENT_INVALID'; end if;
 if p_event='PROTECTION_VERIFIED' and t.lifecycle_state not in('PROTECTION_PENDING','PROTECTION_INCIDENT','RECONCILING') then raise exception 'PROTECTION_VERIFICATION_OUT_OF_SEQUENCE'; end if;
 update public.crypto_account_execution_truth set lifecycle_state=next_state,incident_code=case when next_state='PROTECTION_INCIDENT' then p_event else incident_code end,provider_order_id=coalesce(p_evidence->>'provider_order_id',provider_order_id),provider_position_id=coalesce(p_evidence->>'provider_position_id',provider_position_id),last_provider_evidence=p_evidence,updated_at=clock_timestamp() where id=t.id;
end $$;
revoke all on function public.record_phase_f_crypto_lifecycle(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_phase_f_crypto_lifecycle(uuid,text,text,jsonb) to service_role;
