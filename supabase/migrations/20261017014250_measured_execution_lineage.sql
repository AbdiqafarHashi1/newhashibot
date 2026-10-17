-- Preserve the current measured scanner release in the transactional Phase-D evidence fingerprint.
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
 result:=jsonb_build_object('measured_release',(select to_jsonb(m) from strategy_release_candidates m where m.strategy_id=s.strategy_id and m.state='PROMOTED' limit 1),'account',to_jsonb(a)-array['credential_ref'],'signal',to_jsonb(s),'assignment',to_jsonb(b),'connection',to_jsonb(c)-array['secret_reference'],'policy',a.policy_overrides->'base_policy','context',proof->'account_context','observed_at',coalesce(proof->>'observed_at',proof->>'captured_at'),'contract',proof->'contract_specification','routing_policy',proof->'routing_policy','capabilities',proof->'capabilities','strategy_plan',strategy,'qualified_set',qualified,'provisioning',binding,'product',execution_product,'entitlement',jsonb_build_object('state',case when e is null then 'INACTIVE' else 'ACTIVE' end,'expiresAt',e->>'valid_until'),'history_fingerprint',encode(sha256(convert_to(history::text,'UTF8')),'hex'),'pending_orders',(proof->>'pending_orders')::integer,'active_symbol_conflict',exists(select 1 from execution_orders x where x.customer_id=a.customer_id and x.account_id=a.account_id::text and x.symbol=s.symbol and x.status in('entry_submitted','entry_filled','protected','protected_native','partially_closed','protection_pending','protection_failed')));
 return result||jsonb_build_object('evidence_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end$$;
revoke all on function public.load_production_account_authorization_input(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_production_account_authorization_input(uuid,uuid,uuid) to service_role;

create function public.assert_measured_execution_lineage(p_evidence jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare r jsonb:=p_evidence->'measured_release';sp jsonb:=p_evidence->'strategy_plan';sig jsonb:=p_evidence->'signal';frozen jsonb;begin
 if r->>'state' is distinct from 'PROMOTED' or r->>'strategy_id' is distinct from sig->>'strategy_id' or r->>'id' is null or sp->'provenance'->>'measured_release_id' is distinct from r->>'id' then raise exception 'CURRENT_MEASURED_EXECUTION_RELEASE_REQUIRED';end if;
 select x into frozen from jsonb_array_elements(r->'immutable_configuration'->'strategies') x where x->>'id'=sig->>'strategy_id' and x->>'enabled'='true' limit 1;
 if frozen is null or not coalesce(frozen->'symbols' ? (sig->>'symbol'),false) or not coalesce(frozen->'timeframes' ? (sig->>'timeframe'),false) then raise exception 'MEASURED_RELEASE_SCOPE_MISMATCH';end if;
 if jsonb_typeof(sp->'provenance'->'evaluated_parameters') is distinct from 'object' or jsonb_typeof(frozen->'parameters') is distinct from 'object' or sp->'provenance'->'evaluated_parameters' is distinct from frozen->'parameters' then raise exception 'EVALUATED_STRATEGY_PARAMETERS_MISMATCH';end if;
 if not exists(select 1 from jsonb_array_elements(p_evidence->'qualified_set'->'entries') e where e->>'strategyId'=sig->>'strategy_id' and e->>'strategyVersion'=sig->>'strategy_version' and e->'supportedSymbols' ? (sig->>'symbol') and e->'supportedTimeframes' ? (sig->>'timeframe') and e->'strategyParameters'=sp->'provenance'->'evaluated_parameters') then raise exception 'QUALIFIED_STRATEGY_PARAMETERS_MISMATCH';end if;
end$$;
revoke all on function public.assert_measured_execution_lineage(jsonb) from public,anon,authenticated;
grant execute on function public.assert_measured_execution_lineage(jsonb) to service_role;
create or replace function public.commit_production_account_authorization(p_customer_id uuid,p_account_id uuid,p_signal_id uuid,p_idempotency_key text,p_evidence_hash text,p_decision jsonb,p_execution_plan jsonb default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;prior account_authorization_requests;d execution_account_policy_decisions;fresh jsonb;qty numeric;risk numeric;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if nullif(p_idempotency_key,'') is null or length(p_idempotency_key)>200 then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 select * into prior from account_authorization_requests where execution_account_id=a.id and idempotency_key=p_idempotency_key;
 if found then if prior.signal_id is distinct from p_signal_id or prior.customer_id is distinct from p_customer_id then raise exception 'AUTHORIZATION_CONTENT_CONFLICT';end if;select * into d from execution_account_policy_decisions where id=prior.decision_id;return to_jsonb(d)||jsonb_build_object('idempotent',true);end if;
 fresh:=load_production_account_authorization_input(p_customer_id,p_account_id,p_signal_id);
 if fresh->>'evidence_hash' is distinct from p_evidence_hash then raise exception 'ACCOUNT_EVIDENCE_CHANGED';end if;
 if p_decision->>'customerId' is distinct from a.customer_id::text or p_decision->>'accountId' is distinct from a.id::text or p_decision->>'signalId' is distinct from p_signal_id::text or p_decision->>'policyProfileId' is distinct from a.policy_profile_id or p_decision->>'policyVersion' is distinct from a.policy_version or p_decision->>'immutableAccountIdentity' is distinct from a.immutable_identity or p_decision->>'brainProvider' is distinct from upper(a.provider) or p_decision->>'authorityVersion' is distinct from 'account-policy-authority/v1' then raise exception 'ACCOUNT_DECISION_LINEAGE_MISMATCH';end if;
 qty:=(p_decision->'executionIntent'->>'approvedQuantity')::numeric;risk:=(p_decision->>'authorizedRiskPct')::numeric;
 if p_decision->>'decision' in('ALLOW','REDUCE') then
 perform assert_measured_execution_lineage(fresh);
 if a.enabled is distinct from true or a.execution_enabled is distinct from true or a.runtime_control not in('START','RESUME') or upper(a.provider_health) is distinct from 'HEALTHY' or fresh->'entitlement'->>'state' is distinct from 'ACTIVE' or qty is null or qty<=0 or qty in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or risk is null or risk in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or risk<=0 or (fresh->'assignment'->>'risk_preference') is null or risk>(fresh->'assignment'->>'risk_preference')::numeric or fresh->>'observed_at' is null or (fresh->>'observed_at')::timestamptz<clock_timestamp()-interval '60 seconds' or (fresh->'signal'->>'expires_at')::timestamptz<=clock_timestamp() or fresh->'signal'->>'status' not in('waiting','active') then raise exception 'ACCOUNT_DECISION_NOT_EXECUTABLE';end if;
 if p_execution_plan is null or p_execution_plan->>'schema_version' is distinct from 'execution-plan/v1' or p_execution_plan->>'status' is distinct from 'PLANNED' or p_execution_plan->'risk_decision'->>'decision_id' is distinct from p_decision->>'decisionId' or p_execution_plan->'routing'->>'account_id' is distinct from a.id::text or p_execution_plan->'risk_decision'->'account'->>'id' is distinct from a.id::text or p_execution_plan->'risk_decision'->'account'->>'customer_id' is distinct from a.customer_id::text or (p_execution_plan->'risk_decision'->'authorized_envelope'->>'authorized_risk_percent')::numeric is distinct from risk or (p_execution_plan->'capital_allocation_plan'->'allocation'->>'quantity')::numeric is distinct from qty then raise exception 'EXACT_PHASE_D_PLAN_REQUIRED';end if;
 else if p_decision->>'decision' not in('BLOCK','LOCK') or qty is not null or risk is distinct from 0 then raise exception 'BLOCKED_DECISION_HAS_INTENT';end if;end if;
 insert into execution_account_policy_decisions(id,customer_id,execution_account_id,signal_id,decision,reason_codes,authorized_risk_pct,brain_family,brain_provider,brain_version,policy_profile_id,policy_version,configuration,created_at,intent_id,approved_quantity,evidence_hash,decision_evidence)
 values(p_decision->>'decisionId',a.customer_id,a.id,p_signal_id,p_decision->>'decision',array(select jsonb_array_elements_text(p_decision->'reasonCodes')),risk,p_decision->>'brainFamily',p_decision->>'brainProvider',p_decision->>'brainVersion',a.policy_profile_id,a.policy_version,p_decision->'configuration',(p_decision->>'evaluatedAt')::timestamptz,p_decision->'executionIntent'->>'intentId',qty,p_evidence_hash,p_decision)
 on conflict(customer_id,execution_account_id,signal_id,policy_profile_id,policy_version) do nothing;
 select * into d from execution_account_policy_decisions where customer_id=a.customer_id and execution_account_id=a.id and signal_id=p_signal_id and policy_profile_id=a.policy_profile_id and policy_version=a.policy_version;
 if d.evidence_hash is distinct from p_evidence_hash or d.decision_evidence is distinct from p_decision then raise exception 'CANONICAL_DECISION_ALREADY_FROZEN';end if;
 if p_execution_plan is not null and p_decision->>'decision' in('ALLOW','REDUCE') then insert into certified_runtime_artifacts(evaluation_id,account_id,strategy_plan_id,risk_decision,capital_allocation_plan,execution_plan) values(p_execution_plan->>'evaluation_id',a.id::text,p_execution_plan->'strategy_plan'->'identity'->>'strategy_id',p_execution_plan->'risk_decision',p_execution_plan->'capital_allocation_plan',p_execution_plan) on conflict(evaluation_id,account_id) do nothing;end if;
 insert into account_authorization_requests(customer_id,execution_account_id,signal_id,idempotency_key,decision_id) values(a.customer_id,a.id,p_signal_id,p_idempotency_key,d.id);return to_jsonb(d)||jsonb_build_object('idempotent',false,'execution_plan_id',p_execution_plan->>'execution_plan_id');
end$$;
revoke all on function public.commit_production_account_authorization(uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_production_account_authorization(uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;

-- Customer-terminal metadata for account sizing; the owner scanner feed is not a substitute.
alter table public.mt5_symbol_specs add column if not exists tick_size numeric,add column if not exists tick_value numeric,add column if not exists currency_profit text,add column if not exists account_currency text,add column if not exists quote_to_account_conversion numeric,add column if not exists tick_at timestamptz,add column if not exists trade_mode integer,add column if not exists bid numeric,add column if not exists ask numeric;

-- Provider snapshots refresh the matching account's health; onboarding verification is not a permanent heartbeat.
create function public.refresh_owned_provider_health() returns trigger
language plpgsql security definer set search_path=public as $$
declare observed timestamptz;healthy boolean;begin
 if tg_table_name='execution_account_runtime_proof' then
  observed:=new.observed_at;healthy:=new.monitor_status='healthy';
  if observed is null or observed>clock_timestamp()+interval '5 seconds' or observed<clock_timestamp()-interval '60 seconds' then return new;end if;
  update connected_execution_accounts set provider_health=case when healthy then 'healthy' else 'degraded' end,last_synchronized_at=observed,updated_at=clock_timestamp()
  where customer_id=new.customer_id and account_id=new.account_id and upper(provider)=upper(new.provider) and execution_instance_id=new.execution_instance_id and credential_ref=new.credential_ref and upper(environment)=upper(new.environment) and (last_synchronized_at is null or last_synchronized_at<=observed);
 else
  observed:=new.captured_at;healthy:=new.terminal_authenticated=true and new.trade_permission=true and new.terminal_autotrading=true;
  if observed is null or observed>clock_timestamp()+interval '5 seconds' or observed<clock_timestamp()-interval '60 seconds' then return new;end if;
  update connected_execution_accounts a set provider_health=case when healthy then 'healthy' else 'degraded' end,last_synchronized_at=observed,updated_at=clock_timestamp()
  where a.customer_id=new.owner_id and a.provider_account_identity=new.account_id::text and a.provider in('MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO'
  and exists(select 1 from mt5_accounts m where m.id=new.account_id and m.user_id=a.customer_id and m.bridge_id=new.bridge_id and m.credential_ref=a.credential_ref)
  and (a.last_synchronized_at is null or a.last_synchronized_at<=observed);
 end if;return new;
end$$;
revoke all on function public.refresh_owned_provider_health() from public,anon,authenticated;
create trigger refresh_crypto_account_health after insert or update on public.execution_account_runtime_proof for each row execute function public.refresh_owned_provider_health();
create trigger refresh_mt5_account_health after insert on public.mt5_account_snapshots for each row execute function public.refresh_owned_provider_health();
