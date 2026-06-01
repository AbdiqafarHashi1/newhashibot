/*
  # Legacy user_access upsert compatibility

  The admin grant flows upsert public.user_access with:
    onConflict: 'user_id,product_slug'

  Existing deployments may have the table without a matching unique index/constraint,
  which makes Postgres/PostgREST reject the upsert. This migration keeps one legacy
  access row per user/product pair, archives duplicate rows for review, then adds the
  unique index required by the admin grant paths.
*/

CREATE TABLE IF NOT EXISTS public.user_access_duplicate_archive (
  original_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  product_slug text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archive_reason text NOT NULL DEFAULT 'duplicate_user_access_user_product_before_unique_index',
  original_row jsonb NOT NULL
);

ALTER TABLE public.user_access_duplicate_archive ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_access_duplicate_archive'
      AND policyname = 'Admins can read archived duplicate access'
  ) THEN
    CREATE POLICY "Admins can read archived duplicate access"
      ON public.user_access_duplicate_archive FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

WITH ranked_access AS (
  SELECT
    ua.*,
    row_number() OVER (
      PARTITION BY ua.user_id, ua.product_slug
      ORDER BY
        (ua.status = 'active') DESC,
        (ua.expires_at IS NULL) DESC,
        ua.expires_at DESC NULLS LAST,
        ua.started_at DESC NULLS LAST,
        ua.created_at DESC NULLS LAST,
        ua.id DESC
    ) AS keep_rank
  FROM public.user_access ua
), duplicate_access AS (
  SELECT *
  FROM ranked_access
  WHERE keep_rank > 1
)
INSERT INTO public.user_access_duplicate_archive (original_id, user_id, product_slug, original_row)
SELECT id, user_id, product_slug, to_jsonb(duplicate_access) - 'keep_rank'
FROM duplicate_access
ON CONFLICT (original_id) DO NOTHING;

WITH ranked_access AS (
  SELECT
    ua.id,
    row_number() OVER (
      PARTITION BY ua.user_id, ua.product_slug
      ORDER BY
        (ua.status = 'active') DESC,
        (ua.expires_at IS NULL) DESC,
        ua.expires_at DESC NULLS LAST,
        ua.started_at DESC NULLS LAST,
        ua.created_at DESC NULLS LAST,
        ua.id DESC
    ) AS keep_rank
  FROM public.user_access ua
)
DELETE FROM public.user_access ua
USING ranked_access ranked
WHERE ua.id = ranked.id
  AND ranked.keep_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_access'
      AND i.indisunique
      AND i.indisvalid
      AND (
        SELECT array_agg(a.attname ORDER BY key_columns.ordinality)
        FROM unnest(i.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key_columns.attnum
      ) = ARRAY['user_id', 'product_slug']
  ) THEN
    CREATE UNIQUE INDEX idx_user_access_user_id_product_slug_unique
      ON public.user_access (user_id, product_slug);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.packages') IS NOT NULL THEN
    UPDATE public.packages
    SET
      description = package_copy.description,
      features = package_copy.features::jsonb,
      updated_at = now()
    FROM (VALUES
      ('free_preview',
       'Explore HashiBot before subscribing. View sample signal format, package options, risk guidance, and onboarding flow.',
       '["Public dashboard preview","Sample signal format","Package comparison","Telegram setup guide","No live signal access","No Bot controls"]'),
      ('crypto_signal_room',
       'Monthly crypto Signal Room access.',
       '["Active crypto signals","Signal history","Telegram onboarding","Package status","Signal-only. No automated execution."]'),
      ('crypto_personal_bot',
       'Includes Crypto Signal Room. Managed crypto Bot setup for personal trading mode.',
       '["Includes Crypto Signal Room","Managed crypto Bot setup for personal trading mode","Risk preset collected during setup","Execution is activated only after setup and verification"]'),
      ('forex_mt5_personal_bot',
       'Includes Signal Room. Managed MT5 forex Bot setup for personal trading mode.',
       '["Includes Signal Room","Managed MT5 forex Bot setup for personal trading mode","Risk preset collected during setup","MT5 connection is activated only after setup and verification"]'),
      ('forex_mt5_prop_bot',
       'Includes Signal Room. Managed MT5 forex Bot setup for prop-safe trading.',
       '["Includes Signal Room","Managed MT5 forex Bot setup for prop-safe trading","Conservative / Prop Safe risk profile","Built for rule protection and controlled risk"]')
    ) AS package_copy(slug, description, features)
    WHERE public.packages.slug = package_copy.slug;
  END IF;
END $$;
