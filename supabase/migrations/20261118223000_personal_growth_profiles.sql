-- Personal sandbox sizing profiles only. No automatic customer-account or Prop policy changes.
begin;
create or replace function public.admin_set_account_controls(p_actor uuid,p_customer uuid,p_account uuid,p_configuration jsonb,p_prop_rules jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a connected_execution_accounts;approved jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if jsonb_typeof(p_configuration)<>'object' or not(p_configuration?'preset') then raise exception 'VALIDATED_POLICY_CONFIGURATION_REQUIRED';end if;
 if (p_configuration-ARRAY['personalRiskProfile','houseMoney','fridayClose','riskPerTradePct','maxOpenRiskPct','maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) is distinct from ((a.policy_overrides->'policy_configuration')-ARRAY['personalRiskProfile','houseMoney','fridayClose','riskPerTradePct','maxOpenRiskPct','maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) then raise exception 'ACCOUNT_ASSIGNMENT_CHANGED_RELOAD_REQUIRED';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD') not in('STANDARD','GROWTH_2','AGGRESSIVE_5') then raise exception 'INVALID_PERSONAL_RISK_PROFILE';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD')<>'STANDARD' and (a.account_mode<>'PERSONAL' or a.environment not in('demo','testnet') or p_configuration->>'houseMoney' is distinct from 'house-money/v1') then raise exception 'PERSONAL_GROWTH_SANDBOX_REQUIRED';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD')<>'STANDARD' and (
  coalesce((p_configuration->>'riskPerTradePct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='GROWTH_2' then 2 else 5 end
  or coalesce((p_configuration->>'maxDailyDrawdownPct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='GROWTH_2' then 8 else 15 end
  or coalesce((p_configuration->>'maxTotalDrawdownPct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='GROWTH_2' then 40 else 60 end
 ) then raise exception 'PERSONAL_GROWTH_BOUNDS_REQUIRED';end if;
 if p_prop_rules is not null then
  if a.provider<>'MT5_PROP' or p_prop_rules->>'schema_version'<>'prop-account-rules/v1' or coalesce(p_prop_rules->>'drawdown_model','') not in('CONSERVATIVE_OBSERVED_HIGH_WATER','FTMO_2STEP_STATIC_INITIAL') or not exists(select 1 from pg_timezone_names where name=p_prop_rules->>'reset_timezone') then raise exception 'VALIDATED_PROP_RULES_REQUIRED';end if;
  if p_prop_rules->>'drawdown_model'='FTMO_2STEP_STATIC_INITIAL' and (
   coalesce(p_prop_rules->>'program_id','')<>'FTMO_TWO_STEP_SWING' or coalesce(p_prop_rules->>'source_reference','')<>'https://ftmo.com/en/trading-objectives/' or coalesce(p_prop_rules->>'reset_timezone','')<>'Europe/Prague'
   or coalesce(p_prop_rules->>'daily_loss_cap_pct','')<>'5' or coalesce(p_prop_rules->>'total_loss_cap_pct','')<>'10'
   or coalesce(p_prop_rules->>'min_trading_days','')<>case when a.account_mode='PROP_FUNDED' then '0' else '4' end
   or (p_prop_rules->>'news_trading_allowed') is distinct from 'true' or (p_prop_rules->>'weekend_holding_allowed') is distinct from 'true'
  ) then raise exception 'STATIC_PROP_PROGRAM_TERMS_REQUIRED';end if;
  approved:=p_prop_rules||jsonb_build_object('customer_id',p_customer,'execution_account_id',p_account,'policy_version',a.policy_version,'approved_by',p_actor,'approved_at',clock_timestamp());
 end if;
 update connected_execution_accounts set policy_overrides=policy_overrides||jsonb_build_object('policy_configuration',p_configuration)||case when approved is null then '{}'::jsonb else jsonb_build_object('approved_prop_rules',approved) end,execution_enabled=false,phase_h_certification_status='REQUIRED',updated_at=clock_timestamp() where id=a.id;
 -- Existing protection/monitor flags are deliberately preserved; only new entry authority is revoked.
 insert into phase_h_audit_events(customer_id,execution_account_id,actor_id,event_type,safe_metadata) values(p_customer,p_account,p_actor,'ADMIN_ACCOUNT_CONTROLS_CHANGED',jsonb_build_object('configuration',p_configuration,'prop_rules_approved',approved is not null));
 return jsonb_build_object('execution_account_id',a.id,'new_entries_enabled',false,'certification','REQUIRED');
end$$;
revoke all on function public.admin_set_account_controls(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_set_account_controls(uuid,uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.persist_house_money_decision(p_customer uuid,p_account uuid,p_observed timestamptz,p_decision jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare a connected_execution_accounts;ceiling numeric:=2.25;profile text;applied numeric;base numeric;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_SCOPE_REQUIRED';end if;
 if p_observed>clock_timestamp() or p_observed<clock_timestamp()-interval '60 seconds' then raise exception 'FRESH_ACCOUNT_EVIDENCE_REQUIRED';end if;
 ceiling:=case when a.account_mode='PERSONAL' then 2.25 else 1 end;
 profile:=coalesce(a.policy_overrides#>>'{policy_configuration,personalRiskProfile}','STANDARD');
 if profile not in('STANDARD','GROWTH_2','AGGRESSIVE_5') then raise exception 'INVALID_PERSONAL_RISK_PROFILE';end if;
 if profile<>'STANDARD' then
  if a.account_mode<>'PERSONAL' or a.environment not in('demo','testnet') then raise exception 'PERSONAL_GROWTH_SANDBOX_REQUIRED';end if;
  ceiling:=case when profile='GROWTH_2' then 2 else 5 end;
 end if;
 applied:=(p_decision->>'applied_risk_pct')::numeric;base:=(p_decision->>'base_risk_pct')::numeric;
 if applied is null or base is null or not(applied between 0 and ceiling) or not(base between 0 and ceiling) or applied>base then raise exception 'RISK_CEILING_REQUIRED';end if;
 update account_risk_state set equity_phase=p_decision->>'equity_phase',base_risk_pct=base,applied_risk_pct=applied,block_reason=p_decision->>'block_reason',updated_at=clock_timestamp() where execution_account_id=p_account and customer_id=p_customer and observed_at=p_observed;
 if not found then raise exception 'CURRENT_ACCOUNT_OBSERVATION_REQUIRED';end if;
end $$;
revoke all on function public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) to service_role;
-- Preserve growth entry locks over observations using the same daily reset and durable peak history.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.observe_house_money_account(uuid,uuid,timestamptz)'::regprocedure);
 if position('''PERSONAL_PEAK_DRAWDOWN_HALT'',''CHALLENGE_TOTAL_HALT''' in definition)=0 or position('''DAILY_CIRCUIT_4_PERCENT'',''CHALLENGE_DAILY_HALT''' in definition)=0 then raise exception 'HOUSE_MONEY_LOCK_PATCH_TARGET_REQUIRED';end if;
 definition:=replace(definition,'''PERSONAL_PEAK_DRAWDOWN_HALT'',''CHALLENGE_TOTAL_HALT''','''PERSONAL_PEAK_DRAWDOWN_HALT'',''PERSONAL_GROWTH_PEAK_HALT'',''CHALLENGE_TOTAL_HALT''');
 definition:=replace(definition,'''DAILY_CIRCUIT_4_PERCENT'',''CHALLENGE_DAILY_HALT''','''DAILY_CIRCUIT_4_PERCENT'',''PERSONAL_GROWTH_DAILY_HALT'',''CHALLENGE_DAILY_HALT''');
 execute definition;
end $$;

-- Keep the 16 historical releases as evidence; enable only the 13-engine union needed by current products.
create function public.activate_growth_product_engines(p_actor uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 perform public.activate_sixteen_cost_positive(p_actor);
 update strategy_configs set enabled=false where strategy_name in('crypto.launch-rsi2-48-3-3-h72','crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006','gold.frontier-compression-15-24-1.5-5-h96');
 return jsonb_build_object('state','INSTALLED','deployment','personal-signal-growth/20261118','scanner_configurations',13,'vip_configurations',8);
end $$;
revoke all on function public.activate_growth_product_engines(uuid) from public,anon,authenticated;
grant execute on function public.activate_growth_product_engines(uuid) to service_role;
-- Existing exact broad defaults are narrowed; custom per-account selections and all Prop accounts stay intact.
-- This updates strategy permissions only: risk selection remains an explicit Admin action.
do $$declare actor uuid;prior_role text;a record;old_ids jsonb;new_ids jsonb;old_crypto jsonb:='["crypto.launch-trend-pullback-48-1.5-5","crypto.launch-trend-pullback-48-2-3-h72","crypto.launch-rsi2-48-3-3-h72","crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006","crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006","crypto.complementary-ema-pullback"]';old_forex jsonb:='["gold.native-momentum-15-48-2-5","gold.native-momentum-60-24-2-5","gold.native-band-reentry-15-48-3-5","forex.native-band-reentry-60-12-2-5","forex.native-sweep-retest-60-16-2-5-usdjpy-h72","forex.native-squeeze-15-48-2-3-usdjpy-h12","forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008","gold.frontier-compression-15-24-1.5-5-h96","gold.rsi-trailing-15-48-1.5-5-h96","forex.complementary-ema-pullback"]';begin
 select id into actor from profiles where role='admin' order by id limit 1;
 if actor is not null then
  prior_role:=current_setting('request.jwt.claim.role',true);perform set_config('request.jwt.claim.role','service_role',true);
  perform activate_growth_product_engines(actor);
  for a in select * from connected_execution_accounts where account_mode='PERSONAL' and environment in('demo','testnet') loop
   old_ids:=a.policy_overrides#>'{policy_configuration,allowedStrategies}';
   if jsonb_typeof(old_ids)='array' and ((old_ids @> old_crypto and old_crypto @> old_ids) or (old_ids @> old_forex and old_forex @> old_ids)) then
    new_ids:=case when upper(a.provider) like 'MT5%' then '["gold.native-momentum-15-48-2-5","gold.native-band-reentry-15-48-3-5","forex.native-squeeze-15-48-2-3-usdjpy-h12","gold.rsi-trailing-15-48-1.5-5-h96"]'::jsonb else '["crypto.launch-trend-pullback-48-1.5-5"]'::jsonb end;
    perform admin_set_account_strategies(actor,a.customer_id,a.id,old_ids,new_ids);
   end if;
  end loop;
  perform set_config('request.jwt.claim.role',coalesce(prior_role,''),true);
 end if;
end $$;
commit;
