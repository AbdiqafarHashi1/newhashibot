import {PERSONAL_RISK_PROFILES,personalRiskProfile,validatePersonalGrowthScope} from './personal-growth-policy.ts';
import {validatePropAccountProfile} from './prop-account-profile.ts';
import {resolveVersionedAccountPolicy} from './account-policy-authority.ts';
import {onboardingAccountPolicy} from './onboarding-policy.ts';
/** Validate narrowed owner controls using the same bounds used by authorization. */
export function validateAdminAccountControls(account:any,input:any){
 const configuration={...account.policy_overrides?.policy_configuration};
 const limits=input?.limits;if(!limits||typeof limits!=='object'||Array.isArray(limits))throw Error('ACCOUNT_LIMITS_REQUIRED');
 const allowed=['personalRiskProfile','maxCorrelatedRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols','houseMoney','fridayClose'];
 if(Object.keys(limits).some(k=>!allowed.includes(k)))throw Error('UNSUPPORTED_ACCOUNT_LIMIT');
 if(limits.allowedSymbols!==undefined&&limits.allowedSymbols!==null&&(!Array.isArray(limits.allowedSymbols)||!limits.allowedSymbols.length||limits.allowedSymbols.length>100||limits.allowedSymbols.some((s:any)=>typeof s!=='string'||!/^[A-Z0-9._-]{2,32}$/.test(s))||new Set(limits.allowedSymbols).size!==limits.allowedSymbols.length))throw Error('EXPLICIT_ASSET_ALLOWLIST_REQUIRED');
 if(limits.maxConcurrentPositions!==undefined&&!Number.isInteger(limits.maxConcurrentPositions))throw Error('INTEGER_POSITION_LIMIT_REQUIRED');
 if(limits.fridayClose!==undefined&&typeof limits.fridayClose!=='boolean')throw Error('FRIDAY_CLOSE_BOOLEAN_REQUIRED');
 if(limits.houseMoney!==undefined&&limits.houseMoney!=='house-money/v1')throw Error('UNSUPPORTED_HOUSE_MONEY_POLICY');
 const selected=personalRiskProfile(limits.personalRiskProfile??configuration.personalRiskProfile);validatePersonalGrowthScope(selected,account.account_mode,account.environment);
 if(account.account_mode==='PERSONAL'&&limits.personalRiskProfile!==undefined&&limits.personalRiskProfile!==configuration.personalRiskProfile){const p=PERSONAL_RISK_PROFILES[selected];Object.assign(configuration,{riskPerTradePct:p.risk,maxOpenRiskPct:p.open,maxCorrelatedRiskPct:p.correlated,maxLeverage:selected==='STANDARD'?10:String(account.provider).startsWith('MT5')?100:15,maxConcurrentPositions:3,maxDailyDrawdownPct:p.daily,maxTotalDrawdownPct:p.peak});}
 Object.assign(configuration,limits);
 const base=onboardingAccountPolicy(account.provider,account.account_mode);
 if(configuration.allowedSymbols===null)configuration.allowedSymbols=base.allowed_symbols;
 if(Array.isArray(configuration.allowedSymbols)&&base.allowed_symbols&&configuration.allowedSymbols.some((s:string)=>!base.allowed_symbols!.includes(s)&&!(/^(BTC|ETH|SOL)USD(?:[._-].*)?$/.test(s)&&String(account.provider).startsWith('MT5'))))throw Error('ASSET_OUTSIDE_BASE_POLICY');
 resolveVersionedAccountPolicy({id:account.id,customerId:account.customer_id,provider:base.provider,accountType:base.account_type,policyProfileId:account.policy_profile_id,policyVersion:account.policy_version} as any,base,configuration);
 let prop=null;if(input.propRules!==undefined&&input.propRules!==null){if(account.provider!=='MT5_PROP')throw Error('PROP_ACCOUNT_REQUIRED');prop=validatePropAccountProfile(input.propRules);if(prop.program_id==='FTMO_TWO_STEP_SWING'&&prop.min_trading_days!==(account.account_mode==='PROP_FUNDED'?0:4))throw Error('PROP_PROGRAM_PHASE_MISMATCH');}
 return {configuration,propRules:prop};
}
