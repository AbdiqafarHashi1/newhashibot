import {verifyProvider,type OnboardingProvider,type RawCredential,type SafeVerification} from "./execution-account-onboarding.ts";
export interface CustomerCredentialStore { persist(input:{customerId:string;accountId:string;provider:OnboardingProvider;secretJson:string;verification:SafeVerification}):Promise<string>; }
/** Verify first, persist second. Raw material is never returned and no fallback store exists. */
export async function verifyAndPersistCustomerCredential(input:{customerId:string;accountId:string;provider:OnboardingProvider;environment:string;credential:RawCredential;store:CustomerCredentialStore;fetcher?:typeof fetch}){
 const verification=await verifyProvider(input.provider,input.environment,input.credential,input.fetcher);
 if(!verification.connection_verified||verification.first_blocker)throw new Error(verification.first_blocker??"PROVIDER_VERIFICATION_FAILED");
 if(!verification.trading_permission)throw new Error("TRADING_PERMISSION_REQUIRED");
 if(verification.withdrawal_permission!==false)throw new Error("WITHDRAWAL_PERMISSION_REJECTED");
 const secretJson=JSON.stringify({api_key:input.credential.apiKey,api_secret:input.credential.apiSecret});
 const reference=await input.store.persist({customerId:input.customerId,accountId:input.accountId,provider:input.provider,secretJson,verification});
 return Object.freeze({state:"CONNECTED" as const,provider:input.provider.toUpperCase(),environment:input.environment,accountIdentity:verification.discovered_account_identity,capabilities:{trading:true,withdrawal:false,verified:true},credentialReference:`vault:••••${reference.slice(-8)}`});
}
