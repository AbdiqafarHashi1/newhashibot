begin;
-- Smart Growth eligibility comes from trusted, account-scoped provider observations and reconciled outcomes.
create function public.observe_personal_forward_history(p_customer uuid,p_account uuid,p_now timestamptz) returns jsonb language plpgsql security invoker set search_path=public as $$
declare a connected_execution_accounts;days integer;closed_count integer;fresh timestamptz;first_provider timestamptz;first_close timestamptz;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_now>clock_timestamp()+interval '5 seconds' or p_now<clock_timestamp()-interval '60 seconds' then raise exception 'CURRENT_HISTORY_TIME_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer;
 if not found or a.account_mode<>'PERSONAL' or upper(a.environment) not in('DEMO','TESTNET','LIVE') then raise exception 'PERSONAL_HISTORY_SCOPE_REQUIRED';end if;
 select min(observed_at),max(observed_at) into first_provider,fresh from account_policy_evidence where customer_id=p_customer and execution_account_id=p_account and upper(provider)=upper(a.provider) and upper(account_context->>'environment')=upper(a.environment) and observed_at<=p_now and nullif(source_reference,'') is not null;
 if first_provider is null or first_provider>p_now-interval '30 days' or fresh is null then raise exception 'SMART_GROWTH_30_VERIFIED_DAYS_REQUIRED';end if;
 if exists(select 1 from (select id from crypto_account_execution_truth where customer_id=p_customer and execution_account_id=p_account and lifecycle_state='CLOSED' union all select id from mt5_account_execution_truth where customer_id=p_customer and execution_account_id=p_account and lifecycle_state in('CLOSED','TP2_CLOSED')) t where not exists(select 1 from account_closed_provider_outcomes o where o.customer_id=p_customer and o.execution_account_id=p_account and o.execution_truth_id=t.id and o.provider=upper(a.provider) and cardinality(o.source_ids)>0 and o.closed_at<=p_now)) then raise exception 'COMPLETE_CLOSED_OUTCOMES_REQUIRED';end if;
 select count(*),min(closed_at) into closed_count,first_close from account_closed_provider_outcomes o where customer_id=p_customer and execution_account_id=p_account and provider=upper(a.provider) and cardinality(source_ids)>0 and closed_at<=p_now and source=case when upper(a.provider)='BINANCE' then 'BINANCE_USER_TRADES_AND_INCOME' when upper(a.provider)='BYBIT' then 'BYBIT_CLOSED_PNL' else 'MT5_DEALS' end
 and exists(select 1 from (select id from crypto_account_execution_truth where customer_id=p_customer and execution_account_id=p_account and lifecycle_state='CLOSED' union all select id from mt5_account_execution_truth where customer_id=p_customer and execution_account_id=p_account and lifecycle_state in('CLOSED','TP2_CLOSED')) t where t.id=o.execution_truth_id);
 if closed_count<1 then raise exception 'VERIFIED_CLOSED_FORWARD_TRADES_REQUIRED';end if;
 days:=floor(extract(epoch from (p_now-greatest(first_provider,first_close)))/86400);
 if days<30 then raise exception 'SMART_GROWTH_30_VERIFIED_DAYS_REQUIRED';end if;
 return jsonb_build_object('customerId',p_customer,'accountId',p_account,'provider',upper(a.provider),'observedAt',p_now,'latestProviderObservedAt',fresh,'verifiedDays',days,'closedTradeCount',closed_count,'historyComplete',true);
end $$;
revoke all on function public.observe_personal_forward_history(uuid,uuid,timestamptz) from public,anon,authenticated;grant execute on function public.observe_personal_forward_history(uuid,uuid,timestamptz) to service_role;
create or replace function public.admin_set_account_controls(p_actor uuid,p_customer uuid,p_account uuid,p_configuration jsonb,p_prop_rules jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a connected_execution_accounts;approved jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if jsonb_typeof(p_configuration)<>'object' or not(p_configuration?'preset') then raise exception 'VALIDATED_POLICY_CONFIGURATION_REQUIRED';end if;
 if (p_configuration-ARRAY['concurrentCryptoGuard','personalRiskProfile','houseMoney','fridayClose','riskPerTradePct','maxOpenRiskPct','maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) is distinct from ((a.policy_overrides->'policy_configuration')-ARRAY['concurrentCryptoGuard','personalRiskProfile','houseMoney','fridayClose','riskPerTradePct','maxOpenRiskPct','maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) then raise exception 'ACCOUNT_ASSIGNMENT_CHANGED_RELOAD_REQUIRED';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD') not in('STANDARD','SMART_GROWTH','GROWTH_2','GROWTH_2PCT','AGGRESSIVE_5','AGGRESSIVE_5PCT') then raise exception 'INVALID_PERSONAL_RISK_PROFILE';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD')<>'STANDARD' and (a.account_mode<>'PERSONAL' or (a.environment not in('demo','testnet') and not (coalesce(p_configuration->>'personalRiskProfile','STANDARD')='SMART_GROWTH' and a.environment='live')) or p_configuration->>'houseMoney' is distinct from 'house-money/v1') then raise exception 'PERSONAL_GROWTH_SANDBOX_REQUIRED';end if;
 if coalesce(p_configuration->>'personalRiskProfile','STANDARD')<>'STANDARD' and (
  coalesce((p_configuration->>'riskPerTradePct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='SMART_GROWTH' then 1.5 when p_configuration->>'personalRiskProfile' in('GROWTH_2','GROWTH_2PCT') then 2 else 5 end
  or coalesce((p_configuration->>'maxDailyDrawdownPct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='SMART_GROWTH' then 6 when p_configuration->>'personalRiskProfile' in('GROWTH_2','GROWTH_2PCT') then 8 else 15 end
  or coalesce((p_configuration->>'maxTotalDrawdownPct')::numeric,0) not between .01 and case when p_configuration->>'personalRiskProfile'='SMART_GROWTH' then 14 when p_configuration->>'personalRiskProfile' in('GROWTH_2','GROWTH_2PCT') then 40 else 60 end
 ) then raise exception 'PERSONAL_GROWTH_BOUNDS_REQUIRED';end if;
 if p_configuration->>'personalRiskProfile'='SMART_GROWTH' then
  perform public.observe_personal_forward_history(p_customer,p_account,clock_timestamp());
  if p_configuration->>'concurrentCryptoGuard' is distinct from 'true' or (p_configuration->>'maxOpenRiskPct')::numeric>7 or (p_configuration->>'maxCorrelatedRiskPct')::numeric>4.5 then raise exception 'SMART_GROWTH_GUARD_AND_LIMITS_REQUIRED';end if;
 end if;
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
 if profile not in('STANDARD','SMART_GROWTH','GROWTH_2','GROWTH_2PCT','AGGRESSIVE_5','AGGRESSIVE_5PCT') then raise exception 'INVALID_PERSONAL_RISK_PROFILE';end if;
 if profile<>'STANDARD' then
  if a.account_mode<>'PERSONAL' or (a.environment not in('demo','testnet') and not (profile='SMART_GROWTH' and a.environment='live')) then raise exception 'PERSONAL_GROWTH_SANDBOX_REQUIRED';end if;
  ceiling:=case when profile='SMART_GROWTH' then 1.5 when profile in('GROWTH_2','GROWTH_2PCT') then 2 else 5 end;
 end if;
 if profile='SMART_GROWTH' then perform public.observe_personal_forward_history(p_customer,p_account,clock_timestamp());end if;
 applied:=(p_decision->>'applied_risk_pct')::numeric;base:=(p_decision->>'base_risk_pct')::numeric;
 if applied is null or base is null or not(applied between 0 and ceiling) or not(base between 0 and ceiling) or applied>base then raise exception 'RISK_CEILING_REQUIRED';end if;
 update account_risk_state set equity_phase=p_decision->>'equity_phase',base_risk_pct=base,applied_risk_pct=applied,block_reason=p_decision->>'block_reason',updated_at=clock_timestamp() where execution_account_id=p_account and customer_id=p_customer and observed_at=p_observed;
 if not found then raise exception 'CURRENT_ACCOUNT_OBSERVATION_REQUIRED';end if;
end $$;
revoke all on function public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) to service_role;

-- New Personal accounts always begin with Standard. An upgrade is a separate Admin action.
create function public.default_personal_standard_profile() returns trigger language plpgsql set search_path=public as $$begin
 if new.account_mode='PERSONAL' then new.policy_overrides:=coalesce(new.policy_overrides,'{}')||jsonb_build_object('policy_configuration',coalesce(new.policy_overrides->'policy_configuration','{}')||'{"personalRiskProfile":"STANDARD","houseMoney":"house-money/v1","riskPerTradePct":1,"concurrentCryptoGuard":false}'::jsonb);end if;return new;
end $$;
create trigger personal_standard_profile_default before insert on public.connected_execution_accounts for each row execute function public.default_personal_standard_profile();

commit;
