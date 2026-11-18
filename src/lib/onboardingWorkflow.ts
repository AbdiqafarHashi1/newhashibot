import { recommendBrain, validProviderCombination } from './phaseH';
import type { OnboardingDraft } from './phaseHApi';

export const initialOnboarding: OnboardingDraft = {stage:0,packageCode:'FREE_SIGNALS',access:'SIGNALS',asset:'FOREX',mode:'PERSONAL',provider:'MT5',risk:.5,strategies:['FOREX_TREND'],ack:false};
export function onboardingStorageKeys(customerId:string) {
 if(!customerId) throw new Error('AUTHENTICATION_REQUIRED');
 return {draft:`hashibot.onboarding.${customerId}.draft`,session:`hashibot.onboarding.${customerId}.session`};
}
/** Browser preferences never grant payment, ownership, connection or execution authority. */
export function normalizeOnboarding(value:Partial<OnboardingDraft>):OnboardingDraft {
 const next={...initialOnboarding,...value};
 if(!['MT5','BINANCE','BYBIT'].includes(next.provider)||!['PERSONAL','PROP'].includes(next.mode)||!validProviderCombination(next.provider,next.asset,next.mode))throw new Error('UNSUPPORTED_PROVIDER_MODE');
 if(!['SIGNALS','AUTO'].includes(next.access)||!Number.isInteger(next.stage)||next.stage<0||next.stage>12)throw new Error('INVALID_ONBOARDING_PREFERENCES');
 if(next.propPhase!==undefined&&!['CHALLENGE','VERIFICATION','FUNDED'].includes(next.propPhase))throw Error('PROP_SETUP_PHASE_REQUIRED');
 const profile=recommendBrain(next.provider,next.mode);
 return {...next,propPhase:next.mode==='PROP'?next.propPhase:undefined,environment:next.environment==='live'?'live':next.provider==='BINANCE'?'testnet':'demo',risk:Number.isFinite(next.risk)?Math.max(profile.minRisk,Math.min(next.risk,profile.maxRisk)):.5,strategies:Array.isArray(next.strategies)?[...new Set(next.strategies.filter(s=>profile.strategies.includes(s)))]:[],ack:next.ack===true};
}
export function requireCreatedAccount(value:unknown):string {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error('ACCOUNT_CREATION_NOT_CONFIRMED');
 return value;
}
export function accountSetupScope(customerId:string,provider:string,mode:string,environment?:string){return `hashibot.setup.${customerId}.${provider}.${mode}${environment==='live'?'.live':''}`;}

/** Explicit Prop entry links override an unrelated saved Personal setup, not account authority. */
export function propOnboardingEntry(value:OnboardingDraft,requested:boolean):OnboardingDraft {
 if(!requested)return value;
 if(value.mode==='PROP'&&value.provider==='MT5'&&value.asset==='FOREX')return normalizeOnboarding({...value,propPhase:value.propPhase??'CHALLENGE'});
 return normalizeOnboarding({...value,provider:'MT5',asset:'FOREX',mode:'PROP',risk:Math.min(value.risk,.5),strategies:['FOREX_TREND'],propPhase:value.propPhase??'CHALLENGE',ack:false,stage:4});
}
