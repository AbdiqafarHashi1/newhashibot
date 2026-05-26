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
