import type { Evidence, VersionedIdentity } from "../shared.ts";
import type { MarketContext } from "../market/index.ts";
export type StrategyLifecycle="ENABLED"|"DISABLED"|"SHADOW"|"RESEARCH";
export interface StrategyMetadata extends VersionedIdentity { lifecycle:StrategyLifecycle; certificationHooks:readonly string[]; }
export interface StrategyEvaluation<T=unknown>{decision:"BUY"|"SELL"|"NO_TRADE";score:number;payload:T|null;evidence:readonly Evidence[];}
export interface PortableStrategy<T=unknown>{readonly metadata:StrategyMetadata;evaluate(context:MarketContext):StrategyEvaluation<T>;certificationEvidence?():readonly Evidence[];}
export * as canonical from "./canonical.ts";
