-- Phase X-D: Bybit adapter + parallel provider execution lab schema.
-- Additive only. Does not alter scanner, signals, or legacy Binance behavior.

create table if not exists public.execution_provider_controls (
  provider_name text primary key,
  enabled boolean not null default false,
  parallel_enabled boolean not null default false,
  primary_provider boolean not null default false,
  read_only boolean not null default true,
  profit_lock_enabled boolean not null default false,
  monitor_enabled boolean not null default true,
  protection_recovery_enabled boolean not null default false,
  provider_kill_switch boolean not null default false,
  status text not null default 'disconnected',
  last_status_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint execution_provider_controls_provider_check check (provider_name in ('binance', 'bybit', 'mt5')),
  constraint execution_provider_controls_status_check check (status in ('connected', 'disconnected', 'degraded', 'protection_risk', 'monitor_risk', 'recovery_risk'))
);

insert into public.execution_provider_controls(provider_name, enabled, parallel_enabled, primary_provider, read_only, profit_lock_enabled, monitor_enabled, protection_recovery_enabled, status)
values
  ('binance', true, false, true, false, true, true, true, 'connected'),
  ('bybit', false, false, false, true, false, true, false, 'disconnected'),
  ('mt5', false, false, false, true, false, false, false, 'disconnected')
on conflict (provider_name) do nothing;

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
  created_at timestamptz not null default now(),
  constraint provider_parity_event_check check (event_type in ('ENTRY','TP1','TP2','SL','BREAKEVEN','PROFIT_LOCK','MANUAL_CLOSE','FORCED_CLOSE','PROTECTION_RECOVERY')),
  constraint provider_parity_status_check check (parity_status in ('pending','matched','diverged','incomplete'))
);

create index if not exists idx_provider_parity_audit_signal_group
  on public.provider_parity_audit(signal_id, execution_group_id, created_at desc);
create index if not exists idx_provider_parity_audit_event_type
  on public.provider_parity_audit(event_type, created_at desc);

create or replace view public.provider_execution_performance as
select
  coalesce(execution_provider, 'binance') as provider_name,
  count(*) as executions,
  count(*) filter (where status in ('closed_tp','closed_tp2','closed_profit_lock')) as wins,
  count(*) filter (where status in ('closed_sl')) as losses,
  count(*) filter (where status in ('failed','skipped','cancelled')) as execution_failures,
  count(*) filter (where protection_status in ('protected','protected_native','protected_managed','protection_recovered')) as protected_count,
  count(*) filter (where protection_status in ('protection_failed','unprotected_failed')) as protection_failures,
  count(*) filter (where profit_lock_sl_active is true or profit_lock_status = 'locked' or status = 'closed_profit_lock') as profit_lock_successes,
  avg(provider_slippage) as avg_slippage,
  avg(extract(epoch from (coalesce(tp2_closed_at, sl_closed_at, timeout_closed_at, updated_at) - coalesce(opened_at, entry_filled_at, created_at))) / 60.0) as avg_hold_minutes
from public.execution_orders
group by coalesce(execution_provider, 'binance');

create or replace view public.provider_research_metrics as
select
  coalesce(execution_provider, 'binance') as provider_name,
  count(*) filter (where tp1_filled is true or tp1_closed_at is not null) as tp1_hits,
  count(*) filter (where (tp1_filled is true or tp1_closed_at is not null) and (tp2_filled is true or tp2_closed_at is not null or status in ('closed_tp','closed_tp2'))) as tp1_to_tp2,
  count(*) filter (where (tp1_filled is true or tp1_closed_at is not null) and sl_moved_to_be is true) as tp1_to_be,
  count(*) filter (where (tp1_filled is true or tp1_closed_at is not null) and status = 'closed_sl') as tp1_to_sl,
  max(highest_positive_r_observed) as mfe_r,
  min(max_adverse_r_observed) as mae_r,
  count(*) filter (where later_reversed_after_positive_excursion is true) as giveback_count,
  count(*) filter (where profit_lock_sl_active is true or status = 'closed_profit_lock') as profit_lock_impact_count,
  count(*) filter (where protection_status in ('protection_failed','unprotected_failed')) as protection_failure_count,
  count(*) filter (where protection_status = 'protection_recovered') as recovery_count,
  avg(provider_slippage) as average_slippage
from public.execution_orders
group by coalesce(execution_provider, 'binance');

comment on table public.provider_parity_audit is 'Per-signal provider comparison audit for Binance vs Bybit lifecycle events.';
comment on view public.provider_execution_performance is 'Provider-separated execution performance; does not mix signal paper statistics.';
comment on view public.provider_research_metrics is 'Provider-separated research metrics for execution behavior.';
