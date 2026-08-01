import type { Evidence } from "../shared.ts";
import type { ReconciliationSnapshot } from "../lifecycle/index.ts";
export type RecoveryReason="ORPHAN_POSITION"|"ORPHAN_ORDER"|"RESTART_RECONCILIATION"|"PROTECTION_DRIFT"|"AMBIGUOUS_PROVIDER_RESULT";
export interface RecoveryPolicy {maximumAttempts:number;leaseMs:number;backoffMs:readonly number[];}
export interface RecoveryIntent {recoveryId:string;reason:RecoveryReason;tradeId:string;executionScopeKey:string;attempt:number;idempotencyKey:string;correlationId:string;evidence:readonly Evidence[];}
export interface RecoveryDecision {action:"RECONCILE"|"REPAIR_PROTECTION"|"QUARANTINE"|"OPERATOR_INCIDENT"|"NO_ACTION";retryable:boolean;evidence:readonly Evidence[];}
export interface RecoveryPort {reconcile(intent:RecoveryIntent,snapshot:ReconciliationSnapshot):Promise<RecoveryDecision>;}
export function validateRecoveryAttempt(intent:RecoveryIntent,policy:RecoveryPolicy):void{if(intent.attempt<1||intent.attempt>policy.maximumAttempts)throw new Error("RECOVERY_ATTEMPT_OUT_OF_BOUNDS");if(!intent.idempotencyKey||!intent.correlationId||!intent.executionScopeKey)throw new Error("RECOVERY_IDENTITY_REQUIRED");}
