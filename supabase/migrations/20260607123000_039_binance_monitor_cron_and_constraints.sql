/*
  HASHIBOT B4.1 — execution constraints + Binance testnet monitor cron
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. execution_orders constraint repair. Drop prior conflicting CHECKs safely.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%status%'
        OR pg_get_constraintdef(oid) ILIKE '%protection_status%'
        OR pg_get_constraintdef(oid) ILIKE '%bracket_mode%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_b4_1_check
  CHECK (status IN (
    'pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed',
    'closed_tp','closed_sl','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled','protected_managed','pending_managed_protection'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b4_1_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_managed','pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_bracket_mode_b4_1_check
  CHECK (bracket_mode IN ('','exchange_native','managed_exit_fallback','failed')) NOT VALID;

-- 2. Execution settings gate table. Live trading remains disabled by default and by constraint.
CREATE TABLE IF NOT EXISTS public.execution_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  execution_mode text NOT NULL DEFAULT 'testnet' CHECK (execution_mode IN ('disabled','testnet')),
  testnet_enabled boolean NOT NULL DEFAULT false,
  kill_switch_enabled boolean NOT NULL DEFAULT true,
  live_trading_enabled boolean NOT NULL DEFAULT false CHECK (live_trading_enabled = false),
  latest_monitor_run_at timestamptz,
  latest_monitor_status text NOT NULL DEFAULT 'never_run',
  latest_monitor_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  open_binance_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_binance_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  pnl_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  stale_rows_cleaned integer NOT NULL DEFAULT 0,
  current_position_size numeric NOT NULL DEFAULT 0,
  mark_price numeric,
  unrealized_pnl numeric,
  account_total_margin_balance numeric,
  account_total_wallet_balance numeric,
  available_usdt numeric,
  available_usdc numeric,
  current_open_risk_pct numeric,
  open_positions_count integer NOT NULL DEFAULT 0,
  latest_sync_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.execution_settings (id, execution_mode, testnet_enabled, kill_switch_enabled, live_trading_enabled)
VALUES (1, 'testnet', false, true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.execution_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution settings" ON public.execution_settings;
CREATE POLICY "Admins can read execution settings"
  ON public.execution_settings FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update execution settings" ON public.execution_settings;
CREATE POLICY "Admins can update execution settings"
  ON public.execution_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin() AND live_trading_enabled = false);

-- 3. Execution event log for monitor and cleanup state transitions.
CREATE TABLE IF NOT EXISTS public.execution_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_order_id uuid REFERENCES public.execution_orders(id) ON DELETE SET NULL,
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  symbol text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS execution_event_logs_execution_order_id_idx ON public.execution_event_logs(execution_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_event_logs_event_type_idx ON public.execution_event_logs(event_type, created_at DESC);

ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can read execution event logs"
  ON public.execution_event_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 4. Add monitor/account sync columns to execution_orders for per-row state snapshots.
ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS current_position_size numeric,
  ADD COLUMN IF NOT EXISTS latest_mark_price numeric,
  ADD COLUMN IF NOT EXISTS latest_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS latest_account_total_margin_balance numeric,
  ADD COLUMN IF NOT EXISTS latest_account_total_wallet_balance numeric,
  ADD COLUMN IF NOT EXISTS latest_available_usdt numeric,
  ADD COLUMN IF NOT EXISTS latest_available_usdc numeric,
  ADD COLUMN IF NOT EXISTS latest_sync_at timestamptz;

-- 5. Register Binance testnet monitor cron every minute.
ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_job_name text;

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  monitor_ep text := project_url || '/functions/v1/binance-testnet-monitor';
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_binance_testnet_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_binance_testnet_monitor_1m',
    '*/1 * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
          ),
          body    := '{"source":"pg_cron","run_type":"binance_testnet_monitor"}'::jsonb
        ) AS request_id;
      $sql$,
      monitor_ep
    )
  );

  UPDATE public.scanner_config
  SET binance_monitor_cron_active = true,
      binance_monitor_cron_job_name = 'hashibot_binance_testnet_monitor_1m',
      updated_at = now()
  WHERE id = 1;
END $$;
