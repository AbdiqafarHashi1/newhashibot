-- Register the three certified FX evaluators on the existing strategy-config surface.
-- This migration does not alter scanner scheduling, cron state, provider routing, or XAUUSD.
INSERT INTO public.strategy_configs (
  strategy_name, enabled, signal_style, risk_mode, min_score, min_rr,
  min_stop_distance_pct, min_tp1_distance_pct, min_tp2_distance_pct,
  max_bars_in_trade, allowed_symbols, allowed_timeframes, params
)
VALUES
  ('ForexLondonBreakout', true, 'forex_signal', 'conservative', 78, 1.45, 0.08, 0.10, 0.16, 32, '["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD"]'::jsonb, '["15m"]'::jsonb, '{}'::jsonb),
  ('ForexNewYorkContinuation', true, 'forex_signal', 'conservative', 78, 1.45, 0.08, 0.10, 0.16, 48, '["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD"]'::jsonb, '["15m","1h"]'::jsonb, '{}'::jsonb),
  ('ForexTrendPullback', true, 'forex_signal', 'conservative', 78, 1.45, 0.08, 0.10, 0.16, 48, '["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD"]'::jsonb, '["15m","1h"]'::jsonb, '{}'::jsonb)
ON CONFLICT (strategy_name) DO UPDATE SET
  allowed_symbols = EXCLUDED.allowed_symbols,
  allowed_timeframes = EXCLUDED.allowed_timeframes;
