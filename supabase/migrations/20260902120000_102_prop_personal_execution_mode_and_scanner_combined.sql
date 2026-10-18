-- Migration: 20260902120000_102_prop_personal_execution_mode_and_scanner_combined.sql
-- Description: Updates hashibot_scheduler_jobs to run combined market scanner (Crypto + Forex/Gold for MT5)
--              and sets proper default execution_mode on mt5_accounts for Prop Firm Guardian vs Personal Growth.

ALTER TABLE public.scanner_config ADD COLUMN IF NOT EXISTS signal_enable_forex boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  -- 1. Update hashibot_scheduler_jobs payload for scanner to combined mode
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hashibot_scheduler_jobs') THEN
    UPDATE public.hashibot_scheduler_jobs
    SET payload_template = '{"run_type":"scheduled","market_mode":"combined"}'::jsonb,
        updated_at = clock_timestamp()
    WHERE job_name = 'hashibot_prod_scanner_5m';
  END IF;

  -- 2. Ensure scanner_config has forex enabled for unified scanning
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scanner_config') THEN
    UPDATE public.scanner_config
    SET scan_forex_enabled = true,
        signal_enable_forex = true
    WHERE id = 1;
  END IF;

  -- 3. Populate default execution_mode for existing mt5_accounts if null
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mt5_accounts' AND column_name = 'execution_mode') THEN
    UPDATE public.mt5_accounts
    SET execution_mode = CASE
      WHEN account_type = 'prop' THEN 'prop_challenge'
      WHEN account_type = 'demo' THEN 'demo'
      ELSE 'personal'
    END
    WHERE execution_mode IS NULL;
  END IF;
END $$;
