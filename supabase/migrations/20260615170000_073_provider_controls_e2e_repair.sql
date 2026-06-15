-- Phase X-D repair: provider controls/readiness end-to-end hardening.
-- Additive/safe: does not alter scanner/strategy logic or enable live trading.

create table if not exists public.execution_provider_controls (
  provider_name text primary key,
  enabled boolean not null default false,
  parallel_enabled boolean not null default false,
  primary_provider boolean not null default false,
  read_only boolean not null default true,
  profit_lock_enabled boolean not null default false,
  monitor_enabled boolean not null default false,
  protection_recovery_enabled boolean not null default false,
  provider_kill_switch boolean not null default false,
  status text not null default 'disconnected',
  last_status_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.execution_provider_controls add column if not exists provider text;
alter table public.execution_provider_controls add column if not exists recovery_enabled boolean;
alter table public.execution_provider_controls add column if not exists kill_switch boolean;

update public.execution_provider_controls
set provider = provider_name
where provider is null;

alter table public.execution_provider_controls alter column provider set default '';

create unique index if not exists idx_execution_provider_controls_provider
  on public.execution_provider_controls(provider);
create index if not exists idx_execution_provider_controls_primary
  on public.execution_provider_controls(primary_provider)
  where primary_provider is true;

insert into public.execution_provider_controls(
  provider_name, provider, enabled, parallel_enabled, primary_provider, read_only,
  profit_lock_enabled, monitor_enabled, protection_recovery_enabled, recovery_enabled,
  provider_kill_switch, kill_switch, status, metadata
)
values
  ('binance', 'binance', true, false, true, false, false, true, true, true, false, false, 'connected', '{"seeded_by":"073_provider_controls_e2e_repair"}'::jsonb),
  ('bybit', 'bybit', false, false, false, true, false, false, false, false, false, false, 'disconnected', '{"seeded_by":"073_provider_controls_e2e_repair"}'::jsonb),
  ('mt5', 'mt5', false, false, false, true, false, false, false, false, false, false, 'disconnected', '{"seeded_by":"073_provider_controls_e2e_repair","placeholder":true}'::jsonb)
on conflict (provider_name) do update set
  provider = excluded.provider,
  parallel_enabled = false,
  read_only = case when excluded.provider_name = 'binance' then public.execution_provider_controls.read_only else true end,
  monitor_enabled = case when excluded.provider_name = 'binance' then coalesce(public.execution_provider_controls.monitor_enabled, true) else false end,
  protection_recovery_enabled = case when excluded.provider_name = 'binance' then coalesce(public.execution_provider_controls.protection_recovery_enabled, true) else false end,
  recovery_enabled = case when excluded.provider_name = 'binance' then coalesce(public.execution_provider_controls.recovery_enabled, public.execution_provider_controls.protection_recovery_enabled, true) else false end,
  provider_kill_switch = false,
  kill_switch = false,
  primary_provider = excluded.provider_name = 'binance',
  updated_at = now();

create table if not exists public.execution_provider_global_controls (
  id integer primary key default 1 check (id = 1),
  primary_provider text not null default 'binance' check (primary_provider in ('binance','bybit','mt5')),
  parallel_mode_enabled boolean not null default false,
  live_trading_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.execution_provider_global_controls(id, primary_provider, parallel_mode_enabled, live_trading_enabled)
values (1, 'binance', false, false)
on conflict (id) do update set
  primary_provider = 'binance',
  parallel_mode_enabled = false,
  live_trading_enabled = false,
  updated_at = now();

create table if not exists public.provider_parity_audit (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid,
  execution_group_id uuid,
  event_type text not null,
  symbol text not null,
  direction text,
  binance_execution_id uuid,
  bybit_execution_id uuid,
  binance_status text,
  bybit_status text,
  binance_fill_latency_ms integer,
  bybit_fill_latency_ms integer,
  fill_latency_diff_ms integer,
  binance_fill_price numeric,
  bybit_fill_price numeric,
  fill_price_diff numeric,
  binance_slippage numeric,
  bybit_slippage numeric,
  slippage_diff numeric,
  binance_protection_success boolean,
  bybit_protection_success boolean,
  binance_protection_verified boolean,
  bybit_protection_verified boolean,
  binance_recovery_success boolean,
  bybit_recovery_success boolean,
  binance_profit_lock_success boolean,
  bybit_profit_lock_success boolean,
  binance_close_success boolean,
  bybit_close_success boolean,
  best_provider text,
  fastest_provider text,
  most_reliable_provider text,
  safest_provider text,
  lowest_slippage_provider text,
  highest_profit_provider text,
  parity_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_parity_audit_signal_group on public.provider_parity_audit(signal_id, execution_group_id, created_at desc);
create index if not exists idx_provider_parity_audit_event_type on public.provider_parity_audit(event_type, created_at desc);
create index if not exists idx_provider_parity_audit_created_at on public.provider_parity_audit(created_at desc);

create or replace view public.provider_execution_performance as
select provider_name,
       count(e.id) as executions,
       count(e.id) filter (where e.status in ('closed_tp','closed_tp2','closed_profit_lock')) as wins,
       count(e.id) filter (where e.status = 'closed_sl') as losses,
       count(e.id) filter (where e.status in ('failed','skipped','cancelled')) as execution_failures,
       count(e.id) filter (where e.protection_status in ('protected','protected_native','protected_managed','protection_recovered')) as protected_count,
       count(e.id) filter (where e.protection_status in ('protection_failed','unprotected_failed')) as protection_failures,
       count(e.id) filter (where e.profit_lock_sl_active is true or e.profit_lock_status = 'locked' or e.status = 'closed_profit_lock') as profit_lock_successes,
       avg(e.provider_slippage) as avg_slippage,
       avg(extract(epoch from (coalesce(e.tp2_closed_at, e.sl_closed_at, e.timeout_closed_at, e.updated_at) - coalesce(e.opened_at, e.entry_filled_at, e.created_at))) / 60.0) as avg_hold_minutes
from (values ('binance'), ('bybit'), ('mt5')) as p(provider_name)
left join public.execution_orders e on coalesce(e.execution_provider, 'binance') = p.provider_name
group by p.provider_name;

alter table public.execution_provider_controls enable row level security;
alter table public.execution_provider_global_controls enable row level security;
alter table public.provider_parity_audit enable row level security;

drop policy if exists "Admins can read execution provider controls" on public.execution_provider_controls;
create policy "Admins can read execution provider controls" on public.execution_provider_controls for select to authenticated using (public.is_admin());
drop policy if exists "Admins can update execution provider controls" on public.execution_provider_controls;
create policy "Admins can update execution provider controls" on public.execution_provider_controls for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can read execution provider global controls" on public.execution_provider_global_controls;
create policy "Admins can read execution provider global controls" on public.execution_provider_global_controls for select to authenticated using (public.is_admin());
drop policy if exists "Admins can update execution provider global controls" on public.execution_provider_global_controls;
create policy "Admins can update execution provider global controls" on public.execution_provider_global_controls for update to authenticated using (public.is_admin()) with check (public.is_admin() and live_trading_enabled is false);

drop policy if exists "Admins can read provider parity audit" on public.provider_parity_audit;
create policy "Admins can read provider parity audit" on public.provider_parity_audit for select to authenticated using (public.is_admin());
