create table if not exists public.trade_management_truth (
  provider text not null check (provider in ('binance', 'bybit')),
  environment text not null check (environment in ('testnet', 'demo')),
  symbol text not null,
  side text not null,
  qty numeric not null default 0,
  entry_price numeric,
  mark_price numeric,
  unrealized_pnl numeric,
  exchange_position_id text,
  signal_id uuid null references public.signals(id) on delete set null,
  execution_order_id uuid null,
  entry_order_id text,
  sl_order_id text,
  tp1_order_id text,
  tp2_order_id text,
  sl_present boolean not null default false,
  tp1_present boolean not null default false,
  tp2_present boolean not null default false,
  protection_status text not null default 'orphan' check (protection_status in ('protected', 'missing_sl', 'missing_tp', 'orphan', 'stale', 'closed')),
  profit_lock_status text not null default 'inactive',
  monitor_status text not null default 'unknown',
  recovery_status text not null default 'none',
  latest_error text,
  latest_sync_at timestamptz not null default now(),
  last_action_taken text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, environment, symbol, side)
);

create index if not exists trade_management_truth_status_idx on public.trade_management_truth(provider, environment, protection_status, latest_sync_at desc);

create or replace view public.active_trade_management_truth as
select * from public.trade_management_truth where protection_status <> 'closed';

alter table public.trade_management_truth enable row level security;

drop policy if exists "Admins can read trade management truth" on public.trade_management_truth;
create policy "Admins can read trade management truth" on public.trade_management_truth for select using (public.is_admin());

drop policy if exists "Service role can manage trade management truth" on public.trade_management_truth;
create policy "Service role can manage trade management truth" on public.trade_management_truth for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.trade_management_truth is 'Canonical exchange-truth-first active trade management state for Binance testnet and Bybit demo positions.';
comment on view public.active_trade_management_truth is 'Open/non-closed trade-management truth rows for admin UI and runtime proof.';
