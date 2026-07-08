-- 20260708150000_096_crypto_certification_framework.sql
-- Additive migration for HashiBot Crypto Certification Framework, Chaos Testing, and Audits.

CREATE TABLE IF NOT EXISTS public.crypto_certification_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id text UNIQUE NOT NULL,
  scenario_name text NOT NULL,
  category text NOT NULL, -- 'PASS', 'WARNING', 'FAIL', 'UNKNOWN'
  symbol text NOT NULL,
  provider text NOT NULL,
  execution_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  supervisor_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  protection_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  recovery_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  telegram_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_healed boolean DEFAULT false,
  latency_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexing for performance and analytical scans
CREATE INDEX IF NOT EXISTS idx_cca_scenario_category ON public.crypto_certification_audits(scenario_name, category);
CREATE INDEX IF NOT EXISTS idx_cca_provider_symbol ON public.crypto_certification_audits(provider, symbol);
CREATE INDEX IF NOT EXISTS idx_cca_created_at ON public.crypto_certification_audits(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.crypto_certification_audits ENABLE ROW LEVEL SECURITY;

-- Admins can read/write everything in certification audits
DROP POLICY IF EXISTS "Admins can manage certification audits" ON public.crypto_certification_audits;
CREATE POLICY "Admins can manage certification audits" ON public.crypto_certification_audits
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Service role has full control
DROP POLICY IF EXISTS "Service role can manage certification audits" ON public.crypto_certification_audits;
CREATE POLICY "Service role can manage certification audits" ON public.crypto_certification_audits
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
