-- Resource admission is shared by manual and scheduled scanner requests.
create table public.scanner_resource_lease (
 id boolean primary key default true check(id),
 token uuid not null,
 expires_at timestamptz not null
);
alter table public.scanner_resource_lease enable row level security;
revoke all on public.scanner_resource_lease from public,anon,authenticated;
grant all on public.scanner_resource_lease to service_role;
create function public.claim_scanner_resource_lease(p_token uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare claimed boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_token is null then raise exception 'LEASE_TOKEN_REQUIRED';end if;
 insert into scanner_resource_lease(id,token,expires_at) values(true,p_token,clock_timestamp()+interval '10 minutes')
 on conflict(id) do update set token=excluded.token,expires_at=excluded.expires_at
 where scanner_resource_lease.expires_at<=clock_timestamp()
 returning true into claimed;
 return coalesce(claimed,false);
end$$;
create function public.release_scanner_resource_lease(p_token uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 delete from scanner_resource_lease where id=true and token=p_token;
end$$;
revoke all on function public.claim_scanner_resource_lease(uuid),public.release_scanner_resource_lease(uuid) from public,anon,authenticated;
grant execute on function public.claim_scanner_resource_lease(uuid),public.release_scanner_resource_lease(uuid) to service_role;

-- Archive copies are storage too. Bound disposable copies without touching trade,
-- payment, subscription, signal or provider evidence. No cleanup runs on migration.
create index if not exists retention_archive_expiry on public.hashibot_retention_archive(archived_at);
create function public.cleanup_hashibot_resource_history(p_batch integer default 1000) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='10s' set lock_timeout='1s' as $$
declare copies integer; runs integer;
begin
 if p_batch is null or p_batch<1 or p_batch>5000 then raise exception 'BATCH_MUST_BE_1_TO_5000';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('hashibot-resource-cleanup',0)) then return jsonb_build_object('skipped',true);end if;
 delete from hashibot_retention_archive where id in (
  select id from hashibot_retention_archive where archived_at<now()-interval '30 days' order by archived_at limit p_batch for update skip locked
 );
 get diagnostics copies=row_count;
 delete from cron.job_run_details where runid in (
  select d.runid from cron.job_run_details d join cron.job j on j.jobid=d.jobid
  where j.jobname like 'hashibot\_%' escape '\' and d.end_time<now()-interval '7 days'
  order by d.end_time limit p_batch for update of d skip locked
 );
 get diagnostics runs=row_count;
 return jsonb_build_object('archive_copies_deleted',copies,'cron_details_deleted',runs,'batch_limit_per_table',p_batch);
end$$;
revoke all on function public.cleanup_hashibot_resource_history(integer) from public,anon,authenticated,service_role;
-- Cron executes as the installing database owner, not via a public RPC.
do $$ declare job bigint;begin
 select cron.schedule('hashibot_resource_history_hourly','17 * * * *','select public.cleanup_hashibot_resource_history(1000);') into job;
 perform cron.alter_job(job,active:=false);
end$$;
