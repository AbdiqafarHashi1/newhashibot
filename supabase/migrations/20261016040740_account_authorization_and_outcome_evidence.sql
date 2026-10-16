-- Supplemental provider evidence; existing E/F truth remains lifecycle authority.
create table public.account_closed_provider_outcomes(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 execution_truth_id uuid not null,provider text not null check(provider in('BINANCE','BYBIT','MT5_PERSONAL','MT5_PROP')),
 closed_at timestamptz not null,currency text not null,net_pnl numeric not null check(net_pnl not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 source text not null,source_ids text[] not null check(cardinality(source_ids)>0),created_at timestamptz not null default now(),
 unique(execution_account_id,execution_truth_id)
);
alter table public.account_closed_provider_outcomes enable row level security;
revoke all on public.account_closed_provider_outcomes from public,anon,authenticated;
grant select on public.account_closed_provider_outcomes to authenticated,service_role;
create policy closed_provider_outcomes_read on public.account_closed_provider_outcomes for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());
create trigger closed_provider_outcomes_immutable before update or delete on public.account_closed_provider_outcomes for each row execute function public.prevent_monitor_evidence_mutation();
create function public.record_account_closed_provider_outcome(p_customer_id uuid,p_account_id uuid,p_provider text,p_execution_id uuid,p_closed_at timestamptz,p_currency text,p_net_pnl numeric,p_source text,p_source_ids text[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;t jsonb;prior account_closed_provider_outcomes;result uuid;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or upper(a.provider) is distinct from p_provider or not ((p_provider='BINANCE' and upper(a.environment)='TESTNET') or (p_provider in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO')) then raise exception 'OUTCOME_ACCOUNT_SCOPE';end if;
 if p_provider in('BINANCE','BYBIT') then select to_jsonb(x) into t from crypto_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state='CLOSED';else select to_jsonb(x) into t from mt5_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state='TP2_CLOSED';end if;
 if t is null or p_closed_at is null or p_closed_at>clock_timestamp()+interval '5 seconds' or p_closed_at<(t->>'created_at')::timestamptz or nullif(p_currency,'') is null or p_net_pnl is null or p_net_pnl in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or coalesce(cardinality(p_source_ids),0)=0 then raise exception 'OUTCOME_EVIDENCE_INCOMPLETE';end if;
 if (p_provider='BINANCE' and p_source is distinct from 'BINANCE_USER_TRADES_AND_INCOME') or (p_provider='BYBIT' and p_source is distinct from 'BYBIT_CLOSED_PNL') or (p_provider like 'MT5_%' and p_source is distinct from 'MT5_DEALS') then raise exception 'OUTCOME_SOURCE_MISMATCH';end if;
 select * into prior from account_closed_provider_outcomes where execution_account_id=a.id and execution_truth_id=p_execution_id;
 if found then if row(prior.closed_at,prior.currency,prior.net_pnl,prior.source,prior.source_ids) is distinct from row(p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) then raise exception 'OUTCOME_CONTENT_CONFLICT';end if;return prior.id;end if;
 insert into account_closed_provider_outcomes(customer_id,execution_account_id,execution_truth_id,provider,closed_at,currency,net_pnl,source,source_ids) values(a.customer_id,a.id,p_execution_id,p_provider,p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) returning id into result;return result;
end$$;
revoke all on function public.record_account_closed_provider_outcome(uuid,uuid,text,uuid,timestamptz,text,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.record_account_closed_provider_outcome(uuid,uuid,text,uuid,timestamptz,text,numeric,text,text[]) to service_role;


-- Complete observed context is supplied only by a trusted provider worker. Browser roles cannot write it.
create table if not exists public.account_policy_evidence(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 execution_instance_id uuid not null,credential_ref text not null,provider text not null,symbol text not null,observed_at timestamptz not null,
 account_context jsonb not null,contract_specification jsonb not null,routing_policy jsonb not null,capabilities jsonb not null,
 pending_orders integer not null check(pending_orders>=0),source_reference text not null,
 unique(execution_account_id,symbol,observed_at)
);
alter table public.account_policy_evidence enable row level security;
revoke all on public.account_policy_evidence from public,anon,authenticated;
grant select,insert on public.account_policy_evidence to service_role;
create trigger account_policy_evidence_immutable before update or delete on public.account_policy_evidence for each row execute function public.prevent_monitor_evidence_mutation();
create table if not exists public.certified_strategy_plans(
 id uuid primary key default gen_random_uuid(),evaluation_id text not null,candidate_id uuid not null,scanner_run_id uuid,
 arbitration_decision_key text,strategy_id text not null,strategy_version text not null,canonical_side text,symbol text,market text,
 strategy_plan jsonb not null,persisted_at timestamptz not null default now()
);
alter table public.certified_strategy_plans enable row level security;
revoke all on public.certified_strategy_plans from public,anon,authenticated;
grant select,insert on public.certified_strategy_plans to service_role;
create table if not exists public.certified_runtime_artifacts(
 id uuid primary key default gen_random_uuid(),evaluation_id text not null,account_id text not null,strategy_plan_id text not null,
 risk_decision jsonb not null,capital_allocation_plan jsonb not null,execution_plan jsonb not null,execution_attempt jsonb,
 created_at timestamptz not null default now(),unique(evaluation_id,account_id)
);
alter table public.certified_runtime_artifacts enable row level security;
revoke all on public.certified_runtime_artifacts from public,anon,authenticated;
grant select,insert,update on public.certified_runtime_artifacts to service_role;
grant select on public.certified_runtime_artifacts to authenticated;
create policy runtime_artifacts_scoped_read on public.certified_runtime_artifacts for select to authenticated using(risk_decision->'account'->>'customer_id'=(select auth.uid())::text or public.is_admin());
-- One durable Phase-D producer; no provider submission or new scanner schedule.
create table public.account_authorization_requests(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 signal_id uuid not null,idempotency_key text not null,decision_id text not null references public.execution_account_policy_decisions(id),created_at timestamptz not null default now(),
 unique(execution_account_id,idempotency_key)
);
alter table public.account_authorization_requests enable row level security;
revoke all on public.account_authorization_requests from public,anon,authenticated;
grant select on public.account_authorization_requests to authenticated;
create policy account_authorization_requests_read on public.account_authorization_requests for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());
alter table public.execution_account_policy_decisions add column if not exists evidence_hash text,add column if not exists decision_evidence jsonb;
create function public.load_production_account_authorization_input(p_customer_id uuid,p_account_id uuid,p_signal_id uuid) returns jsonb
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
 select to_jsonb(p) into binding from customer_onboarding_provisioning p where execution_account_id=a.id and customer_id=a.customer_id and p.product=execution_product;
 select result_summary->'qualifiedSet' into qualified from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'->>'id'=execution_product||'_QUALIFIED_SET' order by created_at desc limit 1;
 select to_jsonb(x) into proof from account_policy_evidence x where execution_account_id=a.id and customer_id=a.customer_id and execution_instance_id=a.execution_instance_id and credential_ref=a.credential_ref and provider=upper(a.provider) and symbol=s.symbol order by observed_at desc limit 1;
 select jsonb_build_object('closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from crypto_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state='CLOSED'),'[]'::jsonb),'mt5_closed',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from mt5_account_execution_truth t where t.customer_id=a.customer_id and t.execution_account_id=a.id and t.lifecycle_state='TP2_CLOSED'),'[]'::jsonb),'outcomes',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from account_closed_provider_outcomes o where o.customer_id=a.customer_id and o.execution_account_id=a.id),'[]'::jsonb)) into history;
 select to_jsonb(h) into e from execution_entitlement_bindings x join phase_h_entitlements h on h.id=x.entitlement_id and h.customer_id=x.customer_id where x.customer_id=a.customer_id and x.execution_account_id=a.id and x.state='ACTIVE' and h.state in('ACTIVE','TRIAL','GRACE') and h.source<>'NOT_CONFIGURED' and (h.valid_until is null or h.valid_until>now()) limit 1;
 result:=jsonb_build_object('account',to_jsonb(a)-array['credential_ref'],'signal',to_jsonb(s),'assignment',to_jsonb(b),'connection',to_jsonb(c)-array['secret_reference'],'policy',a.policy_overrides->'base_policy','context',proof->'account_context','observed_at',coalesce(proof->>'observed_at',proof->>'captured_at'),'contract',proof->'contract_specification','routing_policy',proof->'routing_policy','capabilities',proof->'capabilities','strategy_plan',strategy,'qualified_set',qualified,'provisioning',binding,'product',execution_product,'entitlement',jsonb_build_object('state',case when e is null then 'INACTIVE' else 'ACTIVE' end,'expiresAt',e->>'valid_until'),'history_fingerprint',encode(sha256(convert_to(history::text,'UTF8')),'hex'),'pending_orders',(proof->>'pending_orders')::integer,'active_symbol_conflict',exists(select 1 from execution_orders x where x.customer_id=a.customer_id and x.account_id=a.account_id::text and x.symbol=s.symbol and x.status in('entry_submitted','entry_filled','protected','protected_native','partially_closed','protection_pending','protection_failed')));
 return result||jsonb_build_object('evidence_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end$$;
revoke all on function public.load_production_account_authorization_input(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_production_account_authorization_input(uuid,uuid,uuid) to service_role;
create function public.commit_production_account_authorization(p_customer_id uuid,p_account_id uuid,p_signal_id uuid,p_idempotency_key text,p_evidence_hash text,p_decision jsonb,p_execution_plan jsonb default null) returns jsonb
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
 if a.enabled is distinct from true or a.execution_enabled is distinct from true or a.runtime_control not in('START','RESUME') or upper(a.provider_health) is distinct from 'HEALTHY' or fresh->'entitlement'->>'state' is distinct from 'ACTIVE' or qty is null or qty<=0 or qty in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or risk is null or risk in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or risk<=0 or (fresh->'assignment'->>'risk_preference') is null or risk>(fresh->'assignment'->>'risk_preference')::numeric or (fresh->>'observed_at')::timestamptz<clock_timestamp()-interval '60 seconds' or (fresh->'signal'->>'expires_at')::timestamptz<=clock_timestamp() or fresh->'signal'->>'status' not in('waiting','active') then raise exception 'ACCOUNT_DECISION_NOT_EXECUTABLE';end if;
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

-- A durable authorization inbox. Existing scanner invocations drain it; no new execution schedule.
create table public.account_signal_authorization_jobs(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 signal_id uuid not null,policy_version text not null,state text not null default 'PENDING' check(state in('PENDING','RECORDED')),
 last_error text,decision_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(execution_account_id,signal_id,policy_version)
);
alter table public.account_signal_authorization_jobs enable row level security;
revoke all on public.account_signal_authorization_jobs from public,anon,authenticated;
grant select,insert,update on public.account_signal_authorization_jobs to service_role;
create function public.enqueue_production_account_authorizations() returns integer language plpgsql security definer set search_path=public as $$
declare added integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 insert into account_signal_authorization_jobs(customer_id,execution_account_id,signal_id,policy_version)
 select a.customer_id,a.id,s.id,a.policy_version from connected_execution_accounts a cross join signals s
 where a.enabled and a.execution_enabled and a.runtime_control in('START','RESUME') and a.policy_profile_id is not null and a.policy_version is not null
 and ((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO'))
 and s.source='scanner' and s.signal_identity is not null and s.status in('waiting','active') and s.expires_at>now()
 and ((upper(a.provider) like 'MT5_%' and s.market_type='forex') or (upper(a.provider) in('BINANCE','BYBIT') and s.market_type='crypto'))
 on conflict(execution_account_id,signal_id,policy_version) do nothing;
 get diagnostics added=row_count;return added;
end$$;
revoke all on function public.enqueue_production_account_authorizations() from public,anon,authenticated;
grant execute on function public.enqueue_production_account_authorizations() to service_role;
