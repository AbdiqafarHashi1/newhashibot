CREATE TABLE IF NOT EXISTS public.operator_runtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  action text NOT NULL,
  result text NOT NULL CHECK (result IN ('RUNNING', 'SUCCESS', 'FAILED')),
  summary text NOT NULL DEFAULT '',
  provider text,
  symbols_affected text[] NOT NULL DEFAULT '{}',
  route text,
  function_name text,
  blocker text,
  error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  telegram_sent boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_runtime_events_created_idx ON public.operator_runtime_events(created_at DESC);
CREATE INDEX IF NOT EXISTS operator_runtime_events_source_action_idx ON public.operator_runtime_events(source, action, created_at DESC);

ALTER TABLE public.operator_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read operator runtime events" ON public.operator_runtime_events;
CREATE POLICY "Admins can read operator runtime events" ON public.operator_runtime_events FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can write operator runtime events" ON public.operator_runtime_events;
CREATE POLICY "Admins can write operator runtime events" ON public.operator_runtime_events FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage operator runtime events" ON public.operator_runtime_events;
CREATE POLICY "Service role can manage operator runtime events" ON public.operator_runtime_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.operator_runtime_events IS 'Human-readable operator action/runtime evidence written by dashboard actions and backend jobs.';
NOTIFY pgrst, 'reload schema';
