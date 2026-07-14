-- Operator execution helper for 20260714000000_phase3_execution_orders_contract.sql
-- Run this file first. It must remain read-only.
-- Source SQL logic is copied from the complete prepared migration reference.

-- HASHIBOT PHASE 3 PREPARED MIGRATION: execution_orders execution-only contract
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT SQL REVIEW AND THE RUNBOOK.
-- Purpose: discover, preserve, replace, and validate execution_orders.status constraints safely.

-- ============================================================================
-- SECTION 1: READ-ONLY PREFLIGHT (RUN FIRST; NO WRITES)
-- ============================================================================

-- 1.1 Confirm the execution_orders table and required columns exist.
SELECT
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'execution_orders'
  AND c.column_name IN ('id', 'status', 'updated_at')
ORDER BY c.column_name;

-- STOP if table public.execution_orders is missing, id/status are missing, or updated_at is missing.
-- The forward migration verifies updated_at before using it and aborts if absent.

-- 1.2 Discover ALL status-related check constraints, including the known live name
-- execution_orders_status_xf4_check and any older/newer names.
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'execution_orders'
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid, true) ILIKE '%status%'
ORDER BY con.conname;

-- 1.3 Output all current status values and counts.
SELECT
  status,
  COUNT(*) AS row_count
FROM public.execution_orders
GROUP BY status
ORDER BY row_count DESC, status NULLS FIRST;

-- 1.4 Output rows that are NULL or ambiguous. These block the forward migration.
WITH allowed_future(status) AS (
  VALUES
    ('created'),
    ('submitted'),
    ('accepted'),
    ('partially_filled'),
    ('filled'),
    ('cancel_requested'),
    ('cancelled'),
    ('rejected'),
    ('expired'),
    ('failed'),
    ('unknown_provider_state')
), safe_legacy(status, mapped_status) AS (
  VALUES
    ('pending', 'created'),
    ('open', 'accepted'),
    ('new', 'created'),
    ('placed', 'submitted'),
    ('working', 'accepted'),
    ('partial', 'partially_filled'),
    ('partially_filled', 'partially_filled'),
    ('complete', 'filled'),
    ('completed', 'filled'),
    ('filled', 'filled'),
    ('canceled', 'cancelled'),
    ('cancelled', 'cancelled'),
    ('rejected', 'rejected'),
    ('expired', 'expired'),
    ('failed', 'failed'),
    ('error', 'failed'),
    ('unknown', 'unknown_provider_state')
)
SELECT
  eo.id,
  eo.status,
  CASE
    WHEN eo.status IS NULL THEN 'NULL_STATUS'
    WHEN af.status IS NOT NULL THEN 'ALREADY_CANONICAL'
    WHEN sl.status IS NOT NULL THEN 'SAFE_LEGACY_MAPPING'
    ELSE 'AMBIGUOUS_UNMAPPED_STATUS'
  END AS classification
FROM public.execution_orders eo
LEFT JOIN allowed_future af ON af.status = eo.status
LEFT JOIN safe_legacy sl ON sl.status = eo.status
WHERE eo.status IS NULL
   OR (af.status IS NULL AND sl.status IS NULL)
ORDER BY eo.id
LIMIT 500;

-- STOP if this query returns any rows classified as NULL_STATUS or AMBIGUOUS_UNMAPPED_STATUS.
-- Ambiguous statuses are intentionally NOT mapped automatically.

-- 1.5 Reversible mapping evidence for rows that can be migrated safely.
WITH safe_legacy(status, mapped_status) AS (
  VALUES
    ('pending', 'created'),
    ('open', 'accepted'),
    ('new', 'created'),
    ('placed', 'submitted'),
    ('working', 'accepted'),
    ('partial', 'partially_filled'),
    ('partially_filled', 'partially_filled'),
    ('complete', 'filled'),
    ('completed', 'filled'),
    ('filled', 'filled'),
    ('canceled', 'cancelled'),
    ('cancelled', 'cancelled'),
    ('rejected', 'rejected'),
    ('expired', 'expired'),
    ('failed', 'failed'),
    ('error', 'failed'),
    ('unknown', 'unknown_provider_state')
)
SELECT
  eo.status AS legacy_status,
  sl.mapped_status AS proposed_status,
  COUNT(*) AS row_count
FROM public.execution_orders eo
JOIN safe_legacy sl ON sl.status = eo.status
WHERE eo.status <> sl.mapped_status
GROUP BY eo.status, sl.mapped_status
ORDER BY eo.status, sl.mapped_status;

-- ============================================================================
