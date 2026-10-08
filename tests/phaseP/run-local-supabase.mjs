import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const prefix=`hashibot-phase-p-connected-${process.pid}`,network=`${prefix}-network`,auth=`${prefix}-auth`,rest=`${prefix}-rest`,client=`${prefix}-client`,chain=`hashibot-phase-p-chain-${process.pid}`;
const docker=(args,input)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=(name,input)=>docker(['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],input);
const secret=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
const jwt=role=>{const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({role,iss:'supabase',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${head}.${payload}.${createHmac('sha256',secret).update(`${head}.${payload}`).digest('base64url')}`;};
async function ready(name){for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);return;}catch{await new Promise(r=>setTimeout(r,200));}}throw Error('LOCAL_POSTGRES_START_FAILED');}
try{
 docker(['image','inspect','hashibot-portable-worker:local']);
 docker(['network','create','--internal',network]);
 docker(['run','-d','--name',prefix,'--network',network,'--network-alias','database','-e',`POSTGRES_PASSWORD=${password}`,'postgres:16-alpine']);await ready(prefix);
 sql(prefix,`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${password}';GRANT anon,authenticated,service_role TO authenticator;CREATE SCHEMA auth;CREATE EXTENSION IF NOT EXISTS pgcrypto;CREATE EXTENSION IF NOT EXISTS "uuid-ossp";CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'role'$$;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO anon,authenticated,service_role;`);
 docker(['run','-d','--name',auth,'--network',network,'--network-alias','auth','-e','NO_PROXY=localhost,127.0.0.1,database','-e','no_proxy=localhost,127.0.0.1,database','-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999','-e','API_EXTERNAL_URL=http://localhost:55321','-e','GOTRUE_SITE_URL=http://localhost:55321','-e','GOTRUE_DB_DRIVER=postgres','-e',`GOTRUE_DB_DATABASE_URL=postgres://postgres:${password}@database:5432/postgres?search_path=auth`,'-e','GOTRUE_DB_NAMESPACE=auth','-e',`GOTRUE_JWT_SECRET=${secret}`,'-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_AUD=authenticated','-e','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','-e','GOTRUE_DISABLE_SIGNUP=true','-e','GOTRUE_MAILER_AUTOCONFIRM=true','-e','GOTRUE_LOG_LEVEL=error','ghcr.io/supabase/gotrue:v2.197.0']);
 let authReady=false;for(let i=0;i<80;i++){try{docker(['exec',auth,'wget','-Y','off','-qO-','http://127.0.0.1:9999/health']);authReady=true;break;}catch{}await new Promise(r=>setTimeout(r,250));}if(!authReady){writeFileSync('work/phase-p/repair/local-auth-start-failure.log',docker(['logs',auth]));throw Error('LOCAL_AUTH_START_FAILED');}
 // Separate fresh DB gets real GoTrue auth DDL, followed by the exact unchanged migration chain.
 const authSchema=docker(['exec',prefix,'pg_dump','-U','postgres','-s','-n','auth']);
 docker(['run','-d','--name',chain,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);await ready(chain);
 sql(chain,'CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE EXTENSION IF NOT EXISTS pgcrypto;CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');sql(chain,authSchema);
 const rehearsal=spawn('node',['tests/phaseP/migration-rehearsal.mjs',chain],{stdio:['ignore','pipe','pipe']});let rehearsalLog='';rehearsal.stdout.on('data',d=>rehearsalLog+=d);rehearsal.stderr.on('data',d=>rehearsalLog+=d);const rehearsalCode=await new Promise(r=>rehearsal.on('exit',r));writeFileSync('work/phase-p/repair/full-migration-rehearsal.log',rehearsalLog);console.log(`Full migration rehearsal exit: ${rehearsalCode}`);console.log(rehearsalLog.trim());
 docker(['run','-d','--name',rest,'--network',network,'--network-alias','rest','-e',`PGRST_DB_URI=postgres://authenticator:${password}@database:5432/postgres`,'-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'-e','PGRST_LOG_LEVEL=error','ghcr.io/supabase/postgrest:v16.4']);
 const dockerBinary=execFileSync('which',['docker'],{encoding:'utf8'}).trim();
 docker(['run','-d','--name',client,'--network',network,'--user','0:0','--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock','--mount',`type=bind,src=${dockerBinary},dst=/usr/local/bin/docker,readonly`,'hashibot-portable-worker:local','node','-e','setInterval(()=>{},1000)']);
 docker(['exec',client,'node','-e',"for(const p of ['cloud/worker','src/lib','supabase/functions/_shared','supabase/migrations','tests/phaseP','work/phase-p/repair'])require('node:fs').mkdirSync('/app/'+p,{recursive:true});"]);
 for(const path of ['cloud/worker','src/lib','supabase/functions/_shared','supabase/migrations','tests/phaseP'])docker(['cp',path+'/.',client+':/app/'+path]);
 docker(['cp','package.json',client+':/app/package.json']);
 const configPath='work/phase-p/repair/local-connected-config.json';writeFileSync(configPath,JSON.stringify({API_URL:'http://127.0.0.1:55321',ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role'),databaseContainer:prefix}),{mode:0o600});
 docker(['cp',configPath,client+':/app/'+configPath]);
 const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec',client,'node','--import','tsx','tests/phaseP/local-supabase.ts',configPath],{stdio:'inherit'});const code=await new Promise(r=>child.on('exit',r));if(code)process.exitCode=code;
}finally{
 for(const name of [client,rest,auth,prefix,chain])try{docker(['rm','-f',name]);}catch{}
 try{docker(['network','rm',network]);}catch{}
}
