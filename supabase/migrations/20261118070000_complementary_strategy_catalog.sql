-- Register native complementary evaluators without granting publication or execution.
-- Existing configs and measured releases remain authoritative. Forward-only and idempotent.
insert into public.strategy_configs(strategy_name,enabled,market_type,allowed_symbols,allowed_timeframes,min_score,min_rr,max_bars_in_trade,params) values
('CryptoComplementaryEmaPullback',false,'crypto','["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","ADAUSDT","DOGEUSDT","LTCUSDT"]'::jsonb,'["15m","1h"]'::jsonb,75,1,96,'{}'::jsonb),
('CryptoComplementaryBandReclaim',false,'crypto','["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","ADAUSDT","DOGEUSDT","LTCUSDT"]'::jsonb,'["5m","15m","1h"]'::jsonb,75,1,48,'{}'::jsonb),
('CryptoComplementaryFvgSweep',false,'crypto','["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","ADAUSDT","DOGEUSDT","LTCUSDT"]'::jsonb,'["15m","1h"]'::jsonb,75,1,48,'{}'::jsonb),
('CryptoComplementaryDonchianBreakout',false,'crypto','["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","ADAUSDT","DOGEUSDT","LTCUSDT"]'::jsonb,'["1h","4h"]'::jsonb,75,1,168,'{}'::jsonb),
('CryptoComplementaryLevelDivergence',false,'crypto','["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","ADAUSDT","DOGEUSDT","LTCUSDT"]'::jsonb,'["15m","1h"]'::jsonb,75,1,48,'{}'::jsonb),
('ForexComplementaryEmaPullback',false,'forex','["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"]'::jsonb,'["15m","1h"]'::jsonb,75,1,96,'{}'::jsonb),
('ForexComplementaryBandReclaim',false,'forex','["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"]'::jsonb,'["5m","15m","1h"]'::jsonb,75,1,48,'{}'::jsonb),
('ForexComplementarySessionOrb',false,'forex','["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"]'::jsonb,'["5m","15m"]'::jsonb,75,1,48,'{}'::jsonb),
('ForexComplementaryFvgSweep',false,'forex','["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"]'::jsonb,'["15m","1h"]'::jsonb,75,1,48,'{}'::jsonb),
('ForexComplementaryLevelDivergence',false,'forex','["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"]'::jsonb,'["15m","1h"]'::jsonb,75,1,48,'{}'::jsonb)
on conflict(strategy_name) do nothing;
