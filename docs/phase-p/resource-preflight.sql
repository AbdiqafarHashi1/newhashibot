-- Metadata only: no customer rows, secrets, job commands, network bodies or mutations.
begin transaction isolation level repeatable read read only;
select pg_database_size(current_database()) as database_bytes;
select s.relname,pg_total_relation_size(s.relid) as total_bytes,
 s.n_live_tup as estimated_live_rows,s.n_dead_tup as estimated_dead_rows,
 s.last_autovacuum,s.last_autoanalyze
from pg_stat_user_tables s where s.schemaname in ('public','cron','net')
order by pg_total_relation_size(s.relid) desc limit 30;
select jobname,schedule,active from cron.job order by jobname;
-- Review duplicate HTTP targets and active legacy jobs before enabling anything.
with targets as (
 select jobname,active,(regexp_match(command,'/functions/v1/([a-z0-9-]+)'))[1] as endpoint
 from cron.job
)
select endpoint,count(*) as active_jobs,array_agg(jobname order by jobname) as names
from targets where active group by endpoint having count(*)>1 or endpoint is null;
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by c.relname;
commit;
