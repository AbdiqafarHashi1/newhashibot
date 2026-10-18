import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const name=`hashibot-phase-p-chain-${process.pid}`,auth=`${name}-auth`,network=`${name}-internal`;
const image=process.env.HASHIBOT_REHEARSAL_IMAGE??'hashibot-migration-rehearsal:local';
const compatibilityId=process.argv[2];
if(compatibilityId&&compatibilityId!=='deployment-compatibility-v1')throw Error('UNKNOWN_COMPATIBILITY_PATH');
const suffix=compatibilityId?'compatibility':'full-chain';
const docker=(args,input)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=input=>docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],input);
mkdirSync('work/phase-p/offline',{recursive:true});
const report={scope:compatibilityId?'EXPLICIT_COMPATIBILITY_REHEARSAL':'UNCHANGED_FULL_AUTOMATIC_CHAIN',fixture:false,image,status:'NOT_RUN',activation:false};
try{
 report.imageId=docker(['image','inspect',image,'--format','{{.Id}}']).trim();docker(['image','inspect','ghcr.io/supabase/gotrue:v2.197.0']);docker(['network','create','--internal',network]);
 docker(['run','-d','--name',name,'--label','hashibot.offline-rehearsal=true','--network',network,'--network-alias','database',image]);
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('DISPOSABLE_DATABASE_START_FAILED');
 report.postgres=sql('select version();').trim();report.extensions=JSON.parse(sql("select json_agg(json_build_object('name',name,'version',default_version)) from pg_available_extensions where name in ('pg_cron','pg_net','supabase_vault');"));
 if(report.extensions?.length!==3)throw Error('REAL_PG_CRON_PG_NET_AND_VAULT_REQUIRED');
 if(sql('show cron.launch_active_jobs;').trim()!=='off')throw Error('CRON_EXECUTION_MUST_BE_OFF');
 docker(['exec',name,'sh','-c',"printf '\nhost all all 0.0.0.0/0 trust\n' >> /var/lib/postgresql/data/pg_hba.conf"]);sql('SELECT pg_reload_conf();');await new Promise(r=>setTimeout(r,300));
 // Platform prerequisites only. Actual GoTrue migrations create auth.users and
 // auth metadata; no application tables, fake extension functions or fixture DDL.
 sql(`CREATE EXTENSION IF NOT EXISTS supabase_vault;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE supabase_auth_admin LOGIN;CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;ALTER DATABASE postgres SET search_path=public,extensions;CREATE EXTENSION IF NOT EXISTS "uuid-ossp";CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role',current_setting('request.jwt.claim.role',true))$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid(),auth.role(),auth.jwt() TO anon,authenticated,service_role;`);
 if(process.env.HASHIBOT_REHEARSAL_PUBLIC_DEFAULTS==='true'){sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');report.publicFunctionDefaults='EXPLICIT_HOSTED_STYLE_ROLE_GRANTS';}
 docker(['run','-d','--name',auth,'--network',network,'-e','NO_PROXY=localhost,127.0.0.1,database','-e','no_proxy=localhost,127.0.0.1,database','-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_SITE_URL=http://localhost:9999','-e','GOTRUE_DB_DRIVER=postgres','-e','GOTRUE_DB_DATABASE_URL=postgres://postgres@database:5432/postgres?search_path=auth','-e','GOTRUE_DB_NAMESPACE=auth','-e',`GOTRUE_JWT_SECRET=${randomBytes(32).toString('hex')}`,'-e','GOTRUE_DISABLE_SIGNUP=true','-e','GOTRUE_LOG_LEVEL=error','ghcr.io/supabase/gotrue:v2.197.0']);
 let authReady=false;for(let i=0;i<120;i++){try{docker(['exec',auth,'wget','-Y','off','-qO-','http://127.0.0.1:9999/health']);authReady=true;break;}catch{}if(docker(['inspect',auth,'--format','{{.State.Running}}']).trim()!=='true')break;await new Promise(r=>setTimeout(r,250));}if(!authReady)throw Error('REAL_AUTH_PLATFORM_MIGRATIONS_FAILED');
 // Auth DDL is complete; remove the now-unused owned service before SQL to limit VFS peak disk.
 docker(['rm','-f','-v',auth]);report.authBootstrap='REAL_GOTRUE_MIGRATIONS_COMPLETED';
 const result=spawnSync('node',['tests/phaseP/migration-rehearsal.mjs',name,...(compatibilityId?[compatibilityId]:[])],{encoding:'utf8'});
 writeFileSync(`work/phase-p/offline/${suffix}.log`,result.stdout+result.stderr);
 const last=[...result.stdout.split('\n'),...result.stderr.split('\n')].filter(x=>x.startsWith('{')).map(x=>{try{return JSON.parse(x);}catch{return null;}}).filter(Boolean).at(-1);
 Object.assign(report,last??{status:'BLOCKED',error:'REHEARSAL_PROCESS_FAILED'});
 if(result.status===0){const invariants=spawnSync('node',['tests/phaseP/database.mjs',name],{encoding:'utf8'});writeFileSync('work/phase-p/offline/full-chain-invariants.log',invariants.stdout+invariants.stderr);report.fullChainInvariants=invariants.status===0?'PASSED_REAL_POSTGRESQL':'BLOCKED';if(invariants.status!==0){report.migrationChainStatus=report.status;report.status='BLOCKED';report.error='FULL_CHAIN_DATABASE_INVARIANTS_FAILED: see full-chain-invariants.log';}}
 if(report.status==='PASSED'){report.upgradeDataPreflight=sql(readFileSync('docs/phase-p/upgrade-data-preflight.sql','utf8')).trim().split('\n');}
 // A read-only catalog reference is useful even for a failed prefix, but must
 // never be accepted as a completed full-chain reference by the planner.
 const snapshot=spawnSync('node',['scripts/phase-p/inspect-deployment.mjs','--local-container',name,'--output',`work/phase-p/offline/${suffix}-catalog.json`],{encoding:'utf8'});
 if(snapshot.status!==0)report.catalogInspection='BLOCKED';else{report.catalogInspection='PASSED';report.schemaFingerprint=JSON.parse(readFileSync(`work/phase-p/offline/${suffix}-catalog.json`,'utf8')).schemaFingerprint;}
 process.exitCode=result.status===0&&report.status==='PASSED'?0:1;
}catch(error){report.status='BLOCKED';report.error=String(error.stderr??error.message);try{const logs=spawnSync('docker',['--host=unix:///var/run/docker.sock','logs',auth],{encoding:'utf8'});writeFileSync('work/phase-p/offline/auth-platform.log',(logs.stdout??'')+(logs.stderr??''));report.authState=docker(['inspect',auth,'--format','{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}']).trim();}catch{}process.exitCode=1;}
finally{
 for(const container of [auth,name])try{docker(['rm','-f','-v',container]);}catch{}
 try{docker(['network','rm',network]);}catch{}
 writeFileSync(`work/phase-p/offline/${suffix}-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
