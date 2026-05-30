/*
  C2C forex provider rate-limit safety.
  Crypto keeps the existing scanner cadence; forex gets proof columns for
  throttle/budget decisions so TwelveData credits are not spent every cron tick.
*/

ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_skipped_rate_limit boolean NOT NULL DEFAULT false;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_budget_limited boolean NOT NULL DEFAULT false;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_provider_calls_attempted integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_provider_calls_planned integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_provider_call_limit integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS last_forex_scan_at timestamptz;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_next_allowed_scan_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scanner_runs_last_forex_scan
  ON public.scanner_runs (started_at DESC)
  WHERE forex_symbols_scanned > 0;
