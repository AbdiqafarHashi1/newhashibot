import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const encode=(value:string)=>new TextEncoder().encode(value);
async function key(){ const secret=Deno.env.get('MT5_CREDENTIAL_ENCRYPTION_KEY'); if(!secret) throw new Error('MT5_CREDENTIAL_ENCRYPTION_KEY is not configured'); return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encode(secret)),{name:'AES-GCM'},false,['encrypt']); }
async function encrypt(value:string){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),encode(value))); const out=new Uint8Array(iv.length+ciphertext.length); out.set(iv); out.set(ciphertext,iv.length); return `\\x${Array.from(out,b=>b.toString(16).padStart(2,'0')).join('')}`; }
async function digest(value:string){ return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{headers});
 try {
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=createClient(url,anon,{global:{headers:{Authorization:req.headers.get('Authorization')??''}}});
  const {data:{user}}=await auth.auth.getUser(); if(!user) return reply({error:'unauthorized'},401);
  const db=createClient(url,service); const body=await req.json();
  if(body.action==='connect'){
   if(!/^\d{4,20}$/.test(String(body.accountNumber)) || String(body.password).length<4) return reply({error:'invalid_credentials'},400);
   const type=body.accountType; const mode=body.executionMode;
   if(!['personal','prop','demo'].includes(type)||!['personal','prop_challenge','demo'].includes(mode)) return reply({error:'invalid_mode'},400);
   const capability=String(body.credentialCapability??'investor'); const ownerKind=String(body.ownerKind??'customer');
   if(!['investor','master'].includes(capability)||!['system','customer'].includes(ownerKind)) return reply({error:'invalid_account_security_classification'},400);
   const {data,error}=await db.from('mt5_accounts').insert({user_id:user.id,owner_kind:ownerKind,broker:String(body.broker).trim(),server:String(body.server).trim(),account_number_ciphertext:await encrypt(String(body.accountNumber)),password_ciphertext:await encrypt(String(body.password)),account_number_hash:await digest(String(body.accountNumber)),account_number_last4:String(body.accountNumber).slice(-4),nickname:String(body.nickname).trim(),currency:String(body.currency??'USD'),leverage:Number(body.leverage),account_type:type,execution_mode:mode,credential_capability:capability,operational:body.operational===true,monitor_enabled:body.monitorEnabled!==false,execution_enabled:false,connection_status:'pending',policy:body.policy??{}}).select('id,credential_ref').single();
   if(error) throw error;
   const {data:verified,error:readError}=await db.from('mt5_accounts_safe').select('*').eq('id',data.id).single(); if(readError)throw readError;
   return reply({accountId:data.id,credentialRef:data.credential_ref,status:'REGISTERED',account:verified});
  }
  const accountId=String(body.accountId??'');
  const {data:owned}=await db.from('mt5_accounts').select('id,user_id,bridge_id').eq('id',accountId).single(); if(!owned||owned.user_id!==user.id) return reply({error:'not_found'},404);
  if(body.action==='remove'){ const {error}=await db.from('mt5_accounts').delete().eq('id',accountId); if(error)throw error; return reply({removed:true}); }
  if(body.action==='set_execution'){ if(body.enabled===true)return reply({error:'MT5_EXECUTION_ADOPTION_DISABLED'},409); const {error}=await db.from('mt5_accounts').update({execution_enabled:false,disabled_at:new Date().toISOString()}).eq('id',accountId); if(error)throw error; return reply({enabled:false}); }
  if(body.action==='set_mode'){ if(!['personal','prop_challenge','demo'].includes(body.mode)) return reply({error:'invalid_mode'},400); const {error}=await db.from('mt5_accounts').update({execution_mode:body.mode}).eq('id',accountId); if(error)throw error; return reply({mode:body.mode}); }
  if(body.action==='test_connection'){ if(!owned.bridge_id)return reply({error:'MT5_BRIDGE_OFFLINE'},409); const {data,error}=await db.from('mt5_commands').insert({account_id:accountId,bridge_id:owned.bridge_id,operation:'TEST_CONNECTION',payload:{},status:'received',idempotency_key:`test:${crypto.randomUUID()}`}).select('id').single(); if(error)throw error; return reply({commandId:data.id,status:'received'}); }
  return reply({error:'unsupported_action'},400);
 } catch(error){ return reply({error:error instanceof Error?error.message:'mt5_account_operation_failed'},500); }
});
