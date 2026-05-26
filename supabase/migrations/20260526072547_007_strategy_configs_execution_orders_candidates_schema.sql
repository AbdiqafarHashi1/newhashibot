/*
  # Phase 4 Schema: Strategy Configs, Execution Orders, Candidate Enhancements

  ## New Tables
  - `strategy_configs`: Per-strategy admin-configurable parameters and toggles
  - `execution_orders`: MT5 execution bridge order log (placeholder for future bridge)

  ## Modified Tables
  - `strategy_candidates`: Add score_breakdown (jsonb), data_source (text), entry_low/entry_high columns if missing

  ## Security
  - RLS enabled on all new tables
  - Admins can read/update strategy_configs
  - Admins can read/insert execution_orders
  - Users cannot access either table

  ## Notes
  - strategy_configs is seeded with defaults for MicroScalper and CompressionBreakout
  - execution_orders is insert-only from edge functions; MT5_EXECUTION_ENABLED defaults to false
  - All existing data is preserved
*/

-- ============================================================
-- 1. strategy_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.strategy_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  market_type text NOT NULL DEFAULT 'both',
  allowed_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_timeframes jsonb NOT NULL DEFAULT '["15m","1h"]'::jsonb,
  min_score numeric NOT NULL DEFAULT 75,
  min_rr numeric NOT NULL DEFAULT 1.2,
  max_active_signals integer NOT NULL DEFAULT 5,
  one_active_signal_per_symbol boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read strategy configs"
  ON public.strategy_configs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert strategy configs"
  ON public.strategy_configs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update strategy configs"
  ON public.strategy_configs FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 2. execution_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  symbol text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'buy',
  entry_price numeric,
  stop_loss numeric,
  tp1 numeric,
  tp2 numeric,
  volume numeric NOT NULL DEFAULT 0.01,
  execution_mode text NOT NULL DEFAULT 'signal_only',
  status text NOT NULL DEFAULT 'pending',
  bridge_order_id text DEFAULT '',
  mt5_ticket text DEFAULT '',
  error_message text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read execution orders"
  ON public.execution_orders FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert execution orders"
  ON public.execution_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update execution orders"
  ON public.execution_orders FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 3. strategy_candidates enhancements
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_candidates' AND column_name = 'score_breakdown'
  ) THEN
    ALTER TABLE public.strategy_candidates ADD COLUMN score_breakdown jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_candidates' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE public.strategy_candidates ADD COLUMN data_source text NOT NULL DEFAULT 'DEMO DATA';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_candidates' AND column_name = 'entry_low'
  ) THEN
    ALTER TABLE public.strategy_candidates ADD COLUMN entry_low numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_candidates' AND column_name = 'entry_high'
  ) THEN
    ALTER TABLE public.strategy_candidates ADD COLUMN entry_high numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_candidates' AND column_name = 'scanner_run_id'
  ) THEN
    ALTER TABLE public.strategy_candidates ADD COLUMN scanner_run_id uuid REFERENCES public.scanner_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 4. scanner_runs enhancements
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'indicators_calculated'
  ) THEN
    ALTER TABLE public.scanner_runs ADD COLUMN indicators_calculated integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'strategy_evaluations_count'
  ) THEN
    ALTER TABLE public.scanner_runs ADD COLUMN strategy_evaluations_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'rejected_candidates_count'
  ) THEN
    ALTER TABLE public.scanner_runs ADD COLUMN rejected_candidates_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'errors'
  ) THEN
    ALTER TABLE public.scanner_runs ADD COLUMN errors jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- ============================================================
-- 5. Seed strategy_configs defaults
-- ============================================================
INSERT INTO public.strategy_configs (strategy_name, enabled, market_type, allowed_symbols, allowed_timeframes, min_score, min_rr, max_active_signals, one_active_signal_per_symbol, params)
VALUES
  (
    'MicroScalper',
    true,
    'both',
    '[]'::jsonb,
    '["5m","15m"]'::jsonb,
    75,
    1.2,
    10,
    true,
    '{
      "ema_fast": 20,
      "ema_slow": 50,
      "rsi_len": 14,
      "atr_len": 14,
      "rsi_buy_min": 52,
      "rsi_sell_max": 48,
      "min_atr_pct": 0.05,
      "max_atr_pct": 3.0,
      "momentum_lookback": 3,
      "min_body_atr": 0.25,
      "stop_atr_mult": 1.2,
      "tp1_r": 0.9,
      "tp2_r": 1.5
    }'::jsonb
  ),
  (
    'CompressionBreakout',
    true,
    'both',
    '[]'::jsonb,
    '["15m","1h"]'::jsonb,
    78,
    1.5,
    10,
    true,
    '{
      "box_lookback": 32,
      "min_box_bars": 20,
      "max_box_atr_range": 2.0,
      "atr_len": 14,
      "atr_expansion_lookback": 48,
      "min_atr_expansion": 1.05,
      "breakout_buffer_atr": 0.10,
      "stop_atr_mult": 1.2,
      "tp1_r": 1.2,
      "tp2_r": 2.5,
      "fakeout_max_reentry_bars": 3
    }'::jsonb
  )
ON CONFLICT (strategy_name) DO NOTHING;
