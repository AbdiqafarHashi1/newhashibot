create table public.account_risk_state(
 execution_account_id uuid primary key references public.connected_execution_accounts(id),customer_id uuid not null,
 observed_at timestamptz not null,month_key text not null,day_key text not null,month_open_balance numeric not null,
 peak_equity numeric not null,monthly_pnl_pct numeric not null,daily_pnl_pct numeric not null,peak_drawdown_pct numeric not null,total_drawdown_pct numeric not null,
 equity_phase text not null default 'PENDING',base_risk_pct numeric not null default 0,applied_risk_pct numeric not null default 0,block_reason text,
 updated_at timestamptz not null default now()
);
alter table public.account_risk_state enable row level security;
revoke all on public.account_risk_state from public,anon,authenticated;
grant select on public.account_risk_state to authenticated;grant all on public.account_risk_state to service_role;
create policy account_risk_state_owner_read on public.account_risk_state for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create function public.observe_house_money_account(p_customer uuid,p_account uuid,p_observed timestamptz) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;e account_policy_evidence;s account_risk_state;c jsonb;balance numeric;equity numeric;net numeric;opening numeric;peak numeric;initial numeric;daily_base numeric;losses int:=0;v_month text;v_day text;v_currency text;v_reason text;phase int;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;if not found then raise exception 'ACCOUNT_SCOPE_REQUIRED';end if;
 select * into e from account_policy_evidence where execution_account_id=p_account and customer_id=p_customer and observed_at=p_observed order by id desc limit 1;
 if not found or p_observed>clock_timestamp() or p_observed<clock_timestamp()-interval '60 seconds' then raise exception 'FRESH_ACCOUNT_EVIDENCE_REQUIRED';end if;
 c:=e.account_context;balance:=(c->>'balance')::numeric;equity:=(c->>'equity')::numeric;initial:=(c#>>'{total_drawdown,initial_balance}')::numeric;daily_base:=(c#>>'{daily_drawdown,starting_balance}')::numeric;
 if balance is null or equity is null or initial is null or daily_base is null or balance<=0 or equity<=0 or initial<=0 or daily_base<=0 or balance::text in('NaN','Infinity','-Infinity') or equity::text in('NaN','Infinity','-Infinity') then raise exception 'FINITE_ACCOUNT_CAPITAL_REQUIRED';end if;
 v_month:=to_char(p_observed at time zone 'UTC','YYYY-MM');v_day:=to_char(p_observed at time zone coalesce(nullif(c#>>'{prop_rules,reset_timezone}',''),'UTC'),'YYYY-MM-DD');
 v_currency:=coalesce(e.contract_specification->>'account_currency',e.contract_specification->>'quote_currency');
 if v_currency is null or exists(select 1 from account_closed_provider_outcomes where execution_account_id=p_account and customer_id=p_customer and currency<>v_currency) then raise exception 'ACCOUNT_HISTORY_CURRENCY_REQUIRED';end if;
 -- Missing closed outcomes must not turn a losing account into a profitable one.
 if exists(select 1 from (select id from crypto_account_execution_truth where execution_account_id=p_account and customer_id=p_customer and lifecycle_state='CLOSED' union all select id from mt5_account_execution_truth where execution_account_id=p_account and customer_id=p_customer and lifecycle_state in('CLOSED','TP2_CLOSED')) t where not exists(select 1 from account_closed_provider_outcomes o where o.execution_account_id=p_account and o.customer_id=p_customer and o.execution_truth_id=t.id)) then raise exception 'COMPLETE_CLOSED_OUTCOMES_REQUIRED';end if;
 select coalesce(sum(net_pnl),0) into net from account_closed_provider_outcomes where execution_account_id=p_account and customer_id=p_customer and closed_at>=date_trunc('month',p_observed at time zone 'UTC') at time zone 'UTC' and closed_at<=p_observed;
 select * into s from account_risk_state where execution_account_id=p_account and customer_id=p_customer for update;
 if found and p_observed<s.observed_at then raise exception 'ACCOUNT_OBSERVATION_REGRESSED';end if;
 opening:=balance-net;
 if s.month_key=v_month and coalesce((c#>>'{exposure,active_position_count}')::integer,0)=0 and abs(opening-s.month_open_balance)>greatest(.01,abs(s.month_open_balance)*.000001) then raise exception 'CAPITAL_FLOW_BASELINE_RECONCILIATION_REQUIRED';end if;
 if s.month_key=v_month then opening:=s.month_open_balance;end if;
 if opening<=0 then raise exception 'MONTH_OPEN_BALANCE_REQUIRED';end if;
 peak:=greatest(equity,coalesce(s.peak_equity,equity),(c#>>'{total_drawdown,high_water_mark}')::numeric);
 -- Ties use conservative trailing losses: a positive at the same timestamp never erases its losses.
 select count(*) into losses from account_closed_provider_outcomes o where o.execution_account_id=p_account and o.customer_id=p_customer and o.closed_at<=p_observed and o.net_pnl<0 and o.closed_at>=coalesce((select max(closed_at) from account_closed_provider_outcomes where execution_account_id=p_account and customer_id=p_customer and net_pnl>0 and closed_at<=p_observed),'-infinity'::timestamptz);
 v_reason:=case when s.block_reason in('PERSONAL_PEAK_DRAWDOWN_HALT','CHALLENGE_TOTAL_HALT','CHALLENGE_PHASE_TARGET_LOCK') then s.block_reason when s.block_reason='FUNDED_MONTHLY_TARGET_LOCK' and s.month_key=v_month then s.block_reason when s.block_reason in('DAILY_CIRCUIT_4_PERCENT','CHALLENGE_DAILY_HALT','FUNDED_DAILY_HALT') and s.day_key=v_day then s.block_reason else null end;
 phase:=case when a.policy_overrides#>>'{prop_setup,phase}'='VERIFICATION' then 2 else 1 end;
 insert into account_risk_state(execution_account_id,customer_id,observed_at,month_key,day_key,month_open_balance,peak_equity,monthly_pnl_pct,daily_pnl_pct,peak_drawdown_pct,total_drawdown_pct,block_reason)
 values(p_account,p_customer,p_observed,v_month,v_day,opening,peak,net/opening*100,(equity-daily_base)/daily_base*100,greatest(0,(peak-equity)/peak*100),greatest(0,(initial-equity)/initial*100),v_reason)
 on conflict(execution_account_id) do update set observed_at=excluded.observed_at,month_key=excluded.month_key,day_key=excluded.day_key,month_open_balance=excluded.month_open_balance,peak_equity=excluded.peak_equity,monthly_pnl_pct=excluded.monthly_pnl_pct,daily_pnl_pct=excluded.daily_pnl_pct,peak_drawdown_pct=excluded.peak_drawdown_pct,total_drawdown_pct=excluded.total_drawdown_pct,block_reason=excluded.block_reason,updated_at=clock_timestamp();
 return jsonb_build_object('customerId',p_customer,'accountId',p_account,'observedAt',p_observed,'monthlyPnlPct',net/opening*100,'dailyPnlPct',(equity-daily_base)/daily_base*100,'peakDrawdownPct',greatest(0,(peak-equity)/peak*100),'totalDrawdownPct',greatest(0,(initial-equity)/initial*100),'consecutiveLosses',losses,'phase',phase,'latchedReason',v_reason);
end $$;
create function public.persist_house_money_decision(p_customer uuid,p_account uuid,p_observed timestamptz,p_decision jsonb) returns void language plpgsql security invoker set search_path=public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if (p_decision->>'applied_risk_pct')::numeric not between 0 and 2.25 then raise exception 'RISK_CEILING_REQUIRED';end if;
 update account_risk_state set equity_phase=p_decision->>'equity_phase',base_risk_pct=(p_decision->>'base_risk_pct')::numeric,applied_risk_pct=(p_decision->>'applied_risk_pct')::numeric,block_reason=p_decision->>'block_reason',updated_at=clock_timestamp() where execution_account_id=p_account and customer_id=p_customer and observed_at=p_observed;
 if not found then raise exception 'CURRENT_ACCOUNT_OBSERVATION_REQUIRED';end if;
end $$;
revoke all on function public.observe_house_money_account(uuid,uuid,timestamptz),public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.observe_house_money_account(uuid,uuid,timestamptz),public.persist_house_money_decision(uuid,uuid,timestamptz,jsonb) to service_role;
-- Opt in existing account policies without granting a provider credential or starting an account.
update connected_execution_accounts set policy_overrides=jsonb_set(coalesce(policy_overrides,'{}'),'{policy_configuration}',coalesce(policy_overrides->'policy_configuration','{}')||'{"houseMoney":"house-money/v1"}'::jsonb);

-- New Brain assignments retain the server-owned dynamic policy too.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb)'::regprocedure);
 definition:=replace(definition,'''allowedStrategies'',strategy_ids)', '''allowedStrategies'',strategy_ids,''houseMoney'',''house-money/v1'')');
 execute definition;
end $$;
