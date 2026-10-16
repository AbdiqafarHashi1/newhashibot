-- Drafts have no secret. Only verified Crypto accounts may be monitored or enabled.
alter table public.connected_execution_accounts alter column credential_ref drop not null;
alter table public.connected_execution_accounts drop constraint if exists connected_execution_accounts_provider_check;
alter table public.connected_execution_accounts add constraint connected_execution_accounts_provider_check check(provider in('binance','bybit','MT5_PERSONAL','MT5_PROP')) not valid;
alter table public.connected_execution_accounts add constraint customer_verified_credential_before_monitor check(provider not in('binance','bybit') or (not enabled and not monitor_enabled and not execution_enabled) or (credential_ref is not null and credentials_verified_at is not null)) not valid;

-- Ownership remains immutable. One verified binding is allowed for a disabled,
-- never-verified draft; subsequent rotations must prove the same provider identity.
create or replace function public.assert_execution_account_identity_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if row(old.customer_id,old.provider,old.environment,old.immutable_identity,old.execution_instance_id) is distinct from row(new.customer_id,new.provider,new.environment,new.immutable_identity,new.execution_instance_id) then raise exception 'execution account ownership and identity are immutable';end if;
 if old.provider_account_identity is distinct from new.provider_account_identity and ((
  auth.role()='service_role' and old.provider in('binance','bybit','MT5_PERSONAL','MT5_PROP') and old.provider_account_identity='draft:'||old.id::text and old.credentials_verified_at is null and not old.enabled and not old.execution_enabled and new.credentials_verified_at is not null and new.credential_ref is not null and nullif(new.provider_account_identity,'') is not null and new.provider_account_identity !~ ':'
 ) is not true) then raise exception 'verified provider identity is immutable';end if;
 return new;
end $$;

-- Forward only. Account setup is idempotent and Brain history changes atomically.
create table public.customer_account_setup_requests (
 customer_id uuid not null references auth.users(id), idempotency_key text not null,
 request_content jsonb not null, execution_account_id uuid not null references public.connected_execution_accounts(id),
 created_at timestamptz not null default now(), primary key(customer_id,idempotency_key)
);
create table public.customer_brain_change_requests (
 customer_id uuid not null references auth.users(id), execution_account_id uuid not null references public.connected_execution_accounts(id),
 idempotency_key text not null, request_content jsonb not null, assignment_id uuid not null references public.account_brain_assignments(id),
 created_at timestamptz not null default now(), primary key(customer_id,execution_account_id,idempotency_key)
);
alter table public.customer_account_setup_requests enable row level security;
alter table public.customer_brain_change_requests enable row level security;
revoke all on public.customer_account_setup_requests, public.customer_brain_change_requests from public, anon, authenticated;
grant select on public.customer_account_setup_requests, public.customer_brain_change_requests to authenticated;
grant all on public.customer_account_setup_requests, public.customer_brain_change_requests to service_role;
create policy setup_request_owner on public.customer_account_setup_requests for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy brain_change_owner on public.customer_brain_change_requests for select to authenticated using(customer_id=auth.uid() or public.is_admin());
alter table public.customer_onboarding_sessions drop constraint if exists customer_onboarding_sessions_package_code_check;
alter table public.customer_onboarding_sessions add constraint customer_onboarding_sessions_package_code_check check(package_code in('FREE_SIGNALS','VIP_SIGNALS','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION','FOUNDING_AUTO_EXECUTION'));

create function public.create_customer_demo_account(p_customer_id uuid,p_provider text,p_mode text,p_label text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare content jsonb; prior public.customer_account_setup_requests%rowtype; account uuid; connection uuid; env text; stored_provider text;
begin
 if p_customer_id is null or p_provider is null or p_mode is null or p_provider not in('MT5','BINANCE','BYBIT') or p_mode not in('PERSONAL','PROP') or (p_mode='PROP' and p_provider<>'MT5') then raise exception 'UNSUPPORTED_PROVIDER_MODE';end if;
 if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 or p_label is null or length(p_label) not between 1 and 80 then raise exception 'INVALID_SETUP_REQUEST';end if;
 stored_provider:=case when p_provider='MT5' then case when p_mode='PROP' then 'MT5_PROP' else 'MT5_PERSONAL' end else lower(p_provider) end;
 env:=case when p_provider='BINANCE' then 'testnet' else 'demo' end;
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

create function public.assign_customer_account_brain(p_customer_id uuid,p_account_id uuid,p_risk numeric,p_strategies text[],p_idempotency_key text,p_policy jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; prior public.customer_brain_change_requests%rowtype; content jsonb; assignment uuid; family text; permitted text[]; maxrisk numeric; canonical_strategies text[]; strategy_ids text[]; preset text; expected_id text;
begin
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if a.environment is null or a.environment not in('demo','testnet') then raise exception 'SANDBOX_ENVIRONMENT_REQUIRED';end if;
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
 update public.connected_execution_accounts set execution_enabled=false,phase_h_certification_status='REQUIRED',policy_profile_id=expected_id,policy_version='1.0.0',policy_preset=preset,policy_overrides=policy_overrides||jsonb_build_object('base_policy',p_policy,'policy_configuration',jsonb_build_object('preset',preset,'riskPerTradePct',p_risk,'allowedStrategies',strategy_ids)) where id=p_account_id and customer_id=p_customer_id;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer_id,p_account_id,p_customer_id,'BRAIN_ASSIGNED',content);
 return jsonb_build_object('assignment_id',assignment,'family',family,'version','1.0.0');
end $$;
revoke all on function public.create_customer_demo_account(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb) from public,anon,authenticated;
grant execute on function public.create_customer_demo_account(uuid,text,text,text,text) to service_role;
grant execute on function public.assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb) to service_role;

-- Verified Crypto setup activates observation only, never order entry. Rotation
-- cannot silently switch the physical provider account under an existing bot.
create or replace function public.store_phase_n_customer_credentials(p_customer_id uuid,p_account_id uuid,p_provider text,p_secret_json text,p_identity text,p_capabilities jsonb)
returns uuid language plpgsql security definer set search_path=public,vault,extensions as $$
declare a public.connected_execution_accounts%rowtype;ref uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or lower(a.provider) is distinct from lower(p_provider) then raise exception 'ACCOUNT_PROVIDER_OWNERSHIP_REQUIRED';end if;
 if not ((p_provider='binance' and a.environment='testnet') or(p_provider='bybit' and a.environment='demo')) then raise exception 'SANDBOX_ENVIRONMENT_REQUIRED';end if;
 if p_identity is null or length(p_identity) not between 1 and 200 or p_identity ~ ':' or p_identity='canonical-binance-testnet-system' then raise exception 'CUSTOMER_PROVIDER_IDENTITY_UNVERIFIED';end if;
 if (p_capabilities->>'verified') is distinct from 'true' or(p_capabilities->>'trading') is distinct from 'true' or(p_capabilities->>'withdrawal') is distinct from 'false' then raise exception 'UNSAFE_CREDENTIAL_CAPABILITIES';end if;
 if coalesce(p_secret_json::jsonb->>'api_key','')='' or coalesce(p_secret_json::jsonb->>'api_secret','')='' then raise exception 'CREDENTIAL_REQUIRED';end if;
 if a.credentials_verified_at is not null and a.provider_account_identity is distinct from p_identity then raise exception 'PROVIDER_IDENTITY_CHANGED_CREATE_SEPARATE_ACCOUNT';end if;
 if a.credential_ref is null then select vault.create_secret(p_secret_json,'customer-sandbox-'||a.id::text,'Verified account-scoped credential') into ref;
 else ref:=a.credential_ref::uuid;perform vault.update_secret(ref,p_secret_json);end if;
 update public.connected_execution_accounts set credential_ref=ref::text,provider_account_identity=p_identity,credentials_verified_at=now(),provider_health='healthy',last_synchronized_at=now(),enabled=true,monitor_enabled=true,execution_enabled=false,phase_h_certification_status='REQUIRED',updated_at=now() where id=a.id and customer_id=a.customer_id;
 update public.provider_connections set secret_reference=ref::text,external_fingerprint=encode(extensions.digest(p_identity,'sha256'),'hex'),capabilities=p_capabilities,state='VERIFIED',last_verified_at=now(),last_heartbeat_at=now(),safe_error_code=null,updated_at=now() where execution_account_id=a.id and customer_id=a.customer_id;
 if not found then raise exception 'PROVIDER_CONNECTION_REQUIRED';end if;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(a.customer_id,a.id,'CRYPTO_CREDENTIAL_VERIFIED',jsonb_build_object('provider',p_provider,'withdrawal',false));
 return ref;
end $$;
revoke all on function public.store_phase_n_customer_credentials(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_phase_n_customer_credentials(uuid,uuid,text,text,text,jsonb) to service_role;

-- Pair only an already authorized, owner-managed terminal/bridge assignment.
-- The short-lived customer code binds it to one logical account; it grants no order entry.
create function public.consume_customer_bridge_pairing(p_customer_id uuid,p_execution_account_id uuid,p_mt5_account_id uuid,p_bridge_id text,p_worker_id text,p_code_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; c public.hashibridge_pairing_codes%rowtype; terminal jsonb; reference text;
begin
 select * into a from public.connected_execution_accounts where id=p_execution_account_id and customer_id=p_customer_id for update;
 if not found or a.provider is null or a.provider not in('MT5_PERSONAL','MT5_PROP') or a.environment is distinct from 'demo' then return jsonb_build_object('state','BLOCKED','reason','ACCOUNT_SCOPE_REQUIRED');end if;
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
 update public.provider_connections set state='CONNECTED',bridge_identity=p_bridge_id,last_verified_at=now(),last_heartbeat_at=now(),capabilities=capabilities||jsonb_build_object('mt5_account_id',p_mt5_account_id,'trading',true,'environment','demo'),safe_error_code=null,updated_at=now() where id=c.connection_id and customer_id=p_customer_id and execution_account_id=a.id;
 if not found then raise exception 'PAIRING_CONNECTION_MISSING';end if;
 insert into public.phase_h_audit_events(customer_id,execution_account_id,event_type,safe_metadata) values(p_customer_id,a.id,'BRIDGE_PAIRING_CONFIRMED',jsonb_build_object('bridge_id',p_bridge_id,'mt5_account_id',p_mt5_account_id));
 return jsonb_build_object('state','CONNECTED','execution_account_id',a.id,'execution_enabled',false);
end $$;
revoke all on function public.consume_customer_bridge_pairing(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.consume_customer_bridge_pairing(uuid,uuid,uuid,text,text,text) to service_role;

-- Credential removal must not orphan open/uncertain exposure. Only a recent,
-- complete account-scoped monitor snapshot can prove that it is safe to remove.
create or replace function public.revoke_phase_n_customer_credentials(p_customer_id uuid,p_account_id uuid)
returns boolean language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare a public.connected_execution_accounts%rowtype; proof jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from public.connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if a.provider is null or a.provider not in('binance','bybit') then raise exception 'CRYPTO_ACCOUNT_REQUIRED';end if;
 if a.credential_ref is null then return true;end if;
 select to_jsonb(p) into proof from public.execution_account_runtime_proof p where p.customer_id=a.customer_id and p.provider=a.provider and p.account_id=a.account_id and p.execution_instance_id=a.execution_instance_id and p.credential_ref=a.credential_ref and p.observed_at>=now()-interval '3 minutes' and p.observed_at<=clock_timestamp();
 if proof is null or (proof->'account_state'->>'flat_verified') is distinct from 'true' then raise exception 'ACCOUNT_MUST_BE_CONFIRMED_FLAT';end if;
 -- Submission and revocation serialize on the same account row. Never remove
 -- protection credentials while an admitted entry or uncertain lifecycle exists.
 if exists(select 1 from public.crypto_account_execution_truth t where t.execution_account_id=a.id and t.customer_id=a.customer_id and (t.lifecycle_state is null or t.lifecycle_state not in('CLOSED','REJECTED')))
 or exists(select 1 from public.execution_orders o where o.customer_id=a.customer_id and o.account_id in(a.account_id,a.id::text) and (o.status is null or o.status not in('closed_tp','closed_tp2','closed_profit_lock','closed_sl','closed_breakeven','closed_timeout','closed_expired','closed_expired_after_tp1','closed_manual','cancelled','failed','skipped','stale_closed'))) then raise exception 'ACCOUNT_HAS_UNRESOLVED_EXECUTION';end if;
 delete from vault.secrets where id=a.credential_ref::uuid;
 update public.connected_execution_accounts set credential_ref=null,credentials_verified_at=null,provider_health='not_configured',enabled=false,monitor_enabled=false,execution_enabled=false,phase_h_certification_status='REQUIRED',updated_at=now() where id=a.id and customer_id=a.customer_id;
 update public.provider_connections set secret_reference=null,state='DISCONNECTED',capabilities='{}',last_verified_at=null,last_heartbeat_at=null,updated_at=now() where execution_account_id=a.id and customer_id=a.customer_id;
 return true;
end $$;
revoke all on function public.revoke_phase_n_customer_credentials(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_phase_n_customer_credentials(uuid,uuid) to service_role;
