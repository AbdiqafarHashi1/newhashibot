-- Phase L validation truth is isolated from customer signals and execution.
CREATE TABLE IF NOT EXISTS public.validation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN ('REPLAY','SHADOW')), status text NOT NULL CHECK(status IN ('NOT_RUN','AWAITING_DATA','RUNNING','COMPLETED','FAILED','CANCELLED')), configuration_hash text NOT NULL, dataset_id text, dataset_hash text, provenance jsonb NOT NULL DEFAULT '{}'::jsonb, max_cycles integer NOT NULL CHECK(max_cycles BETWEEN 1 AND 10000), max_requests integer NOT NULL CHECK(max_requests BETWEEN 1 AND 10000), started_at timestamptz, finished_at timestamptz, failure_code text, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.validation_cycles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.validation_runs(id) ON DELETE RESTRICT, cycle_key text NOT NULL, candle_close_time timestamptz NOT NULL, strategy_results jsonb NOT NULL, arbitration jsonb NOT NULL, data_exclusions jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,cycle_key)
);
CREATE TABLE IF NOT EXISTS public.validation_evidence_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('DEVELOPMENT','VALIDATION','HOLDOUT')), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, dataset_hash text NOT NULL, configuration_hash text NOT NULL, metrics jsonb, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(starts_at<ends_at), EXCLUDE USING gist (tstzrange(starts_at,ends_at,'[)') WITH &&)
);
ALTER TABLE public.validation_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.validation_cycles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.validation_evidence_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read validation runs" ON public.validation_runs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read validation cycles" ON public.validation_cycles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admins read evidence periods" ON public.validation_evidence_periods FOR SELECT TO authenticated USING (public.is_admin());
CREATE OR REPLACE FUNCTION public.reject_validation_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_VALIDATION_EVIDENCE'; END $$;
CREATE TRIGGER validation_cycles_immutable BEFORE UPDATE OR DELETE ON public.validation_cycles FOR EACH ROW EXECUTE FUNCTION public.reject_validation_immutable_update();
CREATE TRIGGER validation_evidence_immutable BEFORE UPDATE OR DELETE ON public.validation_evidence_periods FOR EACH ROW EXECUTE FUNCTION public.reject_validation_immutable_update();
