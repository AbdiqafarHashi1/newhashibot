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
