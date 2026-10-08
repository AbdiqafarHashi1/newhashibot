import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {hash} from '../../scripts/phase-p/sql-inventory.mjs';
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
const transformations=[],executedFiles=[];
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 try{
  if(cronAvailable&&sql('SHOW cron.launch_active_jobs;').trim()!=='off')throw Error('CRON_EXECUTION_MUST_BE_OFF');
  const path=`supabase/migrations/${file}`,original=readFileSync(path,'utf8'),execution=compatibilityId?compatibleSql(path,original,compatibilityId):{sql:original,changed:false};
  if(execution.changed){const repair=compatibilityRepairs.find(r=>r.path===path),actual=repair.routine?sql(`select pg_get_function_result('public.${repair.routine}()'::regprocedure);`).trim():sql(`select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.${repair.table}'::regclass and attname='${repair.column}';`).trim();if(actual!==(repair.returnType??repair.type)&&!(repair.allowAbsent&&actual===''))throw Error('COMPATIBILITY_SCHEMA_MISMATCH');const {sql:_,...record}=execution;transformations.push({...record,preconditionValue:actual});}
  const providerStatus=execution.changed&&file.includes('_050_')?sql("select json_agg(json_build_object('provider',provider_name,'status',status) order by provider_name) from execution_provider_controls;").trim():null;
  const preserved=execution.changed?sql("select json_build_object('profiles',(select count(*) from profiles),'candles',(select count(*) from candles),'signals',(select count(*) from signals),'rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass));").trim():null;
  if(execution.changed&&file.includes('_088_')){
   const repair=compatibilityRepairs.find(r=>r.path===path);
   const proof=sql(`BEGIN;
INSERT INTO trade_management_truth(provider,environment,symbol,side,qty,protection_status) VALUES('binance','testnet','__OFFLINE_AUDIT__','long',2,'protected');
${repair.replacement}
${repair.replacement}
SELECT direction='long' AND quantity=2 AND status='unknown' AND id IS NOT NULL FROM trade_management_truth WHERE symbol='__OFFLINE_AUDIT__';
ROLLBACK;`).trim().split('\n');
   if(!proof.includes('t'))throw Error('TRADE_TRUTH_ADDITIVE_UPGRADE_DATA_TEST_FAILED');
   transformations.at(-1).upgradeDataTest='PASSED_ROLLED_BACK_EXPLICIT_ROW_FIXTURE_AND_REPEATED_PRELUDE';
  }
  sql(`BEGIN;\n${execution.sql}\nCOMMIT;`);applied++;executedFiles.push({identity:path,sourceSha256:hash(original),executedSha256:hash(execution.sql)});
  if(execution.changed){
   if(preserved!==sql("select json_build_object('profiles',(select count(*) from profiles),'candles',(select count(*) from candles),'signals',(select count(*) from signals),'rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass));").trim())throw Error('COMPATIBILITY_DATA_OR_RLS_CHANGED');
   const repair=compatibilityRepairs.find(r=>r.path===path);
   if(repair.column==='active_timeframes'&&sql(`select to_jsonb(active_timeframes)='["5m","15m","1h","4h"]'::jsonb from scanner_config where id=1;`).trim()!=='t')throw Error('COMPATIBILITY_TIMEFRAME_VALUES_CHANGED');
   if(repair.column==='allowed_timeframes'&&sql(`select count(*) from strategy_configs where strategy_name in ('CompressionBreakout','SwingContinuation') and allowed_timeframes='["15m","1h"]'::jsonb;`).trim()!=='2')throw Error('COMPATIBILITY_TIMEFRAME_VALUES_CHANGED');
   if(repair.routine&&sql("select pg_get_function_result('public.admin_reset_trading_history()'::regprocedure)='jsonb' and not has_function_privilege('anon','public.admin_reset_trading_history()','EXECUTE') and not has_function_privilege('authenticated','public.admin_reset_trading_history()','EXECUTE') and has_function_privilege('service_role','public.admin_reset_trading_history()','EXECUTE');").trim()!=='t')throw Error('COMPATIBILITY_SIGNATURE_OR_GRANTS_CHANGED');
   if(providerStatus!==null){const state=()=>sql("select json_agg(json_build_object('provider',provider_name,'status',status) order by provider_name) from execution_provider_controls;").trim();if(state()!==providerStatus)throw Error('PROVIDER_STATUS_CHANGED');if(sql("select count(*) from pg_constraint where conrelid='execution_provider_controls'::regclass and conname='execution_provider_controls_status_check';").trim()!=='1')throw Error('PROVIDER_STATUS_CONSTRAINT_LOST');sql(`BEGIN;\n${execution.sql}\nROLLBACK;`);if(state()!==providerStatus)throw Error('PROVIDER_SEED_NOT_IDEMPOTENT');transformations.at(-1).providerStatusAndSeedReplay='PASSED_REAL_POSTGRESQL';}
   transformations.at(-1).verification='PASSED_DATA_COUNTS_RLS_AND_TARGET_SIGNATURE_GRANTS';
  }
 }catch(error){
  const repair=compatibilityRepairs.find(r=>r.path===`supabase/migrations/${file}`),last=transformations.at(-1);
  if(repair?.allowAbsent&&last?.identity===repair.path&&last.preconditionValue===''){const after=sql(`select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.${repair.table}'::regclass and attname='${repair.column}';`).trim();last.failedMigrationRolledBack=after==='';last.verification=after===''?'TRANSACTION_ROLLBACK_CONFIRMED_NOT_FULLY_VERIFIED':'ROLLBACK_VERIFICATION_FAILED';}
  console.error(JSON.stringify({status:'BLOCKED',migration:file,precedingFilesExecuted:applied,error:String(error.stderr??error.message).trim(),executedFiles,transformations,prerequisite:'Inspect the exact error and this migration source; do not skip or mark history.',scope:compatibilityId?'EXPLICIT_COMPATIBILITY_REHEARSAL (not unchanged-chain verification)':'UNCHANGED_FULL_AUTOMATIC_CHAIN',fixture:false}));process.exitCode=1;break;
 }
}
if(!process.exitCode)console.log(JSON.stringify({status:'PASSED',files:applied,executedFiles,scope:compatibilityId?'EXPLICIT_COMPATIBILITY_REHEARSAL':'UNCHANGED_FULL_AUTOMATIC_CHAIN',transformations,fixture:false,cronExecution:cronAvailable?'off':'UNAVAILABLE'}));
