export class PhaseMRunStore{constructor(private db:any){}private async rpc(name:string,args:Record<string,unknown>){const {data,error}=await this.db.rpc(name,args);if(error)throw new Error(`${name}:${error.message}`);return data}
 appendValidation(runId:string,row:any){return this.rpc('append_validation_cycle_if_running',{p_run_id:runId,p_cycle_key:row.cycle_key,p_close:row.candle_close_time,p_strategy:row.strategy_results??[],p_arbitration:row.arbitration,p_exclusions:row.data_exclusions??[]})}
 completeValidation(runId:string,expected:number,summary:unknown){return this.rpc('complete_validation_run_if_current',{p_run_id:runId,p_expected:expected,p_summary:summary})}
 cancelValidation(runId:string){return this.rpc('cancel_validation_run',{p_run_id:runId})}
 appendSimulation(runId:string,sequence:number,evidence:unknown){return this.rpc('append_simulation_evidence_if_running',{p_run_id:runId,p_sequence:sequence,p_evidence:evidence})}
 completeSimulation(runId:string,expected:number,status:'COMPLETED'|'BLOCKED'|'INCOMPLETE',summary:unknown){return this.rpc('complete_simulation_run_if_current',{p_run_id:runId,p_expected:expected,p_status:status,p_summary:summary})}
 cancelSimulation(runId:string){return this.rpc('cancel_simulation_run',{p_run_id:runId})}
 async cancelled(table:'validation_runs'|'validation_simulation_runs',runId:string){const {data,error}=await this.db.from(table).select('status,cancellation_requested_at').eq('id',runId).maybeSingle();if(error)throw error;return !data||data.status==='CANCELLED'||Boolean(data.cancellation_requested_at)} }
