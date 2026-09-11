export type CustomerProduct = "SIGNAL_ONLY"|"FOREX_PERSONAL"|"FOREX_PROP"|"CRYPTO_PERSONAL"|"CRYPTO_PROP";
export type OnboardingState = "DRAFT"|"PAYMENT_SUBMITTED"|"AWAITING_ADMIN_REVIEW"|"APPROVED"|"REJECTED"|"ACCOUNT_SETUP_REQUIRED"|"READY"|"ACTIVE"|"DISABLED"|"EXPIRED";
export function deriveCustomerProduct(input:{intent:"SIGNALS"|"FOREX"|"CRYPTO";accountType?:"PERSONAL"|"PROP"}):CustomerProduct {
 if(input.intent==="SIGNALS") return "SIGNAL_ONLY";
 if(!input.accountType) throw new Error("ACCOUNT_TYPE_REQUIRED");
 return `${input.intent}_${input.accountType}` as CustomerProduct;
}
export function restrictQualifiedUniverse<T extends {strategyId:string;supportedSymbols:readonly string[]}>(qualified:readonly T[],preferences:{strategyIds?:readonly string[];symbols?:readonly string[]}):readonly T[]{
 const strategies=new Set(preferences.strategyIds??qualified.map(x=>x.strategyId)),symbols=new Set((preferences.symbols??[]).map(x=>x.toUpperCase()));
 return Object.freeze(qualified.filter(entry=>strategies.has(entry.strategyId)&&(!symbols.size||entry.supportedSymbols.some(symbol=>symbols.has(symbol.toUpperCase())))));
}
export function provisioningBlockers(input:{state:OnboardingState;product:CustomerProduct;paymentVerified:boolean;adminApproved:boolean;executionAccountId:string|null;accountCustomerId:string|null;customerId:string;qualifiedSetId:string|null;qualifiedSetVersion:string|null;provider:string|null;disabled:boolean;expired:boolean}):readonly string[]{
 const out:string[]=[];
 if(!input.paymentVerified)out.push("PAYMENT_NOT_VERIFIED");if(!input.adminApproved)out.push("ADMIN_APPROVAL_REQUIRED");
 if(input.disabled)out.push("CUSTOMER_DISABLED");if(input.expired)out.push("SUBSCRIPTION_EXPIRED");
 if(input.product!=="SIGNAL_ONLY"){
  if(!input.executionAccountId)out.push("EXECUTION_ACCOUNT_REQUIRED");
  if(input.executionAccountId&&input.accountCustomerId!==input.customerId)out.push("ACCOUNT_CUSTOMER_MISMATCH");
  if(!input.provider)out.push("PROVIDER_REQUIRED");
  if(!input.qualifiedSetId||!input.qualifiedSetVersion)out.push("QUALIFIED_SET_REQUIRED");
  else if(input.qualifiedSetId!==`${input.product}_QUALIFIED_SET`)out.push("QUALIFIED_SET_PRODUCT_MISMATCH");
 }
 if(["REJECTED","DISABLED","EXPIRED"].includes(input.state))out.push(`ONBOARDING_${input.state}`);
 return Object.freeze(out);
}
export const CUSTOMER_SAFE_COLUMNS="id,customer_id,access_request_id,subscription_id,product,provider,execution_account_id,qualified_set_id,qualified_set_version,preferences,runtime_control,state,payment_verified,admin_approved,created_at,updated_at";
