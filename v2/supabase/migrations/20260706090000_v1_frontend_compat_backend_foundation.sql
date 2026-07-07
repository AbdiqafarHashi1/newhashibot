/*
  HashiBot Recovery Phase 2 — V1 frontend compatibility over clean V2 backend.
  Rules enforced here:
    - Supabase is durable persistence only.
    - No raw candles, indicator snapshots, runtime loops, heartbeat spam, per-candle traces, or debug payload tables.
    - V1-facing contracts are compact views/RPCs over V2 tables.
*/

create extension if not exists pgcrypto;

create table if not exists public.v2_symbols (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  display_name text not null,
  market_type text not null check (market_type in ('crypto','forex')),
  provider text not null default 'binance',
  is_active boolean not null default true,
  notes text not null default '',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_approved_signals (
  id uuid primary key default gen_random_uuid(),
  external_signal_id text unique,
  symbol text not null,
  market_type text not null check (market_type in ('crypto','forex')),
  timeframe text not null,
  direction text not null check (direction in ('long','short','buy','sell')),
  entry_type text not null default 'zone',
  entry_low numeric,
  entry_high numeric,
  stop_loss numeric,
  tp1 numeric,
  tp2 numeric,
  tp3 numeric,
  risk_reward numeric,
  strategy_name text not null,
  regime text not null default 'unclear',
  grade text not null default 'B',
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  reason text not null default '',
  invalidation text not null default '',
  status text not null default 'waiting' check (status in ('new','approved','waiting','active','tp1_hit','tp2_hit','closed','expired','cancelled','failed')),
  source text not null default 'v2_engine',
  data_source text not null default 'REAL DATA',
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_approved_signals_no_raw_payload check (not (metadata ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','indicatorSnapshots','debugPayload']))
);

create table if not exists public.v2_signal_events (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.v2_approved_signals(id) on delete cascade,
  event_type text not null,
  old_status text,
  new_status text,
  message text not null default '',
  price numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_signal_events_no_raw_payload check (not (metadata ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','indicatorSnapshots','debugPayload']))
);

create table if not exists public.v2_scanner_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'scheduled',
  source text not null default 'v2_scanner',
  triggered_by text not null default 'system',
  is_automatic boolean not null default false,
  status text not null default 'running' check (status in ('running','success','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  symbols_scanned integer not null default 0,
  signals_created integer not null default 0,
  telegram_sent_count integer not null default 0,
  telegram_failed_count integer not null default 0,
  compact_summary jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  constraint v2_scanner_runs_no_raw_payload check (not (compact_summary ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','debugPayload']))
);

create table if not exists public.v2_scanner_config (
  id integer primary key default 1 check (id = 1),
  is_enabled boolean not null default false,
  schedule_enabled boolean not null default false,
  auto_send_telegram boolean not null default false,
  allow_demo_telegram_sending boolean not null default false,
  min_signal_grade text not null default 'B',
  min_auto_send_grade text not null default 'A',
  cron_job_active boolean not null default false,
  cron_job_name text not null default 'hashibot-v2-scanner',
  heartbeat_status text not null default 'inactive',
  heartbeat_updated_at timestamptz,
  latest_success_at timestamptz,
  latest_error text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_provider_health_history (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  market_type text not null default 'crypto',
  status text not null default 'unknown',
  last_success_at timestamptz,
  last_error_at timestamptz,
  error_message text not null default '',
  compact_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_provider_health_no_debug_payload check (not (compact_metrics ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','debugPayload']))
);

create table if not exists public.v2_runtime_events_compact (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  event_type text not null,
  severity text not null default 'info',
  message text not null default '',
  compact_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_runtime_events_no_debug_payload check (not (compact_context ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','debugPayload']))
);


create table if not exists public.v2_operational_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('table_size','storage','egress','cleanup','weekly_archive')),
  period_start timestamptz not null default date_trunc('day', now()),
  period_end timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_operational_reports_no_debug_payload check (not (summary ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace','debugPayload']))
);
create index if not exists v2_operational_reports_type_created_idx on public.v2_operational_reports(report_type, created_at desc);
alter table public.v2_operational_reports enable row level security;
drop policy if exists v2_operational_reports_service_all on public.v2_operational_reports;
create policy v2_operational_reports_service_all on public.v2_operational_reports for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists v2_operational_reports_operator_read on public.v2_operational_reports;
create policy v2_operational_reports_operator_read on public.v2_operational_reports for select using (public.is_operator());

insert into public.v2_scanner_config(id) values (1) on conflict (id) do nothing;
insert into public.v2_symbols(symbol,display_name,market_type,provider,sort_order) values
 ('BTCUSDT','Bitcoin / USDT','crypto','binance',10),('ETHUSDT','Ethereum / USDT','crypto','binance',20),('SOLUSDT','Solana / USDT','crypto','binance',30),('BNBUSDT','BNB / USDT','crypto','binance',40),('XRPUSDT','XRP / USDT','crypto','binance',50),('ADAUSDT','Cardano / USDT','crypto','binance',60),('DOGEUSDT','Dogecoin / USDT','crypto','binance',70),('AVAXUSDT','Avalanche / USDT','crypto','binance',80),('LINKUSDT','Chainlink / USDT','crypto','binance',90),('POLUSDT','Polygon / USDT','crypto','binance',100)
on conflict (symbol) do update set display_name=excluded.display_name, market_type=excluded.market_type, provider=excluded.provider, sort_order=excluded.sort_order, updated_at=now();

create index if not exists v2_approved_signals_status_idx on public.v2_approved_signals(status, created_at desc);
create index if not exists v2_approved_signals_market_idx on public.v2_approved_signals(market_type, status, created_at desc);
create index if not exists v2_signal_events_signal_idx on public.v2_signal_events(signal_id, created_at desc);
create index if not exists v2_scanner_runs_started_idx on public.v2_scanner_runs(started_at desc, run_type);
create index if not exists v2_provider_health_latest_idx on public.v2_provider_health_history(provider_name, created_at desc);
create index if not exists v2_runtime_events_compact_created_idx on public.v2_runtime_events_compact(scope, created_at desc);

alter table public.v2_symbols enable row level security;
alter table public.v2_approved_signals enable row level security;
alter table public.v2_signal_events enable row level security;
alter table public.v2_scanner_runs enable row level security;
alter table public.v2_scanner_config enable row level security;
alter table public.v2_provider_health_history enable row level security;
alter table public.v2_runtime_events_compact enable row level security;

do $$ declare t text; begin
  foreach t in array array['v2_symbols','v2_approved_signals','v2_signal_events','v2_scanner_runs','v2_scanner_config','v2_provider_health_history','v2_runtime_events_compact'] loop
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format('create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t || '_service_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_operator_read', t);
    execute format('create policy %I on public.%I for select using (public.is_operator())', t || '_operator_read', t);
  end loop;
end $$;

drop view if exists public.symbols;
create view public.symbols as
select id, symbol, display_name, market_type, provider, is_active, notes, created_at from public.v2_symbols;

drop view if exists public.signals;
create view public.signals as
select id, symbol, market_type, timeframe, direction, entry_type, entry_low, entry_high, stop_loss, tp1, tp2, tp3, risk_reward, strategy_name, regime, grade, confidence_score, reason, invalidation, status, source, data_source, created_at, updated_at from public.v2_approved_signals;

drop view if exists public.signal_updates;
create view public.signal_updates as
select id, signal_id, event_type as update_type, old_status, new_status, message, price, created_at, new_status as reason from public.v2_signal_events;

drop view if exists public.scanner_runs;
create view public.scanner_runs as
select id, started_at, finished_at, status, symbols_scanned, 0::integer as candles_fetched, 0::integer as candidates_found, signals_created, error_message, created_at, run_type, source, triggered_by, is_automatic, telegram_sent_count, telegram_failed_count from public.v2_scanner_runs;

drop view if exists public.scanner_config;
create view public.scanner_config as
select id, is_enabled, schedule_enabled, auto_send_telegram, allow_demo_telegram_sending, min_signal_grade, min_auto_send_grade, cron_job_active, cron_job_name, heartbeat_status, heartbeat_updated_at, latest_success_at, latest_error, updated_at from public.v2_scanner_config;

drop view if exists public.provider_status;
create view public.provider_status as
select distinct on (provider_name) id, provider_name, market_type, status, last_success_at, last_error_at, error_message, created_at as updated_at
from public.v2_provider_health_history order by provider_name, created_at desc;

drop view if exists public.strategy_candidates;
create view public.strategy_candidates as
select id, null::uuid as scanner_run_id, symbol, market_type, timeframe, strategy_name, direction, entry_low, entry_high, stop_loss, tp1, tp2, risk_reward, regime, confidence_score, grade, reason, ''::text as rejection_reason, status, created_at from public.v2_approved_signals where false;

drop view if exists public.telegram_deliveries;
create view public.telegram_deliveries as
select l.id, null::uuid as signal_id, coalesce(q.template_key,'telegram') as delivery_type, ''::text as chat_id, l.status::text as status, l.provider_message_id as telegram_message_id, l.error as error_message, l.created_at, c.channel_key as destination_channel, l.status::text as delivery_status, 0::integer as retry_count
from public.telegram_delivery_logs l
left join public.telegram_delivery_queue q on q.id = l.queue_id
left join public.telegram_channels c on c.id = l.channel_id;

drop view if exists public.audit_logs;
create view public.audit_logs as
select id, actor_user_id, action, entity_type, entity_id::text, coalesce(after_state, '{}'::jsonb) as metadata, created_at from public.audit_log;

create or replace function public.v1_compat_scanner_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'latest_run', (select to_jsonb(r) from public.scanner_runs r order by started_at desc limit 1),
    'scheduled_24h', (select count(*) from public.v2_scanner_runs where run_type='scheduled' and started_at > now() - interval '24 hours'),
    'signals_24h', (select count(*) from public.v2_approved_signals where created_at > now() - interval '24 hours'),
    'active_symbols', (select count(*) from public.v2_symbols where is_active),
    'storage_policy', 'no_raw_candles_no_indicator_snapshots'
  )
$$;

create or replace function public.v1_compat_monitoring_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'scanner', public.v1_compat_scanner_summary(),
    'execution', jsonb_build_object('queued', (select count(*) from public.v2_execution_commands where status in ('QUEUED','RETRY_SCHEDULED')), 'dead_lettered', (select count(*) from public.v2_execution_commands where status='DEAD_LETTERED'), 'active_trades', (select count(*) from public.v2_trade_truth where status='active' and archived_at is null)),
    'telegram', jsonb_build_object('queued', (select count(*) from public.telegram_delivery_queue where status='queued'), 'failed_24h', (select count(*) from public.telegram_delivery_logs where status='failed' and created_at > now() - interval '24 hours')),
    'provider', jsonb_build_object('latest', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.provider_status p)),
    'runtime', jsonb_build_object('events_24h', (select count(*) from public.v2_runtime_events_compact where created_at > now() - interval '24 hours')),
    'health', jsonb_build_object('generated_at', now(), 'contract', 'v1_compat_v2_backend')
  )
$$;

create or replace function public.v1_compat_table_size_report()
returns table(table_name text, approx_rows bigint, retention_policy text) language sql stable security definer set search_path=public as $$
  values
    ('v2_scanner_runs', (select count(*) from public.v2_scanner_runs), '30 days'),
    ('telegram_delivery_queue', (select count(*) from public.telegram_delivery_queue), '14 days'),
    ('telegram_delivery_logs', (select count(*) from public.telegram_delivery_logs), '14 days'),
    ('v2_runtime_events_compact', (select count(*) from public.v2_runtime_events_compact), '30 days'),
    ('v2_provider_health_history', (select count(*) from public.v2_provider_health_history), '30 days'),
    ('v2_execution_command_events', (select count(*) from public.v2_execution_command_events), '90 days'),
    ('audit_log', (select count(*) from public.audit_log), '180 days'),
    ('research_runs', (select count(*) from public.research_runs), '180 days')
$$;

create or replace function public.v2_recovery_cleanup(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb := '{}'::jsonb; n integer; rid uuid; table_name text; older_than interval;
begin
  insert into public.platform_cleanup_runs(mode, scope, safety) values (case when p_dry_run then 'dry_run' else 'cleanup' end, 'v1_compat_retention', jsonb_build_object('archive_before_delete', true)) returning id into rid;
  create temp table if not exists recovery_retention(table_name text, older_than interval) on commit drop;
  truncate recovery_retention;
  insert into recovery_retention values
    ('v2_scanner_runs','30 days'),('telegram_delivery_queue','14 days'),('telegram_delivery_logs','14 days'),('v2_runtime_events_compact','30 days'),('v2_provider_health_history','30 days'),('v2_execution_command_events','90 days'),('audit_log','180 days'),('research_runs','180 days');
  for table_name, older_than in select * from recovery_retention loop
    execute format('select count(*) from public.%I where created_at < now() - $1', table_name) using older_than into n;
    result := result || jsonb_build_object(table_name, n);
    if not p_dry_run and n > 0 then
      execute format('insert into public.platform_archive_events(source_table, source_id, reason, compact_record) select %L, null, %L, to_jsonb(t) - ''payload'' - ''metadata'' from public.%I t where created_at < now() - $1', table_name, 'v1_compat_retention', table_name) using older_than;
      execute format('delete from public.%I where created_at < now() - $1', table_name) using older_than;
    end if;
  end loop;
  update public.platform_cleanup_runs set completed_at=now(), affected_rows=result where id=rid;
  return jsonb_build_object('run_id', rid, 'dry_run', p_dry_run, 'affected_rows', result);
end $$;


create or replace function public.v2_record_operational_report(p_report_type text)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; payload jsonb;
begin
  if p_report_type = 'table_size' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into payload from public.v1_compat_table_size_report() r;
  elsif p_report_type = 'storage' then
    payload := jsonb_build_object('policy','no_supabase_runtime_market_storage','raw_market_tables',0,'generated_at',now());
  elsif p_report_type = 'egress' then
    payload := jsonb_build_object('policy','dashboards_use_compact_rpc_summaries','raw_polling_contract','deprecated','generated_at',now());
  elsif p_report_type = 'cleanup' then
    payload := public.v2_recovery_cleanup(true);
  elsif p_report_type = 'weekly_archive' then
    payload := jsonb_build_object('archive_policy','archive_before_delete','dry_run',true,'cleanup',public.v2_recovery_cleanup(true));
  else
    raise exception 'unsupported report type %', p_report_type;
  end if;
  insert into public.v2_operational_reports(report_type, summary) values (p_report_type, payload) returning id into rid;
  return rid;
end $$;

create or replace function public.v2_install_recovery_cron_jobs()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('hashibot_v2_daily_cleanup_dry_run','15 2 * * *','select public.v2_record_operational_report(''cleanup'');');
  perform cron.schedule('hashibot_v2_daily_table_size_report','25 2 * * *','select public.v2_record_operational_report(''table_size'');');
  perform cron.schedule('hashibot_v2_daily_storage_report','35 2 * * *','select public.v2_record_operational_report(''storage'');');
  perform cron.schedule('hashibot_v2_daily_egress_report','45 2 * * *','select public.v2_record_operational_report(''egress'');');
  perform cron.schedule('hashibot_v2_weekly_archive_dry_run','5 3 * * 0','select public.v2_record_operational_report(''weekly_archive'');');
  return jsonb_build_object('installed', true, 'mode', 'dry_run_reports_only', 'production_cutover', false);
end $$;

revoke execute on function public.v2_recovery_cleanup(boolean) from anon;
revoke execute on function public.v2_install_recovery_cron_jobs() from anon;
notify pgrst, 'reload schema';
