-- Phase X-D.5: real provider-specific runtime switches. Additive only; live trading remains impossible.
alter table public.execution_provider_controls add column if not exists entry_enabled boolean not null default false;
alter table public.execution_provider_controls add column if not exists last_execution_attempt_at timestamptz;
alter table public.execution_provider_controls add column if not exists last_execution_error text;

update public.execution_provider_controls
set entry_enabled = case when provider_name = 'binance' then coalesce(enabled, false) else coalesce(entry_enabled, false) end,
    monitor_enabled = case when provider_name = 'binance' then coalesce(monitor_enabled, true) else coalesce(monitor_enabled, false) end,
    protection_recovery_enabled = case when provider_name = 'binance' then coalesce(protection_recovery_enabled, true) else coalesce(protection_recovery_enabled, false) end,
    recovery_enabled = case when provider_name = 'binance' then coalesce(recovery_enabled, protection_recovery_enabled, true) else coalesce(recovery_enabled, protection_recovery_enabled, false) end,
    provider_kill_switch = coalesce(provider_kill_switch, false),
    kill_switch = coalesce(kill_switch, provider_kill_switch, false),
    updated_at = now()
where provider_name in ('binance','bybit','mt5');

alter table public.execution_settings add column if not exists emergency_stop boolean not null default false;
alter table public.execution_settings add column if not exists auto_execute_enabled boolean not null default false;

update public.execution_settings
set auto_execute_enabled = coalesce(auto_execute_testnet, false),
    live_trading_enabled = false,
    updated_at = now()
where id = 1;

create or replace view public.execution_runtime_truth as
select
  s.id,
  s.auto_execute_testnet,
  s.auto_execute_enabled,
  s.testnet_enabled,
  s.bot_paused,
  s.kill_switch_enabled,
  s.emergency_stop,
  g.parallel_mode_enabled,
  g.primary_provider,
  g.live_trading_enabled,
  max(p.entry_enabled::int) filter (where p.provider_name = 'binance')::boolean as binance_entry_enabled,
  max(p.monitor_enabled::int) filter (where p.provider_name = 'binance')::boolean as binance_monitor_enabled,
  max(coalesce(p.recovery_enabled, p.protection_recovery_enabled)::int) filter (where p.provider_name = 'binance')::boolean as binance_recovery_enabled,
  max(coalesce(p.kill_switch, p.provider_kill_switch)::int) filter (where p.provider_name = 'binance')::boolean as binance_kill_switch,
  max(p.entry_enabled::int) filter (where p.provider_name = 'bybit')::boolean as bybit_entry_enabled,
  max(p.monitor_enabled::int) filter (where p.provider_name = 'bybit')::boolean as bybit_monitor_enabled,
  max(coalesce(p.recovery_enabled, p.protection_recovery_enabled)::int) filter (where p.provider_name = 'bybit')::boolean as bybit_recovery_enabled,
  max(coalesce(p.kill_switch, p.provider_kill_switch)::int) filter (where p.provider_name = 'bybit')::boolean as bybit_kill_switch
from public.execution_settings s
cross join public.execution_provider_global_controls g
left join public.execution_provider_controls p on p.provider_name in ('binance','bybit')
where s.id = 1 and g.id = 1
group by s.id, g.id;
