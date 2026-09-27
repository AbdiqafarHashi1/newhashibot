import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,x-idempotency-key"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const safe=(v:unknown,n=80)=>String(v??"").replace(/[^a-zA-Z0-9_.-]/g,"").slice(0,n)||null;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers}); if(req.method!=="POST")return reply(405,{state:"BLOCKED",reason:"METHOD_NOT_ALLOWED"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!serviceKey)return reply(503,{state:"READY_FOR_CONFIGURATION"});
 const auth=req.headers.get("Authorization")??""; const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await userClient.auth.getUser(); if(!user)return reply(401,{state:"BLOCKED",reason:"AUTHENTICATION_REQUIRED"});
 const service=createClient(url,serviceKey); const body=await req.json().catch(()=>({})); const product=String(body.product_code??""); const provider=String(body.provider??""); const currency=String(body.currency??"");
 if(!["VIP_SIGNALS","FOUNDING_AUTO_EXECUTION"].includes(product)||!["WHOP","MPESA"].includes(provider))return reply(422,{state:"BLOCKED",reason:"UNSUPPORTED_PRODUCT_OR_PROVIDER"});
 const {data:price}=await service.from("commerce_product_prices").select("amount_minor,billing_interval,version,configured").eq("product_code",product).eq("provider",provider).eq("currency",currency).eq("active",true).order("version",{ascending:false}).limit(1).maybeSingle();
 if(!price)return reply(422,{state:"BLOCKED",reason:"UNSUPPORTED_PROVIDER_OR_CURRENCY"}); if(body.amount_minor!==undefined&&Number(body.amount_minor)!==Number(price.amount_minor))return reply(409,{state:"BLOCKED",reason:"CLIENT_PRICE_TAMPERING"});
 let account:string|null=body.execution_account_id?String(body.execution_account_id):null; if(product==="FOUNDING_AUTO_EXECUTION"){if(!account)return reply(422,{state:"BLOCKED",reason:"EXECUTION_ACCOUNT_REQUIRED"});const {data:owned}=await service.from("connected_execution_accounts").select("id").eq("id",account).eq("customer_id",user.id).maybeSingle();if(!owned)return reply(403,{state:"BLOCKED",reason:"ACCOUNT_OWNERSHIP_MISMATCH"});}
 const origin=new URL(req.url).origin; let returnUrl:string; try{const parsed=new URL(String(body.return_url??"/app/billing"),origin);if(parsed.origin!==origin)throw 0;returnUrl=parsed.toString();}catch{return reply(422,{state:"BLOCKED",reason:"UNSAFE_RETURN_URL"});}
 const idempotency=safe(req.headers.get("x-idempotency-key"),120);if(!idempotency)return reply(422,{state:"BLOCKED",reason:"IDEMPOTENCY_KEY_REQUIRED"}); const expiry=new Date(Date.now()+15*60_000).toISOString();
 const {data:checkout,error}=await service.from("commerce_checkout_sessions").insert({customer_id:user.id,product_code:product,provider,currency,amount_minor:price.amount_minor,price_version:price.version,billing_interval:price.billing_interval,execution_account_id:account,idempotency_key:idempotency,status:"CREATED",safe_return_url:returnUrl,campaign:safe(body.campaign),affiliate:safe(body.affiliate),expires_at:expiry}).select("id,status,expires_at").single();
 if(error){const {data:prior}=await service.from("commerce_checkout_sessions").select("id,status,expires_at").eq("customer_id",user.id).eq("idempotency_key",idempotency).maybeSingle();if(prior)return reply(200,{state:prior.status,checkout:prior});return reply(409,{state:"BLOCKED",reason:"ACTIVE_CHECKOUT_EXISTS"});}
 if(product==="FOUNDING_AUTO_EXECUTION"){const {data:slot,error:slotError}=await service.rpc("reserve_founding_slot",{p_customer:user.id,p_checkout:checkout.id,p_expires:expiry});if(slotError)return reply(409,{state:"BLOCKED",reason:"FOUNDING_CAPACITY_EXHAUSTED"});await service.from("commerce_checkout_sessions").update({status:"SLOT_RESERVED",founding_reservation_id:slot.id}).eq("id",checkout.id);}
 // Deliberately no provider network call in Phase I without server configuration.
 if(!price.configured)return reply(503,{state:"CHECKOUT_NOT_CONFIGURED",checkout_id:checkout.id,expires_at:checkout.expires_at});
 return reply(503,{state:"READY_FOR_CONFIGURATION",checkout_id:checkout.id});
});
