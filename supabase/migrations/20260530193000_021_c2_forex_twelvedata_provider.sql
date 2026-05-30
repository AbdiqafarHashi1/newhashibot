/*
  C2 forex provider fix: use one real-data provider path (TwelveData) for
  forex signal mode. Forex remains disabled by default and signal-only.
*/

UPDATE public.symbols
SET provider = 'twelvedata', is_active = true
WHERE market_type = 'forex'
  AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY');

UPDATE public.symbols
SET is_active = false,
    provider = CASE WHEN provider IN ('demo', 'finnhub') THEN 'unsupported_twelvedata_c2' ELSE provider END,
    notes = COALESCE(NULLIF(notes, ''), 'Disabled for C2 initial forex signal mode; unsupported or out of initial scope.')
WHERE market_type = 'forex'
  AND symbol NOT IN ('EURUSD', 'GBPUSD', 'USDJPY');

ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS crypto_symbols_scanned integer NOT NULL DEFAULT 0;
ALTER TABLE public.scanner_runs ADD COLUMN IF NOT EXISTS forex_symbols_scanned integer NOT NULL DEFAULT 0;

INSERT INTO public.provider_status (provider_name, market_type, status, error_message, data_source_label, updated_at)
VALUES ('twelvedata', 'forex', 'disabled', 'Forex disabled; set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to enable C2 TwelveData signal mode', 'DISABLED', now())
ON CONFLICT (provider_name) DO UPDATE SET
  market_type = 'forex',
  status = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.status ELSE EXCLUDED.status END,
  error_message = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.error_message ELSE EXCLUDED.error_message END,
  data_source_label = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.data_source_label ELSE EXCLUDED.data_source_label END,
  updated_at = now();

UPDATE public.provider_status
SET status = 'historical',
    error_message = COALESCE(NULLIF(error_message, ''), 'Historical forex provider row; current C2 runtime proof uses TwelveData provider_status only.'),
    data_source_label = CASE WHEN data_source_label = 'REAL DATA' THEN 'HISTORICAL' ELSE data_source_label END,
    updated_at = now()
WHERE market_type = 'forex'
  AND provider_name <> 'twelvedata';
