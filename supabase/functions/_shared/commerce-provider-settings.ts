export const COMMERCE_FIELDS={
 WHOP:['WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_WEBHOOK_SECRET','WHOP_VIP_PLAN_ID','WHOP_EXECUTION_PLAN_ID','WHOP_ENVIRONMENT'],
 MPESA:['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_SHORT_CODE','DARAJA_PASSKEY','DARAJA_CALLBACK_URL','DARAJA_ENVIRONMENT','DARAJA_TRANSACTION_TYPE','DARAJA_PARTY_B','MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL','MPESA_ENVIRONMENT','MPESA_TRANSACTION_TYPE','MPESA_PARTY_B']
} as const;
export type CommerceProvider=keyof typeof COMMERCE_FIELDS;
const secret=(key:string)=>/API_KEY|WEBHOOK_SECRET|CONSUMER_KEY|CONSUMER_SECRET|PASSKEY/.test(key);
export function redactCommerceSettings(provider:CommerceProvider,values:Record<string,string>){return Object.fromEntries(COMMERCE_FIELDS[provider].map(key=>[key,secret(key)?{present:Boolean(values[key])}:{value:values[key]??''}]))}
/** Explicit server-held configuration overrides legacy environment settings; unrelated runtime secrets are inaccessible. */
export async function commerceEnvironment(db:any,fallback:(key:string)=>string|undefined){
 const values:Record<string,string>={},configured=new Set<string>();
 for(const provider of ['WHOP','MPESA'] as const){const {data,error}=await db.rpc('load_commerce_provider_configuration',{p_provider:provider});if(error)throw Error('COMMERCE_CONFIGURATION_UNAVAILABLE');if(data){configured.add(provider);for(const key of COMMERCE_FIELDS[provider])if(typeof data[key]==='string')values[key]=data[key]}}
 return (key:string)=>{const provider=(Object.keys(COMMERCE_FIELDS) as CommerceProvider[]).find(p=>(COMMERCE_FIELDS[p] as readonly string[]).includes(key));return provider&&configured.has(provider)?(values[key]||undefined):fallback(key)};
}
