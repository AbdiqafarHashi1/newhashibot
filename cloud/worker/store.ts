import {WorkerFault,type PortableJob} from '../../supabase/functions/_shared/phase-p-contract.ts';
import type {WorkerStore} from './runtime.ts';
/** Same concrete PostgreSQL RPC adapter in local execution and the container. */
export class SupabaseWorkerStore implements WorkerStore {
  constructor(readonly db:any){}
  async rpc(name:string,args:Record<string,unknown>){
    const {data,error}=await this.db.rpc(name,args);
    if(error){const code=['LEASE_LOST','JOB_CANCELLED','AUTHORIZATION_REVOKED','QUOTA_EXCEEDED','SOURCE_NOT_CURRENT','EVIDENCE_CONFLICT'].find(c=>String(error.message).includes(c));throw new WorkerFault(code??'STORE_UNAVAILABLE',code==='AUTHORIZATION_REVOKED'||code==='SOURCE_NOT_CURRENT'||code==='EVIDENCE_CONFLICT');}
    return data;
  }
  async claim(host:string,revision:string){const rows=await this.rpc('claim_phase_p_job',{p_host:host,p_revision:revision});return rows?.[0]??null;}
  async heartbeat(job:PortableJob){await this.rpc('heartbeat_phase_p_job',{p_id:job.id,p_token:job.lease_token});}
  async checkpoint(job:PortableJob,checkpoint:Record<string,any>,rows:unknown[]){await this.rpc('checkpoint_phase_p_job',{p_id:job.id,p_token:job.lease_token,p_checkpoint:checkpoint,p_rows:rows});job.checkpoint=checkpoint;}
  async finish(job:PortableJob,state:'COMPLETED'|'YIELD'|'RETRY'|'DEAD_LETTER',summary:unknown,reason:string|null){await this.rpc('finish_phase_p_job',{p_id:job.id,p_token:job.lease_token,p_state:state,p_summary:summary,p_reason:reason});}
}
