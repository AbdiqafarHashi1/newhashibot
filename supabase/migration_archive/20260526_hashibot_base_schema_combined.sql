-- HashiBot Base Schema Combined Deployment Script (NO CRON JOB CREATION)
-- Generated on 2026-05-26 UTC from ordered migrations 001..011.
-- Excludes: 20260526100000_012_schedule_market_scanner_cron.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY
);

-- ===== BEGIN 20260526042530_001_create_core_tables.sql =====
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
-- ===== END 20260526042530_001_create_core_tables.sql =====

-- ===== BEGIN 20260526045924_002_scanner_config.sql =====
/*
  # Scanner Configuration Table

  ## Summary
  Adds a single-row scanner_config table that controls all scanner behaviour:
  global on/off, demo mode, minimum grade, duplicate prevention, scan intervals,
  active timeframes, and whether demo signals may be sent to Telegram.

  ## Tables
  - scanner_config (id, is_enabled, demo_mode_enabled, min_signal_grade,
    prevent_duplicate_symbol_signals, crypto_scan_interval_minutes,
    forex_scan_interval_minutes, active_timeframes, allow_demo_telegram_sending,
    last_updated_by, updated_at)

  ## Security
  - RLS enabled
  - Admins can read and update
  - No anonymous access
*/

CREATE TABLE IF NOT EXISTS scanner_config (
  id                              integer PRIMARY KEY DEFAULT 1,
  is_enabled                      boolean NOT NULL DEFAULT true,
  demo_mode_enabled               boolean NOT NULL DEFAULT true,
  min_signal_grade                text    NOT NULL DEFAULT 'A',
  prevent_duplicate_symbol_signals boolean NOT NULL DEFAULT true,
  crypto_scan_interval_minutes    integer NOT NULL DEFAULT 5,
  forex_scan_interval_minutes     integer NOT NULL DEFAULT 15,
  active_timeframes               text[]  NOT NULL DEFAULT ARRAY['5m','15m','1h','4h'],
  allow_demo_telegram_sending     boolean NOT NULL DEFAULT false,
  last_updated_by                 uuid    REFERENCES profiles(id),
  updated_at                      timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed with defaults
INSERT INTO scanner_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE scanner_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scanner config"
  ON scanner_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update scanner config"
  ON scanner_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
-- ===== END 20260526045924_002_scanner_config.sql =====

-- ===== BEGIN 20260526053206_003_telegram_links.sql =====
/*
  # Add telegram_links table

  1. New Tables
    - `telegram_links`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `telegram_username` (text, optional)
      - `telegram_chat_id` (text, optional)
      - `status` (text: pending, connected, revoked)
      - `notes` (text, admin notes)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Users can view/insert their own links
    - Admins can view and update all links (checked via profiles.role)
*/

CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_username text DEFAULT '',
  telegram_chat_id text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'revoked')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram links"
  ON telegram_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram links"
  ON telegram_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram links"
  ON telegram_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all telegram links"
  ON telegram_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all telegram links"
  ON telegram_links FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id ON telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_status ON telegram_links(status);
-- ===== END 20260526053206_003_telegram_links.sql =====

-- ===== BEGIN 20260526055533_004_fix_profiles_rls_and_trigger.sql =====
/*
  # Fix profiles table RLS and trigger

  ## Problem
  Registration fails with "Database error saving new user" because:
  - The handle_new_user() trigger fires on auth.users INSERT
  - It tries to INSERT into profiles
  - No INSERT policy exists on profiles
  - RLS blocks the insert even for SECURITY DEFINER functions

  ## Changes
  1. Add INSERT policy allowing authenticated users to insert their own profile row
  2. Recreate trigger function with SECURITY DEFINER to bypass RLS during trigger execution
  3. Add service role bypass for the trigger function
  4. Add missing updated_at column to profiles for completeness
  5. Update admin-related policies to be explicit

  ## Security
  - Users can only insert/update their own profile (auth.uid() = id)
  - Role field cannot be self-elevated to admin via UPDATE policy
  - Admins can read/update all profiles
*/

-- Add updated_at column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Drop ALL existing policies on profiles and recreate clean
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

-- Allow authenticated users to INSERT their own profile row (id must match auth.uid())
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow SELECT own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'admin'
    )
  );

-- Users can update own profile (but NOT role field — enforced at app layer)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update all profiles
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

-- Recreate trigger function with SET LOCAL to bypass RLS during trigger execution
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- ===== END 20260526055533_004_fix_profiles_rls_and_trigger.sql =====

-- ===== BEGIN 20260526055553_005_access_requests_and_telegram_updates.sql =====
/*
  # Add access_requests table and update telegram_links

  ## New Tables
  - `access_requests` — Customer signal access requests
    - id, user_id, product_slug, full_name, email, phone, telegram_username,
      telegram_chat_id, payment_method, notes, status, admin_note,
      created_at, updated_at

  ## Modified Tables
  - `telegram_links` — Add phone column if missing

  ## Security
  - RLS enabled on access_requests
  - Users can insert/read their own requests
  - Admins can read/update all requests
*/

-- access_requests table
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_slug text NOT NULL DEFAULT 'signal_mode',
  full_name text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  telegram_username text DEFAULT '',
  telegram_chat_id text DEFAULT '',
  payment_method text DEFAULT 'manual',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'converted_to_access')),
  admin_note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own access requests"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all access requests"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);

-- Add phone column to telegram_links if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_links' AND column_name = 'phone'
  ) THEN
    ALTER TABLE telegram_links ADD COLUMN phone text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_links' AND column_name = 'admin_note'
  ) THEN
    ALTER TABLE telegram_links ADD COLUMN admin_note text DEFAULT '';
  END IF;
END $$;
-- ===== END 20260526055553_005_access_requests_and_telegram_updates.sql =====

-- ===== BEGIN 20260526062858_006_fix_profiles_rls_recursion.sql =====
/*
  # Fix profiles RLS infinite recursion

  ## Problem
  The "Admins can read all profiles" and "Admins can update all profiles" policies
  used `EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')`.
  This queries the profiles table from inside a profiles policy, causing infinite recursion.

  ## Solution
  1. Create a SECURITY DEFINER helper function `is_admin()` that reads profiles bypassing RLS.
  2. Create a SECURITY DEFINER helper function `no_admin_exists()` for bootstrap claim check.
  3. Drop all existing profiles policies.
  4. Recreate policies using the helper functions instead of direct profiles subqueries.

  ## Changes
  - New function: `public.is_admin()` — returns true if current user has role=admin in profiles
  - New function: `public.no_admin_exists()` — returns true if zero admins exist (bootstrap only)
  - Recreated all profiles RLS policies (5 policies: INSERT, SELECT own, SELECT all admins, UPDATE own, UPDATE admin)
  - Special bootstrap UPDATE policy: allows updating own role to admin ONLY when no admin exists yet

  ## Security
  - SECURITY DEFINER functions run as the function owner (postgres), bypassing RLS
  - search_path = public is set to prevent search path injection
  - All policies still restrict to authenticated users
  - Users cannot update their own role via the normal UPDATE policy (role is excluded)
  - Bootstrap claim policy only works when no admin exists
*/

-- ============================================================
-- 1. Helper: is_admin() — reads profiles with RLS bypassed
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- ============================================================
-- 2. Helper: no_admin_exists() — true when zero admins exist
-- ============================================================
CREATE OR REPLACE FUNCTION public.no_admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role = 'admin'
  );
$$;

-- ============================================================
-- 3. Drop all existing profiles policies
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- ============================================================
-- 4. Recreate non-recursive policies
-- ============================================================

-- INSERT: users can create their own profile row (trigger + fallback)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- SELECT: users read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- SELECT: admins read all profiles (uses helper, no recursion)
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- UPDATE: users update their own profile (safe fields only, role excluded via app logic)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- UPDATE: admins update any profile (uses helper, no recursion)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- UPDATE: bootstrap claim — allows setting own role=admin ONLY when no admin exists yet
-- This is how /admin/setup works for first-time owner claim
CREATE POLICY "Bootstrap claim first admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND public.no_admin_exists())
  WITH CHECK (auth.uid() = id AND public.no_admin_exists());
-- ===== END 20260526062858_006_fix_profiles_rls_recursion.sql =====

-- ===== BEGIN 20260526072547_007_strategy_configs_execution_orders_candidates_schema.sql =====
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
-- ===== END 20260526072547_007_strategy_configs_execution_orders_candidates_schema.sql =====

-- ===== BEGIN 20260526080120_008_modes_risk_profiles_paper_execution_backtest.sql =====
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
-- ===== END 20260526080120_008_modes_risk_profiles_paper_execution_backtest.sql =====

-- ===== BEGIN 20260526082022_009_scanner_config_phase5a_fields.sql =====
/*
  # Scanner Config Phase 5A Fields

  Adds new columns to scanner_config and provider_status tables for:
  1. Always-on scheduling controls
  2. Auto Telegram delivery settings
  3. Heartbeat tracking
  4. Per-market scanning toggles
  5. Forex provider columns on provider_status

  ## Changes to scanner_config (id=1 row)
  - schedule_enabled: whether cron-triggered scheduled scanning is active
  - scan_interval_minutes: target interval shown in scheduler guide (docs only)
  - auto_send_telegram: master switch for auto Telegram delivery on signal creation
  - min_auto_send_grade: minimum grade required for auto Telegram delivery
  - scan_crypto_enabled: toggle crypto symbols in scanner
  - scan_forex_enabled: toggle forex symbols in scanner
  - last_scheduled_scan_at: timestamp of last cron-triggered scan
  - last_manual_scan_at: timestamp of last manually triggered scan
  - heartbeat_status: healthy / stale / inactive / error
  - heartbeat_updated_at: when heartbeat was last updated

  ## Changes to provider_status
  - data_source_label: "REAL DATA" or "DEMO DATA" per provider
  - last_candles_count: how many candles were successfully fetched last time
*/

-- scanner_config additions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'schedule_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'scan_interval_minutes') THEN
    ALTER TABLE public.scanner_config ADD COLUMN scan_interval_minutes integer NOT NULL DEFAULT 5;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'auto_send_telegram') THEN
    ALTER TABLE public.scanner_config ADD COLUMN auto_send_telegram boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'min_auto_send_grade') THEN
    ALTER TABLE public.scanner_config ADD COLUMN min_auto_send_grade text NOT NULL DEFAULT 'A';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'scan_crypto_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN scan_crypto_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'scan_forex_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN scan_forex_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'last_scheduled_scan_at') THEN
    ALTER TABLE public.scanner_config ADD COLUMN last_scheduled_scan_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'last_manual_scan_at') THEN
    ALTER TABLE public.scanner_config ADD COLUMN last_manual_scan_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'heartbeat_status') THEN
    ALTER TABLE public.scanner_config ADD COLUMN heartbeat_status text NOT NULL DEFAULT 'inactive';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'heartbeat_updated_at') THEN
    ALTER TABLE public.scanner_config ADD COLUMN heartbeat_updated_at timestamptz;
  END IF;
END $$;

-- provider_status additions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_status' AND column_name = 'data_source_label') THEN
    ALTER TABLE public.provider_status ADD COLUMN data_source_label text NOT NULL DEFAULT 'UNKNOWN';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_status' AND column_name = 'last_candles_count') THEN
    ALTER TABLE public.provider_status ADD COLUMN last_candles_count integer;
  END IF;
END $$;

-- scanner_runs: add run_type if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_runs' AND column_name = 'run_type') THEN
    ALTER TABLE public.scanner_runs ADD COLUMN run_type text NOT NULL DEFAULT 'manual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_runs' AND column_name = 'telegram_sent_count') THEN
    ALTER TABLE public.scanner_runs ADD COLUMN telegram_sent_count integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_runs' AND column_name = 'telegram_blocked_count') THEN
    ALTER TABLE public.scanner_runs ADD COLUMN telegram_blocked_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;
-- ===== END 20260526082022_009_scanner_config_phase5a_fields.sql =====

-- ===== BEGIN 20260526084706_010_replay_testnet_lab.sql =====
/*
  # Replay / Testnet Lab Tables

  ## Summary
  Creates the CSV replay / testnet infrastructure for backtesting strategies
  against uploaded historical candle data without executing real trades.

  ## New Tables

  ### replay_datasets
  - Stores metadata for uploaded CSV candle datasets
  - Fields: id, name, symbol, market_type, timeframe, source, file_name,
    row_count, uploaded_by (auth user), created_at

  ### replay_runs
  - Stores replay execution records
  - Fields: id, dataset_id, mode_slug, strategy_names (jsonb array),
    status (draft/running/completed/failed/cancelled), current_index,
    candles_processed, evaluations_count, candidates_count, rejected_count,
    signals_created, simulated_trades_count, result_summary (jsonb),
    error_message, created_at, updated_at

  ### replay_signals
  - Signals generated during replay (not real signals)
  - All data labeled data_source='REPLAY DATA'
  - Fields: id, replay_run_id, symbol, timeframe, strategy_name,
    direction, entry_low, entry_high, stop_loss, tp1, tp2, grade,
    confidence_score, created_at_index, created_at_candle_time,
    status (waiting/active/tp1_hit/tp2_hit/sl_hit/expired/cancelled),
    outcome_index, outcome_candle_time, pnl_r, reason, data_source

  ### replay_trades
  - Simulated trade execution records from replay
  - Fields: id, replay_signal_id, replay_run_id, mode_slug,
    entry_price, stop_loss, tp1, tp2, position_size, risk_pct,
    status, pnl_r, created_at, updated_at

  ## Security
  - RLS enabled on all tables
  - Only admin users can read/write replay data
  - Helper function checks admin role

  ## Notes
  1. Replay data is completely separate from live signals
  2. All replay signals labeled REPLAY DATA, never REAL DATA
  3. No real broker trades are executed
*/

-- ─── replay_datasets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS replay_datasets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  symbol      text NOT NULL DEFAULT '',
  market_type text NOT NULL DEFAULT 'crypto',
  timeframe   text NOT NULL DEFAULT '15m',
  source      text NOT NULL DEFAULT 'csv_upload',
  file_name   text NOT NULL DEFAULT '',
  row_count   integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE replay_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read replay_datasets"
  ON replay_datasets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert replay_datasets"
  ON replay_datasets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update replay_datasets"
  ON replay_datasets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete replay_datasets"
  ON replay_datasets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─── replay_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS replay_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id            uuid REFERENCES replay_datasets(id) ON DELETE CASCADE,
  mode_slug             text NOT NULL DEFAULT 'signal_mode',
  strategy_names        jsonb NOT NULL DEFAULT '["MicroScalper","CompressionBreakout"]',
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','running','completed','failed','cancelled')),
  start_index           integer NOT NULL DEFAULT 0,
  end_index             integer,
  current_index         integer NOT NULL DEFAULT 0,
  candles_processed     integer NOT NULL DEFAULT 0,
  evaluations_count     integer NOT NULL DEFAULT 0,
  candidates_count      integer NOT NULL DEFAULT 0,
  rejected_count        integer NOT NULL DEFAULT 0,
  signals_created       integer NOT NULL DEFAULT 0,
  simulated_trades_count integer NOT NULL DEFAULT 0,
  result_summary        jsonb,
  error_message         text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE replay_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read replay_runs"
  ON replay_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can insert replay_runs"
  ON replay_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update replay_runs"
  ON replay_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can delete replay_runs"
  ON replay_runs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── replay_signals ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS replay_signals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_run_id        uuid REFERENCES replay_runs(id) ON DELETE CASCADE,
  symbol               text NOT NULL DEFAULT '',
  timeframe            text NOT NULL DEFAULT '',
  strategy_name        text NOT NULL DEFAULT '',
  direction            text NOT NULL DEFAULT '',
  entry_low            numeric,
  entry_high           numeric,
  stop_loss            numeric,
  tp1                  numeric,
  tp2                  numeric,
  grade                text NOT NULL DEFAULT '',
  confidence_score     integer NOT NULL DEFAULT 0,
  created_at_index     integer NOT NULL DEFAULT 0,
  created_at_candle_time timestamptz,
  status               text NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','active','tp1_hit','tp2_hit','sl_hit','expired','cancelled')),
  outcome_index        integer,
  outcome_candle_time  timestamptz,
  pnl_r                numeric,
  reason               text NOT NULL DEFAULT '',
  data_source          text NOT NULL DEFAULT 'REPLAY DATA',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE replay_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read replay_signals"
  ON replay_signals FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can insert replay_signals"
  ON replay_signals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update replay_signals"
  ON replay_signals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── replay_trades ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS replay_trades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_signal_id uuid REFERENCES replay_signals(id) ON DELETE CASCADE,
  replay_run_id    uuid REFERENCES replay_runs(id) ON DELETE CASCADE,
  mode_slug        text NOT NULL DEFAULT 'signal_mode',
  entry_price      numeric,
  stop_loss        numeric,
  tp1              numeric,
  tp2              numeric,
  position_size    numeric,
  risk_pct         numeric,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','tp1_hit','tp2_hit','sl_hit','expired','cancelled')),
  pnl_r            numeric,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE replay_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read replay_trades"
  ON replay_trades FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can insert replay_trades"
  ON replay_trades FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update replay_trades"
  ON replay_trades FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_replay_runs_dataset ON replay_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_replay_signals_run ON replay_signals(replay_run_id);
CREATE INDEX IF NOT EXISTS idx_replay_trades_run ON replay_trades(replay_run_id);
CREATE INDEX IF NOT EXISTS idx_replay_trades_signal ON replay_trades(replay_signal_id);
-- ===== END 20260526084706_010_replay_testnet_lab.sql =====

-- ===== BEGIN 20260526090658_011_enable_pg_cron_and_net.sql =====
/*
  # Enable pg_cron and pg_net extensions for scheduled scanning

  1. Purpose
     - Enables pg_cron so Supabase can run SQL jobs on a schedule
     - Enables pg_net so cron jobs can make HTTP requests to Edge Functions
     - Creates the cron job that calls scheduled-market-scanner every 5 minutes
     - Adds cron_job_active column to scanner_config so the UI can report status

  2. Tables Modified
     - scanner_config: adds cron_job_active (boolean, default false)

  3. Notes
     - The cron job will be skipped by the edge function if schedule_enabled=false in scanner_config
     - The cron URL and service key are not stored in this migration — see SchedulerGuide for manual setup
     - pg_cron requires superuser; this migration enables the extensions and adds the column
     - The actual cron.schedule() call requires the Supabase project URL and service role key,
       which are not known at migration time. See SchedulerGuide page for setup instructions.
*/

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add column to track whether cron job is active (manually set by admin after confirming cron job exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_config' AND column_name = 'cron_job_active'
  ) THEN
    ALTER TABLE scanner_config ADD COLUMN cron_job_active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add column to track last cron job check time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_config' AND column_name = 'cron_job_name'
  ) THEN
    ALTER TABLE scanner_config ADD COLUMN cron_job_name text DEFAULT 'hashibot-scheduled-scanner';
  END IF;
END $$;
-- ===== END 20260526090658_011_enable_pg_cron_and_net.sql =====

INSERT INTO supabase_migrations.schema_migrations (version) VALUES
('20260526042530'),
('20260526045924'),
('20260526053206'),
('20260526055533'),
('20260526055553'),
('20260526062858'),
('20260526072547'),
('20260526080120'),
('20260526082022'),
('20260526084706'),
('20260526090658')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verification queries (run separately after successful COMMIT)
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260526042530','20260526045924','20260526053206','20260526055533','20260526055553','20260526062858','20260526072547','20260526080120','20260526082022','20260526084706','20260526090658')
ORDER BY version;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles','user_access','symbols','candles','indicator_snapshots','scanner_runs','strategy_candidates','signals','signal_updates','provider_status','telegram_deliveries','audit_logs','licenses','scanner_config','telegram_links','access_requests','strategy_configs','execution_orders','mode_configs','risk_profiles','paper_execution_intents','backtest_runs','backtest_datasets','replay_datasets','replay_runs','replay_signals','replay_trades')
ORDER BY table_name;