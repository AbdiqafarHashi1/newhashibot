import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {CUSTOMER_SAFE_COLUMNS,deriveCustomerProduct} from "../_shared/customer-provisioning.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization,Apikey"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}}),token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");const {data:{user}}=await service.auth.getUser(token);if(!user)return reply({error:"unauthorized"},401);
 const {data:profile}=await service.from("profiles").select("role,email,full_name").eq("id",user.id).maybeSingle(),admin=profile?.role==="admin";const body=await req.json() as Record<string,unknown>,action=String(body.action??"");
 if(action==="submit"){
  const product=deriveCustomerProduct({intent:String(body.intent??"") as "SIGNALS"|"FOREX"|"CRYPTO",accountType:body.account_type?String(body.account_type) as "PERSONAL"|"PROP":undefined}),paymentReference=String(body.payment_reference??"").trim().toUpperCase();
  if(!paymentReference)return reply({error:"payment_reference_required"},422);const provider=product.startsWith("FOREX")?"MT5":product.startsWith("CRYPTO")?String(body.provider??"").toUpperCase():null;
  if(product.startsWith("CRYPTO")&&!['BINANCE','BYBIT'].includes(provider??""))return reply({error:"compatible_provider_required"},422);
  const {data:request,error}=await service.from("access_requests").insert({user_id:user.id,product_slug:String(body.package_slug??""),full_name:profile?.full_name??"",email:profile?.email??user.email??"",phone:String(body.payment_phone??""),payment_method:"mpesa",payment_reference:paymentReference,risk_preset:String(body.risk_style??"Balanced"),notes:String(body.notes??""),status:"pending_admin_approval",admin_note:""}).select("id,created_at").single();if(error)return reply({error:"request_write_failed"},500);
  const {data:provision,error:provisionError}=await service.from("customer_onboarding_provisioning").insert({customer_id:user.id,access_request_id:request.id,product,provider,preferences:{riskStyle:String(body.risk_style??"Balanced"),symbols:body.symbols??[],strategyIds:body.strategy_ids??[]},state:"AWAITING_ADMIN_REVIEW"}).select(CUSTOMER_SAFE_COLUMNS).single();if(provisionError)return reply({error:"provisioning_write_failed"},500);
  await service.from("customer_onboarding_audit").insert({customer_id:user.id,access_request_id:request.id,actor_id:user.id,actor_role:"CUSTOMER",previous_state:"DRAFT",new_state:"AWAITING_ADMIN_REVIEW",reason:"M_PESA_PAYMENT_SUBMITTED",metadata:{product,provider}});
  return reply({request:{id:request.id,created_at:request.created_at},provisioning:provision,payment_verified:false,admin_approved:false},201);
 }
 if(action==="my_status"){const {data}=await service.from("customer_onboarding_provisioning").select(CUSTOMER_SAFE_COLUMNS).eq("customer_id",user.id).order("created_at",{ascending:false});return reply({onboarding:data??[]});}
 if(action==="set_control"){
  const id=String(body.provisioning_id??""),{data:owned,error}=await service.from("customer_onboarding_provisioning").select("customer_id,execution_account_id").eq("id",id).maybeSingle();
  if(error||!owned||!admin&&owned.customer_id!==user.id)return reply({error:"onboarding_not_found"},404);
  if(!owned.execution_account_id)return reply({error:"execution_account_required"},409);
  const {data,error:controlError}=await service.rpc("set_customer_account_runtime",{p_actor_id:user.id,p_customer_id:owned.customer_id,p_account_id:owned.execution_account_id,p_control:String(body.control??"")});
  return controlError?reply({error:"ACCOUNT_CONTROL_NOT_CONFIRMED",reason:controlError.message},409):reply(data);
 }
 if(!admin)return reply({error:"admin_required"},403);
 if(action==="admin_queue"){const {data}=await service.from("customer_onboarding_provisioning").select(`${CUSTOMER_SAFE_COLUMNS},access_requests(payment_reference,payment_method,phone,created_at,product_slug,full_name,email,notes),connected_execution_accounts(id,provider,environment,provider_health,last_synchronized_at)`).order("created_at",{ascending:false});return reply({queue:data??[]});}
 const id=String(body.provisioning_id??""),{data:current}=await service.from("customer_onboarding_provisioning").select("*").eq("id",id).maybeSingle();if(!current)return reply({error:"onboarding_not_found"},404);
 if(action==="admin_review"){
  const decision=String(body.decision??"");if(!["APPROVE","REJECT","REQUEST_CHANGES"].includes(decision))return reply({error:"invalid_review_decision"},422);
  // Review approves a support request only. It cannot verify payment, bind an account or turn execution on.
  const next=decision==="APPROVE"?"APPROVED":decision==="REJECT"?"REJECTED":"ACCOUNT_SETUP_REQUIRED";
  const {error}=await service.from("customer_onboarding_provisioning").update({state:next,admin_approved:decision==="APPROVE",admin_notes:String(body.notes??""),updated_at:new Date().toISOString()}).eq("id",id);
  if(error)return reply({error:"review_not_persisted"},500);return reply({state:next,payment_verified:current.payment_verified,execution_enabled:false});
 }
 if(action==="activate")return reply({error:"CANONICAL_ACCOUNT_ACTIVATION_REQUIRED",next_action:"Open account readiness and request demo start after verified payment and certification."},409);
 return reply({error:"unsupported_action"},400);
});

