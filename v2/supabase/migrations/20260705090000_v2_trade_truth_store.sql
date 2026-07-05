-- V2 durable trade truth store.
-- Audited V1 public.trade_management_truth and public.execution_orders lifecycle columns.
create table if not exists public.v2_trade_truth (
  trade_id text primary key,
  customer_id uuid,
  provider text not null check (provider <> ''),
  environment text not null check (environment in ('testnet','demo','live','paper')),
  symbol text not null check (symbol <> ''),
  side text not null check (side in ('long','short','buy','sell')),
  lifecycle_state text not null default 'signal_approved' check (lifecycle_state in ('signal_approved','execution_planned','command_queued','command_executing','exchange_accepted','position_open','protected','tp1','break_even','tp2','closed','failed')),
  status text not null default 'active' check (status in ('active','closed','failed','archived')),
  qty numeric not null default 0 check (qty >= 0),
  entry_price numeric, mark_price numeric, unrealized_pnl numeric,
  exchange_position_id text, signal_id uuid, execution_order_id uuid,
  entry_order_id text, exchange_order_id text, client_order_id text, position_id text,
  sl_order_id text, tp1_order_id text, tp2_order_id text,
  expected_sl numeric, expected_tp1 numeric, expected_tp2 numeric, expected_quantity numeric,
  actual_sl numeric, actual_tp1 numeric, actual_tp2 numeric, actual_quantity numeric,
  sl_present boolean not null default false, tp1_present boolean not null default false, tp2_present boolean not null default false,
  protection_status text not null default 'orphan' check (protection_status in ('protected','missing_sl','missing_tp','orphan','stale','closed')),
  protection_verified boolean not null default false,
  protection_missing boolean not null default true,
  repair_running boolean not null default false,
  repair_completed boolean not null default false,
  repair_failed boolean not null default false,
  profit_lock_status text not null default 'inactive', monitor_status text not null default 'unknown', recovery_status text not null default 'none',
  exchange_acknowledgement jsonb, execution_latency_ms integer check (execution_latency_ms is null or execution_latency_ms >= 0),
  verification_status text not null default 'pending' check (verification_status in ('pending','acknowledged','verified','mismatch','failed')),
  verification_attempts integer not null default 0 check (verification_attempts >= 0), verification_result jsonb,
  latest_error text, latest_sync_at timestamptz not null default now(), last_action_taken text,
  last_verification_at timestamptz, last_exchange_sync_at timestamptz,
  archived_at timestamptz, archive_reason text check (archive_reason is null or archive_reason in ('closed','expired','operator','reconciled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint v2_trade_truth_protection_consistency check ((protection_verified and not protection_missing and protection_status = 'protected') or not protection_verified)
);

create unique index if not exists v2_trade_truth_provider_position_active_uq on public.v2_trade_truth(provider, environment, position_id) where position_id is not null and archived_at is null;
create unique index if not exists v2_trade_truth_provider_client_order_uq on public.v2_trade_truth(provider, client_order_id) where client_order_id is not null;
create index if not exists v2_trade_truth_provider_idx on public.v2_trade_truth(provider, environment, status, updated_at desc);
create index if not exists v2_trade_truth_customer_idx on public.v2_trade_truth(customer_id, status, updated_at desc);
create index if not exists v2_trade_truth_symbol_idx on public.v2_trade_truth(symbol, status, updated_at desc);
create index if not exists v2_trade_truth_exchange_order_idx on public.v2_trade_truth(provider, exchange_order_id) where exchange_order_id is not null;
create index if not exists v2_trade_truth_unprotected_idx on public.v2_trade_truth(provider, updated_at desc) where protection_missing and status = 'active' and archived_at is null;
create index if not exists v2_trade_truth_failed_idx on public.v2_trade_truth(provider, updated_at desc) where status = 'failed' and archived_at is null;

alter table public.v2_trade_truth enable row level security;
drop policy if exists "v2 service role manages trade truth" on public.v2_trade_truth;
create policy "v2 service role manages trade truth" on public.v2_trade_truth for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "v2 admins read trade truth" on public.v2_trade_truth;
create policy "v2 admins read trade truth" on public.v2_trade_truth for select using (public.is_admin());
drop policy if exists "v2 customers read own trade truth" on public.v2_trade_truth;
create policy "v2 customers read own trade truth" on public.v2_trade_truth for select using (auth.uid() = customer_id);

create or replace view public.v2_active_trade_truth as select * from public.v2_trade_truth where archived_at is null and status not in ('closed','archived');
create or replace view public.v2_unprotected_trade_truth as select * from public.v2_trade_truth where archived_at is null and status = 'active' and protection_missing;
create or replace view public.v2_orphan_trade_truth as select * from public.v2_trade_truth where archived_at is null and protection_status = 'orphan';

create or replace function public.v2_archive_closed_trade_truth(p_before timestamptz default now()) returns integer language plpgsql security definer as $$
declare v_count integer;
begin
  update public.v2_trade_truth set status = 'archived', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'closed'), updated_at = now()
  where status = 'closed' and archived_at is null and updated_at <= p_before;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke execute on function public.v2_archive_closed_trade_truth from anon;
notify pgrst, 'reload schema';
