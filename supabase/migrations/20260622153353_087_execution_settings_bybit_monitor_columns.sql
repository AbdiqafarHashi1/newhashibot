-- 087: Add missing bybit monitor columns to execution_settings
-- Root cause of Bybit CRITICAL: bybit monitor tries to write these columns but they don't exist

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_run_at        timestamptz,
  ADD COLUMN IF NOT EXISTS bybit_latest_successful_sync_at    timestamptz,
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_error         text,
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_result        jsonb,
  ADD COLUMN IF NOT EXISTS bybit_latest_monitor_status        text,
  ADD COLUMN IF NOT EXISTS enable_profit_lock_engine          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profit_lock_activation_pct         numeric(6,4) DEFAULT 0.005,
  ADD COLUMN IF NOT EXISTS profit_lock_trail_pct              numeric(6,4) DEFAULT 0.003;
