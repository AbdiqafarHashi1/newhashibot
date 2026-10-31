-- Pending plans cannot authorize or dispatch new entries. Existing protection and closes remain available.
create function public.assert_confirmed_account_entry(p_customer uuid,p_account uuid,p_signal uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from signals s join signal_updates u on u.signal_id=s.id
 where s.id=p_signal and s.source='scanner' and s.status='active' and s.expires_at>clock_timestamp()
 and u.new_status='active' and u.reason in('entry_trigger','candle_entry_trigger','conditional_close_confirmed')
 and u.price>0 and u.price::text not in('NaN','Infinity','-Infinity')
 and u.created_at>=s.created_at and u.created_at<=clock_timestamp() and u.created_at<s.expires_at) then raise exception 'PERSISTED_ENTRY_CONFIRMATION_REQUIRED';end if;
 if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id
 where b.customer_id=p_customer and b.execution_account_id=p_account and b.state='ACTIVE'
 and e.execution_account_id=p_account and e.state='ACTIVE' and e.source<>'NOT_CONFIGURED' and e.valid_until>clock_timestamp()) then raise exception 'FINITE_ACTIVE_EXECUTION_ACCESS_REQUIRED';end if;
end$$;
revoke all on function public.assert_confirmed_account_entry(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_confirmed_account_entry(uuid,uuid,uuid) to service_role;
create function public.guard_confirmed_account_decision() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.decision in('ALLOW','REDUCE') then perform assert_confirmed_account_entry(new.customer_id,new.execution_account_id,new.signal_id);end if;return new;end$$;
revoke all on function public.guard_confirmed_account_decision() from public,anon,authenticated;
create trigger confirmed_account_decision before insert or update on public.execution_account_policy_decisions for each row execute function public.guard_confirmed_account_decision();
create function public.guard_confirmed_crypto_submission() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 perform assert_confirmed_account_entry(new.customer_id,new.execution_account_id,new.signal_id);return new;end$$;
revoke all on function public.guard_confirmed_crypto_submission() from public,anon,authenticated;
create trigger confirmed_crypto_submission before insert on public.crypto_account_execution_truth for each row execute function public.guard_confirmed_crypto_submission();
create function public.guard_confirmed_mt5_submission() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.operation='OPEN_POSITION' and (tg_op='INSERT' or new.status='accepted') then
  perform assert_confirmed_account_entry(d.customer_id,d.execution_account_id,d.signal_id) from execution_account_policy_decisions d where d.id=new.payload->>'phase_d_decision_id';
  if not found then raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE';end if;
 end if;return new;end$$;
revoke all on function public.guard_confirmed_mt5_submission() from public,anon,authenticated;
create trigger confirmed_mt5_submission before insert or update of status on public.mt5_commands for each row execute function public.guard_confirmed_mt5_submission();

-- Each newly verified execution payment grants at most 30 days from its activation.
-- Never create a payment, extend a provider period, or grant access from this trigger.
create function public.bound_execution_access_period() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.product_code in('FOUNDING_AUTO_EXECUTION','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION') and new.state='ACTIVE' then
  if tg_op='INSERT' then new.valid_until:=least(coalesce(new.valid_until,clock_timestamp()+interval '30 days'),clock_timestamp()+interval '30 days');
  elsif new.source_payment_id is distinct from old.source_payment_id or old.state is distinct from 'ACTIVE' then
   new.valid_until:=least(coalesce(new.valid_until,clock_timestamp()+interval '30 days'),clock_timestamp()+interval '30 days');
  elsif new.valid_until is null then raise exception 'FINITE_EXECUTION_ACCESS_REQUIRED';end if;
 end if;return new;end$$;
revoke all on function public.bound_execution_access_period() from public,anon,authenticated;
create trigger bound_execution_access_period before insert or update on public.phase_h_entitlements for each row execute function public.bound_execution_access_period();

-- First-month business targets are separate from the longer-term 1,000-member funnel.
create function public.first_month_launch_overview() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with paid as(select e.customer_id,e.product_code from phase_h_entitlements e join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id
 where e.state='ACTIVE' and e.source like 'VERIFIED\_%' escape '\' and e.revoked_at is null and e.valid_from<=now() and e.valid_until>now() and p.state='SUCCEEDED')
 select jsonb_build_object('observed_at',statement_timestamp(),'signal_target',50,'execution_target',30,
 'paid_signals',(select count(distinct customer_id) from paid where product_code='VIP_SIGNALS'),
 'paid_execution',(select count(distinct customer_id) from paid where product_code in('FOUNDING_AUTO_EXECUTION','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION')),
 'scope','Distinct currently paying customers; owner allowances and unverified payments excluded. First-month targets, not a forecast.');
$$;
revoke all on function public.first_month_launch_overview() from public,anon,authenticated;
grant execute on function public.first_month_launch_overview() to service_role;

-- Expired open commands must not starve protective/close commands behind them.
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
       EXISTS (
         SELECT 1 FROM public.execution_account_policy_decisions d
         JOIN public.execution_entitlement_bindings b ON b.execution_account_id=d.execution_account_id AND b.customer_id=d.customer_id AND b.state='ACTIVE'
         JOIN public.phase_h_entitlements e ON e.id=b.entitlement_id AND e.customer_id=d.customer_id AND e.execution_account_id=d.execution_account_id
         JOIN public.signals s ON s.id=d.signal_id
         WHERE d.id=c.payload->>'phase_d_decision_id' AND d.customer_id=p_owner_id AND d.decision IN('ALLOW','REDUCE')
           AND e.state='ACTIVE' AND e.source<>'NOT_CONFIGURED' AND e.valid_until>clock_timestamp()
           AND s.source='scanner' AND s.status='active' AND s.expires_at>clock_timestamp()
           AND EXISTS(SELECT 1 FROM public.signal_updates u WHERE u.signal_id=s.id AND u.new_status='active' AND u.reason IN('entry_trigger','candle_entry_trigger','conditional_close_confirmed') AND u.price>0 AND u.price::text NOT IN('NaN','Infinity','-Infinity') AND u.created_at>=s.created_at AND u.created_at<=clock_timestamp() AND u.created_at<s.expires_at)
       )
       AND c.payload->>'certified' = 'true'
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
