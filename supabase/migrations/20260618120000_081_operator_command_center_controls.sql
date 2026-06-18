-- X-H Operator Command Center runtime controls.
-- Additive only: stores dashboard controls in scanner_config as the single admin-visible runtime row.
ALTER TABLE public.scanner_config
  ADD COLUMN IF NOT EXISTS supervisor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operator_telegram_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operator_news_brain_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operator_auto_repair_enabled boolean NOT NULL DEFAULT true;

UPDATE public.scanner_config
SET supervisor_enabled = coalesce(supervisor_enabled, true),
    operator_telegram_enabled = coalesce(operator_telegram_enabled, true),
    operator_news_brain_enabled = coalesce(operator_news_brain_enabled, true),
    operator_auto_repair_enabled = coalesce(operator_auto_repair_enabled, true),
    updated_at = now()
WHERE id = 1;

COMMENT ON COLUMN public.scanner_config.supervisor_enabled IS 'Operator dashboard source-of-truth switch for supervisor/monitor visibility and manual control.';
COMMENT ON COLUMN public.scanner_config.operator_telegram_enabled IS 'Operator dashboard source-of-truth switch for Telegram runtime operations.';
COMMENT ON COLUMN public.scanner_config.operator_news_brain_enabled IS 'Operator dashboard source-of-truth switch for News Brain runtime operations.';
COMMENT ON COLUMN public.scanner_config.operator_auto_repair_enabled IS 'Operator dashboard source-of-truth switch for automatic protection repair operations.';

NOTIFY pgrst, 'reload schema';
