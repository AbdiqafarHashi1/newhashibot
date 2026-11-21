import {buildManifest,closure} from './phase-p/deployment-manifest.mjs';
import {releaseSchedules,release1Schedules} from '../supabase/functions/_shared/release-schedules.ts';
const manifest=buildManifest();
const all=[...release1Schedules,...releaseSchedules.filter(j=>!release1Schedules.some(r=>r.name===j.name))];
let failures=0;
function check(ok:boolean,label:string){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++;}
check(manifest.timestampCollisions.length===0,'unique migration identities');
for(const fn of manifest.functions)check(closure('.',fn.path).missing.length===0,`function import closure: ${fn.name}`);
for(const job of all){
 check(manifest.functions.some(f=>f.name===job.endpoint),`schedule endpoint: ${job.name}`);
 check(manifest.functions.find(f=>f.name===job.endpoint)?.verifyJwt===false,`custom worker auth reaches handler: ${job.name}`);
}
const monthly=(jobs:typeof all)=>jobs.reduce((n,j)=>n+(j.schedule==='* * * * *'?43200:8640),0);
console.log(JSON.stringify({days:30,scheduledHttpCalls:{release1:monthly([...release1Schedules]),allServices:monthly(all)},excludes:['nested function calls','webhooks','manual requests','retries','provider API calls'],note:'Invocation estimate, not a quota guarantee. Enable only needed workers; monitor actual usage.',remoteState:'NOT_VERIFIED'},null,2));
if(failures)process.exitCode=1;
