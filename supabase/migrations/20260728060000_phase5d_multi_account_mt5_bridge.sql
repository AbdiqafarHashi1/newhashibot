-- Phase 5D extends the active Phase 8A MT5 schema. It does not schedule cron or touch crypto providers.
ALTER TABLE public.mt5_accounts
  ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'customer' CHECK (owner_kind IN ('system','customer')),
  ADD COLUMN IF NOT EXISTS credential_capability text NOT NULL DEFAULT 'investor' CHECK (credential_capability IN ('investor','master')),
  ADD COLUMN IF NOT EXISTS credential_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS operational boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS monitor_healthy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_authenticated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_permission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_autotrading boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS account_kill_switch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS mt5_accounts_credential_ref_uidx ON public.mt5_accounts(credential_ref);
CREATE UNIQUE INDEX IF NOT EXISTS mt5_accounts_one_bridge_identity_uidx ON public.mt5_accounts(bridge_id) WHERE bridge_id IS NOT NULL;

ALTER TABLE public.mt5_account_snapshots
  ADD COLUMN IF NOT EXISTS broker text,
  ADD COLUMN IF NOT EXISTS server text,
  ADD COLUMN IF NOT EXISTS login text,
  ADD COLUMN IF NOT EXISTS account_class text,
  ADD COLUMN IF NOT EXISTS margin_level numeric,
  ADD COLUMN IF NOT EXISTS open_positions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_permission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_autotrading boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bridge_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_version text,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.mt5_commands DROP CONSTRAINT IF EXISTS mt5_commands_operation_check;
UPDATE public.mt5_commands SET operation=CASE operation
 WHEN 'place_order' THEN 'OPEN_POSITION' WHEN 'modify_position' THEN 'MODIFY_PROTECTION'
 WHEN 'close_position' THEN 'CLOSE_POSITION' WHEN 'cancel_order' THEN 'CANCEL_ORDER'
 WHEN 'sync_account' THEN 'SYNC_ACCOUNT' WHEN 'test_connection' THEN 'TEST_CONNECTION' ELSE operation END;
ALTER TABLE public.mt5_commands ADD CONSTRAINT mt5_commands_operation_check CHECK (operation IN
 ('OPEN_POSITION','MODIFY_PROTECTION','PARTIAL_CLOSE','MOVE_TO_BREAKEVEN','CLOSE_POSITION','CANCEL_ORDER','SYNC_ACCOUNT','RECOVER_PROTECTION','TEST_CONNECTION'));
ALTER TABLE public.mt5_commands DROP CONSTRAINT IF EXISTS mt5_commands_status_check;
UPDATE public.mt5_commands SET status=CASE status WHEN 'pending' THEN 'received' WHEN 'claimed' THEN 'accepted'
 WHEN 'acknowledged' THEN 'confirmed' ELSE status END;
ALTER TABLE public.mt5_commands ADD CONSTRAINT mt5_commands_status_check CHECK (status IN
 ('received','accepted','rejected','submitted','confirmed','failed','expired'));
ALTER TABLE public.mt5_commands ALTER COLUMN status SET DEFAULT 'received';
ALTER TABLE public.mt5_commands
  ADD COLUMN IF NOT EXISTS signal_id uuid,
  ADD COLUMN IF NOT EXISTS trade_id uuid,
  ADD COLUMN IF NOT EXISTS intended_policy jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.mt5_protection_truth (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.mt5_accounts(id) ON DELETE CASCADE,
 trade_id uuid NOT NULL, broker_position_id text, state text NOT NULL,
 stop_loss numeric, take_profit numeric, tp1_completed boolean NOT NULL DEFAULT false,
 breakeven_completed boolean NOT NULL DEFAULT false, reconciled_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,trade_id)
);
ALTER TABLE public.mt5_protection_truth ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt5_protection_truth_read ON public.mt5_protection_truth FOR SELECT USING
 (EXISTS (SELECT 1 FROM public.mt5_accounts a WHERE a.id=account_id AND (a.user_id=auth.uid() OR public.is_admin())));

-- Health is derived exclusively from persisted proof timestamps, never registration.
CREATE OR REPLACE FUNCTION public.mt5_health(p_heartbeat timestamptz, p_authenticated boolean)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE
 WHEN NOT p_authenticated THEN 'AUTH FAILED'
 WHEN p_heartbeat IS NULL THEN 'NOT CONFIGURED'
 WHEN p_heartbeat < now()-interval '2 minutes' THEN 'OFFLINE'
 WHEN p_heartbeat < now()-interval '30 seconds' THEN 'STALE'
 ELSE 'HEALTHY' END $$;

DROP VIEW IF EXISTS public.mt5_accounts_safe;
CREATE VIEW public.mt5_accounts_safe AS
SELECT id,user_id,owner_kind,broker,server,('****'||account_number_last4) account_number_masked,
 nickname,currency,leverage,account_type,execution_mode,margin_mode,credential_capability,
 operational,monitor_enabled,monitor_healthy,execution_enabled,connection_status,provider_health,
 terminal_authenticated,trade_permission,terminal_autotrading,policy,account_kill_switch,bridge_id,
 public.mt5_health(last_heartbeat_at,terminal_authenticated) health,last_heartbeat_at,last_sync_at,last_error,created_at,updated_at
FROM public.mt5_accounts;
GRANT SELECT ON public.mt5_accounts_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_mt5_command(p_account_id uuid,p_operation text,p_payload jsonb,p_idempotency_key text)
RETURNS TABLE(command_id uuid,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.mt5_accounts; c public.mt5_commands; op text:=upper(p_operation);
BEGIN
 SELECT * INTO a FROM public.mt5_accounts WHERE id=p_account_id AND (user_id=auth.uid() OR public.is_admin()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'mt5_account_not_found'; END IF;
 IF op NOT IN ('OPEN_POSITION','MODIFY_PROTECTION','PARTIAL_CLOSE','MOVE_TO_BREAKEVEN','CLOSE_POSITION','CANCEL_ORDER','SYNC_ACCOUNT','RECOVER_PROTECTION','TEST_CONNECTION') THEN RAISE EXCEPTION 'mt5_operation_invalid'; END IF;
 IF a.bridge_id IS NULL THEN RAISE EXCEPTION 'MT5_BRIDGE_OFFLINE'; END IF;
 INSERT INTO public.mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy)
 VALUES(a.id,a.bridge_id,op,p_payload,p_idempotency_key,'received',a.policy)
 ON CONFLICT(account_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING * INTO c;
 RETURN QUERY SELECT c.id,c.status;
END $$;
