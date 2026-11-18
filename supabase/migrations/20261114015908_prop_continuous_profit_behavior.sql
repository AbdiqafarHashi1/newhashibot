-- A profit objective is informational by default. Loss, expiry and provider controls remain independent.
-- Never unlock a cutoff that already started closing; it still requires the existing reviewed reset.
alter table public.prop_profit_cycles add column profit_behavior text not null default 'STOP_AT_TARGET' check(profit_behavior in('CONTINUE_TRADING','STOP_AT_TARGET'));
alter table public.prop_profit_cycles alter column profit_behavior set default 'CONTINUE_TRADING';
alter table public.prop_profit_cycles drop constraint prop_profit_cycles_target_pct_check;
alter table public.prop_profit_cycles add constraint prop_profit_cycles_target_pct_check check(target_pct in(2,3,5));
create or replace function public.observe_prop_profit_cutoff() returns trigger language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;c prop_profit_cycles;r account_observed_risk_tracking;item jsonb;ticket text;goal numeric;begin
 if new.currency is distinct from 'USD' or new.terminal_authenticated is distinct from true or new.read_status->>'positions' is distinct from 'true' or new.read_status->>'orders' is distinct from 'true' or new.captured_at>clock_timestamp()+interval '5 seconds' or new.captured_at<clock_timestamp()-interval '60 seconds' then return new;end if;
 for a in select x.* from connected_execution_accounts x join mt5_accounts m on m.id::text=x.provider_account_identity and m.user_id=x.customer_id and m.credential_ref=x.credential_ref and m.bridge_id=new.bridge_id where x.customer_id=new.owner_id and x.provider_account_identity=new.account_id::text and x.provider='MT5_PROP' and x.account_mode='PROP_FUNDED' and upper(x.environment)='DEMO' for update of x loop
  select * into r from account_observed_risk_tracking where execution_account_id=a.id and customer_id=a.customer_id and currency='USD' ;if not found or r.initial_balance>25000 then continue;end if;
  select * into c from prop_profit_cycles where execution_account_id=a.id order by cycle_number desc limit 1 for update;
  if not found then
   if r.continuity_state<>'OBSERVED' then continue;end if;
   if jsonb_array_length(new.positions)>0 or jsonb_array_length(new.orders)>0 then continue;end if;
   goal:=coalesce((a.policy_overrides->'approved_prop_rules'->>'funded_profit_target_pct')::numeric,3);if goal not in(2,3,5) then continue;end if;
   insert into prop_profit_cycles(execution_account_id,customer_id,cycle_number,baseline_balance,target_pct,profit_behavior,payout_wait_days,state,last_observed_at) values(a.id,a.customer_id,1,new.balance,goal,coalesce(a.policy_overrides->'approved_prop_rules'->>'funded_profit_behavior','CONTINUE_TRADING'),coalesce((a.policy_overrides->'approved_prop_rules'->>'payout_wait_days_initial')::integer,14),'ACTIVE',new.captured_at) returning * into c;
  end if;
  if new.captured_at<c.last_observed_at then continue;end if;
  if c.first_trade_at is null and jsonb_array_length(new.positions)>0 then update prop_profit_cycles set first_trade_at=new.captured_at where id=c.id returning * into c;end if;
  -- Only ACTIVE cycles adopt an edited behavior. A started close/payout latch cannot be bypassed.
  if c.state='ACTIVE' then
   update prop_profit_cycles set profit_behavior=coalesce(a.policy_overrides->'approved_prop_rules'->>'funded_profit_behavior','CONTINUE_TRADING') where id=c.id returning * into c;
   if c.profit_behavior='CONTINUE_TRADING' then
    update prop_profit_cycles set last_observed_at=new.captured_at,closed_balance=case when jsonb_array_length(new.positions)=0 and jsonb_array_length(new.orders)=0 then new.balance else closed_balance end where id=c.id;
    continue;
   end if;
  end if;
  if c.state='ACTIVE' and new.equity>=c.baseline_balance*(1+c.target_pct/100) then
   update prop_profit_cycles set state='CLOSING',triggered_at=new.captured_at where id=c.id returning * into c;
  end if;
  if c.state<>'ACTIVE' and c.state<>'RESET' then
   update connected_execution_accounts set runtime_control='PAUSE_NEW_ENTRIES',updated_at=clock_timestamp() where id=a.id and customer_id=a.customer_id;
   -- Invalidate entries still in the cloud; observed late fills are closed on the next snapshot.
   update mt5_commands set status='rejected',error_code='PROP_PROFIT_CUTOFF' where account_id=new.account_id and operation='OPEN_POSITION' and status in('received','accepted');
   if jsonb_array_length(new.positions)>0 or jsonb_array_length(new.orders)>0 then
    update prop_profit_cycles set state='CLOSING' where id=c.id;
    for item in select value from jsonb_array_elements(new.positions) loop
     ticket:=coalesce(item->>'ticket',item->>'position_id');if ticket is null or ticket !~ '^[0-9]+$' then continue;end if;
     insert into mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,expires_at)
      values(new.account_id,new.bridge_id,'CLOSE_POSITION',jsonb_build_object('ticket',ticket,'prop_profit_cycle_id',c.id),format('prop-profit:%s:close:%s',c.id,ticket),'received',jsonb_build_object('authority','PROP_PROFIT_CUTOFF'),clock_timestamp()+interval '2 minutes')
      on conflict(account_id,idempotency_key) do update set status=case when mt5_commands.expires_at<clock_timestamp() then 'received' else mt5_commands.status end,expires_at=case when mt5_commands.expires_at<clock_timestamp() then clock_timestamp()+case when mt5_commands.attempts>=3 then interval '15 minutes' else interval '2 minutes' end else mt5_commands.expires_at end;
    end loop;
    for item in select value from jsonb_array_elements(new.orders) loop
     ticket:=coalesce(item->>'ticket',item->>'order_id');if ticket is null or ticket !~ '^[0-9]+$' then continue;end if;
     insert into mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,expires_at)
      values(new.account_id,new.bridge_id,'CANCEL_ORDER',jsonb_build_object('ticket',ticket,'prop_profit_cycle_id',c.id),format('prop-profit:%s:cancel:%s',c.id,ticket),'received',jsonb_build_object('authority','PROP_PROFIT_CUTOFF'),clock_timestamp()+interval '2 minutes')
      on conflict(account_id,idempotency_key) do update set status=case when mt5_commands.expires_at<clock_timestamp() then 'received' else mt5_commands.status end,expires_at=case when mt5_commands.expires_at<clock_timestamp() then clock_timestamp()+case when mt5_commands.attempts>=3 then interval '15 minutes' else interval '2 minutes' end else mt5_commands.expires_at end;
    end loop;
   else
    update prop_profit_cycles set closed_balance=new.balance,state=case when exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state in('SUBMISSION_UNCERTAIN','RECONCILING','PROTECTION_INCIDENT')) then 'PAYOUT_WAIT' when new.balance<c.baseline_balance*(1+c.target_pct/100) then 'CLOSED_BELOW_TARGET' when c.first_trade_at is not null and new.captured_at>=c.first_trade_at+make_interval(days=>c.payout_wait_days) and new.balance-c.baseline_balance>=20 then 'PAYOUT_READY' else 'PAYOUT_WAIT' end where id=c.id;
   end if;
  end if;
  update prop_profit_cycles set last_observed_at=new.captured_at where id=c.id;
 end loop;return new;
end $$;
create or replace function public.reset_prop_profit_cycle(p_account uuid,p_expected_cycle uuid,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;c prop_profit_cycles;s mt5_account_snapshots;target numeric;result uuid;begin
 if public.is_admin() is distinct from true then raise exception 'ADMIN_REQUIRED';end if;
 if length(trim(coalesce(p_reference,'')))<4 then raise exception 'PAYOUT_OR_CYCLE_REVIEW_REFERENCE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and provider='MT5_PROP' and account_mode='PROP_FUNDED' for update;if not found then raise exception 'FUNDED_PROP_ACCOUNT_REQUIRED';end if;
 select * into c from prop_profit_cycles where execution_account_id=a.id order by cycle_number desc limit 1 for update;if c.id is distinct from p_expected_cycle or c.state not in('PAYOUT_READY','PAYOUT_WAIT','CLOSED_BELOW_TARGET') then raise exception 'CYCLE_REVIEW_REQUIRED';end if;
 select * into s from mt5_account_snapshots where owner_id=a.customer_id and account_id::text=a.provider_account_identity order by captured_at desc limit 1;
 if s.captured_at is null or s.captured_at<clock_timestamp()-interval '60 seconds' or s.currency<>'USD' or s.read_status->>'positions' is distinct from 'true' or s.read_status->>'orders' is distinct from 'true' or jsonb_array_length(s.positions)<>0 or jsonb_array_length(s.orders)<>0 then raise exception 'FRESH_FLAT_ACCOUNT_REQUIRED';end if;
 if exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state in('SUBMISSION_UNCERTAIN','RECONCILING','PROTECTION_INCIDENT')) then raise exception 'PROVIDER_RECONCILIATION_REQUIRED';end if;
 target:=coalesce((a.policy_overrides->'approved_prop_rules'->>'funded_profit_target_pct')::numeric,3);
 update prop_profit_cycles set state='RESET',payout_reference=left(trim(p_reference),200) where id=c.id;
 insert into prop_profit_cycles(execution_account_id,customer_id,cycle_number,baseline_balance,target_pct,profit_behavior,payout_wait_days,state,last_observed_at) values(a.id,a.customer_id,c.cycle_number+1,s.balance,target,coalesce(a.policy_overrides->'approved_prop_rules'->>'funded_profit_behavior','CONTINUE_TRADING'),coalesce((a.policy_overrides->'approved_prop_rules'->>'payout_wait_days_repeat')::integer,14),'ACTIVE',s.captured_at) returning id into result;
 -- Reset does not turn trading on: the existing account Start control remains explicit.
 return result;
end $$;
