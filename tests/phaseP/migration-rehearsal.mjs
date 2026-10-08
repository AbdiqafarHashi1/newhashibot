import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {compatibleSql,compatibility,compatibilityRepairs} from '../../scripts/phase-p/compatibility.mjs';
const container=process.argv[2];
const compatibilityId=process.argv[3];
if(compatibilityId&&compatibilityId!==compatibility.id)throw Error('UNKNOWN_COMPATIBILITY_PATH');
if(container!=='supabase_db_local-supabase'&&!/^hashibot-phase-p-chain-\d+$/.test(container??''))throw Error('ISOLATED_REHEARSAL_CONTAINER_REQUIRED');
const label=execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect',container,'--format','{{index .Config.Labels "hashibot.offline-rehearsal"}}'],{encoding:'utf8'}).trim();
if(label!=='true')throw Error('OWNED_DISPOSABLE_REHEARSAL_LABEL_REQUIRED');
const network=execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();
if(network!=='none'&&execFileSync('docker',['--host=unix:///var/run/docker.sock','network','inspect',network,'--format','{{.Internal}}'],{encoding:'utf8'}).trim()!=='true')throw Error('INTERNAL_OR_DISABLED_NETWORK_REQUIRED');
const sql=input=>execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
if(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';").trim()!=='0')throw Error('FRESH_PUBLIC_SCHEMA_REQUIRED');
const cronAvailable=sql("SELECT count(*) FROM pg_available_extensions WHERE name='pg_cron';").trim()==='1';
if(cronAvailable){sql("ALTER SYSTEM SET cron.launch_active_jobs='off'; SELECT pg_reload_conf();");await new Promise(r=>setTimeout(r,200));if(sql('SHOW cron.launch_active_jobs;').trim()!=='off')throw Error('CRON_EXECUTION_MUST_BE_OFF');}
else{const mode=execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();if(mode!=='none')throw Error('NETWORK_DISABLED_REHEARSAL_REQUIRED');}
let applied=0;
const transformations=[];
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 try{
  if(cronAvailable&&sql('SHOW cron.launch_active_jobs;').trim()!=='off')throw Error('CRON_EXECUTION_MUST_BE_OFF');
  const path=`supabase/migrations/${file}`,original=readFileSync(path,'utf8'),execution=compatibilityId?compatibleSql(path,original,compatibilityId):{sql:original,changed:false};
  if(execution.changed){const repair=compatibilityRepairs.find(r=>r.path===path),actual=repair.routine?sql(`select pg_get_function_result('public.${repair.routine}()'::regprocedure);`).trim():sql(`select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.${repair.table}'::regclass and attname='${repair.column}';`).trim();if(actual!==(repair.returnType??repair.type)&&!(repair.allowAbsent&&actual===''))throw Error('COMPATIBILITY_SCHEMA_MISMATCH');const {sql:_,...record}=execution;transformations.push({...record,preconditionValue:actual});}
  const preserved=execution.changed?sql("select json_build_object('profiles',(select count(*) from profiles),'candles',(select count(*) from candles),'signals',(select count(*) from signals),'rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass));").trim():null;
  sql(`BEGIN;\n${execution.sql}\nCOMMIT;`);applied++;
  if(execution.changed){
   if(preserved!==sql("select json_build_object('profiles',(select count(*) from profiles),'candles',(select count(*) from candles),'signals',(select count(*) from signals),'rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass));").trim())throw Error('COMPATIBILITY_DATA_OR_RLS_CHANGED');
   const repair=compatibilityRepairs.find(r=>r.path===path);
   if(repair.column==='active_timeframes'&&sql(`select to_jsonb(active_timeframes)='["5m","15m","1h","4h"]'::jsonb from scanner_config where id=1;`).trim()!=='t')throw Error('COMPATIBILITY_TIMEFRAME_VALUES_CHANGED');
   if(repair.column==='allowed_timeframes'&&sql(`select count(*) from strategy_configs where strategy_name in ('CompressionBreakout','SwingContinuation') and allowed_timeframes='["15m","1h"]'::jsonb;`).trim()!=='2')throw Error('COMPATIBILITY_TIMEFRAME_VALUES_CHANGED');
   if(repair.routine&&sql("select pg_get_function_result('public.admin_reset_trading_history()'::regprocedure)='jsonb' and not has_function_privilege('anon','public.admin_reset_trading_history()','EXECUTE') and not has_function_privilege('authenticated','public.admin_reset_trading_history()','EXECUTE') and has_function_privilege('service_role','public.admin_reset_trading_history()','EXECUTE');").trim()!=='t')throw Error('COMPATIBILITY_SIGNATURE_OR_GRANTS_CHANGED');
   transformations.at(-1).verification='PASSED_DATA_COUNTS_RLS_AND_TARGET_SIGNATURE_GRANTS';
  }
 }catch(error){
  const repair=compatibilityRepairs.find(r=>r.path===`supabase/migrations/${file}`),last=transformations.at(-1);
  if(repair?.allowAbsent&&last?.identity===repair.path&&last.preconditionValue===''){const after=sql(`select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.${repair.table}'::regclass and attname='${repair.column}';`).trim();last.failedMigrationRolledBack=after==='';last.verification=after===''?'TRANSACTION_ROLLBACK_CONFIRMED_NOT_FULLY_VERIFIED':'ROLLBACK_VERIFICATION_FAILED';}
  console.error(JSON.stringify({status:'BLOCKED',migration:file,precedingFilesExecuted:applied,error:String(error.stderr??error.message).trim(),transformations,prerequisite:'Inspect the exact error and this migration source; do not skip or mark history.',scope:compatibilityId?'EXPLICIT_COMPATIBILITY_REHEARSAL (not unchanged-chain verification)':'UNCHANGED_FULL_AUTOMATIC_CHAIN',fixture:false}));process.exitCode=1;break;
 }
}
if(!process.exitCode)console.log(JSON.stringify({status:'PASSED',files:applied,scope:compatibilityId?'EXPLICIT_COMPATIBILITY_REHEARSAL':'UNCHANGED_FULL_AUTOMATIC_CHAIN',transformations,fixture:false,cronExecution:cronAvailable?'off':'UNAVAILABLE'}));
