import {supabase,supabaseClientConfig} from './supabase';
export interface ValidationRun {id:string;mode:'REPLAY'|'SHADOW';status:string;dataset_id:string;dataset_hash:string;configuration_hash:string;max_cycles:number;progress_completed:number;exclusion_count:number;started_at?:string;finished_at?:string;failure_code?:string}
async function call(body:Record<string,unknown>){const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('AUTHENTICATION_REQUIRED');const response=await fetch(`${supabaseClientConfig.supabaseUrl}/functions/v1/phase-l-validation`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:supabaseClientConfig.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)}),json=await response.json();if(!response.ok)throw new Error(json.error||'VALIDATION_REQUEST_FAILED');return json}
export const listValidationRuns=async()=>((await call({action:'list'})).runs??[]) as ValidationRun[];
export const startValidationRun=(input:{datasetId:string;mode:'REPLAY'|'SHADOW';symbol:string;timeframe:string;start:string;end:string;maxCycles:number;maxRequests:number})=>call({action:'start',...input});
export const cancelValidationRun=(runId:string)=>call({action:'cancel',runId});

export const uploadValidationDataset=(dataset:{metadata:Record<string,unknown>;bars:unknown[]})=>call({action:'upload_dataset',metadata:dataset.metadata,bars:dataset.bars});
export const getValidationRunDetails=(runId:string)=>call({action:'details',runId});
