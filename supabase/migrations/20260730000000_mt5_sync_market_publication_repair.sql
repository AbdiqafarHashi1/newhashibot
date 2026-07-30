-- Authenticated operators may read MT5 publication/certification truth for accounts
-- they own; admins retain the existing cross-owner operational view.
create policy mt5_market_data_latest_read on public.mt5_market_data_latest
for select to authenticated using (
  exists (select 1 from public.mt5_accounts a where a.id=account_id and (a.user_id=auth.uid() or public.is_admin()))
);
create policy mt5_market_candles_read on public.mt5_market_candles
for select to authenticated using (
  exists (select 1 from public.mt5_accounts a where a.id=account_id and (a.user_id=auth.uid() or public.is_admin()))
);
create policy mt5_certification_results_read on public.mt5_certification_results
for select to authenticated using (
  exists (select 1 from public.mt5_accounts a where a.id=account_id and (a.user_id=auth.uid() or public.is_admin()))
);

grant select on public.mt5_market_data_latest, public.mt5_market_candles, public.mt5_certification_results to authenticated;
