-- PREPARATION ONLY. Do not run against production as part of Phase P.
-- An authorized operator runs on the ONLINE database after backup approval.
-- No secret values, customer records or credential contents are selected.
BEGIN TRANSACTION READ ONLY;
SELECT version(), current_database(), now();
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema IN ('public','storage','vault')
 ORDER BY table_schema,table_name,ordinal_position;
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','storage','vault') AND c.relkind IN ('r','p','v');
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname IN ('public','storage','vault');
SELECT grantee,table_schema,table_name,privilege_type
 FROM information_schema.role_table_grants WHERE table_schema IN ('public','storage','vault');
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.proacl,
 md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname;
-- Secret metadata only: NEVER select decrypted_secret or secret.
SELECT id,name,created_at,updated_at FROM vault.secrets ORDER BY name;
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT bucket_id,count(*) AS object_count FROM storage.objects GROUP BY bucket_id;
SELECT jobid,jobname,schedule,active,md5(command) AS command_fingerprint
 FROM cron.job ORDER BY jobid;
COMMIT;
-- If any schema/catalog is absent, record ABSENT explicitly and inspect the
-- applicable SELECT individually in a new read-only transaction. Do not install
-- extensions, mutate history, reset the project or run db push to make it pass.
