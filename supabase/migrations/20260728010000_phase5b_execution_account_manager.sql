-- Phase 5B account administration contract. Credentials remain exclusively in
-- Vault; an account may be created before its opaque Vault UUID is assigned.
ALTER TABLE public.connected_execution_accounts
  ALTER COLUMN credential_ref DROP NOT NULL;

ALTER TABLE public.connected_execution_accounts
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_provider_environment_check;
ALTER TABLE public.connected_execution_accounts
  ADD CONSTRAINT connected_execution_accounts_provider_environment_check CHECK (
    (provider = 'binance' AND environment = 'testnet') OR
    (provider = 'bybit' AND environment = 'demo')
  ) NOT VALID;

COMMENT ON COLUMN public.connected_execution_accounts.credential_ref IS
  'Nullable opaque Vault secret UUID. Plaintext credentials are forbidden.';

NOTIFY pgrst, 'reload schema';
