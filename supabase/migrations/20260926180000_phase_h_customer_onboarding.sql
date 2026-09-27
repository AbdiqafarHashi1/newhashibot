-- Phase H: onboarding/readiness projections only. Phase D/E/F/G authorities are unchanged.
create table if not exists public.customer_onboarding_sessions(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade,
 idempotency_key text not null, stage smallint not null default 0 check(stage between 0 and 12), status text not null default 'DRAFT' check(status in('DRAFT','IN_PROGRESS','COMPLETE','BLOCKED')),
 package_code text check(package_code in('FREE_SIGNALS','VIP_SIGNALS','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION')), preferences jsonb not null default '{}'::jsonb,
 completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(customer_id,idempotency_key)
);
create table if not exists public.phase_h_products(
 code text primary key, name text not null, price_cents integer, currency text, billing_interval text, checkout_state text not null default 'CHECKOUT_NOT_CONFIGURED', capacity integer, standard_price_cents integer, terms_version text not null, features jsonb not null default '{}'::jsonb, active boolean not null default true
);
insert into public.phase_h_products(code,name,price_cents,currency,billing_interval,capacity,terms_version) values
 ('FREE_SIGNALS','Free Signals',0,'USD',null,null,'2026.09'),('VIP_SIGNALS','VIP Signals',null,'USD','month',null,'2026.09'),
 ('AUTO_EXECUTION','Auto Execution',null,'USD','month',null,'2026.09'),('FOUNDING_PROP_EXECUTION','Founding Prop Execution',10000,'USD','month',10,'2026.09') on conflict(code) do nothing;
create table if not exists public.phase_h_entitlements(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade, product_code text not null references public.phase_h_products(code),
 state text not null check(state in('ACTIVE','TRIAL','PENDING','GRACE','EXPIRED','CANCELLED','SUSPENDED')), source text not null default 'NOT_CONFIGURED', external_reference text,
 valid_from timestamptz, valid_until timestamptz, account_limit integer, provider_limits jsonb not null default '{}'::jsonb, feature_permissions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.connected_execution_accounts add column if not exists phase_h_asset_class text check(phase_h_asset_class in('FOREX','CRYPTO')),
 add column if not exists phase_h_connection_id uuid, add column if not exists phase_h_readiness text not null default 'DRAFT',
 add column if not exists phase_h_readiness_reasons text[] not null default array['ONBOARDING_INCOMPLETE'], add column if not exists phase_h_certification_status text not null default 'REQUIRED';
create table if not exists public.provider_connections(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade, execution_account_id uuid not null references public.connected_execution_accounts(id) on delete cascade,
 provider text not null check(provider in('MT5','BINANCE','BYBIT')), environment text not null check((provider='BINANCE' and environment='testnet') or (provider in('MT5','BYBIT') and environment='demo')),
 state text not null default 'NOT_STARTED', external_fingerprint text, secret_reference text, capabilities jsonb not null default '{}'::jsonb, bridge_identity text, bridge_version text,
 last_verified_at timestamptz, last_heartbeat_at timestamptz, safe_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(customer_id,execution_account_id)
);
alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_phase_h_connection_fk;
alter table public.connected_execution_accounts add constraint connected_execution_accounts_phase_h_connection_fk foreign key(phase_h_connection_id) references public.provider_connections(id) deferrable initially deferred;
create table if not exists public.hashibridge_pairing_codes(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade, execution_account_id uuid not null references public.connected_execution_accounts(id) on delete cascade,
 connection_id uuid not null references public.provider_connections(id) on delete cascade, code_hash text not null, expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz, attempt_count smallint not null default 0 check(attempt_count between 0 and 5), created_at timestamptz not null default now()
);
create unique index if not exists hashibridge_one_active_pairing on public.hashibridge_pairing_codes(execution_account_id) where used_at is null and revoked_at is null;
create table if not exists public.account_brain_assignments(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade, execution_account_id uuid not null references public.connected_execution_accounts(id) on delete cascade,
 brain_family text not null check(brain_family in('PERSONAL_MT5_GROWTH','PERSONAL_BINANCE_CRYPTO','PERSONAL_BYBIT_CRYPTO','PROP_MT5_STRICT')), policy_version text not null,
 risk_preference numeric not null, strategy_permissions text[] not null, assignment_reason text not null, assigned_by uuid, superseded_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists account_one_current_brain on public.account_brain_assignments(execution_account_id) where superseded_at is null;
create table if not exists public.risk_acknowledgements(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),execution_account_id uuid references public.connected_execution_accounts(id),version text not null,accepted_at timestamptz not null default now(),ip_hash text,user_agent_hash text,unique(customer_id,execution_account_id,version));
create table if not exists public.execution_readiness_projections(execution_account_id uuid primary key references public.connected_execution_accounts(id) on delete cascade,customer_id uuid not null references auth.users(id),state text not null,reasons text[] not null,required_action text,calculated_at timestamptz not null default now(),input_version text not null default 'phase-h/1');
create table if not exists public.founding_slot_reservations(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),slot_number smallint not null check(slot_number between 1 and 10),state text not null check(state in('RESERVED','ACTIVE','EXPIRED','RELEASED')),expires_at timestamptz,terms_version text not null,created_at timestamptz not null default now());
create unique index if not exists founding_slot_occupied on public.founding_slot_reservations(slot_number) where state in('RESERVED','ACTIVE');
create table if not exists public.phase_h_audit_events(id uuid primary key default gen_random_uuid(),customer_id uuid,execution_account_id uuid,actor_id uuid,event_type text not null,safe_metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists public.portable_jobs(id uuid primary key default gen_random_uuid(),kind text not null,payload jsonb not null,customer_id uuid,execution_account_id uuid,idempotency_key text not null unique,attempt integer not null default 0,max_attempts integer not null default 5,available_at timestamptz not null default now(),claimed_at timestamptz,completed_at timestamptz,dead_lettered_at timestamptz,cancelled_at timestamptz,safe_error text,audit_id uuid,rate_limit_key text,human_approval_required boolean not null default false,created_at timestamptz not null default now());

alter table public.customer_onboarding_sessions enable row level security; alter table public.phase_h_entitlements enable row level security; alter table public.provider_connections enable row level security; alter table public.hashibridge_pairing_codes enable row level security; alter table public.account_brain_assignments enable row level security; alter table public.risk_acknowledgements enable row level security; alter table public.execution_readiness_projections enable row level security; alter table public.founding_slot_reservations enable row level security; alter table public.phase_h_audit_events enable row level security; alter table public.portable_jobs enable row level security;
create policy phase_h_onboarding_owner_read on public.customer_onboarding_sessions for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_onboarding_owner_insert on public.customer_onboarding_sessions for insert to authenticated with check(customer_id=auth.uid() and status in('DRAFT','IN_PROGRESS'));
create policy phase_h_onboarding_owner_safe_update on public.customer_onboarding_sessions for update to authenticated using(customer_id=auth.uid()) with check(customer_id=auth.uid() and status in('DRAFT','IN_PROGRESS'));
create policy phase_h_entitlement_read on public.phase_h_entitlements for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_connection_read on public.provider_connections for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_brain_read on public.account_brain_assignments for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_ack_read on public.risk_acknowledgements for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_ack_insert on public.risk_acknowledgements for insert to authenticated with check(customer_id=auth.uid());
create policy phase_h_readiness_read on public.execution_readiness_projections for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_slot_read on public.founding_slot_reservations for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_audit_read on public.phase_h_audit_events for select to authenticated using(customer_id=auth.uid() or public.is_admin());
-- Pairing rows and jobs intentionally have no customer policy; server authorities project safe state.
revoke all on public.provider_connections,public.hashibridge_pairing_codes,public.account_brain_assignments,public.execution_readiness_projections,public.founding_slot_reservations,public.phase_h_audit_events,public.portable_jobs from anon,authenticated;
grant select on public.provider_connections,public.account_brain_assignments,public.execution_readiness_projections,public.founding_slot_reservations,public.phase_h_audit_events to authenticated;
grant select,insert,update on public.customer_onboarding_sessions to authenticated; grant select,insert on public.risk_acknowledgements to authenticated; grant select on public.phase_h_entitlements,public.phase_h_products to authenticated;

create or replace function public.consume_hashibridge_pairing(p_code_hash text,p_bridge_identity text,p_bridge_version text,p_terminal jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p hashibridge_pairing_codes; begin
 select * into p from hashibridge_pairing_codes where code_hash=p_code_hash for update;
 if p.id is null then raise exception 'PAIRING_INVALID'; end if; if p.revoked_at is not null or p.used_at is not null then raise exception 'PAIRING_REPLAY_REJECTED'; end if;
 if p.expires_at<now() then raise exception 'PAIRING_CODE_EXPIRED'; end if; if p.attempt_count>=5 then raise exception 'PAIRING_ATTEMPTS_EXCEEDED'; end if;
 update hashibridge_pairing_codes set used_at=now(),attempt_count=attempt_count+1 where id=p.id;
 update provider_connections set state='PAIRED',bridge_identity=p_bridge_identity,bridge_version=p_bridge_version,last_verified_at=now(),updated_at=now() where id=p.connection_id and customer_id=p.customer_id and execution_account_id=p.execution_account_id;
 insert into phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(p.customer_id,p.execution_account_id,'HASHIBRIDGE_PAIRED',jsonb_build_object('bridge_version',p_bridge_version));
 return jsonb_build_object('state','PAIRED','execution_account_id',p.execution_account_id); end $$;
revoke all on function public.consume_hashibridge_pairing(text,text,text,jsonb) from public; grant execute on function public.consume_hashibridge_pairing(text,text,text,jsonb) to service_role;

create or replace view public.provider_connections_safe with(security_invoker=true) as select id,customer_id,execution_account_id,provider,environment,state,external_fingerprint,capabilities,bridge_identity,bridge_version,last_verified_at,last_heartbeat_at,safe_error_code,created_at,updated_at from public.provider_connections;
grant select on public.provider_connections_safe to authenticated;
