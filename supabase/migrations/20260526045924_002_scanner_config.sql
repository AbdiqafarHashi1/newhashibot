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
