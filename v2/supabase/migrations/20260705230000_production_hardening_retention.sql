-- HashiBot V2 final platform hardening: retention, archive, compact summaries, dev reset.

create table if not exists public.platform_archive_events (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text,
  archived_at timestamptz not null default now(),
  reason text not null,
  compact_record jsonb not null default '{}'::jsonb
);
alter table public.platform_archive_events enable row level security;
drop policy if exists platform_archive_service_all on public.platform_archive_events;
create policy platform_archive_service_all on public.platform_archive_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists public.platform_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text not null default 'system',
  mode text not null check (mode in ('dry_run','cleanup','archive','reset')),
  scope text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  affected_rows jsonb not null default '{}'::jsonb,
  safety jsonb not null default '{}'::jsonb
);
alter table public.platform_cleanup_runs enable row level security;
drop policy if exists platform_cleanup_runs_service_all on public.platform_cleanup_runs;
create policy platform_cleanup_runs_service_all on public.platform_cleanup_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');


alter table public.runtime_health add column if not exists created_at timestamptz not null default now();
alter table public.provider_health add column if not exists created_at timestamptz not null default now();
alter table public.queue_health add column if not exists created_at timestamptz not null default now();
alter table public.runtime_actions add column if not exists created_at timestamptz not null default now();
alter table public.runtime_metrics add column if not exists created_at timestamptz not null default now();
alter table public.v2_mt5_terminals add column if not exists created_at timestamptz not null default now();
alter table public.v2_idempotency_keys add column if not exists created_at timestamptz not null default now();
alter table public.engine_events add column if not exists created_at timestamptz not null default now();

create or replace function public.v2_compact_monitoring_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'runtime', jsonb_build_object('events_24h', (select count(*) from runtime_health where created_at > now() - interval '24 hours'), 'actions_queued', (select count(*) from runtime_actions where status = 'queued')),
    'executor', jsonb_build_object('total', (select count(*) from executor_runtime), 'stale_heartbeats', (select count(*) from executor_runtime where heartbeat_at < now() - interval '5 minutes')),
    'provider', jsonb_build_object('metrics_1h', (select count(*) from provider_health where created_at > now() - interval '1 hour')),
    'queue', jsonb_build_object('pending', (select count(*) from v2_execution_commands where status in ('QUEUED','RETRY_SCHEDULED','LOCKED','RUNNING'))),
    'telegram', jsonb_build_object('queued', (select count(*) from telegram_delivery_queue where status = 'queued'), 'failed_24h', (select count(*) from telegram_delivery_logs where status = 'failed' and created_at > now() - interval '24 hours')),
    'customer', jsonb_build_object('active', (select count(*) from customers where status = 'active')),
    'subscription', jsonb_build_object('active', (select count(*) from subscriptions where status = 'active')),
    'mt5', jsonb_build_object('terminals', (select count(*) from v2_mt5_terminals), 'v2_bridge_logs_24h', (select count(*) from v2_bridge_logs where created_at > now() - interval '24 hours')),
    'research', jsonb_build_object('runs_7d', (select count(*) from research_runs where created_at > now() - interval '7 days')),
    'health', jsonb_build_object('generated_at', now(), 'payload', 'compact'),
    'dashboard', jsonb_build_object('storage_policy', 'engine_events_trade_state_audit_notifications_summaries_only')
  )
$$;

create or replace function public.v2_cleanup_retained_data(p_dry_run boolean default true, p_archive boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb := '{}'::jsonb; n integer; run_id uuid;
begin
  insert into platform_cleanup_runs(mode, scope, safety) values (case when p_dry_run then 'dry_run' when p_archive then 'archive' else 'cleanup' end, 'retention', jsonb_build_object('no_active_data', true)) returning id into run_id;
  create temp table if not exists v2_retention_targets(table_name text, older_than interval) on commit drop;
  truncate v2_retention_targets;
  insert into v2_retention_targets values
    ('audit_log','365 days'),('notifications','180 days'),('engine_events','90 days'),('runtime_health','30 days'),('telegram_delivery_queue','14 days'),('telegram_delivery_logs','90 days'),('runtime_metrics','30 days'),('provider_health','30 days'),('queue_health','30 days'),('v2_bridge_logs','30 days'),('research_runs','180 days'),('research_reports','365 days'),('shadow_test_results','90 days'),('executor_events','90 days'),('runtime_actions','90 days');
  for table_name, older_than in select * from v2_retention_targets loop
    execute format('select count(*) from public.%I where coalesce(created_at, now()) < now() - $1', table_name) using older_than into n;
    result := result || jsonb_build_object(table_name, n);
    if not p_dry_run and n > 0 then
      if p_archive then
        execute format('insert into platform_archive_events(source_table, source_id, reason, compact_record) select %L, null, %L, to_jsonb(t) - ''payload'' from public.%I t where coalesce(created_at, now()) < now() - $1', table_name, 'retention_window', table_name) using older_than;
      end if;
      execute format('delete from public.%I where coalesce(created_at, now()) < now() - $1', table_name) using older_than;
    end if;
  end loop;
  update platform_cleanup_runs set completed_at = now(), affected_rows = result where id = run_id;
  return jsonb_build_object('run_id', run_id, 'dry_run', p_dry_run, 'archive', p_archive, 'affected_rows', result);
end $$;

create or replace function public.v2_dev_reset(p_confirmation text, p_scopes text[] default array['engine_events','trades','queues','monitoring','telegram','research','mt5'], p_dry_run boolean default true, p_force_live boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb := '{}'::jsonb; n integer; run_id uuid; prod boolean;
begin
  if p_confirmation <> 'RESET HASHIBOT V2 NONPROD' then raise exception 'invalid reset confirmation phrase'; end if;
  prod := coalesce((select (value->>'environment') = 'production' and coalesce((value->>'allow_dev_reset')::boolean,false) = false from system_settings where key = 'environment' limit 1), false);
  if prod then raise exception 'dev reset is disabled in production'; end if;
  if not p_force_live and exists (select 1 from executor_runtime where state in ('Running')) then raise exception 'active live/runtime executors block reset'; end if;
  insert into platform_cleanup_runs(mode, scope, safety) values ('reset', array_to_string(p_scopes,','), jsonb_build_object('dry_run', p_dry_run, 'force_live', p_force_live)) returning id into run_id;
  foreach table_name in array array['engine_events','v2_trade_truth','v2_trade_truth','v2_execution_commands','v2_idempotency_keys','telegram_delivery_queue','telegram_delivery_logs','runtime_health','runtime_metrics','provider_health','queue_health','research_runs','research_reports','executor_events','notifications','engine_events','v2_bridge_logs'] loop
    if p_dry_run then execute format('select count(*) from public.%I', table_name) into n; else execute format('delete from public.%I', table_name); get diagnostics n = row_count; end if;
    result := result || jsonb_build_object(table_name, n);
  end loop;
  update platform_cleanup_runs set completed_at = now(), affected_rows = result where id = run_id;
  perform platform_audit('dev_reset.requested','platform_cleanup_runs',run_id,null,jsonb_build_object('dry_run',p_dry_run,'scopes',p_scopes,'affected_rows',result));
  return jsonb_build_object('run_id', run_id, 'dry_run', p_dry_run, 'affected_rows', result);
end $$;

create index if not exists idx_platform_archive_events_source on public.platform_archive_events(source_table, archived_at desc);
create index if not exists idx_platform_cleanup_runs_scope on public.platform_cleanup_runs(scope, requested_at desc);
