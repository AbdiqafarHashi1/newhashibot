/*
  Customer navigation/pricing clarity refresh.
  Safe package copy/price alignment only; no scanner, provider, Telegram, risk, outcome, or execution behavior changes.
*/

INSERT INTO public.packages (name, slug, package_name, package_slug, price, price_kes, currency, billing_period, duration_days, active, is_active, telegram_access_required, description, sort_order, features)
VALUES
  ('Free Preview', 'free_preview', 'Free Preview', 'free_preview', 0, 0, 'KES', '7-day preview', 7, true, true, false,
   '7-day locked preview of the customer dashboard and onboarding flow before paid Signal Room access.', 0,
   '["7-day dashboard preview","Submit Telegram details for onboarding","Locked previews only — no full signal details","Manual admin upgrade path"]'),
  ('Crypto Signal Room', 'crypto_signal_room', 'Crypto Signal Room', 'crypto_signal_room', 5000, 5000, 'KES', 'monthly', 30, true, true, true,
   'Main live product: monthly crypto Signal Mode access with Telegram Signal Room onboarding.', 1,
   '["Crypto Signal Mode access","Active signals and full signal details","Telegram Signal Room onboarding","Signal history/results","Risk and leverage guidance","Performance transparency"]'),
  ('Premium Crypto Signals', 'premium_crypto_signals', 'Premium Crypto Signals', 'premium_crypto_signals', 0, NULL, 'KES', 'future upgrade', 30, true, true, true,
   'Optional future high-touch upgrade. Crypto Signal Room remains the standard signal access package.', 2,
   '["Future/contact-admin upgrade, not the default product","Priority updates and higher-touch notes planned","Expanded coverage planned","No guaranteed profit claims"]'),
  ('Personal EA Setup', 'personal_mode_setup', 'Personal EA Setup', 'personal_mode_setup', 10000, 10000, 'KES', 'monthly waitlist', NULL, false, false, false,
   'Coming soon setup waitlist. Planned personal-mode onboarding package; live execution and order placement are not available.', 3,
   '["10,000 KES/month or $100/month expectation","Aggressive personal-mode profile planned","Demo connector planned first","Crypto-first, forex later","No live order placement currently"]'),
  ('Prop EA Setup', 'prop_mode_setup', 'Prop EA Setup', 'prop_mode_setup', 10000, 10000, 'KES', 'monthly waitlist', NULL, false, false, false,
   'Coming soon setup waitlist. Planned prop-safe onboarding package; live execution and order placement are not available.', 4,
   '["10,000 KES/month or $100/month expectation","Prop-safe conservative profile planned","Drawdown/rule protection planned","Demo connector planned first","No live order placement currently"]')
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
