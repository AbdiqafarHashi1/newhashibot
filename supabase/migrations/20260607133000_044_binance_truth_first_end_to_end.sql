/*
  HASHIBOT B5 — Binance testnet truth-first end-to-end protection repair

  - Keeps live trading impossible.
  - Ensures retry/cleanup statuses are valid.
  - Adds monitor proof field for last managed TP/SL action.
  - Repairs the one-minute Binance testnet monitor cron using scanner_config.cron_pg_token.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS last_managed_exit_action jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS latest_auto_skip_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protection_status text NOT NULL DEFAULT 'unprotected',
  ADD COLUMN IF NOT EXISTS bracket_mode text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latest_protection_error text,
  ADD COLUMN IF NOT EXISTS intended_sl numeric,
  ADD COLUMN IF NOT EXISTS intended_tp1 numeric,
  ADD COLUMN IF NOT EXISTS intended_tp2 numeric,
  ADD COLUMN IF NOT EXISTS tp1_quantity numeric,
  ADD COLUMN IF NOT EXISTS tp2_quantity numeric,
  ADD COLUMN IF NOT EXISTS remaining_quantity numeric,
  ADD COLUMN IF NOT EXISTS stale_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_cleanup_reason text NOT NULL DEFAULT '';

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%status%'
        OR pg_get_constraintdef(oid) ILIKE '%protection_status%'
        OR pg_get_constraintdef(oid) ILIKE '%bracket_mode%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_b5_check
  CHECK (status IN (
    'pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed',
    'closed_tp','closed_sl','closed_breakeven','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled','protected_managed','pending_managed_protection'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_protection_status_b5_check
  CHECK (protection_status IN (
    'unprotected','protected','protected_managed','pending_protection','pending_managed_protection','unprotected_failed'
  )) NOT VALID;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_bracket_mode_b5_check
  CHECK (bracket_mode IN ('','exchange_native','managed_exit_fallback','failed')) NOT VALID;

CREATE OR REPLACE FUNCTION public.mark_stale_testnet_execution_orders(
  p_symbol text DEFAULT NULL,
  p_active_statuses text[] DEFAULT ARRAY['pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','protected_managed','pending_managed_protection'],
  p_stale_status text DEFAULT 'stale_closed',
  p_reason text DEFAULT 'binance_truth_no_position_no_orders'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_count integer := 0;
BEGIN
  UPDATE public.execution_orders
  SET status = p_stale_status,
      stale_checked_at = now(),
      stale_cleanup_reason = p_reason,
      updated_at = now()
  WHERE status = ANY(p_active_statuses)
    AND (p_symbol IS NULL OR symbol = p_symbol);

  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stale_testnet_execution_orders(text, text[], text, text) TO service_role;

ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS binance_monitor_cron_job_name text;

DO $$
DECLARE
  project_url CONSTANT text := 'https://uqiwbzfcntlcyyewawfc.supabase.co';
  monitor_ep text := project_url || '/functions/v1/binance-testnet-monitor';
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'hashibot_binance_testnet_monitor_1m' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'hashibot_binance_testnet_monitor_1m',
    '*/1 * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
          ),
          body    := '{"source":"pg_cron","run_type":"binance_testnet_monitor"}'::jsonb
        ) AS request_id;
      $cron$,
      monitor_ep
    )
  );

  UPDATE public.scanner_config
  SET binance_monitor_cron_active = true,
      binance_monitor_cron_job_name = 'hashibot_binance_testnet_monitor_1m',
      updated_at = now()
  WHERE id = 1;
END $$;

UPDATE public.execution_settings
SET live_trading_enabled = false,
    updated_at = now()
WHERE live_trading_enabled IS DISTINCT FROM false;
