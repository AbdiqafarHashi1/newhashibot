-- HashiBot Phase X-A.5: Intelligence feed quality classification.
-- Data-quality only. Does not alter scanner scoring, strategy entry, execution,
-- Binance protection, Telegram routing, Forex, or MT5 behavior.

alter table if exists public.intelligence_feed_results
  add column if not exists quality_status text not null default 'insufficient_data'
    check (quality_status in ('healthy', 'degraded', 'fallback', 'unavailable', 'insufficient_data')),
  add column if not exists quality_score integer not null default 0
    check (quality_score >= 0 and quality_score <= 100),
  add column if not exists ranking_eligible boolean not null default false,
  add column if not exists failure_reason text,
  add column if not exists provider text not null default 'unavailable',
  add column if not exists endpoint text not null default 'unavailable',
  add column if not exists update_frequency text not null default 'per intelligence run',
  add column if not exists fallback_source text,
  add column if not exists historical_coverage text not null default 'latest snapshot only';

update public.intelligence_feed_results
set
  quality_status = case
    when status = 'available' and source ilike '%fallback%' then 'fallback'
    when status = 'available' then 'healthy'
    when status = 'failed' then 'degraded'
    when status = 'unavailable' then 'unavailable'
    else 'insufficient_data'
  end,
  quality_score = case
    when status = 'available' and source ilike '%fallback%' then 65
    when status = 'available' then 90
    when status = 'failed' then 25
    else 0
  end,
  ranking_eligible = status = 'available' and source not ilike '%fallback%' and feed_type not in ('liquidations', 'sector_rotation', 'stablecoin_flow'),
  failure_reason = coalesce(failure_reason, error_message),
  provider = coalesce(nullif(provider, 'unavailable'), source),
  endpoint = coalesce(nullif(endpoint, 'unavailable'), source)
where true;

create or replace view public.intelligence_feed_quality as
select distinct on (feed_type)
  feed_type,
  status,
  quality_status,
  quality_score,
  ranking_eligible,
  provider,
  endpoint,
  source,
  freshness,
  classification,
  failure_reason,
  error_message,
  update_frequency,
  fallback_source,
  historical_coverage,
  created_at as last_updated_at
from public.intelligence_feed_results
order by feed_type, created_at desc;

create or replace view public.intelligence_feed_health as
select
  feed_type,
  status,
  classification,
  source,
  freshness,
  error_message,
  last_updated_at,
  quality_status,
  quality_score,
  ranking_eligible,
  provider,
  endpoint,
  failure_reason,
  update_frequency,
  fallback_source,
  historical_coverage
from public.intelligence_feed_quality;
