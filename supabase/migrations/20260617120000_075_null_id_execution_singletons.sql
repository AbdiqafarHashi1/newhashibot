-- X-F.4: harden provider-neutral execution against null singleton/insert rows.
-- Additive/testnet-safe only. Does not enable live trading.

INSERT INTO public.scanner_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.execution_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.execution_settings
SET execution_mode = 'testnet',
    testnet_enabled = true,
    auto_execute_testnet = true,
    live_trading_enabled = false,
    kill_switch_enabled = false,
    updated_at = now()
WHERE id = 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'execution_settings' AND column_name = 'bot_paused'
  ) THEN
    EXECUTE 'UPDATE public.execution_settings SET bot_paused = false, updated_at = now() WHERE id = 1';
  END IF;
END $$;

INSERT INTO public.execution_provider_controls(
  provider_name, provider, enabled, entry_enabled, parallel_enabled, primary_provider,
  read_only, monitor_enabled, protection_recovery_enabled, recovery_enabled,
  provider_kill_switch, kill_switch, status, metadata, updated_at
)
VALUES
  ('binance', 'binance', true, true, true, false, false, true, true, true, false, false, 'connected', '{"seeded_by":"075_null_id_execution_singletons"}'::jsonb, now()),
  ('bybit', 'bybit', true, true, true, true, false, true, true, true, false, false, 'connected', '{"seeded_by":"075_null_id_execution_singletons","preserve_connected":true}'::jsonb, now()),
  ('mt5', 'mt5', false, false, false, false, true, false, false, false, false, false, 'disconnected', '{"seeded_by":"075_null_id_execution_singletons","placeholder":true}'::jsonb, now())
ON CONFLICT (provider_name) DO UPDATE SET
  provider = excluded.provider,
  enabled = CASE WHEN excluded.provider_name IN ('binance','bybit') THEN true ELSE false END,
  entry_enabled = CASE
    WHEN excluded.provider_name = 'bybit' AND public.execution_provider_controls.status = 'connected' THEN true
    WHEN excluded.provider_name = 'binance' THEN true
    WHEN excluded.provider_name = 'mt5' THEN false
    ELSE public.execution_provider_controls.entry_enabled
  END,
  parallel_enabled = excluded.provider_name IN ('binance','bybit'),
  read_only = CASE
    WHEN excluded.provider_name = 'bybit' AND public.execution_provider_controls.status = 'connected' THEN false
    WHEN excluded.provider_name = 'binance' THEN false
    ELSE true
  END,
  monitor_enabled = excluded.provider_name IN ('binance','bybit'),
  protection_recovery_enabled = excluded.provider_name IN ('binance','bybit'),
  recovery_enabled = excluded.provider_name IN ('binance','bybit'),
  provider_kill_switch = false,
  kill_switch = false,
  status = CASE
    WHEN excluded.provider_name = 'bybit' THEN public.execution_provider_controls.status
    WHEN excluded.provider_name = 'binance' THEN 'connected'
    ELSE 'disconnected'
  END,
  updated_at = now();

INSERT INTO public.execution_provider_global_controls(id, primary_provider, parallel_mode_enabled, live_trading_enabled)
VALUES (
  1,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.execution_provider_controls
    WHERE provider_name = 'bybit' AND enabled IS TRUE AND status = 'connected'
  ) THEN 'bybit' ELSE 'binance' END,
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  primary_provider = CASE WHEN EXISTS (
    SELECT 1 FROM public.execution_provider_controls
    WHERE provider_name = 'bybit' AND enabled IS TRUE AND status = 'connected'
  ) THEN 'bybit' ELSE 'binance' END,
  parallel_mode_enabled = true,
  live_trading_enabled = false,
  updated_at = now();

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.execution_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.execution_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.execution_orders
  ADD CONSTRAINT execution_orders_status_xf4_check
  CHECK (status IN (
    'pending','pending_submit','signal_created','execution_planned','entry_submitted','entry_filled',
    'entry_timeout_cancelled','entry_missing_no_position',
    'protection_submitted','protected','protected_native','protected_managed',
    'pending_protection','protection_pending','protection_failed','protection_recovered','pending_managed_protection','partially_closed',
    'tp1_hit','sl_moved_to_be','closed_tp','closed_tp2','closed_sl','closed_profit_lock','closed_breakeven','closed_timeout','closed_expired','closed_expired_after_tp1',
    'closed_manual','closed_unprotected_safety','closed_synced','cancelled','failed','skipped','stale_closed',
    'sent_to_bridge','accepted','rejected','filled'
  )) NOT VALID;
