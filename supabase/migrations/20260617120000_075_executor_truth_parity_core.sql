-- Executor truth parity core: additive provider contract, symbol universe fields, proof views.
alter table public.provider_symbol_cache add column if not exists environment text not null default 'testnet';
alter table public.provider_symbol_cache add column if not exists symbol_base text;
alter table public.provider_symbol_cache add column if not exists provider_symbol text;
alter table public.provider_symbol_cache add column if not exists settle_asset text;
alter table public.provider_symbol_cache add column if not exists contract_type text;
alter table public.provider_symbol_cache add column if not exists qty_step numeric;
alter table public.provider_symbol_cache add column if not exists max_leverage numeric;

update public.provider_symbol_cache
set symbol_base = coalesce(symbol_base, base_asset),
    provider_symbol = coalesce(provider_symbol, symbol),
    settle_asset = coalesce(settle_asset, quote_asset),
    contract_type = coalesce(contract_type, 'linear_perpetual'),
    qty_step = coalesce(qty_step, step_size)
where true;

create table if not exists public.provider_truth_snapshots (
  provider text not null,
  environment text not null default 'testnet',
  api_key_exists boolean not null default false,
  api_secret_exists boolean not null default false,
  account_reachable boolean not null default false,
  wallet_reachable boolean not null default false,
  positions_reachable boolean not null default false,
  open_orders_reachable boolean not null default false,
  instruments_reachable boolean not null default false,
  order_creation_allowed boolean not null default false,
  can_submit_entry boolean not null default false,
  can_submit_sl boolean not null default false,
  can_submit_tp boolean not null default false,
  monitor_running boolean not null default false,
  last_monitor_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  latest_error text,
  health_status text not null default 'DISCONNECTED',
  wallet_balance numeric,
  available_balance numeric,
  margin_balance numeric,
  unrealized_pnl numeric,
  positions_count integer,
  orders_count integer,
  raw_truth jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (provider, environment),
  constraint provider_truth_health_check check (health_status in ('CONNECTED','DEGRADED','DISCONNECTED'))
);

create or replace view public.provider_truth_contract as
select
  p.provider_name as provider,
  coalesce((p.metadata->>'environment'), 'testnet') as environment,
  coalesce(t.api_key_exists, false) as api_key_exists,
  coalesce(t.api_secret_exists, false) as api_secret_exists,
  coalesce(t.account_reachable, p.status in ('connected','degraded')) as account_reachable,
  coalesce(t.wallet_reachable, false) as wallet_reachable,
  coalesce(t.positions_reachable, false) as positions_reachable,
  coalesce(t.open_orders_reachable, false) as open_orders_reachable,
  coalesce(t.instruments_reachable, false) as instruments_reachable,
  coalesce(t.order_creation_allowed, false) as order_creation_allowed,
  coalesce(t.can_submit_entry, p.entry_enabled and not coalesce(p.provider_kill_switch, false) and not coalesce(p.read_only, false)) as can_submit_entry,
  coalesce(t.can_submit_sl, coalesce(p.protection_recovery_enabled, false)) as can_submit_sl,
  coalesce(t.can_submit_tp, coalesce(p.protection_recovery_enabled, false)) as can_submit_tp,
  coalesce(t.monitor_running, p.monitor_enabled) as monitor_running,
  t.last_monitor_run_at,
  t.last_success_at,
  t.last_error_at,
  coalesce(t.latest_error, p.last_error) as latest_error,
  case
    when coalesce(t.wallet_reachable,false) and coalesce(t.positions_reachable,false) and coalesce(t.open_orders_reachable,false) and coalesce(t.instruments_reachable,false) then 'CONNECTED'
    when coalesce(t.account_reachable,false) or p.status = 'degraded' then 'DEGRADED'
    else 'DISCONNECTED'
  end as health_status,
  t.wallet_balance,
  t.available_balance,
  t.margin_balance,
  t.unrealized_pnl,
  t.positions_count,
  t.orders_count,
  case when t.updated_at is null then 'db' else 'exchange/api' end as source,
  coalesce(t.updated_at, p.updated_at) as updated_at
from public.execution_provider_controls p
left join public.provider_truth_snapshots t on t.provider = p.provider_name and t.environment = coalesce((p.metadata->>'environment'), 'testnet')
where p.provider_name in ('binance','bybit');

create or replace view public.execution_proof_latest_approved as
select
  s.id as signal_id,
  s.symbol,
  s.grade,
  (s.grade in ('A','A+') and s.market_type = 'crypto') as should_execute,
  exists(select 1 from public.provider_symbol_cache c where c.provider='binance' and c.symbol=s.symbol and upper(c.status)='TRADING') as binance_supported,
  exists(select 1 from public.provider_symbol_cache c where c.provider='bybit' and c.symbol=replace(s.symbol,'USDC','USDT') and upper(c.status)='TRADING') as bybit_supported,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.execution_provider='binance') as binance_row,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.execution_provider='bybit') as bybit_row,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.execution_provider='binance' and e.entry_order_id is not null) as binance_submitted,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.execution_provider='bybit' and e.entry_order_id is not null) as bybit_submitted,
  coalesce((select coalesce(e.latest_auto_skip_reason,e.last_exchange_error,e.error_message) from public.execution_orders e where e.signal_id=s.id and e.execution_provider='binance' order by e.created_at desc limit 1), case when not exists(select 1 from public.provider_symbol_cache c where c.provider='binance' and c.symbol=s.symbol and upper(c.status)='TRADING') then 'binance_symbol_not_supported' end) as binance_blocker,
  coalesce((select coalesce(e.latest_auto_skip_reason,e.last_exchange_error,e.error_message) from public.execution_orders e where e.signal_id=s.id and e.execution_provider='bybit' order by e.created_at desc limit 1), case when not exists(select 1 from public.provider_symbol_cache c where c.provider='bybit' and c.symbol=replace(s.symbol,'USDC','USDT') and upper(c.status)='TRADING') then 'bybit_symbol_not_supported' end) as bybit_blocker,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.native_protection_verified=true) as sl_verified,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.tp1_order_id is not null) as tp1_verified,
  exists(select 1 from public.execution_orders e where e.signal_id=s.id and e.tp2_order_id is not null) as tp2_verified,
  s.created_at
from public.signals s
where s.market_type='crypto' and s.grade in ('A','A+')
order by s.created_at desc
limit 50;
