-- Phase 5D hotfix: certified runtime account IDs are text while the canonical
-- MT5 account and command IDs are UUIDs. Keep the cast on the UUID operand so
-- malformed runtime text can never abort read-only/empty-queue polling.
CREATE OR REPLACE FUNCTION public.claim_mt5_command(
  p_account_id uuid, p_owner_id uuid, p_bridge_id text, p_worker_id text)
RETURNS SETOF public.mt5_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed public.mt5_commands;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.mt5_accounts a
     WHERE a.id = p_account_id
       AND a.user_id = p_owner_id
       AND a.bridge_id = p_bridge_id
  ) THEN
    RAISE EXCEPTION 'BRIDGE_ACCOUNT_SCOPE_MISMATCH';
  END IF;

  SELECT * INTO claimed
    FROM public.mt5_commands c
   WHERE c.account_id = p_account_id
     AND c.bridge_id = p_bridge_id
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.status = 'received' OR (
       c.status = 'accepted'
       AND c.claimed_at < now() - interval '2 minutes'
     ))
     AND (c.operation <> 'OPEN_POSITION' OR (
       c.payload->>'certified' = 'true'
       AND c.payload->>'deterministic_identity' = c.idempotency_key
       AND EXISTS (
         SELECT 1
           FROM public.certified_runtime_claims r
          WHERE r.execution_plan_id = c.payload->>'execution_plan_id'
            AND r.account_id = c.account_id::text
            AND r.state = 'completed'
       )
     ))
   ORDER BY c.created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  -- SETOF functions return an empty set normally when no eligible command is
  -- present, including read-only TEST_CONNECTION/SYNC_ACCOUNT polling cycles.
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.mt5_commands
     SET status = 'accepted',
         claimed_at = now(),
         worker_id = p_worker_id,
         attempts = attempts + 1
   WHERE id = claimed.id
   RETURNING * INTO claimed;

  RETURN NEXT claimed;
END $$;

REVOKE ALL ON FUNCTION public.claim_mt5_command(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mt5_command(uuid,uuid,text,text) TO service_role;
