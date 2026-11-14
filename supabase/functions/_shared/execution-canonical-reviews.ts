import {LAUNCH_CANONICAL_REVIEWS} from './launch-canonical-reviews.ts';
import {FRONTIER_CANONICAL_REVIEWS} from './frontier-canonical-reviews.ts';
/** Server-owned exact evidence. Baseline/default bundles keep their own membership. */
export const EXECUTION_CANONICAL_REVIEWS=[...LAUNCH_CANONICAL_REVIEWS,...FRONTIER_CANONICAL_REVIEWS] as const;
