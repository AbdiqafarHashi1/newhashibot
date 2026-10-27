import {ALT_CANDIDATE_ID,ALT_SYMBOLS} from './crypto-relative-strength.ts';
import {preparePortableSubmission} from './phase-p-submission.ts';
import {portableDetails} from './phase-p-evidence.ts';
import {LIMITS,WorkerFault,PORTABLE_KINDS} from './phase-p-contract.ts';
import {loadApprovedValidationConfiguration} from './approved-validation-configuration.ts';
export const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
export async function handlePortableRequest(req:Request,db:any){
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');
  const {data:{user}}=await db.auth.getUser(token);
  if(!user)return reply({error:'AUTHENTICATION_REQUIRED'},401);
  const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(profile?.role!=='admin')return reply({error:'ADMIN_REQUIRED'},403);
  try{
    const text=await req.text();if(text.length>8192)return reply({error:'REQUEST_TOO_LARGE'},413);
    const body=JSON.parse(text),action=body.action;
    if(action==='strategies'&&Object.keys(body).length===1){let approved;try{approved=await loadApprovedValidationConfiguration(db)}catch{/* Research catalog remains readable without enabled production candidates. */}const {data:models,error}=await db.from('validation_research_models').select('id,strategy_id,valid_from,valid_until,provenance').eq('created_by',user.id).eq('publication_eligible',false).order('created_at',{ascending:false}).limit(200);if(error)throw new WorkerFault('RESEARCH_CATALOG_UNAVAILABLE');return reply({researchCandidates:[{id:ALT_CANDIDATE_ID,label:'Altcoin relative strength · research only',timeframe:'15m',reference:'BTCUSDT',symbols:[...ALT_SYMBOLS],costBps:25,warmupBars:960}],strategies:approved?.configuration.strategies.map((s:{id:string;version:string;timeframes:string[];symbols:string[]})=>({id:s.id,version:s.version,timeframes:s.timeframes,symbols:s.symbols}))??[],researchModels:models??[],configurationHash:approved?.hash??null});}
    if(action==='details'&&Object.keys(body).every(k=>['action','kind','runId'].includes(k))&&PORTABLE_KINDS.includes(body.kind))return reply(await portableDetails(db,user.id,body.kind,String(body.runId)));
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
}
