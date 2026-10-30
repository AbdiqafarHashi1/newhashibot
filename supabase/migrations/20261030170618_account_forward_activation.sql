-- A demo forward test is an explicitly enabled experiment, never a fabricated certification or payment.
create function public.grant_owner_demo_access(p_actor uuid,p_account uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts; e phase_h_entitlements;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_actor for update;
 if not found or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'OWN_ADMIN_ACCOUNT_REQUIRED';end if;
 if not ((lower(a.provider)='binance' and lower(a.environment)='testnet') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and lower(a.environment)='demo')) then raise exception 'OWNER_DEMO_ONLY';end if;
 select * into e from phase_h_entitlements where execution_account_id=a.id and customer_id=a.customer_id and state in('ACTIVE','TRIAL','GRACE','PENDING') for update;
 if e.id is not null and e.source is distinct from 'OWNER_DEMO' then raise exception 'EXISTING_COMMERCIAL_ACCESS_RETAINED';end if;
 if e.id is null then
 insert into phase_h_entitlements(customer_id,product_code,state,source,valid_from,valid_until,account_limit,feature_permissions,execution_account_id,grant_reason)
 values(a.customer_id,'FOUNDING_AUTO_EXECUTION','ACTIVE','OWNER_DEMO',now(),now()+interval '30 days',1,'{"execution":true,"demo_only":true}',a.id,'OWN_ADMIN_DEMO_FORWARD_TEST') returning * into e;
 end if;
 -- Retrying this action never extends access; a fresh period requires an expired/revoked old grant.
 insert into execution_entitlement_bindings(customer_id,entitlement_id,execution_account_id,state,activated_at) values(a.customer_id,e.id,a.id,'ACTIVE',now())
 on conflict(execution_account_id) do update set entitlement_id=excluded.entitlement_id,state='ACTIVE',activated_at=excluded.activated_at,revoked_at=null;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(a.customer_id,a.id,p_actor,'OWNER_DEMO_ACCESS_GRANTED',jsonb_build_object('valid_until',e.valid_until,'payment_created',false,'execution_enabled',false));
 return jsonb_build_object('expires_at',e.valid_until,'execution_enabled',false,'payment_created',false);
end$$;
revoke all on function public.grant_owner_demo_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_owner_demo_access(uuid,uuid) to service_role;

create function public.provision_forward_adoption_policy(p_account uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts; v text; policy_doc jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account;
 if not found or not ((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO')) then raise exception 'FORWARD_SANDBOX_REQUIRED';end if;
 v:=a.policy_version;
 policy_doc:=jsonb_build_object('schema_version','execution-adoption-policy/v1','policy_id','forward:'||a.id,'version',v,'provider',upper(a.provider),'environment',upper(a.environment),'account_ids',jsonb_build_array(a.id::text),'execution_modes',jsonb_build_array(upper(a.environment)),'customer_scope',jsonb_build_object('mode','ALLOWLIST','customer_ids',jsonb_build_array(a.customer_id::text)),'supported_plan_versions',jsonb_build_array('execution-plan/v1'),'enabled',true,'certification_state','FORWARD_TEST','rollout_percentage',100,'rollback_state','NOT_ROLLED_BACK','minimum_provider_health','HEALTHY','maximum_plan_age_ms',90000,'require_contract_fingerprint_parity',true,'require_capability_fingerprint_parity',true,'required_protection_mode',case when upper(a.provider) like 'MT5%' then 'ATTACHED' else 'NATIVE_CONDITIONAL' end,'required_reconciliation_mode','CLIENT_ID_LOOKUP_BEFORE_RETRY','partial_fill_policy_id','partial-fill/protect-filled-cancel-remainder-v1','protection_failure_policy_id','protection-failure/safety-close-v1');
 update certified_execution_adoption_policies set current=false where account_id=a.id::text and provider=upper(a.provider) and environment=upper(a.environment) and current;
 insert into certified_execution_adoption_policies(account_id,provider,environment,version,current,enabled,rollout_percentage,policy,changed_by) values(a.id::text,upper(a.provider),upper(a.environment),v,true,true,100,policy_doc,p_actor) on conflict(account_id,provider,environment,version) do update set current=true,enabled=true,rollout_percentage=100,policy=excluded.policy,changed_by=excluded.changed_by,changed_at=now();
end$$;
revoke all on function public.provision_forward_adoption_policy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.provision_forward_adoption_policy(uuid,uuid) to service_role;

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
  -- Demo forward testing produces certification evidence; it cannot require a completed round trip beforehand.
  if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id and p.state='SUCCEEDED' where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.product_code='FOUNDING_AUTO_EXECUTION' and e.execution_account_id=a.id and e.valid_until>now()) and not exists(select 1 from phase_h_entitlements e join execution_entitlement_bindings b on b.entitlement_id=e.id and b.customer_id=e.customer_id where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.state='ACTIVE' and e.state='ACTIVE' and e.source='OWNER_DEMO' and e.execution_account_id=a.id and e.valid_until>now() and exists(select 1 from profiles p where p.id=a.customer_id and p.role='admin')) then raise exception 'VERIFIED_ACCOUNT_PAYMENT_REQUIRED';end if;
  if not exists(select 1 from account_brain_assignments b where b.execution_account_id=a.id and b.customer_id=a.customer_id and b.superseded_at is null and b.policy_version=a.policy_version) then raise exception 'CURRENT_BRAIN_REQUIRED';end if;
  if not exists(select 1 from risk_acknowledgements r where r.customer_id=a.customer_id and r.execution_account_id=a.id) then raise exception 'RISK_ACKNOWLEDGEMENT_REQUIRED';end if;
  if exists(select 1 from phase_n_account_operations_safe x where x.account_id=a.id and (x.submission_uncertain or x.open_protection_incident)) then raise exception 'ACCOUNT_RECONCILIATION_REQUIRED';end if;
  product:=case when upper(a.provider) like 'MT5%' then 'FOREX_' else 'CRYPTO_' end||case when a.account_mode='PERSONAL' then 'PERSONAL' else 'PROP' end;
  select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=product||'_QUALIFIED_SET' order by created_at desc limit 1;
  if qualified->>'setVersion' is null or jsonb_array_length(coalesce(qualified->'entries','[]'::jsonb))=0 then raise exception 'QUALIFIED_STRATEGY_SET_REQUIRED';end if;
  insert into customer_execution_strategy_bindings(execution_account_id,customer_id,product,qualified_set_id,qualified_set_version,state,activated_by) values(a.id,a.customer_id,product,qualified->>'id',qualified->>'setVersion','ACTIVE',p_actor_id)
  on conflict(execution_account_id) do update set qualified_set_id=excluded.qualified_set_id,qualified_set_version=excluded.qualified_set_version,state='ACTIVE',activated_by=excluded.activated_by,updated_at=now();
  perform public.provision_forward_adoption_policy(a.id,p_actor_id);
 end if;
 update connected_execution_accounts set runtime_control=p_control,execution_enabled=case when p_control in('START','RESUME') then true else execution_enabled end,updated_at=now() where id=a.id and customer_id=a.customer_id;
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(a.customer_id,a.id,p_actor_id,'ACCOUNT_RUNTIME_CONTROL',jsonb_build_object('control',p_control,'protection_unchanged',true));
 return jsonb_build_object('execution_account_id',a.id,'runtime_control',p_control,'protection_enabled',true);
end$$;
revoke all on function public.set_customer_account_runtime(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_customer_account_runtime(uuid,uuid,uuid,text) to service_role;


-- Authorization and external submission are separate durable steps. An uncertain HTTP outcome is never silently retried.
alter table public.account_signal_authorization_jobs add column dispatch_state text not null default 'PENDING' check(dispatch_state in('PENDING','CLAIMED','SENT','FAILED','UNKNOWN','EXPIRED')),
 add column dispatch_claimed_at timestamptz,add column dispatch_receipt jsonb;
create function public.claim_account_dispatch(p_limit integer default 10) returns setof public.account_signal_authorization_jobs
language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 update account_signal_authorization_jobs set dispatch_state='UNKNOWN',last_error='DISPATCH_RESULT_REQUIRES_RECONCILIATION' where dispatch_state='CLAIMED' and dispatch_claimed_at<clock_timestamp()-interval '2 minutes';
 update account_signal_authorization_jobs j set dispatch_state='EXPIRED' from signals s where j.signal_id=s.id and j.dispatch_state='PENDING' and (s.expires_at<=clock_timestamp() or s.status<>'active');
 return query update account_signal_authorization_jobs j set dispatch_state='CLAIMED',dispatch_claimed_at=clock_timestamp() where j.id in(
 select x.id from account_signal_authorization_jobs x join execution_account_policy_decisions d on d.id=x.decision_id and d.execution_account_id=x.execution_account_id and d.customer_id=x.customer_id
 join signals s on s.id=x.signal_id join connected_execution_accounts a on a.id=x.execution_account_id and a.customer_id=x.customer_id
 where x.state='RECORDED' and x.dispatch_state='PENDING' and d.decision in('ALLOW','REDUCE') and s.status='active' and s.expires_at>clock_timestamp()
 and a.enabled and a.execution_enabled and a.runtime_control in('START','RESUME') and upper(a.environment) in('DEMO','TESTNET') order by x.updated_at,x.id for update of x skip locked limit least(greatest(p_limit,1),25)
 ) returning j.*;
end$$;
revoke all on function public.claim_account_dispatch(integer) from public,anon,authenticated;
grant execute on function public.claim_account_dispatch(integer) to service_role;

-- One UI flow, distinct immutable account records and credentials per environment. Connecting live does not enable entry.
alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_provider_environment_check;
alter table public.connected_execution_accounts add constraint connected_execution_accounts_provider_environment_check check((provider='binance' and environment in('testnet','live')) or (provider in('bybit','MT5_PERSONAL','MT5_PROP') and environment in('demo','live'))) not valid;
alter table public.provider_connections drop constraint if exists provider_connections_environment_check;
alter table public.provider_connections add constraint provider_connections_environment_check check((provider='BINANCE' and environment in('testnet','live')) or (provider in('BYBIT','MT5') and environment in('demo','live')));
create function public.create_customer_execution_account(p_customer_id uuid,p_provider text,p_mode text,p_label text,p_idempotency_key text,p_environment text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare content jsonb; prior public.customer_account_setup_requests%rowtype; account uuid; connection uuid; env text; stored_provider text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_customer_id is null or p_provider is null or p_mode is null or p_provider not in('MT5','BINANCE','BYBIT') or p_mode not in('PERSONAL','PROP') or (p_mode='PROP' and p_provider<>'MT5') then raise exception 'UNSUPPORTED_PROVIDER_MODE';end if;
 if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 or p_label is null or length(p_label) not between 1 and 80 then raise exception 'INVALID_SETUP_REQUEST';end if;
 stored_provider:=case when p_provider='MT5' then case when p_mode='PROP' then 'MT5_PROP' else 'MT5_PERSONAL' end else lower(p_provider) end;
 env:=lower(p_environment);
 if env is null or not (env='live' or (p_provider='BINANCE' and env='testnet') or (p_provider in('MT5','BYBIT') and env='demo')) then raise exception 'PROVIDER_ENVIRONMENT_REQUIRED';end if;
 content:=jsonb_build_object('provider',p_provider,'mode',p_mode,'environment',env,'label',p_label);
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text||':setup:'||p_idempotency_key,0));
 select * into prior from public.customer_account_setup_requests where customer_id=p_customer_id and idempotency_key=p_idempotency_key;
 if found then
  if prior.request_content is distinct from content then raise exception 'IDEMPOTENCY_CONTENT_CONFLICT';end if;
  select id into connection from public.provider_connections where execution_account_id=prior.execution_account_id and customer_id=p_customer_id;
  if connection is null then raise exception 'SETUP_CONNECTION_MISSING';end if;
  return jsonb_build_object('execution_account_id',prior.execution_account_id,'provider_connection_id',connection,'provider',p_provider,'environment',env,'execution_enabled',false);
 end if;
 account:=gen_random_uuid();
 insert into public.connected_execution_accounts(id,customer_id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,ownership_classification,enabled,is_operational,monitor_enabled,execution_enabled,provider_health,account_mode,immutable_identity,phase_h_asset_class)
 values(account,p_customer_id,p_label,account::text,'draft:'||account,'phase_h:'||lower(p_provider),stored_provider,env,'customer',false,false,false,false,'not_configured',case when p_mode='PROP' then 'PROP_EVALUATION' else 'PERSONAL' end,'phase_h-draft:'||p_customer_id||':'||account,case when p_provider='MT5' then 'FOREX' else 'CRYPTO' end);
 insert into public.provider_connections(customer_id,execution_account_id,provider,environment,state) values(p_customer_id,account,p_provider,env,case when p_provider='MT5' then 'DOWNLOAD_AVAILABLE' else 'CREDENTIALS_REQUIRED' end) returning id into connection;
 update public.connected_execution_accounts set phase_h_connection_id=connection where id=account and customer_id=p_customer_id;
 insert into public.customer_account_setup_requests values(p_customer_id,p_idempotency_key,content,account,now());
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer_id,account,p_customer_id,'EXECUTION_ACCOUNT_DRAFT_CREATED',content);
 return jsonb_build_object('execution_account_id',account,'provider_connection_id',connection,'provider',p_provider,'environment',env,'execution_enabled',false);
end $$;

revoke all on function public.create_customer_execution_account(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_customer_execution_account(uuid,text,text,text,text,text) to service_role;

create or replace function public.assign_customer_account_brain(p_customer_id uuid,p_account_id uuid,p_risk numeric,p_strategies text[],p_idempotency_key text,p_policy jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; prior public.customer_brain_change_requests%rowtype; content jsonb; assignment uuid; family text; permitted text[]; maxrisk numeric; canonical_strategies text[]; strategy_ids text[]; preset text; expected_id text;
begin
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if a.environment is null or a.environment not in('demo','testnet','live') then raise exception 'SANDBOX_ENVIRONMENT_REQUIRED';end if;
 if lower(a.provider) in('mt5','mt5_personal','mt5_prop') and a.account_mode like 'PROP%' then family:='PROP_MT5_STRICT';permitted:=array['FOREX_TREND'];maxrisk:=.5;
 elsif lower(a.provider) in('mt5','mt5_personal','mt5_prop') and a.account_mode='PERSONAL' then family:='PERSONAL_MT5_GROWTH';permitted:=array['FOREX_TREND','GOLD_BREAKOUT'];maxrisk:=1;
 elsif lower(a.provider) in('binance','bybit') and a.account_mode='PERSONAL' then family:=case when lower(a.provider)='binance' then 'PERSONAL_BINANCE_CRYPTO' else 'PERSONAL_BYBIT_CRYPTO' end;permitted:=array['CRYPTO_TREND'];maxrisk:=.75;
 else raise exception 'UNSUPPORTED_PROVIDER_MODE';end if;
 if p_risk is null or p_risk::text in('NaN','Infinity','-Infinity') or p_risk<.1 or p_risk>maxrisk or p_strategies is null or cardinality(p_strategies)=0 or not(p_strategies<@permitted) or array_position(p_strategies,null) is not null then raise exception 'UNSAFE_PREFERENCE';end if;
 if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 300 then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
 select array_agg(s order by s) into canonical_strategies from(select distinct unnest(p_strategies) s) x;
 expected_id:=case when lower(a.provider)='binance' then 'pol_binance_personal_v1' when lower(a.provider)='bybit' then 'pol_bybit_personal_v1' when a.account_mode='PROP_FUNDED' then 'pol_mt5_prop_funded_v1' when a.account_mode like 'PROP%' then 'pol_mt5_prop_eval_v1' else 'pol_mt5_personal_v1' end;
 if (p_policy->>'policy_id') is distinct from expected_id or(p_policy->>'policy_version') is distinct from '1.0.0' or(p_policy->>'provider') is distinct from upper(a.provider) or(p_policy->>'account_type') is distinct from a.account_mode then raise exception 'APPROVED_POLICY_LINEAGE_REQUIRED';end if;
 preset:=case when a.account_mode like 'PROP%' then 'PROP_SAFE' when p_risk<=.5 then 'CONSERVATIVE' else 'BALANCED' end;
 strategy_ids:=array[]::text[];
 if 'CRYPTO_TREND'=any(canonical_strategies) then strategy_ids:=strategy_ids||array['crypto.micro-scalper','crypto.quick-scalp','crypto.compression-breakout','crypto.swing-continuation'];end if;
 if 'FOREX_TREND'=any(canonical_strategies) then strategy_ids:=strategy_ids||array['forex.micro-scalper','forex.swing-continuation','forex.london-breakout','forex.new-york-continuation','forex.trend-pullback'];end if;
 if 'GOLD_BREAKOUT'=any(canonical_strategies) then strategy_ids:=strategy_ids||array['gold.volatility-breakout'];end if;
 content:=jsonb_build_object('policy',p_policy,'risk',p_risk,'strategies',canonical_strategies,'family',family,'version','1.0.0');
 select * into prior from public.customer_brain_change_requests where customer_id=p_customer_id and execution_account_id=p_account_id and idempotency_key=p_idempotency_key;
 if found then
  if prior.request_content is distinct from content then raise exception 'IDEMPOTENCY_CONTENT_CONFLICT';end if;
  if not exists(select 1 from public.account_brain_assignments where id=prior.assignment_id and execution_account_id=p_account_id and customer_id=p_customer_id and superseded_at is null) then raise exception 'STALE_POLICY_REQUEST';end if;
  return jsonb_build_object('assignment_id',prior.assignment_id,'family',family,'version','1.0.0');
 end if;
 update public.account_brain_assignments set superseded_at=now() where execution_account_id=p_account_id and customer_id=p_customer_id and superseded_at is null;
 insert into public.account_brain_assignments(customer_id,execution_account_id,brain_family,policy_version,risk_preference,strategy_permissions,assignment_reason,assigned_by) values(p_customer_id,p_account_id,family,'1.0.0',p_risk,canonical_strategies,'SERVER_APPROVED_ONBOARDING',p_customer_id) returning id into assignment;
 insert into public.customer_brain_change_requests values(p_customer_id,p_account_id,p_idempotency_key,content,assignment,now());
 -- A policy change stops new entries and requires re-certification; monitoring is preserved.
 update public.connected_execution_accounts set execution_enabled=false,phase_h_certification_status='REQUIRED',policy_profile_id=expected_id,policy_version='1.0.0',policy_preset=preset,policy_overrides=policy_overrides||jsonb_build_object('base_policy',p_policy,'policy_configuration',coalesce(policy_overrides->'policy_configuration','{}'::jsonb)||jsonb_build_object('preset',preset,'riskPerTradePct',p_risk,'allowedStrategies',strategy_ids)) where id=p_account_id and customer_id=p_customer_id;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer_id,p_account_id,p_customer_id,'BRAIN_ASSIGNED',content);
 return jsonb_build_object('assignment_id',assignment,'family',family,'version','1.0.0');
end $$;

create or replace function public.store_phase_n_customer_credentials(p_customer_id uuid,p_account_id uuid,p_provider text,p_secret_json text,p_identity text,p_capabilities jsonb)
returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare a public.connected_execution_accounts%rowtype;ref uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or lower(a.provider) is distinct from lower(p_provider) then raise exception 'ACCOUNT_PROVIDER_OWNERSHIP_REQUIRED';end if;
 if not ((p_provider='binance' and a.environment in('testnet','live')) or(p_provider='bybit' and a.environment in('demo','live'))) then raise exception 'SANDBOX_ENVIRONMENT_REQUIRED';end if;
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
revoke all on function public.store_phase_n_customer_credentials(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_phase_n_customer_credentials(uuid,uuid,text,text,text,jsonb) to service_role;


create function public.consume_customer_environment_pairing(p_customer_id uuid,p_execution_account_id uuid,p_mt5_account_id uuid,p_bridge_id text,p_worker_id text,p_code_hash text,p_environment text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; c public.hashibridge_pairing_codes%rowtype; terminal jsonb; reference text;
begin
 select * into a from public.connected_execution_accounts where id=p_execution_account_id and customer_id=p_customer_id for update;
 if not found or a.provider is null or a.provider not in('MT5_PERSONAL','MT5_PROP') or a.environment not in('demo','live') or a.environment is distinct from p_environment then return jsonb_build_object('state','BLOCKED','reason','ACCOUNT_SCOPE_REQUIRED');end if;
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
revoke all on function public.consume_customer_environment_pairing(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.consume_customer_environment_pairing(uuid,uuid,uuid,text,text,text,text) to service_role;

-- Credential removal must not orphan open/uncertain exposure. Only a recent,
-- complete account-scoped monitor snapshot can prove that it is safe to remove.

-- Live connections can publish observations while the independent entry prohibition remains in place.
alter table public.trade_management_truth drop constraint if exists trade_management_truth_environment_check;
alter table public.trade_management_truth add constraint trade_management_truth_environment_check check(environment in('testnet','demo','live')) not valid;
