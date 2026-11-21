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

-- Spread five-minute workers across the minute cycle; seven per-minute workers
-- plus one staggered worker gives at most eight scheduled HTTP submissions/minute.
create or replace function public.install_hashibot_release_schedules(p_actor uuid,p_project_url text,p_jobs jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb;secret_id uuid;job_id bigint;statement text;result jsonb:='[]';begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_project_url<>'https://uqiwbzfcntlcyyewawfc.supabase.co' or jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>16 then raise exception 'RELEASE_PROJECT_OR_JOB_SCOPE_INVALID';end if;
 if (select count(distinct value->>'name') from jsonb_array_elements(p_jobs))<>jsonb_array_length(p_jobs) then raise exception 'DUPLICATE_RELEASE_JOBS';end if;
 update cron.job set active=false where jobname like 'hashibot_%';
 for j in select value from jsonb_array_elements(p_jobs) loop
  if not exists(select 1 from (values
   ('hashibot_scheduled_market_scanner_5m','scheduled-market-scanner','*/5 * * * *','x-scanner-cron-secret'),
   ('hashibot_outcomes_5m','evaluate-signal-outcomes','1-59/5 * * * *','x-hashibot-cron-token'),
   ('hashibot_binance_monitor_1m','binance-testnet-monitor','* * * * *','x-hashibot-cron-token'),
   ('hashibot_bybit_monitor_1m','bybit-testnet-monitor','* * * * *','x-hashibot-cron-token'),
   ('hashibot_account_authorization_1m','account-signal-authorization','* * * * *','x-hashibot-internal-secret'),
   ('hashibot_account_commands_1m','phase-n-command-worker','* * * * *','x-hashibot-internal-secret'),
   ('hashibot_reporting_1m','canonical-reporting-worker','* * * * *','x-hashibot-cron-token'),
   ('hashibot_commerce_recovery_5m','commerce-reconcile','2-59/5 * * * *','x-hashibot-cron-token'),
   ('hashibot_telegram_membership_1m','telegram-membership','* * * * *','Authorization'),
   ('hashibot_agents_5m','phase-o-worker','3-59/5 * * * *','x-phase-o-worker-secret'),
   ('hashibot_conditional_watch_1m','conditional-watch','* * * * *','x-hashibot-cron-token'),
   ('hashibot_intelligence_5m','intelligence-engine','4-59/5 * * * *','x-hashibot-cron-token')
  ) expected(name,endpoint,schedule,header) where expected.name=j->>'name' and expected.endpoint=j->>'endpoint' and expected.schedule=j->>'schedule' and expected.header=j->>'header') or length(coalesce(j->>'token',''))<16 then raise exception 'RELEASE_JOB_CONFIGURATION_INVALID';end if;
  select id into secret_id from vault.secrets where name='release_'||(j->>'name');
  if secret_id is null then secret_id:=vault.create_secret(j->>'token','release_'||(j->>'name'),'HashiBot scheduled worker authorization');else perform vault.update_secret(secret_id,j->>'token');end if;
  statement:=format('select net.http_post(url := %L,headers := jsonb_build_object(''Content-Type'',''application/json'',%L,(select decrypted_secret from vault.decrypted_secrets where id=%L::uuid)),body := %L::jsonb,timeout_milliseconds := 90000);',p_project_url||'/functions/v1/'||(j->>'endpoint'),j->>'header',secret_id::text,coalesce(j->'body','{}'::jsonb)::text);
  select cron.schedule(j->>'name',j->>'schedule',statement) into job_id;perform cron.alter_job(job_id,active:=false);
  result:=result||jsonb_build_array(jsonb_build_object('name',j->>'name','job_id',job_id,'active',false));
 end loop;
 insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'RELEASE_SCHEDULES_INSTALLED_PAUSED',jsonb_build_object('jobs',result));return result;
end$$;
revoke all on function public.install_hashibot_release_schedules(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.install_hashibot_release_schedules(uuid,text,jsonb) to service_role;
