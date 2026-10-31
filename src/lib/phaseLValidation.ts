import { isOwnerPreview } from './ownerPreview/state';
import { previewFunction } from './ownerPreview/adapter';
import {supabase,supabaseClientConfig} from './supabase';
import {registerHistoricalDataset} from './historicalData/registerDataset';
export interface ValidationRun {id:string;mode:'REPLAY'|'SHADOW';status:string;dataset_id:string;dataset_hash:string;configuration_hash:string;max_cycles:number;progress_completed:number;exclusion_count:number;started_at?:string;finished_at?:string;failure_code?:string}
async function call(body:Record<string,unknown>){if(isOwnerPreview())return previewFunction('phase-l-validation',body);const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('AUTHENTICATION_REQUIRED');const response=await fetch(`${supabaseClientConfig.supabaseUrl}/functions/v1/phase-l-validation`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:supabaseClientConfig.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)}),json=await response.json();if(!response.ok)throw new Error(json.error||'VALIDATION_REQUEST_FAILED');return json}
export const listValidationRuns=async()=>((await call({action:'list'})).runs??[]) as ValidationRun[];
export const startValidationRun=(input:{datasetId:string;mode:'REPLAY'|'SHADOW';symbol:string;timeframe:string;start:string;end:string;maxCycles:number;maxRequests:number;assumptions:Record<string,unknown>})=>call({action:'start',...input});
export const cancelValidationRun=(runId:string)=>call({action:'cancel',runId});

export async function uploadValidationDataset(dataset:{metadata:Record<string,unknown>;bars:unknown[]}){
 return registerHistoricalDataset(dataset,call);
}
export const getValidationRunDetails=(runId:string)=>call({action:'details',runId});
export interface ValidationDataset {id:string;source:string;status:'READY'|'PARTIAL';symbol:string;timeframe:string;starts_at:string;ends_at:string;row_count:number;dataset_hash:string;coverage:Record<string,unknown>;provenance:string}
export const listValidationDatasets=async()=>((await call({action:'datasets'})).datasets??[]) as ValidationDataset[];
export const uploadResearchModel=(model:Record<string,unknown>)=>call({action:'register_research_model',model});
