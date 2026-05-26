/*
  # Phase 5 Schema: Mode Configs, Risk Profiles, Paper Execution Intents, Backtest Placeholders

  ## New Tables
  - `mode_configs`: Signal/Personal/Prop mode definitions and settings
  - `risk_profiles`: Per-mode risk governance parameters
  - `paper_execution_intents`: Simulated (non-real) execution intents for Personal/Prop modes
  - `backtest_runs`: Placeholder for future backtest engine jobs
  - `backtest_datasets`: Placeholder for uploaded backtest datasets

  ## Modified Tables
  - `signals`: Add mode_slug, arbitrator_decision jsonb, paper_execution_intent_id, risk_profile_snapshot jsonb

  ## Security
  - RLS on all new tables
  - Admins can read/write all
  - Users can read signals (already had access), paper_execution_intents blocked from users

  ## Notes
  - All execution_enabled defaults to false — safety first
  - Paper execution creates a simulated record only, no bridge call
  - Backtest tables are placeholders only, no engine wired yet
*/

-- ============================================================
-- 1. mode_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mode_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_slug text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  risk_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategy_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_policy jsonb NOT NULL DEFAULT '{
    "execution_enabled": false,
    "paper_execution_enabled": false,
    "demo_bridge_enabled": false,
    "live_bridge_enabled": false,
    "output": "dashboard"
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mode_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read mode configs"
  ON public.mode_configs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert mode configs"
  ON public.mode_configs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update mode configs"
  ON public.mode_configs FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 2. risk_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_slug text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  equity_start numeric NOT NULL DEFAULT 1000,
  risk_per_trade_pct numeric NOT NULL DEFAULT 0,
  max_risk_per_trade_pct numeric NOT NULL DEFAULT 0,
  max_daily_loss_pct numeric NOT NULL DEFAULT 0,
  max_total_drawdown_pct numeric NOT NULL DEFAULT 0,
  max_open_positions integer NOT NULL DEFAULT 0,
  max_open_risk_pct numeric NOT NULL DEFAULT 0,
  max_trades_per_day integer NOT NULL DEFAULT 999,
  max_consecutive_losses integer NOT NULL DEFAULT 999,
  cooldown_minutes_after_loss integer NOT NULL DEFAULT 0,
  one_active_signal_per_symbol boolean NOT NULL DEFAULT true,
  correlation_guard_enabled boolean NOT NULL DEFAULT true,
  daily_lock_enabled boolean NOT NULL DEFAULT false,
  compounding_enabled boolean NOT NULL DEFAULT false,
  compounding_mode text NOT NULL DEFAULT 'off',
  score_threshold_override numeric NOT NULL DEFAULT 75,
  min_rr_override numeric NOT NULL DEFAULT 1.2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read risk profiles"
  ON public.risk_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert risk profiles"
  ON public.risk_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update risk profiles"
  ON public.risk_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 3. paper_execution_intents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paper_execution_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  mode_slug text NOT NULL DEFAULT 'signal_mode',
  symbol text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'buy',
  entry_price numeric,
  stop_loss numeric,
  tp1 numeric,
  tp2 numeric,
  risk_pct numeric,
  calculated_position_size numeric,
  risk_amount numeric,
  account_equity_snapshot numeric,
  execution_mode text NOT NULL DEFAULT 'paper',
  status text NOT NULL DEFAULT 'pending',
  block_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paper_execution_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read paper intents"
  ON public.paper_execution_intents FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert paper intents"
  ON public.paper_execution_intents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update paper intents"
  ON public.paper_execution_intents FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 4. backtest_runs (placeholder)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_slug text NOT NULL DEFAULT 'signal_mode',
  strategy_name text NOT NULL DEFAULT '',
  symbol text NOT NULL DEFAULT '',
  timeframe text NOT NULL DEFAULT '15m',
  dataset_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backtest runs"
  ON public.backtest_runs FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert backtest runs"
  ON public.backtest_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ============================================================
-- 5. backtest_datasets (placeholder)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backtest_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  symbol text NOT NULL DEFAULT '',
  timeframe text NOT NULL DEFAULT '15m',
  source text NOT NULL DEFAULT 'csv_upload',
  file_path text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backtest datasets"
  ON public.backtest_datasets FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert backtest datasets"
  ON public.backtest_datasets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ============================================================
-- 6. Extend signals table for mode awareness
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'mode_slug'
  ) THEN
    ALTER TABLE public.signals ADD COLUMN mode_slug text NOT NULL DEFAULT 'signal_mode';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'arbitrator_decision'
  ) THEN
    ALTER TABLE public.signals ADD COLUMN arbitrator_decision jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'risk_profile_snapshot'
  ) THEN
    ALTER TABLE public.signals ADD COLUMN risk_profile_snapshot jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'paper_execution_intent_id'
  ) THEN
    ALTER TABLE public.signals ADD COLUMN paper_execution_intent_id uuid REFERENCES public.paper_execution_intents(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE public.signals ADD COLUMN data_source text NOT NULL DEFAULT 'DEMO DATA';
  END IF;
END $$;

-- ============================================================
-- 7. Seed mode_configs defaults
-- ============================================================
INSERT INTO public.mode_configs (mode_slug, display_name, enabled, description, strategy_overrides, execution_policy)
VALUES
  (
    'signal_mode',
    'Signal Mode',
    true,
    'Delivers curated A/A+ signals to Telegram and dashboard. No execution. Demo/Real data labelled clearly.',
    '{"allowed_strategies": ["MicroScalper", "CompressionBreakout"], "min_grade": "A", "min_score": 75}'::jsonb,
    '{"execution_enabled": false, "paper_execution_enabled": false, "demo_bridge_enabled": false, "live_bridge_enabled": false, "output": "telegram_and_dashboard"}'::jsonb
  ),
  (
    'personal_mode',
    'Personal Bot Mode',
    false,
    'Controlled aggressive trading for personal accounts. Frequent qualified signals. Compounding-ready. MT5 demo bridge target. Execution disabled until explicitly enabled.',
    '{"allowed_strategies": ["MicroScalper", "CompressionBreakout"], "min_grade": "A", "min_score": 72, "style": "controlled_aggressive"}'::jsonb,
    '{"execution_enabled": false, "paper_execution_enabled": true, "demo_bridge_enabled": false, "live_bridge_enabled": false, "output": "paper_and_dashboard"}'::jsonb
  ),
  (
    'prop_mode',
    'Prop Bot Mode',
    false,
    'Conservative challenge-safe trading. Strict drawdown, daily lock, consecutive loss guard. MT5 demo bridge target. Execution disabled until explicitly enabled.',
    '{"allowed_strategies": ["CompressionBreakout", "MicroScalper"], "min_grade": "A", "min_score": 80, "style": "conservative"}'::jsonb,
    '{"execution_enabled": false, "paper_execution_enabled": true, "demo_bridge_enabled": false, "live_bridge_enabled": false, "output": "paper_and_dashboard"}'::jsonb
  )
ON CONFLICT (mode_slug) DO NOTHING;

-- ============================================================
-- 8. Seed risk_profiles defaults
-- ============================================================
INSERT INTO public.risk_profiles (
  mode_slug, enabled, equity_start,
  risk_per_trade_pct, max_risk_per_trade_pct,
  max_daily_loss_pct, max_total_drawdown_pct,
  max_open_positions, max_open_risk_pct,
  max_trades_per_day, max_consecutive_losses,
  cooldown_minutes_after_loss,
  one_active_signal_per_symbol, correlation_guard_enabled,
  daily_lock_enabled, compounding_enabled, compounding_mode,
  score_threshold_override, min_rr_override
)
VALUES
  (
    'signal_mode', true, 0,
    0, 0, 0, 0, 0, 0,
    999, 999, 0,
    true, true, false, false, 'off', 75, 1.2
  ),
  (
    'personal_mode', true, 1000,
    0.5, 1.0, 3.0, 10.0, 5, 3.0,
    12, 4, 15,
    true, true, true, true, 'equity_based', 72, 1.15
  ),
  (
    'prop_mode', true, 10000,
    0.25, 0.5, 2.0, 5.0, 3, 1.0,
    5, 3, 30,
    true, true, true, false, 'off', 80, 1.5
  )
ON CONFLICT (mode_slug) DO NOTHING;
