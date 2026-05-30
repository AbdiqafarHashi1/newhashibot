/*
  # Packages and Customer Subscriptions

  ## Summary
  Introduces the commercial layer for HashiBot Signal Mode:
  a packages table (product tiers) and a customer_subscriptions table that
  links users to packages with full payment/access/Telegram lifecycle tracking.

  ## New Tables

  ### `packages`
  - `id` (uuid, primary key)
  - `name` TEXT — display name (e.g. "Crypto Signal Room")
  - `slug` TEXT UNIQUE — machine identifier
  - `price` NUMERIC — price in currency units
  - `currency` TEXT DEFAULT 'USD'
  - `duration_days` INT — subscription length; NULL = lifetime
  - `active` BOOLEAN DEFAULT true — whether package is currently sold
  - `features` JSONB — array of feature strings shown on pricing page
  - `telegram_access_required` BOOLEAN DEFAULT false
  - `description` TEXT
  - `sort_order` INT DEFAULT 0
  - `created_at` TIMESTAMPTZ DEFAULT now()
  - `updated_at` TIMESTAMPTZ DEFAULT now()

  ### `customer_subscriptions`
  - `id` (uuid, primary key)
  - `user_id` UUID — references auth.users (NULL allowed for pre-register customers)
  - `profile_id` UUID — references profiles.id (nullable for flexibility)
  - `email` TEXT NOT NULL — always stored, even if no auth user yet
  - `full_name` TEXT
  - `package_id` UUID — FK to packages
  - `package_name` TEXT — denormalized copy in case package is renamed
  - `payment_status` TEXT: 'pending' | 'paid' | 'expired' | 'cancelled'
  - `access_status` TEXT: 'active' | 'inactive' | 'expired'
  - `amount_paid` NUMERIC
  - `currency` TEXT DEFAULT 'USD'
  - `payment_reference` TEXT — receipt/invoice ref
  - `payment_method` TEXT — manual, mpesa, card, etc.
  - `starts_at` TIMESTAMPTZ
  - `expires_at` TIMESTAMPTZ
  - `telegram_status` TEXT: 'not_invited' | 'invited' | 'joined' | 'removed'
  - `telegram_username` TEXT
  - `telegram_chat_id` TEXT
  - `notes` TEXT
  - `admin_note` TEXT
  - `created_at` TIMESTAMPTZ DEFAULT now()
  - `updated_at` TIMESTAMPTZ DEFAULT now()

  ## Security
  - RLS enabled on both tables
  - Packages: public read; admin-only write
  - customer_subscriptions: admin full access; users can read their own row
*/

-- ─── packages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.packages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     text UNIQUE NOT NULL,
  price                    numeric NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'USD',
  duration_days            int,
  active                   boolean NOT NULL DEFAULT true,
  features                 jsonb NOT NULL DEFAULT '[]',
  telegram_access_required boolean NOT NULL DEFAULT false,
  description              text NOT NULL DEFAULT '',
  sort_order               int NOT NULL DEFAULT 0,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages"
  ON public.packages FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can view all packages"
  ON public.packages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert packages"
  ON public.packages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update packages"
  ON public.packages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─── customer_subscriptions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email               text NOT NULL,
  full_name           text NOT NULL DEFAULT '',
  package_id          uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  package_name        text NOT NULL DEFAULT '',
  payment_status      text NOT NULL DEFAULT 'pending',
  access_status       text NOT NULL DEFAULT 'inactive',
  amount_paid         numeric,
  currency            text NOT NULL DEFAULT 'USD',
  payment_reference   text NOT NULL DEFAULT '',
  payment_method      text NOT NULL DEFAULT 'manual',
  starts_at           timestamptz,
  expires_at          timestamptz,
  telegram_status     text NOT NULL DEFAULT 'not_invited',
  telegram_username   text NOT NULL DEFAULT '',
  telegram_chat_id    text NOT NULL DEFAULT '',
  notes               text NOT NULL DEFAULT '',
  admin_note          text NOT NULL DEFAULT '',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select customer_subscriptions"
  ON public.customer_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own subscription"
  ON public.customer_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert customer_subscriptions"
  ON public.customer_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update customer_subscriptions"
  ON public.customer_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_id    ON public.customer_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_email      ON public.customer_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_access     ON public.customer_subscriptions(access_status);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_payment    ON public.customer_subscriptions(payment_status);

-- ─── Seed packages ────────────────────────────────────────────────────────────

INSERT INTO public.packages (name, slug, price, currency, duration_days, active, telegram_access_required, description, sort_order, features)
VALUES
  (
    'Free Preview',
    'free_preview',
    0, 'USD', 7, true, false,
    'One week free access to see HashiBot signals in action.',
    0,
    '["7-day free access","Signal dashboard (read-only)","View live crypto signals","No Telegram delivery","Upgrade to unlock alerts"]'
  ),
  (
    'Crypto Signal Room',
    'crypto_signal_room',
    29, 'USD', 30, true, true,
    'Monthly access to the live crypto signal room with Telegram delivery.',
    1,
    '["30-day rolling access","Live BTC, ETH, SOL and 7+ more markets","A and A+ grade signals","Telegram group alerts","Signal dashboard & history","Entry zone, SL, TP1, TP2"]'
  ),
  (
    'Premium Crypto Signals',
    'premium_crypto_signals',
    49, 'USD', 30, true, true,
    'Premium plan with all markets, priority alerts, and full analytics.',
    2,
    '["Everything in Crypto Signal Room","20 crypto markets","Regime & confidence scoring","Priority Telegram alerts","Full signal history and analytics","Early access to new features"]'
  ),
  (
    'Personal Mode Setup',
    'personal_mode_setup',
    149, 'USD', NULL, false, false,
    'One-time setup of the Personal EA for MT5 auto-execution (coming soon).',
    3,
    '["MT5 auto-execution (coming soon)","Custom risk configuration","Personal account only","Setup & onboarding call","Ongoing signal delivery"]'
  ),
  (
    'Prop Mode Setup',
    'prop_mode_setup',
    199, 'USD', NULL, false, false,
    'One-time setup of the Prop EA for funded account trading (coming soon).',
    4,
    '["Built for funded accounts (coming soon)","FTMO & MyFundedFX support","Drawdown-aware position sizing","Conservative regime filters","Setup & onboarding call"]'
  )
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  price       = EXCLUDED.price,
  description = EXCLUDED.description,
  features    = EXCLUDED.features,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = now();
