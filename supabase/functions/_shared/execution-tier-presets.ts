import {PERSONAL_CRYPTO_DEFAULT_STRATEGIES,PERSONAL_FOREX_STRATEGIES} from './strategy-deployment-policy.ts';
import {executionStrategyChoices} from './execution-strategy-selection.ts';
import {PROP_CURATED_STRATEGIES} from './strategy-placement-policy.ts';
export const PROP_DEFAULT_EXCLUSIONS = new Set([
 'gold.rsi-trailing-15-48-1.5-5-h96',
 'gold.frontier-compression-15-24-1.5-5-h96',
]);
export function accountTierPreset(provider:string,mode:string){
 if(mode==='PROP_FUNDED')return 'PROP_FUNDED_INCOME';
 if(mode.startsWith('PROP'))return 'PROP_CHALLENGE_PASS';
 return provider.toUpperCase().startsWith('MT5')?'FOREX_PERSONAL':'CRYPTO_PERSONAL';
}
/** Default selection only; exact Admin selections, scanner and risk limits are unchanged. */
export function defaultTierStrategies(provider:string,environment:string,mode:string){
 const available=new Set(executionStrategyChoices(provider,environment).map(c=>c.id));
 const prop=accountTierPreset(provider,mode).startsWith('PROP');
 return (prop?PROP_CURATED_STRATEGIES:provider.toUpperCase().startsWith('MT5')?PERSONAL_FOREX_STRATEGIES:PERSONAL_CRYPTO_DEFAULT_STRATEGIES).filter(id=>available.has(id)&&(!prop||!PROP_DEFAULT_EXCLUSIONS.has(id)));
}
export function requireTradingAdmin(role:unknown){if(role!=='admin')throw Error('ADMIN_REQUIRED');}
