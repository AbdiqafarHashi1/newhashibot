-- Operator execution helper for 20260714002000_final_runtime_safety.sql
-- Run this file first. It must remain read-only.
-- Source SQL logic is copied from the complete prepared migration reference.

-- HASHIBOT FINAL PREPARED MIGRATION: persistent runtime safety primitives
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT SQL REVIEW AND THE RUNBOOK.
-- Purpose: database-backed worker leases, runtime-event idempotency, and grouped incidents.

-- ============================================================================
-- SECTION 1: READ-ONLY PREFLIGHT (RUN FIRST; NO WRITES)
-- ============================================================================

-- 1.1 Discover existing runtime safety objects and incompatible schemas before migration.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('runtime_worker_leases', 'runtime_event_idempotency', 'runtime_incidents')
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('runtime_worker_leases', 'runtime_event_idempotency', 'runtime_incidents')
ORDER BY table_name, ordinal_position;

SELECT routine_schema, routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'runtime_acquire_worker_lease',
    'runtime_renew_worker_lease',
    'runtime_release_worker_lease',
    'runtime_record_event_idempotency',
    'runtime_record_incident'
  )
ORDER BY routine_name;

-- STOP if existing populated tables have incompatible column types. The forward migration
-- is repeat-safe for compatible schemas, but does not destructively coerce existing data.

-- ============================================================================
