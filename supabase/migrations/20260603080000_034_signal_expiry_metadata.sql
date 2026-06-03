/*
  # Signal expiry metadata support

  Adds an explicit expires_at column to live scanner signals so Edge Functions can
  store strategy/timeframe max-bars expiry at signal creation. Existing rows keep
  NULL and continue to use the legacy outcome-tracker fallback.
*/

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.signals.expires_at IS 'Strategy/timeframe expiry timestamp computed by market-scanner from max_bars_in_trade; NULL legacy rows use outcome fallback.';

CREATE INDEX IF NOT EXISTS idx_signals_expires_at
  ON public.signals(expires_at)
  WHERE expires_at IS NOT NULL;
