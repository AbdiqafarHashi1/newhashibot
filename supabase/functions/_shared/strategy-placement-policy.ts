/** Evidence-based placement, not execution authorization or a profitability claim.
 * Original configuration IDs remain selectable for explicit Admin comparisons.
 */
export type PlacementStatus='CORE'|'ALTERNATIVE'|'PAUSED'|'REBUILD';
export type Placement={status:PlacementStatus;destination:string;decision:string};
export const STRATEGY_PLACEMENT_VERSION='customer-lineups/20261127';
export const STRATEGY_PLACEMENTS:Readonly<Record<string,Placement>>=Object.freeze({
 'crypto.launch-trend-pullback-48-1.5-5':{status:'CORE',destination:'CRYPTO_PERSONAL_SIGNALS',decision:'Keep primary: positive chronological halves and fresh costed November screen.'},
 'crypto.launch-trend-pullback-48-2-3-h72':{status:'ALTERNATIVE',destination:'CRYPTO_PERSONAL_SIGNALS',decision:'Compare against the primary; do not assume two correlated variants diversify.'},
 'crypto.launch-rsi2-48-3-3-h72':{status:'ALTERNATIVE',destination:'CRYPTO_PERSONAL_SIGNALS',decision:'Replace LTC in the optional roster; fresh positive screen with material drawdown.'},
 'crypto.complementary-ema-pullback':{status:'ALTERNATIVE',destination:'CRYPTO_PERSONAL_SIGNALS',decision:'Slower Personal option; perpetual execution screen differs from older spot ledger.'},
 'crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006':{status:'ALTERNATIVE',destination:'ADMIN_COMPARISON',decision:'Retain; only two fresh decisions, insufficient evidence for default promotion.'},
 'crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006':{status:'PAUSED',destination:'ADMIN_COMPARISON',decision:'Remove from commercial presets; fresh screen negative.'},
 'forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008':{status:'CORE',destination:'FOREX_PERSONAL_PROP_SIGNALS',decision:'Curated Forex candidate; fresh FX and firm-rule qualification remain required.'},
 'forex.native-band-reentry-60-12-2-5':{status:'CORE',destination:'FOREX_PERSONAL_PROP_SIGNALS',decision:'USDJPY H1 reversal; use with GBPUSD under shared account limits.'},
 'forex.complementary-ema-pullback':{status:'ALTERNATIVE',destination:'FOREX_PERSONAL',decision:'Actually XAUUSD H1; do not count as independent FX diversification.'},
 'forex.native-squeeze-15-48-2-3-usdjpy-h12':{status:'ALTERNATIVE',destination:'ADMIN_COMPARISON',decision:'Remove from defaults; second chronological half only +0.31R.'},
 'forex.native-sweep-retest-60-16-2-5-usdjpy-h72':{status:'PAUSED',destination:'ADMIN_COMPARISON',decision:'PF 1.09 leaves thin cost headroom; retain baseline rather than sell it.'},
 'gold.native-momentum-15-48-2-5':{status:'CORE',destination:'GOLD_PERSONAL_SIGNALS',decision:'Retain primary Gold trend rule; positive halves and October tick screen.'},
 'gold.native-band-reentry-15-48-3-5':{status:'CORE',destination:'GOLD_PERSONAL_SIGNALS',decision:'Retain complementary reversal rule; October positive before unverified financing.'},
 'gold.native-momentum-60-24-2-5':{status:'ALTERNATIVE',destination:'FOREX_PERSONAL',decision:'Older second half approximately flat; do not promote on aggregate alone.'},
 'gold.rsi-trailing-15-48-1.5-5-h96':{status:'ALTERNATIVE',destination:'FOREX_PERSONAL',decision:'Retain existing source-bound activity guard; exclude from default Prop and signals.'},
 'gold.frontier-compression-15-24-1.5-5-h96':{status:'PAUSED',destination:'ADMIN_COMPARISON',decision:'PF 1.08; replace only if a simpler challenger beats the preserved baseline.'},
 'gold.turbo-micro-scalper':{status:'REBUILD',destination:'TURBO_DEMO',decision:'Repair production-cadence execution/entry evidence; no default promotion.'},
 'gold.turbo-momentum-scalper':{status:'REBUILD',destination:'TURBO_DEMO',decision:'Challenge restrictive retest entry with simple bounded intraday models.'},
 'gold.turbo-range-scalper':{status:'REBUILD',destination:'TURBO_DEMO',decision:'Participation exists; improve reversal classification and payoff.'},
 'gold.turbo-trend-scalper':{status:'REBUILD',destination:'TURBO_DEMO',decision:'Isolate native exits from shared equity-target clipping; preserve scalp horizon.'},
 'gold.turbo-price-action-basket':{status:'REBUILD',destination:'TURBO_DEMO',decision:'Keep accounting/protections; qualify entry models separately before combining.'},
});
export const PROP_CURATED_STRATEGIES=[
 'forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008',
 'forex.native-band-reentry-60-12-2-5',
] as const;
export function strategyPlacement(id:string):Placement|undefined{return STRATEGY_PLACEMENTS[id];}
