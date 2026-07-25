-- Mark existing connected accounts as explicit platform operational accounts.
-- Credentials remain in Vault and customer ownership remains immutable.  No
-- account is opted in by this migration; an administrator must deliberately
-- designate the test account through a backend-only workflow.
ALTER TABLE public.connected_execution_accounts
  ADD COLUMN IF NOT EXISTS is_operational boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS connected_execution_accounts_one_operational_scope
  ON public.connected_execution_accounts(provider, environment)
  WHERE is_operational AND enabled;

COMMENT ON COLUMN public.connected_execution_accounts.is_operational IS
  'Explicit platform diagnostic account. Never inferred from a customer account and never exposes its Vault credential.';
