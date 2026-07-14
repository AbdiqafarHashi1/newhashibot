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
-- SECTION 2: FORWARD MIGRATION (WRITES; RUN ONLY AFTER PREFLIGHT PASSES)
-- ============================================================================

BEGIN;

LOCK TABLE public.execution_orders IN SHARE UPDATE EXCLUSIVE MODE;

-- 2.1 Preserve exact prior status constraint definitions and row-level mapping evidence.
CREATE TABLE IF NOT EXISTS public.phase3_execution_orders_status_constraint_backup (
  migration_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  constraint_name text NOT NULL,
  constraint_definition text NOT NULL,
  PRIMARY KEY (migration_id, constraint_name)
);

CREATE TABLE IF NOT EXISTS public.phase3_execution_orders_status_mapping_audit (
  migration_id text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  execution_order_id text NOT NULL,
  previous_status text,
  mapped_status text NOT NULL,
  PRIMARY KEY (migration_id, execution_order_id)
);

INSERT INTO public.phase3_execution_orders_status_constraint_backup (
  migration_id,
  constraint_name,
  constraint_definition
)
SELECT
  '20260714000000_phase3_execution_orders_contract',
  con.conname,
  pg_get_constraintdef(con.oid, true)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'execution_orders'
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid, true) ILIKE '%status%'
ON CONFLICT (migration_id, constraint_name) DO UPDATE
SET captured_at = EXCLUDED.captured_at,
    constraint_definition = EXCLUDED.constraint_definition;

DO $$
DECLARE
  v_has_id boolean;
  v_has_status boolean;
  v_has_updated_at boolean;
  v_bad_count integer;
  r record;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'id'
  ) INTO v_has_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'status'
  ) INTO v_has_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'updated_at'
  ) INTO v_has_updated_at;

  IF NOT v_has_id OR NOT v_has_status THEN
    RAISE EXCEPTION 'execution_orders id/status columns are required before this migration can run';
  END IF;

  IF NOT v_has_updated_at THEN
    RAISE EXCEPTION 'execution_orders.updated_at is required; migration aborts before using updated_at';
  END IF;

  WITH allowed_future(status) AS (
    VALUES
      ('created'), ('submitted'), ('accepted'), ('partially_filled'), ('filled'),
      ('cancel_requested'), ('cancelled'), ('rejected'), ('expired'), ('failed'),
      ('unknown_provider_state')
  ), safe_legacy(status, mapped_status) AS (
    VALUES
      ('pending', 'created'), ('open', 'accepted'), ('new', 'created'),
      ('placed', 'submitted'), ('working', 'accepted'), ('partial', 'partially_filled'),
      ('partially_filled', 'partially_filled'), ('complete', 'filled'),
      ('completed', 'filled'), ('filled', 'filled'), ('canceled', 'cancelled'),
      ('cancelled', 'cancelled'), ('rejected', 'rejected'), ('expired', 'expired'),
      ('failed', 'failed'), ('error', 'failed'), ('unknown', 'unknown_provider_state')
  )
  SELECT COUNT(*)
  INTO v_bad_count
  FROM public.execution_orders eo
  LEFT JOIN allowed_future af ON af.status = eo.status
  LEFT JOIN safe_legacy sl ON sl.status = eo.status
  WHERE eo.status IS NULL
     OR (af.status IS NULL AND sl.status IS NULL);

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'execution_orders contains % NULL or ambiguous status rows; inspect preflight output before migrating', v_bad_count;
  END IF;

  -- Drop every existing status check constraint so old and new constraints are never active together.
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'execution_orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid, true) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

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
), to_map AS (
  SELECT eo.id::text AS execution_order_id, eo.status AS previous_status, sl.mapped_status
  FROM public.execution_orders eo
  JOIN safe_legacy sl ON sl.status = eo.status
  WHERE eo.status <> sl.mapped_status
)
INSERT INTO public.phase3_execution_orders_status_mapping_audit (
  migration_id,
  execution_order_id,
  previous_status,
  mapped_status
)
SELECT
  '20260714000000_phase3_execution_orders_contract',
  execution_order_id,
  previous_status,
  mapped_status
FROM to_map
ON CONFLICT (migration_id, execution_order_id) DO UPDATE
SET migrated_at = EXCLUDED.migrated_at,
    previous_status = EXCLUDED.previous_status,
    mapped_status = EXCLUDED.mapped_status;

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
UPDATE public.execution_orders eo
SET status = sl.mapped_status,
    updated_at = clock_timestamp()
FROM safe_legacy sl
WHERE eo.status = sl.status
  AND eo.status <> sl.mapped_status;

ALTER TABLE public.execution_orders
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_phase3_check
  CHECK (status IN (
    'created',
    'submitted',
    'accepted',
    'partially_filled',
    'filled',
    'cancel_requested',
    'cancelled',
    'rejected',
    'expired',
    'failed',
    'unknown_provider_state'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  VALIDATE CONSTRAINT execution_orders_status_phase3_check;

COMMIT;

-- ============================================================================
-- SECTION 3: POSTFLIGHT VERIFICATION (READ-ONLY)
-- ============================================================================

-- 3.1 Confirm no NULL or unsupported statuses remain.
SELECT
  status,
  COUNT(*) AS row_count
FROM public.execution_orders
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS unsupported_status_rows
FROM public.execution_orders
WHERE status IS NULL
   OR status NOT IN (
    'created',
    'submitted',
    'accepted',
    'partially_filled',
    'filled',
    'cancel_requested',
    'cancelled',
    'rejected',
    'expired',
    'failed',
    'unknown_provider_state'
  );

-- 3.2 Confirm exactly one status check constraint remains active.
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS constraint_definition,
  con.convalidated AS is_validated
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'execution_orders'
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid, true) ILIKE '%status%'
ORDER BY con.conname;

-- 3.3 Confirm rollback evidence was preserved.
SELECT *
FROM public.phase3_execution_orders_status_constraint_backup
WHERE migration_id = '20260714000000_phase3_execution_orders_contract'
ORDER BY constraint_name;

SELECT previous_status, mapped_status, COUNT(*) AS row_count
FROM public.phase3_execution_orders_status_mapping_audit
WHERE migration_id = '20260714000000_phase3_execution_orders_contract'
GROUP BY previous_status, mapped_status
ORDER BY previous_status, mapped_status;

-- ============================================================================
-- SECTION 4: ROLLBACK / DOWN PROCEDURE (WRITES; RUN ONLY BY OPERATOR DECISION)
-- ============================================================================

-- Rollback restores preserved status check definitions and row statuses captured in the
-- mapping audit. Review the two backup tables before running this section.

BEGIN;

LOCK TABLE public.execution_orders IN SHARE UPDATE EXCLUSIVE MODE;

DO $$
DECLARE
  r record;
BEGIN
  -- Drop all currently active status checks, including execution_orders_status_phase3_check,
  -- so rollback never leaves old and new status constraints active together.
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'execution_orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid, true) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.execution_orders eo
SET status = audit.previous_status,
    updated_at = clock_timestamp()
FROM public.phase3_execution_orders_status_mapping_audit audit
WHERE audit.migration_id = '20260714000000_phase3_execution_orders_contract'
  AND eo.id::text = audit.execution_order_id;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT constraint_name, constraint_definition
    FROM public.phase3_execution_orders_status_constraint_backup
    WHERE migration_id = '20260714000000_phase3_execution_orders_contract'
    ORDER BY constraint_name
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders ADD CONSTRAINT %I %s', r.constraint_name, r.constraint_definition);
  END LOOP;
END $$;

-- Preserve strict NULL safety unless an explicitly reviewed legacy rollback requires otherwise.
ALTER TABLE public.execution_orders
  ALTER COLUMN status SET NOT NULL;

COMMIT;
