-- Retain strict fallback caps for unmapped legacy accounts; mapped accounts use fresh canonical risk state.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.fn_evaluate_and_reserve_pretrade_risk(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric)'::regprocedure);
 definition:=replace(definition,'v_account.floating_equity * 0.005', 'v_account.floating_equity * coalesce((select applied_risk_pct/100 from public.account_risk_state where execution_account_id=p_account_id),0.005)');
 definition:=replace(definition,'v_account.floating_equity * 0.010', 'v_account.floating_equity * coalesce((select applied_risk_pct/100 from public.account_risk_state where execution_account_id=p_account_id),0.010)');
 definition:=replace(definition,'    -- 2. Core Quantitative Math', $body$
    if exists(select 1 from public.account_risk_state where execution_account_id=p_account_id) and not exists(select 1 from public.account_risk_state where execution_account_id=p_account_id and observed_at>=clock_timestamp()-interval '60 seconds' and observed_at<=clock_timestamp() and block_reason is null and applied_risk_pct>0) then
      return query select false,'CANONICAL_RISK_STATE_BLOCKED_OR_STALE'::text,0::numeric,0::numeric,v_account.floating_equity,0::bigint;return;
    end if;
    -- 2. Core Quantitative Math$body$);
 execute definition;
end $$;
