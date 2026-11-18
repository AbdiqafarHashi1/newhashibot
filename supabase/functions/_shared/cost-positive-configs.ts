import {EXECUTION_CANONICAL_REVIEWS} from './execution-canonical-reviews.ts';
export const COST_POSITIVE_CONFIG_IDS=[...EXECUTION_CANONICAL_REVIEWS.map(x=>x.strategyId),'crypto.complementary-ema-pullback','forex.complementary-ema-pullback'] as readonly string[];
export const COMPLEMENTARY_ACTIVE_SCOPE=[{id:'crypto.complementary-ema-pullback',symbol:'ETHUSDT',timeframe:'1h'},{id:'forex.complementary-ema-pullback',symbol:'XAUUSD',timeframe:'1h'}] as const;
