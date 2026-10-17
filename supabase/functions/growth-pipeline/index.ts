import {createClient} from 'npm:@supabase/supabase-js@2';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
 const {data:{user}}=await db.auth.getUser((req.headers.get('authorization')??'').replace(/^Bearer\s+/i,''));if(!user)return reply({error:'AUTHENTICATION_REQUIRED'},401);
 const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(roleError||profile?.role!=='admin')return reply({error:'ADMIN_REQUIRED'},403);
 try{const raw=await req.text();if(raw.length>20000)return reply({error:'REQUEST_TOO_LARGE'},413);const {action,input}=JSON.parse(raw);
  if(!['LIST','SAVE','NOTE','ACTIVITIES','DRAFT_CONTEXT'].includes(action))return reply({error:'ACTION_NOT_ALLOWED'},422);
  const {data,error}=await db.rpc('manage_growth_pipeline',{p_actor:user.id,p_action:action,p_input:input??{}});
  if(error){const allowed=['CONTACT_PERMISSION_REQUIRED','PROSPECT_CHANGED_RELOAD','OPT_OUT_CANNOT_BE_OVERRIDDEN','CONTACT_SUPPRESSED','VALID_EMAIL_REQUIRED','VALID_TELEGRAM_HANDLE_REQUIRED','INTERNATIONAL_PHONE_REQUIRED','ACTIVITY_NOTE_REQUIRED'];return reply({error:error.code==='23505'?'CONTACT_ALREADY_RECORDED':allowed.find(k=>error.message?.includes(k))??'PIPELINE_REQUEST_NOT_CONFIRMED'},409)}
  return reply({state:'OK',data});
 }catch{return reply({error:'INVALID_PIPELINE_REQUEST'},422)}
});
