import {COST_POSITIVE_CONFIG_IDS} from './cost-positive-configs.ts';
/** Product selection overlay; original evaluator IDs, releases and Prop permissions remain distinct. */
export const STRATEGY_DEPLOYMENT_VERSION='customer-lineups/20261127' as const;
export const PERSONAL_CRYPTO_STRATEGIES=[
 'crypto.launch-trend-pullback-48-1.5-5',
 'crypto.launch-trend-pullback-48-2-3-h72',
 'crypto.complementary-ema-pullback',
 'crypto.launch-rsi2-48-3-3-h72',
] as const;
export const PERSONAL_CRYPTO_DEFAULT_STRATEGIES=[PERSONAL_CRYPTO_STRATEGIES[0]] as const;
export const PERSONAL_FOREX_STRATEGIES=[
 'gold.native-momentum-15-48-2-5',
 'gold.native-band-reentry-15-48-3-5',
 'forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008',
 'forex.native-band-reentry-60-12-2-5',
] as const;
export const PERSONAL_GROWTH_STRATEGIES:readonly string[]=[...PERSONAL_CRYPTO_STRATEGIES,...PERSONAL_FOREX_STRATEGIES];
/** Snapshot clock and feature source match the saved-ledger active-volume experiment. */
export function productEntryQuality(strategy:string,setup:any,referenceAt?:string){
 if(strategy!=='gold.rsi-trailing-15-48-1.5-5-h96')return true;
 const i=setup?.intelligence,observed=Date.parse(i?.observedAt??''),reference=Date.parse(setup?.fillAt??setup?.observedAt??referenceAt??setup?.sourceClose??'');
 return setup?.strategy===strategy&&Number.isFinite(observed)&&Number.isFinite(reference)&&observed<=reference&&typeof i?.volumeRatio==='number'&&Number.isFinite(i.volumeRatio)&&i.volumeRatio>=1;
}
/** Reads server-owned original setup evidence; a request-supplied volume never grants admission. */
export async function loadProductEntryQuality(db:any,signal:any){
 if(signal.strategy_id!=='gold.rsi-trailing-15-48-1.5-5-h96')return true;
 const id=signal.arbitrator_decision?.conditional_setup_id;
 if(typeof id!=='string'||!id)return false;
 const r=await db.from('conditional_signal_setups').select('state').eq('id',id).maybeSingle();
 if(r.error)throw Error('PRODUCT_ENTRY_EVIDENCE_UNAVAILABLE');
 return r.data?.state?.symbol===signal.symbol&&r.data?.state?.timeframe===signal.timeframe&&productEntryQuality(signal.strategy_id,r.data.state);
}

export const SCANNER_PRODUCT_STRATEGIES=COST_POSITIVE_CONFIG_IDS.filter(id=>PERSONAL_GROWTH_STRATEGIES.includes(id));
