-- Preserve the canonical E queue while separating logical account and verified terminal identities.
create or replace function public.enqueue_phase_e_mt5_intent(
  p_decision_id text,p_execution_plan_id text,p_mt5_account_id uuid,p_bridge_id text,
  p_idempotency_key text,p_payload jsonb)
returns table(command_id uuid,status text) language plpgsql security definer set search_path=public as $$
declare d public.execution_account_policy_decisions; e public.connected_execution_accounts;
        a public.mt5_accounts; b public.mt5_bridge_registry; c public.mt5_commands;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into d from public.execution_account_policy_decisions where id=p_decision_id for update;
  if not found or d.decision is null or d.decision not in('ALLOW','REDUCE') or d.intent_id is null or d.approved_quantity is null or d.approved_quantity<=0 or d.authorized_risk_pct is null or d.authorized_risk_pct<=0 or d.created_at<clock_timestamp()-interval '120 seconds' or d.created_at>clock_timestamp() then
    raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE'; end if;
  select * into e from public.connected_execution_accounts where id=d.execution_account_id for update;
  if not found then raise exception 'MT5_ACCOUNT_SCOPE_MISMATCH';end if;
  select * into a from public.mt5_accounts where id=p_mt5_account_id for update;
  if not found then raise exception 'MT5_ACCOUNT_SCOPE_MISMATCH';end if;
  select * into b from public.mt5_bridge_registry where bridge_id=p_bridge_id;
  if not found then raise exception 'MT5_BRIDGE_OFFLINE';end if;
  if e.customer_id is distinct from d.customer_id or a.user_id is distinct from d.customer_id or e.provider_account_identity is distinct from a.id::text
     or coalesce(e.policy_overrides->>'mt5_account_id',e.account_id) is distinct from a.id::text
     or (e.policy_overrides ? 'mt5_account_id' and e.policy_overrides->>'bridge_id' is distinct from p_bridge_id) then raise exception 'MT5_ACCOUNT_SCOPE_MISMATCH'; end if;
  if e.provider is null or e.provider not in('MT5_PERSONAL','MT5_PROP') or lower(e.environment) is distinct from 'demo' then raise exception 'LIVE_EXECUTION_FORBIDDEN'; end if;
  if a.bridge_id is distinct from p_bridge_id or b.revoked_at is not null or (b.lease_expires_at is null or b.lease_expires_at<=clock_timestamp())
     or b.status is null or b.status not in('online','healthy') then raise exception 'MT5_BRIDGE_OFFLINE'; end if;
  if e.enabled is not true or e.execution_enabled is not true or e.is_operational is not true or a.execution_enabled is not true or a.operational is not true
     or a.provider_health is distinct from 'healthy' or a.last_heartbeat_at is null or a.last_heartbeat_at>clock_timestamp() or a.last_heartbeat_at<clock_timestamp()-interval '45 seconds' then raise exception 'MT5_ACCOUNT_NOT_READY'; end if;
  if p_payload->>'phase_d_decision_id' is distinct from d.id or p_payload->>'phase_d_intent_id' is distinct from d.intent_id
     or p_payload->>'customer_id' is distinct from d.customer_id::text or p_payload->>'execution_account_id' is distinct from d.execution_account_id::text
     or (p_payload->>'quantity')::numeric is distinct from d.approved_quantity or (p_payload->>'authorized_risk_pct')::numeric is distinct from d.authorized_risk_pct
     or coalesce((p_payload->>'stop_loss')::numeric,0)<=0 then raise exception 'MT5_PHASE_E_LINEAGE_MISMATCH'; end if;
  if nullif(p_idempotency_key,'') is null or nullif(p_execution_plan_id,'') is null then raise exception 'MT5_INTENT_IDENTITY_REQUIRED';end if;
  if exists(select 1 from public.mt5_commands where account_id=a.id and idempotency_key=p_idempotency_key and (payload is distinct from p_payload or bridge_id is distinct from p_bridge_id or operation is distinct from 'OPEN_POSITION')) then raise exception 'MT5_INTENT_CONTENT_CONFLICT';end if;
  if exists(select 1 from public.mt5_account_execution_truth where execution_account_id=e.id and intent_id=d.intent_id and (execution_plan_id is distinct from p_execution_plan_id or bridge_id is distinct from p_bridge_id or mt5_account_id is distinct from a.id)) then raise exception 'MT5_INTENT_CONTENT_CONFLICT';end if;
  insert into public.mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,signal_id)
  values(a.id,p_bridge_id,'OPEN_POSITION',p_payload,p_idempotency_key,'received',a.policy,d.signal_id)
  on conflict(account_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into c;
  insert into public.mt5_account_execution_truth(customer_id,execution_account_id,mt5_account_id,bridge_id,signal_id,
    decision_id,intent_id,execution_plan_id,command_id,policy_profile_id,policy_version,brain_version,
    approved_quantity,authorized_risk_pct,lifecycle_state,lineage)
  values(d.customer_id,d.execution_account_id,a.id,p_bridge_id,d.signal_id,d.id,d.intent_id,p_execution_plan_id,c.id,
    d.policy_profile_id,d.policy_version,d.brain_version,d.approved_quantity,d.authorized_risk_pct,'QUEUED',
    jsonb_build_object('signal_id',d.signal_id,'decision_id',d.id,'intent_id',d.intent_id,'execution_plan_id',p_execution_plan_id,
      'command_id',c.id,'customer_id',d.customer_id,'execution_account_id',d.execution_account_id))
  on conflict(execution_account_id,intent_id) do update set updated_at=public.mt5_account_execution_truth.updated_at;
  return query select c.id,c.status;
end $$;
revoke all on function public.enqueue_phase_e_mt5_intent(text,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_phase_e_mt5_intent(text,text,uuid,text,text,jsonb) to service_role;


-- An administrator edits the same account policy as the customer, never a parallel risk table.
create function public.admin_assign_customer_account_brain(p_actor_id uuid,p_customer_id uuid,p_account_id uuid,p_risk numeric,p_strategies text[],p_idempotency_key text,p_policy jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 result:=public.assign_customer_account_brain(p_customer_id,p_account_id,p_risk,p_strategies,p_idempotency_key,p_policy);
 update public.account_brain_assignments set assigned_by=p_actor_id,assignment_reason='ADMIN_APPROVED_ACCOUNT_POLICY' where id=(result->>'assignment_id')::uuid and customer_id=p_customer_id and execution_account_id=p_account_id;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer_id,p_account_id,p_actor_id,'ADMIN_ACCOUNT_POLICY_ASSIGNED',result);
 return result;
end $$;
revoke all on function public.admin_assign_customer_account_brain(uuid,uuid,uuid,numeric,text[],text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_assign_customer_account_brain(uuid,uuid,uuid,numeric,text[],text,jsonb) to service_role;
