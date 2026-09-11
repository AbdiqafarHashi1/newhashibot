-- Extend the existing authorized command queue with one read-only history operation.
CREATE OR REPLACE FUNCTION public.enqueue_mt5_command(p_account_id uuid,p_operation text,p_payload jsonb,p_idempotency_key text)
RETURNS TABLE(command_id uuid,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.mt5_accounts; c public.mt5_commands; op text:=upper(p_operation);
BEGIN
 SELECT * INTO a FROM public.mt5_accounts WHERE id=p_account_id AND (user_id=auth.uid() OR public.is_admin()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'mt5_account_not_found'; END IF;
 IF op NOT IN ('OPEN_POSITION','MODIFY_PROTECTION','PARTIAL_CLOSE','MOVE_TO_BREAKEVEN','CLOSE_POSITION','CANCEL_ORDER','SYNC_ACCOUNT','RECOVER_PROTECTION','TEST_CONNECTION','FETCH_HISTORY') THEN RAISE EXCEPTION 'mt5_operation_invalid'; END IF;
 IF a.bridge_id IS NULL THEN RAISE EXCEPTION 'MT5_BRIDGE_OFFLINE'; END IF;
 INSERT INTO public.mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy)
 VALUES(a.id,a.bridge_id,op,p_payload,p_idempotency_key,'received',a.policy)
 ON CONFLICT(account_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING * INTO c;
 RETURN QUERY SELECT c.id,c.status;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_mt5_command(uuid,text,jsonb,text) TO authenticated,service_role;
