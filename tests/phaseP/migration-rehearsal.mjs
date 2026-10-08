import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
const container=process.argv[2];
if(container!=='supabase_db_local-supabase'&&!/^hashibot-phase-p-chain-\d+$/.test(container??''))throw Error('ISOLATED_REHEARSAL_CONTAINER_REQUIRED');
const sql=input=>execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const cronAvailable=sql("SELECT count(*) FROM pg_available_extensions WHERE name='pg_cron';").trim()==='1';
if(cronAvailable){sql("ALTER SYSTEM SET cron.launch_active_jobs='off'; SELECT pg_reload_conf();");await new Promise(r=>setTimeout(r,200));if(sql('SHOW cron.launch_active_jobs;').trim()!=='off')throw Error('CRON_EXECUTION_MUST_BE_OFF');}
else{const mode=execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();if(mode!=='none')throw Error('NETWORK_DISABLED_REHEARSAL_REQUIRED');}
let applied=0;
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 try{sql(readFileSync(`supabase/migrations/${file}`,'utf8'));applied++;}
 catch(error){console.error(JSON.stringify({status:'BLOCKED',migration:file,precedingFilesExecuted:applied,error:String(error.stderr).split('\n').find(x=>x.includes('ERROR:'))??'SQL execution failed',scope:'Unchanged complete top-level migration chain on a fresh disposable Supabase database; no repair or marking applied'}));process.exitCode=1;break;}
}
if(!process.exitCode)console.log(JSON.stringify({status:'PASSED',files:applied,cronExecution:cronAvailable?'off':'UNAVAILABLE'}));
