import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {handlePortableRequest,headers} from '../_shared/phase-p-api.ts';
Deno.serve(req=>{if(req.method==='OPTIONS')return new Response(null,{headers});const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return new Response(JSON.stringify({error:'WORKERS_NOT_CONFIGURED'}),{status:503,headers});return handlePortableRequest(req,createClient(url,key,{auth:{persistSession:false}}));});
