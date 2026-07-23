-- X-F QuickScalp strategy configuration
-- Adds the high-selectivity short-duration scalp profile without enabling live trading.

INSERT INTO strategy_configs (
  strategy_name,
  enabled,
  market_type,
  signal_style,
  risk_mode,
  min_score,
  min_rr,
  min_stop_distance_pct,
  min_tp1_distance_pct,
  min_tp2_distance_pct,
  max_bars_in_trade,
  allowed_symbols,
  allowed_timeframes,
  params
)
VALUES (
  'QuickScalp',
  true,
  'crypto',
  'scalper',
  'balanced',
  82,
  1.15,
  0.18,
  0.25,
  0.40,
  12,
  '[]'::jsonb,
  '["5m","15m"]'::jsonb,
  '{
    "stop_atr_mult": 0.95,
    "tp1_r": 0.55,
    "tp2_r": 1.15,
    "min_atr_pct": 0.12,
    "max_atr_pct": 2.5,
    "min_volume_expansion": 1.15,
    "max_extension_atr": 1.15,
    "no_entry_timeout_bars": 3,
    "profit_lock_after_tp1": 1,
    "quick_scalp_engine": 1
  }'::jsonb
)
ON CONFLICT (strategy_name) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  market_type = EXCLUDED.market_type,
  signal_style = EXCLUDED.signal_style,
  risk_mode = EXCLUDED.risk_mode,
  min_score = EXCLUDED.min_score,
  min_rr = EXCLUDED.min_rr,
  min_stop_distance_pct = EXCLUDED.min_stop_distance_pct,
  min_tp1_distance_pct = EXCLUDED.min_tp1_distance_pct,
  min_tp2_distance_pct = EXCLUDED.min_tp2_distance_pct,
  max_bars_in_trade = EXCLUDED.max_bars_in_trade,
  allowed_timeframes = EXCLUDED.allowed_timeframes,
  params = strategy_configs.params || EXCLUDED.params,
  updated_at = now();
