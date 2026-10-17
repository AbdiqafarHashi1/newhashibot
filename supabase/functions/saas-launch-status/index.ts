import {commerceEnvironment} from '../_shared/commerce-provider-settings.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {whopRuntimeConfig} from '../_shared/whop-runtime.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}}),token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');
 const {data:{user}}=await db.auth.getUser(token);if(!user)return reply({error:'AUTHENTICATION_REQUIRED'},401);
 const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(roleError||profile?.role!=='admin')return reply({error:'ADMIN_REQUIRED'},403);
 const requests=[
  ['scanner',()=>db.from('scanner_config').select('is_enabled,min_signal_grade').eq('id',1).maybeSingle()],
  ['telegram',()=>db.from('telegram_audience_configuration').select('audience,enabled,bot_permission_verified_at,join_mode')],
  ['prices',()=>db.from('commerce_product_prices').select('product_code,provider,currency,amount_minor,configured,fixed_period_days').eq('active',true)],
  ['releases',()=>db.from('strategy_release_candidates').select('id,strategy_id,promoted_at').eq('state','PROMOTED')],
  ['workers',()=>db.from('phase_p_worker_control').select('stop_new_work,daily_job_limit,daily_slice_limit').maybeSingle()],
  ['recentWorkerEvidence',()=>db.from('portable_jobs').select('kind,status,heartbeat_at,safe_error').order('created_at',{ascending:false}).limit(5)],
  ['accounts',()=>db.from('execution_accounts_safe').select('id,provider,environment,phase_h_certification_status,runtime_control,provider_health,last_synchronized_at').order('created_at',{ascending:false}).limit(20)]
 ] as const;
 const checks=await Promise.all(requests.map(async([name,query])=>{try{const {data,error}=await query();return {name,state:error?'UNAVAILABLE':'LOADED',data:error?null:data}}catch{return{name,state:'UNAVAILABLE',data:null}}}));
 const get=await commerceEnvironment(db,key=>Deno.env.get(key)),configured=(names:string[])=>names.every(n=>Boolean(get(n))),whop=whopRuntimeConfig(get);
 return reply({observedAt:new Date().toISOString(),checks,configuration:{whop:{credentialsPresent:Boolean(whop),vipPlanPresent:Boolean(whop?.planIds.VIP_SIGNALS),executionPlanPresent:Boolean(whop?.planIds.FOUNDING_AUTO_EXECUTION),environment:whop?.environment??'unconfigured'},mpesa:{credentialsPresent:configured(['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_SHORT_CODE','DARAJA_PASSKEY','DARAJA_CALLBACK_URL']),transactionType:get('DARAJA_TRANSACTION_TYPE')??'CustomerPayBillOnline',destinationPresent:Boolean(get('DARAJA_PARTY_B')),environment:get('DARAJA_ENVIRONMENT')??'sandbox'},telegram:{credentialsPresent:configured(['TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_WORKER_SECRET'])},customerCredentials:{vaultAdapter:Deno.env.get('PHASE_H_SECRET_ADAPTER')==='SUPABASE_VAULT',verificationEnabled:Deno.env.get('PHASE_H_PROVIDER_VERIFICATION')==='ENABLED'}},liveExecutionSupported:false,certification:'CONFIGURATION_AND_RECORDED_EVIDENCE_ONLY'});
});
