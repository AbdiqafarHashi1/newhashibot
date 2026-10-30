-- Demo certification is earned from the existing provider lifecycle, never from connecting an account.
create function public.register_forward_certification() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;d execution_account_policy_decisions;plan jsonb;caps jsonb;begin
 select * into a from connected_execution_accounts where id=new.execution_account_id and customer_id=new.customer_id;
 if not found or upper(a.environment) not in('DEMO','TESTNET') then return new;end if;
 select * into d from execution_account_policy_decisions where id=new.decision_id and execution_account_id=a.id and customer_id=a.customer_id;
 select execution_plan into plan from certified_runtime_artifacts where account_id=a.id::text and execution_plan->>'execution_plan_id'=new.execution_plan_id;
 if d.id is null or d.decision not in('ALLOW','REDUCE') or plan is null or plan#>>'{risk_decision,decision_id}' is distinct from d.id then raise exception 'CERTIFICATION_CANONICAL_ATTEMPT_REQUIRED';end if;
 select capabilities into caps from provider_connections where execution_account_id=a.id and customer_id=a.customer_id;
 insert into customer_system_certification_runs(certification_reference,customer_id,execution_account_id,account_type,provider,environment,status,decision_id,signal_id,execution_intent_id,execution_plan_id,provider_client_order_id,strategy_id,strategy_version,symbol,side,requested_quantity,submitted_quantity,authorized_risk_pct,credential_capabilities,provider_health,protection_state,expires_at,reason_code)
 values('CUSTOMER_001',a.customer_id,a.id,case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end,upper(a.provider),upper(a.environment),'EXECUTION_SUBMITTED',d.id,d.signal_id,d.intent_id,new.execution_plan_id,coalesce(plan#>>'{orders,0,client_order_id}',new.execution_plan_id),plan#>>'{strategy_plan,identity,strategy_id}',plan#>>'{strategy_plan,identity,strategy_version}',plan#>>'{routing,canonical_symbol}',upper(plan#>>'{orders,0,side}'),d.approved_quantity,d.approved_quantity,d.authorized_risk_pct,coalesce(caps,'{}'),upper(a.provider_health),'REQUIRED',(plan#>>'{strategy_plan,entry_plan,expires_at}')::timestamptz,'DEMO_FORWARD_TEST')
 on conflict(execution_account_id,execution_plan_id) do nothing;
 return new;
end$$;
revoke all on function public.register_forward_certification() from public,anon,authenticated;
create trigger crypto_forward_certification after insert on public.crypto_account_execution_truth for each row execute function public.register_forward_certification();
create trigger mt5_forward_certification after insert on public.mt5_account_execution_truth for each row execute function public.register_forward_certification();

create function public.project_forward_certification() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare projected text;begin
 projected:=case new.lifecycle_state when 'PROTECTED' then 'PROTECTED' when 'PROTECTION_VERIFIED' then 'PROTECTED' when 'CLOSED' then 'CLOSED' when 'TP2_CLOSED' then 'CLOSED' when 'PROTECTION_INCIDENT' then 'PROTECTION_INCIDENT' when 'SUBMISSION_UNCERTAIN' then 'SUBMISSION_UNCERTAIN' when 'REJECTED' then 'FAILED' else null end;
 if projected is not null then
  update customer_system_certification_runs set status=projected,protection_state=case when projected='PROTECTED' then 'VERIFIED' when projected='PROTECTION_INCIDENT' then 'INCIDENT' else protection_state end,updated_at=clock_timestamp()
  where customer_id=new.customer_id and execution_account_id=new.execution_account_id and execution_plan_id=new.execution_plan_id and status not in('PASSED','FAILED','BLOCKED','PRECHECK_FAILED');
 end if;return new;
end$$;
revoke all on function public.project_forward_certification() from public,anon,authenticated;
create trigger crypto_forward_certification_projection after update of lifecycle_state on public.crypto_account_execution_truth for each row execute function public.project_forward_certification();
create trigger mt5_forward_certification_projection after update of lifecycle_state on public.mt5_account_execution_truth for each row execute function public.project_forward_certification();

-- Fills, protection and an attributed net outcome are all required. A positive P&L is not required and is never promised.
create function public.complete_forward_certification() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare plan_id text;t jsonb;r customer_system_certification_runs;a connected_execution_accounts;d execution_account_policy_decisions;begin
 if new.provider in('BINANCE','BYBIT') then select to_jsonb(x) into t from crypto_account_execution_truth x where x.id=new.execution_truth_id and x.execution_account_id=new.execution_account_id and x.customer_id=new.customer_id;
 else select to_jsonb(x) into t from mt5_account_execution_truth x where x.id=new.execution_truth_id and x.execution_account_id=new.execution_account_id and x.customer_id=new.customer_id;end if;
 if t is null or t->>'lifecycle_state' not in('CLOSED','TP2_CLOSED') or nullif(t->>'incident_code','') is not null then return new;end if;
 select * into a from connected_execution_accounts where id=new.execution_account_id and customer_id=new.customer_id;
 if upper(a.environment) not in('DEMO','TESTNET') then return new;end if;
 select * into r from customer_system_certification_runs where execution_account_id=a.id and customer_id=a.customer_id and execution_plan_id=t->>'execution_plan_id' and status='CLOSED' and protection_state='VERIFIED' for update;
 if not found then return new;end if;
 select * into d from execution_account_policy_decisions where id=r.decision_id and execution_account_id=a.id and customer_id=a.customer_id;
 if d.policy_version is distinct from a.policy_version or d.configuration is distinct from (jsonb_build_object('preset',a.policy_preset)||coalesce(a.policy_overrides->'policy_configuration','{}')) then return new;end if;
 update customer_system_certification_runs set status='PASSED',completed_at=clock_timestamp(),updated_at=clock_timestamp(),last_provider_evidence=last_provider_evidence||jsonb_build_object('closed_outcome_id',new.id,'source',new.source,'source_ids',new.source_ids) where id=r.id;
 update connected_execution_accounts set phase_h_certification_status='PASSED',updated_at=clock_timestamp() where id=a.id and customer_id=a.customer_id;
 insert into phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(a.customer_id,a.id,'DEMO_ROUND_TRIP_VERIFIED',jsonb_build_object('run_id',r.id,'closed_outcome_id',new.id,'profitability_claim',false));
 return new;
end$$;
revoke all on function public.complete_forward_certification() from public,anon,authenticated;
create trigger forward_certification_closed_outcome after insert on public.account_closed_provider_outcomes for each row execute function public.complete_forward_certification();

create table public.account_live_permissions(
 execution_account_id uuid primary key references public.connected_execution_accounts(id),customer_id uuid not null references auth.users(id),
 demo_account_id uuid not null references public.connected_execution_accounts(id),certification_run_id uuid not null references public.customer_system_certification_runs(id),
 policy_version text not null,policy_configuration jsonb not null,maximum_equity numeric not null check(maximum_equity>0 and maximum_equity<>'NaN'::numeric),maximum_risk_pct numeric not null check(maximum_risk_pct>0 and maximum_risk_pct<=.25),
 authorized_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz,consent_version text not null
);
alter table public.account_live_permissions enable row level security;
revoke all on public.account_live_permissions from public,anon,authenticated;
grant select on public.account_live_permissions to authenticated;
grant select,insert,update on public.account_live_permissions to service_role;
create policy live_permission_owner_read on public.account_live_permissions for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());

create function public.authorize_customer_live_account(p_actor uuid,p_account uuid,p_demo_account uuid,p_maximum_equity numeric,p_maximum_risk_pct numeric,p_confirmation text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;demo connected_execution_accounts;cert customer_system_certification_runs;demo_decision execution_account_policy_decisions;access_id uuid;until_at timestamptz;owner_ok boolean;current_config jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_actor for update;
 if not found or a.environment is distinct from 'live' then raise exception 'OWN_LIVE_ACCOUNT_REQUIRED';end if;
 if p_confirmation is distinct from 'ENABLE LIVE EXECUTION' then raise exception 'EXPLICIT_LIVE_CONSENT_REQUIRED';end if;
 if p_maximum_equity is null or p_maximum_equity<=0 or p_maximum_equity::text in('NaN','Infinity','-Infinity') or p_maximum_risk_pct is null or p_maximum_risk_pct<=0 or p_maximum_risk_pct>.25 or p_maximum_risk_pct::text in('NaN','Infinity','-Infinity') then raise exception 'BOUNDED_LIVE_RISK_REQUIRED';end if;
 if a.credentials_verified_at is null or a.policy_version is null or a.execution_enabled is true then raise exception 'CONNECT_AND_PAUSE_LIVE_ACCOUNT_FIRST';end if;
 select * into demo from connected_execution_accounts where id=p_demo_account and customer_id=a.customer_id and provider=a.provider and account_mode=a.account_mode and environment in('demo','testnet');
 if not found then raise exception 'MATCHING_OWN_DEMO_ACCOUNT_REQUIRED';end if;
 current_config:=jsonb_build_object('preset',a.policy_preset)||coalesce(a.policy_overrides->'policy_configuration','{}');
 select r.* into cert from customer_system_certification_runs r join execution_account_policy_decisions d on d.id=r.decision_id and d.execution_account_id=demo.id and d.customer_id=a.customer_id
 where r.execution_account_id=demo.id and r.customer_id=a.customer_id and r.status='PASSED' and r.protection_state='VERIFIED' and r.completed_at>now()-interval '30 days' and d.policy_version=a.policy_version and d.configuration=current_config
 and exists(select 1 from account_closed_provider_outcomes o where o.id::text=r.last_provider_evidence->>'closed_outcome_id' and o.execution_account_id=demo.id and o.customer_id=a.customer_id) order by r.completed_at desc limit 1;
 if cert.id is null then raise exception 'CURRENT_DEMO_ROUND_TRIP_REQUIRED';end if;
 if (current_config->>'riskPerTradePct') is null or (current_config->>'riskPerTradePct')::numeric>p_maximum_risk_pct then raise exception 'REDUCE_LIVE_ACCOUNT_RISK_FIRST';end if;
 select exists(select 1 from profiles where id=p_actor and role='admin') into owner_ok;
 select e.id,e.valid_until into access_id,until_at from phase_h_entitlements e join execution_entitlement_bindings b on b.entitlement_id=e.id and b.customer_id=e.customer_id
 where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.execution_account_id=a.id and e.valid_until>now()
 and ((owner_ok and e.source='OWNER_LIVE') or exists(select 1 from commerce_payment_attempts p where p.id=e.source_payment_id and p.customer_id=a.customer_id and p.state='SUCCEEDED')) limit 1;
 if access_id is null then
  if not owner_ok then raise exception 'VERIFIED_ACCOUNT_PAYMENT_REQUIRED';end if;
  if exists(select 1 from phase_h_entitlements e where e.customer_id=a.customer_id and e.execution_account_id=a.id and e.state in('ACTIVE','TRIAL','GRACE','PENDING')) then raise exception 'EXISTING_ACCOUNT_ACCESS_REQUIRES_REVIEW';end if;
  until_at:=now()+interval '30 days';
  insert into phase_h_entitlements(customer_id,product_code,state,source,valid_from,valid_until,account_limit,feature_permissions,execution_account_id,grant_reason) values(a.customer_id,'FOUNDING_AUTO_EXECUTION','ACTIVE','OWNER_LIVE',now(),until_at,1,'{"execution":true}',a.id,'OWN_ADMIN_BOUNDED_LIVE_TEST') returning id into access_id;
  insert into execution_entitlement_bindings(customer_id,entitlement_id,execution_account_id,state,activated_at) values(a.customer_id,access_id,a.id,'ACTIVE',now()) on conflict(execution_account_id) do update set entitlement_id=excluded.entitlement_id,state='ACTIVE',activated_at=excluded.activated_at,revoked_at=null;
 end if;
 until_at:=least(until_at,now()+interval '30 days');
 insert into account_live_permissions(execution_account_id,customer_id,demo_account_id,certification_run_id,policy_version,policy_configuration,maximum_equity,maximum_risk_pct,expires_at,consent_version)
 values(a.id,a.customer_id,demo.id,cert.id,a.policy_version,current_config,p_maximum_equity,p_maximum_risk_pct,until_at,'bounded-live/v1')
 on conflict(execution_account_id) do update set demo_account_id=excluded.demo_account_id,certification_run_id=excluded.certification_run_id,policy_version=excluded.policy_version,policy_configuration=excluded.policy_configuration,maximum_equity=excluded.maximum_equity,maximum_risk_pct=excluded.maximum_risk_pct,authorized_at=now(),expires_at=excluded.expires_at,revoked_at=null;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(a.customer_id,a.id,p_actor,'LIVE_ACCOUNT_CONSENT_RECORDED',jsonb_build_object('certification_run_id',cert.id,'maximum_equity',p_maximum_equity,'maximum_risk_pct',p_maximum_risk_pct,'expires_at',until_at,'execution_enabled',false));
 return jsonb_build_object('expires_at',until_at,'execution_enabled',false,'next_action','START_LIVE_ACCOUNT');
end$$;
revoke all on function public.authorize_customer_live_account(uuid,uuid,uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.authorize_customer_live_account(uuid,uuid,uuid,numeric,numeric,text) to service_role;

create function public.execution_environment_permitted(p_account uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;p account_live_permissions;begin
 select * into a from connected_execution_accounts where id=p_account;
 if not found then return false;end if;
 if (upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO') then return true;end if;
 if upper(a.environment) is distinct from 'LIVE' then return false;end if;
 select * into p from account_live_permissions where execution_account_id=a.id and customer_id=a.customer_id and revoked_at is null and expires_at>clock_timestamp();
 return p.execution_account_id is not null and p.policy_version=a.policy_version and p.policy_configuration=(jsonb_build_object('preset',a.policy_preset)||coalesce(a.policy_overrides->'policy_configuration','{}'))
 and (p.policy_configuration->>'riskPerTradePct')::numeric<=p.maximum_risk_pct
 and exists(select 1 from customer_system_certification_runs r where r.id=p.certification_run_id and r.execution_account_id=p.demo_account_id and r.customer_id=a.customer_id and r.status='PASSED' and r.protection_state='VERIFIED');
end$$;
revoke all on function public.execution_environment_permitted(uuid) from public,anon,authenticated;
grant execute on function public.execution_environment_permitted(uuid) to service_role;


create or replace function public.load_production_account_authorization_input(p_customer_id uuid,p_account_id uuid,p_signal_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;s signals;c provider_connections;b account_brain_assignments;proof jsonb;strategy jsonb;qualified jsonb;binding jsonb;e jsonb;history jsonb;result jsonb;execution_product text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if public.execution_environment_permitted(a.id) is distinct from true then raise exception 'CURRENT_ENVIRONMENT_AUTHORIZATION_REQUIRED';end if;
 select * into s from signals where id=p_signal_id and source='scanner' and signal_identity is not null;
 if not found then raise exception 'CANONICAL_SIGNAL_REQUIRED';end if;
 select * into c from provider_connections where execution_account_id=a.id and customer_id=a.customer_id;
 select * into b from account_brain_assignments where execution_account_id=a.id and customer_id=a.customer_id and superseded_at is null;
 execution_product:=case when upper(a.provider) like 'MT5_%' then 'FOREX_' else 'CRYPTO_' end||case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end;
 select strategy_plan into strategy from certified_strategy_plans where candidate_id=s.candidate_id and strategy_id=s.strategy_id and strategy_version=s.strategy_version order by persisted_at desc limit 1;
 select to_jsonb(p) into binding from customer_execution_strategy_bindings p where execution_account_id=a.id and customer_id=a.customer_id and p.product=execution_product;
 select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=execution_product||'_QUALIFIED_SET' order by created_at desc limit 1;
 select to_jsonb(x) into proof from account_policy_evidence x where execution_account_id=a.id and customer_id=a.customer_id and execution_instance_id=a.execution_instance_id and credential_ref=a.credential_ref and provider=upper(a.provider) and symbol=s.symbol order by observed_at desc limit 1;
 select jsonb_build_object('closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from crypto_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state='CLOSED'),'[]'::jsonb),'mt5_closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from mt5_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state in('TP2_CLOSED','CLOSED')),'[]'::jsonb),'outcomes',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from account_closed_provider_outcomes o where o.customer_id=a.customer_id and o.execution_account_id=a.id),'[]'::jsonb)) into history;
 select to_jsonb(h) into e from execution_entitlement_bindings x join phase_h_entitlements h on h.id=x.entitlement_id and h.customer_id=x.customer_id where x.customer_id=a.customer_id and x.execution_account_id=a.id and x.state='ACTIVE' and h.state in('ACTIVE','TRIAL','GRACE') and h.source<>'NOT_CONFIGURED' and (h.valid_until is null or h.valid_until>now()) limit 1;
 result:=jsonb_build_object('measured_release',(select to_jsonb(m) from strategy_release_candidates m where m.strategy_id=s.strategy_id and m.state='PROMOTED' limit 1),'account',to_jsonb(a)-array['credential_ref'],'signal',to_jsonb(s),'assignment',to_jsonb(b),'connection',to_jsonb(c)-array['secret_reference'],'policy',a.policy_overrides->'base_policy','context',proof->'account_context','observed_at',coalesce(proof->>'observed_at',proof->>'captured_at'),'contract',proof->'contract_specification','routing_policy',proof->'routing_policy','capabilities',proof->'capabilities','strategy_plan',strategy,'qualified_set',qualified,'provisioning',binding,'product',execution_product,'entitlement',jsonb_build_object('state',case when e is null then 'INACTIVE' else 'ACTIVE' end,'expiresAt',e->>'valid_until'),'history_fingerprint',encode(sha256(convert_to(history::text,'UTF8')),'hex'),'pending_orders',(proof->>'pending_orders')::integer,'active_symbol_conflict',exists(select 1 from execution_orders x where x.customer_id=a.customer_id and x.account_id=a.account_id::text and x.symbol=s.symbol and x.status in('entry_submitted','entry_filled','protected','protected_native','partially_closed','protection_pending','protection_failed')));
 result:=result||jsonb_build_object('live_authorization',(select to_jsonb(p) from account_live_permissions p where p.execution_account_id=a.id and p.customer_id=a.customer_id and p.revoked_at is null and p.expires_at>now()));
 return result||jsonb_build_object('evidence_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end$$;


create or replace function public.provision_forward_adoption_policy(p_account uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts; v text; policy_doc jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account;
 if not found or public.execution_environment_permitted(a.id) is distinct from true then raise exception 'CURRENT_ENVIRONMENT_AUTHORIZATION_REQUIRED';end if;
 v:=a.policy_version;
 policy_doc:=jsonb_build_object('schema_version','execution-adoption-policy/v1','policy_id','forward:'||a.id,'version',v,'provider',upper(a.provider),'environment',upper(a.environment),'account_ids',jsonb_build_array(a.id::text),'execution_modes',jsonb_build_array(upper(a.environment)),'customer_scope',jsonb_build_object('mode','ALLOWLIST','customer_ids',jsonb_build_array(a.customer_id::text)),'supported_plan_versions',jsonb_build_array('execution-plan/v1'),'enabled',true,'certification_state',case when upper(a.environment)='LIVE' then 'LIVE_APPROVED' else 'FORWARD_TEST' end,'rollout_percentage',100,'rollback_state','NOT_ROLLED_BACK','minimum_provider_health','HEALTHY','maximum_plan_age_ms',90000,'require_contract_fingerprint_parity',true,'require_capability_fingerprint_parity',true,'required_protection_mode',case when upper(a.provider) like 'MT5%' then 'ATTACHED' else 'NATIVE_CONDITIONAL' end,'required_reconciliation_mode','CLIENT_ID_LOOKUP_BEFORE_RETRY','partial_fill_policy_id','partial-fill/protect-filled-cancel-remainder-v1','protection_failure_policy_id','protection-failure/safety-close-v1');
 update certified_execution_adoption_policies set current=false where account_id=a.id::text and provider=upper(a.provider) and environment=upper(a.environment) and current;
 insert into certified_execution_adoption_policies(account_id,provider,environment,version,current,enabled,rollout_percentage,policy,changed_by) values(a.id::text,upper(a.provider),upper(a.environment),v,true,true,100,policy_doc,p_actor) on conflict(account_id,provider,environment,version) do update set current=true,enabled=true,rollout_percentage=100,policy=excluded.policy,changed_by=excluded.changed_by,changed_at=now();
end$$;


create or replace function public.set_customer_account_runtime(p_actor_id uuid,p_customer_id uuid,p_account_id uuid,p_control text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;qualified jsonb;product text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_actor_id is distinct from p_customer_id and not exists(select 1 from profiles where id=p_actor_id and role='admin') then raise exception 'ACCOUNT_CONTROL_ACCESS_DENIED';end if;
 if p_control not in('START','RESUME','PAUSE_NEW_ENTRIES','STOP_AFTER_FLAT','MANAGE_ONLY') then raise exception 'UNSUPPORTED_ACCOUNT_CONTROL';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if p_control in('START','RESUME') then
  if public.execution_environment_permitted(a.id) is distinct from true then raise exception 'CURRENT_ENVIRONMENT_AUTHORIZATION_REQUIRED';end if;
  if a.enabled is distinct from true or upper(a.provider_health) is distinct from 'HEALTHY' or a.last_synchronized_at is null or a.last_synchronized_at<now()-interval '60 seconds' or a.last_synchronized_at>now()+interval '5 seconds' then raise exception 'CURRENT_PROVIDER_HEALTH_REQUIRED';end if;
  -- Demo forward testing produces certification evidence; it cannot require a completed round trip beforehand.
  if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id and p.state='SUCCEEDED' where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.product_code='FOUNDING_AUTO_EXECUTION' and e.execution_account_id=a.id and e.valid_until>now()) and not exists(select 1 from phase_h_entitlements e join execution_entitlement_bindings b on b.entitlement_id=e.id and b.customer_id=e.customer_id where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.source in('OWNER_DEMO','OWNER_LIVE') and e.execution_account_id=a.id and e.valid_until>now() and exists(select 1 from profiles p where p.id=a.customer_id and p.role='admin')) then raise exception 'VERIFIED_ACCOUNT_PAYMENT_REQUIRED';end if;
  if not exists(select 1 from account_brain_assignments b where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.superseded_at is null and b.policy_version=a.policy_version) then raise exception 'CURRENT_BRAIN_REQUIRED';end if;
  if not exists(select 1 from risk_acknowledgements r where r.customer_id=a.customer_id and r.execution_account_id=a.id) then raise exception 'RISK_ACKNOWLEDGEMENT_REQUIRED';end if;
  if exists(select 1 from phase_n_account_operations_safe x where x.account_id=a.id and (x.submission_uncertain or x.open_protection_incident)) then raise exception 'ACCOUNT_RECONCILIATION_REQUIRED';end if;
  product:=case when upper(a.provider) like 'MT5%' then 'FOREX_' else 'CRYPTO_' end||case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end;
  select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=product||'_QUALIFIED_SET' order by created_at desc limit 1;
  if qualified->>'setVersion' is null or jsonb_array_length(coalesce(qualified->'entries','[]'::jsonb))=0 then raise exception 'QUALIFIED_STRATEGY_SET_REQUIRED';end if;
  insert into customer_execution_strategy_bindings(execution_account_id,customer_id,product,qualified_set_id,qualified_set_version,state,activated_by) values(a.id,a.customer_id,product,qualified->>'id',qualified->>'setVersion','ACTIVE',p_actor_id)
  on conflict(execution_account_id) do update set qualified_set_id=excluded.qualified_set_id,qualified_set_version=excluded.qualified_set_version,state='ACTIVE',activated_by=excluded.activated_by,updated_at=now();
  if upper(a.provider) like 'MT5%' then
   update mt5_accounts m set execution_enabled=true,operational=true where m.id::text=a.provider_account_identity and m.user_id=a.customer_id and m.credential_ref=a.credential_ref
   and m.provider_health='healthy' and m.last_heartbeat_at>clock_timestamp()-interval '45 seconds'
   and exists(select 1 from mt5_bridge_registry b where b.bridge_id=m.bridge_id and b.revoked_at is null and b.lease_expires_at>clock_timestamp() and b.status in('online','healthy'));
   if not found then raise exception 'CURRENT_PAIRED_TERMINAL_REQUIRED';end if;
  end if;
  perform public.provision_forward_adoption_policy(a.id,p_actor_id);
 end if;
 update connected_execution_accounts set runtime_control=p_control,execution_enabled=case when p_control in('START','RESUME') then true else execution_enabled end,updated_at=now() where id=a.id and customer_id=a.customer_id;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(a.customer_id,a.id,p_actor_id,'ACCOUNT_RUNTIME_CONTROL',jsonb_build_object('control',p_control,'protection_unchanged',true));
 return jsonb_build_object('execution_account_id',a.id,'runtime_control',p_control,'protection_enabled',true);
end$$;


create or replace function public.record_phase_f_crypto_submission(p_decision_id text,p_execution_plan_id text,p_client_order_id text,p_symbol text,p_requested_quantity numeric,p_submitted_quantity numeric,p_requested_price numeric,p_submitted_price numeric,p_normalization jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare d public.execution_account_policy_decisions; a public.connected_execution_accounts; result uuid;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into d from public.execution_account_policy_decisions where id=p_decision_id for update;
 if not found or d.decision not in('ALLOW','REDUCE') or d.intent_id is null or d.approved_quantity is null then raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE'; end if;
 select * into a from public.connected_execution_accounts where id=d.execution_account_id for update;
 if not found or a.customer_id<>d.customer_id then raise exception 'CRYPTO_ACCOUNT_SCOPE_MISMATCH'; end if;
  if public.execution_environment_permitted(a.id) is distinct from true then raise exception 'LIVE_EXECUTION_FORBIDDEN';end if;
 if not a.enabled or not a.execution_enabled or a.credentials_verified_at is null or upper(a.provider_health)<>'HEALTHY' then raise exception 'PROVIDER_ROUTE_NOT_READY'; end if;
 if exists(select 1 from crypto_account_execution_truth t where t.execution_account_id=a.id and t.intent_id<>d.intent_id and t.lifecycle_state not in('CLOSED','REJECTED')) then raise exception 'CRYPTO_ACCOUNT_RECONCILIATION_REQUIRED';end if;
 if p_requested_quantity<>d.approved_quantity or p_submitted_quantity>p_requested_quantity then raise exception 'PHASE_D_QUANTITY_LINEAGE_MISMATCH'; end if;
 insert into public.crypto_account_execution_truth(customer_id,execution_account_id,provider,environment,signal_id,decision_id,intent_id,execution_plan_id,deterministic_client_order_id,symbol,requested_quantity,submitted_quantity,requested_price,submitted_price,authorized_risk_pct,normalization,lifecycle_state,lineage)
 values(d.customer_id,d.execution_account_id,upper(a.provider),upper(a.environment),d.signal_id,d.id,d.intent_id,p_execution_plan_id,p_client_order_id,p_symbol,p_requested_quantity,p_submitted_quantity,p_requested_price,p_submitted_price,d.authorized_risk_pct,p_normalization,'ENTRY_SUBMITTED',jsonb_build_object('signal_id',d.signal_id,'decision_id',d.id,'intent_id',d.intent_id,'execution_plan_id',p_execution_plan_id,'customer_id',d.customer_id,'execution_account_id',d.execution_account_id))
 on conflict(execution_account_id,intent_id) do update set updated_at=public.crypto_account_execution_truth.updated_at returning id into result;
 return result;
end $$;


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
  if public.execution_environment_permitted(e.id) is distinct from true then raise exception 'LIVE_EXECUTION_FORBIDDEN';end if;
  if a.bridge_id is distinct from p_bridge_id or b.revoked_at is not null or (b.lease_expires_at is null or b.lease_expires_at<=clock_timestamp())
     or b.status is null or b.status not in('online','healthy') then raise exception 'MT5_BRIDGE_OFFLINE'; end if;
  if e.enabled is not true or e.execution_enabled is not true or e.credentials_verified_at is null or a.execution_enabled is not true or a.operational is not true
     or a.provider_health is distinct from 'healthy' or a.last_heartbeat_at is null or a.last_heartbeat_at>clock_timestamp() or a.last_heartbeat_at<clock_timestamp()-interval '45 seconds' then raise exception 'MT5_ACCOUNT_NOT_READY'; end if;
  if p_payload->>'phase_d_decision_id' is distinct from d.id or p_payload->>'phase_d_intent_id' is distinct from d.intent_id
     or p_payload->>'customer_id' is distinct from d.customer_id::text or p_payload->>'execution_account_id' is distinct from d.execution_account_id::text
     or (p_payload->>'quantity')::numeric is distinct from d.approved_quantity or (p_payload->>'authorized_risk_pct')::numeric is distinct from d.authorized_risk_pct
     or coalesce((p_payload->>'stop_loss')::numeric,0)<=0 then raise exception 'MT5_PHASE_E_LINEAGE_MISMATCH'; end if;
  if not exists(select 1 from certified_runtime_artifacts p where p.account_id=e.id::text and p.execution_plan->>'execution_plan_id'=p_execution_plan_id and p.execution_plan#>>'{risk_decision,decision_id}'=d.id and (p.execution_plan#>>'{risk_decision,authorized_envelope,maximum_authorized_risk_amount}')::numeric=(p_payload->>'authorized_risk_amount')::numeric) then raise exception 'EXACT_MT5_RISK_AMOUNT_REQUIRED';end if;
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


create or replace function public.assert_confirmed_account_entry(p_customer uuid,p_account uuid,p_signal uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if public.execution_environment_permitted(p_account) is distinct from true then raise exception 'CURRENT_ENVIRONMENT_AUTHORIZATION_REQUIRED';end if;
 if exists(select 1 from connected_execution_accounts a where a.id=p_account and upper(a.environment)='LIVE') and not exists(
 select 1 from connected_execution_accounts a join account_live_permissions p on p.execution_account_id=a.id and p.customer_id=a.customer_id
 join lateral(select e.account_context,e.observed_at from account_policy_evidence e where e.execution_account_id=a.id and e.customer_id=a.customer_id and e.execution_instance_id=a.execution_instance_id and e.credential_ref=a.credential_ref order by e.observed_at desc limit 1) latest on true
 where a.id=p_account and a.customer_id=p_customer and latest.observed_at>clock_timestamp()-interval '60 seconds'
 and (latest.account_context->>'equity')::numeric>0 and (latest.account_context->>'equity')::numeric<=p.maximum_equity
 and p.revoked_at is null and p.expires_at>clock_timestamp()) then raise exception 'CURRENT_LIVE_CAPITAL_LIMIT_REQUIRED';end if;
 if not exists(select 1 from conditional_execution_links l join signals s on s.id=l.signal_id where s.id=p_signal and s.mode_slug='conditional_execution' and l.state='PROJECTED') then raise exception 'CONFIRMED_CONDITIONAL_PROJECTION_REQUIRED';end if;
 if not exists(select 1 from signals s join signal_updates u on u.signal_id=s.id
 where s.id=p_signal and s.source='scanner' and s.status='active' and s.expires_at>clock_timestamp()
 and u.new_status='active' and u.reason in('entry_trigger','candle_entry_trigger','conditional_close_confirmed')
 and u.price>0 and u.price::text not in('NaN','Infinity','-Infinity')
 and u.created_at>=s.created_at and u.created_at<=clock_timestamp() and u.created_at<s.expires_at) then raise exception 'PERSISTED_ENTRY_CONFIRMATION_REQUIRED';end if;
 if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id
 where b.customer_id=p_customer and b.execution_account_id=p_account and b.state='ACTIVE'
 and e.execution_account_id=p_account and e.state='ACTIVE' and e.source<>'NOT_CONFIGURED' and e.valid_until>clock_timestamp()) then raise exception 'FINITE_ACTIVE_EXECUTION_ACCESS_REQUIRED';end if;
end$$;


create or replace function public.enqueue_production_account_authorizations() returns integer language plpgsql security definer set search_path=public as $$
declare added integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 update account_signal_authorization_jobs j set state='RECORDED',last_error='SIGNAL_NO_LONGER_EXECUTABLE',updated_at=clock_timestamp() from signals s where s.id=j.signal_id and j.state='PENDING' and (s.expires_at<=clock_timestamp() or s.status not in('waiting','active'));
 insert into account_signal_authorization_jobs(customer_id,execution_account_id,signal_id,policy_version)
 select a.customer_id,a.id,s.id,a.policy_version from connected_execution_accounts a cross join signals s
 where a.enabled and a.execution_enabled and a.runtime_control in('START','RESUME') and a.policy_profile_id is not null and a.policy_version is not null
 and public.execution_environment_permitted(a.id) is true
 and s.mode_slug='conditional_execution' and exists(select 1 from conditional_execution_links l where l.signal_id=s.id and l.state='PROJECTED')
 and s.source='scanner' and s.signal_identity is not null and s.status='active' and s.expires_at>now()
 and public.execution_environment_permitted(a.id) is true
 on conflict(execution_account_id,signal_id,policy_version) do nothing;
 get diagnostics added=row_count;return added;
end$$;


create or replace function public.claim_account_dispatch(p_limit integer default 10) returns setof public.account_signal_authorization_jobs
language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 update account_signal_authorization_jobs set dispatch_state='UNKNOWN',last_error='DISPATCH_RESULT_REQUIRES_RECONCILIATION' where dispatch_state='CLAIMED' and dispatch_claimed_at<clock_timestamp()-interval '2 minutes';
 update account_signal_authorization_jobs j set dispatch_state='EXPIRED' from signals s where j.signal_id=s.id and j.dispatch_state='PENDING' and (s.expires_at<=clock_timestamp() or s.status<>'active');
 return query update account_signal_authorization_jobs j set dispatch_state='CLAIMED',dispatch_claimed_at=clock_timestamp() where j.id in(
 select x.id from account_signal_authorization_jobs x join execution_account_policy_decisions d on d.id=x.decision_id and d.execution_account_id=x.execution_account_id and d.customer_id=x.customer_id
 join signals s on s.id=x.signal_id join connected_execution_accounts a on a.id=x.execution_account_id and a.customer_id=x.customer_id
 where x.state='RECORDED' and x.dispatch_state='PENDING' and d.decision in('ALLOW','REDUCE') and s.status='active' and s.expires_at>clock_timestamp()
 and a.enabled and a.execution_enabled and a.runtime_control in('START','RESUME') and public.execution_environment_permitted(a.id) is true
 and not exists(select 1 from account_signal_authorization_jobs busy where busy.execution_account_id=x.execution_account_id and busy.dispatch_state in('CLAIMED','UNKNOWN'))
 and not exists(select 1 from account_signal_authorization_jobs earlier where earlier.execution_account_id=x.execution_account_id and earlier.dispatch_state='PENDING' and earlier.state='RECORDED' and (earlier.updated_at,earlier.id)<(x.updated_at,x.id))
 order by x.updated_at,x.id for update of x skip locked limit least(greatest(p_limit,1),25)
 ) returning j.*;
end$$;


create or replace function public.track_current_provider_risk(p_customer uuid,p_account uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;proof jsonb;raw jsonb;observed timestamptz;balance_value numeric;equity_value numeric;currency_value text;flat boolean;prior account_observed_risk_tracking;result account_observed_risk_tracking;day_value date;reset_zone text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if not((upper(a.provider)='BINANCE' and upper(a.environment) in('TESTNET','LIVE'))or(upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP')and upper(a.environment) in('DEMO','LIVE')))then return jsonb_build_object('state','SANDBOX_REQUIRED');end if;
 if upper(a.provider) like 'MT5_%' then
  select to_jsonb(s) into proof from mt5_account_snapshots s where s.account_id::text=a.provider_account_identity and s.owner_id=a.customer_id order by s.captured_at desc limit 1;
  if upper(proof->'terminal_identity'->>'provider_environment') is distinct from upper(a.environment) then return jsonb_build_object('state','OBSERVED_DEMO_TERMINAL_REQUIRED');end if;
  raw:=proof;observed:=(proof->>'captured_at')::timestamptz;balance_value:=nullif(raw->>'balance','')::numeric;equity_value:=nullif(raw->>'equity','')::numeric;currency_value:=raw->>'currency';
  flat:=raw->'read_status'->>'positions'='true' and raw->'read_status'->>'orders'='true' and raw->>'terminal_authenticated'='true' and jsonb_array_length(raw->'positions')=0 and jsonb_array_length(raw->'orders')=0;
 else
  select to_jsonb(s) into proof from execution_account_runtime_proof s where s.customer_id=a.customer_id and s.account_id=a.account_id and s.provider=a.provider and s.execution_instance_id=a.execution_instance_id and s.credential_ref=a.credential_ref and upper(s.environment)=upper(a.environment) and s.monitor_status='healthy' order by s.observed_at desc limit 1;
  raw:=proof->'account_state';observed:=(proof->>'observed_at')::timestamptz;flat:=raw->>'flat_verified'='true';
  if upper(a.provider)='BINANCE' then balance_value:=nullif(raw->>'account_total_wallet_balance','')::numeric;equity_value:=nullif(raw->>'account_total_margin_balance','')::numeric;currency_value:=raw->>'provider_account_currency';
  else balance_value:=nullif(raw->>'account_wallet_balance','')::numeric;equity_value:=nullif(raw->>'account_equity','')::numeric;currency_value:=raw->>'account_currency';end if;
 end if;
 if observed is null or observed>clock_timestamp()+interval '5 seconds' or observed<clock_timestamp()-interval '60 seconds' or balance_value is null or equity_value is null or balance_value<=0 or equity_value<=0 or balance_value in('NaN'::numeric,'Infinity'::numeric) or equity_value in('NaN'::numeric,'Infinity'::numeric) or nullif(currency_value,'') is null then return jsonb_build_object('state','CURRENT_FINANCIAL_OBSERVATION_REQUIRED');end if;
 reset_zone:=case when upper(a.provider)='MT5_PROP' then a.policy_overrides->'approved_prop_rules'->>'reset_timezone' else 'UTC' end;
 if reset_zone is null or not exists(select 1 from pg_timezone_names where name=reset_zone) then return jsonb_build_object('state','APPROVED_PROP_RESET_TIMEZONE_REQUIRED');end if;
 day_value:=timezone(reset_zone,observed)::date;select * into prior from account_observed_risk_tracking where execution_account_id=a.id for update;
 if not found then
  if flat is distinct from true then return jsonb_build_object('state','FLAT_INITIAL_OBSERVATION_REQUIRED');end if;
  insert into account_observed_risk_tracking values(a.id,a.customer_id,currency_value,balance_value,observed,greatest(balance_value,equity_value),day_value,balance_value,greatest(balance_value,equity_value),balance_value,equity_value,observed,coalesce(proof->>'id',a.id::text||':'||observed::text),'OBSERVED',reset_zone) returning * into result;
 else
  if prior.reset_timezone<>reset_zone then return jsonb_build_object('state','PROP_RESET_TIMEZONE_RECONCILIATION_REQUIRED');end if;
  if prior.currency<>currency_value then return jsonb_build_object('state','ACCOUNT_CURRENCY_RECONCILIATION_REQUIRED');end if;
  if observed<prior.last_observed_at then return jsonb_build_object('state','OBSERVATION_ORDER_RECONCILIATION_REQUIRED');end if;
  update account_observed_risk_tracking set total_peak_equity=greatest(total_peak_equity,balance_value,equity_value),tracking_day=day_value,
   daily_starting_balance=case when tracking_day=day_value then daily_starting_balance else last_balance end,
   daily_peak_equity=case when tracking_day=day_value then greatest(daily_peak_equity,balance_value,equity_value) else greatest(last_balance,balance_value,equity_value) end,
   last_balance=balance_value,last_equity=equity_value,last_observed_at=observed,source_reference=coalesce(proof->>'id',a.id::text||':'||observed::text),
   continuity_state=case when observed>last_observed_at+interval '180 seconds' then 'GAP_RECONCILIATION_REQUIRED' else continuity_state end
  where execution_account_id=a.id returning * into result;
 end if;
 return jsonb_build_object('state',case when result.continuity_state='OBSERVED' then 'READY' else result.continuity_state end,'tracking',to_jsonb(result),'proof',proof);
end$$;


create or replace function public.record_account_closed_provider_outcome(p_customer_id uuid,p_account_id uuid,p_provider text,p_execution_id uuid,p_closed_at timestamptz,p_currency text,p_net_pnl numeric,p_source text,p_source_ids text[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;t jsonb;prior account_closed_provider_outcomes;result uuid;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or upper(a.provider) is distinct from p_provider or not ((p_provider='BINANCE' and upper(a.environment) in('TESTNET','LIVE')) or (p_provider in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment) in('DEMO','LIVE'))) then raise exception 'OUTCOME_ACCOUNT_SCOPE';end if;
 if p_provider in('BINANCE','BYBIT') then select to_jsonb(x) into t from crypto_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state='CLOSED';else select to_jsonb(x) into t from mt5_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state in('TP2_CLOSED','CLOSED');end if;
 if t is null or p_closed_at is null or p_closed_at>clock_timestamp()+interval '5 seconds' or p_closed_at<(t->>'created_at')::timestamptz or nullif(p_currency,'') is null or p_net_pnl is null or p_net_pnl in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or coalesce(cardinality(p_source_ids),0)=0 then raise exception 'OUTCOME_EVIDENCE_INCOMPLETE';end if;
 if (p_provider='BINANCE' and p_source is distinct from 'BINANCE_USER_TRADES_AND_INCOME') or (p_provider='BYBIT' and p_source is distinct from 'BYBIT_CLOSED_PNL') or (p_provider like 'MT5_%' and p_source is distinct from 'MT5_DEALS') then raise exception 'OUTCOME_SOURCE_MISMATCH';end if;
 select * into prior from account_closed_provider_outcomes where execution_account_id=a.id and execution_truth_id=p_execution_id;
 if found then if row(prior.closed_at,prior.currency,prior.net_pnl,prior.source,prior.source_ids) is distinct from row(p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) then raise exception 'OUTCOME_CONTENT_CONFLICT';end if;return prior.id;end if;
 insert into account_closed_provider_outcomes(customer_id,execution_account_id,execution_truth_id,provider,closed_at,currency,net_pnl,source,source_ids) values(a.customer_id,a.id,p_execution_id,p_provider,p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) returning id into result;return result;
end$$;


create or replace function public.record_canonical_monitor_observation(p_customer_id uuid,p_account_id uuid,p_plan_id text,p_observation jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare a public.connected_execution_accounts;t public.crypto_account_execution_truth; r public.execution_orders; at timestamptz;q numeric;n integer;new_state text;gstate text;key text;old jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or not ((upper(a.provider)='BINANCE' and upper(a.environment) in('TESTNET','LIVE')) or (upper(a.provider)='BYBIT' and upper(a.environment) in('DEMO','LIVE'))) then raise exception 'MONITOR_ACCOUNT_SCOPE';end if;
 select * into t from public.crypto_account_execution_truth where execution_account_id=a.id and customer_id=a.customer_id and execution_plan_id=p_plan_id for update;
 if not found or t.provider is distinct from upper(a.provider) or t.environment is distinct from upper(a.environment) then raise exception 'MONITOR_TRUTH_SCOPE';end if;
 if p_observation->>'schema_version' is distinct from 'canonical-monitor-observation/v1' then raise exception 'MONITOR_SCHEMA_REQUIRED';end if;
 at:=(p_observation->>'observed_at')::timestamptz;q:=(p_observation->>'position_quantity')::numeric;n:=(p_observation->>'open_order_count')::integer;
 if at is null or at>clock_timestamp()+interval '5 seconds' or at<clock_timestamp()-interval '2 minutes' or q is null or q<0 or q='NaN'::numeric or n is null or n<0 then raise exception 'MONITOR_OBSERVATION_INVALID';end if;
 select * into r from public.execution_orders where id::text=p_observation->>'execution_order_id' and customer_id=a.customer_id and account_id::text=a.account_id::text and raw_exchange_response->>'certified_execution_plan_id'=p_plan_id and execution_scope_key=p_observation->>'execution_scope_key';
 if not found or r.symbol is distinct from t.symbol or nullif(p_observation->>'execution_scope_key','') is null then raise exception 'MONITOR_ORDER_SCOPE';end if;
 key:=md5(a.id::text||':'||p_plan_id||':'||at::text);
 select evidence into old from public.canonical_monitor_observations where id=key;
 if found then if old is distinct from p_observation then raise exception 'MONITOR_CONTENT_CONFLICT';end if;return t.lifecycle_state;end if;
 if at<coalesce((t.last_provider_evidence->>'observed_at')::timestamptz,t.created_at) then raise exception 'MONITOR_STALE_SEQUENCE';end if;
 if p_observation->>'entry_verified'='true' and (p_observation->'entry_evidence'->>'id' is distinct from p_observation->>'entry_provider_order_id' or p_observation->'entry_evidence'->>'symbol' is distinct from t.symbol or not coalesce(p_observation->'entry_evidence'->>'status' in('FILLED','PARTIALLY_FILLED'),false) or (p_observation->'entry_evidence'->>'filledQuantity')::numeric is null or (p_observation->'entry_evidence'->>'filledQuantity')::numeric<=0 or (p_observation->'entry_evidence'->>'filledQuantity')::numeric='NaN'::numeric or (p_observation->'entry_evidence'->>'filledQuantity')::numeric>t.submitted_quantity or p_observation->'entry_evidence'->>'side' is distinct from case when lower(r.direction) in('buy','long') then 'BUY' when lower(r.direction) in('sell','short') then 'SELL' else null end) then raise exception 'MONITOR_ENTRY_EVIDENCE_INVALID';end if;
 if q>0 and (q>t.submitted_quantity or p_observation->>'position_side' is distinct from case when lower(r.direction) in('buy','long') then 'BUY' when lower(r.direction) in('sell','short') then 'SELL' else null end) then raise exception 'MONITOR_POSITION_LINEAGE';end if;
 new_state:=case
 when t.lifecycle_state in('CLOSED','REJECTED') then t.lifecycle_state
 when q=0 and n=0 and t.entry_observed_at is not null then 'CLOSED'
 when q=0 or (t.entry_observed_at is null and p_observation->>'entry_verified' is distinct from 'true') then 'RECONCILING'
 when p_observation->>'safety_close_pending'='true' then 'SAFETY_CLOSING'
 when p_observation->>'protection_verified'='true' and r.sl_confirmed is true and r.tp2_confirmed is true and (r.tp1_confirmed is true or r.tp1_status='filled') then 'PROTECTION_VERIFIED'
 else 'PROTECTION_INCIDENT' end;
 insert into public.canonical_monitor_observations(id,customer_id,execution_account_id,execution_plan_id,observed_at,evidence) values(key,a.customer_id,a.id,p_plan_id,at,p_observation);
 update public.crypto_account_execution_truth set lifecycle_state=new_state,entry_observed_at=case when p_observation->>'entry_verified'='true' then coalesce(entry_observed_at,at) else entry_observed_at end,last_provider_evidence=p_observation,updated_at=clock_timestamp() where id=t.id;
 gstate:=case new_state when 'CLOSED' then 'CLOSED' when 'PROTECTION_VERIFIED' then 'PROTECTED' when 'SAFETY_CLOSING' then 'SAFETY_CLOSE_PENDING' when 'PROTECTION_INCIDENT' then 'PROTECTION_INCIDENT' else 'RECONCILING' end;
 update public.customer_system_certification_runs set status=gstate,protection_state=case when new_state='PROTECTION_VERIFIED' then 'VERIFIED' when new_state='PROTECTION_INCIDENT' then 'INCIDENT' else protection_state end,last_provider_evidence=p_observation,updated_at=clock_timestamp()
 where customer_id=a.customer_id and execution_account_id=a.id and execution_plan_id=p_plan_id and status not in('PASSED','FAILED','BLOCKED','PRECHECK_FAILED');
 return new_state;
end$$;

-- Keep environment constraints narrow; permission is rechecked at each new-entry boundary.
alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_live_disabled_phase_d;
do $$declare c record;begin
 for c in select conname,conrelid::regclass as target from pg_constraint where contype='c' and conrelid in('public.crypto_account_execution_truth'::regclass,'public.certified_execution_adoption_policies'::regclass) and pg_get_constraintdef(oid) ilike '%environment%' loop execute format('alter table %s drop constraint %I',c.target,c.conname);end loop;
end$$;
alter table public.crypto_account_execution_truth add constraint crypto_execution_environment check((provider='BINANCE' and environment in('TESTNET','LIVE')) or (provider='BYBIT' and environment in('DEMO','LIVE'))) not valid;
alter table public.certified_execution_adoption_policies add constraint adoption_environment check(environment in('TESTNET','DEMO','LIVE')) not valid;
create function public.guard_live_account_start() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if upper(new.environment)='LIVE' and new.execution_enabled is true and new.runtime_control in('START','RESUME') and public.execution_environment_permitted(new.id) is distinct from true then raise exception 'CURRENT_LIVE_PERMISSION_REQUIRED';end if;return new;
end$$;
revoke all on function public.guard_live_account_start() from public,anon,authenticated;
create trigger guarded_live_account_start before insert or update of execution_enabled,runtime_control on public.connected_execution_accounts for each row execute function public.guard_live_account_start();

create or replace function public.refresh_owned_provider_health() returns trigger
language plpgsql security definer set search_path=public as $$
declare observed timestamptz;healthy boolean;linked record;begin
 if tg_table_name='execution_account_runtime_proof' then
  observed:=new.observed_at;healthy:=new.monitor_status='healthy';
  if observed is null or observed>clock_timestamp()+interval '5 seconds' or observed<clock_timestamp()-interval '60 seconds' then return new;end if;
  for linked in update connected_execution_accounts set provider_health=case when healthy then 'healthy' else 'degraded' end,last_synchronized_at=observed,updated_at=clock_timestamp()
  where customer_id=new.customer_id and account_id=new.account_id and upper(provider)=upper(new.provider) and execution_instance_id=new.execution_instance_id and credential_ref=new.credential_ref and upper(environment)=upper(new.environment) and (last_synchronized_at is null or last_synchronized_at<=observed) returning id,customer_id loop
   perform track_current_provider_risk(linked.customer_id,linked.id);
  end loop;
 else
  observed:=new.captured_at;healthy:=new.terminal_authenticated=true and new.trade_permission=true and new.terminal_autotrading=true;
  if observed is null or observed>clock_timestamp()+interval '5 seconds' or observed<clock_timestamp()-interval '60 seconds' then return new;end if;
  for linked in update connected_execution_accounts a set provider_health=case when healthy then 'healthy' else 'degraded' end,last_synchronized_at=observed,updated_at=clock_timestamp()
  where a.customer_id=new.owner_id and a.provider_account_identity=new.account_id::text and a.provider in('MT5_PERSONAL','MT5_PROP') and upper(a.environment) in('DEMO','LIVE') and upper(a.environment)=upper(new.terminal_identity->>'provider_environment')
  and exists(select 1 from mt5_accounts m where m.id=new.account_id and m.user_id=a.customer_id and m.bridge_id=new.bridge_id and m.credential_ref=a.credential_ref)
  and (a.last_synchronized_at is null or a.last_synchronized_at<=observed) returning a.id,a.customer_id loop
   perform track_current_provider_risk(linked.customer_id,linked.id);
  end loop;
 end if;return new;
end$$;

create or replace function public.consume_customer_environment_pairing(p_customer_id uuid,p_execution_account_id uuid,p_mt5_account_id uuid,p_bridge_id text,p_worker_id text,p_code_hash text,p_environment text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; c public.hashibridge_pairing_codes%rowtype; terminal jsonb; reference text;
begin
 select * into a from public.connected_execution_accounts where id=p_execution_account_id and customer_id=p_customer_id for update;
 if not found or a.provider is null or a.provider not in('MT5_PERSONAL','MT5_PROP') or a.environment not in('demo','live') or a.environment is distinct from p_environment then return jsonb_build_object('state','BLOCKED','reason','ACCOUNT_SCOPE_REQUIRED');end if;
 if exists(select 1 from connected_execution_accounts x where x.id<>a.id and x.provider_account_identity=p_mt5_account_id::text and x.credentials_verified_at is not null) then return jsonb_build_object('state','BLOCKED','reason','TERMINAL_ALREADY_BOUND');end if;
 select to_jsonb(m) into terminal from public.mt5_accounts m where m.id=p_mt5_account_id and m.user_id=p_customer_id and m.bridge_id=p_bridge_id;
 if terminal is null or not exists(select 1 from public.mt5_bridge_registry b where b.bridge_id=p_bridge_id and b.worker_id=p_worker_id and b.lease_expires_at>now()) then return jsonb_build_object('state','BLOCKED','reason','CURRENT_BRIDGE_ASSIGNMENT_REQUIRED');end if;
 reference:=terminal->>'credential_ref';if nullif(reference,'') is null then return jsonb_build_object('state','BLOCKED','reason','AUTHORIZED_TERMINAL_CREDENTIAL_REQUIRED');end if;
 select * into c from public.hashibridge_pairing_codes where execution_account_id=a.id and customer_id=p_customer_id and used_at is null and revoked_at is null order by created_at desc limit 1 for update;
 if not found then return jsonb_build_object('state','BLOCKED','reason','PAIRING_CODE_UNAVAILABLE');end if;
 if c.expires_at is null or c.attempt_count is null or c.expires_at<=now() or c.attempt_count>=5 then update public.hashibridge_pairing_codes set revoked_at=now() where id=c.id;return jsonb_build_object('state','BLOCKED','reason','PAIRING_EXPIRED_OR_EXHAUSTED');end if;
 if c.code_hash is distinct from p_code_hash then update public.hashibridge_pairing_codes set attempt_count=attempt_count+1,revoked_at=case when attempt_count+1>=5 then now() else null end where id=c.id;return jsonb_build_object('state','BLOCKED','reason','PAIRING_INVALID');end if;
 if a.credentials_verified_at is not null and a.provider_account_identity is distinct from p_mt5_account_id::text then return jsonb_build_object('state','BLOCKED','reason','PROVIDER_IDENTITY_CHANGED_CREATE_SEPARATE_ACCOUNT');end if;
 update public.hashibridge_pairing_codes set used_at=now() where id=c.id;
 update public.connected_execution_accounts set provider_account_identity=p_mt5_account_id::text,credential_ref=reference,credentials_verified_at=now(),enabled=true,monitor_enabled=true,execution_enabled=false,provider_health='healthy',last_synchronized_at=now(),phase_h_certification_status='REQUIRED',policy_overrides=policy_overrides||jsonb_build_object('mt5_account_id',p_mt5_account_id,'bridge_id',p_bridge_id),updated_at=now() where id=a.id and customer_id=p_customer_id;
 update public.provider_connections set state='CONNECTED',bridge_identity=p_bridge_id,last_verified_at=now(),last_heartbeat_at=now(),capabilities=capabilities||jsonb_build_object('mt5_account_id',p_mt5_account_id,'trading',true,'environment',a.environment),safe_error_code=null,updated_at=now() where id=c.connection_id and customer_id=p_customer_id and execution_account_id=a.id;
 if not found then raise exception 'PAIRING_CONNECTION_MISSING';end if;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(p_customer_id,a.id,'BRIDGE_PAIRING_CONFIRMED',jsonb_build_object('bridge_id',p_bridge_id,'mt5_account_id',p_mt5_account_id));
 return jsonb_build_object('state','CONNECTED','execution_account_id',a.id,'execution_enabled',false);
end $$;

create function public.revoke_customer_live_permission(p_actor uuid,p_account uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from connected_execution_accounts where id=p_account and customer_id=p_actor and environment='live') then raise exception 'OWN_LIVE_ACCOUNT_REQUIRED';end if;
 update connected_execution_accounts set execution_enabled=false,runtime_control='MANAGE_ONLY',updated_at=clock_timestamp() where id=p_account and customer_id=p_actor;
 update account_live_permissions set revoked_at=clock_timestamp() where execution_account_id=p_account and customer_id=p_actor;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_actor,p_account,p_actor,'LIVE_ENTRY_PERMISSION_REVOKED','{"protection_unchanged":true}');
 return jsonb_build_object('execution_enabled',false,'protection_unchanged',true);
end$$;
revoke all on function public.revoke_customer_live_permission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_customer_live_permission(uuid,uuid) to service_role;

grant select,insert,update on public.customer_system_certification_runs,public.customer_system_certification_checks,public.customer_system_certification_events to service_role;

create or replace function public.store_phase_n_customer_credentials(p_customer_id uuid,p_account_id uuid,p_provider text,p_secret_json text,p_identity text,p_capabilities jsonb)
returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare a public.connected_execution_accounts%rowtype;ref uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or lower(a.provider) is distinct from lower(p_provider) then raise exception 'ACCOUNT_PROVIDER_OWNERSHIP_REQUIRED';end if;
 if not ((p_provider='binance' and a.environment in('testnet','live')) or(p_provider='bybit' and a.environment in('demo','live'))) then raise exception 'SANDBOX_ENVIRONMENT_REQUIRED';end if;
 if p_provider='bybit' and a.environment='demo' and p_capabilities->>'identity_kind'='DEMO_CREDENTIAL' and exists(select 1 from connected_execution_accounts x where x.customer_id=a.customer_id and x.id<>a.id and lower(x.provider)='bybit' and x.environment='demo' and x.enabled and x.credentials_verified_at is not null) then raise exception 'DEDICATED_DEMO_ACCOUNT_ALREADY_CONNECTED';end if;
 if p_identity is null or length(p_identity) not between 1 and 200 or p_identity ~ ':' or p_identity='canonical-binance-testnet-system' then raise exception 'CUSTOMER_PROVIDER_IDENTITY_UNVERIFIED';end if;
 if (p_capabilities->>'verified') is distinct from 'true' or(p_capabilities->>'trading') is distinct from 'true' or(p_capabilities->>'withdrawal') is distinct from 'false' then raise exception 'UNSAFE_CREDENTIAL_CAPABILITIES';end if;
 if coalesce(p_secret_json::jsonb->>'api_key','')='' or coalesce(p_secret_json::jsonb->>'api_secret','')='' then raise exception 'CREDENTIAL_REQUIRED';end if;
 if a.credentials_verified_at is not null and a.provider_account_identity is distinct from p_identity then raise exception 'PROVIDER_IDENTITY_CHANGED_CREATE_SEPARATE_ACCOUNT';end if;
 if a.credential_ref is null then select vault.create_secret(p_secret_json,'customer-provider-'||a.id::text,'Verified account-scoped credential') into ref;
 else ref:=a.credential_ref::uuid;perform vault.update_secret(ref,p_secret_json);end if;
 update public.connected_execution_accounts set credential_ref=ref::text,provider_account_identity=p_identity,credentials_verified_at=now(),provider_health='healthy',last_synchronized_at=now(),enabled=true,monitor_enabled=true,execution_enabled=false,phase_h_certification_status='REQUIRED',updated_at=now() where id=a.id and customer_id=a.customer_id;
 update public.provider_connections set secret_reference=ref::text,external_fingerprint=encode(extensions.digest(p_identity,'sha256'),'hex'),capabilities=p_capabilities,state='VERIFIED',last_verified_at=now(),last_heartbeat_at=now(),safe_error_code=null,updated_at=now() where execution_account_id=a.id and customer_id=a.customer_id;
 if not found then raise exception 'PROVIDER_CONNECTION_REQUIRED';end if;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(a.customer_id,a.id,'CRYPTO_CREDENTIAL_VERIFIED',jsonb_build_object('provider',p_provider,'withdrawal',false));
 return ref;
end $$;
comment on column public.connected_execution_accounts.provider_account_identity is 'Native account identity where verified; an explicitly classified key-bound demo scope when the provider omits a UID. Never a raw API key.';

-- Skip ineligible opens so expired entry access cannot starve protection commands.
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
           AND public.execution_environment_permitted(d.execution_account_id) is true
           AND s.mode_slug='conditional_execution' AND EXISTS(SELECT 1 FROM public.conditional_execution_links l WHERE l.signal_id=s.id AND l.state='PROJECTED')
           AND s.source='scanner' AND s.status='active' AND s.expires_at>clock_timestamp()
           AND EXISTS(SELECT 1 FROM public.signal_updates u WHERE u.signal_id=s.id AND u.new_status='active' AND u.reason IN('entry_trigger','candle_entry_trigger','conditional_close_confirmed') AND u.price>0 AND u.price::text NOT IN('NaN','Infinity','-Infinity') AND u.created_at>=s.created_at AND u.created_at<=clock_timestamp() AND u.created_at<s.expires_at)
       )
       AND c.payload->>'certified' = 'true'
       AND c.payload->>'deterministic_identity' = c.idempotency_key
       AND EXISTS (
         SELECT 1
           FROM public.certified_runtime_claims r
          WHERE r.execution_plan_id = c.payload->>'execution_plan_id'
            AND r.account_id = (select d.execution_account_id::text from public.execution_account_policy_decisions d where d.id=c.payload->>'phase_d_decision_id' and d.customer_id=p_owner_id)
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
