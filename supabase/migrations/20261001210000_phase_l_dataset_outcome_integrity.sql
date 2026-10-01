-- Forward-only Phase L completeness and outcome evidence correction.
ALTER TABLE public.validation_datasets DROP CONSTRAINT IF EXISTS validation_datasets_status_check;
ALTER TABLE public.validation_datasets ADD CONSTRAINT validation_datasets_status_check CHECK(status IN ('DOWNLOADING','PARTIAL','READY','FAILED','CANCELLED'));
ALTER TABLE public.validation_datasets ADD COLUMN IF NOT EXISTS row_count integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS first_open_time timestamptz, ADD COLUMN IF NOT EXISTS last_open_time timestamptz;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS outcome_assumptions jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS outcome_metrics jsonb;
CREATE TABLE IF NOT EXISTS public.validation_outcomes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.validation_runs(id) ON DELETE RESTRICT, cycle_key text NOT NULL, candidate_id text NOT NULL, strategy_id text NOT NULL, symbol text NOT NULL, timeframe text NOT NULL, status text NOT NULL CHECK(status IN ('TARGET','STOP','OPEN','AMBIGUOUS')), entry_time timestamptz NOT NULL, exit_time timestamptz, entry_price numeric NOT NULL, exit_price numeric, gross_r numeric, net_r numeric, cost_r numeric NOT NULL, partial_exit boolean NOT NULL, conservative boolean NOT NULL, assumptions jsonb NOT NULL, configuration_hash text NOT NULL, dataset_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,cycle_key));
ALTER TABLE public.validation_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read validation outcomes" ON public.validation_outcomes FOR SELECT TO authenticated USING(public.is_admin());
CREATE TRIGGER validation_outcomes_immutable BEFORE UPDATE OR DELETE ON public.validation_outcomes FOR EACH ROW EXECUTE FUNCTION public.reject_validation_immutable_update();
ALTER TABLE public.mt5_scanner_feeds ADD COLUMN IF NOT EXISTS history_account_id uuid REFERENCES public.mt5_accounts(id);
ALTER TABLE public.validation_runs DROP CONSTRAINT IF EXISTS validation_runs_status_check;
ALTER TABLE public.validation_runs ADD CONSTRAINT validation_runs_status_check CHECK(status IN ('NOT_RUN','AWAITING_DATA','AWAITING_FEED','RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS shadow_checkpoint jsonb NOT NULL DEFAULT '{"lastClosedAt":null,"cycles":[]}'::jsonb;
