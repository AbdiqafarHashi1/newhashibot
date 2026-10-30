-- Pending plans cannot authorize or dispatch new entries. Existing protection and closes remain available.
create function public.assert_confirmed_account_entry(p_customer uuid,p_account uuid,p_signal uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from signals s join signal_updates u on u.signal_id=s.id
 where s.id=p_signal and s.source='scanner' and s.status='active' and s.expires_at>clock_timestamp()
 and u.new_status='active' and u.reason in('entry_trigger','candle_entry_trigger','conditional_close_confirmed')
 and u.price>0 and u.price::text not in('NaN','Infinity','-Infinity')
 and u.created_at>=s.created_at and u.created_at<=clock_timestamp() and u.created_at<s.expires_at) then raise exception 'PERSISTED_ENTRY_CONFIRMATION_REQUIRED';end if;
 if not exists(select 1 from execution_entitlement_bindings b join phase_h_entitlements e on e.id=b.entitlement_id and e.customer_id=b.customer_id
 where b.customer_id=p_customer and b.execution_account_id=p_account and b.state='ACTIVE'
 and e.execution_account_id=p_account and e.state='ACTIVE' and e.source<>'NOT_CONFIGURED' and e.valid_until>clock_timestamp()) then raise exception 'FINITE_ACTIVE_EXECUTION_ACCESS_REQUIRED';end if;
end$$;
revoke all on function public.assert_confirmed_account_entry(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_confirmed_account_entry(uuid,uuid,uuid) to service_role;
create function public.guard_confirmed_account_decision() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.decision in('ALLOW','REDUCE') then perform assert_confirmed_account_entry(new.customer_id,new.execution_account_id,new.signal_id);end if;return new;end$$;
revoke all on function public.guard_confirmed_account_decision() from public,anon,authenticated;
create trigger confirmed_account_decision before insert or update on public.execution_account_policy_decisions for each row execute function public.guard_confirmed_account_decision();
create function public.guard_confirmed_crypto_submission() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 perform assert_confirmed_account_entry(new.customer_id,new.execution_account_id,new.signal_id);return new;end$$;
revoke all on function public.guard_confirmed_crypto_submission() from public,anon,authenticated;
create trigger confirmed_crypto_submission before insert on public.crypto_account_execution_truth for each row execute function public.guard_confirmed_crypto_submission();
create function public.guard_confirmed_mt5_submission() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.operation='OPEN_POSITION' and new.payload ? 'phase_d_decision_id' then
  perform assert_confirmed_account_entry(d.customer_id,d.execution_account_id,d.signal_id) from execution_account_policy_decisions d where d.id=new.payload->>'phase_d_decision_id';
  if not found then raise exception 'PHASE_D_DECISION_NOT_EXECUTABLE';end if;
 end if;return new;end$$;
revoke all on function public.guard_confirmed_mt5_submission() from public,anon,authenticated;
create trigger confirmed_mt5_submission before insert on public.mt5_commands for each row execute function public.guard_confirmed_mt5_submission();

-- Each newly verified execution payment grants at most 30 days from its activation.
-- Never create a payment, extend a provider period, or grant access from this trigger.
create function public.bound_execution_access_period() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if new.product_code in('FOUNDING_AUTO_EXECUTION','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION') and new.state='ACTIVE' then
  if tg_op='INSERT' then new.valid_until:=least(coalesce(new.valid_until,clock_timestamp()+interval '30 days'),clock_timestamp()+interval '30 days');
  elsif new.source_payment_id is distinct from old.source_payment_id or old.state is distinct from 'ACTIVE' then
   new.valid_until:=least(coalesce(new.valid_until,clock_timestamp()+interval '30 days'),clock_timestamp()+interval '30 days');
  elsif new.valid_until is null then raise exception 'FINITE_EXECUTION_ACCESS_REQUIRED';end if;
 end if;return new;end$$;
revoke all on function public.bound_execution_access_period() from public,anon,authenticated;
create trigger bound_execution_access_period before insert or update on public.phase_h_entitlements for each row execute function public.bound_execution_access_period();

-- First-month business targets are separate from the longer-term 1,000-member funnel.
create function public.first_month_launch_overview() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with paid as(select e.customer_id,e.product_code from phase_h_entitlements e join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id
 where e.state='ACTIVE' and e.source like 'VERIFIED\_%' escape '\' and e.revoked_at is null and e.valid_from<=now() and e.valid_until>now() and p.state='SUCCEEDED')
 select jsonb_build_object('observed_at',statement_timestamp(),'signal_target',50,'execution_target',30,
 'paid_signals',(select count(distinct customer_id) from paid where product_code='VIP_SIGNALS'),
 'paid_execution',(select count(distinct customer_id) from paid where product_code in('FOUNDING_AUTO_EXECUTION','AUTO_EXECUTION','FOUNDING_PROP_EXECUTION')),
 'scope','Distinct currently paying customers; owner allowances and unverified payments excluded. First-month targets, not a forecast.');
$$;
revoke all on function public.first_month_launch_overview() from public,anon,authenticated;
grant execute on function public.first_month_launch_overview() to service_role;
