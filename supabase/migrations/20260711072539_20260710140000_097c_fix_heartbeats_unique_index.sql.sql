/*
# 097c — Fix heartbeats unique index for ON CONFLICT compatibility

## Purpose
The unique index on execution_monitor_heartbeats (provider, environment, run_id) was 
created as a PARTIAL index with `WHERE run_id IS NOT NULL`. Postgres ON CONFLICT 
requires the conflict target to exactly match the index predicate. The Supabase JS 
client uses `onConflict: "provider,environment,run_id"` without a WHERE clause, so 
it can't match a partial index.

## Fix
Drop the partial index and recreate it as a non-partial unique index. This is safe 
because Postgres treats NULLs as distinct in unique indexes — multiple rows with 
run_id = NULL are allowed.

## Note
Safe to re-run — uses IF EXISTS / IF NOT EXISTS.
*/

DROP INDEX IF EXISTS public.uq_execution_monitor_heartbeats_provider_env_runid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_monitor_heartbeats_provider_env_runid
  ON public.execution_monitor_heartbeats (provider, environment, run_id);
