/*
  # HashiBot Core Tables Migration

  ## Summary
  Creates the foundational tables for the HashiBot trading signal platform.

  ## Tables Created
  1. profiles - User profile data linked to auth.users
  2. user_access - Product access control (Signal Mode, EA, etc.)
  3. symbols - 20 tradable markets (10 crypto + 10 forex)
  4. candles - OHLCV candle data storage
  5. indicator_snapshots - Calculated technical indicators per symbol/timeframe
  6. scanner_runs - Scanner execution log
  7. strategy_candidates - Raw strategy setups before arbitration
  8. signals - Approved, graded trading signals
  9. signal_updates - Signal status change history
  10. provider_status - Market data provider health
  11. telegram_deliveries - Telegram message delivery log
  12. audit_logs - Admin action audit trail
  13. licenses - Product license keys

  ## Security
  - RLS enabled on all tables
  - Users can only read their own profile/access/licenses
  - Signals are readable by users with active signal_mode access
  - Admin-only tables locked to service role or admin role
*/

-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT '',
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'admin'
    )
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── USER ACCESS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own access"
  ON user_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all access"
  ON user_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert access"
  ON user_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update access"
  ON user_access FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── SYMBOLS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symbols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  display_name text NOT NULL,
  market_type text NOT NULL DEFAULT 'crypto',
  provider text NOT NULL DEFAULT 'demo',
  is_active boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read symbols"
  ON symbols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert symbols"
  ON symbols FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update symbols"
  ON symbols FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed the 20 symbols
INSERT INTO symbols (symbol, display_name, market_type, provider, is_active) VALUES
  ('BTCUSDT',  'Bitcoin / USDT',       'crypto', 'binance', true),
  ('ETHUSDT',  'Ethereum / USDT',      'crypto', 'binance', true),
  ('SOLUSDT',  'Solana / USDT',        'crypto', 'binance', true),
  ('BNBUSDT',  'BNB / USDT',           'crypto', 'binance', true),
  ('XRPUSDT',  'XRP / USDT',           'crypto', 'binance', true),
  ('ADAUSDT',  'Cardano / USDT',       'crypto', 'binance', true),
  ('DOGEUSDT', 'Dogecoin / USDT',      'crypto', 'binance', true),
  ('AVAXUSDT', 'Avalanche / USDT',     'crypto', 'binance', true),
  ('LINKUSDT', 'Chainlink / USDT',     'crypto', 'binance', true),
  ('POLUSDT',  'Polygon / USDT',       'crypto', 'binance', true),
  ('EURUSD',   'Euro / US Dollar',     'forex',  'demo',    true),
  ('GBPUSD',   'GBP / US Dollar',      'forex',  'demo',    true),
  ('USDJPY',   'USD / Japanese Yen',   'forex',  'demo',    true),
  ('USDCHF',   'USD / Swiss Franc',    'forex',  'demo',    true),
  ('AUDUSD',   'Australian Dollar',    'forex',  'demo',    true),
  ('NZDUSD',   'New Zealand Dollar',   'forex',  'demo',    true),
  ('USDCAD',   'USD / Canadian Dollar','forex',  'demo',    true),
  ('EURJPY',   'Euro / Japanese Yen',  'forex',  'demo',    true),
  ('GBPJPY',   'GBP / Japanese Yen',   'forex',  'demo',    true),
  ('XAUUSD',   'Gold / US Dollar',     'forex',  'demo',    true)
ON CONFLICT (symbol) DO NOTHING;

-- ─── CANDLES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  market_type text NOT NULL,
  timeframe text NOT NULL,
  open_time timestamptz NOT NULL,
  open numeric(20,8) NOT NULL,
  high numeric(20,8) NOT NULL,
  low numeric(20,8) NOT NULL,
  close numeric(20,8) NOT NULL,
  volume numeric(30,8) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'demo',
  created_at timestamptz DEFAULT now(),
  UNIQUE(symbol, timeframe, open_time)
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf_time ON candles(symbol, timeframe, open_time DESC);

ALTER TABLE candles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read candles"
  ON candles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert candles"
  ON candles FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── INDICATOR SNAPSHOTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indicator_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  market_type text NOT NULL,
  timeframe text NOT NULL,
  candle_time timestamptz NOT NULL,
  ema20 numeric(20,8),
  ema50 numeric(20,8),
  atr14 numeric(20,8),
  rsi14 numeric(6,2),
  recent_high numeric(20,8),
  recent_low numeric(20,8),
  volatility_state text DEFAULT 'normal',
  regime text DEFAULT 'unclear',
  created_at timestamptz DEFAULT now(),
  UNIQUE(symbol, timeframe, candle_time)
);

CREATE INDEX IF NOT EXISTS idx_indicators_symbol_tf ON indicator_snapshots(symbol, timeframe, candle_time DESC);

ALTER TABLE indicator_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read indicator snapshots"
  ON indicator_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert indicator snapshots"
  ON indicator_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── SCANNER RUNS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scanner_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  symbols_scanned integer DEFAULT 0,
  candles_fetched integer DEFAULT 0,
  candidates_found integer DEFAULT 0,
  signals_created integer DEFAULT 0,
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scanner_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scanner runs"
  ON scanner_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert scanner runs"
  ON scanner_runs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update scanner runs"
  ON scanner_runs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── STRATEGY CANDIDATES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_run_id uuid REFERENCES scanner_runs(id),
  symbol text NOT NULL,
  market_type text NOT NULL,
  timeframe text NOT NULL,
  strategy_name text NOT NULL,
  direction text NOT NULL,
  entry_low numeric(20,8),
  entry_high numeric(20,8),
  stop_loss numeric(20,8),
  tp1 numeric(20,8),
  tp2 numeric(20,8),
  risk_reward numeric(6,2),
  regime text DEFAULT 'unclear',
  confidence_score integer DEFAULT 0,
  grade text DEFAULT 'none',
  reason text DEFAULT '',
  rejection_reason text DEFAULT '',
  status text NOT NULL DEFAULT 'candidate',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_run_id ON strategy_candidates(scanner_run_id);
CREATE INDEX IF NOT EXISTS idx_candidates_symbol ON strategy_candidates(symbol, created_at DESC);

ALTER TABLE strategy_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read candidates"
  ON strategy_candidates FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert candidates"
  ON strategy_candidates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update candidates"
  ON strategy_candidates FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── SIGNALS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES strategy_candidates(id),
  symbol text NOT NULL,
  market_type text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  entry_type text NOT NULL DEFAULT 'zone',
  entry_low numeric(20,8),
  entry_high numeric(20,8),
  stop_loss numeric(20,8),
  tp1 numeric(20,8),
  tp2 numeric(20,8),
  tp3 numeric(20,8),
  risk_reward numeric(6,2),
  strategy_name text NOT NULL,
  regime text DEFAULT 'unclear',
  grade text NOT NULL DEFAULT 'B',
  confidence_score integer DEFAULT 0,
  reason text DEFAULT '',
  invalidation text DEFAULT '',
  status text NOT NULL DEFAULT 'waiting',
  source text NOT NULL DEFAULT 'scanner',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol, status);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status, created_at DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with access can read signals"
  ON signals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_access
      WHERE user_id = auth.uid()
        AND product_slug = 'signal_mode'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert signals"
  ON signals FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update signals"
  ON signals FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── SIGNAL UPDATES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  update_type text NOT NULL,
  old_status text DEFAULT '',
  new_status text DEFAULT '',
  message text DEFAULT '',
  price numeric(20,8),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE signal_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with access can read signal updates"
  ON signal_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_access
      WHERE user_id = auth.uid()
        AND product_slug = 'signal_mode'
        AND status = 'active'
    )
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert signal updates"
  ON signal_updates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── PROVIDER STATUS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  market_type text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_success_at timestamptz,
  last_error_at timestamptz,
  error_message text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE provider_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read provider status"
  ON provider_status FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert provider status"
  ON provider_status FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update provider status"
  ON provider_status FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed provider records
INSERT INTO provider_status (provider_name, market_type, status) VALUES
  ('binance', 'crypto', 'not_configured'),
  ('demo',    'forex',  'active')
ON CONFLICT (provider_name) DO NOTHING;

-- ─── TELEGRAM DELIVERIES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES signals(id),
  delivery_type text NOT NULL DEFAULT 'signal',
  chat_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  telegram_message_id text DEFAULT '',
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE telegram_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read telegram deliveries"
  ON telegram_deliveries FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert telegram deliveries"
  ON telegram_deliveries FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update telegram deliveries"
  ON telegram_deliveries FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  entity_type text DEFAULT '',
  entity_id text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── LICENSES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  license_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status text NOT NULL DEFAULT 'inactive',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own licenses"
  ON licenses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all licenses"
  ON licenses FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert licenses"
  ON licenses FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update licenses"
  ON licenses FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
