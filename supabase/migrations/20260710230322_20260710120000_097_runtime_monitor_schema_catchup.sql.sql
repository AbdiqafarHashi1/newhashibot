/*
# 097 — Runtime Monitor Schema Catchup

## Purpose
The Binance/Bybit testnet monitor edge functions and the operator panel depend on
tables, columns, and RPCs that were never created in the database. This migration
creates all missing schema objects so the monitors, runtime proof, and operator
workspace function correctly.

## Changes

### 1. New columns on `trade_management_truth`
- `repair_attempts` (integer, default 0) — how many times protection repair has been attempted
- `recovery_status` (text) — current recovery state (none, repair_in_progress, repair_succeeded, repair_failed)
- `latest_error` (text) — most recent error message from monitor/sync
- `last_action_taken` (text) — last action the monitor performed on this row
- `monitor_status` (text, default 'synced') — sync state of this row

### 2. New columns on `execution_orders`
- `last_monitor_run_id` (text) — ID of the last monitor run that checked this row
- `last_monitor_checked_at` (timestamptz) — when the monitor last checked this row
- `latest_monitor_error` (text) — latest error from monitor for this order
- `latest_sync_error` (text) — latest sync error for this order
- `runner_active` (boolean, default false) — whether the runner TP is still active
- `profit_lock_sl_active` (boolean, default false) — whether profit-lock SL is active
- `tp2_filled` (boolean, default false) — whether TP2 has filled
- `remaining_qty` (numeric) — remaining quantity after partial fills
- `provider_status` (text) — status reported by the exchange provider
- `recovery_status` (text) — recovery state for this order
- `repair_attempts` (integer, default 0) — repair attempt count
- `position_confirmed` (boolean, default false) — whether position existence was confirmed on exchange
- `sl_confirmed` (boolean, default false) — whether SL order was confirmed on exchange
- `tp1_confirmed` (boolean, default false) — whether TP1 order was confirmed on exchange
- `tp2_confirmed` (boolean, default false) — whether TP2 order was confirmed on exchange
- `expires_at` (timestamptz) — when this order expires
- `expiry_status` (text) — expiry state
- `cleanup_status` (text) — cleanup state
- `last_telegram_event_sent` (text) — last telegram event type sent for this order
- `latest_telegram_event_at` (timestamptz) — when the last telegram event was sent

### 3. New columns on `execution_settings`
- `latest_monitor_error` (text) — latest error from the monitor
- `latest_sync_error` (text) — latest error from sync

### 4. New columns on `scanner_config`
- `supervisor_enabled` (boolean, default false) — whether the trade supervisor is enabled
- `operator_auto_repair_enabled` (boolean, default false) — auto repair toggle
- `operator_telegram_enabled` (boolean, default false) — operator telegram toggle
- `operator_news_brain_enabled` (boolean, default false) — news brain toggle
- `trade_supervisor_last_run_at` (timestamptz) — last supervisor run timestamp
- `latest_success_at` (timestamptz) — last successful operation timestamp
- `latest_error` (text) — latest error message

### 5. New table: `problem_symbol_quarantine`
Tracks symbols that have repeated exchange failures and should be temporarily
excluded from execution and/or repair.
- `id` (uuid PK)
- `symbol` (text, not null)
- `provider` (text, not null)
- `reason` (text)
- `first_seen` (timestamptz, default now())
- `last_seen` (timestamptz, default now())
- `occurrence_count` (integer, default 1)
- `disabled_for_execution` (boolean, default true)
- `disabled_for_repair` (boolean, default false)
- `cooldown_until` (timestamptz)
- `recommended_action` (text)
- `resolved` (boolean, default false)
- `resolved_at` (timestamptz)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 6. New table: `execution_monitor_heartbeats`
Records each monitor/supervisor run for health dashboard display.
- `id` (uuid PK)
- `run_id` (text)
- `provider` (text)
- `function_name` (text)
- `started_at` (timestamptz)
- `completed_at` (timestamptz)
- `success` (boolean)
- `monitor_status` (text)
- `errors` (text)
- `protections_checked` (integer)
- `protections_missing` (integer)
- `protections_repaired` (integer)
- `positions_synced` (integer)
- `stale_orders_cleaned` (integer)
- `trigger_source` (text)
- `is_automatic` (boolean)
- `latest_recovery_action` (text)
- `created_at` (timestamptz, default now())

### 7. New table: `execution_monitor_schedules`
Tracks the cron schedule state for each provider monitor.
- `id` (uuid PK)
- `provider` (text, not null)
- `function_name` (text, not null)
- `enabled` (boolean, default true)
- `interval_seconds` (integer, default 60)
- `last_run_at` (timestamptz)
- `next_run_at` (timestamptz)
- `last_success` (timestamptz)
- `last_error` (text)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 8. New table: `execution_provider_controls`
Pause/resume state for each provider and subsystem.
- `id` (uuid PK)
- `provider` (text, not null)
- `subsystem` (text, not null)
- `paused` (boolean, default false)
- `paused_reason` (text)
- `paused_at` (timestamptz)
- `resumed_at` (timestamptz)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 9. New RPC: `record_symbol_failure`
Called by edge functions to record a symbol exchange failure and optionally
quarantine it after repeated occurrences.

### 10. Replaced RPC: `upsert_trade_management_truth`
The existing function accepts 19 parameters. The edge functions call it with
23 parameters (adding p_repair_attempts, p_recovery_status, p_latest_error,
p_last_action_taken). We DROP the old function and CREATE the new one with
the extended signature, then REVOKE from PUBLIC and GRANT to authenticated.
The DROP + CREATE approach avoids the "function not unique" error that
occurs when two overloads exist and REVOKE cannot disambiguate.

## Security
- RLS enabled on all new tables.
- `problem_symbol_quarantine`, `execution_monitor_heartbeats`,
  `execution_monitor_schedules`, `execution_provider_controls` — all use
  `TO authenticated` policies (admin-only app with sign-in).
- `upsert_trade_management_truth` — SECURITY DEFINER, REVOKE from PUBLIC,
  GRANT EXECUTE to authenticated.
- `record_symbol_failure` — SECURITY DEFINER, REVOKE from PUBLIC,
  GRANT EXECUTE to authenticated.

## Important Notes
1. The old `upsert_trade_management_truth` (19 params) is DROPped first, then
   the new 23-param version is CREATEd. This avoids the ambiguous-REVOKE error.
2. All ALTER TABLE ADD COLUMN statements use IF NOT EXISTS for idempotency.
3. All CREATE TABLE statements use IF NOT EXISTS.
4. Policies are DROPped before CREATE to ensure idempotency.
*/

-- ============================================================
-- 1. Add missing columns to trade_management_truth
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trade_management_truth' AND column_name = 'repair_attempts') THEN
    ALTER TABLE public.trade_management_truth ADD COLUMN repair_attempts integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trade_management_truth' AND column_name = 'recovery_status') THEN
    ALTER TABLE public.trade_management_truth ADD COLUMN recovery_status text NOT NULL DEFAULT 'none';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trade_management_truth' AND column_name = 'latest_error') THEN
    ALTER TABLE public.trade_management_truth ADD COLUMN latest_error text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trade_management_truth' AND column_name = 'last_action_taken') THEN
    ALTER TABLE public.trade_management_truth ADD COLUMN last_action_taken text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trade_management_truth' AND column_name = 'monitor_status') THEN
    ALTER TABLE public.trade_management_truth ADD COLUMN monitor_status text NOT NULL DEFAULT 'synced';
  END IF;
END $$;

-- ============================================================
-- 2. Add missing columns to execution_orders
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'last_monitor_run_id') THEN
    ALTER TABLE public.execution_orders ADD COLUMN last_monitor_run_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'last_monitor_checked_at') THEN
    ALTER TABLE public.execution_orders ADD COLUMN last_monitor_checked_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'latest_monitor_error') THEN
    ALTER TABLE public.execution_orders ADD COLUMN latest_monitor_error text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'latest_sync_error') THEN
    ALTER TABLE public.execution_orders ADD COLUMN latest_sync_error text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'runner_active') THEN
    ALTER TABLE public.execution_orders ADD COLUMN runner_active boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'profit_lock_sl_active') THEN
    ALTER TABLE public.execution_orders ADD COLUMN profit_lock_sl_active boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'tp2_filled') THEN
    ALTER TABLE public.execution_orders ADD COLUMN tp2_filled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'remaining_qty') THEN
    ALTER TABLE public.execution_orders ADD COLUMN remaining_qty numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'provider_status') THEN
    ALTER TABLE public.execution_orders ADD COLUMN provider_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'recovery_status') THEN
    ALTER TABLE public.execution_orders ADD COLUMN recovery_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'repair_attempts') THEN
    ALTER TABLE public.execution_orders ADD COLUMN repair_attempts integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'position_confirmed') THEN
    ALTER TABLE public.execution_orders ADD COLUMN position_confirmed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'sl_confirmed') THEN
    ALTER TABLE public.execution_orders ADD COLUMN sl_confirmed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'tp1_confirmed') THEN
    ALTER TABLE public.execution_orders ADD COLUMN tp1_confirmed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'tp2_confirmed') THEN
    ALTER TABLE public.execution_orders ADD COLUMN tp2_confirmed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'expires_at') THEN
    ALTER TABLE public.execution_orders ADD COLUMN expires_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'expiry_status') THEN
    ALTER TABLE public.execution_orders ADD COLUMN expiry_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'cleanup_status') THEN
    ALTER TABLE public.execution_orders ADD COLUMN cleanup_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'last_telegram_event_sent') THEN
    ALTER TABLE public.execution_orders ADD COLUMN last_telegram_event_sent text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_orders' AND column_name = 'latest_telegram_event_at') THEN
    ALTER TABLE public.execution_orders ADD COLUMN latest_telegram_event_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 3. Add missing columns to execution_settings
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_settings' AND column_name = 'latest_monitor_error') THEN
    ALTER TABLE public.execution_settings ADD COLUMN latest_monitor_error text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'execution_settings' AND column_name = 'latest_sync_error') THEN
    ALTER TABLE public.execution_settings ADD COLUMN latest_sync_error text;
  END IF;
END $$;

-- ============================================================
-- 4. Add missing columns to scanner_config
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'supervisor_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN supervisor_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'operator_auto_repair_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN operator_auto_repair_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'operator_telegram_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN operator_telegram_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'operator_news_brain_enabled') THEN
    ALTER TABLE public.scanner_config ADD COLUMN operator_news_brain_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'trade_supervisor_last_run_at') THEN
    ALTER TABLE public.scanner_config ADD COLUMN trade_supervisor_last_run_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'latest_success_at') THEN
    ALTER TABLE public.scanner_config ADD COLUMN latest_success_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scanner_config' AND column_name = 'latest_error') THEN
    ALTER TABLE public.scanner_config ADD COLUMN latest_error text;
  END IF;
END $$;

-- ============================================================
-- 5. Create problem_symbol_quarantine table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.problem_symbol_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  provider text NOT NULL,
  reason text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  disabled_for_execution boolean NOT NULL DEFAULT true,
  disabled_for_repair boolean NOT NULL DEFAULT false,
  cooldown_until timestamptz,
  recommended_action text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $bootstrap$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.problem_symbol_quarantine'::regclass AND attname='occurrence_count' AND NOT attisdropped) THEN
  ALTER TABLE public.problem_symbol_quarantine ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1;
  UPDATE public.problem_symbol_quarantine SET occurrence_count=failure_count;
 END IF;
END $bootstrap$;
DO $overload$ DECLARE definition text; body text; acl aclitem[]; owner_name text; BEGIN
 SELECT pg_get_functiondef(oid),prosrc,proacl,pg_get_userbyid(proowner) INTO definition,body,acl,owner_name FROM pg_proc WHERE oid='public.record_symbol_failure(text,text,text,jsonb,integer,integer)'::regprocedure;
 IF position('p_metadata jsonb DEFAULT ''{}''::jsonb' in definition)=0 THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_DEFAULT_PRECONDITION_FAILED'; END IF;
 IF owner_name<>current_user THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_OWNER_OR_CUSTOM_ACL_REVIEW_REQUIRED'; END IF;
 DROP FUNCTION public.record_symbol_failure(text,text,text,jsonb,integer,integer);
 EXECUTE replace(definition,'p_metadata jsonb DEFAULT ''{}''::jsonb','p_metadata jsonb');
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.record_symbol_failure(text,text,text,jsonb,integer,integer)'::regprocedure AND (prosrc IS DISTINCT FROM body OR proacl IS DISTINCT FROM acl)) THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_BODY_OR_GRANTS_CHANGED'; END IF;
END $overload$;
ALTER TABLE public.problem_symbol_quarantine ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.execution_provider_controls ADD COLUMN IF NOT EXISTS provider text GENERATED ALWAYS AS (provider_name) STORED, ADD COLUMN IF NOT EXISTS subsystem text;
ALTER TABLE public.problem_symbol_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quarantine" ON public.problem_symbol_quarantine;
CREATE POLICY "select_quarantine" ON public.problem_symbol_quarantine FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_quarantine" ON public.problem_symbol_quarantine;
CREATE POLICY "insert_quarantine" ON public.problem_symbol_quarantine FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_quarantine" ON public.problem_symbol_quarantine;
CREATE POLICY "update_quarantine" ON public.problem_symbol_quarantine FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_quarantine" ON public.problem_symbol_quarantine;
CREATE POLICY "delete_quarantine" ON public.problem_symbol_quarantine FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 6. Create execution_monitor_heartbeats table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_monitor_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text,
  provider text,
  function_name text,
  started_at timestamptz,
  completed_at timestamptz,
  success boolean,
  monitor_status text,
  errors text,
  protections_checked integer,
  protections_missing integer,
  protections_repaired integer,
  positions_synced integer,
  stale_orders_cleaned integer,
  trigger_source text,
  is_automatic boolean,
  latest_recovery_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_monitor_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_heartbeats" ON public.execution_monitor_heartbeats;
CREATE POLICY "select_heartbeats" ON public.execution_monitor_heartbeats FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_heartbeats" ON public.execution_monitor_heartbeats;
CREATE POLICY "insert_heartbeats" ON public.execution_monitor_heartbeats FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_heartbeats" ON public.execution_monitor_heartbeats;
CREATE POLICY "update_heartbeats" ON public.execution_monitor_heartbeats FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_heartbeats" ON public.execution_monitor_heartbeats;
CREATE POLICY "delete_heartbeats" ON public.execution_monitor_heartbeats FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 7. Create execution_monitor_schedules table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_monitor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  function_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  interval_seconds integer NOT NULL DEFAULT 60,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_success timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_monitor_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_schedules" ON public.execution_monitor_schedules;
CREATE POLICY "select_schedules" ON public.execution_monitor_schedules FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_schedules" ON public.execution_monitor_schedules;
CREATE POLICY "insert_schedules" ON public.execution_monitor_schedules FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_schedules" ON public.execution_monitor_schedules;
CREATE POLICY "update_schedules" ON public.execution_monitor_schedules FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_schedules" ON public.execution_monitor_schedules;
CREATE POLICY "delete_schedules" ON public.execution_monitor_schedules FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 8. Create execution_provider_controls table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_provider_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  subsystem text NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  resumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_provider_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_controls" ON public.execution_provider_controls;
CREATE POLICY "select_controls" ON public.execution_provider_controls FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_controls" ON public.execution_provider_controls;
CREATE POLICY "insert_controls" ON public.execution_provider_controls FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_controls" ON public.execution_provider_controls;
CREATE POLICY "update_controls" ON public.execution_provider_controls FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_controls" ON public.execution_provider_controls;
CREATE POLICY "delete_controls" ON public.execution_provider_controls FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 9. Create record_symbol_failure RPC
-- ============================================================
DROP FUNCTION IF EXISTS public.record_symbol_failure(text, text, text);
CREATE OR REPLACE FUNCTION public.record_symbol_failure(
  p_symbol text,
  p_provider text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.problem_symbol_quarantine (symbol, provider, reason, first_seen, last_seen, occurrence_count)
  VALUES (p_symbol, p_provider, p_reason, now(), now(), 1)
  ON CONFLICT (symbol, provider) DO UPDATE SET
    occurrence_count = public.problem_symbol_quarantine.occurrence_count + 1,
    last_seen = now(),
    reason = COALESCE(p_reason, public.problem_symbol_quarantine.reason),
    updated_at = now(),
    resolved = CASE WHEN public.problem_symbol_quarantine.resolved THEN false ELSE public.problem_symbol_quarantine.resolved END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_symbol_failure(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_symbol_failure(text, text, text) TO authenticated;

-- ============================================================
-- 10. Replace upsert_trade_management_truth with extended signature
-- ============================================================
-- DROP the old 19-param version first to avoid ambiguous overload
DROP FUNCTION IF EXISTS public.upsert_trade_management_truth(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
);

-- Create the extended 23-param version
CREATE OR REPLACE FUNCTION public.upsert_trade_management_truth(
  p_execution_order_id uuid,
  p_provider text,
  p_environment text,
  p_symbol text,
  p_direction text,
  p_status text,
  p_protection_status text,
  p_sl_present boolean,
  p_tp1_present boolean,
  p_tp2_present boolean,
  p_entry_price numeric DEFAULT NULL::numeric,
  p_mark_price numeric DEFAULT NULL::numeric,
  p_unrealized_pnl numeric DEFAULT NULL::numeric,
  p_quantity numeric DEFAULT NULL::numeric,
  p_leverage numeric DEFAULT NULL::numeric,
  p_sl_price numeric DEFAULT NULL::numeric,
  p_tp1_price numeric DEFAULT NULL::numeric,
  p_tp2_price numeric DEFAULT NULL::numeric,
  p_monitor_run_id text DEFAULT NULL::text,
  p_repair_attempts integer DEFAULT NULL::integer,
  p_recovery_status text DEFAULT NULL::text,
  p_latest_error text DEFAULT NULL::text,
  p_last_action_taken text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.trade_management_truth (
    execution_order_id, provider, environment, symbol, direction, status,
    protection_status, sl_present, tp1_present, tp2_present,
    entry_price, mark_price, unrealized_pnl, quantity, leverage,
    sl_price, tp1_price, tp2_price, latest_sync_at, monitor_run_id,
    repair_attempts, recovery_status, latest_error, last_action_taken
  )
  VALUES (
    p_execution_order_id, p_provider, p_environment, p_symbol, p_direction, p_status,
    p_protection_status, p_sl_present, p_tp1_present, p_tp2_present,
    p_entry_price, p_mark_price, p_unrealized_pnl, p_quantity, p_leverage,
    p_sl_price, p_tp1_price, p_tp2_price, now(), p_monitor_run_id,
    COALESCE(p_repair_attempts, 0), COALESCE(p_recovery_status, 'none'), p_latest_error, p_last_action_taken
  )
  ON CONFLICT (execution_order_id) DO UPDATE SET
    status              = EXCLUDED.status,
    protection_status   = EXCLUDED.protection_status,
    sl_present          = EXCLUDED.sl_present,
    tp1_present         = EXCLUDED.tp1_present,
    tp2_present         = EXCLUDED.tp2_present,
    mark_price          = EXCLUDED.mark_price,
    unrealized_pnl      = EXCLUDED.unrealized_pnl,
    quantity            = EXCLUDED.quantity,
    repair_attempts     = COALESCE(EXCLUDED.repair_attempts, trade_management_truth.repair_attempts),
    recovery_status     = COALESCE(EXCLUDED.recovery_status, trade_management_truth.recovery_status),
    latest_error        = EXCLUDED.latest_error,
    last_action_taken   = EXCLUDED.last_action_taken,
    latest_sync_at      = now(),
    monitor_run_id      = EXCLUDED.monitor_run_id,
    updated_at          = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text,
  integer, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_trade_management_truth(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text,
  integer, text, text, text
) TO authenticated;

-- ============================================================
-- 11. Create indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_problem_symbol_quarantine_symbol_provider
  ON public.problem_symbol_quarantine (symbol, provider)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_execution_monitor_heartbeats_provider_completed
  ON public.execution_monitor_heartbeats (provider, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_monitor_schedules_provider
  ON public.execution_monitor_schedules (provider);

CREATE INDEX IF NOT EXISTS idx_execution_provider_controls_provider_subsystem
  ON public.execution_provider_controls (provider, subsystem);

CREATE INDEX IF NOT EXISTS idx_trade_management_truth_provider_status
  ON public.trade_management_truth (provider, protection_status);

CREATE INDEX IF NOT EXISTS idx_execution_orders_status_protection
  ON public.execution_orders (status, protection_status);
