/*
  # Full trading-state reset while preserving candles/market data

  Replaces admin_reset_trading_history() with a safe admin-only reset that clears
  signal/candidate/outcome/Telegram delivery and app-tracked paper/demo trading
  state. Candle and reusable market-data tables are intentionally untouched.
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

  -- Linked Telegram signal history first; non-signal Telegram setup/test rows stay intact.
  DELETE FROM public.telegram_deliveries td
  WHERE td.signal_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = td.signal_id);
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'telegram_deliveries';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Outcome/status tracking rows for the signals being reset.
  DELETE FROM public.signal_updates su
  WHERE su.signal_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.signals s WHERE s.id = su.signal_id);
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'signal_updates';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- App-tracked demo/execution order state only; no external close orders are sent.
  DELETE FROM public.execution_orders eo
  WHERE eo.id IS NOT NULL;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'execution_orders';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- App-tracked paper/demo position intent state.
  DELETE FROM public.paper_execution_intents pei
  WHERE pei.id IS NOT NULL;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'paper_execution_intents';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Open and closed signal history. Explicit WHERE keeps the RPC compatible with safe-update settings.
  DELETE FROM public.signals s
  WHERE s.id IS NOT NULL;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'signals';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Candidate and rejected setup history after signals because signals.candidate_id references candidates.
  DELETE FROM public.strategy_candidates sc
  WHERE sc.id IS NOT NULL;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  table_name := 'strategy_candidates';
  deleted_count := deleted_rows;
  RETURN NEXT;

  -- Intentionally preserved: candles, indicator_snapshots, scanner_runs,
  -- symbols, strategy_configs, scanner_config, provider_status, Telegram setup
  -- tables, customers/users, packages/subscriptions/access, Bot setup records,
  -- replay/backtest datasets, and audit logs. Performance/capital analytics are
  -- view-derived from signals/signal_updates and reset naturally after these deletes.
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_trading_history() TO authenticated;
