import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {preparePortableSubmission} from '../_shared/phase-p-submission.ts';
import {LIMITS,WorkerFault} from '../_shared/phase-p-contract.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply({error:'WORKERS_NOT_CONFIGURED'},503);
  const db=createClient(url,key,{auth:{persistSession:false}}),token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');
  const {data:{user}}=await db.auth.getUser(token);
  if(!user)return reply({error:'AUTHENTICATION_REQUIRED'},401);
  const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(profile?.role!=='admin')return reply({error:'ADMIN_REQUIRED'},403);
  try{
    const text=await req.text();if(text.length>8192)return reply({error:'REQUEST_TOO_LARGE'},413);
    const body=JSON.parse(text),action=body.action;
    if(action==='inspect'){
      const results=await Promise.all([
        db.from('portable_jobs').select('id,kind,status,run_id,customer_id,execution_account_id,configuration_hash,lease_owner,worker_revision,heartbeat_at,lease_expires_at,checkpoint,attempt,max_attempts,slice_count,safe_error,available_at,created_at').eq('customer_id',user.id).in('kind',['HISTORY','REPLAY','ACCOUNT','PROP']).order('created_at',{ascending:false}).limit(50),
        db.from('phase_p_worker_control').select('*').single(),
        db.from('phase_p_worker_usage').select('*').eq('customer_id',user.id).order('day',{ascending:false}).limit(7)
      ]);
      if(results.some(r=>r.error))throw new WorkerFault('WORKER_INSPECTION_UNAVAILABLE');
      return reply({jobs:results[0].data,control:results[1].data,usage:results[2].data,limits:LIMITS,cost:{actualBilling:null,source:'NO_BILLING_EXPORT_CONFIGURED',estimatedUsage:'Claimed slices; includes retries and crash recovery'},scannerHost:'RETAINED_ON_SUPABASE',liveExecution:false});
    }
    if(action==='submit'){
      const {action:_action,...request}=body,args=await preparePortableSubmission(db,user.id,request);
      const {data,error}=await db.rpc('enqueue_phase_p_job',args);
      if(error)throw new WorkerFault(['NEW_WORK_STOPPED','QUOTA_EXCEEDED','IDEMPOTENCY_CONFLICT','ACCOUNT_UNAUTHORIZED'].find(x=>error.message.includes(x))??'JOB_SUBMISSION_FAILED');
      return reply({jobId:data.id,runId:data.run_id,status:data.status},202);
    }
    if(['stop','resume','cancel','retry'].includes(action)&&Object.keys(body).every(k=>['action','jobId'].includes(k))){
      const {error}=await db.rpc('control_phase_p_worker',{p_actor:user.id,p_action:action,p_id:body.jobId??null});
      if(error)throw new WorkerFault('WORKER_CONTROL_REJECTED');
      return reply({action,status:'ACCEPTED'});
    }
    return reply({error:'ACTION_NOT_ALLOWED'},400);
  }catch(e){return reply({error:e instanceof WorkerFault?e.code:'WORKER_REQUEST_FAILED'},409);}
});
