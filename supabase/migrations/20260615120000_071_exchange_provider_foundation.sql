-- Phase X-C exchange provider foundation. Additive only: preserves existing Binance execution history.

alter table if exists public.execution_orders
  add column if not exists execution_provider text not null default 'binance',
  add column if not exists provider_order_id text,
  add column if not exists provider_position_id text,
  add column if not exists provider_status text,
  add column if not exists provider_error text,
  add column if not exists provider_fill_price numeric,
  add column if not exists provider_fee numeric,
  add column if not exists provider_slippage numeric,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists execution_group_id uuid;

update public.execution_orders
set execution_provider = coalesce(nullif(execution_provider, ''), 'binance'),
    provider_order_id = coalesce(provider_order_id, binance_entry_order_id, entry_order_id, bridge_order_id),
    provider_status = coalesce(provider_status, status),
    provider_error = coalesce(provider_error, last_exchange_error, error_message),
    provider_fill_price = coalesce(provider_fill_price, entry_price),
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_binance_entry_order_id', binance_entry_order_id,
      'legacy_binance_sl_order_id', binance_sl_order_id,
      'legacy_binance_tp1_order_id', binance_tp1_order_id,
      'legacy_binance_tp2_order_id', binance_tp2_order_id,
      'exchange', exchange,
      'environment', environment
    )
where execution_provider = 'binance';

create index if not exists idx_execution_orders_execution_provider
  on public.execution_orders(execution_provider, created_at desc);
create index if not exists idx_execution_orders_provider_order_id
  on public.execution_orders(execution_provider, provider_order_id)
  where provider_order_id is not null;
create index if not exists idx_execution_orders_execution_group_id
  on public.execution_orders(execution_group_id)
  where execution_group_id is not null;

comment on column public.execution_orders.execution_provider is 'Provider adapter that owns this execution: binance, bybit, mt5, etc.';
comment on column public.execution_orders.provider_order_id is 'Provider-native entry/order identifier; legacy Binance ids remain intact.';
comment on column public.execution_orders.provider_position_id is 'Provider-native position identifier when available.';
comment on column public.execution_orders.provider_metadata is 'Provider-specific raw details isolated from scanner/signal logic.';
comment on column public.execution_orders.execution_group_id is 'Cross-provider grouping key for future routed executions.';
