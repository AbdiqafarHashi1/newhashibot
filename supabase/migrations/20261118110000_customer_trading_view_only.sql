-- Trading configuration is Admin-managed. Reports, checkout and customer consent remain available.
create function public.require_trading_configuration_admin() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.is_admin(),false) and (auth.role() in('anon','authenticated') or (auth.role() is distinct from 'service_role' and session_user not in('postgres','supabase_admin'))) then
  raise exception 'CUSTOMER_TRADING_VIEW_ONLY' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.require_trading_configuration_admin() from public,anon,authenticated;
-- The trigger also protects browser-accessible security-definer RPCs, not just direct table writes.
do $$declare relation text;begin
 foreach relation in array array['customer_bot_setups','connected_execution_accounts','account_brain_assignments','provider_connections','hashibridge_pairing_codes','mt5_accounts','mt5_commands','phase_n_operations_commands','trading_accounts','account_asset_allocations','order_reservations'] loop
  if to_regclass('public.'||relation) is not null then
   execute format('create trigger customer_trading_admin_guard before insert or update or delete on public.%I for each row execute function public.require_trading_configuration_admin()',relation);
  end if;
 end loop;
end $$;
-- Legacy nullable-owner accounts must never become shared customer risk records.
drop policy if exists policy_trading_accounts_isolation on public.trading_accounts;
drop policy if exists policy_order_reservations_isolation on public.order_reservations;
drop policy if exists policy_account_asset_allocations_isolation on public.account_asset_allocations;
create policy trading_accounts_scoped_read on public.trading_accounts for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy order_reservations_scoped_read on public.order_reservations for select to authenticated using(exists(select 1 from public.trading_accounts a where a.account_id=order_reservations.account_id and (a.user_id=auth.uid() or public.is_admin())));
create policy asset_allocations_scoped_read on public.account_asset_allocations for select to authenticated using(exists(select 1 from public.trading_accounts a where a.account_id=account_asset_allocations.account_id and (a.user_id=auth.uid() or public.is_admin())));
revoke insert,update,delete on public.trading_accounts,public.account_asset_allocations,public.order_reservations from anon,authenticated;
revoke all on function public.fn_evaluate_and_reserve_pretrade_risk(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.fn_evaluate_and_reserve_pretrade_risk(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric) to service_role;
