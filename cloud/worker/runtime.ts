import {LIMITS,WorkerFault,type PortableJob,type PortableKind} from '../../supabase/functions/_shared/phase-p-contract.ts';
export interface WorkerStore {
  claim(host:string,revision:string):Promise<PortableJob|null>;
  heartbeat(job:PortableJob):Promise<void>;
  checkpoint(job:PortableJob,checkpoint:Record<string,unknown>,rows:unknown[]):Promise<void>;
  finish(job:PortableJob,state:'COMPLETED'|'YIELD'|'RETRY'|'DEAD_LETTER',summary:unknown,reason:string|null):Promise<void>;
}
export interface TaskContext {job:PortableJob;signal:AbortSignal;store:WorkerStore;check():Promise<void>;remainingMs():number;}
export type TaskHandler=(context:TaskContext)=>Promise<{done:boolean;summary:unknown}>;
export async function runSlice(input:{store:WorkerStore;handlers:Record<PortableKind,TaskHandler>;host:string;revision:string;signal?:AbortSignal;runtimeMs?:number}){
  const job=await input.store.claim(input.host,input.revision);
  if(!job)return {state:'IDLE'};
  const runtimeMs=input.runtimeMs??LIMITS.runtimeMs;
  if(runtimeMs<100||runtimeMs>LIMITS.runtimeMs)throw new WorkerFault('RUNTIME_LIMIT_INVALID',true);
  const controller=new AbortController(),deadline=Date.now()+runtimeMs;
  const abort=()=>controller.abort(input.signal?.reason);
  input.signal?.addEventListener('abort',abort,{once:true});
  if(input.signal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort('SLICE_TIMEOUT'),runtimeMs);
  try {
    const check=async()=>{if(controller.signal.aborted||Date.now()>=deadline)throw new WorkerFault('SLICE_INTERRUPTED');await input.store.heartbeat(job);};
    await check();
    const result=await input.handlers[job.kind]({job,signal:controller.signal,store:input.store,check,remainingMs:()=>deadline-Date.now()});
    if(controller.signal.aborted||Date.now()>=deadline)throw new WorkerFault('SLICE_INTERRUPTED');
    await input.store.finish(job,result.done?'COMPLETED':'YIELD',result.summary,null);
    return {id:job.id,state:result.done?'COMPLETED':'YIELD'};
  }catch(error){
    const code=error instanceof WorkerFault?error.code:'WORKER_TASK_FAILED';
    if(['LEASE_LOST','JOB_CANCELLED','AUTHORIZATION_REVOKED'].includes(code))return {id:job.id,state:code};
    const permanent=error instanceof WorkerFault&&error.permanent;
    const state=code==='SLICE_INTERRUPTED'?'YIELD':permanent||job.attempt>=job.max_attempts?'DEAD_LETTER':'RETRY';
    try{await input.store.finish(job,state,{},code);}catch(finalizationError){
      const finalCode=finalizationError instanceof WorkerFault?finalizationError.code:'STORE_UNAVAILABLE';
      if(['LEASE_LOST','JOB_CANCELLED','AUTHORIZATION_REVOKED'].includes(finalCode))return {id:job.id,state:finalCode};
      throw finalizationError;
    }
    return {id:job.id,state,reason:code};
  }finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);}
}
