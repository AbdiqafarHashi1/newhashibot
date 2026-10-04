-- Phase N: explicit Customer #001 binding and audited operations commands.
-- No customer is inferred or seeded. Deployment must set the UUID explicitly.
create table if not exists public.phase_n_customer_configuration(
 key text primary key check(key='CUSTOMER_001'), customer_id uuid not null unique references auth.users(id),
 configured_by uuid not null references auth.users(id), configured_at timestamptz not null default now(),
 disabled_at timestamptz
);
create table if not exists public.phase_n_operations_commands(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
 execution_account_id uuid not null references public.connected_execution_accounts(id),
 action text not null check(action in('START_CERTIFICATION','STOP_NEW_ENTRIES','REQUEST_RECONCILIATION','REVOKE_CONNECTION','REQUEST_PROTECTION_RECOVERY','REQUEST_SAFETY_CLOSE','RETRY_SAFE_WORK')),
 idempotency_key text not null, status text not null default 'QUEUED' check(status in('QUEUED','CLAIMED','COMPLETED','FAILED','FAILED_SAFE_RETRY','CANCELLED')),
 safe_payload jsonb not null default '{}', safe_error text, requested_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(customer_id,execution_account_id,idempotency_key), check(jsonb_typeof(safe_payload)='object')
);
create or replace function public.phase_n_validate_operations_command() returns trigger language plpgsql set search_path=public as $$
declare owner_id uuid; begin
 select customer_id into owner_id from connected_execution_accounts where id=new.execution_account_id;
 if owner_id is null or owner_id<>new.customer_id then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED'; end if;
 if new.safe_payload::text ~* '(api.?key|secret|password|passphrase|private.?key|access.?token)' then raise exception 'SENSITIVE_PAYLOAD_REJECTED'; end if;
 return new;
end $$;
drop trigger if exists phase_n_validate_operations_command_trigger on public.phase_n_operations_commands;
create trigger phase_n_validate_operations_command_trigger before insert or update on public.phase_n_operations_commands for each row execute function public.phase_n_validate_operations_command();
alter table public.phase_n_customer_configuration enable row level security;
alter table public.phase_n_operations_commands enable row level security;
create policy phase_n_configuration_admin_read on public.phase_n_customer_configuration for select to authenticated using(public.is_admin());
create policy phase_n_commands_scoped_read on public.phase_n_operations_commands for select to authenticated using(customer_id=auth.uid() or public.is_admin());
revoke all on public.phase_n_customer_configuration,public.phase_n_operations_commands from anon,authenticated;
grant select on public.phase_n_customer_configuration,public.phase_n_operations_commands to authenticated;

-- Safe projection only; provider identity and heartbeat are persisted authorities, never inferred success.
create or replace view public.phase_n_account_operations_safe with(security_invoker=true) as
select a.id as account_id,a.customer_id,upper(a.provider) as provider,a.environment,a.account_mode,
 (a.provider_account_identity is not null and a.provider_account_identity !~ '^draft:') as ownership_verified,
 (coalesce(c.state,'NOT_STARTED') in('CONNECTED','VERIFIED')) as connection_verified,
 case when c.last_heartbeat_at is null then 'MISSING' when c.last_heartbeat_at >= now()-interval '3 minutes' then 'HEALTHY' else 'STALE' end as heartbeat_state,
 coalesce(b.state,'MISSING') as entitlement,
 false as owner_test_authorization,a.runtime_control='STOP_NEW_ENTRIES' as stop_new_entries,
 a.runtime_control<>'PROTECTION_DISABLED' as protection_enabled,
 (exists(select 1 from public.mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='SUBMISSION_UNCERTAIN') or
  exists(select 1 from public.crypto_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='SUBMISSION_UNCERTAIN')) as submission_uncertain,
 (exists(select 1 from public.mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='PROTECTION_INCIDENT') or
  exists(select 1 from public.crypto_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='PROTECTION_INCIDENT')) as open_protection_incident,
 coalesce(a.phase_h_certification_status,'NOT_RUN') as certification_status
from public.connected_execution_accounts a
left join public.provider_connections c on c.execution_account_id=a.id
left join public.execution_entitlement_bindings b on b.execution_account_id=a.id and b.state in('ACTIVE','PENDING');
grant select on public.phase_n_account_operations_safe to authenticated;
