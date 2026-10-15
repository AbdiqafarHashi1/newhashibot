import {DEFAULT_BINANCE_PERSONAL_POLICY,DEFAULT_BYBIT_PERSONAL_POLICY,DEFAULT_MT5_PERSONAL_POLICY,DEFAULT_MT5_PROP_EVALUATION_POLICY,DEFAULT_MT5_PROP_FUNDED_POLICY} from './account-execution-brain/contracts.ts';
/** Onboarding pins the existing production Brain policy; it never invents a risk engine. */
export function onboardingAccountPolicy(provider:string,mode:string){
 const p=provider.toUpperCase();
 if(p.startsWith('MT5'))return mode==='PROP_FUNDED'?DEFAULT_MT5_PROP_FUNDED_POLICY:mode.startsWith('PROP')?DEFAULT_MT5_PROP_EVALUATION_POLICY:DEFAULT_MT5_PERSONAL_POLICY;
 if(mode!=='PERSONAL')throw new Error('UNSUPPORTED_PROVIDER_MODE');
 if(p==='BINANCE')return DEFAULT_BINANCE_PERSONAL_POLICY;
 if(p==='BYBIT')return DEFAULT_BYBIT_PERSONAL_POLICY;
 throw new Error('UNSUPPORTED_PROVIDER_MODE');
}
