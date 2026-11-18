-- Canonical account evidence can authorize signals and DEMO forward testing without
-- pretending it is a legacy three-stage replay or a live-profit certification.
alter table public.strategy_release_candidates
 add column release_kind text not null default 'HISTORICAL' check(release_kind in('HISTORICAL','FORWARD_DEMO')),
 add column canonical_evidence jsonb;
alter table public.strategy_release_candidates alter column development_run_id drop not null,alter column validation_run_id drop not null;
alter table public.strategy_release_candidates add constraint historical_release_still_requires_runs check(release_kind='FORWARD_DEMO' or (development_run_id is not null and validation_run_id is not null));

create function public.install_canonical_demo_strategy_bundle(p_actor uuid,p_bundle jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare item jsonb;cfg jsonb;definition jsonb;review jsonb;period jsonb;previous_end timestamptz;last_end timestamptz;config_hash text;release_id uuid;installed jsonb:='[]';product text;entries jsonb;qualified jsonb;version text;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 if p_bundle->>'schema' is distinct from 'canonical-demo-bundle/v1' or jsonb_typeof(p_bundle->'strategies') is distinct from 'array' or jsonb_array_length(p_bundle->'strategies') not between 1 and 30 or length(p_bundle::text)>2000000 then raise exception 'BOUNDED_CANONICAL_BUNDLE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext('MEASURED_STRATEGY_PROMOTION'));
 for item in select value from jsonb_array_elements(p_bundle->'strategies') loop
  cfg:=item->'configuration';review:=item->'review';definition:=cfg->'strategies'->0;
  if cfg->>'minSignalGrade' is distinct from 'A' or jsonb_array_length(cfg->'strategies')<>1 or definition->>'id' is distinct from item->>'strategyId' or definition->>'enabled' is distinct from 'true' or definition#>>'{parameters,entry_engine_version}' is distinct from '1' or jsonb_array_length(definition->'symbols')=0 or jsonb_array_length(definition->'timeframes')=0 then raise exception 'EXACT_CANONICAL_CONFIGURATION_REQUIRED';end if;
  if review->>'schema' is distinct from 'canonical-account-review/v1' or review->>'strategyId' is distinct from item->>'strategyId' or jsonb_typeof(review->'periods') is distinct from 'array' or jsonb_array_length(review->'periods')<2 then raise exception 'CANONICAL_ACCOUNT_REVIEW_REQUIRED';end if;
  previous_end:=null;last_end:=null;
  for period in select value from jsonb_array_elements(review->'periods') loop
   if coalesce(period->>'reportSha256','')!~'^[0-9a-f]{64}$' or coalesce(period->>'engineSourceSha256','')!~'^[0-9a-f]{64}$' or period->>'status' is distinct from 'COMPLETED' or jsonb_array_length(period->'strategyIds')<>1 or period->'strategyIds'->>0 is distinct from item->>'strategyId' then raise exception 'MATCHING_COMPLETED_CANONICAL_EVIDENCE_REQUIRED';end if;
   if (period->>'end')::timestamptz<=(period->>'start')::timestamptz or previous_end is not null and (period->>'start')::timestamptz<previous_end then raise exception 'ORDERED_SEPARATE_PERIODS_REQUIRED';end if;
   if jsonb_typeof(period#>'{metrics,closedTrades}') is distinct from 'number' or jsonb_typeof(period#>'{metrics,profitFactor}') is distinct from 'number' or jsonb_typeof(period#>'{metrics,netReturnPct}') is distinct from 'number' or jsonb_typeof(period#>'{metrics,costs}') is distinct from 'number' then raise exception 'FINITE_NUMERIC_ACCOUNT_METRICS_REQUIRED';end if;
   if coalesce((period#>>'{metrics,closedTrades}')::integer,0)<10 or coalesce((period#>>'{metrics,profitFactor}')::numeric,0)<=1 or coalesce((period#>>'{metrics,netReturnPct}')::numeric,0)<=0 or coalesce((period#>>'{metrics,costs}')::numeric,0)<=0 or period#>>'{metrics,accountFailed}' is distinct from 'false' then raise exception 'POSITIVE_COSTED_ACCOUNT_PERIOD_REQUIRED';end if;
   previous_end:=(period->>'end')::timestamptz;last_end:=previous_end;
  end loop;
  config_hash:=encode(sha256(convert_to(cfg::text,'UTF8')),'hex');
  select id into release_id from strategy_release_candidates where strategy_id=item->>'strategyId' and state='PROMOTED' and release_kind='FORWARD_DEMO' and configuration_hash=config_hash and canonical_evidence=review limit 1;
  if release_id is null then
   update strategy_release_candidates set state='RETIRED' where strategy_id=item->>'strategyId' and state='PROMOTED';
   insert into strategy_release_candidates(strategy_id,created_by,configuration_hash,immutable_configuration,validation_end,state,promoted_at,release_kind,canonical_evidence) values(item->>'strategyId',p_actor,config_hash,cfg,last_end,'PROMOTED',clock_timestamp(),'FORWARD_DEMO',review) returning id into release_id;
  end if;
  insert into strategy_configs(strategy_name,enabled,market_type,allowed_symbols,allowed_timeframes,min_score,min_rr,params) values(item->>'strategyName',true,case when item->>'strategyId' like 'crypto.%' then 'crypto' else 'forex' end,definition->'symbols',definition->'timeframes',(definition->>'minScore')::numeric,(definition->>'minRiskReward')::numeric,definition->'parameters')
  on conflict(strategy_name) do update set enabled=true,allowed_symbols=excluded.allowed_symbols,allowed_timeframes=excluded.allowed_timeframes,min_score=excluded.min_score,min_rr=excluded.min_rr,params=excluded.params,updated_at=clock_timestamp();
  installed:=installed||jsonb_build_array(jsonb_build_object('strategyId',item->>'strategyId','releaseId',release_id,'scope','SIGNALS_AND_DEMO'));
 end loop;
 -- These sets are forward candidates. Live authorization separately rejects their release kind.
 foreach product in array array['CRYPTO_PERSONAL','CRYPTO_PROP','FOREX_PERSONAL','FOREX_PROP'] loop
  select coalesce(jsonb_agg(jsonb_build_object('strategyId',r.strategy_id,'strategyVersion',s->>'version','configId',r.id::text,'configVersion',r.configuration_hash,'qualificationStatus','FORWARD_VALIDATION_CANDIDATE','supportedSymbols',s->'symbols','supportedTimeframes',s->'timeframes','strategyParameters',s->'parameters') order by r.strategy_id),'[]'::jsonb) into entries
  from strategy_release_candidates r cross join lateral jsonb_array_elements(r.immutable_configuration->'strategies') s where r.state='PROMOTED' and r.release_kind='FORWARD_DEMO' and s->>'id'=r.strategy_id and (case when product like 'CRYPTO_%' then r.strategy_id like 'crypto.%' else r.strategy_id like 'forex.%' or r.strategy_id like 'gold.%' end);
  if jsonb_array_length(entries)>0 then
   version:=encode(sha256(convert_to(entries::text,'UTF8')),'hex');qualified:=jsonb_build_object('version','qualified-strategy-set/v1','id',product||'_QUALIFIED_SET','setVersion',version,'product',case when product like '%_PROP' then 'PROP' else 'PERSONAL' end,'researchPolicyVersion','canonical-account-demo/v1','entries',entries);
   if not exists(select 1 from backtest_runs where mode_slug='qualification_campaign' and status='completed' and result_summary->'qualifiedSet'=qualified) then insert into backtest_runs(mode_slug,strategy_name,status,dataset_name,result_summary) values('qualification_campaign','Canonical demo strategy review','completed','Hashed native canonical account reports',jsonb_build_object('scope','SIGNALS_AND_DEMO','qualificationBasis','CANONICAL_FORWARD_REVIEW','qualifiedSet',qualified));end if;
  end if;
 end loop;
 insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'CANONICAL_DEMO_STRATEGIES_INSTALLED',jsonb_build_object('installed',installed,'scope','SIGNALS_AND_DEMO'));
 return jsonb_build_object('state','INSTALLED','strategies',installed,'scope','SIGNALS_AND_DEMO','accountsStarted',false);
end$$;
revoke all on function public.install_canonical_demo_strategy_bundle(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.install_canonical_demo_strategy_bundle(uuid,jsonb) to service_role;

create or replace function public.assert_measured_execution_lineage(p_evidence jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare r jsonb:=p_evidence->'measured_release';sp jsonb:=p_evidence->'strategy_plan';sig jsonb:=p_evidence->'signal';frozen jsonb;begin
 if r->>'release_kind'='FORWARD_DEMO' and coalesce(upper(p_evidence#>>'{account,environment}'),'') not in('DEMO','TESTNET') then raise exception 'DEMO_RELEASE_CANNOT_AUTHORIZE_LIVE';end if;
 if r->>'state' is distinct from 'PROMOTED' or r->>'strategy_id' is distinct from sig->>'strategy_id' or r->>'id' is null or sp->'provenance'->>'measured_release_id' is distinct from r->>'id' then raise exception 'CURRENT_MEASURED_EXECUTION_RELEASE_REQUIRED';end if;
 select x into frozen from jsonb_array_elements(r->'immutable_configuration'->'strategies') x where x->>'id'=sig->>'strategy_id' and x->>'enabled'='true' limit 1;
 if frozen is null or not coalesce(frozen->'symbols' ? (sig->>'symbol'),false) or not coalesce(frozen->'timeframes' ? (sig->>'timeframe'),false) then raise exception 'MEASURED_RELEASE_SCOPE_MISMATCH';end if;
 if jsonb_typeof(sp->'provenance'->'evaluated_parameters') is distinct from 'object' or jsonb_typeof(frozen->'parameters') is distinct from 'object' or sp->'provenance'->'evaluated_parameters' is distinct from frozen->'parameters' then raise exception 'EVALUATED_STRATEGY_PARAMETERS_MISMATCH';end if;
 if not exists(select 1 from jsonb_array_elements(p_evidence->'qualified_set'->'entries') e where e->>'strategyId'=sig->>'strategy_id' and e->>'strategyVersion'=sig->>'strategy_version' and e->'supportedSymbols' ? (sig->>'symbol') and e->'supportedTimeframes' ? (sig->>'timeframe') and e->'strategyParameters'=sp->'provenance'->'evaluated_parameters') then raise exception 'QUALIFIED_STRATEGY_PARAMETERS_MISMATCH';end if;
end$$;
