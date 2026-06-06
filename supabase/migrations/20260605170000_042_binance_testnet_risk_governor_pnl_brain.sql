/*
  # 042 Binance testnet risk governor and PnL/equity brain

  Adds testnet-only account-state snapshots and governor controls. Auto execution
  remains opt-in and live trading remains impossible.
*/

ALTER TABLE public.execution_settings
  ADD COLUMN IF NOT EXISTS governor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS governor_state text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS daily_start_equity numeric,
  ADD COLUMN IF NOT EXISTS current_equity numeric,
  ADD COLUMN IF NOT EXISTS daily_realized_pnl numeric,
  ADD COLUMN IF NOT EXISTS daily_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS daily_pnl_pct numeric,
  ADD COLUMN IF NOT EXISTS max_daily_loss_pct numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS max_unrealized_drawdown_pct numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS aggressive_allowed_profit_pct numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS defensive_loss_pct numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS max_consecutive_failed_executions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_consecutive_closed_sl integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_governor_reason text,
  ADD COLUMN IF NOT EXISTS last_governor_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_account_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latest_account_state_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_total_margin_balance numeric,
  ADD COLUMN IF NOT EXISTS account_total_wallet_balance numeric,
  ADD COLUMN IF NOT EXISTS account_available_balance numeric,
  ADD COLUMN IF NOT EXISTS account_available_usdt numeric,
  ADD COLUMN IF NOT EXISTS account_available_usdc numeric,
  ADD COLUMN IF NOT EXISTS account_unrealized_pnl numeric,
  ADD COLUMN IF NOT EXISTS account_open_positions integer,
  ADD COLUMN IF NOT EXISTS account_margin_ratio numeric,
  ADD COLUMN IF NOT EXISTS account_open_order_count integer;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS governor_state text,
  ADD COLUMN IF NOT EXISTS governor_reason text,
  ADD COLUMN IF NOT EXISTS risk_multiplier numeric,
  ADD COLUMN IF NOT EXISTS adjusted_risk_pct numeric,
  ADD COLUMN IF NOT EXISTS adjusted_max_leverage numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_governor_state_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_governor_state_check
      CHECK (governor_state IN ('normal','defensive','aggressive_allowed','paused'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_settings_governor_thresholds_check') THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_governor_thresholds_check
      CHECK (
        max_daily_loss_pct >= 0
        AND max_unrealized_drawdown_pct >= 0
        AND aggressive_allowed_profit_pct >= 0
        AND defensive_loss_pct >= 0
        AND max_consecutive_failed_executions >= 1
        AND max_consecutive_closed_sl >= 1
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'execution_orders_governor_state_check') THEN
    ALTER TABLE public.execution_orders
      ADD CONSTRAINT execution_orders_governor_state_check
      CHECK (governor_state IS NULL OR governor_state IN ('normal','defensive','aggressive_allowed','paused'));
  END IF;
END $$;

UPDATE public.execution_settings
SET governor_enabled = COALESCE(governor_enabled, true),
    governor_state = COALESCE(governor_state, 'normal'),
    max_daily_loss_pct = COALESCE(max_daily_loss_pct, 2.0),
    max_unrealized_drawdown_pct = COALESCE(max_unrealized_drawdown_pct, 1.5),
    aggressive_allowed_profit_pct = COALESCE(aggressive_allowed_profit_pct, 1.5),
    defensive_loss_pct = COALESCE(defensive_loss_pct, 1.0),
    max_consecutive_failed_executions = COALESCE(max_consecutive_failed_executions, 3),
    max_consecutive_closed_sl = COALESCE(max_consecutive_closed_sl, 3)
WHERE id = 1;
