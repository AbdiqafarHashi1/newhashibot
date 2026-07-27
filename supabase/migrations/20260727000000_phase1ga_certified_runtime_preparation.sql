-- PHASE 1G-A PREPARATION ONLY. Applying migrations and enabling execution remain
-- explicit Phase 1G-B operator actions. This migration never creates a cron job.

create table if not exists public.certified_runtime_claims (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id text not null,
  account_id text not null,
  idempotency_key text not null,
  owner text not null,
  state text not null check (state in ('claimed','completed','released')),
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  completed_at timestamptz,
  unique (account_id, idempotency_key)
);

create table if not exists public.certified_runtime_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  execution_plan_id text not null,
  account_id text not null,
  sequence bigint generated always as identity,
  event_type text not null,
  normalized_status text not null check (normalized_status in ('planned','claimed','submitted','acknowledged','partially_filled','filled','protected','recovery_required','rejected','failed','closed','archived')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (execution_plan_id, sequence)
);

alter table public.certified_runtime_claims enable row level security;
alter table public.certified_runtime_events enable row level security;

create table if not exists public.certified_strategy_plans (
  evaluation_id text primary key,
  candidate_id uuid not null,
  scanner_run_id uuid not null,
  arbitration_decision_key text not null,
  strategy_id text not null,
  strategy_version text not null,
  canonical_side text not null check (canonical_side in ('BUY','SELL')),
  symbol text not null,
  market text not null check (market in ('CRYPTO','FOREX','GOLD')),
  strategy_plan jsonb not null,
  persisted_at timestamptz not null default now(),
  unique (candidate_id, arbitration_decision_key)
);
alter table public.certified_strategy_plans enable row level security;
revoke all on public.certified_strategy_plans from anon, authenticated;

-- One versioned policy extension over existing accounts. certified_context holds
-- only static certified RiskPolicy/contract/routing/capability structures;
-- balances, P&L, exposure and freshness continue to come from monitor proof.
create table if not exists public.certified_execution_account_policies (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null,
  execution_profile_id uuid not null, provider text not null check(provider in ('BINANCE','BYBIT','MT5_PERSONAL','MT5_PROP')),
  environment text not null check(environment in ('TESTNET','DEMO')), account_id text not null,
  policy_version text not null, current boolean not null default false, enabled boolean not null default false, adoption_enabled boolean not null default false,
  risk_percentage numeric not null, maximum_risk_cap numeric not null, daily_loss_limit numeric not null,
  weekly_loss_limit numeric not null, drawdown_limit numeric not null, maximum_concurrent_positions integer not null,
  maximum_account_exposure numeric not null, maximum_symbol_exposure numeric not null, leverage_ceiling numeric not null,
  minimum_signal_grade text not null, allowed_strategy_ids text[] not null, allowed_symbols text[] not null,
  cooldown_policy jsonb not null, protection_policy jsonb not null, certified_context jsonb not null,
  changed_by uuid not null, changed_at timestamptz not null default now(), prior_policy_id uuid references public.certified_execution_account_policies(id),
  unique(customer_id,execution_profile_id,provider,environment,account_id,policy_version)
);
alter table public.certified_execution_account_policies enable row level security;
create unique index certified_execution_account_one_current on public.certified_execution_account_policies(customer_id,execution_profile_id,provider,environment,account_id) where current;
revoke all on public.certified_execution_account_policies from anon, authenticated;

create table if not exists public.certified_execution_adoption_policies (
  id uuid primary key default gen_random_uuid(), account_id text not null, provider text not null,
  environment text not null check(environment in ('TESTNET','DEMO')), version text not null,
  current boolean not null default false, enabled boolean not null default false, rollout_percentage numeric not null default 0 check(rollout_percentage between 0 and 100),
  policy jsonb not null, changed_by uuid not null, changed_at timestamptz not null default now(),
  unique(account_id,provider,environment,version)
);
alter table public.certified_execution_adoption_policies enable row level security;
create unique index certified_execution_adoption_one_current on public.certified_execution_adoption_policies(account_id,provider,environment) where current;
revoke all on public.certified_execution_adoption_policies from anon, authenticated;

alter table public.execution_account_runtime_proof add column if not exists certified_truth jsonb, add column if not exists certified_adoption_truth jsonb;
alter table public.mt5_account_snapshots add column if not exists certified_truth jsonb, add column if not exists certified_adoption_truth jsonb;

create table if not exists public.certified_runtime_artifacts (
  id uuid primary key default gen_random_uuid(), evaluation_id text not null, account_id text not null,
  strategy_plan_id text not null, risk_decision jsonb not null, capital_allocation_plan jsonb,
  execution_plan jsonb, execution_attempt jsonb, created_at timestamptz not null default now(), unique(evaluation_id,account_id)
);
alter table public.certified_runtime_artifacts enable row level security;
revoke all on public.certified_runtime_artifacts from anon, authenticated;

create table if not exists public.certified_provider_order_bindings (
  provider text not null, account_id text not null, execution_plan_id text not null,
  attempt_number integer not null, deterministic_client_id text not null, provider_order_id text not null,
  strategy_plan_id text not null, risk_decision_id text not null, allocation_id text not null,
  canonical_side text not null check(canonical_side in('BUY','SELL')), created_at timestamptz not null default now(),
  primary key(provider,account_id,deterministic_client_id)
);
alter table public.certified_provider_order_bindings enable row level security;
revoke all on public.certified_provider_order_bindings from anon,authenticated;

create or replace view public.certified_execution_account_latest as
select distinct on(a.account_id) a.account_id,p.customer_id,p.execution_profile_id,p.provider,p.environment,
 p.policy_version,p.risk_percentage,(coalesce(r.certified_truth,s.certified_truth)->>'balance')::numeric balance,
 (coalesce(r.certified_truth,s.certified_truth)->>'equity')::numeric equity,
 coalesce(r.certified_truth,s.certified_truth)->>'observed_at' observed_at,
 a.risk_decision,a.capital_allocation_plan,a.execution_plan,a.execution_attempt,b.provider_order_id,e.normalized_status,
 coalesce(r.certified_adoption_truth,s.certified_adoption_truth)->>'protection_result' protection_result
from certified_runtime_artifacts a join certified_execution_account_policies p on p.account_id=a.account_id and p.current
left join execution_account_runtime_proof r on r.account_id=a.account_id
left join lateral(select certified_truth,certified_adoption_truth from mt5_account_snapshots where account_id::text=a.account_id order by captured_at desc limit 1)s on true
left join certified_provider_order_bindings b on b.execution_plan_id=a.execution_plan->>'execution_plan_id'
left join lateral(select normalized_status from certified_runtime_events x where x.execution_plan_id=a.execution_plan->>'execution_plan_id' order by sequence desc limit 1)e on true
order by a.account_id,a.created_at desc;

create or replace function public.load_certified_execution_account_truth(p_strategy_id text,p_symbol text,p_evaluated_at timestamptz)
returns setof jsonb language sql security definer set search_path=public as $$
  select p.certified_context || r.certified_truth || jsonb_build_object(
    'schema_version','certified-account-truth/v1','customer_id',p.customer_id,'execution_profile_id',p.execution_profile_id,
    'account_id',p.account_id,'provider',p.provider,'environment',p.environment,'policy_version',p.policy_version,
    'enabled',p.enabled,'adoption_enabled',(p.adoption_enabled and ap.enabled and ap.rollout_percentage>0),'adoption_policy_version',ap.version,'risk_percent',p.risk_percentage,'leverage_ceiling',p.leverage_ceiling,
    'allowed_strategy_ids',p.allowed_strategy_ids,'allowed_symbols',p.allowed_symbols,'minimum_signal_grade',p.minimum_signal_grade)
  from certified_execution_account_policies p
  join connected_execution_accounts a on upper(a.provider)=p.provider and upper(a.environment)=p.environment and a.account_id=p.account_id and a.customer_id=p.customer_id
  join execution_account_runtime_proof r on r.account_id=p.account_id and r.customer_id=p.customer_id and upper(r.provider)=p.provider
  join certified_execution_adoption_policies ap on ap.account_id=p.account_id and ap.provider=p.provider and ap.environment=p.environment
  where p.current and ap.current and p.enabled and p.adoption_enabled and ap.enabled and ap.rollout_percentage>0 and a.enabled and p_strategy_id=any(p.allowed_strategy_ids)
    and (cardinality(p.allowed_symbols)=0 or p_symbol=any(p.allowed_symbols)) and r.certified_truth is not null
  union all
  select p.certified_context || s.certified_truth || jsonb_build_object(
    'schema_version','certified-account-truth/v1','customer_id',p.customer_id,'execution_profile_id',p.execution_profile_id,
    'account_id',p.account_id,'provider',p.provider,'environment',p.environment,'policy_version',p.policy_version,
    'enabled',p.enabled,'adoption_enabled',(p.adoption_enabled and ap.enabled and ap.rollout_percentage>0),'adoption_policy_version',ap.version,'risk_percent',p.risk_percentage,'leverage_ceiling',p.leverage_ceiling,
    'allowed_strategy_ids',p.allowed_strategy_ids,'allowed_symbols',p.allowed_symbols,'minimum_signal_grade',p.minimum_signal_grade)
  from certified_execution_account_policies p join mt5_accounts a on a.id::text=p.account_id and a.user_id=p.customer_id
  join certified_execution_adoption_policies ap on ap.account_id=p.account_id and ap.provider=p.provider and ap.environment=p.environment
  join lateral(select * from mt5_account_snapshots x where x.account_id=a.id and x.certified_truth is not null order by captured_at desc limit 1)s on true
  where p.current and ap.current and p.provider in('MT5_PERSONAL','MT5_PROP') and p.enabled and p.adoption_enabled and ap.enabled and ap.rollout_percentage>0 and a.execution_enabled
    and p_strategy_id=any(p.allowed_strategy_ids) and (cardinality(p.allowed_symbols)=0 or p_symbol=any(p.allowed_symbols));
$$;
revoke all on function public.load_certified_execution_account_truth(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.load_certified_execution_account_truth(text,text,timestamptz) to service_role;

create or replace function public.claim_certified_execution(p_execution_plan_id text,p_account_id text,p_requests jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; result jsonb='{}'; existing certified_runtime_claims; outcome text;
begin
 for item in select * from jsonb_array_elements(p_requests) loop
  select * into existing from certified_runtime_claims where idempotency_key=item->>'key' for update;
  if existing.id is null then
   insert into certified_runtime_claims(execution_plan_id,account_id,idempotency_key,owner,state,claimed_at,lease_expires_at)
   values(p_execution_plan_id,p_account_id,item->>'key',item->>'owner','claimed',(item->>'now')::timestamptz,(item->>'lease_expires_at')::timestamptz);
   outcome='ACQUIRED';
  elsif existing.state='completed' then outcome='COMPLETED_NOOP';
  elsif existing.lease_expires_at < (item->>'now')::timestamptz then update certified_runtime_claims set owner=item->>'owner',claimed_at=(item->>'now')::timestamptz,lease_expires_at=(item->>'lease_expires_at')::timestamptz where id=existing.id; outcome='RECOVERED_STALE';
  else outcome='CONFLICT'; end if;
  result=result||jsonb_build_object(item->>'key',jsonb_build_object('outcome',outcome,'claim_token',case when outcome in('ACQUIRED','RECOVERED_STALE') then item->>'key' end,'existing_owner',existing.owner));
 end loop; return result;
end$$;
revoke all on function public.claim_certified_execution(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_certified_execution(text,text,jsonb) to service_role;

create or replace function public.load_certified_adoption_truth(p_execution_plan_id text) returns jsonb language sql security definer set search_path=public as $$
 select coalesce(r.certified_adoption_truth,s.certified_adoption_truth)
 from certified_runtime_artifacts a
 left join execution_account_runtime_proof r on r.account_id=a.account_id
 left join lateral(select certified_adoption_truth from mt5_account_snapshots where account_id::text=a.account_id order by captured_at desc limit 1)s on true
 where (a.execution_plan->>'execution_plan_id')=p_execution_plan_id limit 1;
$$;
revoke all on function public.load_certified_adoption_truth(text) from public,anon,authenticated;
grant execute on function public.load_certified_adoption_truth(text) to service_role;

-- Service-role writes are deliberate. Authenticated users receive account-owned,
-- read-only truth; no browser policy can claim or append execution state.
create policy certified_runtime_events_account_read on public.certified_runtime_events
for select to authenticated using (
  exists (select 1 from public.connected_execution_accounts a where a.account_id = certified_runtime_events.account_id and a.customer_id = auth.uid())
);

create or replace view public.certified_runtime_latest as
select distinct on (execution_plan_id) execution_plan_id, account_id, normalized_status,
       event_type, payload, occurred_at, recorded_at
from public.certified_runtime_events
order by execution_plan_id, sequence desc;

comment on table public.certified_runtime_events is
'Prepared append-only Phase 1G-A execution truth. Do not apply or authorize runtime adoption before controlled Phase 1G-B handoff.';

-- Rollback preparation (manual): revoke runtime adoption policy first, archive
-- events, then DROP VIEW certified_runtime_latest and DROP the two tables.
