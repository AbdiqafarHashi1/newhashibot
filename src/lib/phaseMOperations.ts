import {supabase,supabaseClientConfig} from './supabase';
async function call(functionName:string,body:Record<string,unknown>){const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('AUTHENTICATION_REQUIRED');const response=await fetch(`${supabaseClientConfig.supabaseUrl}/functions/v1/${functionName}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:supabaseClientConfig.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)}),json=await response.json();if(!response.ok)throw new Error(json.error??'PHASE_M_REQUEST_FAILED');return json}
export const shadowOperation=(body:Record<string,unknown>)=>call('phase-m-shadow',body);
export const simulationOperation=(body:Record<string,unknown>)=>call('phase-m-validation',body);
export const reportingOperation=(body:Record<string,unknown>)=>call('canonical-reporting-worker',body);
