-- Phase 7 extends canonical symbol/provider/reporting truth; it creates no parallel runtime tables.
ALTER TABLE public.symbols ADD COLUMN IF NOT EXISTS instrument_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.symbols SET provider = 'twelvedata', is_active = true,
  instrument_metadata = jsonb_build_object('registry_version','phase7-v1','production_enabled',true)
WHERE market_type = 'forex' AND symbol IN ('EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURJPY','GBPJPY','XAUUSD');
CREATE INDEX IF NOT EXISTS idx_signals_forex_reporting ON public.signals (strategy_name, symbol, created_at DESC) WHERE market_type = 'forex';
CREATE INDEX IF NOT EXISTS idx_provider_status_market_updated ON public.provider_status (market_type, updated_at DESC);
COMMENT ON COLUMN public.symbols.instrument_metadata IS 'Asset registry metadata; canonical symbols remains the instrument truth table.';
