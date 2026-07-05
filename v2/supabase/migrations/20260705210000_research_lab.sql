-- HashiBot V2 Research Lab compact metadata schema.
-- Raw market datasets, replay ticks, full candle histories, and per-candle traces are intentionally forbidden here.
do $$ begin create type research_run_type as enum ('backtest','replay','walk_forward','monte_carlo','certification','shadow'); exception when duplicate_object then null; end $$;
do $$ begin create type research_status as enum ('QUEUED','RUNNING','COMPLETED','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type dataset_kind as enum ('local_file','uploaded_file','external_provider','compressed_fixture','runtime_memory'); exception when duplicate_object then null; end $$;
do $$ begin create type certification_status as enum ('EXPERIMENTAL','SHADOW','CERTIFIED','REJECTED','RETIRED'); exception when duplicate_object then null; end $$;

create table if not exists research_datasets (
  id uuid primary key default gen_random_uuid(),
  dataset_id text unique not null,
  kind dataset_kind not null,
  uri text,
  provider text,
  market text not null check (market in ('crypto','forex')),
  symbol text not null,
  timeframe text not null,
  from_ts timestamptz,
  to_ts timestamptz,
  checksum text,
  candle_count integer,
  compressed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint research_datasets_no_raw_payload check (not (metadata ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace']))
);

create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text unique not null,
  run_type research_run_type not null,
  status research_status not null default 'QUEUED',
  dataset_id text references research_datasets(dataset_id),
  strategy_ids text[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint research_runs_compact_summary check (octet_length(summary::text) <= 64000 and not (summary ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace']))
);

create table if not exists strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null,
  version text not null,
  source_hash text,
  notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(strategy_id, version)
);

create table if not exists strategy_parameter_sets (
  id uuid primary key default gen_random_uuid(),
  parameter_set_id text unique not null,
  strategy_id text not null,
  version text not null,
  parameters jsonb not null default '{}'::jsonb,
  research_only boolean not null default true,
  created_at timestamptz not null default now(),
  constraint strategy_parameter_sets_compact check (octet_length(parameters::text) <= 16000)
);

create table if not exists strategy_certifications (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null,
  parameter_set_id text not null references strategy_parameter_sets(parameter_set_id),
  status certification_status not null,
  checks jsonb not null default '{}'::jsonb,
  compact_summary jsonb not null default '{}'::jsonb,
  notes text[] not null default '{}',
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint strategy_certifications_compact check (octet_length(compact_summary::text) <= 64000 and not (compact_summary ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace']))
);

create table if not exists shadow_test_results (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null,
  parameter_set_id text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  shadow_signals integer not null default 0,
  would_have_traded integer not null default 0,
  compact_summary jsonb not null default '{}'::jsonb,
  status certification_status not null default 'SHADOW',
  constraint shadow_test_results_compact check (octet_length(compact_summary::text) <= 64000 and not (compact_summary ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace']))
);

create table if not exists research_reports (
  id uuid primary key default gen_random_uuid(),
  report_id text unique not null,
  run_id text not null references research_runs(run_id),
  compact_summary jsonb not null default '{}'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  storage_class text not null default 'compact_report_only' check (storage_class = 'compact_report_only'),
  created_at timestamptz not null default now(),
  constraint research_reports_compact check (octet_length(sections::text) <= 64000 and not (sections ?| array['candles','ticks','rawCandles','fullHistory','perCandleTrace']))
);
