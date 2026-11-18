import {LAUNCH_CANONICAL_REVIEWS} from './launch-canonical-reviews.ts';
export const PROP_STRATEGY_BUNDLES={
 ALL_TESTED:{label:'All seven tested Forex / Gold configurations',ids:LAUNCH_CANONICAL_REVIEWS.filter(r=>!r.strategyId.startsWith('crypto.')).map(r=>r.strategyId)},
 INTRADAY:{label:'Prop intraday: Gold momentum, Yen breakout, Sterling pullback',ids:['gold.native-momentum-15-48-2-5','forex.native-squeeze-15-48-2-3-usdjpy-h12','forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008']},
} as const;
export type PropStrategyBundleId=keyof typeof PROP_STRATEGY_BUNDLES;
