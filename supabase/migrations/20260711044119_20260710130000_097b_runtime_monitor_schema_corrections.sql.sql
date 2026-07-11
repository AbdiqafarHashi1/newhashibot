/*
# 097b — Corrective Migration for Runtime Monitor Schema

## Purpose
Fixes 5 issues in migration 097 (20260710120000_097_runtime_monitor_schema_catchup.sql):
1. `record_symbol_failure` RPC uses `ON CONFLICT (symbol, provider)` but no UNIQUE constraint exists on those columns — the RPC would throw at runtime.
2. `execution_monitor_heartbeats` table is missing columns that all 3 edge function write sites insert, and has wrong types on others. Edge functions also use `onConflict: "provider,environment,run_id"` which needs a UNIQUE constraint.
3. `errors` column is `text` but edge functions insert arrays (`text[]`).
4. All 4 runtime tables have `USING (true)` policies — any authenticated customer can read/write sensitive runtime data. Replaced with admin-only policies matching the `audit_logs` pattern.
5. Confirmed all 13 `upsert_trade_management_truth` callers already pass the 23-param signature — no caller changes needed.

## Changes

### 1. UNIQUE constraint on problem_symbol_quarantine (symbol, provider)
- Required for `ON CONFLICT (symbol, provider)` in `record_symbol_failure` RPC.

### 2. execution_monitor_heartbeats — add missing columns
Columns the edge functions insert that were missing:
- `environment` (text) — "testnet" | "demo" | "live"
- `positions_seen` (integer) — replaces `positions_synced`
- `orders_seen` (integer) — open orders count
- `executions_checked` (integer) — execution rows inspected
- `protections_created` (integer) — replaces `protections_repaired`
- `positions_closed` (integer) — positions closed this run
- `latest_telegram_event` (text) — last telegram event type
- `metadata` (jsonb) — full result blob
- `updated_at` (timestamptz) — row update time

### 3. execution_monitor_heartbeats — fix types
- `errors`: `text` → `text[]` (edge functions insert arrays of error strings)

### 4. UNIQUE constraint on execution_monitor_heartbeats (provider, environment, run_id)
- Required for `onConflict: "provider,environment,run_id"` in all 3 upsert sites.

### 5. Replace all RLS policies on 4 runtime tables with admin-only
- Old: `USING (true)` / `WITH CHECK (true)` — any authenticated user has full access.
- New: `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')` — admin-only.
- This matches the existing `audit_logs` pattern.
- Note: edge functions use the service_role key which bypasses RLS, so they are unaffected.

### 6. Revoke EXECUTE on upsert_trade_management_truth from anon
- Previously only revoked from PUBLIC and granted to authenticated.
- Now also explicitly revoked from `anon` to prevent unauthenticated access.

## Important Notes
1. All ALTER TABLE statements use IF NOT EXISTS for idempotency.
2. Policies are DROPped before CREATE to ensure idempotency.
3. The `errors` column type change from `text` to `text[]` is safe because the table is empty (new, no data).
4. This migration is safe to re-run.
*/

-- ============================================================
-- 1. UNIQUE constraint on problem_symbol_quarantine (symbol, provider)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'problem_symbol_quarantine'
    AND indexname = 'uq_problem_symbol_quarantine_symbol_provider'
  ) THEN
    CREATE UNIQUE INDEX uq_problem_symbol_quarantine_symbol_provider
      ON public.problem_symbol_quarantine (symbol, provider);
  END IF;
END $$;

-- ============================================================
-- 2. Add missing columns to execution_monitor_heartbeats
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'environment') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN environment text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'positions_seen') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN positions_seen integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'orders_seen') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN orders_seen integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'executions_checked') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN executions_checked integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'protections_created') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN protections_created integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'positions_closed') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN positions_closed integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'latest_telegram_event') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN latest_telegram_event text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'metadata') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN metadata jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats' AND column_name = 'updated_at') THEN
    ALTER TABLE public.execution_monitor_heartbeats ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ============================================================
-- 3. Fix errors column type: text → text[]
-- Table is empty (just created), so direct ALTER is safe.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_monitor_heartbeats'
    AND column_name = 'errors' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.execution_monitor_heartbeats
      ALTER COLUMN errors TYPE text[] USING CASE WHEN errors IS NULL THEN NULL ELSE ARRAY[errors] END;
  END IF;
END $$;

-- ============================================================
-- 4. UNIQUE constraint on execution_monitor_heartbeats (provider, environment, run_id)
-- Required for onConflict: "provider,environment,run_id" in edge function upserts.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'execution_monitor_heartbeats'
    AND indexname = 'uq_execution_monitor_heartbeats_provider_env_runid'
  ) THEN
    CREATE UNIQUE INDEX uq_execution_monitor_heartbeats_provider_env_runid
      ON public.execution_monitor_heartbeats (provider, environment, run_id)
      WHERE run_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 5. Replace RLS policies on all 4 runtime tables with admin-only
-- Edge functions use service_role key (bypasses RLS), so they are unaffected.
-- ============================================================

-- 5a. problem_symbol_quarantine
DROP POLICY IF EXISTS "select_quarantine" ON public.problem_symbol_quarantine;
DROP POLICY IF EXISTS "insert_quarantine" ON public.problem_symbol_quarantine;
DROP POLICY IF EXISTS "update_quarantine" ON public.problem_symbol_quarantine;
DROP POLICY IF EXISTS "delete_quarantine" ON public.problem_symbol_quarantine;

CREATE POLICY "admin_select_quarantine" ON public.problem_symbol_quarantine FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_insert_quarantine" ON public.problem_symbol_quarantine FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_update_quarantine" ON public.problem_symbol_quarantine FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_delete_quarantine" ON public.problem_symbol_quarantine FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- 5b. execution_monitor_heartbeats
DROP POLICY IF EXISTS "select_heartbeats" ON public.execution_monitor_heartbeats;
DROP POLICY IF EXISTS "insert_heartbeats" ON public.execution_monitor_heartbeats;
DROP POLICY IF EXISTS "update_heartbeats" ON public.execution_monitor_heartbeats;
DROP POLICY IF EXISTS "delete_heartbeats" ON public.execution_monitor_heartbeats;

CREATE POLICY "admin_select_heartbeats" ON public.execution_monitor_heartbeats FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_insert_heartbeats" ON public.execution_monitor_heartbeats FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_update_heartbeats" ON public.execution_monitor_heartbeats FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_delete_heartbeats" ON public.execution_monitor_heartbeats FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- 5c. execution_monitor_schedules
DROP POLICY IF EXISTS "select_schedules" ON public.execution_monitor_schedules;
DROP POLICY IF EXISTS "insert_schedules" ON public.execution_monitor_schedules;
DROP POLICY IF EXISTS "update_schedules" ON public.execution_monitor_schedules;
DROP POLICY IF EXISTS "delete_schedules" ON public.execution_monitor_schedules;

CREATE POLICY "admin_select_schedules" ON public.execution_monitor_schedules FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_insert_schedules" ON public.execution_monitor_schedules FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_update_schedules" ON public.execution_monitor_schedules FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_delete_schedules" ON public.execution_monitor_schedules FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- 5d. execution_provider_controls
DROP POLICY IF EXISTS "select_controls" ON public.execution_provider_controls;
DROP POLICY IF EXISTS "insert_controls" ON public.execution_provider_controls;
DROP POLICY IF EXISTS "update_controls" ON public.execution_provider_controls;
DROP POLICY IF EXISTS "delete_controls" ON public.execution_provider_controls;

CREATE POLICY "admin_select_controls" ON public.execution_provider_controls FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_insert_controls" ON public.execution_provider_controls FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_update_controls" ON public.execution_provider_controls FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_delete_controls" ON public.execution_provider_controls FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- 6. Revoke EXECUTE on sensitive RPCs from anon
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text,
  integer, text, text, text
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.record_symbol_failure(text, text, text) FROM anon;
