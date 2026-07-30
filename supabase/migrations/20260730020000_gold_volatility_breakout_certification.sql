-- Repository-only migration: applying it is an explicit operator action. It adds
-- the certified Gold contract without touching schedules, modes, or execution.
INSERT INTO public.strategy_configs (
  strategy_name, enabled, signal_style, risk_mode, min_score, min_rr,
  min_stop_distance_pct, min_tp1_distance_pct, min_tp2_distance_pct,
  max_bars_in_trade, allowed_symbols, allowed_timeframes, params
)
VALUES (
  'GoldVolatilityBreakout', true, 'forex_signal', 'conservative', 74, 2.05,
  0.04, 0.05, 0.08, 16, '["XAUUSD"]'::jsonb, '["15m"]'::jsonb,
  '{"canonical_strategy_id":"gold.volatility-breakout","strategy_version":"1.0.0","instrument_class":"metal_gold","provider":"mt5","certification_provenance":"FOREX_AND_GOLD_STRATEGY_AUTHENTICITY_20260730"}'::jsonb
)
ON CONFLICT (strategy_name) DO UPDATE SET
  allowed_symbols = EXCLUDED.allowed_symbols,
  allowed_timeframes = EXCLUDED.allowed_timeframes,
  params = COALESCE(public.strategy_configs.params, '{}'::jsonb) || EXCLUDED.params;

-- Retire only the known research identity; operator-controlled production values
-- (enabled, risk mode and score) on the canonical row remain untouched.
UPDATE public.strategy_configs
SET enabled = false
WHERE strategy_name = 'gold.volatility-breakout'
  AND strategy_name <> 'GoldVolatilityBreakout';
