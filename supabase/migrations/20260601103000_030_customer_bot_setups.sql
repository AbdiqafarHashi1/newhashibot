/*
  C8B customer Bot setup flow data model.
  UI/setup-data only. No execution, broker, exchange, scanner, strategy, provider,
  Telegram delivery, outcome tracking, or performance logic changes.
*/

CREATE TABLE IF NOT EXISTS public.customer_bot_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_slug text NOT NULL CHECK (package_slug IN ('crypto_personal_bot','forex_mt5_personal_bot','forex_mt5_prop_bot')),
  subscription_id uuid REFERENCES public.customer_subscriptions(id) ON DELETE SET NULL,
  access_request_id uuid REFERENCES public.access_requests(id) ON DELETE SET NULL,
  bot_type text NOT NULL CHECK (bot_type IN ('crypto_personal','forex_mt5_personal','forex_mt5_prop')),
  capital_mode text NOT NULL CHECK (capital_mode IN ('personal','prop')),
  setup_status text NOT NULL DEFAULT 'not_configured'
    CHECK (setup_status IN ('not_configured','setup_requested','pending_admin_setup','configured','paused','running','disabled')),
  risk_preset text NOT NULL DEFAULT 'Conservative',
  account_size numeric,
  account_currency text NOT NULL DEFAULT 'USD',
  platform text NOT NULL DEFAULT '',
  broker_name text NOT NULL DEFAULT '',
  exchange_name text NOT NULL DEFAULT '',
  prop_firm_name text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT '',
  preferred_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_risk_per_trade_pct numeric,
  max_daily_loss_pct numeric,
  drawdown_limit_pct numeric,
  min_trading_days integer,
  leverage_profile text NOT NULL DEFAULT '',
  customer_notes text NOT NULL DEFAULT '',
  admin_notes text NOT NULL DEFAULT '',
  acknowledged_no_execution boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT customer_bot_setups_user_package_unique UNIQUE (user_id, package_slug),
  CONSTRAINT customer_bot_setups_no_aggressive_prop CHECK (capital_mode <> 'prop' OR risk_preset <> 'Aggressive')
);

CREATE INDEX IF NOT EXISTS idx_customer_bot_setups_user_id ON public.customer_bot_setups(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_bot_setups_access_request_id ON public.customer_bot_setups(access_request_id);
CREATE INDEX IF NOT EXISTS idx_customer_bot_setups_subscription_id ON public.customer_bot_setups(subscription_id);
CREATE INDEX IF NOT EXISTS idx_customer_bot_setups_status ON public.customer_bot_setups(setup_status);

ALTER TABLE public.customer_bot_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bot setups"
  ON public.customer_bot_setups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bot setups"
  ON public.customer_bot_setups FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND setup_status IN ('not_configured','setup_requested','pending_admin_setup')
    AND admin_notes = ''
    AND setup_status <> 'running'
    AND (capital_mode <> 'prop' OR risk_preset <> 'Aggressive')
  );

CREATE POLICY "Users can update own unlocked bot setups"
  ON public.customer_bot_setups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND setup_status IN ('not_configured','setup_requested','pending_admin_setup'))
  WITH CHECK (
    auth.uid() = user_id
    AND setup_status IN ('setup_requested','pending_admin_setup')
    AND admin_notes = ''
    AND (capital_mode <> 'prop' OR risk_preset <> 'Aggressive')
  );

CREATE POLICY "Admins can read all bot setups"
  ON public.customer_bot_setups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all bot setups"
  ON public.customer_bot_setups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
