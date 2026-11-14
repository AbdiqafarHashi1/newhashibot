-- Only source-bound FTMO 2-Step Swing accounts may select the static firm basis.
-- Actual observed highs, continuity, policy percentages and account entry renewal stay intact.
create or replace function public.admin_set_account_controls(p_actor uuid,p_customer uuid,p_account uuid,p_configuration jsonb,p_prop_rules jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a connected_execution_accounts;approved jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_OWNERSHIP_REQUIRED';end if;
 if jsonb_typeof(p_configuration)<>'object' or not(p_configuration?'preset') then raise exception 'VALIDATED_POLICY_CONFIGURATION_REQUIRED';end if;
 if (p_configuration-ARRAY['maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) is distinct from ((a.policy_overrides->'policy_configuration')-ARRAY['maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols']) then raise exception 'ACCOUNT_ASSIGNMENT_CHANGED_RELOAD_REQUIRED';end if;
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
