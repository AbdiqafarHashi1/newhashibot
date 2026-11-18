import type {CanonicalReplayCheckpoint,CanonicalReplayEvidence} from './canonical-historical-replay.ts';
import type {HistoricalStoreSnapshot,HistoricalLifecycleEvent} from './historical-conditional-store.ts';
import type {PortableJob} from './phase-p-contract.ts';
interface Result<T>{data:T|null;error:{message:string}|null;}
interface Query<T> extends PromiseLike<Result<T[]>> {eq:(key:string,value:unknown)=>Query<T>;order:(key:string)=>Query<T>;range:(a:number,b:number)=>Query<T>;}
export interface HistoricalJournalDatabase {
 from:(table:string)=>{select:<T=Record<string,unknown>>(columns:string)=>Query<T>};
 rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result<unknown>>;
}
/** Concrete worker persistence adapter. Only changed states/new events are written per historical tick.
 * The RPC fences the current lease and commits states, journal, evidence and cursor in one transaction. */
export class HistoricalReplayJournal {
 private prior:HistoricalStoreSnapshot={schema:'historical-conditional-store/v1',records:[],events:[],rejections:[]};
 constructor(private db:HistoricalJournalDatabase,private job:PortableJob){}
 private async rows<T>(table:string,columns:string,filter:string,id:string,order:string,max:number){
  const result:T[]=[];
  for(let offset=0;offset<=max;offset+=500){const r=await this.db.from(table).select<T>(columns).eq(filter,id).order(order).range(offset,offset+499);if(r.error)throw Error('HISTORICAL_JOURNAL_READ_FAILED:'+r.error.message);result.push(...(r.data??[]));if(result.length>max)throw Error('HISTORICAL_JOURNAL_READ_LIMIT');if(!r.data||r.data.length<500)return result;}
  throw Error('HISTORICAL_JOURNAL_READ_LIMIT');
 }
 async load():Promise<CanonicalReplayCheckpoint|undefined>{
  const fence=await this.db.rpc('heartbeat_phase_p_job',{p_id:this.job.id,p_token:this.job.lease_token});if(fence.error)throw Error(fence.error.message);
  const cursor=Number(this.job.checkpoint.cursor??0),header=this.job.checkpoint.canonical;
  if(!cursor)return undefined;
  if(!header||header.schema!=='canonical-historical-replay/v1'||!Number.isInteger(cursor)||cursor<1||!Number.isFinite(header.through))throw Error('HISTORICAL_JOURNAL_CHECKPOINT_INVALID');
  const [records,events,cycles]=await Promise.all([
   this.rows<{state:HistoricalStoreSnapshot['records'][number]['state'];created_clock:number;updated_clock:number}>('historical_replay_states','state,created_clock,updated_clock','job_id',this.job.id,'setup_id',10000),
   this.rows<{payload:HistoricalLifecycleEvent}>('historical_replay_events','payload','job_id',this.job.id,'sequence',50000),
   this.rows<{arbitration:{rejections?:HistoricalStoreSnapshot['rejections']}}>('validation_cycles','arbitration','run_id',this.job.run_id,'candle_close_time',10000)
  ]);
  this.prior={schema:'historical-conditional-store/v1',records:records.map(r=>({state:r.state,createdAt:Number(r.created_clock),updatedAt:Number(r.updated_clock)})),events:events.map(e=>e.payload),rejections:cycles.flatMap(c=>c.arbitration.rejections??[])};
  return {schema:'canonical-historical-replay/v1',lineage:header.lineage,cursor,through:header.through,store:structuredClone(this.prior)};
 }
 async commit(evidence:CanonicalReplayEvidence,checkpoint:CanonicalReplayCheckpoint){
  const versions=new Map(this.prior.records.map(r=>[r.state.id,r.state.version]));
  const states=checkpoint.store.records.filter(r=>r.state.version!==(versions.get(r.state.id)??0));
  const tick={cursor:checkpoint.cursor,lineage:checkpoint.lineage,through:evidence.at,states,events:checkpoint.store.events.slice(this.prior.events.length),observations:evidence.observations,health:evidence.health,rejections:checkpoint.store.rejections.slice(this.prior.rejections.length)};
  const result=await this.db.rpc('checkpoint_historical_replay',{p_job:this.job.id,p_token:this.job.lease_token,p_tick:tick});if(result.error)throw Error(result.error.message);
  this.prior=structuredClone(checkpoint.store);
  this.job.checkpoint={cursor:checkpoint.cursor,canonical:{schema:checkpoint.schema,lineage:checkpoint.lineage,through:checkpoint.through}};
 }
}
