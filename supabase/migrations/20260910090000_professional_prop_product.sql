-- Server-authoritative Prop product state. Broker and candle truth deliberately remain elsewhere.
create table if not exists public.prop_account_configs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  profile_version text not null,
  mode text not null check (mode in ('HISTORICAL_PROP_SIMULATION','VIRTUAL_PROP_ON_MT5','REAL_PROP')),
  account_size numeric not null check (account_size > 0),
  currency text not null,
  mt5_account_id uuid references public.mt5_accounts(id) on delete set null,
  configuration jsonb not null,
  current_state text not null default 'NOT_STARTED',
  manual_control text not null default 'START',
  payout_state text not null default 'NOT_ELIGIBLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prop_audit_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prop_account_id text not null references public.prop_account_configs(id) on delete cascade,
  occurred_at timestamptz not null,
  actor text not null,
  old_state text not null,
  new_state text not null,
  trigger text not null,
  profile_version text not null,
  reason_codes jsonb not null default '[]'::jsonb,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.prop_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prop_account_id text not null references public.prop_account_configs(id) on delete cascade,
  run_type text not null,
  canonical_run_id text not null,
  canonical_run_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.prop_account_configs enable row level security;
alter table public.prop_audit_events enable row level security;
alter table public.prop_simulation_runs enable row level security;

create policy "Owners manage prop accounts" on public.prop_account_configs
  for all to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "Owners read prop audit" on public.prop_audit_events
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "Owners append prop audit" on public.prop_audit_events
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy "Owners manage prop simulations" on public.prop_simulation_runs
  for all to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create index if not exists prop_account_configs_user_idx on public.prop_account_configs(user_id);
create index if not exists prop_audit_account_time_idx on public.prop_audit_events(prop_account_id, occurred_at desc);
create index if not exists prop_simulation_account_time_idx on public.prop_simulation_runs(prop_account_id, created_at desc);
