ALTER TABLE public.operator_runtime_events
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS exact_error text,
  ADD COLUMN IF NOT EXISTS result_json jsonb,
  ADD COLUMN IF NOT EXISTS route_called text;

UPDATE public.operator_runtime_events
SET status = COALESCE(status, result),
    exact_error = COALESCE(exact_error, error),
    user_id = COALESCE(user_id, actor_user_id),
    result_json = COALESCE(result_json, raw)
WHERE status IS NULL OR exact_error IS NULL OR user_id IS NULL OR result_json IS NULL;

NOTIFY pgrst, 'reload schema';
