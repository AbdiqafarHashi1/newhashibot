-- 090: V1 final recovery backend stabilization
-- Compact analytics, symbol universes, staged forex readiness, Telegram dedupe,
-- provider-neutral execution lifecycle, protection events, and MT5/HashiBridge readiness.

CREATE TABLE IF NOT EXISTS public.hashibot_symbol_universes (
  symbol text PRIMARY KEY,
  market_type text NOT NULL CHECK (market_type IN ('crypto','forex')),
  universe_group text NOT NULL CHECK (universe_group IN ('crypto_core','crypto_extended','forex_core','forex_extended','disabled')),
  enabled boolean NOT NULL DEFAULT false,
  scan_enabled boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1000,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hashibot_symbol_universes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_symbol_universes" ON public.hashibot_symbol_universes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.hashibot_symbol_universes(symbol, market_type, universe_group, enabled, scan_enabled, execution_enabled, sort_order, reason) VALUES
  ('BTCUSDT','crypto','crypto_core',true,true,true,10,'Core production crypto universe'),
  ('ETHUSDT','crypto','crypto_core',true,true,true,20,'Core production crypto universe'),
  ('SOLUSDT','crypto','crypto_core',true,true,true,30,'Core production crypto universe'),
  ('BNBUSDT','crypto','crypto_core',true,true,true,40,'Core production crypto universe'),
  ('XRPUSDT','crypto','crypto_core',true,true,true,50,'Core production crypto universe'),
  ('ADAUSDT','crypto','crypto_core',true,true,true,60,'Core production crypto universe'),
  ('DOGEUSDT','crypto','crypto_core',true,true,true,70,'Core production crypto universe'),
  ('AVAXUSDT','crypto','crypto_core',true,true,true,80,'Core production crypto universe'),
  ('LINKUSDT','crypto','crypto_core',true,true,true,90,'Core production crypto universe'),
  ('TRXUSDT','crypto','crypto_core',true,true,true,100,'Core production crypto universe'),
  ('TONUSDT','crypto','crypto_core',true,true,false,110,'Core production scan-only until provider validation'),
  ('DOTUSDT','crypto','crypto_core',true,true,true,120,'Core production crypto universe'),
  ('MATICUSDT','crypto','crypto_extended',false,false,false,210,'Extended crypto disabled by default'),
  ('LTCUSDT','crypto','crypto_extended',false,false,false,220,'Extended crypto disabled by default'),
  ('EURUSD','forex','forex_core',false,false,false,310,'Forex shadow validation only'),
  ('GBPUSD','forex','forex_core',false,false,false,320,'Forex shadow validation only'),
  ('USDJPY','forex','forex_core',false,false,false,330,'Forex shadow validation only'),
  ('XAUUSD','forex','forex_extended',false,false,false,410,'Forex extended disabled until validation')
ON CONFLICT (symbol) DO UPDATE SET
  market_type = EXCLUDED.market_type,
  universe_group = EXCLUDED.universe_group,
  enabled = EXCLUDED.enabled,
  scan_enabled = EXCLUDED.scan_enabled,
  execution_enabled = EXCLUDED.execution_enabled,
  sort_order = EXCLUDED.sort_order,
  reason = EXCLUDED.reason,
  updated_at = now();

DO $$
BEGIN
  IF to_regclass('public.strategy_configs') IS NOT NULL THEN
    ALTER TABLE public.strategy_configs ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'validated';
    ALTER TABLE public.strategy_configs ADD COLUMN IF NOT EXISTS execution_enabled boolean NOT NULL DEFAULT true;
    ALTER TABLE public.strategy_configs ADD COLUMN IF NOT EXISTS signal_mode_allowed boolean NOT NULL DEFAULT true;
    UPDATE public.strategy_configs
      SET validation_status = 'shadow', execution_enabled = false, signal_mode_allowed = false
      WHERE strategy_name IN ('ForexMicroScalper','ForexSwingContinuation');
    INSERT INTO public.strategy_configs(strategy_name, enabled, validation_status, execution_enabled, signal_mode_allowed)
      VALUES ('ForexMicroScalper', true, 'shadow', false, false), ('ForexSwingContinuation', true, 'shadow', false, false)
      ON CONFLICT (strategy_name) DO UPDATE SET validation_status = 'shadow', execution_enabled = false, signal_mode_allowed = false;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hashibot_execution_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('SIGNAL_CREATED','QUALIFIED','POSITION_SIZED','ORDER_SUBMITTED','FILLED','PROTECTED','TP1','BREAKEVEN','TP2','CLOSED','ARCHIVED','FAILED','RECOVERY_REQUIRED')),
  provider text,
  signal_id uuid,
  execution_order_id uuid,
  trade_truth_id uuid,
  symbol text,
  idempotency_key text UNIQUE,
  severity text NOT NULL DEFAULT 'info',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hashibot_protection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  symbol text,
  execution_order_id uuid,
  trade_truth_id uuid,
  protection_status text NOT NULL,
  missing_sl boolean NOT NULL DEFAULT false,
  missing_tp boolean NOT NULL DEFAULT false,
  duplicate_position boolean NOT NULL DEFAULT false,
  orphan_position boolean NOT NULL DEFAULT false,
  stale_order boolean NOT NULL DEFAULT false,
  repair_attempted boolean NOT NULL DEFAULT false,
  repair_status text NOT NULL DEFAULT 'not_attempted',
  alert_required boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hashibot_execution_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashibot_protection_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_execution_lifecycle_events" ON public.hashibot_execution_lifecycle_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_all_hashibot_protection_events" ON public.hashibot_protection_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hashibot_one_active_trade_per_provider_symbol
  ON public.trade_management_truth(provider, environment, symbol)
  WHERE status NOT IN ('closed','closed_tp','closed_sl','closed_breakeven','cancelled','failed','archived') AND protection_status IS DISTINCT FROM 'closed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_delivery_dedupe_signal_type
  ON public.telegram_deliveries(signal_id, delivery_type, chat_id)
  WHERE signal_id IS NOT NULL AND delivery_type IS NOT NULL AND chat_id IS NOT NULL;

ALTER TABLE public.hashibridge_instances ADD COLUMN IF NOT EXISTS shared_secret_ref text;
ALTER TABLE public.hashibridge_instances ADD COLUMN IF NOT EXISTS execution_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.hashibridge_instances ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'offline';

INSERT INTO public.hashibot_retention_policies(table_name, timestamp_column, retention_days, archive_enabled, reason) VALUES
  ('signal_updates','created_at',60,true,'Signal lifecycle updates are bounded after customer support window'),
  ('execution_monitor_heartbeats','started_at',14,true,'Monitor heartbeats are compact operational proof'),
  ('hashibot_execution_lifecycle_events','created_at',90,true,'Lifecycle events retained longer than debug logs'),
  ('hashibot_protection_events','created_at',90,true,'Protection/recovery events retained for audit window'),
  ('hashibot_command_queue','created_at',30,true,'Completed/dead command queue records are bounded'),
  ('hashibot_retention_archive','archived_at',180,false,'Archives are bounded to prevent archive becoming a warehouse')
ON CONFLICT (table_name) DO UPDATE SET timestamp_column = EXCLUDED.timestamp_column, retention_days = EXCLUDED.retention_days, archive_enabled = EXCLUDED.archive_enabled, reason = EXCLUDED.reason, updated_at = now();

CREATE OR REPLACE FUNCTION public.hashibot_symbol_universe_report()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'groups', COALESCE(jsonb_agg(jsonb_build_object('universe_group', universe_group, 'enabled_count', enabled_count, 'scan_count', scan_count, 'execution_count', execution_count, 'symbols', symbols) ORDER BY universe_group), '[]'::jsonb)
  )
  FROM (
    SELECT universe_group, count(*) FILTER (WHERE enabled) enabled_count, count(*) FILTER (WHERE scan_enabled) scan_count, count(*) FILTER (WHERE execution_enabled) execution_count, jsonb_agg(symbol ORDER BY sort_order) FILTER (WHERE enabled) symbols
    FROM public.hashibot_symbol_universes GROUP BY universe_group
  ) g;
$$;

CREATE OR REPLACE FUNCTION public.hashibot_performance_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE signal_count integer := 0; active_count integer := 0; exec_count integer := 0; recent_events jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF to_regclass('public.signals') IS NOT NULL THEN SELECT count(*), count(*) FILTER (WHERE status IN ('waiting','active','tp1_hit')) INTO signal_count, active_count FROM public.signals WHERE created_at > now() - interval '90 days'; END IF;
  IF to_regclass('public.execution_orders') IS NOT NULL THEN SELECT count(*) INTO exec_count FROM public.execution_orders WHERE created_at > now() - interval '90 days'; END IF;
  IF to_regclass('public.execution_event_logs') IS NOT NULL THEN SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) INTO recent_events FROM (SELECT event_type, message, created_at FROM public.execution_event_logs ORDER BY created_at DESC LIMIT 25) e; END IF;
  RETURN jsonb_build_object('generated_at', now(), 'signals_90d', signal_count, 'active_signals', active_count, 'execution_orders_90d', exec_count, 'recent_execution_events', recent_events);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_execution_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE protected integer := 0; unprotected integer := 0; recovery integer := 0; latest timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF to_regclass('public.trade_management_truth') IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE protection_status IN ('protected','protected_native','protected_managed')), count(*) FILTER (WHERE protection_status NOT IN ('protected','protected_native','protected_managed','closed')), max(latest_sync_at)
      INTO protected, unprotected, latest FROM public.trade_management_truth WHERE status NOT IN ('closed','cancelled','failed');
  END IF;
  SELECT count(*) INTO recovery FROM public.hashibot_protection_events WHERE alert_required AND created_at > now() - interval '24 hours';
  RETURN jsonb_build_object('generated_at', now(), 'protected_count', protected, 'unprotected_count', unprotected, 'recovery_required_24h', recovery, 'last_protection_scan', latest);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_provider_health_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE providers jsonb := '[]'::jsonb; universe jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF to_regclass('public.provider_status') IS NOT NULL THEN SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO providers FROM (SELECT provider, status, latency_ms, last_checked_at, error_message FROM public.provider_status ORDER BY provider) p; END IF;
  universe := public.hashibot_symbol_universe_report();
  RETURN jsonb_build_object('generated_at', now(), 'providers', providers, 'symbol_universe', universe);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_telegram_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent jsonb := '[]'::jsonb; failed integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF to_regclass('public.telegram_deliveries') IS NOT NULL THEN
    SELECT count(*) INTO failed FROM public.telegram_deliveries WHERE created_at > now() - interval '24 hours' AND coalesce(success,false) = false;
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO recent FROM (SELECT delivery_type, success, error_message, created_at FROM public.telegram_deliveries ORDER BY created_at DESC LIMIT 50) t;
  END IF;
  RETURN jsonb_build_object('generated_at', now(), 'channels', jsonb_build_array('admin_ops','free','vip'), 'failed_24h', failed, 'recent', recent, 'secrets_environment_managed', true);
END $$;

CREATE OR REPLACE FUNCTION public.hashibot_provider_operations_summary() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.hashibot_execution_summary() || public.hashibot_provider_health_summary(); $$;
CREATE OR REPLACE FUNCTION public.hashibot_trading_brain_summary() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT jsonb_build_object('generated_at', now(), 'symbol_universe', public.hashibot_symbol_universe_report()); $$;
CREATE OR REPLACE FUNCTION public.hashibot_signals_manager_summary() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.hashibot_performance_summary(); $$;
CREATE OR REPLACE FUNCTION public.hashibot_provider_comparison_summary() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.hashibot_provider_health_summary(); $$;
CREATE OR REPLACE FUNCTION public.hashibot_outcome_tracking_summary() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.hashibot_performance_summary(); $$;
