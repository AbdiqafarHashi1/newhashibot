-- Trailing runtime state is mutable; the original entry plan and initial R stay frozen.
create function public.assert_conditional_trailing_transition(p_old jsonb,p_next jsonb) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare old_state jsonb:=p_old->'trailingState';next_state jsonb:=p_next->'trailingState';side integer;distance numeric;stop numeric;best numeric;begin
 if next_state is null then if old_state is not null then raise exception 'TRAILING_STATE_CANNOT_BE_REMOVED';end if;return;end if;
 if p_next->>'strategy' is distinct from 'gold.rsi-trailing-15-48-1.5-5-h96' or p_next#>'{origin,plan,management_intent,trailing_policy}' is distinct from '{"version":"gold-atr-trailing/v1","strategyId":"gold.rsi-trailing-15-48-1.5-5-h96","timeframe":"15m","atrPeriod":14,"triggerR":2,"distanceAtr":1,"minimumLockedR":0.5,"maximumHoldingSeconds":86400}'::jsonb then raise exception 'FROZEN_ATR_TRAILING_POLICY_REQUIRED';end if;
 if jsonb_typeof(next_state->'initialDistance') is distinct from 'number' or jsonb_typeof(next_state->'stop') is distinct from 'number' or jsonb_typeof(next_state->'bestFavorable') is distinct from 'number' or jsonb_typeof(p_next->'fill') is distinct from 'number' then raise exception 'TRAILING_STATE_NUMBERS_REQUIRED';end if;
 side:=case when p_next->>'side'='buy' then 1 else -1 end;distance:=(next_state->>'initialDistance')::numeric;stop:=(next_state->>'stop')::numeric;best:=(next_state->>'bestFavorable')::numeric;
 if distance<=0 or stop<=0 or best<0 or abs(distance-abs((p_next->>'fill')::numeric-(p_next->>'stop')::numeric))>0.0000001 or side*(stop-coalesce((old_state->>'stop')::numeric,(p_next->>'stop')::numeric))< -0.00000001 or best<coalesce((old_state->>'bestFavorable')::numeric,0) or old_state is not null and distance is distinct from (old_state->>'initialDistance')::numeric then raise exception 'TRAILING_STATE_CANNOT_LOOSEN_OR_REBASE';end if;
end $$;
revoke all on function public.assert_conditional_trailing_transition(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.assert_conditional_trailing_transition(jsonb,jsonb) to service_role;
-- Extend the current guarded functions, preserving all admission/projection/outbox checks.
do $$declare definition text;signature text;begin
 for signature in select unnest(array['public.commit_conditional_signal_setup(jsonb,integer,text)','public.checkpoint_historical_replay(uuid,uuid,jsonb)']) loop
  if to_regprocedure(signature) is null then continue;end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  if position('mutable text[]:=array[' in definition)=0 then raise exception 'EXPECTED_CONDITIONAL_GUARD_DEFINITION_REQUIRED';end if;
  definition:=replace(definition,'mutable text[]:=array[','mutable text[]:=array[''trailingState'',');
  if signature like '%commit_conditional%' then
   definition:=replace(definition,'if (old.state-mutable) is distinct from (p_state-mutable)', 'perform assert_conditional_trailing_transition(old.state,p_state); if (old.state-mutable) is distinct from (p_state-mutable)');
   definition:=replace(definition,'notify:=st<>old.status or','notify:=(p_state#>''{trailingState,stop}'') is distinct from (old.state#>''{trailingState,stop}'') or st<>old.status or');
  else
   definition:=replace(definition,'if (old_state-mutable) is distinct from ((r->''state'')-mutable)', 'perform assert_conditional_trailing_transition(old_state,r->''state''); if (old_state-mutable) is distinct from ((r->''state'')-mutable)');
  end if;
  execute definition;
 end loop;
end $$;
