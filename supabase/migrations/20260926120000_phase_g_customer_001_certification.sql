-- Phase G durable, account-scoped certification truth. No scheduler or provider call is installed.
create table if not exists public.customer_system_certification_runs(
 id uuid primary key default gen_random_uuid(), certification_reference text not null check(certification_reference='CUSTOMER_001'),
 customer_id uuid not null, execution_account_id uuid not null references public.connected_execution_accounts(id),
 account_type text not null check(account_type in('PERSONAL','PROP')), provider text not null check(provider in('MT5_PERSONAL','MT5_PROP','BINANCE','BYBIT')),
 environment text not null check((provider='BINANCE' and environment='TESTNET') or (provider<>'BINANCE' and environment='DEMO')),
 status text not null check(status in('CREATED','PRECHECK_RUNNING','PRECHECK_PASSED','PRECHECK_FAILED','EXECUTION_SUBMITTED','SUBMISSION_UNCERTAIN','RECONCILING','PARTIALLY_FILLED','FILLED_PROTECTION_PENDING','PROTECTED','PROTECTION_INCIDENT','RECOVERY_REQUIRED','SAFETY_CLOSE_PENDING','SAFETY_CLOSED','CLOSED','PASSED','FAILED','BLOCKED','NOT_RUN')),
 decision_id text, signal_id uuid, execution_intent_id text, execution_plan_id text, provider_client_order_id text,
 strategy_id text not null, strategy_version text not null, symbol text not null, side text not null check(side in('BUY','SELL')),
 requested_quantity numeric, submitted_quantity numeric check(submitted_quantity is null or submitted_quantity<=requested_quantity), authorized_risk_pct numeric,
 credential_capabilities jsonb not null default '{}', bridge_id uuid, normalization jsonb not null default '[]', provider_health text,
 protection_state text, protection_deadline_at timestamptz, reconciliation_state text, last_provider_evidence jsonb not null default '{}',
 reason_code text, started_at timestamptz not null default now(), completed_at timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(execution_account_id,execution_intent_id), unique(execution_account_id,execution_plan_id), unique(execution_account_id,provider_client_order_id)
);
create table if not exists public.customer_system_certification_checks(
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.customer_system_certification_runs(id) on delete cascade,
 customer_id uuid not null, execution_account_id uuid not null, check_code text not null, passed boolean not null, reason_code text, safe_evidence jsonb not null default '{}', checked_at timestamptz not null default now(), unique(run_id,check_code)
);
create table if not exists public.customer_system_certification_events(
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.customer_system_certification_runs(id) on delete cascade,
 customer_id uuid not null, execution_account_id uuid not null, event_type text not null, lifecycle_version integer not null,
 safe_payload jsonb not null default '{}', telegram_idempotency_key text not null unique, created_at timestamptz not null default now(), unique(run_id,event_type,lifecycle_version)
);
alter table public.customer_system_certification_runs enable row level security;
alter table public.customer_system_certification_checks enable row level security;
alter table public.customer_system_certification_events enable row level security;
create policy phase_g_runs_owner_read on public.customer_system_certification_runs for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_g_checks_owner_read on public.customer_system_certification_checks for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_g_events_owner_read on public.customer_system_certification_events for select to authenticated using(customer_id=auth.uid() or public.is_admin());
revoke all on public.customer_system_certification_runs,public.customer_system_certification_checks,public.customer_system_certification_events from anon;
grant select on public.customer_system_certification_runs,public.customer_system_certification_checks,public.customer_system_certification_events to authenticated;

create or replace function public.create_customer_001_certification_run(p_account_id uuid,p_decision_id text,p_plan_id text,p_client_order_id text,p_strategy_id text,p_strategy_version text,p_symbol text,p_side text,p_expires_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare a public.connected_execution_accounts; d public.execution_account_policy_decisions; result uuid; p text; env text;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into a from public.connected_execution_accounts where id=p_account_id for update; if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 select * into d from public.execution_account_policy_decisions where id=p_decision_id and execution_account_id=p_account_id for update;
 if not found or d.customer_id<>a.customer_id or d.decision not in('ALLOW','REDUCE') then raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE'; end if;
 p:=case when lower(a.provider)='mt5' and upper(a.account_mode)='PERSONAL' then 'MT5_PERSONAL' when lower(a.provider)='mt5' then 'MT5_PROP' else upper(a.provider) end; env:=upper(a.environment);
 if not ((p='BINANCE' and env='TESTNET') or (p in('MT5_PERSONAL','MT5_PROP','BYBIT') and env='DEMO')) then raise exception 'LIVE_EXECUTION_FORBIDDEN'; end if;
 insert into public.customer_system_certification_runs(certification_reference,customer_id,execution_account_id,account_type,provider,environment,status,decision_id,signal_id,execution_intent_id,execution_plan_id,provider_client_order_id,strategy_id,strategy_version,symbol,side,requested_quantity,submitted_quantity,authorized_risk_pct,expires_at)
 values('CUSTOMER_001',a.customer_id,a.id,case when upper(a.account_mode)='PERSONAL' then 'PERSONAL' else 'PROP' end,p,env,'CREATED',d.id,d.signal_id,d.intent_id,p_plan_id,p_client_order_id,p_strategy_id,p_strategy_version,p_symbol,p_side,d.approved_quantity,d.approved_quantity,d.authorized_risk_pct,p_expires_at) returning id into result; return result;
end $$;
revoke all on function public.create_customer_001_certification_run(uuid,text,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_customer_001_certification_run(uuid,text,text,text,text,text,text,text,timestamptz) to service_role;
