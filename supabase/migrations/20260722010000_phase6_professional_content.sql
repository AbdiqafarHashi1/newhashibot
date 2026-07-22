-- Phase 6 content control plane. Delivery remains owned by the ROOT Telegram router.
create table if not exists public.telegram_content_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('briefing','news','analysis','signal','trade_lifecycle','performance','education','customer','admin','broadcast','alert')),
  template_key text not null,
  title text not null,
  rendered_text text not null check (length(rendered_text) between 1 and 4096),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','published','disabled','rejected')),
  version integer not null default 1 check (version > 0),
  scheduled_at timestamptz,
  published_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  search_document tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(rendered_text,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_publish_requires_approval check (status <> 'published' or approved_at is not null)
);
create index if not exists telegram_content_queue_idx on public.telegram_content_items(status, scheduled_at) where status in ('approved','scheduled');
create index if not exists telegram_content_category_idx on public.telegram_content_items(category, created_at desc);
create index if not exists telegram_content_search_idx on public.telegram_content_items using gin(search_document);

create table if not exists public.telegram_content_history (
  id bigint generated always as identity primary key,
  content_id uuid not null references public.telegram_content_items(id) on delete cascade,
  version integer not null,
  action text not null check (action in ('created','edited','submitted','approved','rejected','scheduled','published','disabled','test_published')),
  actor_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(content_id, version, action)
);
create index if not exists telegram_content_history_lookup_idx on public.telegram_content_history(content_id, created_at desc);

alter table public.telegram_content_items enable row level security;
alter table public.telegram_content_history enable row level security;
drop policy if exists telegram_content_admin_all on public.telegram_content_items;
create policy telegram_content_admin_all on public.telegram_content_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists telegram_content_history_admin_read on public.telegram_content_history;
create policy telegram_content_history_admin_read on public.telegram_content_history for select to authenticated using (public.is_admin());

-- Compact retention: retain the audit trail for one year; canonical performance truth remains elsewhere.
create or replace function public.cleanup_telegram_content_history(p_before timestamptz default now() - interval '365 days', p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  with doomed as (select id from telegram_content_history where created_at < p_before order by created_at limit greatest(1, least(p_limit, 5000)))
  delete from telegram_content_history where id in (select id from doomed);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;
revoke all on function public.cleanup_telegram_content_history(timestamptz, integer) from public;
grant execute on function public.cleanup_telegram_content_history(timestamptz, integer) to service_role;
