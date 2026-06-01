/*
  # Scanner strategy evaluation summary

  Adds an internal JSON summary for each scanner run so admins can verify that
  every eligible strategy evaluated, rejected, accepted, skipped, or hit a
  runtime error without changing strategy configuration or thresholds.
*/

ALTER TABLE public.scanner_runs
  ADD COLUMN IF NOT EXISTS strategy_evaluation_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
