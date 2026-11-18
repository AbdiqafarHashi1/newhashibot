-- A fully observed native time-stop exit must not disappear between replay and release.
-- Preserve the existing minimum sample, positive-edge and immutable-run requirements.
create or replace function public.assert_measured_strategy_run(p_run uuid,p_strategy text,p_hash text) returns void
language plpgsql security invoker set search_path=public as $$
declare r validation_runs;n integer;unresolved integer;profit numeric;loss numeric;begin
 select * into r from validation_runs where id=p_run;
 if not found or r.mode<>'REPLAY' or r.status<>'COMPLETED' or r.configuration_hash is distinct from p_hash or r.failure_code is not null or r.cancellation_requested_at is not null then raise exception 'COMPLETED_MATCHING_SCANNER_REPLAY_REQUIRED';end if;
 if r.provenance->>'start' is null or r.provenance->>'end' is null then raise exception 'RECORDED_REPLAY_RANGE_REQUIRED';end if;
 if coalesce((r.outcome_assumptions->>'feeBps')::numeric,0)+coalesce((r.outcome_assumptions->>'spreadBps')::numeric,0)+coalesce((r.outcome_assumptions->>'slippageBps')::numeric,0)<=0 then raise exception 'DECLARED_NONZERO_COSTS_REQUIRED';end if;
 select count(*),count(*) filter(where net_r is null or net_r::text in('NaN','Infinity','-Infinity') or not (
   status in('STOP','TARGET') or status='TIMEOUT' and strategy_id ~ '^(crypto|forex)\.complementary-' and coalesce((r.outcome_assumptions->>'closeAtHorizon')::boolean,false) and exit_time is not null and entry_time is not null and entry_price is not null and exit_price is not null and entry_price::text not in('NaN','Infinity','-Infinity') and exit_price::text not in('NaN','Infinity','-Infinity') and exit_time>=entry_time and entry_price>0 and exit_price>0
 )),coalesce(sum(greatest(net_r,0)),0),-coalesce(sum(least(net_r,0)),0)
 into n,unresolved,profit,loss from validation_outcomes where run_id=p_run and strategy_id=p_strategy;
 if n<30 then raise exception 'AT_LEAST_30_TRADES_PER_PERIOD_REQUIRED';end if;
 if unresolved>0 then raise exception 'UNRESOLVED_OUTCOMES_REQUIRE_REVIEW';end if;
 if loss<=0 or profit/loss<1.2 or profit-loss<=0 then raise exception 'POSITIVE_NET_EDGE_AND_PROFIT_FACTOR_1_2_REQUIRED';end if;
end$$;
