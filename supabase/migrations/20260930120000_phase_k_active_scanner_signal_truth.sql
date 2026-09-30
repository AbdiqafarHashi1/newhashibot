-- Phase K completion: one transactional scanner decision/signal/publication authority.
-- Forward-only. This migration is intentionally not deployed by repository tests.
CREATE TABLE IF NOT EXISTS public.scanner_cycle_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cycle_key text NOT NULL, scanner_run_id uuid NULL,
  arbitration_scope text NOT NULL, decision text NOT NULL CHECK (decision IN ('SIGNAL','NO_TRADE','REJECTED')),
  reason_codes text[] NOT NULL DEFAULT '{}', arbitration jsonb NOT NULL DEFAULT '{}', signal_id uuid NULL,
  immutable_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_key, arbitration_scope)
);
ALTER TABLE public.scanner_cycle_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scanner_cycle_decisions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.scanner_cycle_decisions TO service_role;

ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS signal_identity text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS contract_version text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS cycle_key text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS strategy_id text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS strategy_version text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS configuration_version text;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS candle_close_time timestamptz;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS immutable_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_signal_identity_v2 ON public.signals(signal_identity) WHERE signal_identity IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.signal_publication_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), signal_id uuid NOT NULL REFERENCES public.signals(id),
  event_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','suppressed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signal_publication_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_publication_work FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.signal_publication_work TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_scanner_signal_truth_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signal_identity IS NOT NULL AND ROW(OLD.market_type,OLD.symbol,OLD.timeframe,OLD.direction,OLD.strategy_id,OLD.strategy_version,OLD.configuration_version,OLD.candle_close_time,OLD.entry_low,OLD.entry_high,OLD.stop_loss,OLD.tp1,OLD.tp2,OLD.grade,OLD.candidate_id,OLD.immutable_hash)
    IS DISTINCT FROM ROW(NEW.market_type,NEW.symbol,NEW.timeframe,NEW.direction,NEW.strategy_id,NEW.strategy_version,NEW.configuration_version,NEW.candle_close_time,NEW.entry_low,NEW.entry_high,NEW.stop_loss,NEW.tp1,NEW.tp2,NEW.grade,NEW.candidate_id,NEW.immutable_hash)
  THEN RAISE EXCEPTION 'IMMUTABLE_SCANNER_SIGNAL_TRUTH'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_immutable_scanner_signal_truth ON public.signals;
CREATE TRIGGER trg_immutable_scanner_signal_truth BEFORE UPDATE ON public.signals FOR EACH ROW EXECUTE FUNCTION public.prevent_scanner_signal_truth_mutation();

CREATE OR REPLACE FUNCTION public.commit_scanner_signal_decision(p_cycle_key text,p_run_id uuid,p_scope text,p_decision text,p_reason_codes text[],p_arbitration jsonb,p_signal jsonb DEFAULT NULL,p_enqueue_publication boolean DEFAULT false)
RETURNS TABLE(decision_id uuid,signal_id uuid,publication_work_id uuid,idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.scanner_cycle_decisions%ROWTYPE; s public.signals%ROWTYPE; expected_hash text; work_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
  IF p_decision NOT IN ('SIGNAL','NO_TRADE','REJECTED') OR (p_decision='SIGNAL') <> (p_signal IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_SCANNER_DECISION'; END IF;
  expected_hash := md5(jsonb_build_object('decision',p_decision,'reasons',p_reason_codes,'arbitration',p_arbitration,'signal',p_signal)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cycle_key||':'||p_scope,0));
  SELECT * INTO d FROM public.scanner_cycle_decisions WHERE cycle_key=p_cycle_key AND arbitration_scope=p_scope;
  IF FOUND THEN
    IF d.immutable_hash <> expected_hash THEN RAISE EXCEPTION 'SCANNER_DECISION_CONFLICT'; END IF;
    SELECT id INTO work_id FROM public.signal_publication_work WHERE signal_id=d.signal_id LIMIT 1;
    RETURN QUERY SELECT d.id,d.signal_id,work_id,true; RETURN;
  END IF;
  IF p_signal IS NOT NULL THEN
    INSERT INTO public.signals(candidate_id,symbol,market_type,timeframe,direction,entry_type,entry_low,entry_high,stop_loss,tp1,tp2,risk_reward,strategy_name,regime,grade,confidence_score,reason,invalidation,status,source,mode_slug,data_source,created_at,expires_at,arbitrator_decision,risk_profile_snapshot,recommended_risk_pct,suggested_leverage_min,suggested_leverage_max,leverage_cap,signal_identity,contract_version,cycle_key,strategy_id,strategy_version,configuration_version,candle_close_time,immutable_hash)
    VALUES ((p_signal->>'candidate_id')::uuid,p_signal->>'symbol',p_signal->>'market_type',p_signal->>'timeframe',p_signal->>'direction',coalesce(p_signal->>'entry_type','zone'),(p_signal->>'entry_low')::numeric,(p_signal->>'entry_high')::numeric,(p_signal->>'stop_loss')::numeric,(p_signal->>'tp1')::numeric,(p_signal->>'tp2')::numeric,(p_signal->>'risk_reward')::numeric,p_signal->>'strategy_name',p_signal->>'regime',p_signal->>'grade',(p_signal->>'confidence_score')::integer,p_signal->>'reason',p_signal->>'invalidation','waiting','scanner','signal_mode',p_signal->>'data_source',(p_signal->>'created_at')::timestamptz,(p_signal->>'expires_at')::timestamptz,p_signal->'arbitrator_decision',p_signal->'risk_profile_snapshot',(p_signal->>'recommended_risk_pct')::numeric,(p_signal->>'suggested_leverage_min')::numeric,(p_signal->>'suggested_leverage_max')::numeric,(p_signal->>'leverage_cap')::numeric,p_signal->>'signal_identity',p_signal->>'contract_version',p_cycle_key,p_signal->>'strategy_id',p_signal->>'strategy_version',p_signal->>'configuration_version',(p_signal->>'candle_close_time')::timestamptz,p_signal->>'immutable_hash') RETURNING * INTO s;
  END IF;
  INSERT INTO public.scanner_cycle_decisions(cycle_key,scanner_run_id,arbitration_scope,decision,reason_codes,arbitration,signal_id,immutable_hash) VALUES(p_cycle_key,p_run_id,p_scope,p_decision,p_reason_codes,p_arbitration,s.id,expected_hash) RETURNING * INTO d;
  IF p_enqueue_publication AND s.id IS NOT NULL THEN INSERT INTO public.signal_publication_work(signal_id,event_key) VALUES(s.id,'signal:'||p_signal->>'signal_identity') ON CONFLICT(event_key) DO UPDATE SET event_key=EXCLUDED.event_key RETURNING id INTO work_id; END IF;
  RETURN QUERY SELECT d.id,s.id,work_id,false;
END $$;
REVOKE ALL ON FUNCTION public.commit_scanner_signal_decision(text,uuid,text,text,text[],jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_scanner_signal_decision(text,uuid,text,text,text[],jsonb,jsonb,boolean) TO service_role;
