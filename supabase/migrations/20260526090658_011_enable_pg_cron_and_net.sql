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
