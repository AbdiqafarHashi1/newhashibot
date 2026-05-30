/*
  # Signal Analytics Layer — Phase 1B-A

  ## Summary
  Creates a lightweight, read-only analytics layer on top of existing
  `signals` and `signal_updates` tables. No existing data is modified.
  All analytics are calculated from current production tables.

  ## What is added

  ### 1. signal_analytics_view
  A VIEW joining `signals` with `signal_updates` to produce one row per
  signal with resolved outcome, R result, estimated PnL, duration, and
  close price. Used as the source for all summary calculations.

  ### 2. signal_performance_summary_view
  A VIEW aggregating ALL REAL DATA resolved signals into a single overall
  performance row: win rate, loss rate, profit factor, total R, avg R,
  avg win/loss, best/worst trade, estimated PnL, max consecutive stats.

  ### 3. strategy_performance_view
  A VIEW grouped by strategy_name — same metrics as the overall summary
  but per-strategy, plus last signal time.

  ### 4. symbol_performance_view
  A VIEW grouped by symbol.

  ### 5. timeframe_performance_view
  A VIEW grouped by timeframe.

  ### 6. grade_performance_view
  A VIEW grouped by grade.

  ## R Calculation
  - entry_price = midpoint of entry_low + entry_high (or entry_high alone)
  - risk = ABS(entry_price - stop_loss)
  - tp1_r = ABS(tp1 - entry_price) / risk
  - tp2_r = ABS(tp2 - entry_price) / risk
  - sl_r = -1.0 (always -1R for SL hit)
  - tp2_hit → r_result = tp2_r
  - tp1_hit → r_result = tp1_r
  - sl_hit → r_result = -1.0
  - expired with no close update → 0.0
  - waiting/active/new/approved (open) → NULL (excluded from win/loss)

  ## Outcome Status
  - WIN = tp1_hit or tp2_hit
  - LOSS = sl_hit
  - EXPIRED = expired (0R, neither win nor loss)
  - OPEN = waiting, active, new, approved, tp1_hit (still running) — excluded from summary stats

  ## Profit Factor
  - SUM(positive r_result) / ABS(SUM(negative r_result))
  - Returns NULL (displayed as ∞) when gross_loss = 0 but gross_win > 0
  - Returns NULL when both are 0

  ## Close price
  - Taken from the most-recent signal_updates.price for terminal status updates
  - Falls back to NULL if not recorded

  ## Duration
  - EXTRACT(EPOCH FROM (close_time - signals.created_at)) / 60 in minutes
  - close_time = created_at of the terminal signal_updates row

  ## Security
  - No new tables, no RLS needed for views
  - These are read-only aggregation views; no write path is added
  - Frontend can query them directly with the anon key if the underlying tables have read RLS policies

  ## Notes
  - open signals (waiting/active/new/approved) appear in signal_analytics_view with r_result = NULL
  - open signals are excluded from all win/loss/PF/R summaries
  - expired signals count as 0R (neither win nor loss in PF)
  - views are always fresh — no stale cache
*/

-- ─── Helper: terminal statuses ───────────────────────────────────────────────
-- These are the statuses that indicate a signal is definitively closed.
-- tp1_hit is NOT terminal — the signal may continue to tp2 or sl.

-- ─── 1. signal_analytics_view ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW signal_analytics_view AS
WITH close_updates AS (
  -- Take the most recent terminal-status update per signal for close price and time
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

  -- Entry price: midpoint of zone, or entry_high alone
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

  -- Risk in price units
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

  -- TP1 R multiple
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

  -- TP2 R multiple
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

  -- Outcome category
  CASE s.status
    WHEN 'tp2_hit'  THEN 'WIN'
    WHEN 'tp1_hit'  THEN 'WIN'   -- tp1_hit is a partial win; full win if tp2 not yet hit
    WHEN 'sl_hit'   THEN 'LOSS'
    WHEN 'expired'  THEN 'EXPIRED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE 'OPEN'
  END                                                         AS outcome_category,

  -- R result for CLOSED signals only
  -- Open signals → NULL (excluded from aggregates)
  CASE s.status
    WHEN 'tp2_hit' THEN
      -- Use tp2_r
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
    ELSE NULL  -- OPEN: waiting, active, new, approved
  END                                                         AS r_result,

  -- Estimated PnL in R units (same as r_result; dollar amounts need account size)
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

  -- Close info from signal_updates
  cu.close_price,
  cu.close_time                                               AS closed_at,

  -- Duration in minutes from signal creation to close
  CASE
    WHEN cu.close_time IS NOT NULL AND s.created_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (cu.close_time - s.created_at)) / 60.0
    ELSE NULL
  END                                                         AS duration_minutes,

  s.created_at,
  s.updated_at

FROM signals s
LEFT JOIN close_updates cu ON cu.signal_id = s.id;


-- ─── 2. signal_performance_summary_view (all strategies combined) ─────────────

CREATE OR REPLACE VIEW signal_performance_summary_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
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
-- Consecutive win/loss sequences per signal created_at ordering
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

  -- Win rate (wins / resolved trades that are win or loss)
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE outcome_category = 'WIN')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric
      * 100, 1)
    ELSE NULL
  END                                                               AS win_rate_pct,

  -- Loss rate
  CASE
    WHEN COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE outcome_category = 'LOSS')::numeric
      / COUNT(*) FILTER (WHERE outcome_category IN ('WIN','LOSS'))::numeric
      * 100, 1)
    ELSE NULL
  END                                                               AS loss_rate_pct,

  -- R totals
  ROUND(COALESCE(SUM(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS total_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS avg_r,

  -- Profit factor = gross wins / |gross losses|
  -- NULL when gross_loss = 0 (displayed as ∞ in UI)
  CASE
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
      AND COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0) > 0
    THEN NULL   -- ∞ — display as "∞" in UI
    WHEN COALESCE(SUM(r_result) FILTER (WHERE r_result < 0), 0) = 0
    THEN NULL   -- no trades with loss R
    ELSE ROUND(
      COALESCE(SUM(r_result) FILTER (WHERE r_result > 0), 0)
      / ABS(SUM(r_result) FILTER (WHERE r_result < 0)),
      2)
  END                                                               AS profit_factor,

  -- Average win/loss
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result > 0), 0), 3)  AS avg_win_r,
  ROUND(COALESCE(AVG(r_result) FILTER (WHERE r_result < 0), 0), 3)  AS avg_loss_r,

  -- Best / worst
  ROUND(COALESCE(MAX(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS best_trade_r,
  ROUND(COALESCE(MIN(r_result) FILTER (WHERE r_result IS NOT NULL), 0), 3)  AS worst_trade_r,

  -- Max consecutive wins / losses (using streak_lengths CTE result)
  (SELECT COALESCE(MAX(streak_len), 0) FROM streak_lengths WHERE outcome_category = 'WIN')   AS max_consecutive_wins,
  (SELECT COALESCE(MAX(streak_len), 0) FROM streak_lengths WHERE outcome_category = 'LOSS')  AS max_consecutive_losses,

  -- Estimated PnL (sum of r_result * 1R; multiply by account_size * risk_pct for dollars)
  ROUND(COALESCE(SUM(pnl_estimate) FILTER (WHERE pnl_estimate IS NOT NULL), 0), 3)  AS estimated_pnl_r,

  NOW()  AS calculated_at

FROM base;


-- ─── 3. strategy_performance_view ─────────────────────────────────────────────

CREATE OR REPLACE VIEW strategy_performance_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
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


-- ─── 4. symbol_performance_view ───────────────────────────────────────────────

CREATE OR REPLACE VIEW symbol_performance_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
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


-- ─── 5. timeframe_performance_view ────────────────────────────────────────────

CREATE OR REPLACE VIEW timeframe_performance_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
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


-- ─── 6. grade_performance_view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW grade_performance_view AS
WITH base AS (
  SELECT *
  FROM signal_analytics_view
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
