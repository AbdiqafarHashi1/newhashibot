-- Phase 8A: account-scoped MT5 provider, command transport, and synchronized read model.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mt5_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker text NOT NULL CHECK (length(trim(broker)) > 0),
  server text NOT NULL CHECK (length(trim(server)) > 0),
  account_number_ciphertext bytea NOT NULL,
  password_ciphertext bytea NOT NULL,
  account_number_hash text NOT NULL,
  account_number_last4 text NOT NULL CHECK (length(account_number_last4) <= 4),
  nickname text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  leverage integer NOT NULL CHECK (leverage > 0),
  account_type text NOT NULL CHECK (account_type IN ('personal','prop','demo')),
  execution_mode text NOT NULL CHECK (execution_mode IN ('personal','prop_challenge','demo')),
  margin_mode text NOT NULL DEFAULT 'hedging' CHECK (margin_mode IN ('hedging','netting')),
  execution_enabled boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'pending' CHECK (connection_status IN ('pending','connected','degraded','disconnected','disabled')),
  provider_health text NOT NULL DEFAULT 'unknown' CHECK (provider_health IN ('unknown','healthy','degraded','unhealthy')),
  bridge_id text REFERENCES public.mt5_bridge_registry(bridge_id) ON DELETE SET NULL,
  last_heartbeat_at timestamptz,
  last_sync_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker, server, account_number_hash)
);

COMMENT ON COLUMN public.mt5_accounts.password_ciphertext IS 'Envelope-encrypted by the server; never returned by public views or APIs.';
ALTER TABLE public.mt5_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt5_accounts_owner_read ON public.mt5_accounts FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY mt5_accounts_owner_insert ON public.mt5_accounts FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY mt5_accounts_owner_update ON public.mt5_accounts FOR UPDATE USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY mt5_accounts_owner_delete ON public.mt5_accounts FOR DELETE USING (auth.uid() = user_id OR public.is_admin());
REVOKE SELECT (password_ciphertext, account_number_ciphertext, account_number_hash) ON public.mt5_accounts FROM authenticated;

CREATE OR REPLACE VIEW public.mt5_accounts_safe WITH (security_invoker = true) AS
SELECT id, user_id, broker, server, ('••••' || account_number_last4) AS account_number_masked,
 nickname, currency, leverage, account_type, execution_mode, margin_mode, execution_enabled,
 connection_status, provider_health, bridge_id, last_heartbeat_at, last_sync_at, created_at, updated_at
FROM public.mt5_accounts;
GRANT SELECT ON public.mt5_accounts_safe TO authenticated;

CREATE TABLE public.mt5_symbol_specs (
  account_id uuid NOT NULL REFERENCES public.mt5_accounts(id) ON DELETE CASCADE,
  canonical_symbol text NOT NULL,
  broker_symbol text NOT NULL,
  digits integer NOT NULL CHECK (digits BETWEEN 0 AND 10),
  point numeric NOT NULL CHECK (point > 0),
  contract_size numeric NOT NULL CHECK (contract_size > 0),
  volume_min numeric NOT NULL CHECK (volume_min > 0),
  volume_max numeric NOT NULL CHECK (volume_max >= volume_min),
  volume_step numeric NOT NULL CHECK (volume_step > 0),
  stops_level_points integer NOT NULL DEFAULT 0 CHECK (stops_level_points >= 0),
  fill_policies text[] NOT NULL DEFAULT ARRAY['return'],
  synchronized_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, canonical_symbol)
);
ALTER TABLE public.mt5_symbol_specs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt5_symbol_specs_read ON public.mt5_symbol_specs FOR SELECT USING (EXISTS (SELECT 1 FROM public.mt5_accounts a WHERE a.id=account_id AND (a.user_id=auth.uid() OR public.is_admin())));

CREATE TABLE public.mt5_account_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.mt5_accounts(id) ON DELETE CASCADE,
  balance numeric NOT NULL, equity numeric NOT NULL, margin numeric NOT NULL,
  free_margin numeric NOT NULL, floating_pnl numeric NOT NULL, commission numeric NOT NULL DEFAULT 0,
  swap numeric NOT NULL DEFAULT 0, currency text NOT NULL, positions jsonb NOT NULL DEFAULT '[]',
  orders jsonb NOT NULL DEFAULT '[]', history_cursor text, captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mt5_snapshots_account_time_idx ON public.mt5_account_snapshots(account_id, captured_at DESC);
ALTER TABLE public.mt5_account_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt5_snapshots_read ON public.mt5_account_snapshots FOR SELECT USING (EXISTS (SELECT 1 FROM public.mt5_accounts a WHERE a.id=account_id AND (a.user_id=auth.uid() OR public.is_admin())));

CREATE TABLE public.mt5_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.mt5_accounts(id) ON DELETE CASCADE,
  bridge_id text NOT NULL REFERENCES public.mt5_bridge_registry(bridge_id),
  operation text NOT NULL CHECK (operation IN ('place_order','cancel_order','modify_position','close_position','sync_account','test_connection')),
  payload jsonb NOT NULL, idempotency_key text NOT NULL, status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','claimed','acknowledged','failed','expired')),
  attempts integer NOT NULL DEFAULT 0, claimed_at timestamptz, acknowledged_at timestamptz,
  error_code text, error_message text, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
  UNIQUE(account_id, idempotency_key)
);
CREATE INDEX mt5_commands_bridge_pending_idx ON public.mt5_commands(bridge_id, created_at) WHERE status='pending';
ALTER TABLE public.mt5_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY mt5_commands_read ON public.mt5_commands FOR SELECT USING (EXISTS (SELECT 1 FROM public.mt5_accounts a WHERE a.id=account_id AND (a.user_id=auth.uid() OR public.is_admin())));

CREATE OR REPLACE FUNCTION public.enqueue_mt5_command(p_account_id uuid, p_operation text, p_payload jsonb, p_idempotency_key text)
RETURNS TABLE(command_id uuid, status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.mt5_accounts; c public.mt5_commands;
BEGIN
 SELECT * INTO a FROM public.mt5_accounts WHERE id=p_account_id AND (user_id=auth.uid() OR public.is_admin()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'mt5_account_not_found'; END IF;
 IF NOT a.execution_enabled OR a.connection_status <> 'connected' OR a.provider_health <> 'healthy' OR a.bridge_id IS NULL THEN RAISE EXCEPTION 'mt5_account_not_ready'; END IF;
 INSERT INTO public.mt5_commands(account_id,bridge_id,operation,payload,idempotency_key)
 VALUES(a.id,a.bridge_id,p_operation,p_payload,p_idempotency_key)
 ON CONFLICT(account_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING * INTO c;
 RETURN QUERY SELECT c.id,c.status;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) TO authenticated, service_role;

-- Bridge synchronization is service-role only. It feeds the existing canonical trade truth via provider IDs.
CREATE OR REPLACE FUNCTION public.sync_mt5_account(p_account_id uuid,p_snapshot jsonb,p_positions jsonb,p_orders jsonb,p_symbol_specs jsonb DEFAULT '[]')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 INSERT INTO public.mt5_account_snapshots(account_id,balance,equity,margin,free_margin,floating_pnl,commission,swap,currency,positions,orders,history_cursor,captured_at)
 VALUES(p_account_id,(p_snapshot->>'balance')::numeric,(p_snapshot->>'equity')::numeric,(p_snapshot->>'margin')::numeric,(p_snapshot->>'free_margin')::numeric,(p_snapshot->>'floating_pnl')::numeric,coalesce((p_snapshot->>'commission')::numeric,0),coalesce((p_snapshot->>'swap')::numeric,0),p_snapshot->>'currency',p_positions,p_orders,p_snapshot->>'history_cursor',coalesce((p_snapshot->>'captured_at')::timestamptz,now()));
 UPDATE public.mt5_accounts SET last_sync_at=now(),last_heartbeat_at=now(),connection_status='connected',provider_health='healthy',updated_at=now() WHERE id=p_account_id;
END $$;
REVOKE ALL ON FUNCTION public.sync_mt5_account(uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_mt5_account(uuid,jsonb,jsonb,jsonb,jsonb) TO service_role;
