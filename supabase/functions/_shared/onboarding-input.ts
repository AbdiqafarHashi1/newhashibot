import {validatePropSetupPhase} from './prop-draft-stage.ts';
import {providerEnvironmentContract} from './provider-environment.ts';
export function onboardingBrain(provider:string,mode:string) {
 const profiles:Record<string,readonly [string,string,number,readonly string[]]>={
  'MT5:PERSONAL':['PERSONAL_MT5_GROWTH','1.0.0',1,['FOREX_TREND','GOLD_BREAKOUT']],
  'MT5:PROP':['PROP_MT5_STRICT','1.0.0',.5,['FOREX_TREND']],
  'BINANCE:PERSONAL':['PERSONAL_BINANCE_CRYPTO','1.0.0',.75,['CRYPTO_TREND']],
  'BYBIT:PERSONAL':['PERSONAL_BYBIT_CRYPTO','1.0.0',.75,['CRYPTO_TREND']],
 };return profiles[`${provider}:${mode}`];
}
export function validateBrainPreferences(provider:string,mode:string,risk:unknown,strategies:unknown) {
 const profile=onboardingBrain(provider,mode);
 if(!profile||typeof risk!=='number'||!Number.isFinite(risk)||risk<.1||risk>profile[2]||!Array.isArray(strategies)||!strategies.length||strategies.some(x=>typeof x!=='string'||!profile[3].includes(x)))throw new Error('UNSAFE_PREFERENCE');
 return {profile,risk,strategies:[...new Set(strategies as string[])]};
}
export function validateOnboardingDraft(value:unknown) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_ONBOARDING_PREFERENCES');
 const d=value as Record<string,unknown>;
 if(!Number.isInteger(d.stage)||Number(d.stage)<0||Number(d.stage)>12||!['SIGNALS','AUTO'].includes(String(d.access))||!['FREE_SIGNALS','VIP_SIGNALS','AUTO_EXECUTION','FOUNDING_AUTO_EXECUTION','FOUNDING_PROP_EXECUTION'].includes(String(d.packageCode)))throw new Error('INVALID_ONBOARDING_PREFERENCES');
 const provider=String(d.provider),mode=String(d.mode);if(!onboardingBrain(provider,mode)||(provider==='MT5'?d.asset!=='FOREX':d.asset!=='CRYPTO'))throw new Error('UNSUPPORTED_PROVIDER_MODE');
 // Empty permissions are allowed while editing, never at account assignment.
 if(typeof d.risk!=='number'||!Number.isFinite(d.risk)||d.risk<.1||d.risk>onboardingBrain(provider,mode)[2]||!Array.isArray(d.strategies)||d.strategies.some(x=>typeof x!=='string'||!onboardingBrain(provider,mode)[3].includes(x)))throw new Error('UNSAFE_PREFERENCE');
 const environment=providerEnvironmentContract(provider,d.environment===undefined?undefined:String(d.environment)).environment;
 if(d.propPhase!==undefined&&mode!=='PROP')throw Error('PROP_ACCOUNT_REQUIRED');
 const propPhase=d.propPhase===undefined?undefined:validatePropSetupPhase(d.propPhase);
 return {...(propPhase?{propPhase}:{}),environment,stage:d.stage,packageCode:d.packageCode,access:d.access,asset:d.asset,provider,mode,risk:d.risk,strategies:[...new Set(d.strategies as string[])],ack:d.ack===true};
}
