import {RSI_TRAILING_CANONICAL_REVIEWS} from './rsi-trailing-canonical-reviews.ts';
import {LAUNCH_CANONICAL_REVIEWS} from './launch-canonical-reviews.ts';
import {FRONTIER_CANONICAL_REVIEWS} from './frontier-canonical-reviews.ts';
/** Server-owned exact evidence. Baseline/default bundles keep their own membership. */
export const EXECUTION_CANONICAL_REVIEWS=[...LAUNCH_CANONICAL_REVIEWS,...FRONTIER_CANONICAL_REVIEWS,...RSI_TRAILING_CANONICAL_REVIEWS] as const;
