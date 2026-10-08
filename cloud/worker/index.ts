import {createClient} from '@supabase/supabase-js';
import {createServer} from 'node:http';
import {createHandlers} from './handlers.ts';
import {SupabaseWorkerStore} from './store.ts';
import {runSlice} from './runtime.ts';
import {LIMITS} from '../../supabase/functions/_shared/phase-p-contract.ts';
const mode=process.env.HASHIBOT_WORKER_MODE??'check',revision=process.env.HASHIBOT_REVISION??'local';
function configuration(){
  if(!['check','once','health'].includes(mode))throw Error('WORKER_MODE_INVALID');
  if(['LIVE_EXECUTION_ENABLED','PRODUCTION_EXECUTION_ENABLED','PHASE_O_AI_ENABLED','DELIVERY_ENABLED','DEMO_DISPATCH_ENABLED','SCHEDULES_ENABLED'].some(k=>process.env[k]&&process.env[k]!=='false'))throw Error('SIDE_EFFECTS_MUST_BE_DISABLED');
  if(mode==='once'&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.HASHIBOT_WORKER_ENABLED!=='true'))throw Error('WORKER_NOT_CONFIGURED_OR_ENABLED');
  if(process.env.SUPABASE_URL){const url=new URL(process.env.SUPABASE_URL);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('SUPABASE_TLS_REQUIRED');}
}
configuration();
const health={status:'READY',mode,revision,limits:LIMITS,liveExecution:false,delivery:false,scanner:'RETAINED_ON_SUPABASE'};
if(mode==='check'){console.log(JSON.stringify(health));}
else if(mode==='health'){
  // Diagnostic mode never consumes work. Cloud Run Jobs use mode=once.
  const server=createServer((req,res)=>{res.writeHead(req.url==='/health'?200:404,{'content-type':'application/json'});res.end(JSON.stringify(health));});
  server.listen(Number(process.env.PORT??8080),'0.0.0.0');
  process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
}else{
  const controller=new AbortController();process.on('SIGTERM',()=>controller.abort('SHUTDOWN'));process.on('SIGINT',()=>controller.abort('SHUTDOWN'));
  const fetcher:typeof fetch=async(url,options)=>{
    const timeout=AbortSignal.timeout(10000),signal=options?.signal?AbortSignal.any([options.signal,timeout]):timeout;
    return fetch(url,{...options,signal});
  };
  const db=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false},global:{fetch:fetcher}});
  const result=await runSlice({store:new SupabaseWorkerStore(db),handlers:createHandlers(db,fetcher),host:process.env.CLOUD_RUN_JOB??'local-worker',revision,signal:controller.signal});
  console.log(JSON.stringify(result));
  if(['RETRY','DEAD_LETTER'].includes(result.state))process.exitCode=1;
}
