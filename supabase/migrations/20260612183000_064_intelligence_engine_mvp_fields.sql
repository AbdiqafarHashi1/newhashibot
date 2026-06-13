-- HashiBot Intelligence Engine MVP: structured event fields for truthful market intelligence outputs.

alter table if exists public.intelligence_events
  add column if not exists title text not null default '',
  add column if not exists market text not null default 'crypto',
  add column if not exists symbols text[] not null default '{}'::text[],
  add column if not exists sentiment jsonb not null default '{}'::jsonb,
  add column if not exists regime text not null default 'neutral',
  add column if not exists confidence integer not null default 0,
  add column if not exists data_sources jsonb not null default '{}'::jsonb,
  add column if not exists freshness jsonb not null default '{}'::jsonb,
  add column if not exists output_channel text[] not null default '{}'::text[];

create index if not exists idx_intelligence_events_status_created_at on public.intelligence_events(status, created_at desc);
create index if not exists idx_intelligence_events_regime_created_at on public.intelligence_events(regime, created_at desc);

create or replace view public.intelligence_event_health as
select
  event_type,
  max(created_at) as last_generated_at,
  count(*) filter (where status in ('generated', 'partial')) as generated_count,
  count(*) filter (where status = 'failed') as failed_count,
  (array_agg(status order by created_at desc))[1] as last_status,
  (array_agg(confidence order by created_at desc))[1] as last_confidence
from public.intelligence_events
group by event_type;
