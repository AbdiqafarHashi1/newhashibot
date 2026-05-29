/*
  Add explicit provenance columns so manual/admin button activity can never be
  mistaken for real pg_cron automation proof.
*/

ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS triggered_by text;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false;

ALTER TABLE public.signal_updates ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.signal_updates ADD COLUMN IF NOT EXISTS triggered_by text;
ALTER TABLE public.signal_updates ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false;

-- Backfill existing rows conservatively: only rows already carrying pg_cron or
-- scheduled-market-scanner evidence become automatic. All manual-looking rows
-- remain manual/test proof.
UPDATE public.scanner_runs
SET source = COALESCE(source, CASE
      WHEN lower(run_type) = 'scheduled' AND COALESCE(error_message, '') ILIKE '%source=pg_cron%' THEN 'pg_cron'
      WHEN lower(run_type) = 'manual' THEN 'admin_manual_scan'
      ELSE NULL
    END),
    triggered_by = COALESCE(triggered_by, CASE
      WHEN lower(run_type) = 'scheduled' AND COALESCE(error_message, '') ILIKE '%source=pg_cron%' THEN 'pg_cron'
      WHEN lower(run_type) = 'manual' THEN 'manual_button'
      ELSE NULL
    END),
    is_automatic = CASE
      WHEN is_automatic = true THEN true
      WHEN lower(run_type) = 'scheduled' AND COALESCE(error_message, '') ILIKE '%source=pg_cron%' THEN true
      ELSE false
    END;

UPDATE public.signal_updates
SET source = COALESCE(source, CASE
      WHEN COALESCE(message, '') ILIKE '%source: scheduled-market-scanner%' THEN 'scheduled_market_scanner'
      WHEN COALESCE(message, '') ILIKE '%source: manual_button%' THEN 'manual_outcome_button'
      ELSE NULL
    END),
    triggered_by = COALESCE(triggered_by, CASE
      WHEN COALESCE(message, '') ILIKE '%source: scheduled-market-scanner%' THEN 'pg_cron'
      WHEN COALESCE(message, '') ILIKE '%source: manual_button%' THEN 'manual_button'
      ELSE NULL
    END),
    is_automatic = CASE
      WHEN is_automatic = true THEN true
      WHEN COALESCE(message, '') ILIKE '%source: scheduled-market-scanner%' THEN true
      ELSE false
    END;
