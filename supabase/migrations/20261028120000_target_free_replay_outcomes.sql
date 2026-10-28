-- Forward-only: preserve all existing outcomes; add explicit observed regime exits.
-- TIMEOUT already exists in the shared replay engine; persist it without weakening
-- completed-outcome cash-flow guards or the research-only release boundary.
ALTER TABLE public.validation_outcomes DROP CONSTRAINT IF EXISTS validation_outcomes_status_check;
ALTER TABLE public.validation_outcomes ADD CONSTRAINT validation_outcomes_status_check
 CHECK(status IN ('TARGET','STOP','OPEN','AMBIGUOUS','EXCLUDED','TIMEOUT','REGIME_EXIT'));
ALTER TABLE public.validation_outcomes ADD CONSTRAINT validation_regime_exit_scope_check
 CHECK(status <> 'REGIME_EXIT' OR
  (strategy_id = 'crypto.daily-ema-trend' AND timeframe = '1d'
   AND exit_time IS NOT NULL AND exit_price IS NOT NULL AND net_r IS NOT NULL));
