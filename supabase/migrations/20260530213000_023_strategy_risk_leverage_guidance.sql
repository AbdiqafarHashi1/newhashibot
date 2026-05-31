/*
  C3 Strategy-aware risk/leverage guidance for signal-only recommendations.
  Safe additive migration: no drops/renames, no execution enablement.
*/

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS capital_mode TEXT DEFAULT 'signal_mode',
  ADD COLUMN IF NOT EXISTS risk_profile TEXT DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS strategy_risk_class TEXT,
  ADD COLUMN IF NOT EXISTS recommended_risk_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS suggested_leverage_min NUMERIC,
  ADD COLUMN IF NOT EXISTS suggested_leverage_max NUMERIC,
  ADD COLUMN IF NOT EXISTS leverage_cap NUMERIC,
  ADD COLUMN IF NOT EXISTS position_sizing_note TEXT,
  ADD COLUMN IF NOT EXISTS strategy_specific_warning TEXT,
  ADD COLUMN IF NOT EXISTS risk_warning TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_source TEXT DEFAULT 'strategy_risk_engine_v1';

COMMENT ON COLUMN public.signals.recommended_risk_pct IS 'Signal-only strategy-aware suggested account risk percent; guidance only, not execution.';
COMMENT ON COLUMN public.signals.suggested_leverage_min IS 'Lower bound of signal-only suggested leverage range; guidance only.';
COMMENT ON COLUMN public.signals.suggested_leverage_max IS 'Upper bound of signal-only suggested leverage range; guidance only and capped.';
COMMENT ON COLUMN public.signals.leverage_cap IS 'Hard leverage cap used by the recommendation engine; guidance only.';
COMMENT ON COLUMN public.signals.recommendation_source IS 'Versioned source for strategy-aware risk/leverage recommendations.';
