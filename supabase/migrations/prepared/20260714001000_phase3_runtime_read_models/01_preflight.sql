-- Operator execution helper for 20260714001000_phase3_runtime_read_models.sql
-- Run this file first. It must remain read-only.
-- Source SQL logic is copied from the complete prepared migration reference.

-- HASHIBOT PHASE 3 PREPARED MIGRATION: runtime read models and bounded indexes
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT SQL REVIEW AND THE RUNBOOK.
-- Purpose: create read-only admin views and safe supporting indexes without runtime mutations.

-- ============================================================================
-- SECTION 1: READ-ONLY PREFLIGHT (RUN FIRST; NO WRITES)
-- ============================================================================

-- 1.1 Confirm referenced tables exist.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'trade_management_truth',
    'execution_orders',
    'telegram_deliveries',
    'runtime_incidents'
  )
ORDER BY table_name;

-- 1.2 Confirm referenced columns. Views use to_jsonb(row) for optional future columns
-- so missing optional lifecycle/closure columns do not break creation.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'trade_management_truth',
    'execution_orders',
    'telegram_deliveries',
    'runtime_incidents'
  )
  AND column_name IN (
    'id',
    'trade_id',
    'side',
    'execution_order_id',
    'symbol',
    'provider',
    'environment',
    'account_id',
    'status',
    'created_at',
    'updated_at',
    'latest_sync_at',
    'executed_at',
    'idempotency_key',
    'delivery_idempotency_key',
    'destination_channel',
    'delivery_type',
    'severity',
    'incident_status',
    'last_seen_at'
  )
ORDER BY table_name, column_name;

-- STOP if trade_management_truth or execution_orders is missing.
-- STOP if any column used by a static index or row identity is missing: trade_management_truth.provider,
-- trade_management_truth.environment, trade_management_truth.symbol, trade_management_truth.side,
-- trade_management_truth.execution_order_id, trade_management_truth.protection_status,
-- trade_management_truth.latest_sync_at, execution_orders.status, or execution_orders.updated_at.
-- NOTE: trade_management_truth.id/status are optional legacy columns; the production
-- row identity is (provider, environment, symbol, side), with execution_order_id
-- unique when present.

-- 1.3 Preserve prior read-model definitions for rollback review.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  pg_get_viewdef(c.oid, true) AS existing_definition
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
ORDER BY c.relname;

-- ============================================================================
