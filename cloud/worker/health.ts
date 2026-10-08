/** Read-only PostgREST schema probes. Does not claim jobs or invoke mutation RPCs. */
export async function databaseHealth(db?:{from:(table:string)=>{select:(fields:string)=>{limit:(n:number)=>PromiseLike<{error:unknown;data?:unknown[]}>}}}) {
  if(!db)return {status:'CONFIGURATION_ONLY',databaseReady:false};
  try {
    const results=await Promise.all([
      db.from('phase_p_worker_control').select('id,stop_new_work').limit(1),
      db.from('portable_jobs').select('id,kind,checkpoint,lease_token').limit(0),
      db.from('validation_runs').select('id,status,configuration_hash').limit(0),
      db.from('validation_simulation_evidence').select('run_id,sequence,evidence').limit(0),
    ]);
    if(results.some(r=>r.error)||results[0].data?.length!==1)return {status:'DATABASE_UNAVAILABLE',databaseReady:false};
    return {status:'DATABASE_READY',databaseReady:true};
  }catch{return {status:'DATABASE_UNAVAILABLE',databaseReady:false};}
}
