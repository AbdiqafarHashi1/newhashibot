/*
  # C5A Admin Performance Trading History Reset

  Adds a manual, admin-only RPC for resetting historical trading/performance rows
  that feed /admin/performance. The migration only creates the function; it does
  not execute the reset and does not modify configuration, customer, access,
  symbol, candle, indicator, scanner/provider, package, or migration-history data.
*/

CREATE OR REPLACE FUNCTION public.admin_reset_trading_history()
RETURNS TABLE(table_name text, deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_rows bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_reset_trading_history is admin-only'
      USING ERRCODE = '42501';
  END IF;

  -- Child/dependent rows first: telegram_deliveries has a non-cascading FK to signals.
  DELETE FROM public.telegram_deliveries td
  WHERE td.signal_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id);
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'telegram_deliveries';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Outcome tracking rows. This would also cascade from signals, but explicit
  -- deletion lets the RPC report the count and keeps FK cleanup order clear.
  DELETE FROM public.signal_updates su
  WHERE EXISTS (SELECT 1 FROM public.signals s WHERE s.id = su.signal_id);
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'signal_updates';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Parent performance history rows. Nullable FKs from execution/paper tables
  -- are left to their existing ON DELETE SET NULL constraints; no execution
  -- tables are explicitly updated or deleted by this RPC.
  DELETE FROM public.signals;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'signals';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Candidate history after signals because signals.candidate_id references candidates.
  DELETE FROM public.strategy_candidates;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'strategy_candidates';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- scanner_runs are intentionally preserved. Performance views are derived
  -- from signals/signal_updates only, so old scanner runs do not repopulate stats.
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history() TO authenticated;
