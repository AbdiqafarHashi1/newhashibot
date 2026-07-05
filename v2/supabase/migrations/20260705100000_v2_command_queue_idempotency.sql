-- V2 durable command queue and idempotency. No API secrets are stored here.
create extension if not exists pgcrypto;

do $$ begin
  create type public.v2_execution_command_status as enum ('QUEUED','LOCKED','RUNNING','SENT','ACKNOWLEDGED','VERIFIED','COMPLETED','RETRY_SCHEDULED','FAILED','DEAD_LETTERED','CANCELLED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.v2_execution_command_action as enum ('OPEN_POSITION','CLOSE_POSITION','PARTIAL_CLOSE','MOVE_STOP_LOSS','MOVE_TAKE_PROFIT','CANCEL_ORDER','SYNCHRONIZE','REPAIR_PROTECTION','PROFIT_LOCK','TRAILING_STOP','VERIFY_EXECUTION','SAFE_CLOSE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.v2_execution_failure_category as enum ('TRANSIENT','NETWORK','RATE_LIMIT','EXCHANGE_REJECTED','AUTHENTICATION','VALIDATION','DUPLICATE','VERIFICATION_FAILED','PROTECTION_FAILED','UNKNOWN');
exception when duplicate_object then null; end $$;

create table if not exists public.v2_execution_commands (
  command_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  correlation_id text not null,
  causation_id text,
  signal_id uuid,
  trade_id uuid,
  customer_id uuid not null,
  account_id uuid not null,
  executor_id uuid not null,
  provider text not null check (provider in ('binance','bybit','mock')),
  environment text not null check (environment in ('testnet','demo','live','paper')),
  symbol text not null,
  market text not null check (market in ('crypto','forex')),
  side text not null check (side in ('long','short','buy','sell')),
  action public.v2_execution_command_action not null,
  purpose text not null check (purpose in ('ENTRY','EXIT','PROTECTION','RECOVERY','SYNC','ADMIN','VERIFY')),
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  status public.v2_execution_command_status not null default 'QUEUED',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  retry_after timestamptz,
  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  failure_category public.v2_execution_failure_category,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  archived_at timestamptz,
  retention_until timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.v2_execution_command_events (
  event_id uuid primary key default gen_random_uuid(),
  command_id uuid references public.v2_execution_commands(command_id) on delete set null,
  idempotency_key text not null,
  customer_id uuid not null,
  account_id uuid not null,
  executor_id uuid not null,
  provider text not null check (provider in ('binance','bybit','mock')),
  environment text not null check (environment in ('testnet','demo','live','paper')),
  event_type text not null check (event_type in ('COMMAND_CREATED','IDEMPOTENCY_RESERVED','DUPLICATE_PREVENTED','COMMAND_LOCKED','COMMAND_LOCK_EXTENDED','COMMAND_RELEASED','COMMAND_RUNNING','COMMAND_SENT','COMMAND_ACKNOWLEDGED','COMMAND_VERIFIED','COMMAND_COMPLETED','COMMAND_RETRY_SCHEDULED','COMMAND_FAILED','COMMAND_DEAD_LETTERED','COMMAND_CANCELLED','COMMAND_RECOVERED')),
  previous_status public.v2_execution_command_status,
  next_status public.v2_execution_command_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_idempotency_keys (
  idempotency_key text primary key,
  command_id uuid unique references public.v2_execution_commands(command_id) on delete set null,
  customer_id uuid not null,
  account_id uuid not null,
  executor_id uuid not null,
  provider text not null check (provider in ('binance','bybit','mock')),
  environment text not null check (environment in ('testnet','demo','live','paper')),
  request_hash text not null,
  status text not null check (status in ('RESERVED','ATTACHED','DUPLICATE','ORPHANED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists v2_execution_commands_pending_idx on public.v2_execution_commands (priority asc, created_at asc) where status in ('QUEUED','RETRY_SCHEDULED');
create index if not exists v2_execution_commands_retry_idx on public.v2_execution_commands (retry_after) where status = 'RETRY_SCHEDULED';
create index if not exists v2_execution_commands_lock_idx on public.v2_execution_commands (lock_expires_at) where status in ('LOCKED','RUNNING');
create index if not exists v2_execution_commands_customer_idx on public.v2_execution_commands (customer_id, created_at desc);
create index if not exists v2_execution_commands_account_idx on public.v2_execution_commands (account_id, created_at desc);
create index if not exists v2_execution_commands_executor_idx on public.v2_execution_commands (executor_id, created_at desc);
create index if not exists v2_execution_commands_provider_idx on public.v2_execution_commands (provider, environment, created_at desc);
create index if not exists v2_execution_commands_trade_idx on public.v2_execution_commands (trade_id) where trade_id is not null;
create index if not exists v2_execution_commands_status_idx on public.v2_execution_commands (status, created_at desc);
create index if not exists v2_execution_commands_dead_letter_idx on public.v2_execution_commands (dead_lettered_at desc) where status = 'DEAD_LETTERED';
create index if not exists v2_execution_command_events_command_idx on public.v2_execution_command_events (command_id, created_at asc);
create index if not exists v2_idempotency_keys_command_idx on public.v2_idempotency_keys (command_id);

create or replace function public.v2_claim_execution_command_batch(p_worker_id text, p_limit integer default 10, p_lock_ms integer default 60000, p_now timestamptz default now())
returns setof public.v2_execution_commands language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select command_id from public.v2_execution_commands
    where (status = 'QUEUED' or (status = 'RETRY_SCHEDULED' and retry_after <= p_now))
      and (lock_expires_at is null or lock_expires_at <= p_now)
    order by priority asc, created_at asc
    for update skip locked
    limit p_limit
  )
  update public.v2_execution_commands c
     set status = 'LOCKED', locked_by = p_worker_id, locked_at = p_now,
         lock_expires_at = p_now + make_interval(secs => greatest(p_lock_ms,1) / 1000.0), updated_at = p_now
    from picked where c.command_id = picked.command_id
  returning c.*;
end $$;

create or replace function public.v2_claim_next_execution_command(p_worker_id text, p_lock_ms integer default 60000, p_now timestamptz default now())
returns setof public.v2_execution_commands language sql security definer set search_path = public as $$
  select * from public.v2_claim_execution_command_batch(p_worker_id, 1, p_lock_ms, p_now);
$$;

create or replace function public.v2_recover_expired_execution_command_locks(p_now timestamptz default now())
returns setof public.v2_execution_commands language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.v2_execution_commands
     set status = 'QUEUED', locked_by = null, locked_at = null, lock_expires_at = null, updated_at = p_now
   where status in ('LOCKED','RUNNING') and lock_expires_at <= p_now and attempt_count < max_attempts
  returning *;
end $$;

alter table public.v2_execution_commands enable row level security;
alter table public.v2_execution_command_events enable row level security;
alter table public.v2_idempotency_keys enable row level security;

drop policy if exists "service role manages v2 execution commands" on public.v2_execution_commands;
create policy "service role manages v2 execution commands" on public.v2_execution_commands for all to service_role using (true) with check (true);
drop policy if exists "admins manage v2 execution commands" on public.v2_execution_commands;
create policy "admins manage v2 execution commands" on public.v2_execution_commands for all using (coalesce((auth.jwt() ->> 'role') = 'admin', false)) with check (coalesce((auth.jwt() ->> 'role') = 'admin', false));
drop policy if exists "customers read own v2 execution commands" on public.v2_execution_commands;
create policy "customers read own v2 execution commands" on public.v2_execution_commands for select using (customer_id = auth.uid());

drop policy if exists "service role manages v2 command events" on public.v2_execution_command_events;
create policy "service role manages v2 command events" on public.v2_execution_command_events for all to service_role using (true) with check (true);
drop policy if exists "admins manage v2 command events" on public.v2_execution_command_events;
create policy "admins manage v2 command events" on public.v2_execution_command_events for all using (coalesce((auth.jwt() ->> 'role') = 'admin', false)) with check (coalesce((auth.jwt() ->> 'role') = 'admin', false));
drop policy if exists "customers read own v2 command events" on public.v2_execution_command_events;
create policy "customers read own v2 command events" on public.v2_execution_command_events for select using (customer_id = auth.uid());

drop policy if exists "service role manages v2 idempotency" on public.v2_idempotency_keys;
create policy "service role manages v2 idempotency" on public.v2_idempotency_keys for all to service_role using (true) with check (true);
drop policy if exists "admins manage v2 idempotency" on public.v2_idempotency_keys;
create policy "admins manage v2 idempotency" on public.v2_idempotency_keys for all using (coalesce((auth.jwt() ->> 'role') = 'admin', false)) with check (coalesce((auth.jwt() ->> 'role') = 'admin', false));
drop policy if exists "customers read own v2 idempotency" on public.v2_idempotency_keys;
create policy "customers read own v2 idempotency" on public.v2_idempotency_keys for select using (customer_id = auth.uid());
