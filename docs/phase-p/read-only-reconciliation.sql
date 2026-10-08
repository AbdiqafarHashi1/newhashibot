-- PREPARATION ONLY: psql metadata inspection, no deployment or activation.
-- Run only after separate authorization against the identified project.
-- Definitions/commands are fingerprinted on the server; no decrypted secrets.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s';
SELECT json_build_object('key','platform','status','PRESENT','data',q.value) FROM (select json_build_object('postgres',current_setting('server_version'),'database',current_database(),'extensions',(select coalesce(json_agg(json_build_object('name',extname,'version',extversion) order by extname),'[]'::json) from pg_extension))) q(value);
SELECT json_build_object('key','relations','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'options',c.reloptions,'viewDefinitionFingerprint',case when c.relkind in ('v','m') then md5(pg_get_viewdef(c.oid,true)) else null end) order by n.nspname,c.relname),'[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault') and c.relkind in ('r','p','v','m','S')) q(value);
SELECT json_build_object('key','columns','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull,'defaultFingerprint',md5(pg_get_expr(d.adbin,d.adrelid))) order by n.nspname,c.relname,a.attnum),'[]'::json) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','auth','storage','vault') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m')) q(value);
SELECT json_build_object('key','routines','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'securityDefiner',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'configurationFingerprint',md5(array_to_string(p.proconfig,E'\n')),'definitionFingerprint',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage','vault') and p.prokind in ('f','p')) q(value);
SELECT json_build_object('key','constraints','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,'definitionFingerprint',md5(pg_get_constraintdef(k.oid,true))) order by n.nspname,c.relname,k.conname),'[]'::json) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault')) q(value);
SELECT json_build_object('key','indexes','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',indexname,'definitionFingerprint',md5(indexdef)) order by schemaname,tablename,indexname),'[]'::json) from pg_indexes where schemaname in ('public','auth','storage','vault')) q(value);
SELECT json_build_object('key','policies','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive,'usingFingerprint',md5(qual),'checkFingerprint',md5(with_check)) order by schemaname,tablename,policyname),'[]'::json) from pg_policies where schemaname in ('public','auth','storage','vault')) q(value);
SELECT json_build_object('key','triggers','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definitionFingerprint',md5(pg_get_triggerdef(t.oid,true))) order by n.nspname,c.relname,t.tgname),'[]'::json) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault') and not t.tgisinternal) q(value);
SELECT json_build_object('key','grants','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('schema',table_schema,'table',table_name,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) order by table_schema,table_name,grantee,privilege_type),'[]'::json) from information_schema.role_table_grants where table_schema in ('public','auth','storage','vault')) q(value);
SELECT json_build_object('key','roles','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassRls',rolbypassrls) order by rolname),'[]'::json) from pg_roles) q(value);
SELECT json_build_object('key','memberships','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin',admin_option) order by pg_get_userbyid(roleid),pg_get_userbyid(member)),'[]'::json) from pg_auth_members) q(value);
SELECT json_build_object('key','defaultGrants','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('role',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'objectType',d.defaclobjtype,'acl',d.defaclacl) order by d.defaclrole,n.nspname,d.defaclobjtype),'[]'::json) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace) q(value);
SELECT json_build_object('key','configurationPresence','status','PRESENT','data',q.value) FROM (select json_agg(json_build_object('name',name,'configured',coalesce(current_setting(name,true),'')<>'') order by name) from (values ('app.settings.supabase_url'),('app.settings.scanner_cron_secret'),('app.supabase_url'),('app.scanner_cron_secret')) s(name)) q(value);
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_history \gset
\if :has_history
SELECT json_build_object('key','history','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('version',version,'name',name,'statementsFingerprint',md5(array_to_string(statements,E'\n'))) order by version),'[]'::json) from supabase_migrations.schema_migrations) q(value);
\else
SELECT json_build_object('key','history','status','ABSENT');
\endif
SELECT to_regclass('vault.secrets') IS NOT NULL AS has_vault \gset
\if :has_vault
SELECT json_build_object('key','vault','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('id',id,'name',name,'createdAt',created_at,'updatedAt',updated_at) order by id),'[]'::json) from vault.secrets) q(value);
\else
SELECT json_build_object('key','vault','status','ABSENT');
\endif
SELECT to_regclass('storage.buckets') IS NOT NULL AS has_storagebuckets \gset
\if :has_storagebuckets
SELECT json_build_object('key','storageBuckets','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,'fileSizeLimit',file_size_limit,'allowedMimeTypes',allowed_mime_types) order by id),'[]'::json) from storage.buckets) q(value);
\else
SELECT json_build_object('key','storageBuckets','status','ABSENT');
\endif
SELECT to_regclass('storage.objects') IS NOT NULL AS has_storageobjectcounts \gset
\if :has_storageobjectcounts
SELECT json_build_object('key','storageObjectCounts','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(x order by bucket_id),'[]'::json) from (select bucket_id,count(*) as object_count from storage.objects group by bucket_id) x) q(value);
\else
SELECT json_build_object('key','storageObjectCounts','status','ABSENT');
\endif
SELECT to_regclass('cron.job') IS NOT NULL AS has_cron \gset
\if :has_cron
SELECT json_build_object('key','cron','status','PRESENT','data',q.value) FROM (select coalesce(json_agg(json_build_object('name',jobname,'schedule',schedule,'active',active,'database',database,'username',username,'commandFingerprint',md5(command),'endpointNames',(select array_agg(m[1]) from regexp_matches(command,'/functions/v1/([a-zA-Z0-9_-]+)','g') m)) order by jobname,jobid),'[]'::json) from cron.job) q(value);
\else
SELECT json_build_object('key','cron','status','ABSENT');
\endif
COMMIT;
