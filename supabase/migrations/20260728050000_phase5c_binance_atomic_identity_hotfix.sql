-- Phase 5C final crypto hotfix: an account identity is an atomic component of
-- customer:provider:account:instance.  Never relax the ':' scope delimiter.
-- The canonical UUID, Vault reference and all account state columns stay intact.
DO $$
DECLARE
  old_identity constant text := 'canonical:binance:testnet:system';
  new_identity constant text := 'canonical-binance-testnet-system';
  account_uuid uuid;
  dependent_count bigint;
  relation record;
BEGIN
  SELECT id INTO account_uuid
  FROM public.connected_execution_accounts
  WHERE provider='binance' AND environment='testnet'
    AND ownership_classification='system'
    AND (account_id=old_identity OR provider_account_identity=old_identity)
  FOR UPDATE;

  IF account_uuid IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.connected_execution_accounts
    WHERE id<>account_uuid AND customer_id=(SELECT customer_id FROM public.connected_execution_accounts WHERE id=account_uuid)
      AND provider='binance' AND environment='testnet'
      AND (account_id=new_identity OR provider_account_identity=new_identity)
  ) THEN
    RAISE EXCEPTION 'CANONICAL_IDENTITY_MISMATCH: atomic Binance identity already belongs to another canonical UUID';
  END IF;

  -- Repair denormalized ownership references, if any.  There are no foreign
  -- keys to the text identity (references to the account use its immutable UUID),
  -- but runtime truth tables intentionally copy account_id and scope keys.
  FOR relation IN
    SELECT n.nspname schema_name, c.relname table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attname='account_id'
      AND a.atttypid IN ('text'::regtype, 'varchar'::regtype)
      AND c.relname<>'connected_execution_accounts'
  LOOP
    EXECUTE format('UPDATE %I.%I SET account_id=$1 WHERE account_id=$2', relation.schema_name, relation.table_name)
      USING new_identity, old_identity;
  END LOOP;

  FOR relation IN
    SELECT n.nspname schema_name, c.relname table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attname='execution_scope_key'
      AND a.atttypid IN ('text'::regtype, 'varchar'::regtype)
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET execution_scope_key=replace(execution_scope_key,$1,$2) WHERE execution_scope_key LIKE $3',
      relation.schema_name, relation.table_name)
      USING ':'||old_identity||':', ':'||new_identity||':', '%:'||old_identity||':%';
  END LOOP;

  UPDATE public.connected_execution_accounts
  SET account_id=new_identity, provider_account_identity=new_identity, updated_at=now()
  WHERE id=account_uuid;
END $$;

ALTER TABLE public.connected_execution_accounts
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_account_id_check;
ALTER TABLE public.connected_execution_accounts
  ADD CONSTRAINT connected_execution_accounts_account_id_check CHECK (account_id !~ ':');
ALTER TABLE public.connected_execution_accounts
  DROP CONSTRAINT IF EXISTS connected_execution_accounts_provider_identity_atomic_check;
ALTER TABLE public.connected_execution_accounts
  ADD CONSTRAINT connected_execution_accounts_provider_identity_atomic_check
  CHECK (provider_account_identity IS NULL OR provider_account_identity !~ ':');

COMMENT ON COLUMN public.connected_execution_accounts.provider_account_identity IS
  'Atomic provider routing identity. canonical-binance-testnet-system is a canonical fallback, not a Binance-native UID.';
