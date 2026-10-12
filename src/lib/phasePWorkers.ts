import {isOwnerPreview} from './ownerPreview/state';
import {previewFunction} from './ownerPreview/adapter';
import {supabase} from './supabase';
import {PortableSubmissionAttempts} from './portableSubmissionAttempt';
import type {PortableKind} from '../../supabase/functions/_shared/phase-p-contract';
let attempts:PortableSubmissionAttempts|undefined;
export async function phasePWorkerOperation(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke('phase-p-workers',{body});
  if(error)throw error;if(data?.error)throw Error(data.error);return data;
}
export async function submitPortableValidation(kind:PortableKind,input:Record<string,unknown>,newRun=false){
  if(isOwnerPreview())return previewFunction('phase-p-workers',{action:'submit',kind,...input});
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)throw Error('AUTHENTICATION_REQUIRED');
  attempts??=new PortableSubmissionAttempts(localStorage);
  return attempts.submit(user.id,kind,input,async idempotencyKey=>{
    const {data:{user:current},error}=await supabase.auth.getUser();
    if(error||current?.id!==user.id)throw Error('ACCOUNT_CHANGED_DURING_SUBMISSION');
    return phasePWorkerOperation({action:'submit',kind,idempotencyKey,...input});
  },newRun);
}
