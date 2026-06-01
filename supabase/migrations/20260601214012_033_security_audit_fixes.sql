/*
  # Security Audit Fixes — Migration 033

  ## Summary
  Resolves 13 Supabase Security Advisor warnings across three categories.

  ## Changes

  ### 1. Security Definer Views (6 views) — TASK A
  Recreates all six analytics views with `security_invoker = true`.
  This means queries run under the caller's privileges and honor RLS on the
  underlying `signals` and `signal_updates` tables, instead of running as the
  view owner (SECURITY DEFINER behavior).

  Views fixed:
    - public.signal_analytics_view
    - public.signal_performance_summary_view
    - public.strategy_performance_view
    - public.symbol_performance_view
    - public.timeframe_performance_view
    - public.grade_performance_view

  All output columns, names, data types, filters, and joins are preserved exactly.
  Existing SELECT grants to authenticated/anon are reapplied after recreation.

  ### 2. SECURITY DEFINER Functions — Public Execute Revoked (3 functions) — TASK B
  Functions: handle_new_user(), is_admin(), no_admin_exists()

  - handle_new_user(): Trigger function. Must remain SECURITY DEFINER so the
    auth trigger can insert into public.profiles. search_path already set.
    EXECUTE revoked from PUBLIC, anon, authenticated (trigger calls it, not users).

  - is_admin(): Used in RLS policies via policy expressions. Must remain
    SECURITY DEFINER + STABLE to avoid recursive RLS on profiles table.
    EXECUTE revoked from PUBLIC and anon. Authenticated users keep EXECUTE
    because RLS policy expressions call this function on their behalf.

  - no_admin_exists(): Used only in the admin setup page (first-admin registration
    guard). Must remain SECURITY DEFINER to read profiles without triggering
    recursive RLS. EXECUTE revoked from PUBLIC and anon. Authenticated keeps it.

  ### 3. pg_net Extension in Public Schema — TASK C (Manual Action Required)
  pg_net is currently installed in the public schema. Supabase manages this
  extension and it CANNOT be safely moved via SQL ALTER EXTENSION in a hosted
  Supabase project — attempting to do so will error or break the pg_cron/net
  integration.

  MANUAL ACTION REQUIRED:
  Go to Supabase Dashboard → Project Settings → Database → Extensions.
  Find pg_net, disable it, then re-enable it. Supabase will reinstall it in the
  extensions schema. The cron job uses net.http_post() which will continue to
  work after the move since net is the function schema prefix (unchanged).

  This migration does NOT attempt to move pg_net to avoid breaking the scanner.

  ## Security Changes
  - 6 views: SECURITY DEFINER behavior removed (security_invoker = true)
  - handle_new_user: EXECUTE revoked from PUBLIC, anon, authenticated
  - is_admin: EXECUTE revoked from PUBLIC, anon
  - no_admin_exists: EXECUTE revoked from PUBLIC, anon
  - Grants retained: authenticated SELECT on all views; anon SELECT on views
    (views only show data that passes the caller's RLS checks when invoker mode)

  ## Important Notes
  - Signup trigger (on_auth_user_created) continues to work — trigger executor
    is the postgres superuser, not PUBLIC/anon/authenticated
  - RLS policies using is_admin() continue to work — they call the function
    as the authenticated user, whose EXECUTE is retained
  - Scheduled scanner cron (net.http_post) is NOT modified
  - No tables, triggers, or other objects are dropped or renamed
*/

-- ============================================================
-- TASK A: Fix Security Definer Views
-- Drop and recreate with security_invoker = true
-- ============================================================

-- signal_analytics_view (base view — must be done first)
DROP VIEW IF EXISTS public.signal_analytics_view CASCADE;

CREATE VIEW public.signal_analytics_view
WITH (security_invoker = true)
AS
WITH close_updates AS (
  SELECT DISTINCT ON (signal_id)
    signal_id,
    new_status        AS close_status,
    price             AS close_price,
    created_at        AS close_time
  FROM signal_updates
  WHERE new_status IN ('tp2_hit', 'sl_hit', 'expired', 'tp1_hit')
  ORDER BY signal_id, created_at DESC
)
SELECT
  s.id                                                        AS signal_id,
  s.strategy_name,
  s.symbol,
  s.market_type,
  s.timeframe,
  s.direction,
  s.grade,
  s.confidence_score,
  s.data_source,
  s.mode_slug,
  s.status                                                    AS current_status,
  CASE
    WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
      THEN (s.entry_low + s.entry_high) / 2.0
    ELSE COALESCE(s.entry_high, s.entry_low)
  END                                                         AS entry_price,
  s.entry_low,
  s.entry_high,
  s.stop_loss,
  s.tp1,
  s.tp2,
  s.risk_reward,
  CASE
    WHEN s.stop_loss IS NOT NULL AND (s.entry_low IS NOT NULL OR s.entry_high IS NOT NULL)
      THEN ABS(
        CASE
          WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
          ELSE COALESCE(s.entry_high, s.entry_low)
        END
        - s.stop_loss
      )
    ELSE NULL
  END                                                         AS risk_price,
  CASE
    WHEN s.tp1 IS NOT NULL AND s.stop_loss IS NOT NULL
      AND ABS(
        CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
          THEN (s.entry_low + s.entry_high) / 2.0
          ELSE COALESCE(s.entry_high, s.entry_low) END
        - s.stop_loss) > 0
    THEN ABS(s.tp1 -
      CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
        THEN (s.entry_low + s.entry_high) / 2.0
        ELSE COALESCE(s.entry_high, s.entry_low) END)
      / ABS(
        CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
          THEN (s.entry_low + s.entry_high) / 2.0
          ELSE COALESCE(s.entry_high, s.entry_low) END
        - s.stop_loss)
    ELSE NULL
  END                                                         AS tp1_r,
  CASE
    WHEN s.tp2 IS NOT NULL AND s.stop_loss IS NOT NULL
      AND ABS(
        CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
          THEN (s.entry_low + s.entry_high) / 2.0
          ELSE COALESCE(s.entry_high, s.entry_low) END
        - s.stop_loss) > 0
    THEN ABS(s.tp2 -
      CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
        THEN (s.entry_low + s.entry_high) / 2.0
        ELSE COALESCE(s.entry_high, s.entry_low) END)
      / ABS(
        CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
          THEN (s.entry_low + s.entry_high) / 2.0
          ELSE COALESCE(s.entry_high, s.entry_low) END
        - s.stop_loss)
    ELSE NULL
  END                                                         AS tp2_r,
  CASE s.status
    WHEN 'tp2_hit'  THEN 'WIN'
    WHEN 'tp1_hit'  THEN 'WIN'
    WHEN 'sl_hit'   THEN 'LOSS'
    WHEN 'expired'  THEN 'EXPIRED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE 'OPEN'
  END                                                         AS outcome_category,
  CASE s.status
    WHEN 'tp2_hit' THEN
      CASE
        WHEN s.tp2 IS NOT NULL AND s.stop_loss IS NOT NULL
          AND ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss) > 0
        THEN ABS(s.tp2 - CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END)
          / ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss)
        ELSE COALESCE(s.risk_reward, 2.0)
      END
    WHEN 'tp1_hit' THEN
      CASE
        WHEN s.tp1 IS NOT NULL AND s.stop_loss IS NOT NULL
          AND ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss) > 0
        THEN ABS(s.tp1 - CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END)
          / ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss)
        ELSE 1.0
      END
    WHEN 'sl_hit'   THEN -1.0
    WHEN 'expired'  THEN 0.0
    WHEN 'cancelled' THEN NULL
    ELSE NULL
  END                                                         AS r_result,
  CASE s.status
    WHEN 'tp2_hit' THEN
      CASE
        WHEN s.tp2 IS NOT NULL AND s.stop_loss IS NOT NULL
          AND ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss) > 0
        THEN ABS(s.tp2 - CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END)
          / ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss)
        ELSE COALESCE(s.risk_reward, 2.0)
      END
    WHEN 'tp1_hit' THEN
      CASE
        WHEN s.tp1 IS NOT NULL AND s.stop_loss IS NOT NULL
          AND ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss) > 0
        THEN ABS(s.tp1 - CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END)
          / ABS(CASE WHEN s.entry_low IS NOT NULL AND s.entry_high IS NOT NULL
            THEN (s.entry_low + s.entry_high) / 2.0
            ELSE COALESCE(s.entry_high, s.entry_low) END - s.stop_loss)
        ELSE 1.0
      END
    WHEN 'sl_hit'   THEN -1.0
    WHEN 'expired'  THEN 0.0
    ELSE NULL
  END                                                         AS pnl_estimate,
  cu.close_price,
  cu.close_time                                               AS closed_at,
  CASE
    WHEN cu.close_time IS NOT NULL AND s.created_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (cu.close_time - s.created_at)) / 60.0
    ELSE NULL
  END                                                         AS duration_minutes,
  s.created_at,
  s.updated_at
FROM signals s
LEFT JOIN close_updates cu ON cu.signal_id = s.id;

-- signal_performance_summary_view
CREATE VIEW public.signal_performance_summary_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT *
  FROM public.signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND market_type = 'crypto'
    AND outcome_category != 'CANCELLED'
),
closed AS (
  SELECT * FROM base WHERE outcome_category != 'OPEN'
),
wins AS (
  SELECT * FROM closed WHERE outcome_category IN ('WIN')
),
losses AS (
  SELECT * FROM closed WHERE outcome_category = 'LOSS'
),
ordered AS (
  SELECT
    outcome_category,
    r_result,
    ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM closed
  WHERE outcome_category IN ('WIN', 'LOSS')
),
streaks AS (
  SELECT
    outcome_category,
    r_result,
    rn,
    rn - ROW_NUMBER() OVER (PARTITION BY outcome_category ORDER BY rn) AS grp
  FROM ordered
),
streak_lengths AS (
  SELECT outcome_category, grp, COUNT(*) AS streak_len
  FROM streaks
  GROUP BY outcome_category, grp
)
SELECT
  COUNT(*)                                                          AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN')               AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN')                 AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS')                AS losses,
  COUNT(*) FILTER (WHERE current_status = 'tp1_hit')               AS tp1_hits,
  COUNT(*) FILTER (WHERE current_status = 'tp2_hit')               AS tp2_hits,
  COUNT(*) FILTER (WHERE current_status = 'sl_hit')                AS sl_hits,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED')             AS expired,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric
      * 100, 1)
    ELSE NULL
  END                                                               AS win_rate_pct,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE outcome_category = 'LOSS')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric
      * 100, 1)
    ELSE NULL
  END                                                               AS loss_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r,
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
      AND COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0) > 0
    THEN NULL
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
    THEN NULL
    ELSE ROUND(
      COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0)
      / ABS(SUM(r_result) FILTER (WHERE r_result < 0)),
      2)
  END                                                               AS profit_factor,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result > 0), 0), 3)  AS avg_win_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result < 0), 0), 3)  AS avg_loss_r,
  ROUND(COALESCE(MAX(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS best_trade_r,
  ROUND(COALESCE(MIN(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS worst_trade_r,
  (SELECT COALESCE(MAX(streak_len), 0) FROM streak_lengths WHERE outcome_category = 'WIN')   AS max_consecutive_wins,
  (SELECT COALESCE(MAX(streak_len), 0) FROM streak_lengths WHERE outcome_category = 'LOSS')  AS max_consecutive_losses,
  ROUND(COALESCE(SUM(pnl_estimate) FILTER (WHERE pnl_estimate IS NOT NULL), 0), 3)  AS estimated_pnl_r,
  NOW()  AS calculated_at
FROM base;

-- strategy_performance_view
CREATE VIEW public.strategy_performance_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT *
  FROM public.signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND market_type = 'crypto'
    AND outcome_category != 'CANCELLED'
)
SELECT
  strategy_name,
  COUNT(*)                                                          AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN')               AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN')                 AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS')                AS losses,
  COUNT(*) FILTER (WHERE current_status = 'tp1_hit')               AS tp1_hits,
  COUNT(*) FILTER (WHERE current_status = 'tp2_hit')               AS tp2_hits,
  COUNT(*) FILTER (WHERE current_status = 'sl_hit')                AS sl_hits,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED')             AS expired,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                AS still_open,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric
      * 100, 1)
    ELSE NULL
  END                                                               AS win_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r,
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
      AND COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0) > 0
    THEN NULL
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
    THEN NULL
    ELSE ROUND(
      COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0)
      / ABS(SUM(r_result) FILTER (WHERE r_result < 0)),
      2)
  END                                                               AS profit_factor,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result > 0), 0), 3)  AS avg_win_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result < 0), 0), 3)  AS avg_loss_r,
  ROUND(COALESCE(MAX(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS best_trade_r,
  ROUND(COALESCE(MIN(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS worst_trade_r,
  ROUND(COALESCE(SUM(pnl_estimate) FILTER (WHERE pnl_estimate IS NOT NULL), 0), 3)  AS estimated_pnl_r,
  MAX(created_at)                                                   AS last_signal_time,
  NOW()                                                             AS calculated_at
FROM base
GROUP BY strategy_name
ORDER BY total_signals DESC;

-- symbol_performance_view
CREATE VIEW public.symbol_performance_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT *
  FROM public.signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND market_type = 'crypto'
    AND outcome_category != 'CANCELLED'
)
SELECT
  symbol,
  COUNT(*)                                                           AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN')                AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                 AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN')                  AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS')                 AS losses,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED')              AS expired,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL
  END                                                                AS win_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r,
  MAX(created_at)                                                    AS last_signal_time
FROM base
GROUP BY symbol
ORDER BY total_signals DESC;

-- timeframe_performance_view
CREATE VIEW public.timeframe_performance_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT *
  FROM public.signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND market_type = 'crypto'
    AND outcome_category != 'CANCELLED'
)
SELECT
  timeframe,
  COUNT(*)                                                           AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN')                AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                 AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN')                  AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS')                 AS losses,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED')              AS expired,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL
  END                                                                AS win_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r
FROM base
GROUP BY timeframe
ORDER BY timeframe;

-- grade_performance_view
CREATE VIEW public.grade_performance_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT *
  FROM public.signal_analytics_view
  WHERE data_source = 'REAL DATA'
    AND market_type = 'crypto'
    AND outcome_category != 'CANCELLED'
)
SELECT
  grade,
  COUNT(*)                                                           AS total_signals,
  COUNT(*) FILTER (WHERE outcome_category != 'OPEN')                AS closed_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'OPEN')                 AS open_trades,
  COUNT(*) FILTER (WHERE outcome_category = 'WIN')                  AS wins,
  COUNT(*) FILTER (WHERE outcome_category = 'LOSS')                 AS losses,
  COUNT(*) FILTER (WHERE outcome_category = 'EXPIRED')              AS expired,
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric * 100, 1)
    ELSE NULL
  END                                                                AS win_rate_pct,
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r,
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
      AND COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0) > 0
    THEN NULL
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
    THEN NULL
    ELSE ROUND(SUM(r_result) FILTER (WHERE r_result > 0)
      / ABS(SUM(r_result) FILTER (WHERE r_result < 0)), 2)
  END                                                                AS profit_factor
FROM base
GROUP BY grade
ORDER BY grade DESC;

-- Reapply grants on all views (SELECT only — views are read-only analytics)
GRANT SELECT ON public.signal_analytics_view         TO authenticated, anon;
GRANT SELECT ON public.signal_performance_summary_view TO authenticated, anon;
GRANT SELECT ON public.strategy_performance_view     TO authenticated, anon;
GRANT SELECT ON public.symbol_performance_view       TO authenticated, anon;
GRANT SELECT ON public.timeframe_performance_view    TO authenticated, anon;
GRANT SELECT ON public.grade_performance_view        TO authenticated, anon;

-- ============================================================
-- TASK B: Fix SECURITY DEFINER function execute exposure
-- ============================================================

-- handle_new_user: trigger function only — revoke from PUBLIC, anon, authenticated
-- The trigger executor (postgres superuser) does not need an explicit grant.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- is_admin: used in RLS policy expressions — authenticated must keep EXECUTE
-- Revoke only PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- no_admin_exists: admin setup guard — authenticated must keep EXECUTE for setup page
-- Revoke only PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.no_admin_exists() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.no_admin_exists() FROM anon;

-- ============================================================
-- TASK C: pg_net extension schema
-- Cannot be moved via SQL in hosted Supabase.
-- See migration header comment for manual dashboard action.
-- This DO block is a no-op safety check only.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'pg_net is still in the public schema. To fix this audit warning, go to Supabase Dashboard → Project Settings → Database → Extensions, disable pg_net then re-enable it. This will move it to the extensions schema. The scheduled scanner cron will continue to work unchanged after the move.';
  END IF;
END $$;
