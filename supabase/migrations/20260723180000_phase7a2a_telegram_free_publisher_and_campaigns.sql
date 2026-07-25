-- HashiBot Phase 7A-2A — Telegram Signal Channels, Free Channel Publisher & Incentive Engine
-- Creates free_channel_publications and telegram_campaign_logs tables
--
-- Corrected to match public.signals.id, which is UUID in the remote database.

CREATE TABLE IF NOT EXISTS public.free_channel_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  signal_id uuid NOT NULL
    REFERENCES public.signals(id)
    ON DELETE CASCADE,

  decision text NOT NULL
    CHECK (
      decision IN (
        'SELECTED',
        'DAILY_CAP',
        'ALREADY_PUBLISHED',
        'DUPLICATE',
        'EXPIRED',
        'CANCELLED',
        'COOLDOWN',
        'LOW_PRIORITY',
        'INVALID'
      )
    ),

  decision_reason text,

  publication_mode text NOT NULL DEFAULT 'full'
    CHECK (
      publication_mode IN (
        'preview',
        'delayed',
        'full'
      )
    ),

  grade text,
  confidence numeric,
  rr_ratio numeric,

  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_channel_pubs_signal_id
  ON public.free_channel_publications(signal_id);

CREATE INDEX IF NOT EXISTS idx_free_channel_pubs_published_at
  ON public.free_channel_publications(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_free_channel_pubs_decision
  ON public.free_channel_publications(decision);


CREATE TABLE IF NOT EXISTS public.telegram_campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id text NOT NULL,

  campaign_type text NOT NULL
    CHECK (
      campaign_type IN (
        'VIP_INVITATION',
        'TRIAL',
        'PRODUCT_UPDATE',
        'FEATURE_ANNOUNCEMENT',
        'EDUCATION'
      )
    ),

  channel text NOT NULL DEFAULT 'free',

  cta_trigger text
    CHECK (
      cta_trigger IS NULL
      OR cta_trigger IN (
        'after_tp1',
        'after_tp2',
        'after_stop_loss',
        'quiet_market',
        'weekly_recap'
      )
    ),

  message_hash text,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_campaign_logs_delivered_at
  ON public.telegram_campaign_logs(delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_campaign_logs_type
  ON public.telegram_campaign_logs(campaign_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_campaign_logs_dedup
  ON public.telegram_campaign_logs (
    campaign_id,
    campaign_type,
    channel,
    COALESCE(cta_trigger, ''),
    COALESCE(message_hash, '')
  );