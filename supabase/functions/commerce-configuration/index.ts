import {createClient} from 'npm:@supabase/supabase-js@2';
import {COMMERCE_FIELDS,redactCommerceSettings,commerceEnvironment,type CommerceProvider} from '../_shared/commerce-provider-settings.ts';
import {whopRuntimeConfig,verifyWhopRuntimePlan} from '../_shared/whop-runtime.ts';
import {mpesaAdapterFromGetter,DarajaMpesaAdapter} from '../_shared/mpesa-adapter.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}}),{data:{user}}=await db.auth.getUser((req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,''));if(!user)return reply({error:'AUTHENTICATION_REQUIRED'},401);
 const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(roleError||profile?.role!=='admin')return reply({error:'ADMIN_REQUIRED'},403);
 try{
  const raw=await req.text();if(raw.length>22000)return reply({error:'REQUEST_TOO_LARGE'},413);const body=JSON.parse(raw),provider=String(body.provider??'') as CommerceProvider;
  if(!Object.hasOwn(COMMERCE_FIELDS,provider))return reply({error:'PROVIDER_REQUIRED'},422);
  if(body.action==='recovery_status'){
   const {data,error}=await db.from('commerce_payment_events').select('provider,external_event_id,event_type,processing_state,review_reason,safe_error,next_reconcile_at,received_at').eq('provider',provider).order('received_at',{ascending:false}).limit(20);if(error)throw Error('RECOVERY_STATUS_UNAVAILABLE');return reply({state:'LOADED',events:data??[]});
  }
  if(body.action==='recover'){
   const secret=Deno.env.get('HASHIBOT_INTERNAL_SECRET');if(!secret)throw Error('RECOVERY_WORKER_NOT_CONFIGURED');
   const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/commerce-reconcile`,{method:'POST',headers:{'Content-Type':'application/json','x-hashibot-internal-secret':secret,Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`},body:'{}',signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('RECOVERY_REQUEST_NOT_CONFIRMED');return reply({state:'RECOVERY_PASS_COMPLETED',result:await response.json()});
  }
  if(body.action==='save'){
   const values=body.values;if(!values||Array.isArray(values)||typeof values!=='object'||Object.entries(values).some(([k,v])=>!(COMMERCE_FIELDS[provider] as readonly string[]).includes(k)||typeof v!=='string'||v.length>4096))return reply({error:'INVALID_PROVIDER_FIELDS'},422);
   if(values.DARAJA_CALLBACK_URL){const callback=new URL(values.DARAJA_CALLBACK_URL);if(callback.origin!==new URL(Deno.env.get('SUPABASE_URL')!).origin||callback.pathname!=='/functions/v1/mpesa-webhook')return reply({error:'USE_THIS_PROJECT_MPESA_CALLBACK'},422)}
   const prior=await db.from('commerce_provider_configuration').select('provider').eq('provider',provider).maybeSingle();if(prior.error)throw Error('SETTINGS_UNAVAILABLE');
   const inherited=prior.data?{}:Object.fromEntries(COMMERCE_FIELDS[provider].map(key=>[key,Deno.env.get(key)??'']));const effective={...inherited,...Object.fromEntries(Object.entries(values).filter(([,v])=>typeof v==='string'&&v.trim()))};
   const{data,error}=await db.rpc('save_commerce_provider_configuration',{p_actor:user.id,p_provider:provider,p_values:effective});if(error)throw Error('SETTINGS_SAVE_FAILED');return reply({state:'SAVED_CHECKOUT_DISABLED',data});
  }
  const get=await commerceEnvironment(db,key=>Deno.env.get(key)),{data:metadata,error:metadataError}=await db.from('commerce_provider_configuration').select('provider,revision,verified_revision,verified_products,verified_at,enabled,updated_at').eq('provider',provider).maybeSingle();if(metadataError)throw Error('SETTINGS_UNAVAILABLE');
  if(body.action==='inspect')return reply({state:metadata?'SAVED':'LEGACY_ENVIRONMENT_OR_NOT_CONFIGURED',metadata,settings:redactCommerceSettings(provider,Object.fromEntries(COMMERCE_FIELDS[provider].map(key=>[key,get(key)??'']))),callbackUrl:`${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-webhook`});
  if(!metadata)return reply({error:'SAVE_SETTINGS_BEFORE_VERIFICATION'},409);
  if(body.action==='disable'){const{data,error}=await db.rpc('control_commerce_provider_configuration',{p_actor:user.id,p_provider:provider,p_revision:metadata.revision,p_action:'DISABLE',p_products:[]});if(error)throw Error('SETTINGS_CHANGED_RELOAD');return reply({state:'CHECKOUT_DISABLED',data})}
  if(!['verify','enable'].includes(body.action))return reply({error:'ACTION_NOT_ALLOWED'},422);
  const {data:prices,error:priceError}=await db.from('commerce_product_prices').select('product_code,amount_minor,currency,fixed_period_days').eq('provider',provider).eq('active',true);if(priceError||!prices?.length)throw Error('ACTIVE_PRICES_REQUIRED');
  const products:string[]=[];
  if(provider==='WHOP'){
   const config=whopRuntimeConfig(get);if(!config)throw Error('WHOP_FIELDS_REQUIRED');
   for(const price of prices){if(!config.planIds[price.product_code])continue;await verifyWhopRuntimePlan(config,price.product_code,Number(price.amount_minor),price.currency);products.push(price.product_code)}
  }else{
   const adapter=mpesaAdapterFromGetter(get);if(!(adapter instanceof DarajaMpesaAdapter))throw Error('DARAJA_FIELDS_REQUIRED');await adapter.verifyCredentials();
   if(prices.some((p:any)=>p.product_code!=='VIP_SIGNALS'||p.currency!=='KES'||!Number.isSafeInteger(Number(p.amount_minor)/100)||![7,30].includes(p.fixed_period_days)))throw Error('APPROVED_MPESA_PRICES_REQUIRED');products.push('VIP_SIGNALS');
  }
  if(!products.length)throw Error('MATCHING_PROVIDER_PLANS_REQUIRED');
  const args={p_actor:user.id,p_provider:provider,p_revision:metadata.revision,p_products:[...new Set(products)]};
  const verified=await db.rpc('control_commerce_provider_configuration',{...args,p_action:'VERIFIED'});if(verified.error)throw Error('SETTINGS_CHANGED_RELOAD');
  if(body.action==='enable'){const enabled=await db.rpc('control_commerce_provider_configuration',{...args,p_action:'ENABLE'});if(enabled.error)throw Error('SETTINGS_CHANGED_RELOAD')}
  return reply({state:body.action==='enable'?'CHECKOUT_ENABLED':'PROVIDER_CONFIGURATION_VERIFIED',environment:get(provider==='WHOP'?'WHOP_ENVIRONMENT':'DARAJA_ENVIRONMENT')??'sandbox',products:[...new Set(products)],paymentAndMembershipTestRequired:true});
 }catch(e){const allowed=['SETTINGS_SAVE_FAILED','SETTINGS_UNAVAILABLE','SETTINGS_CHANGED_RELOAD','ACTIVE_PRICES_REQUIRED','WHOP_FIELDS_REQUIRED','DARAJA_FIELDS_REQUIRED','APPROVED_MPESA_PRICES_REQUIRED','MATCHING_PROVIDER_PLANS_REQUIRED','WHOP_PLAN_PRICE_OR_ACCOUNT_MISMATCH','WHOP_PROVIDER_REQUEST_FAILED','MPESA_AUTH_FAILED','COMMERCE_CONFIGURATION_UNAVAILABLE','RECOVERY_STATUS_UNAVAILABLE','RECOVERY_WORKER_NOT_CONFIGURED','RECOVERY_REQUEST_NOT_CONFIRMED'];const message=e instanceof Error?e.message:'';return reply({error:allowed.includes(message)?message:'CONFIGURATION_REQUEST_FAILED'},409)}
});
