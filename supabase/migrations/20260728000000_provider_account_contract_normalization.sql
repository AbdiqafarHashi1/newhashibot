-- Provider account normalization. Secret values remain in Vault; account rows
-- contain only an opaque credential reference.
ALTER TABLE public.connected_execution_accounts
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS ownership_classification text NOT NULL DEFAULT 'customer'
    CHECK (ownership_classification IN ('customer','system','assigned_test_owner')),
  ADD COLUMN IF NOT EXISTS execution_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitor_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_profile_id uuid REFERENCES public.risk_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_health text NOT NULL DEFAULT 'unknown'
    CHECK (provider_health IN ('unknown','reachable','auth_failed','disconnected','degraded','blocked')),
  ADD COLUMN IF NOT EXISTS last_synchronized_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.connected_execution_accounts.enabled IS
  'Account is available for account-scoped runtime use; this does not enable ExecutionPlan adoption.';
COMMENT ON COLUMN public.connected_execution_accounts.execution_enabled IS
  'Explicit ExecutionPlan adoption gate. Defaults false and is never inferred from credential reachability.';
COMMENT ON COLUMN public.connected_execution_accounts.credential_ref IS
  'Opaque reference to Vault/encrypted credential storage; never a secret value.';

UPDATE public.connected_execution_accounts
SET display_label = initcap(provider) || ' ' || initcap(environment) || ' — ' || account_id::text
WHERE display_label IS NULL;
ALTER TABLE public.connected_execution_accounts ALTER COLUMN display_label SET NOT NULL;

-- Monitoring enumerates only canonical account identities. Existing account
-- rows stay enabled as before, while adoption remains safely disabled.
CREATE INDEX IF NOT EXISTS connected_execution_accounts_monitor_selection_idx
  ON public.connected_execution_accounts(provider, environment, monitor_enabled)
  WHERE enabled AND monitor_enabled;

-- Account-scoped heartbeat identity and canonical error contract. The table's
-- existing `errors jsonb` is intentionally retained; no duplicate `error`
-- column is introduced.
CREATE INDEX IF NOT EXISTS execution_monitor_heartbeats_account_started_idx
  ON public.execution_monitor_heartbeats(account_id, started_at DESC)
  WHERE account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
