-- Phase N completion: durable leases, explicit owner-test authorization and canonical command results.
alter table public.phase_n_operations_commands add column if not exists attempt integer not null default 0,
 add column if not exists available_at timestamptz not null default now(), add column if not exists claimed_at timestamptz,
 add column if not exists lease_expires_at timestamptz, add column if not exists lease_token uuid,
 add column if not exists worker_id text, add column if not exists completed_at timestamptz,
 add column if not exists result_projection jsonb not null default '{}';
create table if not exists public.phase_n_owner_test_authorizations(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),execution_account_id uuid not null references public.connected_execution_accounts(id),
 authorized_by uuid not null references auth.users(id),reason text not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now(),
 unique(execution_account_id)
);
alter table public.phase_n_owner_test_authorizations enable row level security;
create policy phase_n_owner_test_admin_read on public.phase_n_owner_test_authorizations for select to authenticated using(public.is_admin());
revoke all on public.phase_n_owner_test_authorizations from anon,authenticated;grant select on public.phase_n_owner_test_authorizations to authenticated;

create or replace function public.claim_phase_n_operations_command(p_worker_id text,p_lease_seconds integer default 30)
returns setof public.phase_n_operations_commands language plpgsql security definer set search_path=public as $$
declare picked uuid;begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 update phase_n_operations_commands set status='QUEUED',claimed_at=null,lease_expires_at=null,lease_token=null,worker_id=null
 where status='CLAIMED' and lease_expires_at<clock_timestamp();
 select id into picked from phase_n_operations_commands where status='QUEUED' and available_at<=clock_timestamp() order by created_at for update skip locked limit 1;
 if picked is null then return;end if;
 return query update phase_n_operations_commands set status='CLAIMED',attempt=attempt+1,claimed_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,5),300)),lease_token=gen_random_uuid(),worker_id=p_worker_id,updated_at=clock_timestamp() where id=picked returning *;
end$$;
revoke all on function public.claim_phase_n_operations_command(text,integer) from public,anon,authenticated;grant execute on function public.claim_phase_n_operations_command(text,integer) to service_role;

create or replace function public.finish_phase_n_operations_command(p_id uuid,p_lease_token uuid,p_success boolean,p_result jsonb,p_safe_error text default null,p_retryable boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 update phase_n_operations_commands set status=case when p_success then 'COMPLETED' when p_retryable then 'QUEUED' else 'FAILED' end,
 result_projection=case when p_success then coalesce(p_result,'{}') else '{}' end,safe_error=case when p_success then null else left(p_safe_error,200) end,
 available_at=case when p_retryable then clock_timestamp()+make_interval(secs=>least(300,attempt*15)) else available_at end,
 completed_at=case when p_success or not p_retryable then clock_timestamp() else null end,claimed_at=null,lease_expires_at=null,lease_token=null,worker_id=null,updated_at=clock_timestamp()
 where id=p_id and status='CLAIMED' and lease_token=p_lease_token and lease_expires_at>=clock_timestamp();get diagnostics changed=row_count;return changed=1;end$$;
revoke all on function public.finish_phase_n_operations_command(uuid,uuid,boolean,jsonb,text,boolean) from public,anon,authenticated;grant execute on function public.finish_phase_n_operations_command(uuid,uuid,boolean,jsonb,text,boolean) to service_role;

create or replace view public.phase_n_commands_safe with(security_invoker=true) as select id,customer_id,execution_account_id,action,status,attempt,available_at,claimed_at,completed_at,safe_error,result_projection,created_at,updated_at from public.phase_n_operations_commands;
grant select on public.phase_n_commands_safe to authenticated;

create or replace view public.phase_n_account_operations_safe with(security_invoker=true) as
select a.id as account_id,a.customer_id,upper(a.provider) as provider,a.environment,a.account_mode,
 (a.provider_account_identity is not null and a.provider_account_identity !~ '^draft:') as ownership_verified,
 (coalesce(c.state,'NOT_STARTED') in('CONNECTED','VERIFIED')) as connection_verified,
 case when c.last_heartbeat_at is null then 'MISSING' when c.last_heartbeat_at>=now()-interval '3 minutes' then 'HEALTHY' else 'STALE' end as heartbeat_state,
 coalesce(b.state,'MISSING') as entitlement,
 exists(select 1 from phase_n_owner_test_authorizations x where x.execution_account_id=a.id and x.customer_id=a.customer_id and x.revoked_at is null and x.expires_at>now()) as owner_test_authorization,
 a.runtime_control in('PAUSE_NEW_ENTRIES','STOP_AFTER_FLAT','MANAGE_ONLY') as stop_new_entries,
 a.monitor_enabled as protection_enabled,
 (exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='SUBMISSION_UNCERTAIN') or exists(select 1 from crypto_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='SUBMISSION_UNCERTAIN')) as submission_uncertain,
 (exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='PROTECTION_INCIDENT') or exists(select 1 from crypto_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state='PROTECTION_INCIDENT')) as open_protection_incident,
 coalesce(a.phase_h_certification_status,'NOT_RUN') as certification_status
from connected_execution_accounts a left join provider_connections c on c.execution_account_id=a.id
left join execution_entitlement_bindings b on b.execution_account_id=a.id and b.state in('ACTIVE','PENDING');

create or replace function public.persist_phase_n_certification_preflight(p_identity jsonb,p_checks jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare configured uuid;run_id uuid;item jsonb;bridge uuid;begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select customer_id into configured from phase_n_customer_configuration where key='CUSTOMER_001' and disabled_at is null;
 if configured is null or configured<>(p_identity->>'customerId')::uuid then raise exception 'CUSTOMER_001_NOT_EXPLICITLY_CONFIGURED';end if;
 run_id:=create_customer_001_certification_run((p_identity->>'accountId')::uuid,p_identity->>'decisionId',p_identity->>'executionPlanId',p_identity->>'clientOrderId',p_identity->>'strategyId',p_identity->>'strategyVersion',p_identity->>'symbol',p_identity->>'side',(p_identity->>'expiresAt')::timestamptz);
 for item in select * from jsonb_array_elements(p_checks) loop insert into customer_system_certification_checks(run_id,customer_id,execution_account_id,check_code,passed,safe_evidence) values(run_id,configured,(p_identity->>'accountId')::uuid,item->>'code',(item->>'passed')::boolean,coalesce(item->'evidence','{}'));end loop;
 begin bridge:=nullif(p_identity->>'bridgeId','')::uuid;exception when invalid_text_representation then bridge:=null;end;
 update customer_system_certification_runs set status='PRECHECK_PASSED',credential_capabilities=coalesce(p_identity->'credentialCapabilities','{}'),bridge_id=bridge,provider_health='HEALTHY',updated_at=clock_timestamp() where id=run_id;
 return run_id;end$$;
revoke all on function public.persist_phase_n_certification_preflight(jsonb,jsonb) from public,anon,authenticated;grant execute on function public.persist_phase_n_certification_preflight(jsonb,jsonb) to service_role;
