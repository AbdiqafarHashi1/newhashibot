-- HashiBot Telegram product layer: router, channels, delivery logging, orchestration, intelligence foundation.

alter table if exists public.telegram_deliveries
  add column if not exists event_id text,
  add column if not exists event_type text,
  add column if not exists destination_channel text,
  add column if not exists destination_chat_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivery_status text,
  add column if not exists retry_count integer not null default 0;

update public.telegram_deliveries
set event_id = coalesce(event_id, signal_id::text, id::text),
    event_type = coalesce(event_type, delivery_type),
    destination_channel = coalesce(destination_channel, 'vip'),
    destination_chat_id = coalesce(destination_chat_id, chat_id),
    sent_at = coalesce(sent_at, case when status = 'sent' then created_at else null end),
    delivery_status = coalesce(delivery_status, status),
    retry_count = coalesce(retry_count, 0)
where event_id is null
   or event_type is null
   or destination_channel is null
   or destination_chat_id is null
   or delivery_status is null;

alter table if exists public.telegram_deliveries
  add constraint telegram_deliveries_destination_channel_check
  check (destination_channel is null or destination_channel in ('admin', 'free', 'vip')) not valid;

create index if not exists idx_telegram_deliveries_event_type_created_at on public.telegram_deliveries(event_type, created_at desc);
create index if not exists idx_telegram_deliveries_destination_channel_created_at on public.telegram_deliveries(destination_channel, created_at desc);
create index if not exists idx_telegram_deliveries_delivery_status_created_at on public.telegram_deliveries(delivery_status, created_at desc);

create table if not exists public.telegram_channel_health (
  channel text primary key check (channel in ('admin', 'free', 'vip')),
  configured boolean not null default false,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_status text,
  last_error text default '',
  updated_at timestamptz not null default now()
);

alter table public.telegram_channel_health enable row level security;

drop policy if exists "Admins can read telegram channel health" on public.telegram_channel_health;
create policy "Admins can read telegram channel health"
  on public.telegram_channel_health for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

insert into public.telegram_channel_health(channel)
values ('admin'), ('free'), ('vip')
on conflict (channel) do nothing;

create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  module text not null,
  status text not null default 'generated',
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.intelligence_events enable row level security;

drop policy if exists "Admins can read intelligence events" on public.intelligence_events;
create policy "Admins can read intelligence events"
  on public.intelligence_events for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists idx_intelligence_events_module_created_at on public.intelligence_events(module, created_at desc);
create index if not exists idx_intelligence_events_event_type_created_at on public.intelligence_events(event_type, created_at desc);

create or replace view public.telegram_delivery_health as
select
  coalesce(destination_channel, 'vip') as destination_channel,
  count(*) filter (where coalesce(delivery_status, status) = 'sent') as sent_count,
  count(*) filter (where coalesce(delivery_status, status) = 'failed') as failed_count,
  count(*) filter (where coalesce(delivery_status, status) = 'skipped') as skipped_count,
  max(sent_at) filter (where coalesce(delivery_status, status) = 'sent') as last_success_at,
  max(created_at) filter (where coalesce(delivery_status, status) = 'failed') as last_failure_at,
  max(created_at) as last_delivery_at
from public.telegram_deliveries
group by coalesce(destination_channel, 'vip');

-- Content orchestration schedules use EAT (UTC+3): 08:00, 12:00, 16:00, 20:00 EAT.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'hashibot_morning_brief_0800_eat',
      '0 5 * * *',
      $cmd$select net.http_post(url := current_setting('app.supabase_url', true) || '/functions/v1/telegram-orchestrator', headers := jsonb_build_object('Content-Type','application/json','x-scanner-cron-secret', current_setting('app.scanner_cron_secret', true)), body := jsonb_build_object('kind','morning_brief'));$cmd$
    );
    perform cron.schedule(
      'hashibot_news_digest_1200_eat',
      '0 9 * * *',
      $cmd$select net.http_post(url := current_setting('app.supabase_url', true) || '/functions/v1/telegram-orchestrator', headers := jsonb_build_object('Content-Type','application/json','x-scanner-cron-secret', current_setting('app.scanner_cron_secret', true)), body := jsonb_build_object('kind','news_digest'));$cmd$
    );
    perform cron.schedule(
      'hashibot_watchlist_patterns_1600_eat',
      '0 13 * * *',
      $cmd$select net.http_post(url := current_setting('app.supabase_url', true) || '/functions/v1/telegram-orchestrator', headers := jsonb_build_object('Content-Type','application/json','x-scanner-cron-secret', current_setting('app.scanner_cron_secret', true)), body := jsonb_build_object('kind','watchlist_pattern_update'));$cmd$
    );
    perform cron.schedule(
      'hashibot_market_wrap_2000_eat',
      '0 17 * * *',
      $cmd$select net.http_post(url := current_setting('app.supabase_url', true) || '/functions/v1/telegram-orchestrator', headers := jsonb_build_object('Content-Type','application/json','x-scanner-cron-secret', current_setting('app.scanner_cron_secret', true)), body := jsonb_build_object('kind','market_wrap'));$cmd$
    );
  end if;
exception when others then
  raise notice 'Telegram product layer cron schedule skipped: %', sqlerrm;
end $do$;
