import {LIMITS,WorkerFault,type PortableKind} from './phase-p-contract.ts';
/** Export the same native evidence consumed by the retained Phase-M inspector. */
export async function portableDetails(db:any,actor:string,kind:PortableKind,runId:string){
 const table=kind==='HISTORY'?'validation_datasets':kind==='REPLAY'?'validation_runs':'validation_simulation_runs';
 const {data:run,error}=await db.from(table).select('*').eq('id',runId).eq('created_by',actor).maybeSingle();
 if(error)throw new WorkerFault('EVIDENCE_STORE_UNAVAILABLE');if(!run)throw new WorkerFault('RUN_NOT_FOUND',true);
 const read=async(name:string,key:string,order:string,max:number)=>{const rows:any[]=[];for(let from=0;from<=max;from+=100){const {data,error}=await db.from(name).select('*').eq(key,runId).order(order).range(from,from+99);if(error)throw new WorkerFault('EVIDENCE_STORE_UNAVAILABLE');rows.push(...(data??[]));if(rows.length>max)throw new WorkerFault('EVIDENCE_LIMIT_EXCEEDED',true);if((data??[]).length<100)return rows;}return rows;};
 const evidence=kind==='HISTORY'?await read('validation_dataset_candles','dataset_id','open_time',LIMITS.candles):kind==='REPLAY'?await read('validation_cycles','run_id','candle_close_time',LIMITS.cycles):await read('validation_simulation_evidence','run_id','sequence',LIMITS.cycles);
 const outcomes=kind==='REPLAY'?await read('validation_outcomes','run_id','entry_time',LIMITS.cycles):[];
 return {run,evidence,outcomes,table};
}
