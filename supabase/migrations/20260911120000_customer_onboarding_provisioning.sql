create table if not exists public.customer_onboarding_provisioning(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade,
 access_request_id uuid not null unique references public.access_requests(id) on delete cascade,
 subscription_id uuid references public.customer_subscriptions(id) on delete set null,
 product text not null check(product in('SIGNAL_ONLY','FOREX_PERSONAL','FOREX_PROP','CRYPTO_PERSONAL','CRYPTO_PROP')),
 provider text check(provider is null or provider in('MT5','BINANCE','BYBIT')),
 execution_account_id uuid references public.connected_execution_accounts(id) on delete set null,
 qualified_set_id text, qualified_set_version text, preferences jsonb not null default '{}'::jsonb,
 runtime_control text not null default 'PAUSE_NEW_ENTRIES' check(runtime_control in('START','PAUSE_NEW_ENTRIES','RESUME','MANAGE_ONLY','STOP_AFTER_FLAT','EMERGENCY_STOP')),
 state text not null default 'DRAFT' check(state in('DRAFT','PAYMENT_SUBMITTED','AWAITING_ADMIN_REVIEW','APPROVED','REJECTED','ACCOUNT_SETUP_REQUIRED','READY','ACTIVE','DISABLED','EXPIRED')),
 payment_verified boolean not null default false, admin_approved boolean not null default false, admin_notes text not null default '', created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.customer_onboarding_audit(
 id bigint generated always as identity primary key,customer_id uuid not null references auth.users(id) on delete cascade,access_request_id uuid references public.access_requests(id) on delete set null,
 actor_id uuid not null references auth.users(id),actor_role text not null check(actor_role in('CUSTOMER','ADMIN','SYSTEM')),previous_state text not null,new_state text not null,reason text not null,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.customer_onboarding_provisioning enable row level security;alter table public.customer_onboarding_audit enable row level security;
create policy customer_onboarding_owner_read on public.customer_onboarding_provisioning for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy customer_onboarding_admin_all on public.customer_onboarding_provisioning for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy customer_onboarding_audit_owner_read on public.customer_onboarding_audit for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy customer_onboarding_audit_admin_write on public.customer_onboarding_audit for insert to authenticated with check(public.is_admin());
revoke all on public.customer_onboarding_provisioning,public.customer_onboarding_audit from anon;grant select on public.customer_onboarding_provisioning,public.customer_onboarding_audit to authenticated;
create index if not exists customer_onboarding_customer_idx on public.customer_onboarding_provisioning(customer_id,state);
create index if not exists customer_onboarding_account_idx on public.customer_onboarding_provisioning(customer_id,execution_account_id) where execution_account_id is not null;
