-- Fix unified market scanner config: enforce fixed 10 crypto symbols and disable dynamic binance universe
UPDATE public.scanner_config
SET 
  dynamic_binance_universe_enabled = false,
  max_symbols_per_scan = 10,
  include_symbols = ARRAY['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT']
WHERE id = 1;
