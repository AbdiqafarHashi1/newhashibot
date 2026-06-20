-- HASHIBOT X-P — execution safety, quarantine, runtime truth, Telegram dedupe, scheduler truth, 100-trade readiness.
-- Additive/testnet+demo safe only. Live trading remains disabled.

CREATE TABLE IF NOT EXISTS public.problem_symbol_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  symbol text NOT NULL,
  reason text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  failure_count integer NOT NULL DEFAULT 1,
  cooldown_until timestamptz,
  disabled_for_execution boolean NOT NULL DEFAULT false,
  disabled_for_repair boolean NOT NULL DEFAULT false,
  recommended_action text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT problem_symbol_quarantine_reason_check CHECK (reason IN (
    'EXCHANGE_MAX_QTY_EXCEEDED','MIN_NOTIONAL_NOT_MET','INVALID_TRIGGER_DIRECTION','UNSUPPORTED_CONDITIONAL_ORDER',
    'PROTECTION_VERIFICATION_FAILED','PRECISION_RULE_VIOLATION','STALE_ORDER_LOOP','REPEATED_REPAIR_FAILURE',
    'EXCHANGE_REJECT','UNKNOWN_PROVIDER_FAILURE'
  )),
  CONSTRAINT problem_symbol_quarantine_provider_symbol_reason_key UNIQUE (provider, symbol, reason)
);

CREATE INDEX IF NOT EXISTS idx_problem_symbol_quarantine_active
  ON public.problem_symbol_quarantine(provider, symbol, cooldown_until)
  WHERE disabled_for_execution OR disabled_for_repair;

CREATE OR REPLACE FUNCTION public.record_symbol_failure(
  p_provider text,
  p_symbol text,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_threshold integer DEFAULT 3,
  p_cooldown_minutes integer DEFAULT 240
) RETURNS public.problem_symbol_quarantine
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := CASE WHEN p_reason IN (
    'EXCHANGE_MAX_QTY_EXCEEDED','MIN_NOTIONAL_NOT_MET','INVALID_TRIGGER_DIRECTION','UNSUPPORTED_CONDITIONAL_ORDER',
    'PROTECTION_VERIFICATION_FAILED','PRECISION_RULE_VIOLATION','STALE_ORDER_LOOP','REPEATED_REPAIR_FAILURE',
    'EXCHANGE_REJECT','UNKNOWN_PROVIDER_FAILURE'
  ) THEN p_reason ELSE 'UNKNOWN_PROVIDER_FAILURE' END;
  v_row public.problem_symbol_quarantine;
BEGIN
  INSERT INTO public.problem_symbol_quarantine(provider, symbol, reason, metadata, recommended_action)
  VALUES (lower(p_provider), upper(p_symbol), v_reason, coalesce(p_metadata, '{}'::jsonb), 'watch symbol; auto quarantine after repeated failures')
  ON CONFLICT (provider, symbol, reason) DO UPDATE SET
    last_seen = now(),
    failure_count = public.problem_symbol_quarantine.failure_count + 1,
    metadata = public.problem_symbol_quarantine.metadata || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.failure_count >= greatest(1, p_threshold) THEN
    UPDATE public.problem_symbol_quarantine
    SET disabled_for_execution = true,
        disabled_for_repair = true,
        cooldown_until = now() + make_interval(mins => greatest(5, p_cooldown_minutes)),
        recommended_action = CASE v_reason
          WHEN 'INVALID_TRIGGER_DIRECTION' THEN 'skip execution/repair until signal prices and mark-price trigger direction are verified'
          WHEN 'PROTECTION_VERIFICATION_FAILED' THEN 'inspect exchange conditional-order support and precision before retry'
          WHEN 'REPEATED_REPAIR_FAILURE' THEN 'manual review required before repair retry'
          WHEN 'MIN_NOTIONAL_NOT_MET' THEN 'sync provider symbol filters and skip too-small sizing'
          WHEN 'EXCHANGE_MAX_QTY_EXCEEDED' THEN 'sync max quantity limits and reduce sizing before retry'
          ELSE 'manual review required before retry'
        END,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END $$;

ALTER TABLE public.execution_orders
  ADD COLUMN IF NOT EXISTS lifecycle_state text,
  ADD COLUMN IF NOT EXISTS position_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preflight_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sl_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tp1_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tp2_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_correct boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS performance_updated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantine_blocker_id uuid REFERENCES public.problem_symbol_quarantine(id),
  ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_failed_live_position_execution_orders()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'failed' AND coalesce(NEW.position_confirmed, false) THEN
    NEW.status := 'protection_failed';
    NEW.lifecycle_state := 'UNSAFE_POSITION';
    NEW.manual_review_required := true;
    NEW.error_message := coalesce(NEW.error_message, 'failed_status_rewritten_live_position_exists');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_failed_live_position_execution_orders ON public.execution_orders;
CREATE TRIGGER trg_prevent_failed_live_position_execution_orders
BEFORE INSERT OR UPDATE ON public.execution_orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_failed_live_position_execution_orders();

CREATE TABLE IF NOT EXISTS public.telegram_alert_dedupe (
  dedupe_key text PRIMARY KEY,
  event_type text NOT NULL,
  provider text,
  symbol text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  suppressed_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  recovered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.telegram_alert_cooldowns (
  scope text PRIMARY KEY,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  hourly_limit integer NOT NULL DEFAULT 12,
  digest_interval_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.telegram_alert_digest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_key text NOT NULL,
  provider text,
  symbol text,
  event_type text NOT NULL,
  failure_count integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  latest_error text,
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.telegram_alert_cooldowns(scope, cooldown_minutes, hourly_limit, digest_interval_minutes)
VALUES ('global', 60, 12, 60), ('provider', 30, 6, 60), ('symbol', 60, 4, 120)
ON CONFLICT (scope) DO NOTHING;

CREATE OR REPLACE VIEW public.scheduler_truth_view AS
SELECT provider, environment, job_name, cron_expression, function_name,
       coalesce(enabled, scheduled, false) AS enabled,
       scheduled AS configured,
       last_run_at,
       next_run_at,
       CASE WHEN last_success THEN last_run_at ELSE NULL END AS last_success_at,
       CASE WHEN last_success IS FALSE THEN last_run_at ELSE NULL END AS last_failure_at,
       last_error AS latest_blocker,
       CASE WHEN last_run_at IS NULL THEN NULL ELSE extract(epoch FROM (now() - last_run_at))/60 END AS heartbeat_age_minutes,
       CASE
         WHEN coalesce(enabled, scheduled, false) IS FALSE THEN 'WARNING'
         WHEN last_run_at IS NULL THEN 'FAIL'
         WHEN now() - last_run_at > interval '10 minutes' AND coalesce(cron_expression,'') LIKE '%1 %' THEN 'FAIL'
         WHEN now() - last_run_at > interval '20 minutes' THEN 'WARNING'
         WHEN last_success IS FALSE THEN 'FAIL'
         ELSE 'PASS'
       END AS status
FROM public.execution_monitor_schedules;

CREATE OR REPLACE VIEW public.clean_trade_audit_view AS
SELECT eo.id AS execution_id,
       eo.execution_provider AS provider,
       eo.exchange,
       eo.environment,
       eo.symbol,
       eo.signal_id,
       (s.id IS NOT NULL AND s.status IN ('active','sent','approved','open','closed','tp1_hit','tp2_hit')) AS signal_approved,
       coalesce(eo.preflight_passed, eo.status NOT IN ('skipped','failed')) AS preflight_passed,
       coalesce(eo.execution_allowed, eo.status NOT IN ('skipped')) AS execution_allowed,
       coalesce(eo.entry_order_id, eo.binance_entry_order_id, eo.submitted_order_id) IS NOT NULL AS entry_confirmed,
       coalesce(eo.position_confirmed, eo.entry_filled_at IS NOT NULL OR eo.status IN ('entry_filled','protected_native','partially_closed','closed_tp2','closed_sl','closed_expired')) AS position_confirmed,
       coalesce(eo.sl_confirmed, eo.native_protection_verified = true AND coalesce(eo.sl_algo_id, eo.binance_sl_order_id, eo.sl_order_id) IS NOT NULL) AS sl_confirmed,
       coalesce(eo.tp1_confirmed, eo.native_protection_verified = true AND coalesce(eo.tp1_algo_id, eo.binance_tp1_order_id, eo.tp1_order_id) IS NOT NULL) AS tp1_confirmed,
       coalesce(eo.tp2_confirmed, eo.native_protection_verified = true AND coalesce(eo.tp2_algo_id, eo.binance_tp2_order_id, eo.tp2_order_id) IS NOT NULL) AS tp2_confirmed,
       coalesce(eo.lifecycle_state, eo.status) IS NOT NULL AND eo.last_monitor_action IS NOT NULL AS lifecycle_tracked,
       NOT (eo.status = 'failed' AND coalesce(eo.position_confirmed,false)) AS no_live_position_marked_failed,
       eo.status NOT IN ('protection_failed','unprotected_failed') AND coalesce(eo.native_protection_verified,false) AS no_protection_failure,
       coalesce(eo.telegram_correct, EXISTS (SELECT 1 FROM public.telegram_deliveries td WHERE td.signal_id = eo.signal_id AND td.delivery_status IN ('sent','skipped'))) AS telegram_correct,
       coalesce(eo.performance_updated, eo.status IN ('closed_tp','closed_tp2','closed_sl','closed_expired','closed_expired_after_tp1','closed_timeout','synced_closed','expired_closed')) AS performance_updated,
       eo.status IN ('closed_tp','closed_tp2','closed_sl','closed_expired','closed_expired_after_tp1','closed_timeout','synced_closed','expired_closed') AS trade_closed,
       (
         (s.id IS NOT NULL) AND
         coalesce(eo.preflight_passed, eo.status NOT IN ('skipped','failed')) AND
         coalesce(eo.execution_allowed, eo.status NOT IN ('skipped')) AND
         coalesce(eo.entry_order_id, eo.binance_entry_order_id, eo.submitted_order_id) IS NOT NULL AND
         coalesce(eo.position_confirmed, eo.entry_filled_at IS NOT NULL OR eo.status IN ('entry_filled','protected_native','partially_closed','closed_tp2','closed_sl','closed_expired')) AND
         coalesce(eo.sl_confirmed, eo.native_protection_verified = true AND coalesce(eo.sl_algo_id, eo.binance_sl_order_id, eo.sl_order_id) IS NOT NULL) AND
         coalesce(eo.tp1_confirmed, eo.native_protection_verified = true AND coalesce(eo.tp1_algo_id, eo.binance_tp1_order_id, eo.tp1_order_id) IS NOT NULL) AND
         coalesce(eo.tp2_confirmed, eo.native_protection_verified = true AND coalesce(eo.tp2_algo_id, eo.binance_tp2_order_id, eo.tp2_order_id) IS NOT NULL) AND
         eo.status IN ('closed_tp','closed_tp2','closed_sl','closed_expired','closed_expired_after_tp1','closed_timeout','synced_closed','expired_closed') AND
         eo.status NOT IN ('protection_failed','unprotected_failed')
       ) AS clean_trade,
       eo.created_at,
       eo.updated_at
FROM public.execution_orders eo
LEFT JOIN public.signals s ON s.id = eo.signal_id;

CREATE OR REPLACE VIEW public.provider_100_trade_readiness_view AS
SELECT provider,
       count(*) FILTER (WHERE clean_trade) AS clean_trades_completed,
       100 AS target,
       greatest(0, 100 - count(*) FILTER (WHERE clean_trade)) AS remaining_to_target,
       count(*) FILTER (WHERE NOT clean_trade) AS non_clean_execution_rows,
       jsonb_agg(jsonb_build_object('execution_id', execution_id, 'symbol', symbol, 'status', CASE WHEN clean_trade THEN 'clean' ELSE 'blocked' END) ORDER BY updated_at DESC) FILTER (WHERE NOT clean_trade) AS blockers
FROM public.clean_trade_audit_view
WHERE provider IN ('binance','bybit')
GROUP BY provider;

CREATE OR REPLACE VIEW public.runtime_proof_view AS
WITH cfg AS (SELECT * FROM public.scanner_config WHERE id = 1),
settings AS (SELECT * FROM public.execution_settings WHERE id = 1),
q AS (SELECT count(*) AS active_quarantines FROM public.problem_symbol_quarantine WHERE (disabled_for_execution OR disabled_for_repair) AND coalesce(cooldown_until, now() + interval '1 minute') > now()),
sched AS (SELECT count(*) FILTER (WHERE status = 'FAIL') AS scheduler_failures, count(*) FILTER (WHERE status = 'WARNING') AS scheduler_warnings FROM public.scheduler_truth_view),
readiness AS (SELECT jsonb_object_agg(provider, jsonb_build_object('clean_trades_completed', clean_trades_completed, 'target', target, 'remaining_to_target', remaining_to_target)) AS readiness FROM public.provider_100_trade_readiness_view)
SELECT 'runtime'::text AS scope,
       CASE
         WHEN coalesce((SELECT live_trading_enabled FROM settings), false) THEN 'FAIL'
         WHEN coalesce((SELECT scheduler_failures FROM sched), 0) > 0 THEN 'FAIL'
         WHEN coalesce((SELECT active_quarantines FROM q), 0) > 0 THEN 'WARNING'
         WHEN coalesce((SELECT scheduler_warnings FROM sched), 0) > 0 THEN 'WARNING'
         ELSE 'PASS'
       END AS status,
       jsonb_strip_nulls(jsonb_build_object(
         'live_trading_disabled', NOT coalesce((SELECT live_trading_enabled FROM settings), false),
         'scanner_enabled', coalesce((SELECT is_enabled FROM cfg), false),
         'schedule_enabled', coalesce((SELECT schedule_enabled FROM cfg), false),
         'supervisor_enabled', coalesce((SELECT supervisor_enabled FROM cfg), true),
         'operator_auto_repair_enabled', coalesce((SELECT operator_auto_repair_enabled FROM cfg), true),
         'operator_telegram_enabled', coalesce((SELECT operator_telegram_enabled FROM cfg), true),
         'active_quarantines', (SELECT active_quarantines FROM q),
         'scheduler_failures', (SELECT scheduler_failures FROM sched),
         'scheduler_warnings', (SELECT scheduler_warnings FROM sched),
         'readiness', (SELECT readiness FROM readiness)
       )) AS proof,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN coalesce((SELECT live_trading_enabled FROM settings), false) THEN 'live_trading_enabled' END,
         CASE WHEN NOT coalesce((SELECT is_enabled FROM cfg), false) THEN 'scanner_disabled' END,
         CASE WHEN NOT coalesce((SELECT schedule_enabled FROM cfg), false) THEN 'scanner_schedule_disabled' END,
         CASE WHEN coalesce((SELECT scheduler_failures FROM sched), 0) > 0 THEN 'scheduler_heartbeat_failed_or_missing' END
       ], NULL) AS blockers,
       now() AS generated_at;

-- RLS/policies are deployment-specific; service-role Edge Functions own writes. Keep live trading impossible.
DO $$
BEGIN
  IF to_regclass('public.execution_settings') IS NOT NULL THEN
    ALTER TABLE public.execution_settings
      ADD CONSTRAINT execution_settings_live_trading_false_xp_check CHECK (live_trading_enabled = false) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
