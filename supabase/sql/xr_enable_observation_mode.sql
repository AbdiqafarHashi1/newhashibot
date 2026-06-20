-- X-R observation mode enablement (run after migrations and Edge Function deploy).
-- This DOES NOT enable live trading. Execution and auto-repair remain paused.
SELECT public.hashibot_enable_observation_mode();
SELECT * FROM public.runtime_truth_function();
SELECT job_name, configured, enabled, last_run_at, last_success_at, next_run_at, last_error, function_name, route, source, status
FROM public.scheduler_truth_view
ORDER BY job_name;
