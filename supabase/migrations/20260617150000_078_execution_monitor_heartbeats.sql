-- X-G.1 platform-wide monitor proof heartbeat table.
-- Additive only; monitors remain testnet/demo management-only and live trading stays blocked elsewhere.

CREATE TABLE IF NOT EXISTS public.execution_monitor_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL,
  run_id text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  success boolean NOT NULL DEFAULT false,
  monitor_status text NOT NULL DEFAULT 'unknown',
  positions_seen integer NOT NULL DEFAULT 0,
  orders_seen integer NOT NULL DEFAULT 0,
  executions_checked integer NOT NULL DEFAULT 0,
  protections_created integer NOT NULL DEFAULT 0,
  protections_missing integer NOT NULL DEFAULT 0,
  stale_orders_cleaned integer NOT NULL DEFAULT 0,
  positions_closed integer NOT NULL DEFAULT 0,
  latest_recovery_action text,
  latest_telegram_event text,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, run_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_monitor_heartbeats_provider_started
  ON public.execution_monitor_heartbeats (provider, environment, started_at DESC);

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS last_monitor_run_id text;

NOTIFY pgrst, 'reload schema';
