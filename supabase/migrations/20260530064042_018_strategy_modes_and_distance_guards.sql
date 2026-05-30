/*
  # Strategy Modes, Risk Profiles, and Distance Guards — Phase 2

  ## Summary
  Extends strategy_configs with signal_style, risk_mode, and minimum-distance
  percentage fields so MicroScalper, CompressionBreakout, and the new
  SwingContinuation can enforce per-timeframe TP/SL minimums. Also seeds
  SwingContinuation strategy config and updates the existing strategies with
  corrected parameters to stop producing tight noise trades.

  ## Changes

  ### Modified Tables
  - `strategy_configs`: Add columns:
    - `signal_style TEXT DEFAULT 'scalper'` — 'scalper' or 'swing'
    - `risk_mode TEXT DEFAULT 'balanced'` — 'conservative', 'balanced', 'aggressive'
    - `min_stop_distance_pct NUMERIC DEFAULT 0.18` — minimum stop distance as % of price
    - `min_tp1_distance_pct NUMERIC DEFAULT 0.25` — minimum TP1 distance as % of price
    - `min_tp2_distance_pct NUMERIC DEFAULT 0.40` — minimum TP2 distance as % of price
    - `max_bars_in_trade INT DEFAULT 32` — max bars to hold before expiry

  ### New Strategy Row
  - `SwingContinuation` — 15m/1h trend-following with wider SL/TP

  ### Updated Strategy Rows
  - `MicroScalper` — updated params with higher stop_atr_mult (1.4), correct tp1_r/tp2_r,
    min distance guards; remove noise-producing tp1_r=0.9 default
  - `CompressionBreakout` — tighter box criteria, stronger fakeout protection

  ## Security
  - No new tables, no new RLS changes required
  - Existing RLS on strategy_configs covers all new columns
*/

-- ─── Add new columns to strategy_configs ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'signal_style'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN signal_style TEXT NOT NULL DEFAULT 'scalper';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'risk_mode'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN risk_mode TEXT NOT NULL DEFAULT 'balanced';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'min_stop_distance_pct'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN min_stop_distance_pct NUMERIC NOT NULL DEFAULT 0.18;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'min_tp1_distance_pct'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN min_tp1_distance_pct NUMERIC NOT NULL DEFAULT 0.25;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'min_tp2_distance_pct'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN min_tp2_distance_pct NUMERIC NOT NULL DEFAULT 0.40;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_configs' AND column_name = 'max_bars_in_trade'
  ) THEN
    ALTER TABLE public.strategy_configs ADD COLUMN max_bars_in_trade INT NOT NULL DEFAULT 32;
  END IF;
END $$;

-- ─── Update MicroScalper with correct production params ───────────────────────
-- Raises stop_atr_mult from 1.2 → 1.4 so SL is wider than noise.
-- Raises tp1_r from 0.9 → 1.2 (was less than 1R — nonsensical).
-- Raises tp2_r from 1.5 → 1.8.
-- Adds min_body_atr check raise to 0.30.
-- Adds per-timeframe mode columns.

UPDATE public.strategy_configs
SET
  signal_style         = 'scalper',
  risk_mode            = 'balanced',
  min_stop_distance_pct = 0.18,
  min_tp1_distance_pct  = 0.25,
  min_tp2_distance_pct  = 0.40,
  max_bars_in_trade    = 24,
  min_rr               = 1.2,
  min_score            = 72,
  allowed_timeframes   = '["5m","15m"]'::jsonb,
  params               = '{
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
    "tp2_r": 1.8,
    "min_confidence_conservative": 78,
    "min_confidence_balanced": 72,
    "min_confidence_aggressive": 68
  }'::jsonb,
  updated_at = now()
WHERE strategy_name = 'MicroScalper';

-- ─── Update CompressionBreakout ───────────────────────────────────────────────

UPDATE public.strategy_configs
SET
  signal_style         = 'scalper',
  risk_mode            = 'balanced',
  min_stop_distance_pct = 0.25,
  min_tp1_distance_pct  = 0.35,
  min_tp2_distance_pct  = 0.60,
  max_bars_in_trade    = 48,
  min_rr               = 1.3,
  min_score            = 75,
  allowed_timeframes   = '["15m","1h"]'::jsonb,
  params               = '{
    "box_lookback": 50,
    "min_box_bars": 14,
    "max_box_atr_range": 1.8,
    "atr_len": 14,
    "atr_expansion_lookback": 48,
    "min_atr_expansion": 1.1,
    "breakout_buffer_atr": 0.12,
    "stop_atr_mult": 1.4,
    "tp1_r": 1.3,
    "tp2_r": 2.5,
    "fakeout_max_reentry_bars": 3
  }'::jsonb,
  updated_at = now()
WHERE strategy_name = 'CompressionBreakout';

-- ─── Insert SwingContinuation ─────────────────────────────────────────────────

INSERT INTO public.strategy_configs (
  strategy_name, enabled, market_type,
  allowed_symbols, allowed_timeframes,
  min_score, min_rr, max_active_signals,
  one_active_signal_per_symbol,
  signal_style, risk_mode,
  min_stop_distance_pct, min_tp1_distance_pct, min_tp2_distance_pct,
  max_bars_in_trade,
  params
) VALUES (
  'SwingContinuation',
  true,
  'crypto',
  '[]'::jsonb,
  '["15m","1h"]'::jsonb,
  76,
  1.5,
  8,
  true,
  'swing',
  'balanced',
  0.45,
  0.70,
  1.20,
  96,
  '{
    "ema_fast": 20,
    "ema_slow": 50,
    "rsi_len": 14,
    "atr_len": 14,
    "rsi_buy_min": 50,
    "rsi_sell_max": 50,
    "min_atr_pct": 0.15,
    "max_atr_pct": 4.0,
    "pullback_bars": 5,
    "stop_atr_mult": 1.6,
    "tp1_r": 1.5,
    "tp2_r": 2.5,
    "min_confidence_conservative": 80,
    "min_confidence_balanced": 76,
    "min_confidence_aggressive": 72
  }'::jsonb
)
ON CONFLICT (strategy_name) DO UPDATE SET
  enabled              = EXCLUDED.enabled,
  signal_style         = EXCLUDED.signal_style,
  risk_mode            = EXCLUDED.risk_mode,
  min_stop_distance_pct = EXCLUDED.min_stop_distance_pct,
  min_tp1_distance_pct  = EXCLUDED.min_tp1_distance_pct,
  min_tp2_distance_pct  = EXCLUDED.min_tp2_distance_pct,
  max_bars_in_trade    = EXCLUDED.max_bars_in_trade,
  min_rr               = EXCLUDED.min_rr,
  min_score            = EXCLUDED.min_score,
  allowed_timeframes   = EXCLUDED.allowed_timeframes,
  params               = EXCLUDED.params,
  updated_at           = now();
