/*
  # MicroScalper live scanner config/routing guard

  Re-applies the MicroScalper live scanner config with the correct jsonb
  allowed_timeframes assignment. This is intentionally config-only: no scanner
  strategy logic, Binance execution, brackets/risk, SwingContinuation, or
  CompressionBreakout changes.
*/

UPDATE public.strategy_configs
SET
  enabled = true,
  min_score = 72,
  min_rr = 1.2,
  max_bars_in_trade = 24,
  allowed_timeframes = '["5m","15m"]'::jsonb,
  params = (
    params
    || jsonb_build_object(
      'ema_fast', 20,
      'ema_slow', 50,
      'rsi_len', 14,
      'atr_len', 14,
      'min_atr_pct', 0.10,
      'max_atr_pct', 3.0,
      'min_body_atr', 0.30,
      'momentum_lookback', 3,
      'rsi_buy_min', 52,
      'rsi_sell_max', 48,
      'stop_atr_mult', 1.4,
      'tp1_r', 1.2,
      'tp2_r', 1.8,
      'max_bars_in_trade', 24,
      'crypto_behavior_tuning', 1
    )
  )
  - 'rsi_buy_min_5m'
  - 'rsi_sell_max_5m'
  - 'stop_atr_mult_5m'
  - 'max_bars_in_trade_5m',
  updated_at = now()
WHERE strategy_name = 'MicroScalper';
