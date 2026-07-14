-- Operator execution helper for 20260714001000_phase3_runtime_read_models.sql
-- Run only after reviewing 01_preflight.sql output and clearing STOP conditions.
-- Contains the forward migration followed immediately by postflight verification.
-- Rollback remains only in the complete prepared migration reference.

-- SECTION 2: FORWARD MIGRATION (WRITES; RUN ONLY AFTER PREFLIGHT PASSES)
-- ============================================================================

BEGIN;

-- 2.1 Back up any existing view definitions before replacement.
CREATE TABLE IF NOT EXISTS public.phase3_read_model_view_backup (
  migration_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  view_name text NOT NULL,
  view_definition text NOT NULL,
  PRIMARY KEY (migration_id, view_name)
);

INSERT INTO public.phase3_read_model_view_backup (migration_id, view_name, view_definition)
SELECT
  '20260714001000_phase3_runtime_read_models',
  c.relname,
  pg_get_viewdef(c.oid, true)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND c.relname IN (
    'admin_runtime_overview_read_model',
    'admin_active_trade_truth_read_model',
    'admin_execution_orders_read_model',
    'admin_telegram_delivery_health_read_model'
  )
ON CONFLICT (migration_id, view_name) DO UPDATE
SET captured_at = EXCLUDED.captured_at,
    view_definition = EXCLUDED.view_definition;

DO $$
DECLARE
  v_missing_required integer;
BEGIN
  SELECT COUNT(*)
  INTO v_missing_required
  FROM (VALUES
    ('trade_management_truth', 'id'),
    ('trade_management_truth', 'status'),
    ('trade_management_truth', 'provider'),
    ('trade_management_truth', 'environment'),
    ('trade_management_truth', 'symbol'),
    ('trade_management_truth', 'latest_sync_at'),
    ('execution_orders', 'id'),
    ('execution_orders', 'status'),
    ('execution_orders', 'updated_at')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF v_missing_required > 0 THEN
    RAISE EXCEPTION 'required table/column preflight failed for runtime read models';
  END IF;
END $$;

-- 2.2 Supporting indexes. Active trade indexing is based on lifecycle/closure status,
-- not protection_status. Views below contain the full canonical/legacy active definition.
CREATE INDEX IF NOT EXISTS idx_tmt_runtime_active_lifecycle
  ON public.trade_management_truth (provider, environment, symbol, latest_sync_at DESC)
  WHERE COALESCE(status, '') NOT IN (
    'closed',
    'archived',
    'closed_tp2',
    'closed_sl',
    'closed_profit_lock',
    'closed_manual',
    'closed_expired',
    'cancelled',
    'failed'
  );

CREATE INDEX IF NOT EXISTS idx_execution_orders_runtime_status_recent
  ON public.execution_orders (status, updated_at DESC);

-- Telegram delivery idempotency index: create a true unique constraint only if a supported
-- idempotency column exists. Otherwise create a non-unique health index only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telegram_deliveries'
      AND column_name = 'delivery_idempotency_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_deliveries_delivery_idempotency_key_unique ON public.telegram_deliveries (delivery_idempotency_key) WHERE delivery_idempotency_key IS NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telegram_deliveries'
      AND column_name = 'idempotency_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_deliveries_idempotency_key_unique ON public.telegram_deliveries (idempotency_key) WHERE idempotency_key IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telegram_deliveries'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_health_recent ON public.telegram_deliveries (created_at DESC)';
  END IF;
END $$;

-- 2.3 Views. security_invoker=true preserves caller RLS semantics on supported PostgreSQL
-- versions used by Supabase. Public/anon access is explicitly revoked below.
CREATE OR REPLACE VIEW public.admin_active_trade_truth_read_model
WITH (security_invoker = true)
AS
SELECT
  t.id,
  COALESCE(to_jsonb(t)->>'trade_id', t.id::text) AS trade_id,
  to_jsonb(t)->>'provider' AS provider,
  to_jsonb(t)->>'environment' AS environment,
  to_jsonb(t)->>'account_id' AS account_id,
  to_jsonb(t)->>'symbol' AS symbol,
  t.status AS legacy_or_lifecycle_status,
  COALESCE(to_jsonb(t)->>'trade_lifecycle_state', to_jsonb(t)->>'lifecycle_state', t.status) AS lifecycle_state,
  to_jsonb(t)->>'execution_status' AS execution_status,
  to_jsonb(t)->>'protection_status' AS protection_status,
  to_jsonb(t)->>'monitoring_status' AS monitoring_status,
  COALESCE(to_jsonb(t)->>'latest_sync_at', to_jsonb(t)->>'updated_at', to_jsonb(t)->>'created_at') AS last_runtime_timestamp
FROM public.trade_management_truth t
WHERE COALESCE(to_jsonb(t)->>'closed_at', to_jsonb(t)->>'archived_at', to_jsonb(t)->>'exit_at', to_jsonb(t)->>'resolved_at') IS NULL
  AND COALESCE(to_jsonb(t)->>'trade_lifecycle_state', to_jsonb(t)->>'lifecycle_state', t.status, '') NOT IN (
    'closed',
    'archived',
    'closed_tp2',
    'closed_sl',
    'closed_profit_lock',
    'closed_manual',
    'closed_expired',
    'cancelled',
    'failed'
  );

CREATE OR REPLACE VIEW public.admin_execution_orders_read_model
WITH (security_invoker = true)
AS
SELECT
  eo.id,
  COALESCE(to_jsonb(eo)->>'trade_id', to_jsonb(eo)->>'signal_id') AS trade_or_signal_id,
  to_jsonb(eo)->>'provider' AS provider,
  to_jsonb(eo)->>'environment' AS environment,
  to_jsonb(eo)->>'account_id' AS account_id,
  to_jsonb(eo)->>'symbol' AS symbol,
  eo.status,
  CASE
    WHEN eo.status IN ('created', 'submitted', 'accepted', 'partially_filled') THEN true
    WHEN eo.status = 'filled'
      AND COALESCE(to_jsonb(eo)->>'closed_at', to_jsonb(eo)->>'cancelled_at', to_jsonb(eo)->>'expired_at') IS NULL
      THEN false
    ELSE false
  END AS requires_execution_attention,
  COALESCE(to_jsonb(eo)->>'updated_at', to_jsonb(eo)->>'created_at') AS last_execution_timestamp
FROM public.execution_orders eo;

CREATE OR REPLACE VIEW public.admin_runtime_overview_read_model
WITH (security_invoker = true)
AS
SELECT
  (SELECT COUNT(*) FROM public.admin_active_trade_truth_read_model) AS active_trade_count,
  (SELECT COUNT(*) FROM public.admin_execution_orders_read_model WHERE requires_execution_attention) AS execution_attention_count,
  (SELECT COUNT(*) FROM public.execution_orders WHERE status = 'unknown_provider_state') AS unknown_provider_execution_count,
  clock_timestamp() AS generated_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telegram_deliveries'
  ) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.admin_telegram_delivery_health_read_model
      WITH (security_invoker = true)
      AS
      SELECT
        COUNT(*) AS delivery_row_count,
        COUNT(*) FILTER (WHERE COALESCE(to_jsonb(td)->>'status', '') IN ('failed', 'retry_failed')) AS failed_delivery_count,
        MAX(COALESCE(to_jsonb(td)->>'updated_at', to_jsonb(td)->>'created_at')) AS last_delivery_timestamp
      FROM public.telegram_deliveries td
    $view$;
  END IF;
END $$;

-- 2.4 Grants: preserve RLS by using security_invoker views, revoke public/anon access,
-- and grant read access only to authenticated application users and service_role.
REVOKE ALL ON public.admin_active_trade_truth_read_model FROM PUBLIC, anon;
REVOKE ALL ON public.admin_execution_orders_read_model FROM PUBLIC, anon;
REVOKE ALL ON public.admin_runtime_overview_read_model FROM PUBLIC, anon;
GRANT SELECT ON public.admin_active_trade_truth_read_model TO authenticated, service_role;
GRANT SELECT ON public.admin_execution_orders_read_model TO authenticated, service_role;
GRANT SELECT ON public.admin_runtime_overview_read_model TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admin_telegram_delivery_health_read_model'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.admin_telegram_delivery_health_read_model FROM PUBLIC, anon';
    EXECUTE 'GRANT SELECT ON public.admin_telegram_delivery_health_read_model TO authenticated, service_role';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- SECTION 3: POSTFLIGHT VERIFICATION (READ-ONLY)
-- ============================================================================

SELECT 'admin_active_trade_truth_read_model' AS view_name, COUNT(*) AS sample_count
FROM public.admin_active_trade_truth_read_model;

SELECT 'admin_execution_orders_read_model' AS view_name, COUNT(*) AS sample_count
FROM public.admin_execution_orders_read_model;

SELECT * FROM public.admin_runtime_overview_read_model;

SELECT schemaname, indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_tmt_runtime_active_lifecycle',
    'idx_execution_orders_runtime_status_recent',
    'idx_telegram_deliveries_delivery_idempotency_key_unique',
    'idx_telegram_deliveries_idempotency_key_unique',
    'idx_telegram_deliveries_health_recent'
  )
ORDER BY indexname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'admin_runtime_overview_read_model',
    'admin_active_trade_truth_read_model',
    'admin_execution_orders_read_model',
    'admin_telegram_delivery_health_read_model'
  )
ORDER BY table_name, grantee, privilege_type;

-- ============================================================================
