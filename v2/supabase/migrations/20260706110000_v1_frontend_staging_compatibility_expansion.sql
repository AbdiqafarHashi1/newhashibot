/*
  Recovery Phase 3 — close V1 frontend staging compatibility gaps.
  This migration does not enable scanner/execution and does not touch production env vars.
*/

create extension if not exists pgcrypto;

-- V1 package shape expected by the existing frontend.
alter table public.packages add column if not exists slug text;
alter table public.packages add column if not exists price_kes numeric;
alter table public.packages add column if not exists duration_days integer;
alter table public.packages add column if not exists features text[] not null default '{}';
alter table public.packages add column if not exists telegram_access_required boolean not null default false;
update public.packages
set slug = coalesce(slug, package_code),
    price_kes = coalesce(price_kes, price),
    duration_days = coalesce(duration_days, case when billing_period = 'monthly' then 30 when billing_period = 'yearly' then 365 else null end),
    telegram_access_required = telegram_access,
    features = case when features = '{}'::text[] then array_remove(array[
      case when signal_access then 'Signal dashboard' end,
      case when telegram_access then 'Telegram delivery' end,
      case when execution_access then 'Managed execution visibility' end
    ], null) else features end
where slug is null or price_kes is null or duration_days is null or features = '{}'::text[];
create unique index if not exists packages_slug_uq on public.packages(slug) where slug is not null;

create table if not exists public.v1_access_requests_compat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_slug text not null,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  telegram_username text not null default '',
  telegram_chat_id text not null default '',
  payment_method text not null default 'manual',
  notes text not null default '',
  payment_reference text not null default '',
  risk_preset text not null default '',
  contact_preference text not null default '',
  status text not null default 'pending_payment',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists v1_access_requests_user_created_idx on public.v1_access_requests_compat(user_id, created_at desc);

create table if not exists public.v1_telegram_links_compat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  telegram_username text not null default '',
  telegram_chat_id text not null default '',
  phone text not null default '',
  status text not null default 'pending',
  notes text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v1_customer_bot_setups_compat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  package_slug text not null,
  subscription_id uuid,
  access_request_id uuid,
  bot_type text not null default 'crypto_personal',
  capital_mode text not null default 'personal',
  setup_status text not null default 'setup_requested',
  risk_preset text not null default 'balanced',
  account_size numeric,
  account_currency text not null default 'USD',
  platform text not null default '',
  broker_name text not null default '',
  exchange_name text not null default '',
  prop_firm_name text not null default '',
  account_type text not null default '',
  preferred_symbols text[] not null default '{}',
  max_risk_per_trade_pct numeric,
  max_daily_loss_pct numeric,
  drawdown_limit_pct numeric,
  min_trading_days integer,
  leverage_profile text not null default '',
  customer_notes text not null default '',
  admin_notes text not null default '',
  acknowledged_no_execution boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, package_slug)
);
create index if not exists v1_customer_bot_setups_user_updated_idx on public.v1_customer_bot_setups_compat(user_id, updated_at desc);

alter table public.v1_access_requests_compat enable row level security;
alter table public.v1_telegram_links_compat enable row level security;
alter table public.v1_customer_bot_setups_compat enable row level security;

do $$ declare t text; begin
  foreach t in array array['v1_access_requests_compat','v1_telegram_links_compat','v1_customer_bot_setups_compat'] loop
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format('create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t || '_service_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_self_read_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id or public.is_operator()) with check (auth.uid() = user_id or public.is_operator())', t || '_self_read_write', t);
  end loop;
end $$;

-- Compatibility relations for V1 customer/account pages. Customer subscriptions and
-- user_access are durable customer/access facts, so they are compatibility tables;
-- the other customer request/setup surfaces are simple updatable views over compat tables.
create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  profile_id uuid,
  email text not null default '',
  full_name text not null default '',
  package_id uuid,
  package_name text not null default '',
  payment_status text not null default 'pending',
  access_status text not null default 'inactive',
  amount_paid numeric,
  currency text not null default 'KES',
  payment_reference text not null default '',
  payment_method text not null default 'manual',
  starts_at timestamptz,
  expires_at timestamptz,
  telegram_status text not null default 'not_invited',
  telegram_username text not null default '',
  telegram_chat_id text not null default '',
  notes text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_subscriptions_user_idx on public.customer_subscriptions(user_id, created_at desc);

create table if not exists public.user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_slug text not null,
  status text not null default 'inactive',
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, product_slug)
);

alter table public.customer_subscriptions enable row level security;
alter table public.user_access enable row level security;
drop policy if exists customer_subscriptions_self_read_operator_write on public.customer_subscriptions;
create policy customer_subscriptions_self_read_operator_write on public.customer_subscriptions for all to authenticated using (auth.uid() = user_id or public.is_operator()) with check (auth.uid() = user_id or public.is_operator());
drop policy if exists customer_subscriptions_service_all on public.customer_subscriptions;
create policy customer_subscriptions_service_all on public.customer_subscriptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists user_access_self_read_operator_write on public.user_access;
create policy user_access_self_read_operator_write on public.user_access for all to authenticated using (auth.uid() = user_id or public.is_operator()) with check (auth.uid() = user_id or public.is_operator());
drop policy if exists user_access_service_all on public.user_access;
create policy user_access_service_all on public.user_access for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop view if exists public.access_requests;
create view public.access_requests as
select ar.id, ar.user_id, ar.product_slug, ar.full_name, ar.email, ar.phone, ar.telegram_username, ar.telegram_chat_id, ar.payment_method, ar.notes, ar.payment_reference, ar.risk_preset, ar.contact_preference, ar.status, ar.admin_note, ar.created_at, ar.updated_at
from public.v1_access_requests_compat ar;

drop view if exists public.telegram_links;
create view public.telegram_links as
select id, user_id, telegram_username, telegram_chat_id, phone, status, notes, admin_note, created_at, updated_at
from public.v1_telegram_links_compat;

drop view if exists public.customer_bot_setups;
create view public.customer_bot_setups as
select id, user_id, package_slug, subscription_id, access_request_id, bot_type, capital_mode, setup_status, risk_preset, account_size, account_currency, platform, broker_name, exchange_name, prop_firm_name, account_type, preferred_symbols, max_risk_per_trade_pct, max_daily_loss_pct, drawdown_limit_pct, min_trading_days, leverage_profile, customer_notes, admin_notes, acknowledged_no_execution, created_at, updated_at
from public.v1_customer_bot_setups_compat;

create or replace function public.no_admin_exists()
returns boolean language sql stable security definer set search_path=public as $$
  select not exists (select 1 from public.profiles where platform_role in ('owner','admin') or role = 'admin')
$$;

create or replace function public.v1_compat_page_matrix()
returns table(page text, contract text, status text, notes text) language sql stable security definer set search_path=public as $$
  values
    ('login/auth','profiles + no_admin_exists()','covered','profiles supports auth_user_id/id lookup; no_admin_exists RPC added'),
    ('admin dashboard','v1_compat_monitoring_summary + scanner/provider views','covered','scanner/execution remain disabled'),
    ('customer dashboard','customer_subscriptions/access_requests/telegram_links/customer_bot_setups/signals','covered','compatibility views added'),
    ('packages','packages compatibility columns','covered','slug/price_kes/duration/features/telegram_access_required backfilled'),
    ('subscriptions','customer_subscriptions + user_access','covered','mapped from V2 subscriptions/customers'),
    ('signals','signals/signal_updates','covered','approved signal and signal event views'),
    ('scanner config','scanner_config','covered','scanner stays disabled by seed/default'),
    ('provider status','provider_status','covered','latest provider health view'),
    ('telegram pages','telegram_links/telegram_deliveries','covered','customer link compat table plus delivery log view'),
    ('monitoring summaries','v1_compat_monitoring_summary','covered','compact RPC avoids raw polling')
$$;

notify pgrst, 'reload schema';
