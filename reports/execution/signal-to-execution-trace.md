# Signal-to-execution trace

Use this query in Supabase SQL for the latest 50 signals:

```sql
select
  s.id as signal_id,
  s.symbol,
  s.strategy_name as strategy,
  s.timeframe,
  s.grade,
  s.status,
  s.created_at,
  (upper(coalesce(s.grade,'')) in ('A','A+') and s.market_type = 'crypto') as should_execute,
  exists (select 1 from execution_orders e where e.signal_id = s.id) as execution_requested,
  max(e.execution_group_id) as execution_group_id,
  exists (select 1 from execution_orders e where e.signal_id = s.id and coalesce(e.execution_provider,'binance') = 'binance') as binance_execution_row_exists,
  exists (select 1 from execution_orders e where e.signal_id = s.id and e.execution_provider = 'bybit') as bybit_execution_row_exists,
  coalesce(max(e.latest_auto_skip_reason), max(e.error_message), max(e.last_exchange_error), 'none') as blocker_reason
from signals s
left join execution_orders e on e.signal_id = s.id
group by s.id
order by s.created_at desc
limit 50;
```

Expected post-fix behavior: approved A/A+ crypto scanner signals show `execution_requested=true` unless a global safety gate blocks before row creation. Provider-specific blocks are recorded as provider rows with exact blocker text.
