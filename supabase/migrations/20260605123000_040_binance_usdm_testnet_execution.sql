/*
  # 040 Binance USD-M Futures Testnet execution connector

  Adds testnet-only execution tracking, event logs, and guarded admin settings.
  No Binance API secrets are stored in the database.
*/

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'binance_usdm_testnet',
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'testnet',
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS leverage numeric,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS entry_order_id text,
  ADD COLUMN IF NOT EXISTS sl_order_id text,
  ADD COLUMN IF NOT EXISTS tp1_order_id text,
  ADD COLUMN IF NOT EXISTS tp2_order_id text,
  ADD COLUMN IF NOT EXISTS raw_exchange_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS testnet_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_exchange_error text;

UPDATE public.execution_orders
SET side = COALESCE(side, CASE WHEN direction = 'sell' THEN 'short' ELSE 'long' END),
    quantity = COALESCE(quantity, volume)
WHERE side IS NULL OR quantity IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'execution_orders_environment_check'
  ) THEN
    ALTER TABLE public.execution_orders
      ADD CONSTRAINT execution_orders_environment_check CHECK (environment IN ('testnet', 'live'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'execution_orders_status_check'
  ) THEN
    ALTER TABLE public.execution_orders
      ADD CONSTRAINT execution_orders_status_check CHECK (status IN (
        'pending', 'entry_submitted', 'entry_filled', 'sl_submitted', 'tp_submitted',
        'partially_closed', 'closed_tp', 'closed_sl', 'cancelled', 'failed', 'skipped',
        'sent_to_bridge', 'accepted', 'rejected', 'filled'
      ));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS execution_orders_signal_exchange_env_unique
  ON public.execution_orders(signal_id, exchange, environment)
  WHERE signal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS execution_orders_status_created_idx
  ON public.execution_orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS execution_orders_symbol_active_idx
  ON public.execution_orders(symbol, status)
  WHERE status IN ('pending', 'entry_submitted', 'entry_filled', 'sl_submitted', 'tp_submitted', 'partially_closed');

CREATE TABLE IF NOT EXISTS public.execution_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid REFERENCES public.execution_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can read execution event logs"
  ON public.execution_event_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert execution event logs" ON public.execution_event_logs;
CREATE POLICY "Admins can insert execution event logs"
  ON public.execution_event_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS execution_event_logs_execution_created_idx
  ON public.execution_event_logs(execution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.execution_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  execution_mode text NOT NULL DEFAULT 'signal_only' CHECK (execution_mode IN ('signal_only', 'testnet')),
  exchange text NOT NULL DEFAULT 'binance_usdm_testnet' CHECK (exchange = 'binance_usdm_testnet'),
  testnet_enabled boolean NOT NULL DEFAULT false,
  live_trading_enabled boolean NOT NULL DEFAULT false CHECK (live_trading_enabled = false),
  kill_switch_enabled boolean NOT NULL DEFAULT false,
  max_open_testnet_positions integer NOT NULL DEFAULT 3,
  one_active_execution_per_symbol boolean NOT NULL DEFAULT true,
  testnet_enabled_at timestamptz,
  fallback_account_balance numeric NOT NULL DEFAULT 10000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.execution_settings (id)
VALUES (1)
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
  WITH CHECK (public.is_admin() AND live_trading_enabled = false AND exchange = 'binance_usdm_testnet');
