-- Materialize only freshly observed conditional entries into the existing account execution authority.
create table public.conditional_execution_links(
 setup_id text primary key references public.conditional_signal_setups(id),
 signal_id uuid unique references public.signals(id),state text not null check(state in('BLOCKED','PROJECTED')),
 reason text not null,setup_version integer not null,origin_plan jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.conditional_execution_links enable row level security;
revoke all on public.conditional_execution_links from public,anon,authenticated;
grant select on public.conditional_execution_links to authenticated;
grant select,insert,update on public.conditional_execution_links to service_role;
create policy conditional_execution_admin on public.conditional_execution_links for select to authenticated using(public.is_admin());
create function public.project_conditional_execution(p_setup_id text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare row_state conditional_signal_setups;s jsonb;origin jsonb;plan jsonb;release jsonb;frozen jsonb;prior conditional_execution_links;
 reason_code text;entry_at timestamptz;observed timestamptz;deadline timestamptz;fill numeric;stop numeric;t1 numeric;t2 numeric;candidate uuid;run uuid;sig uuid;fingerprint text;side text;terminal text;
begin
 select * into row_state from conditional_signal_setups where id=p_setup_id for update;
 if not found then raise exception 'RECORDED_CONDITIONAL_SETUP_REQUIRED';end if;
 s:=row_state.state;
 select * into prior from conditional_execution_links where setup_id=p_setup_id;
 if prior.signal_id is not null then
  if s->>'status' not in('WAITING','ARMED','ACTIVE') then
   terminal:=case when s->>'status'='CLOSED' and s->>'result'='TP2' then 'tp2_hit' when s->>'status'='CLOSED' and s->>'result' in('STOP','STOP_FIRST_AMBIGUOUS_BAR') then 'sl_hit' else 'expired' end;
   update signals set status=terminal,updated_at=clock_timestamp() where id=prior.signal_id and status='active';
  end if;
  return jsonb_build_object('state','PROJECTED','signal_id',prior.signal_id,'idempotent',true);
 end if;
 if s->>'status'<>'ACTIVE' then return jsonb_build_object('state','NOT_ENTERED');end if;
 origin:=s->'origin';plan:=origin->'plan';
 entry_at:=(s->>'fillAt')::timestamptz;observed:=(s->>'observedAt')::timestamptz;fill:=(s->>'fill')::numeric;stop:=(s->>'stop')::numeric;t1:=(s->>'tp1')::numeric;t2:=(s->>'tp2')::numeric;
 if origin is null or origin='null'::jsonb then reason_code:='ANALYSIS_ONLY_NO_EXECUTION_ORIGIN';
 elsif plan->>'schema_version' is distinct from 'strategy-plan/v1' or plan->'decision'->>'qualified' is distinct from 'true'
  or plan->'identity'->>'strategy_id' is distinct from s->>'strategy' or plan->'identity'->>'strategy_version' is distinct from origin->>'version'
  or plan->'market_context'->>'symbol' is distinct from s->>'symbol' or plan->'market_context'->>'timeframe' is distinct from s->>'timeframe'
  or plan->'decision'->>'action' is distinct from upper(s->>'side') or coalesce(plan->'diagnostics'->>'grade','') not in('A','A+')
  or (plan->'risk_proposal'->>'initial_stop')::numeric is distinct from stop or (plan->'risk_proposal'->>'tp1')::numeric is distinct from t1 or (plan->'risk_proposal'->>'tp2')::numeric is distinct from t2 then reason_code:='ORIGINAL_STRATEGY_PLAN_MISMATCH';
 elsif entry_at is null or observed is null or entry_at is distinct from (s->>'armedAt')::timestamptz
  or observed<entry_at or observed>clock_timestamp() or observed>entry_at+interval '90 seconds' or clock_timestamp()>entry_at+interval '90 seconds'
  or (s->>'sourceClose') is null or (s->>'sourceClose')::timestamptz>=entry_at or nullif(s->>'source','') is null or s->>'source'='UNKNOWN' then reason_code:='FRESH_OBSERVED_NEXT_OPEN_REQUIRED';
 elsif fill is null or fill<=0 or fill::text in('NaN','Infinity','-Infinity') or not coalesce(((s->>'side'='buy' and stop<fill and fill<t1 and t1<=t2)or(s->>'side'='sell' and stop>fill and fill>t1 and t1>=t2)),false) then reason_code:='CONDITIONAL_ENTRY_GEOMETRY_INVALID';
 else
  select to_jsonb(r) into release from strategy_release_candidates r where r.id::text=plan->'provenance'->>'measured_release_id' and r.strategy_id=s->>'strategy' and r.state='PROMOTED';
  select x into frozen from jsonb_array_elements(release->'immutable_configuration'->'strategies') x where x->>'id'=s->>'strategy' and x->>'enabled'='true';
  if release is null or frozen is null or not coalesce(frozen->'symbols' ? (s->>'symbol'),false) or not coalesce(frozen->'timeframes' ? (s->>'timeframe'),false)
   or jsonb_typeof(frozen->'parameters') is distinct from 'object' or plan->'provenance'->'evaluated_parameters' is distinct from frozen->'parameters'
   or origin->'configuration'->'params' is distinct from frozen->'parameters' then reason_code:='CURRENT_MEASURED_EXECUTION_RELEASE_REQUIRED';end if;
 end if;
 deadline:=least((s->>'expiresAt')::timestamptz,entry_at+interval '90 seconds');
 if reason_code is null and (deadline is null or deadline<=clock_timestamp()) then reason_code:='CONDITIONAL_EXECUTION_WINDOW_EXPIRED';end if;
 if reason_code is not null then
  insert into conditional_execution_links(setup_id,state,reason,setup_version,origin_plan) values(p_setup_id,'BLOCKED',reason_code,row_state.version,plan)
   on conflict(setup_id) do update set reason=excluded.reason,setup_version=excluded.setup_version,updated_at=clock_timestamp();
  return jsonb_build_object('state','BLOCKED','reason',reason_code);
 end if;
 fingerprint:=encode(sha256(convert_to(p_setup_id,'UTF8')),'hex');side:=s->>'side';
 -- The original plan is retained separately; this derived execution contract records the future confirmation.
 plan:=jsonb_set(plan,'{provenance,evaluation_id}',to_jsonb('conditional:'||fingerprint));
 plan:=jsonb_set(plan,'{entry_plan,zone}',jsonb_build_object('low',fill,'high',fill));
 plan:=jsonb_set(plan,'{entry_plan,expires_at}',to_jsonb(deadline));
 plan:=jsonb_set(plan,'{evidence,strategy_specific,conditional_entry}',jsonb_build_object('setup_id',p_setup_id,'setup_version',row_state.version,'confirmed_at',s->>'armedAt','observed_at',s->>'observedAt','entry_at',entry_at,'source',s->>'source','paper_reference',fill,'track',s->>'track'));
 insert into scanner_runs(status,finished_at,symbols_scanned,candidates_found,signals_created) values('success',clock_timestamp(),1,1,1) returning id into run;
 insert into strategy_candidates(scanner_run_id,symbol,market_type,timeframe,strategy_name,direction,entry_low,entry_high,stop_loss,tp1,tp2,confidence_score,grade,reason,status)
 values(run,s->>'symbol',s->>'market',s->>'timeframe',s->>'strategy',side,fill,fill,stop,t1,t2,least(100,greatest(0,round((s->>'score')::numeric)))::integer,plan->'diagnostics'->>'grade',s->>'reason','converted_to_signal') returning id into candidate;
 insert into certified_strategy_plans(evaluation_id,candidate_id,scanner_run_id,arbitration_decision_key,strategy_id,strategy_version,canonical_side,symbol,market,strategy_plan)
 values('conditional:'||fingerprint,candidate,run,'conditional:'||fingerprint,s->>'strategy',origin->>'version',upper(side),s->>'symbol',plan->'identity'->>'asset_class',plan);
 select committed.signal_id into sig from public.commit_scanner_signal_decision(
  'conditional:'||fingerprint,run,'conditional:'||p_setup_id,'SIGNAL',array['OBSERVED_CONDITIONAL_NEXT_OPEN'],
  jsonb_build_object('conditional_setup_id',p_setup_id,'conditional_version',row_state.version,'track',s->>'track','publication_owner','CONDITIONAL_WATCH','selection','conditional_admission'),
  jsonb_build_object('candidate_id',candidate,'symbol',s->>'symbol','market_type',s->>'market','timeframe',s->>'timeframe','direction',side,'entry_type','zone',
   'entry_low',fill,'entry_high',fill,'stop_loss',stop,'tp1',t1,'tp2',t2,'risk_reward',abs(t2-fill)/abs(fill-stop),'strategy_name',s->>'strategy','grade',plan->'diagnostics'->>'grade',
   'confidence_score',least(100,greatest(0,round((s->>'score')::numeric)))::integer,'reason',s->>'reason','data_source',s->>'source','created_at',entry_at,'expires_at',deadline,
   'signal_identity','conditional:'||fingerprint,'contract_version','scanner-signal/v2','strategy_id',s->>'strategy','strategy_version',origin->>'version',
   'configuration_version',plan->'provenance'->>'config_hash','candle_close_time',s->>'sourceClose','immutable_hash',encode(sha256(convert_to((s||jsonb_build_object('execution_plan',plan))::text,'UTF8')),'hex'),
   'arbitrator_decision',jsonb_build_object('conditional_setup_id',p_setup_id,'track',s->>'track','publication_owner','CONDITIONAL_WATCH')),false) committed;
 if sig is null then raise exception 'CONDITIONAL_CANONICAL_COMMIT_FAILED';end if;
 update signals set status='active',mode_slug='conditional_execution' where id=sig;
 insert into signal_updates(signal_id,update_type,old_status,new_status,message,price,reason,created_at)
 values(sig,'conditional_entry_confirmed','waiting','active','Observed next-open entry after the stored conditional close; provider/account checks still required.',fill,'conditional_close_confirmed',observed);
 insert into conditional_execution_links(setup_id,signal_id,state,reason,setup_version,origin_plan) values(p_setup_id,sig,'PROJECTED','AWAITING_ACCOUNT_AUTHORIZATION',row_state.version,origin->'plan')
 on conflict(setup_id) do update set signal_id=excluded.signal_id,state=excluded.state,reason=excluded.reason,setup_version=excluded.setup_version,origin_plan=excluded.origin_plan,updated_at=clock_timestamp();
 return jsonb_build_object('state','PROJECTED','signal_id',sig);
end$$;
revoke all on function public.project_conditional_execution(text) from public,anon,authenticated;
grant execute on function public.project_conditional_execution(text) to service_role;
create function public.sync_conditional_execution() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 perform public.project_conditional_execution(new.id);return new;end$$;
revoke all on function public.sync_conditional_execution() from public,anon,authenticated;
create trigger conditional_execution_projection after insert or update of state on public.conditional_signal_setups for each row execute function public.sync_conditional_execution();

-- Queue executable signals only; discovery watches never occupy authorization slots.
create or replace function public.enqueue_production_account_authorizations() returns integer language plpgsql security definer set search_path=public as $$
declare added integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 insert into account_signal_authorization_jobs(customer_id,execution_account_id,signal_id,policy_version)
 select a.customer_id,a.id,s.id,a.policy_version from connected_execution_accounts a cross join signals s
 where a.enabled and a.execution_enabled and a.runtime_control in('START','RESUME') and a.policy_profile_id is not null and a.policy_version is not null
 and ((upper(a.provider)='BINANCE' and upper(a.environment)='TESTNET') or (upper(a.provider) in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO'))
 and s.source='scanner' and s.signal_identity is not null and s.status='active' and s.expires_at>now()
 and ((upper(a.provider) like 'MT5_%' and s.market_type='forex') or (upper(a.provider) in('BINANCE','BYBIT') and s.market_type='crypto'))
 on conflict(execution_account_id,signal_id,policy_version) do nothing;
 get diagnostics added=row_count;return added;
end$$;
revoke all on function public.enqueue_production_account_authorizations() from public,anon,authenticated;
grant execute on function public.enqueue_production_account_authorizations() to service_role;