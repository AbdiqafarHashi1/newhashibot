-- Provider submission claims are committed before making an external request.
alter table public.commerce_checkout_sessions add column if not exists provider_action_url text;
create or replace function public.claim_commerce_provider_submission(p_checkout_id uuid,p_customer_id uuid,p_attempt_id uuid default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare c commerce_checkout_sessions; a commerce_payment_attempts;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into c from commerce_checkout_sessions where id=p_checkout_id and customer_id=p_customer_id for update;
 if not found or c.status not in('CREATED','SLOT_RESERVED') or c.expires_at<=now() then return false;end if;
 if c.provider='MPESA' then
  select * into a from commerce_payment_attempts where id=p_attempt_id and checkout_session_id=c.id and customer_id=c.customer_id and provider='MPESA' for update;
  if not found or a.provider_state<>'STK_NOT_SENT' then return false;end if;
  update commerce_payment_attempts set provider_state='SUBMISSION_IN_PROGRESS',state='PENDING' where id=a.id;
 end if;
 update commerce_checkout_sessions set status='PROVIDER_PENDING' where id=c.id;return true;
end$$;
revoke all on function public.claim_commerce_provider_submission(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_commerce_provider_submission(uuid,uuid,uuid) to service_role;

-- The canonical execution binding is independent of the retired manual-receipt workflow.
create table public.customer_execution_strategy_bindings(
 execution_account_id uuid primary key references public.connected_execution_accounts(id),customer_id uuid not null references auth.users(id),
 product text not null,qualified_set_id text not null,qualified_set_version text not null,state text not null check(state in('ACTIVE','PAUSED')),
 activated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.customer_execution_strategy_bindings enable row level security;
revoke all on public.customer_execution_strategy_bindings from public,anon,authenticated;
grant select on public.customer_execution_strategy_bindings to authenticated;
grant all on public.customer_execution_strategy_bindings to service_role;
create policy customer_execution_strategy_binding_read on public.customer_execution_strategy_bindings for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());

create or replace function public.set_customer_account_runtime(p_actor_id uuid,p_customer_id uuid,p_account_id uuid,p_control text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;qualified jsonb;product text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_actor_id is distinct from p_customer_id and not exists(select 1 from profiles where id=p_actor_id and role='admin') then raise exception 'ACCOUNT_CONTROL_ACCESS_DENIED';end if;
 if p_control not in('START','RESUME','PAUSE_NEW_ENTRIES','STOP_AFTER_FLAT','MANAGE_ONLY') then raise exception 'UNSUPPORTED_ACCOUNT_CONTROL';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if p_control in('START','RESUME') then
  if not((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP','MT5') and upper(a.environment)='DEMO')) then raise exception 'DEMO_ENVIRONMENT_REQUIRED';end if;
  if a.enabled is distinct from true or upper(a.provider_health) is distinct from 'HEALTHY' or a.last_synchronized_at is null or a.last_synchronized_at<now()-interval '60 seconds' or a.last_synchronized_at>now()+interval '5 seconds' then raise exception 'CURRENT_PROVIDER_HEALTH_REQUIRED';end if;
  if a.phase_h_certification_status is distinct from 'PASSED' then raise exception 'ACCOUNT_DEMO_CERTIFICATION_REQUIRED';end if;
  if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id and p.state='SUCCEEDED' where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.product_code='FOUNDING_AUTO_EXECUTION' and e.execution_account_id=a.id and e.valid_until>now()) then raise exception 'VERIFIED_ACCOUNT_PAYMENT_REQUIRED';end if;
  if not exists(select 1 from account_brain_assignments b where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.superseded_at is null and b.policy_version=a.policy_version) then raise exception 'CURRENT_BRAIN_REQUIRED';end if;
  if not exists(select 1 from risk_acknowledgements r where r.customer_id=a.customer_id and r.execution_account_id=a.id) then raise exception 'RISK_ACKNOWLEDGEMENT_REQUIRED';end if;
  if exists(select 1 from phase_n_account_operations_safe x where x.account_id=a.id and (x.submission_uncertain or x.open_protection_incident)) then raise exception 'ACCOUNT_RECONCILIATION_REQUIRED';end if;
  product:=case when upper(a.provider) like 'MT5%' then 'FOREX_' else 'CRYPTO_' end||case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end;
  select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=product||'_QUALIFIED_SET' order by created_at desc limit 1;
  if qualified->>'setVersion' is null or jsonb_array_length(coalesce(qualified->'entries','[]'::jsonb))=0 then raise exception 'QUALIFIED_STRATEGY_SET_REQUIRED';end if;
  insert into customer_execution_strategy_bindings(execution_account_id,customer_id,product,qualified_set_id,qualified_set_version,state,activated_by) values(a.id,a.customer_id,product,qualified->>'id',qualified->>'setVersion','ACTIVE',p_actor_id)
  on conflict(execution_account_id) do update set qualified_set_id=excluded.qualified_set_id,qualified_set_version=excluded.qualified_set_version,state='ACTIVE',activated_by=excluded.activated_by,updated_at=now();
 end if;
 update connected_execution_accounts set runtime_control=p_control,execution_enabled=case when p_control in('START','RESUME') then true else execution_enabled end,updated_at=now() where id=a.id and customer_id=a.customer_id;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(a.customer_id,a.id,p_actor_id,'ACCOUNT_RUNTIME_CONTROL',jsonb_build_object('control',p_control,'protection_unchanged',true));
 return jsonb_build_object('execution_account_id',a.id,'runtime_control',p_control,'protection_enabled',true);
end$$;
revoke all on function public.set_customer_account_runtime(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_customer_account_runtime(uuid,uuid,uuid,text) to service_role;

-- Phase D consumes only the canonical paid/readiness activation binding.
create or replace function public.load_production_account_authorization_input(p_customer_id uuid,p_account_id uuid,p_signal_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;s signals;c provider_connections;b account_brain_assignments;proof jsonb;strategy jsonb;qualified jsonb;binding jsonb;e jsonb;history jsonb;result jsonb;execution_product text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if not((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO')) then raise exception 'SANDBOX_REQUIRED';end if;
 select * into s from signals where id=p_signal_id and source='scanner' and signal_identity is not null;
 if not found then raise exception 'CANONICAL_SIGNAL_REQUIRED';end if;
 select * into c from provider_connections where execution_account_id=a.id and customer_id=a.customer_id;
 select * into b from account_brain_assignments where execution_account_id=a.id and customer_id=a.customer_id and superseded_at is null;
 execution_product:=case when upper(a.provider) like 'MT5_%' then 'FOREX_' else 'CRYPTO_' end||case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end;
 select strategy_plan into strategy from certified_strategy_plans where candidate_id=s.candidate_id and strategy_id=s.strategy_id and strategy_version=s.strategy_version order by persisted_at desc limit 1;
 select to_jsonb(p) into binding from customer_execution_strategy_bindings p where execution_account_id=a.id and customer_id=a.customer_id and p.product=execution_product;
 select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=execution_product||'_QUALIFIED_SET' order by created_at desc limit 1;
 select to_jsonb(x) into proof from account_policy_evidence x where execution_account_id=a.id and customer_id=a.customer_id and execution_instance_id=a.execution_instance_id and credential_ref=a.credential_ref and provider=upper(a.provider) and symbol=s.symbol order by observed_at desc limit 1;
 select jsonb_build_object('closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from crypto_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state='CLOSED'),'[]'::jsonb),'mt5_closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from mt5_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state='TP2_CLOSED'),'[]'::jsonb),'outcomes',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from account_closed_provider_outcomes o where o.customer_id=a.customer_id and o.execution_account_id=a.id),'[]'::jsonb)) into history;
 select to_jsonb(h) into e from execution_entitlement_bindings x join phase_h_entitlements h on h.id=x.entitlement_id and h.customer_id=x.customer_id where x.customer_id=a.customer_id and x.execution_account_id=a.id and x.state='ACTIVE' and h.state in('ACTIVE','TRIAL','GRACE') and h.source<>'NOT_CONFIGURED' and (h.valid_until is null or h.valid_until>now()) limit 1;
 result:=jsonb_build_object('account',to_jsonb(a)-array['credential_ref'],'signal',to_jsonb(s),'assignment',to_jsonb(b),'connection',to_jsonb(c)-array['secret_reference'],'policy',a.policy_overrides->'base_policy','context',proof->'account_context','observed_at',coalesce(proof->>'observed_at',proof->>'captured_at'),'contract',proof->'contract_specification','routing_policy',proof->'routing_policy','capabilities',proof->'capabilities','strategy_plan',strategy,'qualified_set',qualified,'provisioning',binding,'product',execution_product,'entitlement',jsonb_build_object('state',case when e is null then 'INACTIVE' else 'ACTIVE' end,'expiresAt',e->>'valid_until'),'history_fingerprint',encode(sha256(convert_to(history::text,'UTF8')),'hex'),'pending_orders',(proof->>'pending_orders')::integer,'active_symbol_conflict',exists(select 1 from execution_orders x where x.customer_id=a.customer_id and x.account_id=a.account_id::text and x.symbol=s.symbol and x.status in('entry_submitted','entry_filled','protected','protected_native','partially_closed','protection_pending','protection_failed')));
 return result||jsonb_build_object('evidence_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end$$;
revoke all on function public.load_production_account_authorization_input(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_production_account_authorization_input(uuid,uuid,uuid) to service_role;

revoke all on function public.load_production_account_authorization_input(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_production_account_authorization_input(uuid,uuid,uuid) to service_role;
