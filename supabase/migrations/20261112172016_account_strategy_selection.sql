-- Exact account strategy permissions. Release eligibility, account risk and entitlement remain enforced.
create or replace function public.admin_set_account_strategies(p_actor uuid,p_customer uuid,p_account uuid,p_expected jsonb,p_strategies jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.connected_execution_accounts%rowtype; current_ids jsonb;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account and customer_id=p_customer for update;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if jsonb_typeof(p_strategies) is distinct from 'array' or jsonb_array_length(p_strategies)=0 or jsonb_array_length(p_strategies)>30 then raise exception 'STRATEGIES_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(p_strategies) s where jsonb_typeof(s)<>'string' or (s#>>'{}')!~case when upper(a.provider) like 'MT5%' then '^(forex\.|gold\.)' else '^crypto\.' end) then raise exception 'STRATEGY_MARKET_MISMATCH';end if;
 if a.environment='live' and exists(select 1 from jsonb_array_elements_text(p_strategies) s where s ~ '^(crypto\.launch-|forex\.native-|gold\.native-)') then raise exception 'DEMO_STRATEGY_ON_LIVE_ACCOUNT';end if;
 current_ids:=coalesce(a.policy_overrides->'policy_configuration'->'allowedStrategies','[]'::jsonb);
 if current_ids is distinct from p_expected then raise exception 'ACCOUNT_CONFIGURATION_CHANGED_RELOAD';end if;
 update public.connected_execution_accounts set execution_enabled=false,policy_overrides=coalesce(policy_overrides,'{}'::jsonb)||jsonb_build_object('admin_selected_strategies',p_strategies,'policy_configuration',coalesce(a.policy_overrides->'policy_configuration','{}'::jsonb)||jsonb_build_object('allowedStrategies',p_strategies)) where id=p_account and customer_id=p_customer;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer,p_account,p_actor,'ACCOUNT_STRATEGIES_SELECTED',jsonb_build_object('previous',current_ids,'selected',p_strategies,'environment',a.environment));
 return jsonb_build_object('strategies',p_strategies,'executionEnabled',false);
end $$;
revoke all on function public.admin_set_account_strategies(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_set_account_strategies(uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- Changing risk never silently replaces explicit per-account strategy selection.
create or replace function public.admin_assign_customer_account_brain(p_actor_id uuid,p_customer_id uuid,p_account_id uuid,p_risk numeric,p_strategies text[],p_idempotency_key text,p_policy jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; exact_ids jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 select policy_overrides->'admin_selected_strategies' into exact_ids from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 result:=public.assign_customer_account_brain(p_customer_id,p_account_id,p_risk,p_strategies,p_idempotency_key,p_policy);
 if exact_ids is not null then update public.connected_execution_accounts set policy_overrides=jsonb_set(policy_overrides,'{policy_configuration,allowedStrategies}',exact_ids) where id=p_account_id and customer_id=p_customer_id;end if;
 update public.account_brain_assignments set assigned_by=p_actor_id,assignment_reason='ADMIN_APPROVED_ACCOUNT_POLICY' where id=(result->>'assignment_id')::uuid and customer_id=p_customer_id and execution_account_id=p_account_id;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer_id,p_account_id,p_actor_id,'ADMIN_ACCOUNT_POLICY_ASSIGNED',result);
 return result;
end $$;
revoke all on function public.admin_assign_customer_account_brain(uuid,uuid,uuid,numeric,text[],text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_assign_customer_account_brain(uuid,uuid,uuid,numeric,text[],text,jsonb) to service_role;
