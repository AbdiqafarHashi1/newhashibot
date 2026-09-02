-- ============================================================================
-- HashiBot Production Backend Overhaul
-- Migration: 20260824090000_101_non_blocking_risk_mutex_and_atomic_pretrade.sql
-- Modules 1 & 3: Non-Blocking Risk Mutex, Segregated Schemas & Single-Pass Stored Procedure
-- ============================================================================

-- 1. Segregated Account Registry with Strict Operational Profiles
CREATE TABLE IF NOT EXISTS public.trading_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    provider TEXT NOT NULL CHECK (provider IN ('BINANCE_FUTURES', 'BYBIT_V5', 'MT5_PERSONAL', 'MT5_PROP')),
    account_profile TEXT NOT NULL CHECK (account_profile IN ('STRICT_PROP_GUARDRAIL', 'AGGRESSIVE_PERSONAL')),
    broker_account_number TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    initial_balance NUMERIC(18, 4) NOT NULL DEFAULT 10000.0000 CHECK (initial_balance > 0),
    current_balance NUMERIC(18, 4) NOT NULL DEFAULT 10000.0000 CHECK (current_balance >= 0),
    floating_equity NUMERIC(18, 4) NOT NULL DEFAULT 10000.0000 CHECK (floating_equity >= 0),
    allocated_margin NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_margin >= 0),
    max_margin_pool NUMERIC(18, 4) NOT NULL DEFAULT 80000.0000 CHECK (max_margin_pool > 0),
    max_portfolio_var NUMERIC(18, 4) NOT NULL DEFAULT 25000.0000 CHECK (max_portfolio_var > 0),
    max_daily_drawdown_pct NUMERIC(5, 2) NOT NULL DEFAULT 4.50,
    daily_starting_equity NUMERIC(18, 4) NOT NULL DEFAULT 10000.0000 CHECK (daily_starting_equity > 0),
    is_halted BOOLEAN NOT NULL DEFAULT FALSE,
    halt_reason TEXT,
    last_equity_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_allocated_margin_pool CHECK (allocated_margin <= max_margin_pool)
);

-- 2. Symbol Concentration & VaR Allocation Ledger
CREATE TABLE IF NOT EXISTS public.account_asset_allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.trading_accounts(account_id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    current_notional NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    current_var NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    max_symbol_concentration_pct NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_symbol UNIQUE (account_id, symbol)
);

-- 3. Atomic Order Intent & Pre-Trade Lock Reservations
CREATE TABLE IF NOT EXISTS public.order_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    account_id UUID NOT NULL REFERENCES public.trading_accounts(account_id) ON DELETE CASCADE,
    strategy_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    size NUMERIC(18, 6) NOT NULL,
    reserved_margin NUMERIC(18, 4) NOT NULL,
    calculated_risk_var NUMERIC(18, 4) NOT NULL,
    status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED', 'UNCONFIRMED_PENDING', 'TIMED_OUT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 seconds')
);

-- 4. High-Performance Partial & Filtered Indexes (Zero Contention)
CREATE INDEX IF NOT EXISTS idx_trading_accounts_profile_active 
    ON public.trading_accounts (account_id, provider, account_profile) 
    WHERE is_halted IS FALSE;

CREATE INDEX IF NOT EXISTS idx_order_reservations_active_lookup 
    ON public.order_reservations (account_id, status) 
    WHERE status IN ('RESERVED', 'UNCONFIRMED_PENDING');

CREATE INDEX IF NOT EXISTS idx_order_reservations_order_id
    ON public.order_reservations (order_id);

CREATE INDEX IF NOT EXISTS idx_asset_allocations_acc_sym 
    ON public.account_asset_allocations (account_id, symbol);

-- 5. Row Level Security Policies
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_asset_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reservations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_trading_accounts_isolation') THEN
        CREATE POLICY policy_trading_accounts_isolation ON public.trading_accounts
            FOR ALL TO authenticated
            USING (user_id IS NULL OR user_id = auth.uid())
            WITH CHECK (user_id IS NULL OR user_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_order_reservations_isolation') THEN
        CREATE POLICY policy_order_reservations_isolation ON public.order_reservations
            FOR ALL TO authenticated
            USING (account_id IN (SELECT account_id FROM public.trading_accounts WHERE user_id IS NULL OR user_id = auth.uid()))
            WITH CHECK (account_id IN (SELECT account_id FROM public.trading_accounts WHERE user_id IS NULL OR user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_account_asset_allocations_isolation') THEN
        CREATE POLICY policy_account_asset_allocations_isolation ON public.account_asset_allocations
            FOR ALL TO authenticated
            USING (account_id IN (SELECT account_id FROM public.trading_accounts WHERE user_id IS NULL OR user_id = auth.uid()))
            WITH CHECK (account_id IN (SELECT account_id FROM public.trading_accounts WHERE user_id IS NULL OR user_id = auth.uid()));
    END IF;
END $$;

-- ============================================================================
-- Single-Pass Atomic Pre-Trade Stored Procedure (< 5ms Single Round-Trip)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_evaluate_and_reserve_pretrade_risk(
    p_order_id TEXT,
    p_account_id UUID,
    p_strategy_id TEXT,
    p_provider TEXT,
    p_symbol TEXT,
    p_side TEXT,
    p_size NUMERIC,
    p_entry_price NUMERIC,
    p_stop_loss_price NUMERIC,
    p_garman_klass_vol NUMERIC
)
RETURNS TABLE (
    approved BOOLEAN,
    rejection_code TEXT,
    reserved_margin NUMERIC,
    allocated_var NUMERIC,
    account_floating_equity NUMERIC,
    execution_duration_us BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_account RECORD;
    v_asset RECORD;
    v_notional NUMERIC;
    v_sl_dist NUMERIC;
    v_base_risk NUMERIC;
    v_calculated_var NUMERIC;
    v_required_margin NUMERIC;
    v_max_risk_cap NUMERIC;
    v_max_asset_cap NUMERIC;
    v_current_asset_notional NUMERIC := 0.0000;
BEGIN
    -- 1. Non-Blocking Account Row Lock with SKIP LOCKED
    SELECT 
        account_id, account_profile, current_balance, floating_equity,
        allocated_margin, max_margin_pool, max_portfolio_var,
        daily_starting_equity, max_daily_drawdown_pct, is_halted
    INTO v_account
    FROM public.trading_accounts
    WHERE account_id = p_account_id
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            FALSE, 'ACCOUNT_MUTEX_LOCKED_OR_INVALID'::TEXT, 0.0000::NUMERIC, 0.0000::NUMERIC, 0.0000::NUMERIC,
            (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
        RETURN;
    END IF;

    IF v_account.is_halted THEN
        RETURN QUERY SELECT 
            FALSE, 'ACCOUNT_EXECUTION_HALTED'::TEXT, 0.0000::NUMERIC, 0.0000::NUMERIC, v_account.floating_equity,
            (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
        RETURN;
    END IF;

    -- 2. Core Quantitative Math
    v_notional := p_size * p_entry_price;
    v_sl_dist := ABS(p_entry_price - p_stop_loss_price);
    v_base_risk := v_sl_dist * p_size;
    v_calculated_var := v_base_risk * (1.0 + (COALESCE(p_garman_klass_vol, 0.0001) * 10.0));

    -- 3. Dynamic Profile-Specific Rule Constraints
    IF v_account.account_profile = 'STRICT_PROP_GUARDRAIL' THEN
        -- 1.50% Maximum Risk Cap on Floating Equity
        v_max_risk_cap := v_account.floating_equity * 0.015;
        IF v_calculated_var > v_max_risk_cap THEN
            RETURN QUERY SELECT 
                FALSE, ('PROP_RISK_EXCEEDED_MAX_' || ROUND(v_max_risk_cap, 2)::TEXT)::TEXT, 0.0000::NUMERIC, v_calculated_var, v_account.floating_equity,
                (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
            RETURN;
        END IF;
        -- Enforce Quarter-Kelly 10x Margin Baseline (10% collateral)
        v_required_margin := v_notional * 0.10;
    ELSE
        -- Aggressive Personal: 8.0% Risk Cap (5% collateral / 20x leverage)
        v_max_risk_cap := v_account.floating_equity * 0.080;
        IF v_calculated_var > v_max_risk_cap THEN
            RETURN QUERY SELECT 
                FALSE, ('PERSONAL_RISK_EXCEEDED_MAX_' || ROUND(v_max_risk_cap, 2)::TEXT)::TEXT, 0.0000::NUMERIC, v_calculated_var, v_account.floating_equity,
                (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
            RETURN;
        END IF;
        v_required_margin := v_notional * 0.05;
    END IF;

    -- 4. Global Pool Capacity Check
    IF (v_account.allocated_margin + v_required_margin) > v_account.max_margin_pool THEN
        RETURN QUERY SELECT 
            FALSE, 'GLOBAL_MARGIN_POOL_EXHAUSTED'::TEXT, 0.0000::NUMERIC, v_calculated_var, v_account.floating_equity,
            (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
        RETURN;
    END IF;

    -- 5. Asset Concentration Validation
    SELECT current_notional, max_symbol_concentration_pct
    INTO v_asset
    FROM public.account_asset_allocations
    WHERE account_id = p_account_id AND symbol = p_symbol
    FOR UPDATE;

    IF FOUND THEN
        v_current_asset_notional := v_asset.current_notional;
        v_max_asset_cap := v_account.floating_equity * (v_asset.max_symbol_concentration_pct / 100.0);
    ELSE
        v_max_asset_cap := v_account.floating_equity * 0.25; -- Default 25% Concentration Cap
    END IF;

    IF (v_current_asset_notional + v_notional) > v_max_asset_cap THEN
        RETURN QUERY SELECT 
            FALSE, 'ASSET_CONCENTRATION_EXCEEDED'::TEXT, 0.0000::NUMERIC, v_calculated_var, v_account.floating_equity,
            (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
        RETURN;
    END IF;

    -- 6. Atomic Write Mutation
    INSERT INTO public.order_reservations (
        order_id, account_id, strategy_id, symbol, side, size,
        reserved_margin, calculated_risk_var, status
    ) VALUES (
        p_order_id, p_account_id, p_strategy_id, p_symbol, p_side, p_size,
        v_required_margin, v_calculated_var, 'RESERVED'
    );

    UPDATE public.trading_accounts
    SET allocated_margin = allocated_margin + v_required_margin,
        updated_at = NOW()
    WHERE account_id = p_account_id;

    INSERT INTO public.account_asset_allocations (
        account_id, symbol, current_notional, current_var, updated_at
    ) VALUES (
        p_account_id, p_symbol, v_notional, v_calculated_var, NOW()
    )
    ON CONFLICT (account_id, symbol)
    DO UPDATE SET
        current_notional = public.account_asset_allocations.current_notional + EXCLUDED.current_notional,
        current_var = public.account_asset_allocations.current_var + EXCLUDED.current_var,
        updated_at = NOW();

    -- Return Approved Ticket
    RETURN QUERY SELECT 
        TRUE, 'APPROVED'::TEXT, v_required_margin, v_calculated_var, v_account.floating_equity,
        (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000000)::BIGINT;
END;
$$;
