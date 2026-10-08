import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from './sql-inventory.mjs';
// No application records, credential values, Vault plaintext, cron command text,
// function body text, connection strings or environment values enter the output.
export const catalogQueries={
 platform:"select json_build_object('postgres',current_setting('server_version'),'database',current_database(),'extensions',(select coalesce(json_agg(json_build_object('name',extname,'version',extversion) order by extname),'[]'::json) from pg_extension));",
 relations:"select coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'options',c.reloptions,'viewDefinitionFingerprint',case when c.relkind in ('v','m') then md5(pg_get_viewdef(c.oid,true)) else null end) order by n.nspname,c.relname),'[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault') and c.relkind in ('r','p','v','m','S');",
 columns:"select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull,'defaultFingerprint',md5(pg_get_expr(d.adbin,d.adrelid))) order by n.nspname,c.relname,a.attnum),'[]'::json) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','auth','storage','vault') and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m');",
 routines:"select coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'securityDefiner',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'configurationFingerprint',md5(array_to_string(p.proconfig,E'\\n')),'definitionFingerprint',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage','vault') and p.prokind in ('f','p');",
 constraints:"select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,'definitionFingerprint',md5(pg_get_constraintdef(k.oid,true))) order by n.nspname,c.relname,k.conname),'[]'::json) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault');",
 indexes:"select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',indexname,'definitionFingerprint',md5(indexdef)) order by schemaname,tablename,indexname),'[]'::json) from pg_indexes where schemaname in ('public','auth','storage','vault');",
 policies:"select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive,'usingFingerprint',md5(qual),'checkFingerprint',md5(with_check)) order by schemaname,tablename,policyname),'[]'::json) from pg_policies where schemaname in ('public','auth','storage','vault');",
 triggers:"select coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definitionFingerprint',md5(pg_get_triggerdef(t.oid,true))) order by n.nspname,c.relname,t.tgname),'[]'::json) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','vault') and not t.tgisinternal;",
 grants:"select coalesce(json_agg(json_build_object('schema',table_schema,'table',table_name,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) order by table_schema,table_name,grantee,privilege_type),'[]'::json) from information_schema.role_table_grants where table_schema in ('public','auth','storage','vault');"
 ,roles:"select coalesce(json_agg(json_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassRls',rolbypassrls) order by rolname),'[]'::json) from pg_roles;"
 ,memberships:"select coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin',admin_option) order by pg_get_userbyid(roleid),pg_get_userbyid(member)),'[]'::json) from pg_auth_members;"
 ,defaultGrants:"select coalesce(json_agg(json_build_object('role',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'objectType',d.defaclobjtype,'acl',d.defaclacl) order by d.defaclrole,n.nspname,d.defaclobjtype),'[]'::json) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;"
 ,configurationPresence:"select json_agg(json_build_object('name',name,'configured',coalesce(current_setting(name,true),'')<>'') order by name) from (values ('app.settings.supabase_url'),('app.settings.scanner_cron_secret'),('app.supabase_url'),('app.scanner_cron_secret')) s(name);"
};
const optional={
 history:{relation:'supabase_migrations.schema_migrations',query:"select coalesce(json_agg(json_build_object('version',version,'name',name,'statementsFingerprint',md5(array_to_string(statements,E'\\n'))) order by version),'[]'::json) from supabase_migrations.schema_migrations;"},
 vault:{relation:'vault.secrets',query:"select coalesce(json_agg(json_build_object('id',id,'name',name,'createdAt',created_at,'updatedAt',updated_at) order by id),'[]'::json) from vault.secrets;"},
 storageBuckets:{relation:'storage.buckets',query:"select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,'fileSizeLimit',file_size_limit,'allowedMimeTypes',allowed_mime_types) order by id),'[]'::json) from storage.buckets;"},
 storageObjectCounts:{relation:'storage.objects',query:"select coalesce(json_agg(x order by bucket_id),'[]'::json) from (select bucket_id,count(*) as object_count from storage.objects group by bucket_id) x;"},
 cron:{relation:'cron.job',query:"select coalesce(json_agg(json_build_object('name',jobname,'schedule',schedule,'active',active,'database',database,'username',username,'commandFingerprint',md5(command),'endpointNames',(select array_agg(m[1]) from regexp_matches(command,'/functions/v1/([a-zA-Z0-9_-]+)','g') m)) order by jobname,jobid),'[]'::json) from cron.job;"}
};
export function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export function schemaFingerprint(sections){return hash(JSON.stringify(canonical(Object.fromEntries(Object.keys(catalogQueries).filter(k=>k!=='platform').map(k=>[k,sections[k]])))));}
export function inspectionSql(){
 const emit=(key,query)=>`SELECT json_build_object('key','${key}','status','PRESENT','data',q.value) FROM (${query.replace(/;\s*$/,'')}) q(value);`;
 return ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',"SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s';",...Object.entries(catalogQueries).map(([key,q])=>emit(key,q)),...Object.entries(optional).map(([key,{relation,query}])=>`SELECT to_regclass('${relation}') IS NOT NULL AS has_${key.toLowerCase()} \\gset\n\\if :has_${key.toLowerCase()}\n${emit(key,query)}\n\\else\nSELECT json_build_object('key','${key}','status','ABSENT');\n\\endif`),'COMMIT;'].join('\n');
}
export function parseCapture(output){const sections={};for(const line of output.trim().split('\n')){const {key,...value}=JSON.parse(line);sections[key]=value;}return {schemaVersion:1,scope:'READ_ONLY_METADATA',consistency:'SINGLE_REPEATABLE_READ_TRANSACTION',capturedAt:new Date().toISOString(),status:'PASSED',errors:[],sections,schemaFingerprint:schemaFingerprint(sections),deployedFunctions:{status:'UNKNOWN'},secretValuesRetrieved:false};}
export function capture(sql){
 const sections={},errors=[];
 for(const [key,query] of Object.entries(catalogQueries)){try{sections[key]={status:'PRESENT',data:sql(query)};}catch{sections[key]={status:'INSPECTION_FAILED'};errors.push(key);}}
 for(const [key,{relation,query}] of Object.entries(optional)){try{if(!sql(`select to_regclass('${relation}') is not null;`)){sections[key]={status:'ABSENT'};continue;}sections[key]={status:'PRESENT',data:sql(query)};}catch{sections[key]={status:'INSPECTION_FAILED'};errors.push(key);}}
 return {schemaVersion:1,scope:'READ_ONLY_METADATA',capturedAt:new Date().toISOString(),status:errors.length?'PARTIAL':'PASSED',errors,sections,schemaFingerprint:schemaFingerprint(sections),deployedFunctions:{status:'UNKNOWN'},secretValuesRetrieved:false};
}
async function main(){
 const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1],local=args.includes('--local-container'),online=args.includes('--online-read-only');
 if(local===online||!args.includes('--output'))throw Error('Use --local-container NAME or --online-read-only --project-ref REF, plus --output PATH');
 const container=local?get('--local-container'):null;
 if(local&&!/^hashibot-phase-p-(?:chain|test)-\d+$/.test(container??''))throw Error('ISOLATED_CONTAINER_REQUIRED');
 if(online&&(!args.includes('--project-ref')||!process.env.PGSERVICE))throw Error('READ_ONLY_PGSERVICE_AND_PROJECT_REF_REQUIRED');
 const execute=input=>{
  const common=['-X','-v','ON_ERROR_STOP=1','-Atq'];
  const output=local?execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres',...common],{input,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}):execFileSync('psql',common,{input,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
  return output;
 };
 const result=parseCapture(execute(inspectionSql()));result.projectRef=online?get('--project-ref'):'ISOLATED_LOCAL';result.projectIdentityStatus=online?'PGSERVICE_BINDING_REQUIRES_OPERATOR_VERIFICATION':'ISOLATED_LOCAL';
 // Management API is GET-only and metadata-only. No secret-list, body/download,
 // deployment, database query endpoint or mutation is implemented.
 if(online&&process.env.SUPABASE_ACCESS_TOKEN){try{
  if(!/^[a-z]{20}$/.test(result.projectRef))throw Error('PROJECT_REF_INVALID');
  const response=await fetch(`https://api.supabase.com/v1/projects/${result.projectRef}/functions`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('FUNCTION_METADATA_READ_FAILED');const rows=await response.json();
  result.deployedFunctions={status:'PRESENT_METADATA_ONLY',data:rows.map(f=>({name:f.slug??f.name,version:f.version,status:f.status,verifyJwt:f.verify_jwt})).sort((a,b)=>a.name.localeCompare(b.name)),sourceFingerprintStatus:'UNKNOWN_REQUIRES_AUTHORIZED_ARTIFACT_COMPARISON'};
 }catch{result.deployedFunctions={status:'INSPECTION_FAILED'};result.status='PARTIAL';}}
 mkdirSync(dirname(get('--output')),{recursive:true});writeFileSync(get('--output'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:result.status,output:get('--output'),schemaFingerprint:result.schemaFingerprint,scope:result.scope}));
 if(result.status!=='PASSED')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('INSPECTION_FAILED: verify permissions, optional catalog availability and the read-only connection; no credential values are logged.');process.exitCode=1;});
