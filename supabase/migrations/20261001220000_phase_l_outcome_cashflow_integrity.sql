-- Forward-only correction: persist auditable realized cash flows and explicit exclusions.
ALTER TABLE public.validation_outcomes DROP CONSTRAINT IF EXISTS validation_outcomes_status_check;
ALTER TABLE public.validation_outcomes ADD CONSTRAINT validation_outcomes_status_check
  CHECK(status IN ('TARGET','STOP','OPEN','AMBIGUOUS','EXCLUDED'));
ALTER TABLE public.validation_outcomes
  ADD COLUMN IF NOT EXISTS exclusion_reason text,
  ADD COLUMN IF NOT EXISTS cash_flow_events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.validation_cycles
  ADD COLUMN IF NOT EXISTS evidence_classification text NOT NULL DEFAULT 'HISTORICAL_REPLAY',
  ADD COLUMN IF NOT EXISTS publication boolean NOT NULL DEFAULT false CHECK(publication = false),
  ADD COLUMN IF NOT EXISTS telegram boolean NOT NULL DEFAULT false CHECK(telegram = false),
  ADD COLUMN IF NOT EXISTS execution boolean NOT NULL DEFAULT false CHECK(execution = false);
