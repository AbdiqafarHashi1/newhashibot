-- ============================================================
-- 086: Bybit Prop Trading Framework
-- Tables: bybit_prop_accounts, prop_daily_sessions
-- Prop mode is ADDITIVE — does NOT touch Binance execution
-- ============================================================

-- ── bybit_prop_accounts ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bybit_prop_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Identity
  label                     text NOT NULL,                             -- e.g. "FTMO $100K Challenge"
  firm_name                 text NOT NULL DEFAULT 'bybit_prop',        -- ftmo, myfundedfx, topstep, bybit_prop, other
  account_type              text NOT NULL DEFAULT 'challenge'          -- challenge | funded | evaluation
    CHECK (account_type IN ('challenge', 'funded', 'evaluation')),
  status                    text NOT NULL DEFAULT 'active'             -- active | passed | failed | paused | pending
    CHECK (status IN ('active', 'passed', 'failed', 'paused', 'pending')),

  -- Capital
  account_size_usd          numeric(14,2) NOT NULL DEFAULT 10000,
  current_balance_usd       numeric(14,4),
  peak_balance_usd          numeric(14,4),
  starting_balance_usd      numeric(14,4),
  unrealized_pnl_usd        numeric(14,4) DEFAULT 0,

  -- Challenge / funded rules
  profit_target_pct         numeric(6,4) DEFAULT 0.10,                 -- 10% to pass challenge
  max_daily_loss_pct        numeric(6,4) DEFAULT 0.05,                 -- 5% daily loss limit
  max_total_drawdown_pct    numeric(6,4) DEFAULT 0.10,                 -- 10% max DD
  trailing_drawdown_pct     numeric(6,4),                              -- null = not trailing
  trailing_drawdown_from    text DEFAULT 'peak'                        -- peak | starting_balance
    CHECK (trailing_drawdown_from IN ('peak', 'starting_balance')),
  min_trading_days          integer DEFAULT 0,                         -- minimum days required
  max_leverage              integer DEFAULT 10,
  max_open_positions        integer DEFAULT 5,
  allowed_symbols           text[],                                    -- null = all symbols allowed
  news_trading_allowed      boolean NOT NULL DEFAULT true,
  weekend_holding_allowed   boolean NOT NULL DEFAULT true,

  -- Governor state
  governor_state            text NOT NULL DEFAULT 'normal'
    CHECK (governor_state IN ('normal', 'defensive', 'paused', 'locked')),
  prop_readiness_score      integer DEFAULT 100,                       -- 0-100
  prop_readiness_tier       text DEFAULT 'green'
    CHECK (prop_readiness_tier IN ('green', 'yellow', 'red')),

  -- Progress
  trading_days_completed    integer NOT NULL DEFAULT 0,
  challenge_passed_at       timestamptz,
  failed_at                 timestamptz,
  failure_reason            text,

  -- Metadata
  notes                     text,
  bybit_account_uid         text,                                      -- real Bybit account ID if known
  is_archived               boolean NOT NULL DEFAULT false
);

ALTER TABLE public.bybit_prop_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_bybit_prop_accounts" ON public.bybit_prop_accounts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── prop_daily_sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prop_daily_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES public.bybit_prop_accounts(id) ON DELETE CASCADE,
  session_date              date NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Balance snapshot at session open
  opening_balance_usd       numeric(14,4) NOT NULL DEFAULT 0,
  daily_loss_limit_usd      numeric(14,4) NOT NULL DEFAULT 0,        -- derived at open
  daily_profit_target_usd   numeric(14,4),

  -- Running P&L
  realized_pnl_usd          numeric(14,4) NOT NULL DEFAULT 0,
  unrealized_pnl_usd        numeric(14,4) NOT NULL DEFAULT 0,
  total_pnl_usd             numeric(14,4) GENERATED ALWAYS AS (realized_pnl_usd + unrealized_pnl_usd) STORED,

  -- Trade counters
  trades_taken              integer NOT NULL DEFAULT 0,
  trades_won                integer NOT NULL DEFAULT 0,
  trades_lost               integer NOT NULL DEFAULT 0,
  win_rate                  numeric(5,4) GENERATED ALWAYS AS (
    CASE WHEN trades_taken > 0 THEN trades_won::numeric / trades_taken ELSE 0 END
  ) STORED,

  -- Session state
  daily_limit_breached      boolean NOT NULL DEFAULT false,
  session_locked            boolean NOT NULL DEFAULT false,           -- no more trades today
  lock_reason               text,
  session_closed            boolean NOT NULL DEFAULT false,

  UNIQUE(account_id, session_date)
);

ALTER TABLE public.prop_daily_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_prop_daily_sessions" ON public.prop_daily_sessions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── prop_trade_log ────────────────────────────────────────────
-- Lightweight log of every prop trade decision
CREATE TABLE IF NOT EXISTS public.prop_trade_log (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES public.bybit_prop_accounts(id) ON DELETE CASCADE,
  session_id                uuid REFERENCES public.prop_daily_sessions(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),

  symbol                    text NOT NULL,
  direction                 text NOT NULL CHECK (direction IN ('long', 'short')),
  decision                  text NOT NULL CHECK (decision IN ('approved', 'blocked', 'reduced', 'wait')),
  block_reason              text,

  -- Signal quality that won the competition
  opportunity_score         integer,
  signal_tier               text,
  mode                      text DEFAULT 'standard'                   -- standard | scalp_1pct
    CHECK (mode IN ('standard', 'scalp_1pct')),

  -- Sizing
  requested_size_usd        numeric(14,4),
  approved_size_usd         numeric(14,4),
  risk_pct                  numeric(6,4),

  -- Outcome (backfilled on close)
  outcome                   text CHECK (outcome IN ('win', 'loss', 'breakeven', NULL)),
  pnl_usd                   numeric(14,4),
  exit_reason               text
);

ALTER TABLE public.prop_trade_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_prop_trade_log" ON public.prop_trade_log
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bybit_prop_accounts_status ON public.bybit_prop_accounts(status);
CREATE INDEX IF NOT EXISTS idx_prop_daily_sessions_account_date ON public.prop_daily_sessions(account_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_prop_trade_log_account ON public.prop_trade_log(account_id, created_at DESC);

-- ── updated_at triggers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS bybit_prop_accounts_updated_at ON public.bybit_prop_accounts;
CREATE TRIGGER bybit_prop_accounts_updated_at
  BEFORE UPDATE ON public.bybit_prop_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS prop_daily_sessions_updated_at ON public.prop_daily_sessions;
CREATE TRIGGER prop_daily_sessions_updated_at
  BEFORE UPDATE ON public.prop_daily_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Helper RPC: upsert today's session ───────────────────────
CREATE OR REPLACE FUNCTION public.upsert_prop_daily_session(
  p_account_id uuid,
  p_opening_balance numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_account record;
  v_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT * INTO v_account FROM public.bybit_prop_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;

  v_balance := COALESCE(p_opening_balance, v_account.current_balance_usd, v_account.account_size_usd);

  INSERT INTO public.prop_daily_sessions (
    account_id, session_date, opening_balance_usd,
    daily_loss_limit_usd, daily_profit_target_usd
  )
  VALUES (
    p_account_id,
    CURRENT_DATE,
    v_balance,
    ROUND(v_balance * v_account.max_daily_loss_pct, 4),
    ROUND(v_balance * v_account.profit_target_pct * 0.1, 4)  -- daily target = 10% of overall target
  )
  ON CONFLICT (account_id, session_date) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.prop_daily_sessions
    WHERE account_id = p_account_id AND session_date = CURRENT_DATE;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_prop_daily_session(uuid, numeric) FROM anon, authenticated;
