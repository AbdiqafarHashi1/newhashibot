import{supabase}from'./supabase';
export async function phaseOAction(action:string,payload:Record<string,unknown>={}){const{data,error}=await supabase.functions.invoke('phase-o-agents',{body:{action,...payload}});if(error)throw error;if(data?.state==='BLOCKED'||data?.error)throw Error(data.error);return data}
