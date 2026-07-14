-- Operator execution helper for 20260714000000_phase3_execution_orders_contract.sql
-- Run only after reviewing 01_preflight.sql output and clearing STOP conditions.
-- Contains the forward migration followed immediately by postflight verification.
-- Rollback remains only in the complete prepared migration reference.

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
