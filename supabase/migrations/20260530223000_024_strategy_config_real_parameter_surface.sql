/*
  C3B: Normalize strategy_config params to the real scanner/backtest surface.

  Safe-only changes:
  - No drops, renames, provider changes, or execution changes.
  - Only merges missing params into existing strategy_configs rows.
  - Existing admin-tuned values win over these defaults because defaults are on
    the left side of the jsonb concat operator.
*/

UPDATE public.strategy_configs
SET
  params = '{
    "ema_fast": 20,
    "ema_slow": 50,
    "rsi_len": 14,
    "atr_len": 14,
    "rsi_buy_min": 52,
    "rsi_sell_max": 48,
    "min_atr_pct": 0.10,
    "max_atr_pct": 3.0,
    "momentum_lookback": 3,
    "min_body_atr": 0.30,
    "stop_atr_mult": 1.4,
    "tp1_r": 1.2,
    "tp2_r": 1.8
  }'::jsonb || COALESCE(params, '{}'::jsonb),
  signal_style = COALESCE(signal_style, 'scalper'),
  risk_mode = COALESCE(risk_mode, 'balanced'),
  updated_at = now()
WHERE strategy_name = 'MicroScalper';

UPDATE public.strategy_configs
SET
  params = '{
    "rsi_len": 14,
    "atr_len": 14,
    "momentum_lookback": 3,
    "box_lookback": 50,
    "min_box_bars": 14,
    "max_box_atr_range": 1.8,
    "atr_expansion_lookback": 48,
    "min_atr_expansion": 1.1,
    "breakout_buffer_atr": 0.12,
    "stop_atr_mult": 1.4,
    "tp1_r": 1.3,
    "tp2_r": 2.5
  }'::jsonb || COALESCE(params, '{}'::jsonb),
  signal_style = COALESCE(signal_style, 'scalper'),
  risk_mode = COALESCE(risk_mode, 'balanced'),
  updated_at = now()
WHERE strategy_name = 'CompressionBreakout';

UPDATE public.strategy_configs
SET
  params = '{
    "ema_fast": 20,
    "ema_slow": 50,
    "rsi_len": 14,
    "atr_len": 14,
    "rsi_buy_min": 50,
    "rsi_sell_max": 50,
    "min_atr_pct": 0.15,
    "max_atr_pct": 4.0,
    "momentum_lookback": 3,
    "pullback_bars": 5,
    "stop_atr_mult": 1.6,
    "tp1_r": 1.5,
    "tp2_r": 2.5
  }'::jsonb || COALESCE(params, '{}'::jsonb),
  signal_style = COALESCE(signal_style, 'swing'),
  risk_mode = COALESCE(risk_mode, 'balanced'),
  updated_at = now()
WHERE strategy_name = 'SwingContinuation';

UPDATE public.strategy_configs
SET
  params = '{
    "rsi_buy_min": 54,
    "rsi_sell_max": 46,
    "min_atr_pct": 0.025,
    "max_atr_pct": 1.2,
    "momentum_lookback": 3,
    "min_body_atr": 0.35,
    "stop_atr_mult": 1.8,
    "tp1_r": 1.2,
    "tp2_r": 2.1
  }'::jsonb || COALESCE(params, '{}'::jsonb),
  signal_style = COALESCE(signal_style, 'forex_signal'),
  risk_mode = COALESCE(risk_mode, 'conservative'),
  updated_at = now()
WHERE strategy_name = 'ForexMicroScalper';

UPDATE public.strategy_configs
SET
  params = '{
    "rsi_buy_min": 52,
    "rsi_sell_max": 48,
    "min_atr_pct": 0.03,
    "max_atr_pct": 1.5,
    "pullback_bars": 8,
    "stop_atr_mult": 2.0,
    "tp1_r": 1.3,
    "tp2_r": 2.4
  }'::jsonb || COALESCE(params, '{}'::jsonb),
  signal_style = COALESCE(signal_style, 'forex_signal'),
  risk_mode = COALESCE(risk_mode, 'conservative'),
  updated_at = now()
WHERE strategy_name = 'ForexSwingContinuation';
