-- Phase D: consolidate policy/state around connected_execution_accounts. No provider execution changes.
alter table public.connected_execution_accounts
  add column if not exists account_mode text not null default 'PERSONAL' check(account_mode in('PERSONAL','PROP_EVALUATION','PROP_FUNDED')),
  add column if not exists immutable_identity text,
  add column if not exists policy_profile_id text,
  add column if not exists policy_version text,
  add column if not exists policy_preset text not null default 'CONSERVATIVE' check(policy_preset in('CONSERVATIVE','BALANCED','GROWTH','PROP_SAFE')),
  add column if not exists policy_overrides jsonb not null default '{}'::jsonb,
  add column if not exists runtime_control text not null default 'PAUSE_NEW_ENTRIES' check(runtime_control in('START','PAUSE_NEW_ENTRIES','RESUME','MANAGE_ONLY','STOP_AFTER_FLAT','EMERGENCY_STOP'));
update public.connected_execution_accounts set immutable_identity=concat(provider,':',environment,':',coalesce(provider_account_identity,account_id)) where immutable_identity is null;
alter table public.connected_execution_accounts alter column immutable_identity set not null;
create unique index if not exists connected_execution_accounts_immutable_identity_uidx on public.connected_execution_accounts(immutable_identity);
alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_live_disabled_phase_d;
alter table public.connected_execution_accounts add constraint connected_execution_accounts_live_disabled_phase_d check(environment<>'live' or execution_enabled=false) not valid;

create or replace function public.assert_execution_account_identity_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if row(old.customer_id,old.provider,old.environment,old.provider_account_identity,old.immutable_identity,old.execution_instance_id)
    is distinct from row(new.customer_id,new.provider,new.environment,new.provider_account_identity,new.immutable_identity,new.execution_instance_id)
 then raise exception 'execution account ownership and identity are immutable'; end if;
 return new;
end $$;
drop trigger if exists connected_execution_account_identity_guard on public.connected_execution_accounts;
create trigger connected_execution_account_identity_guard before update on public.connected_execution_accounts for each row execute function public.assert_execution_account_identity_immutable();

create table if not exists public.execution_account_policy_decisions(
 id text primary key,customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),signal_id uuid not null,
 decision text not null check(decision in('ALLOW','REDUCE','BLOCK','LOCK')),reason_codes text[] not null,authorized_risk_pct numeric not null,
 brain_family text not null check(brain_family in('PERSONAL','PROP')),brain_provider text not null,brain_version text not null,
 policy_profile_id text not null,policy_version text not null,configuration jsonb not null,created_at timestamptz not null default now(),
 unique(customer_id,execution_account_id,signal_id,policy_profile_id,policy_version)
);
alter table public.execution_account_policy_decisions enable row level security;
create policy execution_account_policy_decisions_owner_read on public.execution_account_policy_decisions for select to authenticated using(customer_id=auth.uid() or public.is_admin());
revoke all on public.execution_account_policy_decisions from anon; grant select on public.execution_account_policy_decisions to authenticated;
create index if not exists execution_account_policy_decisions_scope_idx on public.execution_account_policy_decisions(customer_id,execution_account_id,created_at desc);

-- Credential references and provider secret material are intentionally absent.
create or replace view public.execution_accounts_safe with(security_invoker=true) as
select id,customer_id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,ownership_classification,enabled,is_operational,monitor_enabled,execution_enabled,risk_profile_id,provider_health,last_synchronized_at,credentials_verified_at,last_error,account_mode,immutable_identity,policy_profile_id,policy_version,policy_preset,policy_overrides,runtime_control,created_at,updated_at
from public.connected_execution_accounts;
revoke all on public.execution_accounts_safe from anon; grant select on public.execution_accounts_safe to authenticated;
