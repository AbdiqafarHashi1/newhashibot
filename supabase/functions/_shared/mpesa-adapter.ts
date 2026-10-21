export type MpesaConfiguration={consumerKey?:string;consumerSecret?:string;shortCode?:string;passkey?:string;callbackUrl?:string;environment?:"sandbox"|"production";transactionType?:"CustomerPayBillOnline"|"CustomerBuyGoodsOnline";partyB?:string};
export function mpesaConfigurationState(c:MpesaConfiguration){return c.consumerKey&&c.consumerSecret&&c.shortCode&&c.passkey&&c.callbackUrl&&(!c.transactionType||["CustomerPayBillOnline","CustomerBuyGoodsOnline"].includes(c.transactionType))&&(c.transactionType!=="CustomerBuyGoodsOnline"||c.partyB)?"READY" as const:"READY_FOR_CONFIGURATION" as const;}
export function normalizeKenyanPhone(raw:string){const d=raw.replace(/\D/g,"");const n=d.startsWith("254")?d:d.startsWith("0")?`254${d.slice(1)}`:d.length===9?`254${d}`:"";if(!/^254[17]\d{8}$/.test(n))throw new Error("INVALID_KENYAN_PHONE");return n;}
export function maskKenyanPhone(raw:string){const n=normalizeKenyanPhone(raw);return `+${n.slice(0,3)}•••••${n.slice(-3)}`;}
export interface MpesaAdapter {createStkRequest(input:{checkoutId:string;phone:string;amountKes:number;callbackToken?:string}):Promise<{state:"PROVIDER_PENDING";merchantRequestId:string;checkoutRequestId:string}|{state:"CHECKOUT_NOT_CONFIGURED"}>;query(checkoutRequestId:string):Promise<{state:"PENDING"|"SUCCEEDED"|"FAILED"|"REVIEW_REQUIRED";resultCode?:number}>;}
export class UnconfiguredMpesaAdapter implements MpesaAdapter{async createStkRequest(){return {state:"CHECKOUT_NOT_CONFIGURED" as const}}async query(){return {state:"REVIEW_REQUIRED" as const}}}

export class DarajaMpesaAdapter implements MpesaAdapter {
 constructor(private c:MpesaConfiguration & {consumerKey:string;consumerSecret:string;shortCode:string;passkey:string;callbackUrl:string;environment:"sandbox"|"production"}){}
 private base(){return this.c.environment==="production"?"https://api.safaricom.co.ke":"https://sandbox.safaricom.co.ke"}
 async verifyCredentials(){await this.token();return {state:"CREDENTIALS_AUTHENTICATED_STK_TEST_REQUIRED"}}
 private async token(){const auth=btoa(`${this.c.consumerKey}:${this.c.consumerSecret}`);const r=await fetch(`${this.base()}/oauth/v1/generate?grant_type=client_credentials`,{headers:{Authorization:`Basic ${auth}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("MPESA_AUTH_FAILED");const j=await r.json();if(!j.access_token)throw new Error("MPESA_AUTH_FAILED");return String(j.access_token)}
 private stamp(){const d=new Date(Date.now()+3*3600000);return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0"),String(d.getUTCHours()).padStart(2,"0"),String(d.getUTCMinutes()).padStart(2,"0"),String(d.getUTCSeconds()).padStart(2,"0")].join("")}
 async createStkRequest(input:{checkoutId:string;phone:string;amountKes:number;callbackToken?:string}){if(!Number.isSafeInteger(input.amountKes)||input.amountKes<=0)throw new Error("MPESA_WHOLE_SHILLING_AMOUNT_REQUIRED");const callback=new URL(this.c.callbackUrl);if(input.callbackToken){callback.searchParams.set('h_checkout',input.checkoutId);callback.searchParams.set('h_token',input.callbackToken)}const phone=normalizeKenyanPhone(input.phone),timestamp=this.stamp(),password=btoa(`${this.c.shortCode}${this.c.passkey}${timestamp}`),token=await this.token();const r=await fetch(`${this.base()}/mpesa/stkpush/v1/processrequest`,{method:"POST",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({BusinessShortCode:this.c.shortCode,Password:password,Timestamp:timestamp,TransactionType:this.c.transactionType??"CustomerPayBillOnline",Amount:input.amountKes,PartyA:phone,PartyB:this.c.partyB??this.c.shortCode,PhoneNumber:phone,CallBackURL:callback.toString(),AccountReference:input.checkoutId.replace(/-/g,"").slice(0,12),TransactionDesc:"HashiBot VIP"})});const j=await r.json();if(!r.ok||j.ResponseCode!=="0"||typeof j.MerchantRequestID!=="string"||!j.MerchantRequestID||typeof j.CheckoutRequestID!=="string"||!j.CheckoutRequestID)throw new Error("MPESA_STK_REJECTED");return {state:"PROVIDER_PENDING" as const,merchantRequestId:String(j.MerchantRequestID),checkoutRequestId:String(j.CheckoutRequestID)}}
 async query(checkoutRequestId:string){const timestamp=this.stamp(),password=btoa(`${this.c.shortCode}${this.c.passkey}${timestamp}`),token=await this.token();const r=await fetch(`${this.base()}/mpesa/stkpushquery/v1/query`,{method:"POST",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({BusinessShortCode:this.c.shortCode,Password:password,Timestamp:timestamp,CheckoutRequestID:checkoutRequestId})});const j=await r.json();if(!r.ok)return {state:"REVIEW_REQUIRED" as const};if(j.ResultCode===undefined||j.ResultCode===null||j.ResultCode==="")return {state:"PENDING" as const};if(j.CheckoutRequestID&&j.CheckoutRequestID!==checkoutRequestId)return {state:"REVIEW_REQUIRED" as const};const code=Number(j.ResultCode);return {state:code===0?"SUCCEEDED" as const:"FAILED" as const,resultCode:code}}
}

/** Prefer the established DARAJA_* keys, but accept the documented MPESA_* aliases.
 * Conflicting nonempty values fail closed instead of silently routing funds elsewhere.
 */
export function mpesaAdapterFromGetter(get:(key:string)=>string|undefined):MpesaAdapter {
 const read=(primary:string,alias?:string)=>{const a=get(primary)?.trim(),b=alias?get(alias)?.trim():undefined;if(a&&b&&a!==b)throw new Error("MPESA_CONFIGURATION_CONFLICT");return a||b||undefined};
 const c={
  consumerKey:read("DARAJA_CONSUMER_KEY","MPESA_CONSUMER_KEY"),
  consumerSecret:read("DARAJA_CONSUMER_SECRET","MPESA_CONSUMER_SECRET"),
  shortCode:read("DARAJA_SHORT_CODE","MPESA_SHORTCODE"),
  passkey:read("DARAJA_PASSKEY","MPESA_PASSKEY"),
  callbackUrl:read("DARAJA_CALLBACK_URL","MPESA_CALLBACK_URL"),
  transactionType:(read("DARAJA_TRANSACTION_TYPE","MPESA_TRANSACTION_TYPE")||"CustomerPayBillOnline") as MpesaConfiguration["transactionType"],
  partyB:read("DARAJA_PARTY_B","MPESA_PARTY_B"),
  environment:(read("DARAJA_ENVIRONMENT","MPESA_ENVIRONMENT")||"sandbox") as "sandbox"|"production"
 };
 if(!["sandbox","production"].includes(c.environment))throw new Error("MPESA_ENVIRONMENT_INVALID");
 if(c.callbackUrl){let url:URL;try{url=new URL(c.callbackUrl)}catch{throw new Error("MPESA_CALLBACK_URL_INVALID")}if(url.protocol!=="https:"||url.username||url.password||!url.hostname)throw new Error("MPESA_CALLBACK_URL_INVALID")}
 return mpesaConfigurationState(c)==="READY"?new DarajaMpesaAdapter(c as Required<MpesaConfiguration>):new UnconfiguredMpesaAdapter();
}

export function mpesaAdapterFromEnv():MpesaAdapter{return mpesaAdapterFromGetter(key=>Deno.env.get(key))}
