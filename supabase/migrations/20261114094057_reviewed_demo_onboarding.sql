-- New sandbox accounts receive reviewed exact configurations, not retired scanner defaults.
-- Existing assignments and explicit administrator selections are preserved.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.assign_customer_account_brain(uuid,uuid,numeric,text[],text,jsonb)'::regprocedure);
 if position('strategy_ids:=array[]::text[];' in definition)=0 or position('crypto.micro-scalper' in definition)=0 or position('forex.micro-scalper' in definition)=0 then raise exception 'EXPECTED_ACCOUNT_ASSIGNMENT_DEFINITION_REQUIRED';end if;
 definition:=replace(definition,'permitted:=array[''FOREX_TREND''];maxrisk:=.5;','permitted:=array[''FOREX_TREND'',''GOLD_BREAKOUT''];maxrisk:=.5;');
 definition:=replace(definition,'strategy_ids:=strategy_ids||array[''crypto.micro-scalper'',''crypto.quick-scalp'',''crypto.compression-breakout'',''crypto.swing-continuation''];','strategy_ids:=strategy_ids||case when a.environment in(''demo'',''testnet'') then array[''crypto.launch-trend-pullback-48-1.5-5''] else array[''crypto.micro-scalper'',''crypto.quick-scalp'',''crypto.compression-breakout'',''crypto.swing-continuation''] end;');
 definition:=replace(definition,'strategy_ids:=strategy_ids||array[''forex.micro-scalper'',''forex.swing-continuation'',''forex.london-breakout'',''forex.new-york-continuation'',''forex.trend-pullback''];','strategy_ids:=strategy_ids||case when a.environment in(''demo'',''testnet'') then array[''forex.native-squeeze-15-48-2-3-usdjpy-h12''] else array[''forex.micro-scalper'',''forex.swing-continuation'',''forex.london-breakout'',''forex.new-york-continuation'',''forex.trend-pullback''] end;');
 definition:=replace(definition,'strategy_ids:=strategy_ids||array[''gold.volatility-breakout''];','strategy_ids:=strategy_ids||case when a.environment in(''demo'',''testnet'') then array[''gold.rsi-trailing-15-48-1.5-5-h96''] else array[''gold.volatility-breakout''] end;');
 definition:=replace(definition,'content:=jsonb_build_object(''policy'',p_policy,','if jsonb_typeof(a.policy_overrides->''admin_selected_strategies'')=''array'' and jsonb_array_length(a.policy_overrides->''admin_selected_strategies'')>0 then select array_agg(s) into strategy_ids from jsonb_array_elements_text(a.policy_overrides->''admin_selected_strategies'') s;end if; content:=jsonb_build_object(''policy'',p_policy,');
 execute definition;
end $$;
