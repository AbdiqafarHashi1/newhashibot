-- Phase 8B shared policy, recovery, and provider-health control plane.
CREATE TABLE IF NOT EXISTS public.execution_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, provider text NOT NULL, mode text NOT NULL CHECK(mode IN('personal','demo','prop_challenge')),
 enabled boolean NOT NULL DEFAULT true, risk_per_trade_pct numeric NOT NULL CHECK(risk_per_trade_pct>0),
 daily_loss_pct numeric NOT NULL CHECK(daily_loss_pct>0), weekly_loss_pct numeric NOT NULL CHECK(weekly_loss_pct>0),
 max_exposure_pct numeric NOT NULL CHECK(max_exposure_pct>0), max_open_positions integer NOT NULL CHECK(max_open_positions>0),
 break_even_at_r numeric NOT NULL CHECK(break_even_at_r>0), trailing_starts_at_r numeric NOT NULL CHECK(trailing_starts_at_r>0),
 trailing_distance_r numeric NOT NULL CHECK(trailing_distance_r>0), partial_close_at_r numeric NOT NULL CHECK(partial_close_at_r>0),
 partial_close_pct numeric NOT NULL CHECK(partial_close_pct>0 AND partial_close_pct<100), stale_after_seconds integer NOT NULL DEFAULT 90,
 max_recovery_attempts integer NOT NULL DEFAULT 5, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,account_id)
);
ALTER TABLE public.execution_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_policies_owner ON public.execution_policies FOR ALL USING(user_id=auth.uid() OR public.is_admin()) WITH CHECK(user_id=auth.uid() OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.execution_recovery_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trade_id uuid NOT NULL, provider text NOT NULL, account_id uuid NOT NULL,
 incident_type text NOT NULL, idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','succeeded','failed','manual_required')),
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text, locked_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_jobs_due_idx ON public.execution_recovery_jobs(next_attempt_at) WHERE status='pending';
ALTER TABLE public.execution_recovery_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_jobs_admin_read ON public.execution_recovery_jobs FOR SELECT USING(public.is_admin());

CREATE OR REPLACE VIEW public.provider_execution_health WITH (security_invoker=true) AS
SELECT 'mt5'::text provider,a.id account_id,a.user_id,a.connection_status,
 CASE WHEN a.last_sync_at IS NULL OR a.last_sync_at < now()-interval '90 seconds' THEN 'stale' ELSE 'in_sync' END synchronization_status,
 a.provider_health,coalesce(q.pending,0) pending_commands,coalesce(q.failed,0) failed_commands,
 q.oldest_pending_at,extract(epoch FROM(now()-q.oldest_pending_at))*1000 command_latency_ms,
 a.last_heartbeat_at,a.last_sync_at,q.last_successful_execution
FROM public.mt5_accounts a LEFT JOIN LATERAL(
 SELECT count(*) FILTER(WHERE status='pending') pending,count(*) FILTER(WHERE status='failed') failed,
 min(created_at) FILTER(WHERE status='pending') oldest_pending_at,max(acknowledged_at) FILTER(WHERE status='acknowledged') last_successful_execution
 FROM public.mt5_commands c WHERE c.account_id=a.id
)q ON true;
GRANT SELECT ON public.provider_execution_health TO authenticated;
