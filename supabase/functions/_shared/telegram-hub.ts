import {verifyAcquisitionDestination} from './acquisition-destinations.ts';
export const HUB_AUDIENCES=['FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN'] as const;
export type HubAudience=typeof HUB_AUDIENCES[number];
export const hubAudience=(value:unknown):HubAudience=>{if(!HUB_AUDIENCES.includes(value as HubAudience))throw Error('INVALID_TELEGRAM_AUDIENCE');return value as HubAudience;};
const envKey:Record<HubAudience,string>={FREE:'TELEGRAM_FREE_CHAT_ID',VIP_CRYPTO:'TELEGRAM_CHAT_ID',VIP_FOREX_GOLD:'TELEGRAM_FOREX_VIP_CHAT_ID',ADMIN:'TELEGRAM_ADMIN_CHAT_ID'};
/** Persisted Free/Admin mappings override legacy environment values; split VIP never falls back to a shared room. */
export async function resolveHubChat(db:any,audience:HubAudience,fallback=''){
 const {data,error}=await db.from('telegram_audience_configuration').select('chat_id,enabled,bot_permission_verified_at').eq('audience',audience).maybeSingle();
 if(error)throw Error('TELEGRAM_CHANNEL_LOOKUP_UNAVAILABLE');
 if(data?.chat_id)return data.enabled&&data.bot_permission_verified_at?String(data.chat_id):'';
 return audience==='FREE'||audience==='ADMIN'?fallback:'';
}
export async function telegramHubOverview(db:any,env:(key:string)=>string|undefined){
 const r=await db.from('telegram_audience_configuration').select('audience,chat_id,enabled,bot_permission_verified_at,join_mode,updated_at');if(r.error)throw Error('TELEGRAM_CONFIGURATION_UNAVAILABLE');
 const channels=HUB_AUDIENCES.map(audience=>{const row=(r.data??[]).find((x:any)=>x.audience===audience);const legacy=env(envKey[audience])??'';return{audience,chat_id:row?.chat_id??'',enabled:!!row?.enabled,verified_at:row?.bot_permission_verified_at??null,join_mode:row?.join_mode??'JOIN_REQUEST',legacy_hint:legacy,source:row?.chat_id?'DATABASE':legacy?'LEGACY_ENVIRONMENT':'UNCONFIGURED'};});
 const queries=[['scannerRuns','scanner_runs','id,started_at,status','started_at'],['intelligence','intelligence_events','event_id,event_type,status,created_at','created_at'],['audit','telegram_hub_audit','action,audience,actor_id,created_at,details','created_at'],['membership','telegram_memberships','audience,state,last_verified_at,safe_error,updated_at','updated_at']] as const;
 const health=await Promise.all(queries.map(async([name,table,cols,order])=>{const r=await db.from(table).select(cols).order(order,{ascending:false}).limit(10);return{name,state:r.error?'UNAVAILABLE':'LOADED',rows:r.error?[]:r.data??[]};}));
 return{channels,health,secrets:{bot:!!env('TELEGRAM_BOT_TOKEN'),webhook:!!env('TELEGRAM_WEBHOOK_SECRET'),membershipWorker:!!env('TELEGRAM_WORKER_SECRET'),agentWorker:!!env('PHASE_O_WORKER_SECRET'),ai:!!env('GEMINI_API_KEY')},observedAt:new Date().toISOString()};
}
export async function verifyHubChannel(db:any,env:(key:string)=>string|undefined,actor:string,audience:HubAudience){
 const {data,error}=await db.from('telegram_audience_configuration').select('chat_id').eq('audience',audience).maybeSingle();if(error||!data?.chat_id)throw Error('SAVE_CHANNEL_BEFORE_VERIFYING');
 if(audience==='ADMIN'&&/^[0-9]+$/.test(data.chat_id))throw Error('ADMIN_DM_REQUIRES_EXPLICIT_TEST');
 const verified=await verifyAcquisitionDestination(env('TELEGRAM_BOT_TOKEN')??'',data.chat_id,fetch,audience!=='ADMIN');
 const r=await db.rpc('verify_release1_telegram_channel',{p_actor:actor,p_audience:audience,p_expected:data.chat_id,p_verified:verified.chatId,p_at:verified.verifiedAt});if(r.error||r.data!==true)throw Error('CHANNEL_CHANGED_RELOAD_REQUIRED');return verified;
}
export async function sendHubTest(db:any,env:(key:string)=>string|undefined,audience:HubAudience,fetcher:typeof fetch=fetch){
 const fallback=env(envKey[audience])??'';let chat=await resolveHubChat(db,audience,fallback);if(!chat&&audience==='ADMIN'){const r=await db.from('telegram_audience_configuration').select('chat_id').eq('audience','ADMIN').maybeSingle();if(!r.error&&/^[0-9]+$/.test(r.data?.chat_id??''))chat=r.data.chat_id;}const token=env('TELEGRAM_BOT_TOKEN');if(!token||!chat)throw Error('VERIFIED_ENABLED_CHANNEL_REQUIRED');
 const r=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text:`HashiBot ${audience.replaceAll('_',' ')} connection test · ${new Date().toISOString()}`}),signal:AbortSignal.timeout(8000)});const p=await r.json().catch(()=>null);
 if(!r.ok||!p?.ok||!p.result?.message_id)throw Error('TELEGRAM_TEST_NOT_CONFIRMED');return{messageId:String(p.result.message_id),chatId:chat};
}
