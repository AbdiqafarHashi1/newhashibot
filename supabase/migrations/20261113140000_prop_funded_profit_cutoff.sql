-- Funded account goal is a latched account-level close/cancel request, never a withdrawal.
create table public.prop_profit_cycles(
 id uuid primary key default gen_random_uuid(),execution_account_id uuid not null references public.connected_execution_accounts(id),customer_id uuid not null references auth.users(id),
 cycle_number integer not null,baseline_balance numeric not null check(baseline_balance>0),target_pct numeric not null check(target_pct in(2,5)),
 state text not null check(state in('ACTIVE','CLOSING','PAYOUT_WAIT','PAYOUT_READY','CLOSED_BELOW_TARGET','RESET')),
 first_trade_at timestamptz,triggered_at timestamptz,last_observed_at timestamptz,closed_balance numeric,payout_reference text,
 created_at timestamptz not null default clock_timestamp(),unique(execution_account_id,cycle_number)
);
alter table public.prop_profit_cycles enable row level security;
revoke all on public.prop_profit_cycles from public,anon,authenticated;
grant select on public.prop_profit_cycles to authenticated;grant all on public.prop_profit_cycles to service_role;
create policy prop_cycle_owned_read on public.prop_profit_cycles for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create function public.observe_prop_profit_cutoff() returns trigger language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;c prop_profit_cycles;r account_observed_risk_tracking;item jsonb;ticket text;goal numeric;begin
 if new.currency is distinct from 'USD' or new.terminal_authenticated is distinct from true or new.read_status->>'positions' is distinct from 'true' or new.read_status->>'orders' is distinct from 'true' or new.captured_at>clock_timestamp()+interval '5 seconds' or new.captured_at<clock_timestamp()-interval '60 seconds' then return new;end if;
 for a in select x.* from connected_execution_accounts x join mt5_accounts m on m.id::text=x.provider_account_identity and m.user_id=x.customer_id and m.credential_ref=x.credential_ref and m.bridge_id=new.bridge_id where x.customer_id=new.owner_id and x.provider_account_identity=new.account_id::text and x.provider='MT5_PROP' and x.account_mode='PROP_FUNDED' and upper(x.environment)='DEMO' for update of x loop
  select * into r from account_observed_risk_tracking where execution_account_id=a.id and customer_id=a.customer_id and currency='USD' ;if not found or r.initial_balance>25000 then continue;end if;
  select * into c from prop_profit_cycles where execution_account_id=a.id order by cycle_number desc limit 1 for update;
  if not found then
   if r.continuity_state<>'OBSERVED' then continue;end if;
   if jsonb_array_length(new.positions)>0 or jsonb_array_length(new.orders)>0 then continue;end if;
   goal:=coalesce((a.policy_overrides->'approved_prop_rules'->>'funded_profit_target_pct')::numeric,5);if goal not in(2,5) then continue;end if;
   insert into prop_profit_cycles(execution_account_id,customer_id,cycle_number,baseline_balance,target_pct,state,last_observed_at) values(a.id,a.customer_id,1,new.balance,goal,'ACTIVE',new.captured_at) returning * into c;
  end if;
  if new.captured_at<c.last_observed_at then continue;end if;
  if c.first_trade_at is null and jsonb_array_length(new.positions)>0 then update prop_profit_cycles set first_trade_at=new.captured_at where id=c.id returning * into c;end if;
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
    update prop_profit_cycles set closed_balance=new.balance,state=case when exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state in('SUBMISSION_UNCERTAIN','RECONCILING','PROTECTION_INCIDENT')) then 'PAYOUT_WAIT' when new.balance<c.baseline_balance*(1+c.target_pct/100) then 'CLOSED_BELOW_TARGET' when c.first_trade_at is not null and new.captured_at>=c.first_trade_at+interval '14 days' and new.balance-c.baseline_balance>=20 then 'PAYOUT_READY' else 'PAYOUT_WAIT' end where id=c.id;
   end if;
  end if;
  update prop_profit_cycles set last_observed_at=new.captured_at where id=c.id;
 end loop;return new;
end $$;
revoke all on function public.observe_prop_profit_cutoff() from public,anon,authenticated;
create trigger zz_prop_profit_cutoff after insert on public.mt5_account_snapshots for each row execute function public.observe_prop_profit_cutoff();
-- A fresh flat snapshot and explicit admin reference are required to begin another cycle.
create function public.reset_prop_profit_cycle(p_account uuid,p_expected_cycle uuid,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;c prop_profit_cycles;s mt5_account_snapshots;target numeric;result uuid;begin
 if public.is_admin() is distinct from true then raise exception 'ADMIN_REQUIRED';end if;
 if length(trim(coalesce(p_reference,'')))<4 then raise exception 'PAYOUT_OR_CYCLE_REVIEW_REFERENCE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and provider='MT5_PROP' and account_mode='PROP_FUNDED' for update;if not found then raise exception 'FUNDED_PROP_ACCOUNT_REQUIRED';end if;
 select * into c from prop_profit_cycles where execution_account_id=a.id order by cycle_number desc limit 1 for update;if c.id is distinct from p_expected_cycle or c.state not in('PAYOUT_READY','PAYOUT_WAIT','CLOSED_BELOW_TARGET') then raise exception 'CYCLE_REVIEW_REQUIRED';end if;
 select * into s from mt5_account_snapshots where owner_id=a.customer_id and account_id::text=a.provider_account_identity order by captured_at desc limit 1;
 if s.captured_at is null or s.captured_at<clock_timestamp()-interval '60 seconds' or s.currency<>'USD' or s.read_status->>'positions' is distinct from 'true' or s.read_status->>'orders' is distinct from 'true' or jsonb_array_length(s.positions)<>0 or jsonb_array_length(s.orders)<>0 then raise exception 'FRESH_FLAT_ACCOUNT_REQUIRED';end if;
 if exists(select 1 from mt5_account_execution_truth t where t.execution_account_id=a.id and t.lifecycle_state in('SUBMISSION_UNCERTAIN','RECONCILING','PROTECTION_INCIDENT')) then raise exception 'PROVIDER_RECONCILIATION_REQUIRED';end if;
 target:=coalesce((a.policy_overrides->'approved_prop_rules'->>'funded_profit_target_pct')::numeric,5);
 update prop_profit_cycles set state='RESET',payout_reference=left(trim(p_reference),200) where id=c.id;
 insert into prop_profit_cycles(execution_account_id,customer_id,cycle_number,baseline_balance,target_pct,state,last_observed_at) values(a.id,a.customer_id,c.cycle_number+1,s.balance,target,'ACTIVE',s.captured_at) returning id into result;
 -- Reset does not turn trading on: the existing account Start control remains explicit.
 return result;
end $$;
revoke all on function public.reset_prop_profit_cycle(uuid,uuid,text) from public,anon;
grant execute on function public.reset_prop_profit_cycle(uuid,uuid,text) to authenticated;
create function public.authorize_prop_profit_management(p_command uuid,p_owner uuid,p_account uuid,p_bridge text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c mt5_commands;g prop_profit_cycles;a connected_execution_accounts;s mt5_account_snapshots;ticket text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into c from mt5_commands where id=p_command and account_id=p_account and bridge_id=p_bridge and operation in('CLOSE_POSITION','CANCEL_ORDER') and status='accepted' and expires_at>clock_timestamp();if not found then return null;end if;
 select * into g from prop_profit_cycles where id::text=c.payload->>'prop_profit_cycle_id' and customer_id=p_owner and state='CLOSING';if not found then return null;end if;
 select x.* into a from connected_execution_accounts x join mt5_accounts m on m.id=p_account and m.user_id=p_owner and m.bridge_id=p_bridge and m.credential_ref=x.credential_ref where x.id=g.execution_account_id and x.customer_id=p_owner and x.provider_account_identity=p_account::text and x.provider='MT5_PROP' and x.account_mode='PROP_FUNDED' and upper(x.environment)='DEMO' and x.runtime_control='PAUSE_NEW_ENTRIES';if not found then return null;end if;
 select * into s from mt5_account_snapshots where account_id=p_account and owner_id=p_owner and bridge_id=p_bridge and captured_at>clock_timestamp()-interval '60 seconds' and terminal_authenticated=true and read_status->>'positions'='true' and read_status->>'orders'='true' order by captured_at desc limit 1;if not found then return null;end if;
 ticket:=c.payload->>'ticket';if not exists(select 1 from jsonb_array_elements(case when c.operation='CLOSE_POSITION' then s.positions else s.orders end) i where coalesce(i->>'ticket',i->>'position_id',i->>'order_id')=ticket) then return null;end if;
 return jsonb_build_object('authority','PROP_PROFIT_CUTOFF','command_id',c.id,'account_id',p_account,'owner_id',p_owner,'bridge_id',p_bridge,'operation',c.operation,'ticket',ticket,'cycle_id',g.id,'expires_at',c.expires_at);
end $$;
revoke all on function public.authorize_prop_profit_management(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_prop_profit_management(uuid,uuid,uuid,text) to service_role;
