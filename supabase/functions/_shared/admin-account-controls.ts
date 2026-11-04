import {validatePropAccountProfile} from './prop-account-profile.ts';
import {resolveVersionedAccountPolicy} from './account-policy-authority.ts';
import {onboardingAccountPolicy} from './onboarding-policy.ts';
/** Validate narrowed owner controls using the same bounds used by authorization. */
export function validateAdminAccountControls(account:any,input:any){
 const configuration={...account.policy_overrides?.policy_configuration};
 const limits=input?.limits;if(!limits||typeof limits!=='object'||Array.isArray(limits))throw Error('ACCOUNT_LIMITS_REQUIRED');
 const allowed=['maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols'];
 if(Object.keys(limits).some(k=>!allowed.includes(k)))throw Error('UNSUPPORTED_ACCOUNT_LIMIT');
 if(limits.allowedSymbols!==undefined&&limits.allowedSymbols!==null&&(!Array.isArray(limits.allowedSymbols)||!limits.allowedSymbols.length||limits.allowedSymbols.length>100||limits.allowedSymbols.some((s:any)=>typeof s!=='string'||!/^[A-Z0-9._-]{2,32}$/.test(s))||new Set(limits.allowedSymbols).size!==limits.allowedSymbols.length))throw Error('EXPLICIT_ASSET_ALLOWLIST_REQUIRED');
 if(limits.maxConcurrentPositions!==undefined&&!Number.isInteger(limits.maxConcurrentPositions))throw Error('INTEGER_POSITION_LIMIT_REQUIRED');
 Object.assign(configuration,limits);
 const base=onboardingAccountPolicy(account.provider,account.account_mode);
 if(configuration.allowedSymbols===null)configuration.allowedSymbols=base.allowed_symbols;
 if(Array.isArray(configuration.allowedSymbols)&&base.allowed_symbols&&configuration.allowedSymbols.some((s:string)=>!base.allowed_symbols!.includes(s)))throw Error('ASSET_OUTSIDE_BASE_POLICY');
 resolveVersionedAccountPolicy({id:account.id,customerId:account.customer_id,provider:base.provider,accountType:base.account_type,policyProfileId:account.policy_profile_id,policyVersion:account.policy_version} as any,base,configuration);
 let prop=null;if(input.propRules!==undefined&&input.propRules!==null){if(account.provider!=='MT5_PROP')throw Error('PROP_ACCOUNT_REQUIRED');prop=validatePropAccountProfile(input.propRules);}
 return {configuration,propRules:prop};
}
