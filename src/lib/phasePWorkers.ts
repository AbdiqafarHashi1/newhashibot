import {supabase} from './supabase';
export async function phasePWorkerOperation(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke('phase-p-workers',{body});
  if(error)throw error;if(data?.error)throw Error(data.error);return data;
}
export function submitPortableValidation(kind:'REPLAY'|'ACCOUNT'|'PROP',input:Record<string,unknown>){
  return phasePWorkerOperation({action:'submit',kind,idempotencyKey:crypto.randomUUID(),...input});
}
