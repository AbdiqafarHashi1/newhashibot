-- 092_retention_batch_cleanup_and_runtime_stability.sql
-- Sub-mission: Implement safe batched retention cleanup and runtime indexes for auth/profiles/subscriptions and non-critical tables.

-- ============================================================
-- 1. Create Timestamp Indexes for Non-Critical Tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON public.candles(open_time);
CREATE INDEX IF NOT EXISTS idx_candles_open_time ON public.candles(open_time);
CREATE INDEX IF NOT EXISTS idx_indicator_snapshots_created_at ON public.indicator_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_scanner_runs_started_at ON public.scanner_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_strategy_candidates_created_at ON public.strategy_candidates(created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_created_at ON public.telegram_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_execution_event_logs_created_at ON public.execution_event_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operator_runtime_events_created_at ON public.operator_runtime_events(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_parity_audit_created_at ON public.provider_parity_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_replay_datasets_created_at ON public.replay_datasets(created_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_created_at ON public.intelligence_events(created_at);

-- ============================================================
-- 2. Create User Profiles, Subscriptions & Access Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON public.access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON public.access_requests(email);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_id ON public.customer_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_profile_id ON public.customer_subscriptions(profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_payment_status ON public.customer_subscriptions(payment_status);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_access_status ON public.customer_subscriptions(access_status);

-- ============================================================
-- 3. Batched Retention RPC Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.hashibot_cleanup_noncritical(
  p_execute boolean DEFAULT false,
  p_archive boolean DEFAULT true,
  p_batch_size integer DEFAULT 5000
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  policy record;
  cutoff timestamptz;
  matched integer;
  archived integer := 0;
  deleted integer := 0;
  target jsonb;
  targets jsonb := '[]'::jsonb;
  totals_matched integer := 0;
  totals_archived integer := 0;
  totals_deleted integer := 0;
  v_timestamp_col text;
  v_col_exists integer;
  
  -- Batch tracking variables
  v_batch_table_cleaned text := NULL;
  v_batch_cutoff_used timestamptz := NULL;
  v_batch_limited boolean := false;
  v_remaining_expired integer := 0;
  v_next_action text := 'No cleanup required';
  v_batch_processed boolean := false;
BEGIN
  -- Cleanup execute must remain protected. Report/dry-run can be loaded by any authenticated user.
  IF p_execute AND NOT public.is_admin() THEN 
    RAISE EXCEPTION 'admin only'; 
  END IF;

  FOR policy IN SELECT * FROM public.hashibot_retention_policies WHERE enabled ORDER BY table_name LOOP
    IF to_regclass('public.' || quote_ident(policy.table_name)) IS NULL THEN 
      CONTINUE; 
    END IF;
    
    v_timestamp_col := policy.timestamp_column;
    
    -- Check if specified column exists
    SELECT count(*) INTO v_col_exists
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = policy.table_name
      AND column_name = v_timestamp_col;

    IF v_col_exists = 0 THEN
      IF policy.table_name = 'candles' THEN
        v_timestamp_col := 'open_time';
      ELSE
        v_timestamp_col := 'created_at';
      END IF;
      
      SELECT count(*) INTO v_col_exists
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = policy.table_name
        AND column_name = v_timestamp_col;
        
      IF v_col_exists = 0 THEN
        target := jsonb_build_object(
          'table_name', policy.table_name, 
          'timestamp_column', policy.timestamp_column, 
          'retention_days', policy.retention_days, 
          'archive_enabled', policy.archive_enabled, 
          'enabled', policy.enabled, 
          'reason', 'Column ' || policy.timestamp_column || ' and fallback not found, skipped', 
          'rows_estimate', 0, 
          'rows_matched', 0, 
          'rows_archived', 0, 
          'rows_deleted', 0
        );
        targets := targets || jsonb_build_array(target);
        CONTINUE;
      END IF;
    END IF;

    cutoff := now() - make_interval(days => policy.retention_days);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I < $1', policy.table_name, v_timestamp_col) INTO matched USING cutoff;
    archived := 0; deleted := 0;

    IF p_execute AND matched > 0 AND NOT v_batch_processed THEN
      -- We found the first table that needs cleanup. Process it as our batch!
      v_batch_table_cleaned := policy.table_name;
      v_batch_cutoff_used := cutoff;
      
      IF p_archive AND policy.archive_enabled THEN
        -- Atomic delete and archive in one statement using CTE and limit
        EXECUTE format('
          WITH deleted AS (
            DELETE FROM public.%I WHERE ctid IN (
              SELECT ctid FROM public.%I WHERE %I < $1 LIMIT $2
            )
            RETURNING *
          )
          INSERT INTO public.hashibot_retention_archive(source_table, source_pk, cutoff_at, payload)
          SELECT %L, (to_jsonb(t)->>''id''), $1, to_jsonb(t) FROM deleted t
        ', policy.table_name, policy.table_name, v_timestamp_col, policy.table_name)
        USING cutoff, p_batch_size;
        GET DIAGNOSTICS deleted = ROW_COUNT;
        archived := deleted; -- Chained CTE archives exactly what was deleted
      ELSE
        -- Delete only with limit
        EXECUTE format('
          DELETE FROM public.%I WHERE ctid IN (
            SELECT ctid FROM public.%I WHERE %I < $1 LIMIT $2
          )
        ', policy.table_name, policy.table_name, v_timestamp_col)
        USING cutoff, p_batch_size;
        GET DIAGNOSTICS deleted = ROW_COUNT;
      END IF;
      
      -- Recalculate remaining expired rows for this table
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I < $1', policy.table_name, v_timestamp_col) INTO v_remaining_expired USING cutoff;
      matched := v_remaining_expired;
      
      v_batch_limited := (deleted >= p_batch_size);
      v_batch_processed := true;
      
      IF v_batch_limited THEN
        v_next_action := 'Table ' || policy.table_name || ' still has expired rows. Run another batch cleanup.';
      ELSE
        v_next_action := 'Table ' || policy.table_name || ' is fully cleaned. Next run will clean other tables.';
      END IF;
    END IF;

    totals_matched := totals_matched + matched;
    totals_archived := totals_archived + archived;
    totals_deleted := totals_deleted + deleted;
    
    target := jsonb_build_object(
      'table_name', policy.table_name,
      'timestamp_column', v_timestamp_col,
      'retention_days', policy.retention_days,
      'archive_enabled', policy.archive_enabled,
      'enabled', policy.enabled,
      'reason', policy.reason,
      'cutoff_at', cutoff,
      'rows_estimate', matched,
      'rows_matched', matched,
      'rows_archived', archived,
      'rows_deleted', deleted
    );
    targets := targets || jsonb_build_array(target);
  END LOOP;

  -- If we processed a batch, recommend next action or mark done
  IF p_execute AND NOT v_batch_processed THEN
    v_next_action := 'No expired rows remaining across any tables.';
  END IF;

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_execute THEN 'execute' ELSE 'dry_run' END,
    'generated_at', now(),
    'archive', p_archive,
    'targets', targets,
    'totals', jsonb_build_object('matched', totals_matched, 'archived', totals_archived, 'deleted', totals_deleted),
    'batch_result', CASE WHEN p_execute THEN jsonb_build_object(
      'table_name', v_batch_table_cleaned,
      'expired_before', v_batch_cutoff_used,
      'archived_count', totals_archived,
      'deleted_count', totals_deleted,
      'remaining_expired', v_remaining_expired,
      'batch_limited', v_batch_limited,
      'next_recommended_action', v_next_action
    ) ELSE NULL END
  );
END $$;
