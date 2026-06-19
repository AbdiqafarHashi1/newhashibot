-- X-H.7 position-driven supervisor controls and visible scheduler health.
ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS max_repairs_per_provider_per_cycle integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_duplicate_cancels_per_cycle integer NOT NULL DEFAULT 10;

UPDATE public.scanner_config
SET supervisor_enabled = coalesce(supervisor_enabled, true),
    operator_auto_repair_enabled = coalesce(operator_auto_repair_enabled, true),
    max_repairs_per_provider_per_cycle = coalesce(max_repairs_per_provider_per_cycle, 5),
    max_duplicate_cancels_per_cycle = coalesce(max_duplicate_cancels_per_cycle, 10),
    updated_at = now()
WHERE id = 1;

ALTER TABLE public.execution_monitor_schedules
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_blocker text,
  ADD COLUMN IF NOT EXISTS source_function text;

UPDATE public.execution_monitor_schedules
SET enabled = coalesce(scheduled, true),
    source_function = coalesce(source_function, function_name),
    latest_blocker = last_error,
    next_run_at = CASE WHEN last_run_at IS NOT NULL THEN last_run_at + interval '1 minute' ELSE next_run_at END,
    updated_at = now()
WHERE job_name IN ('hashibot_trade_supervisor_1m_binance', 'hashibot_trade_supervisor_1m_bybit')
   OR function_name = 'binance-testnet-execution:run_trade_supervisor_cycle';

INSERT INTO public.execution_monitor_schedules (provider, environment, job_name, cron_expression, function_name, scheduled, enabled, status, adapter_status, source_function, updated_at)
VALUES
  ('scanner', 'prod', 'hashibot_scheduled_market_scanner', '*/5 * * * *', 'scheduled-market-scanner', true, true, 'scheduled', 'available', 'scheduled-market-scanner', now()),
  ('outcome', 'prod', 'hashibot_outcome_evaluation', '*/15 * * * *', 'evaluate-signal-outcomes', true, true, 'scheduled', 'available', 'evaluate-signal-outcomes', now()),
  ('news_brain', 'prod', 'hashibot_news_brain', '*/30 * * * *', 'intelligence-engine', true, true, 'scheduled', 'available', 'intelligence-engine', now()),
  ('protection_monitor', 'testnet', 'hashibot_trade_supervisor_1m_binance', '*/1 * * * *', 'binance-testnet-execution:run_trade_supervisor_cycle', true, true, 'scheduled', 'available', 'binance-testnet-execution', now())
ON CONFLICT (job_name) DO UPDATE SET
  scheduled = EXCLUDED.scheduled,
  enabled = EXCLUDED.enabled,
  status = EXCLUDED.status,
  adapter_status = EXCLUDED.adapter_status,
  source_function = EXCLUDED.source_function,
  updated_at = now();

COMMENT ON COLUMN public.scanner_config.max_repairs_per_provider_per_cycle IS 'X-H.7 safety throttle; supervisor will not repair more than this many positions per provider cycle.';
COMMENT ON COLUMN public.scanner_config.max_duplicate_cancels_per_cycle IS 'X-H.7 safety throttle; duplicate protection cancellation budget per cycle.';

NOTIFY pgrst, 'reload schema';
