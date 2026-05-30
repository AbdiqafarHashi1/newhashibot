/*
  # Add provenance columns to scanner_runs

  ## Summary
  Adds three columns to `scanner_runs` to track the origin/trigger of each scan run,
  enabling the scheduler proof UI to distinguish automatic pg_cron runs from manual runs.

  ## New Columns on scanner_runs
  - `source` (TEXT, nullable) — e.g. 'pg_cron', 'admin_manual', 'test'
  - `triggered_by` (TEXT, nullable) — e.g. 'pg_cron', 'admin', 'api'
  - `is_automatic` (BOOLEAN, DEFAULT false) — true when initiated by pg_cron/automation

  ## Backfill
  All existing rows where run_type = 'scheduled' are backfilled with:
    source = 'pg_cron', triggered_by = 'pg_cron', is_automatic = true

  ## Rationale
  The frontend scheduler proof UI queries:
    .or('source.eq.pg_cron,triggered_by.eq.pg_cron,is_automatic.eq.true')
  Without these columns the query returns nothing, causing a false "Missing" state
  even when real pg_cron runs exist.

  ## Security
  RLS is already enabled on scanner_runs from prior migrations. No policy changes needed.
  The new columns inherit existing RLS policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'source'
  ) THEN
    ALTER TABLE scanner_runs ADD COLUMN source TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'triggered_by'
  ) THEN
    ALTER TABLE scanner_runs ADD COLUMN triggered_by TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scanner_runs' AND column_name = 'is_automatic'
  ) THEN
    ALTER TABLE scanner_runs ADD COLUMN is_automatic BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Backfill existing scheduled runs as automatic pg_cron runs
UPDATE scanner_runs
SET
  source = 'pg_cron',
  triggered_by = 'pg_cron',
  is_automatic = true
WHERE
  lower(run_type) = 'scheduled'
  AND (source IS NULL OR triggered_by IS NULL OR is_automatic IS NULL OR is_automatic = false);

-- Add index for scheduler proof query performance
CREATE INDEX IF NOT EXISTS idx_scanner_runs_is_automatic
  ON scanner_runs (is_automatic, run_type, started_at DESC)
  WHERE is_automatic = true;
