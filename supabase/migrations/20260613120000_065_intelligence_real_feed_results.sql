-- HashiBot real intelligence feed results and health view.

create table if not exists public.intelligence_feed_results (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  feed_type text not null,
  value jsonb,
  classification text not null default 'unavailable',
  source text not null default 'unavailable',
  freshness text not null default 'Data unavailable',
  status text not null default 'unavailable' check (status in ('available', 'unavailable', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.intelligence_feed_results enable row level security;

drop policy if exists "Admins can read intelligence feed results" on public.intelligence_feed_results;
create policy "Admins can read intelligence feed results"
  on public.intelligence_feed_results for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists idx_intelligence_feed_results_type_created_at on public.intelligence_feed_results(feed_type, created_at desc);
create index if not exists idx_intelligence_feed_results_event_id on public.intelligence_feed_results(event_id);

create or replace view public.intelligence_feed_health as
select distinct on (feed_type)
  feed_type,
  status,
  classification,
  source,
  freshness,
  error_message,
  created_at as last_updated_at
from public.intelligence_feed_results
order by feed_type, created_at desc;
