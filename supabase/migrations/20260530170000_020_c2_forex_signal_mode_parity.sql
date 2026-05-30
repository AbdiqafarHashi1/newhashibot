/*
  # C2 Forex Signal Mode Parity — signal-only

  Enables a small, real-data-only forex signal-mode path alongside the frozen
  crypto pipeline. Forex is still separately gated by environment and scanner
  config, uses Finnhub only for C2, and never enables broker/MT5 execution.
*/

-- Limit the production C2 forex universe to the initial supported set.
UPDATE public.symbols
SET provider = 'finnhub', is_active = true
WHERE symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
  AND market_type = 'forex';

UPDATE public.symbols
SET is_active = false,
    provider = CASE WHEN symbol = 'XAUUSD' THEN 'unsupported_finnhub_c2' ELSE provider END,
    notes = COALESCE(NULLIF(notes, ''), 'Disabled for C2 initial forex signal mode; unsupported or out of initial scope.')
WHERE market_type = 'forex'
  AND symbol NOT IN ('EURUSD', 'GBPUSD', 'USDJPY');

-- Keep forex off by default at DB level; deployment must opt in intentionally.
UPDATE public.scanner_config
SET scan_crypto_enabled = true,
    scan_forex_enabled = false,
    active_timeframes = '["5m","15m","1h","4h"]'::jsonb,
    updated_at = now()
WHERE id = 1;

-- Replace historical demo forex provider heartbeat with the C2 real provider row.
UPDATE public.provider_status
SET provider_name = 'finnhub',
    status = 'disabled',
    error_message = 'Forex disabled; set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to enable C2 Finnhub signal mode',
    data_source_label = 'DISABLED',
    updated_at = now()
WHERE provider_name = 'demo'
  AND market_type = 'forex'
  AND NOT EXISTS (SELECT 1 FROM public.provider_status WHERE provider_name = 'finnhub');

INSERT INTO public.provider_status (provider_name, market_type, status, error_message, data_source_label, updated_at)
VALUES ('finnhub', 'forex', 'disabled', 'Forex disabled; set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to enable C2 Finnhub signal mode', 'DISABLED', now())
ON CONFLICT (provider_name) DO UPDATE SET
  market_type = EXCLUDED.market_type,
  status = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.status ELSE EXCLUDED.status END,
  error_message = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.error_message ELSE EXCLUDED.error_message END,
  data_source_label = CASE WHEN public.provider_status.status = 'active' THEN public.provider_status.data_source_label ELSE EXCLUDED.data_source_label END,
  updated_at = now();

-- Forex-specific conservative strategy configs. The scanner maps these to the
-- existing evaluator primitives but keeps thresholds/distances separate from crypto.
INSERT INTO public.strategy_configs (
  strategy_name, enabled, market_type,
  allowed_symbols, allowed_timeframes,
  min_score, min_rr, max_active_signals,
  one_active_signal_per_symbol,
  signal_style, risk_mode,
  min_stop_distance_pct, min_tp1_distance_pct, min_tp2_distance_pct,
  max_bars_in_trade,
  params, updated_at
)
VALUES
  (
    'ForexMicroScalper', true, 'forex',
    '["EURUSD","GBPUSD","USDJPY"]'::jsonb, '["15m"]'::jsonb,
    80, 1.4, 3, true,
    'forex_signal', 'conservative',
    0.06, 0.08, 0.12,
    32,
    '{
      "rsi_buy_min": 54,
      "rsi_sell_max": 46,
      "min_atr_pct": 0.025,
      "max_atr_pct": 1.2,
      "min_body_atr": 0.35,
      "stop_atr_mult": 1.8,
      "tp1_r": 1.2,
      "tp2_r": 2.1
    }'::jsonb,
    now()
  ),
  (
    'ForexSwingContinuation', true, 'forex',
    '["EURUSD","GBPUSD","USDJPY"]'::jsonb, '["1h"]'::jsonb,
    78, 1.5, 3, true,
    'forex_signal', 'conservative',
    0.10, 0.12, 0.20,
    72,
    '{
      "pullback_bars": 8,
      "rsi_buy_min": 52,
      "rsi_sell_max": 48,
      "min_atr_pct": 0.03,
      "max_atr_pct": 1.5,
      "stop_atr_mult": 2.0,
      "tp1_r": 1.3,
      "tp2_r": 2.4
    }'::jsonb,
    now()
  )
ON CONFLICT (strategy_name) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  market_type = EXCLUDED.market_type,
  allowed_symbols = EXCLUDED.allowed_symbols,
  allowed_timeframes = EXCLUDED.allowed_timeframes,
  min_score = EXCLUDED.min_score,
  min_rr = EXCLUDED.min_rr,
  max_active_signals = EXCLUDED.max_active_signals,
  one_active_signal_per_symbol = EXCLUDED.one_active_signal_per_symbol,
  signal_style = EXCLUDED.signal_style,
  risk_mode = EXCLUDED.risk_mode,
  min_stop_distance_pct = EXCLUDED.min_stop_distance_pct,
  min_tp1_distance_pct = EXCLUDED.min_tp1_distance_pct,
  min_tp2_distance_pct = EXCLUDED.min_tp2_distance_pct,
  max_bars_in_trade = EXCLUDED.max_bars_in_trade,
  params = EXCLUDED.params,
  updated_at = now();

-- Market-aware analytics views for /admin/performance filtering.
CREATE OR REPLACE VIEW signal_performance_summary_by_market_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND outcome_category != 'CANCELLED'
),
closed AS (
  SELECT * FROM base WHERE outcome_category != 'OPEN'
)
SELECT
  market_type,
  COUNT(*) AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN') AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN') AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN') AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS') AS losses,
  COUNT(*) FILTER (WHERE current_status = 'tp1_hit') AS tp1_hits,
  COUNT(*) FILTER (WHERE current_status = 'tp2_hit') AS tp2_hits,
  COUNT(*) FILTER (WHERE current_status = 'sl_hit') AS sl_hits,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED') AS expired,
  CASE WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL END AS win_rate_pct,
  CASE WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'LOSS')::numeric / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL END AS loss_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS avg_r,
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0 THEN NULL
    ELSE ROUND(SUM(r_result) FILTER (WHERE r_result > 0) / ABS(SUM(r_result) FILTER (WHERE r_result < 0)), 2)
  END AS profit_factor,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result > 0), 0), 3) AS avg_win_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result < 0), 0), 3) AS avg_loss_r,
  ROUND(COALESCE(MAX(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS best_trade_r,
  ROUND(COALESCE(MIN(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS worst_trade_r,
  0::bigint AS max_consecutive_wins,
  0::bigint AS max_consecutive_losses,
  ROUND(COALESCE(SUM(pnl_estimate) FILTER (WHERE pnl_estimate IS NOT NULL), 0), 3) AS estimated_pnl_r,
  now() AS calculated_at
FROM base
GROUP BY market_type;

CREATE OR REPLACE VIEW strategy_performance_by_market_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND outcome_category != 'CANCELLED'
)
SELECT
  market_type,
  strategy_name,
  COUNT(*) AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN') AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN') AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN') AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS') AS losses,
  COUNT(*) FILTER (WHERE current_status = 'tp1_hit') AS tp1_hits,
  COUNT(*) FILTER (WHERE current_status = 'tp2_hit') AS tp2_hits,
  COUNT(*) FILTER (WHERE current_status = 'sl_hit') AS sl_hits,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED') AS expired,
  CASE WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL END AS win_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS avg_r,
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0 THEN NULL
    ELSE ROUND(SUM(r_result) FILTER (WHERE r_result > 0) / ABS(SUM(r_result) FILTER (WHERE r_result < 0)), 2)
  END AS profit_factor,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result > 0), 0), 3) AS avg_win_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result < 0), 0), 3) AS avg_loss_r,
  ROUND(COALESCE(MAX(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS best_trade_r,
  ROUND(COALESCE(MIN(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3) AS worst_trade_r,
  ROUND(COALESCE(SUM(pnl_estimate) FILTER (WHERE pnl_estimate IS NOT NULL), 0), 3) AS estimated_pnl_r,
  MAX(created_at) AS last_signal_time,
  now() AS calculated_at
FROM base
GROUP BY market_type, strategy_name
ORDER BY market_type, total_signals DESC;
