/*
  # Add telegram_skipped_count and duplicate_symbol_blocked to scanner_runs

  ## Summary
  Adds two missing count columns to scanner_runs so the scanner pipeline can
  report truthful stats for Telegram skip tracking and symbol deduplication.

  ## New Columns on scanner_runs
  - `telegram_skipped_count` (INTEGER, DEFAULT 0) — count of auto Telegram sends
    skipped during the scan (already_sent, grade_below_min, forex_disabled, etc.)
  - `duplicate_symbol_blocked` (INTEGER, DEFAULT 0) — count of candidates that
    were blocked because the symbol already had a waiting/active signal

  ## Notes
  - telegram_blocked_count (existing) is telegram_skipped + telegram_failed combined.
    The new columns provide the split breakdown.
  - No existing data is modified.
  - Both columns default to 0 so existing rows are not null.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'telegram_skipped_count'
  ) THEN
    ALTER TABLE scanner_runs ADD COLUMN telegram_skipped_count INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'duplicate_symbol_blocked'
  ) THEN
    ALTER TABLE scanner_runs ADD COLUMN duplicate_symbol_blocked INTEGER DEFAULT 0;
  END IF;
END $$;
