-- Mission 1: wall-clock expiry is a CAS transition even when no feed/candle arrives.
create or replace function public.commit_conditional_signal_setup(p_state jsonb,p_expected_version integer,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.conditional_signal_setups; v integer; st text; k text; notify boolean; destinations text[]; sample boolean; v_market text; vip text; mutable text[]:=array['status','version','lastBar','armedAt','fill','bars','partial','netR','result','exit','fillAt','observedAt','confirmationIntelligence','entryDecision','evaluationOutcome'];
begin
 perform pg_advisory_xact_lock(2961029); -- global cap, symbol ownership and transition/outbox share one transaction
 k:=p_state->>'id'; v:=(p_state->>'version')::integer; st:=p_state->>'status';
 v_market:=case when p_state->>'symbol' like '%USDT' then 'crypto' else 'forex' end;
 vip:=case when v_market='crypto' then 'vip_crypto' else 'vip_forex_gold' end;
 if coalesce(p_state->>'market',v_market)<>v_market then raise exception 'SETUP_MARKET_MISMATCH';end if;
 if k is null or length(k)>240 or p_state->>'policy' is distinct from 'conditional-signals/v1' or v is null or p_expected_version is null or p_expected_version<0
  or p_state->>'side' is null or p_state->>'side' not in('buy','sell') or p_message is null or length(p_message)>6000
  or p_state->>'expiresAt' is null or p_state->>'lastBar' is null or p_state->>'trigger' is null or p_state->>'stop' is null or p_state->>'tp1' is null or p_state->>'tp2' is null
  or (p_state->>'track') is null or not ((p_state->>'track'='SCALP' and p_state->>'timeframe' in('5m','15m')) or(p_state->>'track'='INTRADAY' and p_state->>'timeframe' in('15m','1h')) or(p_state->>'track'='SWING' and p_state->>'timeframe' in('15m','1h','4h','1d')))
  or st is null or st not in('WAITING','ARMED','ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'INVALID_CONDITIONAL_STATE';end if;
 if not ((p_state->>'trigger')::numeric>0 and(p_state->>'stop')::numeric>0 and(p_state->>'tp1')::numeric>0 and(p_state->>'tp2')::numeric>0) then raise exception 'INVALID_SETUP_PRICES';end if;
 if not ((p_state->>'side'='buy' and(p_state->>'stop')::numeric<(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric<(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric<=(p_state->>'tp2')::numeric) or(p_state->>'side'='sell' and(p_state->>'stop')::numeric>(p_state->>'trigger')::numeric and(p_state->>'trigger')::numeric>(p_state->>'tp1')::numeric and(p_state->>'tp1')::numeric>=(p_state->>'tp2')::numeric)) then raise exception 'INVALID_SETUP_GEOMETRY';end if;
 if p_state ? 'origin' then
  if p_state#>>'{origin,plan,identity,strategy_id}' is distinct from p_state->>'strategy'
   or p_state#>>'{origin,plan,identity,strategy_version}' is distinct from p_state#>>'{origin,version}'
   or p_state#>>'{origin,plan,market_context,symbol}' is distinct from p_state->>'symbol'
   or p_state#>>'{origin,plan,market_context,timeframe}' is distinct from p_state->>'timeframe'
   or p_state#>'{origin,plan,risk_proposal,initial_stop}' is distinct from p_state->'stop'
   or p_state#>'{origin,plan,risk_proposal,tp1}' is distinct from p_state->'tp1'
   or p_state#>'{origin,plan,risk_proposal,tp2}' is distinct from p_state->'tp2'
   or p_state#>>'{intelligence,priceSource}' is distinct from p_state->>'source'
   or p_state#>>'{origin,plan,provenance,market_data_source}' is distinct from p_state->>'source'
   or p_state#>'{origin,plan,provenance,candle_boundary,closed_only}' is distinct from 'true'::jsonb
   or (case when p_state->>'side'='buy' then p_state#>'{origin,plan,entry_plan,zone,high}' else p_state#>'{origin,plan,entry_plan,zone,low}' end) is distinct from p_state->'trigger'
   or jsonb_typeof(p_state#>'{intelligence,sourceIds}') is distinct from 'array' then raise exception 'ORIGIN_STRATEGY_PLAN_MISMATCH';end if;
  if jsonb_array_length(p_state#>'{intelligence,sourceIds}')=0 then raise exception 'ORIGIN_SOURCE_EVIDENCE_REQUIRED';end if;
 end if;
 select * into old from conditional_signal_setups where id=k for update;
 if found then
  if old.version=v then if old.state=p_state then return true;else raise exception 'CONDITIONAL_CONTENT_CONFLICT';end if;end if;
  if old.version<>p_expected_version or v<>old.version+1 then return false;end if;
  if (old.state-mutable) is distinct from (p_state-mutable) then raise exception 'IMMUTABLE_SETUP_PLAN';end if;
  if p_state ? 'entryDecision' and (p_state#>>'{entryDecision,opportunityId}' is distinct from k or p_state#>>'{entryDecision,strategyVersion}' is distinct from p_state#>>'{origin,version}') then raise exception 'ENTRY_DECISION_IDENTITY_MISMATCH';end if;
  if old.state->>'fill' is not null and (old.state->'fill' is distinct from p_state->'fill' or old.state->'fillAt' is distinct from p_state->'fillAt') then raise exception 'IMMUTABLE_PAPER_ENTRY';end if;
  if old.status in('WAITING','ARMED') and st in('ARMED','ACTIVE') and now()>=(old.state->>'expiresAt')::timestamptz then return false;end if;
  if old.status in('CLOSED','EXPIRED','INVALIDATED','DATA_GAP') then raise exception 'TERMINAL_SETUP';end if;
  if not ((old.status='WAITING' and st in('WAITING','ARMED','EXPIRED','INVALIDATED','DATA_GAP')) or(old.status='ARMED' and st='ARMED' and p_state->>'evaluationOutcome'='DATA_UNAVAILABLE') or(old.status='ARMED' and st in('ACTIVE','CLOSED','EXPIRED','INVALIDATED','DATA_GAP')) or(old.status='ACTIVE' and st in('ACTIVE','CLOSED','DATA_GAP'))) then raise exception 'INVALID_SETUP_TRANSITION';end if;
  if (p_state->>'lastBar')::timestamptz<=(old.state->>'lastBar')::timestamptz then
   -- A freshly observed next-open entry may precede that candle's close. No candle is invented.
   if not coalesce((old.status in('WAITING','ARMED') and st=old.status and p_state->>'evaluationOutcome'='DATA_UNAVAILABLE' and p_state->>'lastBar'=old.state->>'lastBar' and (p_state->>'observedAt')::timestamptz>=coalesce((old.state->>'observedAt')::timestamptz,old.created_at)) or (old.status in('WAITING','ARMED') and st='EXPIRED' and now()>=(old.state->>'expiresAt')::timestamptz and p_state->>'lastBar'=old.state->>'lastBar' and (p_state->>'observedAt')::timestamptz >= (old.state->>'expiresAt')::timestamptz) or(old.status='ARMED' and st in('ACTIVE','INVALIDATED') and p_state->>'lastBar'=old.state->>'lastBar'
    and (p_state->>'observedAt')::timestamptz >= (old.state->>'armedAt')::timestamptz
    and (st='INVALIDATED' or (p_state->>'fillAt'=old.state->>'armedAt' and (p_state->>'fill')::numeric>0))),false) then raise exception 'NONCHRONOLOGICAL_SETUP';end if;
  end if;
  notify:=st<>old.status or coalesce((p_state->>'partial')::boolean,false)<>coalesce((old.state->>'partial')::boolean,false);
  update conditional_signal_setups set state=p_state,status=st,version=v,updated_at=now() where id=k;
 else
  if p_expected_version<>0 or v<>1 or (st<>'WAITING' and not coalesce((st='ACTIVE' and p_state#>>'{entryDecision,kind}'='IMMEDIATE_CONFIRMED' and p_state#>>'{entryDecision,schema}'='entry-decision/v1' and p_state#>'{entryDecision,executionEligible}'='true'::jsonb and p_state#>>'{entryDecision,opportunityId}'=k and p_state#>>'{entryDecision,strategyVersion}'=p_state#>>'{origin,version}' and p_state#>>'{origin,configuration,config_source}' like 'measured_release:%' and p_state#>'{origin,configuration,params,entry_engine_version}'='1'::jsonb and p_state#>'{origin,plan,decision,qualified}'='true'::jsonb and p_state#>'{entryDecision,reasons}'='[]'::jsonb and p_state#>>'{entryDecision,confirmation}'='COMPLETE' and (p_state#>>'{entryDecision,dataClose}')::timestamptz=(p_state->>'sourceClose')::timestamptz and (p_state->>'observedAt')::timestamptz between (p_state->>'sourceClose')::timestamptz and (p_state->>'sourceClose')::timestamptz+interval '90 seconds' and (p_state->>'observedAt')::timestamptz between now()-interval '90 seconds' and now()+interval '5 seconds' and p_state->>'fillAt'=p_state->>'armedAt' and p_state->>'fillAt'=p_state->>'observedAt' and (p_state->>'fill')::numeric>0 and (case when p_state->>'side'='buy' then 1 else -1 end)*((p_state->>'fill')::numeric-(p_state->>'trigger')::numeric)<=coalesce((p_state#>>'{management,maximumChaseR}')::numeric,.25)*abs((p_state->>'trigger')::numeric-(p_state->>'stop')::numeric)),false)) or (p_state->>'expiresAt')::timestamptz<=now() then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and timeframe=p_state->>'timeframe' and (status in('WAITING','ARMED','ACTIVE') or updated_at>now()-case when p_state->>'track'='SCALP' then interval '15 minutes' else interval '4 hours' end)) then return false;end if;
  if exists(select 1 from signals where symbol=p_state->>'symbol' and status in('waiting','active')) then return false;end if;
  if exists(select 1 from conditional_signal_setups where symbol=p_state->>'symbol' and status in('WAITING','ARMED','ACTIVE') and state->>'side'<>p_state->>'side') then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and state->>'track'=p_state->>'track' and status in('WAITING','ARMED','ACTIVE'))>=10 then return false;end if;
  if (select count(*) from conditional_signal_setups where conditional_signal_setups.market=v_market and state->>'track'=p_state->>'track' and created_at>now()-interval '1 hour')>=3 then return false;end if;
  insert into conditional_signal_setups(id,symbol,timeframe,status,version,state) values(k,p_state->>'symbol',p_state->>'timeframe',st,v,p_state);notify:=true;
 end if;
 -- The daily Free sample is selected at admission, before any outcome is known.
 if p_expected_version=0 and (p_state->>'score')::numeric>=80 then
  insert into conditional_free_samples(sample_day,market,setup_id) values((now() at time zone 'Africa/Nairobi')::date,v_market,k) on conflict do nothing;
 end if;
 sample:=exists(select 1 from conditional_free_samples where setup_id=k);
 destinations:=case when st='DATA_GAP' then array['admin'] when sample then array[vip,'free'] else array[vip] end;
 if p_expected_version=0 and st='ACTIVE' and coalesce(public.project_conditional_execution(k)->>'state','BLOCKED')<>'PROJECTED' then raise exception 'IMMEDIATE_SIGNAL_PROJECTION_REJECTED';end if;
 if notify then perform public.enqueue_canonical_lifecycle_event('conditional:'||k||':'||v,'CONDITIONAL_SETUP',1,null,null,null,null,now(),
  jsonb_build_object('market_type',v_market,'policy','conditional-signals/v1','setup_id',k,'setup_version',v,'confirmed_signal_id',case when st='ACTIVE' then public.project_conditional_execution(k)->>'signal_id' else null end,'state',p_state,'free_sample',sample,'message',p_message),destinations);end if;
 return true;
end$$;
revoke all on function public.commit_conditional_signal_setup(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.commit_conditional_signal_setup(jsonb,integer,text) to service_role;




alter table public.watched_strategy_observations drop constraint watched_strategy_observations_decision_check;
alter table public.watched_strategy_observations add constraint watched_strategy_observations_decision_check check(decision in('DISABLED','INELIGIBLE','WATCH','HELD_CONTEXT','NO_SETUP','IMMEDIATE_CONFIRMED','CONDITIONAL_WATCH','NO_TRADE'));
create or replace function public.watched_strategy_coverage() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with grouped as(select strategy_id,max(evidence->>'strategy_version') version,max(checked_at) checked_at,
 count(*) streams,count(*) filter(where decision in('WATCH','CONDITIONAL_WATCH')) watches,
 count(*) filter(where decision='IMMEDIATE_CONFIRMED') immediate,count(*) filter(where decision='HELD_CONTEXT') held,
 count(*) filter(where decision in('NO_SETUP','NO_TRADE')) no_setup,count(*) filter(where decision='DISABLED') disabled,
 max((evidence#>'{configuration,allowed_timeframes}')::text)::jsonb supported_timeframes,array_agg(distinct timeframe order by timeframe) timeframes from watched_strategy_observations where public.is_admin() group by strategy_id)
 select jsonb_build_object('strategies',coalesce(jsonb_agg(to_jsonb(grouped) order by strategy_id),'[]'),'observed_at',now()) from grouped;
$$;

-- Both entry routes share the existing measured-release and signal identity authority.
create or replace function public.project_conditional_execution(p_setup_id text) returns jsonb
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
  or (s->>'sourceClose') is null or (s->>'sourceClose')::timestamptz>entry_at or nullif(s->>'source','') is null or s->>'source'='UNKNOWN' then reason_code:='FRESH_OBSERVED_NEXT_OPEN_REQUIRED';
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
