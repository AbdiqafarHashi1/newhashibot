import type {TradingDecisionTrace} from "./contracts.ts";import {evaluateTradingDecision} from "./pipeline.ts";
export type CanonicalDecisionRequest=Parameters<typeof evaluateTradingDecision>[0];
export function evaluateForReplay(input:CanonicalDecisionRequest):TradingDecisionTrace{return evaluateTradingDecision(input);}
export function evaluateForLiveScanner(input:CanonicalDecisionRequest):TradingDecisionTrace{return evaluateTradingDecision(input);}
export function compareShadowDecision(oldDecision:unknown,canonical:TradingDecisionTrace){const old=JSON.stringify(oldDecision),next=JSON.stringify(canonical.evaluation);return {mode:"OBSERVATION_ONLY" as const,match:old===next,oldDecision,canonicalDecision:canonical.evaluation,reason:old===next?"MATCH":"SEMANTIC_MISMATCH",traceId:canonical.traceId};}
