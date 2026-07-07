/*
# Symbol Universe, Execution Lifecycle, Protection Engine, and Retention Infrastructure

## 1. Symbol Universe Groups
- New table `symbol_universe_groups` for managing scanner symbol universes
- Groups: crypto_core (default enabled), crypto_extended (disabled), forex_core (disabled), forex_extended (disabled)
- Scanner config gets `enabled_universe_group` column (default: crypto_core)
- Admin can see and change which universe is active

## 2. Execution Lifecycle State Machine
- New table `execution_lifecycle_events` for unified Binance/Bybit lifecycle tracking
- States: SIGNAL_CREATED -> QUALIFIED -> POSITION_SIZED -> ORDER_SUBMITTED -> FILLED -> PROTECTED -> TP1 -> BREAKEVEN -> TP2 -> CLOSED -> ARCHIVED
- Plus FAILED and RECOVERY_REQUIRED
- Every fill must become PROTECTED or RECOVERY_REQUIRED

## 3. Protection Engine
- New table `protection_events` for compact protection/lifecycle events from provider monitors
- Tracks: protected count, unprotected count, recovery required, orphan positions, missing SL/TP
- Retention on protection events (30 days default)

## 4. Retention Infrastructure
- New table `retention_policies` for configurable retention rules
- RPC `run_retention_dry_run` for safe dry-run reporting
- RPC `run_retention_cleanup` for actual cleanup
- RPC `get_retention_report` for status reporting
- Protected entities: users, subscriptions, packages, active signals, active trades, telegram links, provider credentials, strategy configs, audit history

## 5. HashiBridge Registry
- New table `hashibridge_registry` for bridge/device registration
- Tracks: bridge_id, customer mapping, last heartbeat, validation status, enable/disable controls
- New table `hashibridge_command_queue` for command queue status

## 6. Scanner Config Updates
- Add `enabled_universe_group` to scanner_config (default: crypto_core)
- Add `persist_candles_enabled` (default: false) to stop candle warehouse
- Add `persist_indicators_enabled` (default: false) to stop indicator persistence
- Add `max_scanner_runs_retention_days` (default: 14) for scanner run cleanup
- Add `max_strategy_candidates_retention_days` (default: 14) for candidate cleanup

## 7. Feature Flags
- New table `feature_flags` for controlling forex/MT5/live execution
- forex_execution_enabled (default: false)
- forex_signal_mode_enabled (default: false)
- mt5_live_execution_enabled (default: false)
- mt5_bridge_enabled (default: false)
- binance_testnet_enabled (default: true)
- bybit_testnet_enabled (default: true)
*/

-- ─── 1. Symbol Universe Groups ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS symbol_universe_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  market_type text NOT NULL DEFAULT 'crypto',
  symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE symbol_universe_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_universe_groups" ON symbol_universe_groups;
CREATE POLICY "select_universe_groups" ON symbol_universe_groups FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_universe_groups" ON symbol_universe_groups;
CREATE POLICY "update_universe_groups" ON symbol_universe_groups FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insert_universe_groups" ON symbol_universe_groups;
CREATE POLICY "insert_universe_groups" ON symbol_universe_groups FOR INSERT
  TO authenticated WITH CHECK (true);

-- Seed default groups
INSERT INTO symbol_universe_groups (group_name, display_name, market_type, symbols, is_enabled, is_default, sort_order, description)
VALUES
  ('crypto_core', 'Crypto Core (BTC, ETH, SOL)', 'crypto',
   '["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]'::jsonb,
   true, true, 1, 'Core crypto symbols — default production universe'),
  ('crypto_extended', 'Crypto Extended (Top 20)', 'crypto',
   '["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","DOTUSDT","MATICUSDT","LTCUSDT","BCHUSDT","ATOMUSDT","NEARUSDT","APTUSDT","ARBUSDT","OPUSDT","INJUSDT","SUIUSDT"]'::jsonb,
   false, false, 2, 'Extended crypto universe — disabled by default until validated'),
  ('forex_core', 'Forex Core (EUR, GBP, JPY)', 'forex',
   '["EURUSD","GBPUSD","USDJPY"]'::jsonb,
   false, false, 3, 'Core forex pairs — disabled until validation'),
  ('forex_extended', 'Forex Extended (Majors)', 'forex',
   '["EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD"]'::jsonb,
   false, false, 4, 'Extended forex pairs — disabled until validation')
ON CONFLICT (group_name) DO NOTHING;

-- ─── 2. Scanner Config Updates ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'enabled_universe_group') THEN
    ALTER TABLE scanner_config ADD COLUMN enabled_universe_group text NOT NULL DEFAULT 'crypto_core';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'persist_candles_enabled') THEN
    ALTER TABLE scanner_config ADD COLUMN persist_candles_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'persist_indicators_enabled') THEN
    ALTER TABLE scanner_config ADD COLUMN persist_indicators_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'max_scanner_runs_retention_days') THEN
    ALTER TABLE scanner_config ADD COLUMN max_scanner_runs_retention_days integer NOT NULL DEFAULT 14;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scanner_config' AND column_name = 'max_strategy_candidates_retention_days') THEN
    ALTER TABLE scanner_config ADD COLUMN max_strategy_candidates_retention_days integer NOT NULL DEFAULT 14;
  END IF;
END $$;

-- ─── 3. Execution Lifecycle Events ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_order_id uuid REFERENCES execution_orders(id) ON DELETE CASCADE,
  signal_id uuid,
  provider text NOT NULL,
  symbol text NOT NULL,
  lifecycle_state text NOT NULL,
  previous_state text,
  event_type text NOT NULL,
  event_message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE execution_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_lifecycle_events" ON execution_lifecycle_events;
CREATE POLICY "select_lifecycle_events" ON execution_lifecycle_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_lifecycle_events" ON execution_lifecycle_events;
CREATE POLICY "insert_lifecycle_events" ON execution_lifecycle_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_execution_id ON execution_lifecycle_events(execution_order_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_provider ON execution_lifecycle_events(provider);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created_at ON execution_lifecycle_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_state ON execution_lifecycle_events(lifecycle_state);

-- ─── 4. Protection Events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS protection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_order_id uuid REFERENCES execution_orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  symbol text NOT NULL,
  event_type text NOT NULL,
  protection_status text NOT NULL,
  has_sl boolean NOT NULL DEFAULT false,
  has_tp boolean NOT NULL DEFAULT false,
  is_orphan boolean NOT NULL DEFAULT false,
  is_duplicate_symbol boolean NOT NULL DEFAULT false,
  recovery_required boolean NOT NULL DEFAULT false,
  repair_attempted boolean NOT NULL DEFAULT false,
  repair_succeeded boolean NOT NULL DEFAULT false,
  error_message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE protection_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_protection_events" ON protection_events;
CREATE POLICY "select_protection_events" ON protection_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_protection_events" ON protection_events;
CREATE POLICY "insert_protection_events" ON protection_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_protection_events_execution_id ON protection_events(execution_order_id);
CREATE INDEX IF NOT EXISTS idx_protection_events_provider ON protection_events(provider);
CREATE INDEX IF NOT EXISTS idx_protection_events_created_at ON protection_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_protection_events_protection_status ON protection_events(protection_status);

-- ─── 5. Retention Policies ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS retention_policies (
  id serial PRIMARY KEY,
  table_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  retention_days integer NOT NULL DEFAULT 30,
  is_enabled boolean NOT NULL DEFAULT true,
  is_protected boolean NOT NULL DEFAULT false,
  cleanup_action text NOT NULL DEFAULT 'delete',
  description text NOT NULL DEFAULT '',
  last_run_at timestamptz,
  last_rows_affected integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_retention_policies" ON retention_policies;
CREATE POLICY "select_retention_policies" ON retention_policies FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_retention_policies" ON retention_policies;
CREATE POLICY "update_retention_policies" ON retention_policies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Seed retention policies
INSERT INTO retention_policies (table_name, display_name, retention_days, is_enabled, is_protected, cleanup_action, description)
VALUES
  ('candles', 'Raw Candle Data', 7, true, false, 'delete', 'Exchange fetch replaces persistence — keep only 7 days for diagnostics'),
  ('indicator_snapshots', 'Indicator Snapshots', 3, true, false, 'delete', 'Recomputed on each scan — keep only 3 days'),
  ('scanner_runs', 'Scanner Run Logs', 14, true, false, 'delete', 'Compact summaries kept for 14 days'),
  ('strategy_candidates', 'Strategy Candidates', 14, true, false, 'delete', 'Rejected candidates cleaned after 14 days'),
  ('telegram_deliveries', 'Telegram Delivery Logs', 30, true, false, 'delete', 'Delivery logs kept for 30 days'),
  ('execution_lifecycle_events', 'Execution Lifecycle Events', 30, true, false, 'delete', 'Lifecycle events kept for 30 days'),
  ('protection_events', 'Protection Events', 30, true, false, 'delete', 'Protection events kept for 30 days'),
  ('execution_event_logs', 'Execution Event Logs', 30, true, false, 'delete', 'Execution event logs kept for 30 days'),
  ('backtest_runs', 'Backtest Runs', 90, true, false, 'delete', 'Backtest results kept for 90 days'),
  ('signals', 'Signals', 365, true, false, 'archive', 'Signals archived after 1 year — customer-facing data'),
  ('execution_orders', 'Execution Orders', 365, true, false, 'archive', 'Execution orders archived after 1 year'),
  ('audit_logs', 'Audit Logs', 365, true, true, 'delete', 'Audit history protected for 1 year'),
  ('profiles', 'User Profiles', 0, false, true, 'none', 'Protected — never deleted'),
  ('customer_subscriptions', 'Customer Subscriptions', 0, false, true, 'none', 'Protected — never deleted'),
  ('packages', 'Packages', 0, false, true, 'none', 'Protected — never deleted'),
  ('telegram_links', 'Telegram Links', 0, false, true, 'none', 'Protected — never deleted'),
  ('strategy_configs', 'Strategy Configs', 0, false, true, 'none', 'Protected — never deleted'),
  ('execution_settings', 'Execution Settings', 0, false, true, 'none', 'Protected — never deleted'),
  ('provider_status', 'Provider Status', 0, false, true, 'none', 'Protected — never deleted')
ON CONFLICT (table_name) DO NOTHING;

-- ─── 6. Feature Flags ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_flags (
  id serial PRIMARY KEY,
  flag_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'execution',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_feature_flags" ON feature_flags;
CREATE POLICY "select_feature_flags" ON feature_flags FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_feature_flags" ON feature_flags;
CREATE POLICY "update_feature_flags" ON feature_flags FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, category)
VALUES
  ('forex_execution_enabled', 'Forex Execution', 'Enable forex live execution — disabled until validated', false, 'forex'),
  ('forex_signal_mode_enabled', 'Forex Signal Mode', 'Enable forex signal generation — disabled until validated', false, 'forex'),
  ('mt5_live_execution_enabled', 'MT5 Live Execution', 'Enable MT5 live order execution — disabled by default', false, 'mt5'),
  ('mt5_bridge_enabled', 'MT5 Bridge', 'Enable MT5 HashiBridge connectivity — disabled by default', false, 'mt5'),
  ('binance_testnet_enabled', 'Binance Testnet', 'Binance USD-M testnet execution enabled', true, 'execution'),
  ('bybit_testnet_enabled', 'Bybit Testnet', 'Bybit demo/testnet execution enabled', true, 'execution'),
  ('persist_candles_enabled', 'Persist Candles', 'Store raw candle data in Supabase — disabled to save storage', false, 'storage'),
  ('persist_indicators_enabled', 'Persist Indicators', 'Store indicator snapshots in Supabase — disabled to save storage', false, 'storage')
ON CONFLICT (flag_name) DO NOTHING;

-- ─── 7. HashiBridge Registry ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hashibridge_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT '',
  mt5_account_number text NOT NULL DEFAULT '',
  mt5_server text NOT NULL DEFAULT '',
  capital_mode text NOT NULL DEFAULT 'personal',
  bridge_status text NOT NULL DEFAULT 'offline',
  last_heartbeat_at timestamptz,
  validation_status text NOT NULL DEFAULT 'pending',
  is_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hashibridge_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_hashibridge_registry" ON hashibridge_registry;
CREATE POLICY "select_hashibridge_registry" ON hashibridge_registry FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_hashibridge_registry" ON hashibridge_registry;
CREATE POLICY "update_hashibridge_registry" ON hashibridge_registry FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insert_hashibridge_registry" ON hashibridge_registry;
CREATE POLICY "insert_hashibridge_registry" ON hashibridge_registry FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hashibridge_user_id ON hashibridge_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_hashibridge_status ON hashibridge_registry(bridge_status);

-- ─── 8. HashiBridge Command Queue ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hashibridge_command_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id text NOT NULL REFERENCES hashibridge_registry(bridge_id) ON DELETE CASCADE,
  command_type text NOT NULL,
  command_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE hashibridge_command_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_hashibridge_queue" ON hashibridge_command_queue;
CREATE POLICY "select_hashibridge_queue" ON hashibridge_command_queue FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_hashibridge_queue" ON hashibridge_command_queue;
CREATE POLICY "insert_hashibridge_queue" ON hashibridge_command_queue FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_hashibridge_queue" ON hashibridge_command_queue;
CREATE POLICY "update_hashibridge_queue" ON hashibridge_command_queue FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hashibridge_queue_bridge_id ON hashibridge_command_queue(bridge_id);
CREATE INDEX IF NOT EXISTS idx_hashibridge_queue_status ON hashibridge_command_queue(status);

-- ─── 9. Retention RPCs ─────────────────────────────────────────────────────

-- Dry run: reports what would be cleaned up without deleting anything
CREATE OR REPLACE FUNCTION run_retention_dry_run()
RETURNS TABLE(
  table_name text,
  display_name text,
  retention_days integer,
  estimated_rows bigint,
  oldest_record timestamptz,
  cleanup_action text,
  is_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  row_count bigint;
  oldest timestamptz;
BEGIN
  FOR r IN SELECT * FROM retention_policies WHERE is_enabled = true AND is_protected = false AND retention_days > 0 LOOP
    EXECUTE format(
      'SELECT count(*), COALESCE(min(created_at), now()) FROM %I WHERE created_at < now() - interval ''%s days''',
      r.table_name, r.retention_days
    ) INTO row_count, oldest;
    row_count := COALESCE(row_count, 0);
    oldest := COALESCE(oldest, now());
    table_name := r.table_name;
    display_name := r.display_name;
    retention_days := r.retention_days;
    estimated_rows := row_count;
    oldest_record := oldest;
    cleanup_action := r.cleanup_action;
    is_protected := r.is_protected;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Cleanup: actually deletes/archives expired rows
CREATE OR REPLACE FUNCTION run_retention_cleanup()
RETURNS TABLE(
  table_name text,
  rows_affected bigint,
  action_taken text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  row_count bigint;
BEGIN
  FOR r IN SELECT * FROM retention_policies WHERE is_enabled = true AND is_protected = false AND retention_days > 0 LOOP
    row_count := 0;
    IF r.cleanup_action = 'delete' THEN
      EXECUTE format(
        'WITH deleted AS (DELETE FROM %I WHERE created_at < now() - interval ''%s days'' RETURNING 1) SELECT count(*) FROM deleted',
        r.table_name, r.retention_days
      ) INTO row_count;
      table_name := r.table_name;
      rows_affected := COALESCE(row_count, 0);
      action_taken := 'deleted';
      RETURN NEXT;
      UPDATE retention_policies SET last_run_at = now(), last_rows_affected = COALESCE(row_count, 0) WHERE id = r.id;
    ELSIF r.cleanup_action = 'archive' THEN
      -- For archive actions, we just delete old non-active records
      -- Active records (status in waiting/active) are always protected
      EXECUTE format(
        'WITH deleted AS (DELETE FROM %I WHERE created_at < now() - interval ''%s days'' AND status NOT IN (''waiting'', ''active'', ''pending'', ''entry_submitted'', ''entry_filled'', ''protected'', ''pending_protection'', ''protection_pending'') RETURNING 1) SELECT count(*) FROM deleted',
        r.table_name, r.retention_days
      ) INTO row_count;
      table_name := r.table_name;
      rows_affected := COALESCE(row_count, 0);
      action_taken := 'archived';
      RETURN NEXT;
      UPDATE retention_policies SET last_run_at = now(), last_rows_affected = COALESCE(row_count, 0) WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- Report: shows current retention status
CREATE OR REPLACE FUNCTION get_retention_report()
RETURNS TABLE(
  table_name text,
  display_name text,
  retention_days integer,
  is_enabled boolean,
  is_protected boolean,
  total_rows bigint,
  expired_rows bigint,
  last_run_at timestamptz,
  last_rows_affected integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  total_count bigint;
  expired_count bigint;
BEGIN
  FOR r IN SELECT * FROM retention_policies ORDER BY is_protected DESC, table_name LOOP
    total_count := 0;
    expired_count := 0;
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', r.table_name) INTO total_count;
      IF r.retention_days > 0 AND r.is_protected = false THEN
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE created_at < now() - interval ''%s days''',
          r.table_name, r.retention_days
        ) INTO expired_count;
      END IF;
    EXCEPTION WHEN others THEN
      total_count := 0;
      expired_count := 0;
    END;
    table_name := r.table_name;
    display_name := r.display_name;
    retention_days := r.retention_days;
    is_enabled := r.is_enabled;
    is_protected := r.is_protected;
    total_rows := COALESCE(total_count, 0);
    expired_rows := COALESCE(expired_count, 0);
    last_run_at := r.last_run_at;
    last_rows_affected := r.last_rows_affected;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ─── 10. Protection Summary RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_protection_summary()
RETURNS TABLE(
  total_positions bigint,
  protected_count bigint,
  unprotected_count bigint,
  recovery_required_count bigint,
  failed_repairs_count bigint,
  orphan_positions_count bigint,
  missing_sl_tp_count bigint,
  last_protection_scan timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint AS total_positions,
    count(*) FILTER (WHERE protection_status IN ('protected', 'protected_native', 'protected_managed'))::bigint AS protected_count,
    count(*) FILTER (WHERE protection_status IN ('unprotected', 'unprotected_failed'))::bigint AS unprotected_count,
    count(*) FILTER (WHERE recovery_status = 'recovery_required' OR protection_status = 'protection_failed')::bigint AS recovery_required_count,
    count(*) FILTER (WHERE recovery_status = 'repair_failed')::bigint AS failed_repairs_count,
    count(*) FILTER (WHERE lifecycle_state = 'orphan_detected')::bigint AS orphan_positions_count,
    count(*) FILTER (WHERE stop_loss IS NULL OR stop_loss = 0 OR tp1 IS NULL OR tp1 = 0)::bigint AS missing_sl_tp_count,
    max(updated_at) AS last_protection_scan
  FROM execution_orders
  WHERE status IN ('entry_filled', 'protected', 'protected_managed', 'pending_protection', 'protection_pending', 'protection_failed', 'partially_closed');
END;
$$;

-- ─── 11. Compact Scanner Summary RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_scanner_summary_compact(limit_count integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  status text,
  run_type text,
  started_at timestamptz,
  finished_at timestamptz,
  symbols_scanned integer,
  signals_created integer,
  candidates_found integer,
  telegram_sent_count integer,
  market_mode text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.id, sr.status, sr.run_type, sr.started_at, sr.finished_at,
    COALESCE(sr.symbols_scanned, 0), COALESCE(sr.signals_created, 0),
    COALESCE(sr.candidates_found, 0), COALESCE(sr.telegram_sent_count, 0),
    COALESCE(sr.market_mode, ''), COALESCE(sr.error_message, '')
  FROM scanner_runs sr
  ORDER BY sr.started_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 100));
END;
$$;

-- ─── 12. Execution Lifecycle Summary RPC ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_execution_lifecycle_summary()
RETURNS TABLE(
  provider text,
  total bigint,
  signal_created bigint,
  qualified bigint,
  order_submitted bigint,
  filled bigint,
  protected bigint,
  tp1_hit bigint,
  breakeven bigint,
  tp2_hit bigint,
  closed bigint,
  failed bigint,
  recovery_required bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(execution_provider, 'unknown')::text AS provider,
    count(*)::bigint AS total,
    count(*) FILTER (WHERE lifecycle_state = 'SIGNAL_CREATED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'QUALIFIED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'ORDER_SUBMITTED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'FILLED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'PROTECTED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'TP1')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'BREAKEVEN')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'TP2')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'CLOSED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'FAILED')::bigint,
    count(*) FILTER (WHERE lifecycle_state = 'RECOVERY_REQUIRED')::bigint
  FROM execution_orders
  WHERE execution_provider IS NOT NULL
  GROUP BY execution_provider;
END;
$$;
