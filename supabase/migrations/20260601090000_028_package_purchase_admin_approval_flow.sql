/*
  Package purchase/admin approval flow normalization.
  Safe commercial-layer changes only: packages, access request metadata, and RLS.
  No scanner, strategy, provider, Telegram delivery, outcome tracking, analytics, or execution logic changes.
*/

ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS payment_reference text DEFAULT '';
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS risk_preset text DEFAULT '';
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS contact_preference text DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.access_requests'::regclass
      AND conname = 'access_requests_status_check'
  ) THEN
    ALTER TABLE public.access_requests DROP CONSTRAINT access_requests_status_check;
  END IF;
END $$;

ALTER TABLE public.access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN ('pending_payment','pending_admin_approval','pending','approved','rejected','converted_to_access','cancelled','expired'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'access_requests'
      AND policyname = 'Users can update own pending access requests'
  ) THEN
    CREATE POLICY "Users can update own pending access requests"
      ON public.access_requests FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id AND status IN ('pending_payment','pending_admin_approval','pending','rejected'))
      WITH CHECK (auth.uid() = user_id AND status IN ('pending_payment','pending_admin_approval','pending'));
  END IF;
END $$;

INSERT INTO public.packages (name, slug, package_name, package_slug, price, price_kes, currency, billing_period, duration_days, active, is_active, telegram_access_required, description, sort_order, features)
VALUES
  ('Free Preview', 'free_preview', 'Free Preview', 'free_preview', 0, 0, 'KES', '7-day preview', 7, true, true, false,
   'Public preview and onboarding path before paid Signal Room or Bot access.', 0,
   '["Public preview only","Create an account and choose a package","No full signal access","No Bot controls"]'),
  ('Crypto Signal Room', 'crypto_signal_room', 'Crypto Signal Room', 'crypto_signal_room', 5000, 5000, 'KES', 'monthly', 30, true, true, true,
   'Monthly crypto Signal Mode dashboard access with manual Telegram Signal Room onboarding.', 1,
   '["Crypto Signal Mode access","Active signals and signal history","Telegram onboarding/status","Package/access status"]'),
  ('Crypto Personal Bot', 'crypto_personal_bot', 'Crypto Personal Bot', 'crypto_personal_bot', 10000, 10000, 'KES', 'monthly', 30, true, true, true,
   'Crypto Bot setup package. Signal Room is included; execution setup requires admin configuration.', 2,
   '["Includes Crypto Signal Room","Bot setup/status tracking","Risk preset request: Conservative, Balanced, or Aggressive","No live execution until configured by admin"]'),
  ('Forex MT5 Personal Bot', 'forex_mt5_personal_bot', 'Forex MT5 Personal Bot', 'forex_mt5_personal_bot', 10000, 10000, 'KES', 'monthly', 30, true, true, true,
   'Forex MT5 Bot setup package. Signal Mode is included; MT5 setup requires admin configuration.', 3,
   '["Includes Signal Mode access","MT5 setup/status tracking","Risk preset request: Conservative, Balanced, or Aggressive","No broker execution from this app"]'),
  ('Forex MT5 Prop Bot', 'forex_mt5_prop_bot', 'Forex MT5 Prop Bot', 'forex_mt5_prop_bot', 10000, 10000, 'KES', 'monthly', 30, true, true, true,
   'Prop-safe Forex MT5 Bot setup package. Signal Mode is included; admin setup is required.', 4,
   '["Includes Signal Mode access","Prop-safe positioning guidance","Default risk preset: Conservative / Prop Safe","No guaranteed profit wording or fake execution"]')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  package_name = EXCLUDED.package_name,
  package_slug = EXCLUDED.package_slug,
  price = EXCLUDED.price,
  price_kes = EXCLUDED.price_kes,
  currency = EXCLUDED.currency,
  billing_period = EXCLUDED.billing_period,
  duration_days = EXCLUDED.duration_days,
  active = EXCLUDED.active,
  is_active = EXCLUDED.is_active,
  telegram_access_required = EXCLUDED.telegram_access_required,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  features = EXCLUDED.features,
  updated_at = now();

UPDATE public.packages
SET active = false, is_active = false, updated_at = now()
WHERE slug IN ('premium_crypto_signals','personal_mode_setup','prop_mode_setup');
