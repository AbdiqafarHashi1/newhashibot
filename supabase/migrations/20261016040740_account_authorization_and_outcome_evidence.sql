-- Supplemental provider evidence; existing E/F truth remains lifecycle authority.
create table public.account_closed_provider_outcomes(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null,execution_account_id uuid not null references public.connected_execution_accounts(id),
 execution_truth_id uuid not null,provider text not null check(provider in('BINANCE','BYBIT','MT5_PERSONAL','MT5_PROP')),
 closed_at timestamptz not null,currency text not null,net_pnl numeric not null check(net_pnl not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 source text not null,source_ids text[] not null check(cardinality(source_ids)>0),created_at timestamptz not null default now(),
 unique(execution_account_id,execution_truth_id)
);
alter table public.account_closed_provider_outcomes enable row level security;
revoke all on public.account_closed_provider_outcomes from public,anon,authenticated;
grant select on public.account_closed_provider_outcomes to authenticated,service_role;
create policy closed_provider_outcomes_read on public.account_closed_provider_outcomes for select to authenticated using(customer_id=(select auth.uid()) or public.is_admin());
create trigger closed_provider_outcomes_immutable before update or delete on public.account_closed_provider_outcomes for each row execute function public.prevent_monitor_evidence_mutation();
create function public.record_account_closed_provider_outcome(p_customer_id uuid,p_account_id uuid,p_provider text,p_execution_id uuid,p_closed_at timestamptz,p_currency text,p_net_pnl numeric,p_source text,p_source_ids text[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare a connected_execution_accounts;t jsonb;prior account_closed_provider_outcomes;result uuid;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account_id and customer_id=p_customer_id for update;
 if not found or upper(a.provider) is distinct from p_provider or not ((p_provider='BINANCE' and upper(a.environment)='TESTNET') or (p_provider in('BYBIT','MT5_PERSONAL','MT5_PROP') and upper(a.environment)='DEMO')) then raise exception 'OUTCOME_ACCOUNT_SCOPE';end if;
 if p_provider in('BINANCE','BYBIT') then select to_jsonb(x) into t from crypto_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state='CLOSED';else select to_jsonb(x) into t from mt5_account_execution_truth x where id=p_execution_id and customer_id=a.customer_id and execution_account_id=a.id and lifecycle_state='TP2_CLOSED';end if;
 if t is null or p_closed_at is null or p_closed_at>clock_timestamp()+interval '5 seconds' or p_closed_at<(t->>'created_at')::timestamptz or nullif(p_currency,'') is null or p_net_pnl is null or p_net_pnl in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or coalesce(cardinality(p_source_ids),0)=0 then raise exception 'OUTCOME_EVIDENCE_INCOMPLETE';end if;
 if (p_provider='BINANCE' and p_source is distinct from 'BINANCE_USER_TRADES_AND_INCOME') or (p_provider='BYBIT' and p_source is distinct from 'BYBIT_CLOSED_PNL') or (p_provider like 'MT5_%' and p_source is distinct from 'MT5_DEALS') then raise exception 'OUTCOME_SOURCE_MISMATCH';end if;
 select * into prior from account_closed_provider_outcomes where execution_account_id=a.id and execution_truth_id=p_execution_id;
 if found then if row(prior.closed_at,prior.currency,prior.net_pnl,prior.source,prior.source_ids) is distinct from row(p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) then raise exception 'OUTCOME_CONTENT_CONFLICT';end if;return prior.id;end if;
 insert into account_closed_provider_outcomes(customer_id,execution_account_id,execution_truth_id,provider,closed_at,currency,net_pnl,source,source_ids) values(a.customer_id,a.id,p_execution_id,p_provider,p_closed_at,p_currency,p_net_pnl,p_source,p_source_ids) returning id into result;return result;
end$$;
revoke all on function public.record_account_closed_provider_outcome(uuid,uuid,text,uuid,timestamptz,text,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.record_account_closed_provider_outcome(uuid,uuid,text,uuid,timestamptz,text,numeric,text,text[]) to service_role;

