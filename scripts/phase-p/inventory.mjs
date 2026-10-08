import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const source=process.argv[2]??'.',sourceRef=process.argv[3]??'WORKING_TREE',output=process.argv[4]??'docs/phase-p/main-inventory.json';
const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(path,x.name)):[join(path,x.name)]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const files=walk(join(source,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
const migrations=files.map(path=>{const sql=readFileSync(path,'utf8'),name=relative(source,path),match=/\/(\d+)_/.exec(name);return {path:name,version:match?.[1]??null,sha256:hash(sql),automaticCandidate:!!match&&!name.includes('/prepared/'),remoteApplied:'UNKNOWN_NOT_RECONCILED'};});
const versions=new Map();for(const m of migrations.filter(m=>m.automaticCandidate)){const list=versions.get(m.version)??[];list.push(m.path);versions.set(m.version,list);}
const timestampCollisions=[...versions].filter(([,v])=>v.length>1).map(([version,paths])=>({version,paths}));
const cronDefinitions=[];for(const path of files){const lines=readFileSync(path,'utf8').split('\n');lines.forEach((line,i)=>{if(/cron\.(schedule|schedule_in_database|unschedule)|cron\.job|pg_cron/i.test(line))cronDefinitions.push({path:relative(source,path),line:i+1,operation:(line.match(/cron\.[a-z_]+|pg_cron/i)??[])[0]??'CRON_REFERENCE',lineSha256:hash(line)});});}
const config=readFileSync(join(source,'supabase/config.toml'),'utf8');
const functions=readdirSync(join(source,'supabase/functions'),{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name!=='_shared').flatMap(x=>{let code;try{code=readFileSync(join(source,'supabase/functions',x.name,'index.ts'),'utf8');}catch{return [];}const section=new RegExp(`\\[functions\\.${x.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(config);return [{name:x.name,path:`supabase/functions/${x.name}/index.ts`,sha256:hash(code),configured:!!section,verifyJwt:section?/verify_jwt\s*=\s*true/.test(section[1]):'DEFAULT',remoteDeployed:'UNKNOWN_NOT_RECONCILED'}];});
const dependencyReview={newPhasePVersion:'20261013120000',latestMainVersion:migrations.filter(m=>m.automaticCandidate).map(m=>m.version).sort().at(-1)??null,phasePPrerequisites:['Phase H portable_jobs/account identity','Phase L dataset/run/outcome/cash-flow tables','Phase M simulation tables and atomic evidence/completion RPCs'],preparedFiles:'Not automatic migrations; individual review required',remotePendingSet:'UNKNOWN_NOT_RECONCILED'};
const result={dependencyReview,sourceRef,generatedAt:new Date().toISOString(),remoteReconciliation:'NOT_RUN',migrationStatus:'Repository inventory only. Pending set is UNKNOWN until compared with online history.',migrations,timestampCollisions,functions,cronDefinitions};
mkdirSync(join(output,'..'),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({migrations:migrations.length,automatic:migrations.filter(m=>m.automaticCandidate).length,collisions:timestampCollisions.length,functions:functions.length,cronReferences:cronDefinitions.length}));
