/*
  # C4 Signal Room commercial package refresh

  Safe, non-destructive additions/updates for manual paid Signal Room launch.
  - Adds optional KES/package display fields if missing.
  - Allows manual payment failure status in checks if a project has added constraints.
  - Refreshes package seed copy without enabling execution products.
*/

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS price_kes numeric;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS billing_period text;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS package_name text;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS package_slug text;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.packages
SET
  package_name = name,
  package_slug = slug,
  is_active = active,
  billing_period = CASE
    WHEN duration_days = 30 THEN 'monthly'
    WHEN duration_days = 7 THEN '7-day preview'
    WHEN duration_days IS NULL THEN 'contact admin'
    ELSE duration_days::text || ' days'
  END,
  price_kes = CASE
    WHEN slug = 'crypto_signal_room' THEN 5000
    WHEN slug = 'free_preview' THEN 0
    ELSE price_kes
  END;

INSERT INTO public.packages (name, slug, package_name, package_slug, price, price_kes, currency, billing_period, duration_days, active, is_active, telegram_access_required, description, sort_order, features)
VALUES
  ('Free Preview', 'free_preview', 'Free Preview', 'free_preview', 0, 0, 'KES', '7-day preview', 7, true, true, false,
   'Locked preview and onboarding path for customers who have not purchased Signal Room access.', 0,
   '["Preview customer dashboard","Submit Telegram details","Manual upgrade path","No full active signal details"]'),
  ('Crypto Signal Room', 'crypto_signal_room', 'Crypto Signal Room', 'crypto_signal_room', 5000, 5000, 'KES', 'monthly', 30, true, true, true,
   'Monthly access to live crypto Signal Mode dashboard, signal history, risk guidance, and manual Telegram Signal Room onboarding.', 1,
   '["Live crypto Signal Mode access","Active signals and details","Signal history/results","Risk and leverage guidance","Manual Telegram Signal Room invite after approval"]'),
  ('Premium Crypto Signals', 'premium_crypto_signals', 'Premium Crypto Signals', 'premium_crypto_signals', 0, NULL, 'KES', 'contact admin', 30, true, true, true,
   'Placeholder premium crypto package. Contact admin for availability and pricing.', 2,
   '["Contact admin for pricing","Expanded crypto coverage planned","No guaranteed profit claims"]'),
  ('Personal Mode Setup', 'personal_mode_setup', 'Personal Mode Setup', 'personal_mode_setup', 0, NULL, 'KES', 'coming soon', NULL, false, false, false,
   'Coming soon setup waitlist. Personal/MT5 execution is not live and no orders are placed.', 3,
   '["Coming soon","Setup waitlist only","Execution is not live","No order placement"]'),
  ('Prop Mode Setup', 'prop_mode_setup', 'Prop Mode Setup', 'prop_mode_setup', 0, NULL, 'KES', 'coming soon', NULL, false, false, false,
   'Coming soon setup waitlist. Prop execution is not live and no orders are placed.', 4,
   '["Coming soon","Setup waitlist only","Execution is not live","No order placement"]')
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
