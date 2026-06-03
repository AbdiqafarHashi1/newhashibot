/*
  # CB/SC Strategy Parameter Improvement

  ## Summary
  Targeted improvement to CompressionBreakout and SwingContinuation scanner params to
  increase participation without changing evaluator gate logic or any scoring formulas.

  ## Problem
  CompressionBreakout: zero candidates since go-live. Primary cause: too-strict defaults.
  - `min_box_bars = 14`: requires 14 bars with high ≤ boxHigh × 1.0015 AND low ≥ boxLow × 0.9985
  - `max_box_atr_range = 1.8`: box range must be ≤ 1.8 ATR wide
  - Together these fail in most real crypto market conditions

  SwingContinuation: zero candidates. Primary cause: `pullback_bars = 5` gives only a 5-bar
  (75 min on 15m, 5h on 1h) window to detect a pullback touch — too narrow.

  ## Changes

  ### CompressionBreakout params
  - `min_box_bars`: 14 → 10 (fewer inside bars needed)
  - `max_box_atr_range`: 1.8 → 2.0 (slightly wider box allowed)
  - `min_atr_expansion`: 1.1 → 1.05 (less expansion required at breakout)
  - `breakout_buffer_atr`: 0.12 → 0.10 (smaller buffer needed past box edge)
  - `box_bar_tolerance`: added 0.002 (±0.20% instead of hardcoded ±0.15%)
    The live market-scanner now reads this param to set the "inside bar" tolerance

  ### SwingContinuation params
  - `pullback_bars`: 5 → 8 (wider window to detect pullback touch: 2h on 15m, 8h on 1h)

  ## What is NOT changed
  - No gate logic removed from either evaluator
  - RR guards, distance guards, score thresholds unchanged
  - MicroScalper params unchanged
  - No Telegram, outcome, customer, or forex changes
*/

UPDATE public.strategy_configs
SET
  params = jsonb_build_object(
    'tp1_r',                 1.3,
    'tp2_r',                 2.5,
    'atr_len',               14,
    'box_lookback',          50,
    'min_box_bars',          10,
    'max_box_atr_range',     2.0,
    'min_atr_expansion',     1.05,
    'breakout_buffer_atr',   0.10,
    'box_bar_tolerance',     0.002,
    'atr_expansion_lookback', 48,
    'stop_atr_mult',         1.4,
    'fakeout_max_reentry_bars', 3
  ),
  updated_at = now()
WHERE strategy_name = 'CompressionBreakout';

UPDATE public.strategy_configs
SET
  params = jsonb_build_object(
    'tp1_r',                    1.5,
    'tp2_r',                    2.5,
    'atr_len',                  14,
    'rsi_len',                  14,
    'ema_fast',                 20,
    'ema_slow',                 50,
    'max_atr_pct',              4.0,
    'min_atr_pct',              0.15,
    'rsi_buy_min',              50,
    'rsi_sell_max',             50,
    'pullback_bars',            8,
    'stop_atr_mult',            1.6,
    'min_confidence_balanced',  76,
    'min_confidence_aggressive', 72,
    'min_confidence_conservative', 80
  ),
  updated_at = now()
WHERE strategy_name = 'SwingContinuation';
