-- Phase 5D-5F: additive durable market data, certification and demo activation truth.
create table if not exists public.mt5_market_data_latest (
 account_id uuid not null references public.mt5_accounts(id) on delete cascade, owner_id uuid not null,
 bridge_id text not null, canonical_symbol text not null, broker_symbol text not null,
 bid numeric not null check (bid > 0), ask numeric not null check (ask > 0), spread numeric generated always as (ask-bid) stored,
 digits int not null, point numeric not null, tick_size numeric, tick_value numeric, contract_size numeric,
 volume_min numeric, volume_step numeric, volume_max numeric, stops_level int, freeze_level int,
 market_open boolean not null, stale boolean not null default false, last_update_at timestamptz not null,
 primary key(account_id,bridge_id,canonical_symbol)
);
create table if not exists public.mt5_market_candles (
 account_id uuid not null references public.mt5_accounts(id) on delete cascade, owner_id uuid not null,
 bridge_id text not null, canonical_symbol text not null, broker_symbol text not null, timeframe text not null,
 open_time timestamptz not null, open numeric not null check(open>0), high numeric not null, low numeric not null,
 close numeric not null check(close>0), tick_volume numeric not null default 0, published_at timestamptz not null default now(),
 primary key(account_id,bridge_id,canonical_symbol,timeframe,open_time), check(high>=low)
);
create index if not exists mt5_candles_scan_idx on public.mt5_market_candles(canonical_symbol,timeframe,open_time desc);
alter table public.mt5_market_data_latest enable row level security;
alter table public.mt5_market_candles enable row level security;

create table if not exists public.mt5_certification_results (
 account_id uuid not null references public.mt5_accounts(id) on delete cascade, owner_id uuid not null, bridge_id text not null,
 check_key text not null, status text not null default 'NOT_RUN' check(status in ('PASS','FAIL','NOT_RUN')),
 error_code text, evidence jsonb not null default '{}'::jsonb, checked_at timestamptz, primary key(account_id,check_key)
);
alter table public.mt5_certification_results enable row level security;

create table if not exists public.mt5_demo_activation_requests (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.mt5_accounts(id), owner_id uuid not null,
 requested_by uuid not null, status text not null default 'CHECKLIST_PENDING', checklist jsonb not null default '{}'::jsonb,
 operator_confirmed_at timestamptz, controlled_order_command_id uuid, created_at timestamptz not null default now(),
 check(status in ('CHECKLIST_PENDING','READY_FOR_CONFIRMATION','ORDER_CONFIRMED','CERTIFIED','REJECTED'))
);
alter table public.mt5_demo_activation_requests enable row level security;

-- Bounded retention is invoked by bridge publication; history required by indicators is retained.
create or replace function public.prune_mt5_market_data(p_account_id uuid) returns void language sql security definer set search_path=public as $$
 delete from public.mt5_market_candles where account_id=p_account_id and open_time < now()-interval '45 days';
$$;
