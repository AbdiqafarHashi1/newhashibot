/*
  # End-to-end strategy/scanner parity repair

  - Ports the 5m CSV-selected CompressionBreakout and SwingContinuation params
    into the live strategy config rows.
  - Leaves MicroScalper enabled and unchanged.
  - Leaves all forex strategy rows enabled/configured but scanner-eligible only through
    the existing forex blocked-signal/provider policy; no provider/Telegram/customer logic changes.
*/

UPDATE public.strategy_configs
SET
  enabled = true,
  min_score = 72,
  min_rr = 1.3,
  max_bars_in_trade = 48,
  allowed_timeframes = ARRAY['15m','1h'],
  params = jsonb_build_object(
    'tp1_r',                  1.2,
    'tp2_r',                  2.2,
    'atr_len',                14,
    'rsi_len',                14,
    'ema_fast',               20,
    'ema_slow',               50,
    'box_lookback',           36,
    'min_box_bars',           8,
    'max_box_atr_range',      8.0,
    'min_atr_expansion',      0.95,
    'breakout_buffer_atr',    0.05,
    'box_bar_tolerance',      0.002,
    'atr_expansion_lookback', 48,
    'stop_atr_mult',          1.1,
    'momentum_lookback',      3,
    'max_bars_in_trade',      48,
    'crypto_behavior_tuning', 1
  ),
  updated_at = now()
WHERE strategy_name = 'CompressionBreakout';

UPDATE public.strategy_configs
SET
  enabled = true,
  min_score = 78,
  min_rr = 1.5,
  max_bars_in_trade = 96,
  allowed_timeframes = ARRAY['15m','1h'],
  params = jsonb_build_object(
    'tp1_r',                    1.2,
    'tp2_r',                    2.2,
    'atr_len',                  14,
    'rsi_len',                  14,
    'ema_fast',                 20,
    'ema_slow',                 50,
    'max_atr_pct',              4.0,
    'min_atr_pct',              0.15,
    'rsi_buy_min',              50,
    'rsi_sell_max',             50,
    'pullback_bars',            8,
    'pullback_ema_pct',         0.012,
    'ema_trend_pct',            0.002,
    'stop_atr_mult',            1.2,
    'momentum_lookback',        3,
    'max_bars_in_trade',        96,
    'crypto_behavior_tuning',   1,
    'min_confidence_balanced',  78,
    'min_confidence_aggressive', 72,
    'min_confidence_conservative', 80
  ),
  updated_at = now()
WHERE strategy_name = 'SwingContinuation';
