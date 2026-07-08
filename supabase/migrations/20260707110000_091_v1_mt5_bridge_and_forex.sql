-- Additive migration for HashiBot Phase 5 - Forex & MT5/HashiBridge
-- Provisions the underlying tables and contracts for MT5 execution and risk guards

-- 1. Bridge Registry
CREATE TABLE IF NOT EXISTS public.mt5_bridge_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bridge_id TEXT UNIQUE NOT NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_heartbeat_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'registered', -- 'registered', 'online', 'offline'
    ip_address TEXT,
    connection_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and permissions on Bridge Registry
ALTER TABLE public.mt5_bridge_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for owner or admin" ON public.mt5_bridge_registry
    FOR SELECT USING (auth.uid() = owner_id OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Allow updates for owner or admin" ON public.mt5_bridge_registry
    FOR ALL USING (auth.uid() = owner_id OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- 2. MT5 Account Profiles (Personal or Prop Modes)
CREATE TABLE IF NOT EXISTS public.mt5_account_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_number TEXT NOT NULL UNIQUE,
    broker TEXT NOT NULL,
    profile_mode TEXT NOT NULL DEFAULT 'personal', -- 'personal', 'prop'
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    risk_preset TEXT NOT NULL DEFAULT 'Conservative', -- 'Conservative', 'Balanced', 'Aggressive', 'Prop Safe'
    drawdown_limit_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    max_daily_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    last_breach_at TIMESTAMPTZ,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    account_state JSONB NOT NULL DEFAULT '{"balance": 0, "equity": 0, "margin": 0, "unrealized_pnl": 0}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and permissions on Account Profiles
ALTER TABLE public.mt5_account_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read own profiles" ON public.mt5_account_profiles
    FOR SELECT USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Allow all own profile management" ON public.mt5_account_profiles
    FOR ALL USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- 3. MT5 Commands Queue (Claim/Ack Pattern)
CREATE TABLE IF NOT EXISTS public.mt5_commands_queue (
    id BIGSERIAL PRIMARY KEY,
    command_type TEXT NOT NULL, -- 'place_entry', 'cancel_entry', 'close_position', 'sync_account'
    symbol TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'claimed', 'ack', 'failed'
    bridge_id TEXT REFERENCES public.mt5_bridge_registry(bridge_id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    ack_at TIMESTAMPTZ,
    error_message TEXT,
    result_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and permissions on Commands Queue
ALTER TABLE public.mt5_commands_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on commands queue" ON public.mt5_commands_queue
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Allow insert for admin" ON public.mt5_commands_queue
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Allow modify for admin" ON public.mt5_commands_queue
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mt5_commands_status_bridge ON public.mt5_commands_queue(status, bridge_id);
CREATE INDEX IF NOT EXISTS idx_mt5_profiles_user ON public.mt5_account_profiles(user_id);
