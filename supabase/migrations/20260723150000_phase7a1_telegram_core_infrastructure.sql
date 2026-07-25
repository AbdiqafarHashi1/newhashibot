-- HashiBot Phase 7A-1 — Professional Telegram Core Infrastructure Migration
ALTER TABLE public.telegram_deliveries
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS routing_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS template_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS retry_after_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_response jsonb,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'VIP_SIGNAL',
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text;

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_idempotency_key ON public.telegram_deliveries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_delivery_status_next_attempt ON public.telegram_deliveries(delivery_status, next_attempt_at) WHERE delivery_status = 'RETRY_PENDING';
