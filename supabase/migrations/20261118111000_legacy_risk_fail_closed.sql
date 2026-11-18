-- Retained legacy reservations must not relax the canonical Prop risk ceiling.
alter table public.trading_accounts alter column max_daily_drawdown_pct set default 4.0;
update public.trading_accounts set max_daily_drawdown_pct=least(max_daily_drawdown_pct,4.0);
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.fn_evaluate_and_reserve_pretrade_risk(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric)'::regprocedure);
 if position('v_account.floating_equity * 0.015' in definition)=0 or position('v_account.floating_equity * 0.080' in definition)=0 then raise exception 'EXPECTED_LEGACY_RISK_DEFINITION_REQUIRED';end if;
 definition:=replace(definition,'v_account.floating_equity * 0.015','v_account.floating_equity * 0.005');
 definition:=replace(definition,'v_account.floating_equity * 0.080','v_account.floating_equity * 0.010');
 definition:=replace(definition,'daily_starting_equity, max_daily_drawdown_pct, is_halted','daily_starting_equity, max_daily_drawdown_pct, is_halted, provider, last_equity_update');
 definition:=replace(definition,'    -- 1. Non-Blocking Account Row Lock with SKIP LOCKED', $body$
    if auth.role() is distinct from 'service_role' and session_user not in('postgres','supabase_admin') then raise exception 'SERVICE_ROLE_REQUIRED';end if;
    if p_size is null or p_size::text in('NaN','Infinity','-Infinity') or p_size<=0 or p_entry_price is null or p_entry_price::text in('NaN','Infinity','-Infinity') or p_entry_price<=0 or p_stop_loss_price is null or p_stop_loss_price::text in('NaN','Infinity','-Infinity') or p_stop_loss_price<=0 or p_side is null or p_side not in('BUY','SELL') or p_garman_klass_vol is null or p_garman_klass_vol::text in('NaN','Infinity','-Infinity') or p_garman_klass_vol<0 or (p_side='BUY' and p_stop_loss_price>=p_entry_price) or (p_side='SELL' and p_stop_loss_price<=p_entry_price) then raise exception 'INVALID_ORDER_RISK_INPUT';end if;
    -- 1. Non-Blocking Account Row Lock with SKIP LOCKED$body$);
 definition:=replace(definition,'    -- 2. Core Quantitative Math', $body$
    if v_account.provider is distinct from p_provider or v_account.last_equity_update is null or v_account.last_equity_update>clock_timestamp()+interval '5 seconds' or v_account.last_equity_update<clock_timestamp()-interval '60 seconds' or v_account.daily_starting_equity<=0 or v_account.floating_equity<=0 then
      return query select false,'ACCOUNT_EVIDENCE_UNAVAILABLE'::text,0::numeric,0::numeric,0::numeric,0::bigint;return;
    end if;
    if 100*(v_account.daily_starting_equity-v_account.floating_equity)/v_account.daily_starting_equity>=least(v_account.max_daily_drawdown_pct,4.0) then
      update public.trading_accounts set is_halted=true,halt_reason='DAILY_LOSS_LIMIT' where account_id=p_account_id;
      return query select false,'DAILY_LOSS_LIMIT'::text,0::numeric,0::numeric,v_account.floating_equity,0::bigint;return;
    end if;
    -- 2. Core Quantitative Math$body$);
 execute definition;
end $$;
